/* Main-thread controller for on-device Whisper transcription.
   - window.Whisper.load(model, onProgress)  -> resolves when the model is ready
   - window.Whisper.transcribe(float32@16kHz) -> resolves with text
   - window.Whisper.Recorder(stream, { window_s, onSegment, onError })
       captures mic audio at 16 kHz and transcribes rolling windows.
   Everything runs locally; after first download the model is cached offline. */
(function () {
  let worker = null, ready = false, seq = 0, loadModel = null;
  const pending = new Map();
  let onProgressCb = null;

  function ensureWorker() {
    if (worker) return worker;
    worker = new Worker('/whisper-worker.js?v=10', { type: 'module' });
    worker.onmessage = (e) => {
      const m = e.data || {};
      if (m.type === 'progress') { if (onProgressCb) onProgressCb(m.data); }
      else if (m.type === 'ready') { ready = true; const r = pending.get('__ready'); if (r) { r.resolve(m.model); pending.delete('__ready'); } }
      else if (m.type === 'text') { const p = pending.get(m.id); if (p) { p.resolve(m.text); pending.delete(m.id); } }
      else if (m.type === 'longprogress') { const p = pending.get(m.id); if (p && p.onProgress) p.onProgress(); }
      else if (m.type === 'long') { const p = pending.get(m.id); if (p) { p.resolve({ text: m.text, segments: m.segments || [] }); pending.delete(m.id); } }
      else if (m.type === 'error') {
        // A transcribe error carries its request id; a load error has no id —
        // route it to the pending load() so load() never hangs (item 2).
        if (m.id != null && pending.has(m.id)) { const p = pending.get(m.id); p.reject(new Error(m.error)); pending.delete(m.id); }
        else { const r = pending.get('__ready'); if (r) { r.reject(new Error(m.error)); pending.delete('__ready'); } else if (onProgressCb) onProgressCb({ status: 'error', message: m.error }); }
      }
    };
    // Worker-level crash (module import, OOM, uncaught throw): reject EVERY
    // outstanding promise so no load()/transcribe() hangs and Recorder.busy clears.
    // Also DISCARD the dead worker so the next load() spawns a fresh one instead
    // of posting to a crashed worker that never replies (would hang forever).
    worker.onerror = (err) => {
      const e = new Error((err && err.message) || 'Whisper worker crashed');
      for (const [, p] of pending) { try { p.reject(e); } catch {} }
      pending.clear(); ready = false;
      try { worker && worker.terminate(); } catch {}
      worker = null;
    };
    return worker;
  }

  function concatFloat32(chunks) {
    let len = 0; for (const c of chunks) len += c.length;
    const out = new Float32Array(len); let o = 0;
    for (const c of chunks) { out.set(c, o); o += c.length; }
    return out;
  }

  const Whisper = {
    supported() { return typeof Worker !== 'undefined' && typeof AudioContext !== 'undefined'; },
    isLoaded() { return ready; },

    load(model, onProgress) {
      onProgressCb = onProgress || null;
      ensureWorker();
      // Switching to a different model must re-run the full load/progress/ready
      // path (the worker re-downloads lazily); don't short-circuit on stale ready (item 6).
      const changed = model && model !== loadModel;
      loadModel = model;
      if (changed) ready = false;
      return new Promise((resolve, reject) => {
        if (ready) return resolve(loadModel);
        pending.set('__ready', { resolve, reject });
        worker.postMessage({ type: 'load', model });
      });
    },

    transcribe(audioFloat32, opts) {
      ensureWorker();
      const id = ++seq;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        // Transfer the buffer to avoid a copy (caller must not reuse it).
        worker.postMessage({ type: 'transcribe', id, audio: audioFloat32, model: loadModel, language: opts && opts.language }, [audioFloat32.buffer]);
      });
    },

    /* Full-audio authoritative pass with timestamps. Resolves { text, segments }
       where segments = [{ t, text }]. onProgress() fires per decoded chunk. */
    transcribeLong(audioFloat32, opts) {
      ensureWorker();
      const id = ++seq;
      const onProgress = opts && opts.onProgress;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject, onProgress });
        worker.postMessage({ type: 'transcribeLong', id, audio: audioFloat32, model: loadModel, language: opts && opts.language }, [audioFloat32.buffer]);
      });
    },

    /* Decode a recorded audio Blob (webm/mp4/…) to mono 16 kHz Float32 PCM,
       the input Whisper expects. The decoded buffer is fed straight into an
       OfflineAudioContext whose single destination channel does the stereo→mono
       downmix AND the resample to 16 kHz in one render — so we never build the
       intermediate mono/source-rate copies, and the heavy work runs on the
       browser's audio thread, not the main thread (no UI freeze). */
    async decodeToPCM16k(blob) {
      let buf = await blob.arrayBuffer();
      const AC = window.AudioContext || window.webkitAudioContext;
      const tmp = new AC();
      let decoded;
      try { decoded = await tmp.decodeAudioData(buf.slice(0)); }
      finally { try { await tmp.close(); } catch {} buf = null; }
      const outLen = Math.max(1, Math.round(decoded.length * 16000 / decoded.sampleRate));
      const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
      const off = new OAC(1, outLen, 16000);          // 1 channel ⇒ downmix to mono
      const node = off.createBufferSource(); node.buffer = decoded; node.connect(off.destination); node.start();
      const rendered = await off.startRendering();
      decoded = null;
      return rendered.getChannelData(0).slice();      // detach from the rendered buffer
    },

    terminate() { if (worker) { try { worker.terminate(); } catch {} worker = null; ready = false; pending.clear(); } },

    /* Remove Whisper's common hallucination artifacts from a segment list:
       bracketed non-speech tags ([Announcer], [BLANK_AUDIO], (music)…), lines
       that are only punctuation/symbols, stray leading dashes, and consecutive
       verbatim repeats (Whisper's repeat-loop). Conservative: keeps real words. */
    cleanSegments(segs) {
      const out = [];
      let prev = null;
      for (const s of segs || []) {
        if (!s) continue;
        let text = String(s.text == null ? '' : s.text).replace(/^[\s\-–—•]+/, '').trim();
        if (!text) continue;
        // Strip a wholly-bracketed/parenthesised non-speech tag.
        const stripped = text.replace(/^[\[(][^\])]*[\])]$/, '').trim();
        if (!stripped) continue;             // was only "[Announcer]" / "(music)"
        // Drop lines with no letters or digits in ANY script (pure punctuation).
        // \p{L}/\p{N} keep Cyrillic/CJK/Greek/accented speech, not just ASCII.
        let hasWord; try { hasWord = /[\p{L}\p{N}]/u.test(stripped); } catch { hasWord = /[a-z0-9]/i.test(stripped); }
        if (!hasWord) continue;
        const norm = stripped.toLowerCase();
        if (prev && norm === prev) continue;  // consecutive verbatim repeat
        prev = norm;
        out.push({ t: (typeof s.t === 'number' ? s.t : 0), speaker: s.speaker || 'You', text: stripped });
      }
      return out;
    },

    /* Rolling-window live recorder. Captures 16 kHz mono PCM and transcribes
       each window_s slice, calling onSegment({ t, speaker, text }). */
    Recorder(stream, { window_s = 6, language, onSegment, onError } = {}) {
      const SR = 16000;
      // Cap backlog so a slow (slower-than-real-time) device can't grow memory
      // without bound while a transcription is in flight (item 4).
      const MAX_BUFFER = SR * window_s * 4;
      let ctx, source, processor, buffers = [], windowStart = 0, paused = false, stopped = false, timer = null, busy = false;

      const bufferedSamples = () => buffers.reduce((n, a) => n + a.length, 0);
      const waitIdle = async () => { while (busy) await new Promise((r) => setTimeout(r, 40)); };

      // `final` runs the last flush after stop(): it waits for any in-flight
      // transcription, then transcribes the remainder even though stopped (item 1).
      async function flush(force, final) {
        if (final) await waitIdle();
        else if (busy || stopped) return;
        const samples = bufferedSamples();
        if (!force && samples < SR * window_s) return;
        if (samples === 0) return;
        const chunk = concatFloat32(buffers); buffers = [];
        const tStart = windowStart; windowStart += chunk.length / SR;
        busy = true;
        try { const text = await Whisper.transcribe(chunk, { language }); if (text && onSegment) onSegment({ t: tStart, speaker: 'You', text }); }
        catch (err) { if (onError) onError(err); }
        finally { busy = false; }
      }

      return {
        async start() {
          ctx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: SR });
          // AudioContext may not honor 16 kHz on every browser; resample if needed.
          source = ctx.createMediaStreamSource(stream);
          processor = ctx.createScriptProcessor(4096, 1, 1);
          const ratio = ctx.sampleRate / SR;
          processor.onaudioprocess = (e) => {
            if (paused || stopped) return;
            const input = e.inputBuffer.getChannelData(0);
            if (ratio === 1) { buffers.push(new Float32Array(input)); }
            else {
              // Box-average downsample to 16 kHz — averages the samples spanned
              // per output step to reduce aliasing vs. nearest-sample (item 5).
              const outLen = Math.floor(input.length / ratio);
              const out = new Float32Array(outLen);
              for (let i = 0; i < outLen; i++) {
                const a = Math.floor(i * ratio), b = Math.min(input.length, Math.floor((i + 1) * ratio));
                let sum = 0, n = 0; for (let j = a; j < b; j++) { sum += input[j]; n++; }
                out[i] = n ? sum / n : (input[a] || 0);
              }
              buffers.push(out);
            }
            // Drop oldest audio beyond the cap; advance windowStart so timestamps
            // stay consistent with the audio we actually transcribe (item 4).
            let total = bufferedSamples();
            while (total > MAX_BUFFER && buffers.length > 1) { const d = buffers.shift(); total -= d.length; windowStart += d.length / SR; }
          };
          source.connect(processor); processor.connect(ctx.destination);
          timer = setInterval(() => flush(false), 1000);
        },
        pause() { paused = true; },
        resume() { paused = false; },
        async stop() {
          stopped = true; paused = true;
          if (timer) clearInterval(timer);
          try { processor && (processor.onaudioprocess = null); } catch {}
          try { source && source.disconnect(); processor && processor.disconnect(); } catch {}
          try { if (ctx && ctx.state !== 'closed') await ctx.close(); } catch {}
          await flush(true, true); // wait for in-flight, then transcribe the final partial window
        },
      };
    },
  };

  window.Whisper = Whisper;
})();
