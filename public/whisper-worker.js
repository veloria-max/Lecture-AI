/* Web Worker: runs Whisper speech-to-text on-device via transformers.js.
   Runs off the main thread so the UI stays responsive. After the first model
   download (cached by transformers.js), it works fully offline. */
import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2';

// Use the remote model hub for the first download; cache it for offline reuse.
env.allowLocalModels = false;
env.useBrowserCache = true;

let transcriber = null;
let loadingPromise = null;
let MODEL = 'Xenova/whisper-base.en';

function isEnglishOnly(model) { return /\.en$/.test(model); }

async function load(model) {
  if (model && model !== MODEL) { MODEL = model; transcriber = null; loadingPromise = null; }
  if (transcriber) return transcriber;
  if (!loadingPromise) {
    loadingPromise = pipeline('automatic-speech-recognition', MODEL, {
      quantized: true,
      progress_callback: (p) => { try { self.postMessage({ type: 'progress', data: p }); } catch {} },
    });
  }
  transcriber = await loadingPromise;
  return transcriber;
}

self.onmessage = async (e) => {
  const msg = e.data || {};
  try {
    if (msg.type === 'load') {
      await load(msg.model);
      self.postMessage({ type: 'ready', model: MODEL });
      return;
    }
    if (msg.type === 'transcribe') {
      const t = await load(msg.model || MODEL);
      // Short live window: single pass, no timestamps (fast feedback).
      const opts = { chunk_length_s: 30, stride_length_s: 5 };
      if (!isEnglishOnly(MODEL)) { opts.language = msg.language || 'english'; opts.task = 'transcribe'; }
      const out = await t(msg.audio, opts);
      self.postMessage({ type: 'text', id: msg.id, text: ((out && out.text) || '').trim() });
      return;
    }
    if (msg.type === 'transcribeLong') {
      // Full-audio authoritative pass: 30 s chunks with 5 s stride and real
      // timestamps. Long-form context + overlap removes the window-boundary
      // errors and most hallucinations the short live windows produce.
      const t = await load(msg.model || MODEL);
      const opts = {
        chunk_length_s: 30,
        stride_length_s: 5,
        return_timestamps: true,
        // Report chunk progress so the UI can show a "finishing" bar.
        callback_function: (items) => { try { if (items && items.length) self.postMessage({ type: 'longprogress', id: msg.id }); } catch {} },
      };
      if (!isEnglishOnly(MODEL)) { opts.language = msg.language || 'english'; opts.task = 'transcribe'; }
      const out = await t(msg.audio, opts);
      const chunks = (out && out.chunks) || [];
      const segments = chunks.map((c) => ({
        t: (c.timestamp && typeof c.timestamp[0] === 'number') ? c.timestamp[0] : 0,
        text: (c.text || '').trim(),
      })).filter((s) => s.text);
      self.postMessage({ type: 'long', id: msg.id, text: ((out && out.text) || '').trim(), segments });
      return;
    }
  } catch (err) {
    self.postMessage({ type: 'error', id: msg.id, error: String((err && err.message) || err) });
  }
};
