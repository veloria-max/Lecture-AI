# LectureNotes

A local-first **lecture recording & study** web app (PWA) for students and professors.
Record a lecture, get a live transcript and **on-device** AI transcription, then turn it
into an adaptive study summary, key terms, a quiz, and study games — all tailored to your
level. Works **offline** for recording and transcription; AI summaries use the Claude API
when you're online.

Everything runs locally: a tiny Node HTTP server (zero npm dependencies) plus a vanilla-JS
single-page app. No build step, no framework.

## Run

```bash
node server.js
```

Open <http://localhost:4178>. No `npm install` needed — Node standard library only
(tested on Node 24). Stop with `Ctrl+C`.

Sign in with any provider button or an email (a simulated local login — no real accounts).

## Features

- **Record** — capture a lecture from your microphone with a **big live transcript** and a
  **Live Notes** panel that condenses speech into short notes at your study level.
- **On-device transcription (Whisper)** — runs in the browser via `transformers.js`
  (`Xenova/whisper-{tiny,base,small}.en`). The model downloads once, then works fully
  offline. Nothing leaves your device. A faster browser speech engine is also available
  (online, live-mic only).
- **Capture a call** — transcribe a live Google Meet / Zoom / Teams call you're in. Using
  the browser's `getDisplayMedia` tab/system-audio capture, it records the **whole call's
  audio** (all participants) mixed with your mic and transcribes it on-device with Whisper —
  so it works **even with headphones on** (it reads the audio stream, not the room). Pick the
  meeting tab and tick "Share tab audio" when prompted. This is the in-browser equivalent of
  a desktop notetaker; it does not *join* the meeting as a bot.
- **Live Visual Slides** — a collapsible "Visuals" panel in the Record view turns the live
  lecture into a **slideshow** as it happens: per topic, a real image (free, from Wikipedia /
  Openverse), an optional diagram (Mermaid, rendered in a sandboxed iframe), and simplified
  fact bullets at your study level. Slides are **grounded in the transcript** (labeled
  AI-interpreted), generated in cost-efficient batches, navigable (Prev/Next + optional
  auto-advance), **rated** (👍/👎 + chips) so future slides adapt to your taste, saved with the
  lecture, and reviewable/regenerateable from a lecture's **Visuals** tab. Needs a Claude key;
  falls back to basic text cards offline.
- **Import** — upload an audio file and transcribe it on-device with Whisper.
- **Courses & study preferences** — organize lectures by course; set your role
  (Student / Professor), study level, summary length/style and focus areas.
- **Adaptive AI summaries (Claude)** — generate a study summary, key terms, and a quiz
  tailored to your preferences. **Professor mode** instead produces a teaching pack:
  lesson recap, a student handout, and an assessment question bank with answer keys.
- **Ask AI** — ask questions about a lecture (Claude-powered when online + key set;
  on-device keyword fallback otherwise).
- **Study games & brain breaks** — Flashcards and a timed Quiz Challenge built from a
  lecture's key terms and quiz, plus 2048, Snake, and Memory Match you can play **in the
  recording panel while the lecture keeps recording**.
- **Export** — download a lecture (transcript + summary + quiz) as Markdown, copy it, or
  print / save as PDF.
- **Offline-first PWA** — a service worker caches the app shell; lectures, audio, summaries,
  courses and preferences are stored durably in IndexedDB and survive reloads.

## Claude API key (for AI summaries)

AI summaries and Claude-powered Ask are the one online feature. Your key stays **server-side**
and is never written to disk, logged, or sent to the browser:

- Start the server with your key in the environment:
  ```bash
  ANTHROPIC_API_KEY=sk-ant-... node server.js
  ```
- …or set it at runtime in **Study Prefs → Claude API key** (held in memory for the session).

Optionally set `CLAUDE_MODEL` to override the default model.

Recording, transcription, games and export all work **without** a key.

## Privacy

- Audio and transcripts are processed **on your device** (Whisper in the browser) and stored
  locally in IndexedDB. They are not uploaded anywhere.
- Only the **AI summary / ask** features send the transcript text to Anthropic, through your
  own API key, and only when you trigger them.
- This is a local demo: sign-in is simulated and there are no real accounts.

## Tech notes

- `server.js` — Node `http` server: static files, a simulated same-site API
  (`/forward/api/v1/*`) with CSRF + session cookies, a Claude proxy (`/summarize`,
  `/ask_lecture`, `/teaching_pack`, `/claude_status`, `/claude_key`), and a demo
  WebSocket transcription stream. Hardened against crashes (input validation, a 500
  catch, process-level `uncaughtException`/`unhandledRejection` nets, an 8 MB body cap).
- `public/` — the SPA: `app.js` (views + logic), `whisper.js` + `whisper-worker.js`
  (on-device Whisper), `db.js` (IndexedDB), `sw.js` (service worker), `styles.css`,
  `manifest.webmanifest`.
- `data.js` — seeded placeholder demo data.

## Not included

- **Joining live Google Meet / Zoom calls as a bot** that attends "in your place" is **not**
  implemented. That requires server-side meeting-bot infrastructure (a headless browser bot
  or a provider SDK/service such as Recall.ai) and is out of scope for this local app. The
  **Capture a call** mode above is the feasible, client-side alternative: it transcribes a
  call you are actually in by capturing the meeting tab's audio.

## License

MIT — see `LICENSE`.
