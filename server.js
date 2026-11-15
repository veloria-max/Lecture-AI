'use strict';
/*
 * LectureNotes — local server.
 *
 * Zero-dependency Node server for the LectureNotes PWA. Runs on localhost
 * with simulated sign-in (no real accounts/passwords). The only outbound calls
 * are to the Claude API (when a key is set) and free image sources for slides.
 *
 * Architecture:
 *   - All backend calls go through a SAME-SITE proxy at /api/*.
 *   - CSRF: GET /login_csrf sets a readable `csrftoken` cookie; the SPA echoes
 *     it as `x-csrftoken` and always sends `x-client: lecturenotes-web`. The proxy
 *     rejects mismatches on mutating requests.
 *   - Session auth via an HttpOnly `sessionid` cookie (OAuth-style or email).
 *   - Live transcription over a WebSocket at /ws/transcribe.
 *
 * Run:  node server.js   ->  http://localhost:4178
 */

const http = require('http');
const https = require('https');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { USER, CONVERSATIONS, CHANNELS, LIVE_SCRIPT } = require('./data.js');

const PORT = Number(process.env.PORT) || 4178;
// Listen only on this computer by default. Anyone else on the same Wi-Fi could
// otherwise use your Claude key and read or delete lectures. Set HOST=0.0.0.0
// only behind real authentication (e.g. the future hosted version).
const HOST = process.env.HOST || '127.0.0.1';
const LOCAL_ONLY = HOST === '127.0.0.1' || HOST === 'localhost' || HOST === '::1';
const PUBLIC_DIR = path.join(__dirname, 'public');

// -------------------------------------------------- Claude (Phase 4) ----
// The student's Anthropic API key stays SERVER-SIDE: read from the environment,
// or set once at runtime via POST /claude_key (held only in memory — never
// written to disk, never logged, never returned to the browser). Summaries are
// the one online-only feature; recording + transcription work fully offline.
let CLAUDE_KEY = process.env.ANTHROPIC_API_KEY || null;
const CLAUDE_KEY_FROM_ENV = !!CLAUDE_KEY;
const CLAUDE_MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-5-5';
// Live visual slides fire often, so default them to a cheap/fast model to control cost.
const CLAUDE_SLIDES_MODEL = process.env.CLAUDE_SLIDES_MODEL || 'claude-haiku-5-5';

// Professor mode: turn a lecture transcript into teaching materials.
function buildTeachingPrompt({ transcript, title, courseName }) {
  const system = 'You are an expert teaching assistant. You turn a professor\'s lecture transcript (which may contain speech-to-text errors you should read past and silently correct) into teaching materials. Respond with ONLY a single valid JSON object and nothing else — no markdown code fences, no preamble.';
  const user =
`Create teaching materials from this lecture transcript.

Course: ${courseName || 'General'}
Lecture title: ${title || 'Untitled lecture'}

Return a JSON object with EXACTLY these keys:
{
  "recap": "markdown: what was taught this lecture, the key points in order, and where students are most likely to struggle or need extra emphasis",
  "handout": "markdown: a clean, student-facing one-page summary the professor can hand out",
  "questionBank": [{"topic": "string", "difficulty": "easy" | "medium" | "hard", "type": "mcq" | "short" | "essay", "question": "string", "options": ["string", ...] (mcq only, 3-4 options), "answer": "string — the answer key or model answer"}]
}
Provide 8–12 questions spread across easy/medium/hard and across the lecture's main topics. Base everything ONLY on the transcript below.

TRANSCRIPT:
"""
${transcript}
"""`;
  return { system, user };
}

// Live Visual Slides: turn a transcript slice into 3-5 grounded visual slides.
function buildSlidePrompt({ transcriptChunk, recentTitles, prefs, visualPrefs }) {
  const p = prefs || {};
  const levelMap = { hs: 'a high-school student', ug: 'an undergraduate', grad: 'a graduate student' };
  const level = levelMap[p.level] || levelMap.ug;
  const recent = (Array.isArray(recentTitles) && recentTitles.length)
    ? `Do not repeat these already-covered slide titles: ${recentTitles.slice(-8).join('; ')}.` : '';
  const vp = visualPrefs || {};
  const likes = [];
  if ((vp.diagrams || 0) > 0) likes.push('include a diagram when it helps');
  if ((vp.simpler || 0) > 0) likes.push('use simpler language');
  if ((vp.detail || 0) > 0) likes.push('add a little more detail');
  if ((vp.images || 0) > 0) likes.push('prefer a real image');
  const personalize = likes.length ? `This student rates slides higher when you: ${likes.join(', ')}.` : '';
  const system = 'You turn a slice of a live lecture transcript into visual study slides. Respond with ONLY a valid JSON array and nothing else (no markdown fences, no preamble). Ground every slide STRICTLY in the transcript provided: use only facts actually stated; never add outside facts; if a point is unclear, keep it general rather than inventing specifics. Silently fix obvious speech-to-text errors.';
  const user =
`Turn this lecture transcript slice into 3-5 short visual slides for ${level}.
${recent}
${personalize}

Return a JSON array; each item EXACTLY:
{
  "topic": "2-4 word topic",
  "title": "short slide title",
  "bullets": ["3-5 short factual points, each grounded in the transcript"],
  "explainer": "1-2 plain sentences simplifying the idea at the student's level",
  "diagram": { "type": "mermaid" or "none", "code": "valid mermaid code (flowchart/mindmap/sequence/graph) ONLY when it truly clarifies, else empty string" },
  "imageQuery": "2-4 word real-world search term for a representative photo/diagram, or empty string if not visual"
}
Only include a diagram when it genuinely helps. Base everything ONLY on the transcript slice below.

TRANSCRIPT SLICE:
"""
${transcriptChunk}
"""`;
  return { system, user };
}

// Call the Anthropic Messages API. Resolves { ok, text } or { ok:false, status, error }.
function callClaude({ system, user, maxTokens = 2000, model }) {
  return new Promise((resolve) => {
    if (!CLAUDE_KEY) return resolve({ ok: false, status: 400, error: 'no_key' });
    const payload = JSON.stringify({
      model: model || CLAUDE_MODEL,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: user }],
    });
    const reqC = https.request({
      hostname: 'api.anthropic.com', path: '/v1/messages', method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(payload),
        'x-api-key': CLAUDE_KEY,
        'anthropic-version': '2023-06-01',
      },
    }, (r) => {
      let d = '';
      r.on('data', (c) => (d += c));
      r.on('end', () => {
        let body = {}; try { body = JSON.parse(d); } catch {}
        if (r.statusCode >= 200 && r.statusCode < 300) {
          const text = (body.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
          resolve({ ok: true, text });
        } else {
          // Surface Anthropic's own error (e.g. bad model, auth, rate limit) so
          // the UI can show it. Never echo the key.
          resolve({ ok: false, status: r.statusCode || 502, error: (body.error && body.error.message) || 'Anthropic API error' });
        }
      });
    });
    reqC.on('error', (e) => resolve({ ok: false, status: 502, error: 'Could not reach Anthropic: ' + e.message }));
    reqC.setTimeout(60000, () => { reqC.destroy(); resolve({ ok: false, status: 504, error: 'Anthropic request timed out' }); });
    reqC.end(payload);
  });
}

// ---- Free image lookup for slides (no API key): Wikipedia, then Openverse ----
const _imgCache = new Map(); // q(lower) -> { result, t }
function imageCacheGet(q) { const e = _imgCache.get(q.toLowerCase()); if (e && Date.now() - e.t < 3600000) return e.result; return null; }
function imageCacheSet(q, r) { _imgCache.set(q.toLowerCase(), { result: r, t: Date.now() }); if (_imgCache.size > 300) _imgCache.delete(_imgCache.keys().next().value); }
// Only ever talk to these image hosts, including across redirects (SSRF guard).
const ALLOWED_IMG_HOSTS = /(^|\.)(wikipedia\.org|wikimedia\.org|openverse\.org|wikimediacloud\.org)$/i;
function httpsGetJson(u, depth) {
  return new Promise((resolve) => {
    let done = false; const fin = (v) => { if (!done) { done = true; resolve(v); } };
    try {
      const host = new URL(u).hostname;
      if (!ALLOWED_IMG_HOSTS.test(host)) return fin(null);
      const r = https.get(u, { headers: { 'user-agent': 'LectureNotes/1.0 (local study app)', accept: 'application/json' } }, (res2) => {
        if (res2.statusCode >= 300 && res2.statusCode < 400 && res2.headers.location && (depth || 0) < 3) {
          res2.resume();
          try { const loc = new URL(res2.headers.location, u); if (loc.protocol === 'https:' && ALLOWED_IMG_HOSTS.test(loc.hostname)) return fin(httpsGetJson(loc.href, (depth || 0) + 1)); } catch {}
          return fin(null);
        }
        let d = ''; res2.on('data', (c) => (d += c)); res2.on('end', () => { try { fin(JSON.parse(d)); } catch { fin(null); } });
      });
      r.on('error', () => fin(null));
      r.setTimeout(8000, () => { try { r.destroy(); } catch {} fin(null); });
    } catch { fin(null); }
  });
}
async function lookupImage(q) {
  try {
    const wu = 'https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=' + encodeURIComponent(q) + '&gsrlimit=1&prop=pageimages|info&piprop=thumbnail&pithumbsize=640&inprop=url&format=json&origin=*';
    const w = await httpsGetJson(wu);
    const pages = w && w.query && w.query.pages;
    if (pages) { for (const k in pages) { const pg = pages[k]; if (pg && pg.thumbnail && pg.thumbnail.source) return { url: pg.thumbnail.source, thumb: pg.thumbnail.source, attribution: 'Wikipedia: ' + (pg.title || q), source: pg.fullurl || '' }; } }
  } catch {}
  try {
    const ov = await httpsGetJson('https://api.openverse.org/v1/images/?q=' + encodeURIComponent(q) + '&page_size=1&mature=false');
    const r0 = ov && ov.results && ov.results[0];
    if (r0 && (r0.thumbnail || r0.url)) return { url: r0.url || r0.thumbnail, thumb: r0.thumbnail || r0.url, attribution: (r0.creator ? r0.creator + ' · ' : '') + (r0.license ? String(r0.license).toUpperCase() : 'Openverse'), source: r0.foreign_landing_url || '' };
  } catch {}
  return {};
}

// Build a study-summary prompt from the student's preferences (Phase 3).
function buildSummaryPrompt({ transcript, title, courseName, prefs }) {
  const p = prefs || {};
  const levelMap = { hs: 'a high-school student', ug: 'an undergraduate student', grad: 'a graduate student preparing for exams' };
  const lengthMap = { brief: 'brief — only the 5–6 most important takeaways', standard: 'a balanced, section-by-section summary', detailed: 'detailed and thorough, leaving nothing important out' };
  const styleMap = { bullets: 'bullet points', narrative: 'short narrative paragraphs', outline: 'a structured nested outline' };
  const focusMap = { concepts: 'key concepts', definitions: 'definitions and terminology', formulas: 'formulas and equations', examples: 'worked examples', exam: 'points likely to appear on an exam', actions: 'to-dos, assignments and deadlines' };
  const level = levelMap[p.level] || levelMap.ug;
  const length = lengthMap[p.length] || lengthMap.standard;
  const style = styleMap[p.style] || styleMap.bullets;
  const focusList = (Array.isArray(p.focus) && p.focus.length) ? p.focus : ['concepts', 'definitions', 'exam'];
  const focus = focusList.map((f) => focusMap[f] || f).join(', ');
  const simplify = p.simplify ? ' Wherever the material is difficult, re-explain it in simpler, plain language.' : '';
  const system = 'You are an expert study assistant. You turn a lecture transcript (which may contain speech-to-text errors) into study materials tailored to the student. Infer and silently correct obvious transcription errors from context. Respond with ONLY a single valid JSON object and nothing else — no markdown code fences, no preamble.';
  const user =
`Create study materials from this lecture transcript.

Course: ${courseName || 'General'}
Lecture title: ${title || 'Untitled lecture'}
Write for: ${level}.
Summary length: ${length}.
Summary style: ${style}.
Emphasize: ${focus}.${simplify}

Return a JSON object with EXACTLY these keys:
{
  "summary": "the summary as a markdown string, in the requested length and style",
  "keyTerms": [{"term": "string", "definition": "one-sentence plain definition"}],
  "quiz": [{"question": "string", "type": "mcq" or "short", "options": ["string", ...] (only for mcq, 3-4 options), "answer": "the correct answer"}]
}
Provide 5–8 keyTerms and 4–6 quiz questions mixing "mcq" and "short". Base everything ONLY on the transcript below.

TRANSCRIPT:
"""
${transcript}
"""`;
  return { system, user };
}

// ---------------------------------------------------------------- state ----
const sessions = new Map();     // sessionid -> { user, t }
const magicLinks = new Map();   // token -> { email, t }
const MAGIC_LINK_TTL_MS = 15 * 60 * 1000;
const MAX_SESSIONS = 1000;

// Simple per-session rate limit for the routes that spend Claude credits, so one
// client (or a runaway loop) can't drain the key.
const RATE_WINDOW_MS = 60 * 1000, RATE_MAX = 20;
const rateHits = new Map(); // sessionid -> [timestamps]
function rateLimited(sid) {
  const now = Date.now();
  const hits = (rateHits.get(sid) || []).filter((t) => now - t < RATE_WINDOW_MS);
  if (hits.length >= RATE_MAX) { rateHits.set(sid, hits); return true; }
  hits.push(now); rateHits.set(sid, hits);
  if (rateHits.size > MAX_SESSIONS * 2) rateHits.delete(rateHits.keys().next().value);
  return false;
}

// Clean and bound transcript segments coming from the browser before storing them.
function cleanSegments(list) {
  if (!Array.isArray(list)) return [];
  return list.slice(0, 20000).filter((x) => x && typeof x === 'object' && typeof x.text === 'string').map((x) => ({
    t: Number.isFinite(Number(x.t)) ? Math.max(0, Math.min(Number(x.t), 24 * 3600)) : 0,
    speaker: String(x.speaker || 'You').slice(0, 60),
    text: x.text.slice(0, 5000),
  }));
}

// Block DNS-rebinding: when running locally, only answer requests addressed to
// this machine by name, so a malicious website can't talk to the server.
function hostAllowed(req) {
  if (!LOCAL_ONLY) return true;
  const h = String(req.headers.host || '').toLowerCase().replace(/:\d+$/, '');
  return h === 'localhost' || h === '127.0.0.1' || h === '[::1]';
}
function originAllowed(req) {
  const o = req.headers.origin;
  if (!o) return true; // same-origin navigations and non-browser clients
  try { const u = new URL(o); return LOCAL_ONLY ? (u.hostname === 'localhost' || u.hostname === '127.0.0.1') : u.host === req.headers.host; } catch { return false; }
}
let convos = JSON.parse(JSON.stringify(CONVERSATIONS)); // mutable copy

const AUTH_PROVIDERS = [
  { id: 'google', label: 'Continue with Google' },
  { id: 'microsoft', label: 'Continue with Microsoft' },
  { id: 'apple', label: 'Continue with Apple' },
];

// --------------------------------------------------------------- helpers ----
function parseCookies(req) {
  const out = {};
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > -1) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}
function json(res, status, body, headers = {}) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'x-content-type-options': 'nosniff',
    'x-request-id': crypto.randomUUID(),
    ...headers,
  });
  res.end(JSON.stringify(body));
}
function readBody(req) {
  const MAX = 8 * 1024 * 1024; // cap buffered body so a huge POST can't exhaust memory
  return new Promise((resolve) => {
    let d = '', tooBig = false;
    req.on('data', (c) => { if (tooBig) return; d += c; if (d.length > MAX) { tooBig = true; d = ''; try { req.destroy(); } catch {} } });
    req.on('end', () => { if (tooBig) return resolve({}); try { resolve(d ? JSON.parse(d) : {}); } catch { resolve({}); } });
    req.on('error', () => resolve({}));
  });
}
function userFromReq(req) {
  const s = sessions.get(parseCookies(req).sessionid);
  return s ? s.user : null;
}
function makeUser(email, provider) {
  // Present the seeded Sam identity so the
  // demo feed is consistent, while recording how you actually signed in.
  return { id: 'u_' + crypto.randomBytes(6).toString('hex'),
           email: USER.email, name: USER.name, avatar: USER.avatar, color: USER.color,
           signedInEmail: email, provider, plan: 'Free' };
}
function login(res, user) {
  const sid = crypto.randomBytes(24).toString('hex');
  sessions.set(sid, { user, t: Date.now() });
  if (sessions.size > MAX_SESSIONS) sessions.delete(sessions.keys().next().value);
  return { 'set-cookie': `sessionid=${sid}; Path=/; HttpOnly; SameSite=Lax` };
}
function cannedAnswer(convo, q) {
  const ql = q.toLowerCase();
  const hits = convo.segments.filter((s) => ql.split(/\s+/).some((w) => w.length > 3 && s.text.toLowerCase().includes(w)));
  if (/action|todo|task|next step/.test(ql)) {
    if (!(convo.actionItems || []).length) return { answer: 'No action items were recorded for this conversation.', cites: [] };
    return { answer: 'Action items from this conversation:\n' + convo.actionItems.map((a) => `• ${a.owner}: ${a.text}`).join('\n'), cites: [] };
  }
  if (/summar|tl;?dr|about|cover/.test(ql)) return { answer: convo.summary || ('No summary yet. It starts: “' + convo.segments.slice(0, 2).map((s) => s.text).join(' ') + '”'), cites: [] };
  if (hits.length) {
    return { answer: `Here’s what was said about that:\n` + hits.slice(0, 3).map((s) => `[${s.t.toFixed(0)}s] ${s.speaker}: “${s.text}”`).join('\n'),
             cites: hits.slice(0, 3).map((s) => s.t) };
  }
  return { answer: 'I couldn’t find that in this transcript. Try asking about the summary, action items, or a keyword that was mentioned.', cites: [] };
}

// --------------------------------------------------------- API (proxy) ----
async function handleApi(req, res, url) {
  const cookies = parseCookies(req);
  const route = url.pathname.replace('/api', '') || '/';

  if (route === '/login_csrf' && req.method === 'GET') {
    const token = crypto.randomBytes(24).toString('hex');
    return json(res, 200, { detail: 'ok' }, { 'set-cookie': `csrftoken=${token}; Path=/; SameSite=Lax` });
  }

  if (req.headers['x-client'] !== 'lecturenotes-web')
    return json(res, 400, { detail: 'missing or bad x-client header' });

  if (req.method !== 'GET') {
    const h = req.headers['x-csrftoken'];
    if (!h || h !== cookies.csrftoken)
      return json(res, 403, { detail: 'CSRF check failed: x-csrftoken != csrftoken cookie' });
  }

  // ---- auth ----
  if (route === '/providers' && req.method === 'GET')
    return json(res, 200, { providers: AUTH_PROVIDERS });

  if (route === '/login/oauth' && req.method === 'POST') {
    const b = await readBody(req);
    const prov = AUTH_PROVIDERS.find((p) => p.id === b.provider);
    if (!prov) return json(res, 422, { detail: 'unknown provider' });
    const user = makeUser(`${b.provider}.user@example.com`, b.provider);
    return json(res, 200, { user, note: `Simulated ${prov.label} (local demo).` }, login(res, user));
  }

  if (route === '/login/email' && req.method === 'POST') {
    const b = await readBody(req);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(b.email || '')) return json(res, 422, { detail: 'invalid email' });
    const token = crypto.randomBytes(16).toString('hex');
    magicLinks.set(token, { email: b.email, t: Date.now() });
    for (const [k, v] of magicLinks) { if (Date.now() - v.t > MAGIC_LINK_TTL_MS) magicLinks.delete(k); }
    // Real app emails this link; here we return it so the demo can "click" it.
    return json(res, 200, { detail: 'magic_link_sent', email: b.email, magic_link: `/api/login/verify?token=${token}` });
  }

  if (route === '/login/verify' && req.method === 'GET') {
    const token = url.searchParams.get('token');
    const link = magicLinks.get(token);
    magicLinks.delete(token);
    if (!link || Date.now() - link.t > MAGIC_LINK_TTL_MS) return json(res, 400, { detail: 'invalid or expired link' });
    const email = link.email;
    const user = makeUser(email, 'email');
    return json(res, 200, { user }, login(res, user));
  }

  if (route === '/me' && req.method === 'GET') {
    const user = userFromReq(req);
    return user ? json(res, 200, { authenticated: true, user })
                : json(res, 401, { authenticated: false });
  }

  if (route === '/logout' && req.method === 'POST') {
    sessions.delete(cookies.sessionid);
    return json(res, 200, { detail: 'ok' }, { 'set-cookie': 'sessionid=; Path=/; HttpOnly; Max-Age=0' });
  }

  // ---- everything below requires a session ----
  const user = userFromReq(req);
  if (!user) return json(res, 401, { detail: 'authentication required' });

  if (req.method === 'POST' && ['/summarize', '/ask_lecture', '/teaching_pack', '/slides'].includes(route) && rateLimited(cookies.sessionid))
    return json(res, 429, { detail: 'Too many AI requests — wait a minute and try again.' });

  if (route === '/channels' && req.method === 'GET')
    return json(res, 200, { channels: CHANNELS });

  // ---- Claude adaptive summaries (Phase 4) ----
  // Status: whether a key is configured (never returns the key itself).
  if (route === '/claude_status' && req.method === 'GET')
    return json(res, 200, { configured: !!CLAUDE_KEY, fromEnv: CLAUDE_KEY_FROM_ENV, model: CLAUDE_MODEL });

  // Set the key at runtime (held in memory only). Refused if the key came from
  // the environment, so a browser request can't overwrite the operator's key.
  if (route === '/claude_key' && req.method === 'POST') {
    if (CLAUDE_KEY_FROM_ENV) return json(res, 409, { detail: 'A key is already set from the server environment.' });
    const b = await readBody(req);
    const key = String(b.key || '').trim();
    if (!/^sk-[A-Za-z0-9\-_]{20,}$/.test(key)) return json(res, 422, { detail: 'That does not look like an Anthropic API key (expected sk-…).' });
    CLAUDE_KEY = key;
    return json(res, 200, { configured: true, model: CLAUDE_MODEL });
  }
  if (route === '/claude_key' && req.method === 'DELETE') {
    if (CLAUDE_KEY_FROM_ENV) return json(res, 409, { detail: 'Key is set from the server environment; restart the server without it to clear.' });
    CLAUDE_KEY = null;
    return json(res, 200, { configured: false });
  }

  // Generate study materials from a transcript + the student's preferences.
  if (route === '/summarize' && req.method === 'POST') {
    const b = await readBody(req);
    let transcript = '';
    if (typeof b.transcript === 'string') transcript = b.transcript;
    else if (Array.isArray(b.segments)) transcript = b.segments.map((s) => (s && s.text) || '').join(' ');
    transcript = transcript.trim();
    if (!transcript) return json(res, 422, { detail: 'No transcript text to summarize.' });
    // Cap very long transcripts to keep latency/cost sane (keep the start).
    const MAX = 48000;
    if (transcript.length > MAX) transcript = transcript.slice(0, MAX) + '\n…[transcript truncated]';
    const { system, user } = buildSummaryPrompt({ transcript, title: b.title, courseName: b.courseName, prefs: b.prefs });
    const out = await callClaude({ system, user, maxTokens: 2200 });
    if (!out.ok) {
      const code = out.error === 'no_key' ? 400 : (out.status || 502);
      return json(res, code, { error: out.error, detail: out.error === 'no_key' ? 'No Claude API key configured. Add one in Study Preferences.' : out.error });
    }
    // Parse the model's JSON; tolerate stray code fences or prose around it.
    let parsed = null;
    try {
      let t = out.text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
      const a = t.indexOf('{'), z = t.lastIndexOf('}');
      if (a > 0 || z > -1) t = t.slice(a > -1 ? a : 0, z > -1 ? z + 1 : t.length);
      parsed = JSON.parse(t);
    } catch {}
    if (parsed && typeof parsed.summary === 'string') {
      return json(res, 200, {
        summary: parsed.summary,
        keyTerms: Array.isArray(parsed.keyTerms) ? parsed.keyTerms.filter((k) => k && typeof k === 'object').slice(0, 12) : [],
        quiz: Array.isArray(parsed.quiz) ? parsed.quiz.filter((q) => q && typeof q === 'object').slice(0, 10) : [],
        model: CLAUDE_MODEL,
      });
    }
    // Fallback: hand back the raw text as the summary if JSON parsing failed.
    return json(res, 200, { summary: out.text, keyTerms: [], quiz: [], model: CLAUDE_MODEL, raw: true });
  }

  // Ask a question about one lecture, answered from its transcript by Claude.
  if (route === '/ask_lecture' && req.method === 'POST') {
    const b = await readBody(req);
    let transcript = '';
    if (typeof b.transcript === 'string') transcript = b.transcript;
    else if (Array.isArray(b.segments)) transcript = b.segments.map((s) => (s && s.text) || '').join(' ');
    transcript = transcript.trim();
    const question = String(b.question || '').trim();
    if (!question) return json(res, 422, { detail: 'No question.' });
    if (!transcript) return json(res, 422, { detail: 'No transcript to answer from.' });
    if (transcript.length > 48000) transcript = transcript.slice(0, 48000) + '\n…[truncated]';
    const system = 'You answer a student\'s question using ONLY the given lecture transcript (which may contain speech-to-text errors you should read past). If the answer is not in the transcript, say so briefly. Be concise and clear. Plain text, no markdown headers.';
    const user = `Lecture: ${b.title || 'Untitled'}\n\nTRANSCRIPT:\n"""\n${transcript}\n"""\n\nQUESTION: ${question}`;
    const out = await callClaude({ system, user, maxTokens: 700 });
    if (!out.ok) {
      const code = out.error === 'no_key' ? 400 : (out.status || 502);
      return json(res, code, { error: out.error, detail: out.error === 'no_key' ? 'No Claude API key configured.' : out.error });
    }
    return json(res, 200, { answer: out.text, model: CLAUDE_MODEL });
  }

  // Professor mode: generate a teaching pack (recap + handout + question bank).
  if (route === '/teaching_pack' && req.method === 'POST') {
    const b = await readBody(req);
    let transcript = '';
    if (typeof b.transcript === 'string') transcript = b.transcript;
    else if (Array.isArray(b.segments)) transcript = b.segments.map((s) => (s && s.text) || '').join(' ');
    transcript = transcript.trim();
    if (!transcript) return json(res, 422, { detail: 'No transcript text.' });
    if (transcript.length > 48000) transcript = transcript.slice(0, 48000) + '\n…[transcript truncated]';
    const { system, user } = buildTeachingPrompt({ transcript, title: b.title, courseName: b.courseName });
    const out = await callClaude({ system, user, maxTokens: 2800 });
    if (!out.ok) {
      const code = out.error === 'no_key' ? 400 : (out.status || 502);
      return json(res, code, { error: out.error, detail: out.error === 'no_key' ? 'No Claude API key configured. Add one in Settings.' : out.error });
    }
    let parsed = null;
    try {
      let t = out.text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
      const a = t.indexOf('{'), z = t.lastIndexOf('}');
      if (a > 0 || z > -1) t = t.slice(a > -1 ? a : 0, z > -1 ? z + 1 : t.length);
      parsed = JSON.parse(t);
    } catch {}
    if (parsed && (typeof parsed.recap === 'string' || typeof parsed.handout === 'string')) {
      return json(res, 200, {
        recap: typeof parsed.recap === 'string' ? parsed.recap : '',
        handout: typeof parsed.handout === 'string' ? parsed.handout : '',
        questionBank: Array.isArray(parsed.questionBank) ? parsed.questionBank.filter((q) => q && typeof q === 'object').slice(0, 20) : [],
        model: CLAUDE_MODEL,
      });
    }
    return json(res, 200, { recap: out.text, handout: '', questionBank: [], model: CLAUDE_MODEL, raw: true });
  }

  // Live Visual Slides: a transcript slice -> 3-5 grounded slides (cheap model).
  if (route === '/slides' && req.method === 'POST') {
    const b = await readBody(req);
    let chunk = '';
    if (typeof b.transcript === 'string') chunk = b.transcript;
    else if (Array.isArray(b.segments)) chunk = b.segments.map((s) => (s && s.text) || '').join(' ');
    chunk = chunk.trim();
    if (!chunk) return json(res, 422, { detail: 'No transcript slice.' });
    if (chunk.length > 16000) chunk = chunk.slice(0, 16000) + '\n…[truncated]';
    const { system, user } = buildSlidePrompt({ transcriptChunk: chunk, recentTitles: b.recentTitles, prefs: b.prefs, visualPrefs: b.visualPrefs });
    const out = await callClaude({ system, user, maxTokens: 1800, model: CLAUDE_SLIDES_MODEL });
    if (!out.ok) {
      const code = out.error === 'no_key' ? 400 : (out.status || 502);
      return json(res, code, { error: out.error, detail: out.error === 'no_key' ? 'No Claude API key configured. Add one in Study Preferences.' : out.error });
    }
    let parsed = null;
    try {
      let t = out.text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
      const a = t.indexOf('['), z = t.lastIndexOf(']');
      if (a > -1 && z > -1) t = t.slice(a, z + 1);
      parsed = JSON.parse(t);
    } catch {}
    const slides = (Array.isArray(parsed) ? parsed : []).filter((s) => s && typeof s === 'object' && typeof s.title === 'string').slice(0, 6).map((s) => ({
      topic: typeof s.topic === 'string' ? s.topic : '',
      title: s.title,
      bullets: Array.isArray(s.bullets) ? s.bullets.filter((x) => typeof x === 'string').slice(0, 6) : [],
      explainer: typeof s.explainer === 'string' ? s.explainer : '',
      diagram: (s.diagram && typeof s.diagram === 'object' && s.diagram.type === 'mermaid' && typeof s.diagram.code === 'string' && s.diagram.code.trim()) ? { type: 'mermaid', code: s.diagram.code } : { type: 'none', code: '' },
      imageQuery: typeof s.imageQuery === 'string' ? s.imageQuery.slice(0, 80) : '',
    }));
    return json(res, 200, { slides, model: CLAUDE_SLIDES_MODEL });
  }

  // Free real-image lookup for slides: Wikipedia first, Openverse fallback. No API key.
  if (route === '/image' && req.method === 'GET') {
    const q = (url.searchParams.get('q') || '').trim().slice(0, 100);
    if (!q) return json(res, 200, {});
    const cached = imageCacheGet(q);
    if (cached) return json(res, 200, cached);
    const result = await lookupImage(q);
    imageCacheSet(q, result);
    return json(res, 200, result);
  }

  // Save a lecture from a REAL recorded transcript (segments captured in the
  // browser). Segments are validated so stored data can't carry markup or junk.
  if (route === '/lectures' && req.method === 'POST') {
    const b = await readBody(req);
    const segments = cleanSegments(b.segments);
    const spk = [...new Set(segments.map((s) => s.speaker).filter(Boolean))];
    const palette = ['#f6a21e', '#7b3fe4', '#1e88e5', '#0a7d4d'];
    const text = segments.map((s) => s.text).join(' ');
    // Local, non-AI extractive summary: first ~2 sentences of the transcript.
    const sentences = text.split(/(?<=[.!?])\s+/).filter(Boolean);
    const summary = segments.length ? sentences.slice(0, 2).join(' ') : '';
    const convo = {
      id: 'c_rec_' + crypto.randomBytes(4).toString('hex'),
      title: String(b.title || 'Live Recording').slice(0, 200),
      createdAt: new Date().toISOString().slice(0, 19),
      durationSec: Math.max(0, Math.min(Number(b.durationSec) || (segments.length ? Math.ceil(segments[segments.length - 1].t) : 0), 24 * 3600)),
      owner: USER.name,
      speakers: spk,
      speakerColors: Object.fromEntries(spk.map((s, i) => [s, palette[i % palette.length]])),
      thumbnail: null,
      segments,
      summary,
      outline: segments.slice(0, 3).map((s) => ({ t: s.t, label: s.text.slice(0, 48) })),
      actionItems: [],
    };
    convos.unshift(convo);
    return json(res, 200, { id: convo.id });
  }

  if (route === '/lectures' && req.method === 'GET') {
    return json(res, 200, { lectures: convos.map((c) => ({
      id: c.id, title: c.title, createdAt: c.createdAt, durationSec: c.durationSec,
      owner: c.owner, speakers: c.speakers, speakerColors: c.speakerColors || {},
      thumbnail: c.thumbnail || null, summary: c.summary || '',
      preview: c.segments[0] ? c.segments[0].text : '', segmentCount: c.segments.length,
    })) });
  }

  const mConv = route.match(/^\/lectures\/([^/]+)$/);
  if (mConv && req.method === 'GET') {
    const c = convos.find((x) => x.id === mConv[1]);
    return c ? json(res, 200, { lecture: c }) : json(res, 404, { detail: 'not found' });
  }
  if (mConv && req.method === 'DELETE') {
    const before = convos.length;
    convos = convos.filter((x) => x.id !== mConv[1]);
    return json(res, convos.length < before ? 200 : 404, { detail: convos.length < before ? 'deleted' : 'not found' });
  }

  const mAsk = route.match(/^\/lectures\/([^/]+)\/ask$/);
  if (mAsk && req.method === 'POST') {
    const c = convos.find((x) => x.id === mAsk[1]);
    if (!c) return json(res, 404, { detail: 'not found' });
    const b = await readBody(req);
    return json(res, 200, cannedAnswer(c, String(b.question || '')));
  }

  return json(res, 404, { detail: 'no such endpoint', route });
}

// -------------------------------------------- other same-origin endpoints ----

// ------------------------------------------------- static file serving ----
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json; charset=utf-8',
  '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json', '.png': 'image/png' };
function serveStatic(res, urlPath) {
  const rel = urlPath === '/' ? '/index.html' : urlPath;
  const filePath = path.normalize(path.join(PUBLIC_DIR, rel));
  if (filePath !== PUBLIC_DIR && !filePath.startsWith(PUBLIC_DIR + path.sep)) { res.writeHead(403); return res.end('forbidden'); }
  fs.readFile(filePath, (err, buf) => {
    if (err) { if (!path.extname(filePath)) return serveStatic(res, '/'); res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, {
      'content-type': MIME[path.extname(filePath)] || 'application/octet-stream', 'cache-control': 'no-cache',
      'x-content-type-options': 'nosniff', 'x-frame-options': 'DENY', 'referrer-policy': 'no-referrer',
      'permissions-policy': 'camera=(), geolocation=()',
    });
    res.end(buf);
  });
}

// ------------------------------------------------------------ HTTP server ----
const server = http.createServer((req, res) => {
  if (!hostAllowed(req)) { res.writeHead(421, { 'content-type': 'text/plain' }); return res.end('Misdirected request'); }
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const p = url.pathname;
  // Catch any error from an async route so a single bad request can never take
  // the whole process down (which would drop every session and the in-memory key).
  if (p.startsWith('/api')) return handleApi(req, res, url).catch((err) => {
    console.warn('[api] route error', err && err.message);
    try { if (!res.headersSent) json(res, 500, { detail: 'server error' }); } catch {}
  });
  return serveStatic(res, p);
});

// Last-resort stability net: keep the process alive no matter what throws.
// Routes already guard their own errors; these ensure that even an unforeseen
// bug can never exit the server (which would drop sessions + the in-memory key).
process.on('uncaughtException', (err) => { console.warn('[server] uncaughtException (kept alive):', err && err.message); });
process.on('unhandledRejection', (err) => { console.warn('[server] unhandledRejection (kept alive):', err && (err.message || err)); });

// ---------------------------------------------- minimal WebSocket (RFC6455) ----
const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
function wsAccept(key) { return crypto.createHash('sha1').update(key + WS_GUID).digest('base64'); }
function wsEncode(str) {
  const payload = Buffer.from(str);
  const len = payload.length;
  let header;
  if (len < 126) { header = Buffer.from([0x81, len]); }
  else if (len < 65536) { header = Buffer.from([0x81, 126, (len >> 8) & 255, len & 255]); }
  else { header = Buffer.alloc(10); header[0] = 0x81; header[1] = 127; header.writeUInt32BE(Math.floor(len / 2 ** 32), 2); header.writeUInt32BE(len >>> 0, 6); }
  return Buffer.concat([header, payload]);
}
// Decode a single client frame from buffer; returns {opcode, text, rest} or null if incomplete.
function wsDecode(buf) {
  if (buf.length < 2) return null;
  const opcode = buf[0] & 0x0f;
  const masked = (buf[1] & 0x80) !== 0;
  let len = buf[1] & 0x7f, off = 2;
  if (len === 126) { if (buf.length < 4) return null; len = buf.readUInt16BE(2); off = 4; }
  else if (len === 127) { if (buf.length < 10) return null; len = Number(buf.readBigUInt64BE(2)); off = 10; }
  const maskKey = masked ? buf.slice(off, off + 4) : null; if (masked) off += 4;
  if (buf.length < off + len) return null;
  const data = buf.slice(off, off + len);
  if (masked) for (let i = 0; i < data.length; i++) data[i] ^= maskKey[i % 4];
  return { opcode, text: data.toString('utf8'), rest: buf.slice(off + len) };
}

server.on('upgrade', (req, socket) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (url.pathname !== '/ws/transcribe' || !hostAllowed(req) || !originAllowed(req)) { socket.destroy(); return; }
  if (!userFromReq(req)) { socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n'); socket.destroy(); return; }
  const key = req.headers['sec-websocket-key'];
  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\n' +
    'Upgrade: websocket\r\nConnection: Upgrade\r\n' +
    `Sec-WebSocket-Accept: ${wsAccept(key)}\r\n\r\n`
  );
  const send = (obj) => { try { socket.write(wsEncode(JSON.stringify(obj))); } catch {} };

  let i = 0, paused = false, startedAt = Date.now(), collected = [];
  send({ type: 'ready', message: 'connected' });
  const timer = setInterval(() => {
    if (paused) return;
    if (i >= LIVE_SCRIPT.length) return; // wait for client 'stop'
    const s = LIVE_SCRIPT[i++];
    collected.push(s);
    send({ type: 'segment', segment: s, index: i });
  }, 950);

  function finalize() {
    const spk = [...new Set(collected.map((s) => s.speaker))];
    const palette = ['#f6a21e', '#7b3fe4', '#1e88e5', '#0a7d4d'];
    const convo = {
      id: 'c_live_' + crypto.randomBytes(4).toString('hex'),
      title: 'Live Recording',
      createdAt: new Date().toISOString().slice(0, 19),
      durationSec: Math.round((Date.now() - startedAt) / 1000),
      owner: USER.name,
      speakers: spk,
      speakerColors: Object.fromEntries(spk.map((s, i) => [s, palette[i % palette.length]])),
      thumbnail: null,
      segments: collected,
      summary: 'Live demo recording. ' + (collected.length
        ? 'The conversation covered how real-time segments stream in with speaker labels and timestamps, how pause/resume preserves context, and how a summary is generated on stop.'
        : 'No speech was captured.'),
      outline: collected.slice(0, 3).map((s) => ({ t: s.t, label: s.text.slice(0, 48) })),
      actionItems: [{ owner: 'You', text: 'Review the generated transcript and summary.' }],
    };
    convos.unshift(convo);
    send({ type: 'final', conversationId: convo.id });
  }

  let acc = Buffer.alloc(0);
  socket.on('data', (chunk) => {
    acc = Buffer.concat([acc, chunk]);
    if (acc.length > 64 * 1024) { clearInterval(timer); socket.destroy(); return; } // control messages are tiny
    let frame;
    while ((frame = wsDecode(acc))) {
      acc = frame.rest;
      if (frame.opcode === 0x8) { clearInterval(timer); socket.end(); return; } // close
      if (frame.opcode !== 0x1) continue; // only text
      let msg; try { msg = JSON.parse(frame.text); } catch { continue; }
      if (msg.type === 'pause') paused = true;
      else if (msg.type === 'resume') paused = false;
      else if (msg.type === 'stop') { clearInterval(timer); finalize(); }
    }
  });
  socket.on('close', () => clearInterval(timer));
  socket.on('error', () => clearInterval(timer));
});

server.listen(PORT, HOST, () => {
  console.log(`\n  LectureNotes:  http://localhost:${PORT}${LOCAL_ONLY ? '' : `  (listening on ${HOST})`}\n`);
  console.log('  Sign in with any provider button or an email, then record / browse lectures.\n');
});
