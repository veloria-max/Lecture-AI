'use strict';
/* LectureNotes SPA. One API client -> same-site proxy
   /forward/api/v1, csrftoken cookie echoed as x-csrftoken, fixed x-source
   header, session via HttpOnly cookie. */

const API = '/forward/api/v1';
const X_SOURCE = 'lecturenotes-web';
const getCookie = (n) => (document.cookie.match('(^|;)\\s*' + n + '\\s*=\\s*([^;]+)') || [, , ''])[2];

async function api(pathname, { method = 'GET', body } = {}) {
  const headers = { 'x-source': X_SOURCE };
  if (method !== 'GET') { headers['x-csrftoken'] = getCookie('csrftoken'); headers['content-type'] = 'application/json'; }
  const res = await fetch(API + pathname, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let data = {}; try { data = await res.json(); } catch {}
  return { status: res.status, data };
}

const $ = (s, e = document) => e.querySelector(s);
const $$ = (s, e = document) => [...e.querySelectorAll(s)];
const el = (h) => { const t = document.createElement('template'); t.innerHTML = h.trim(); return t.content.firstElementChild; };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const root = () => $('#root');
let toastTimer;
function toast(m) { const t = $('#toast'); t.textContent = m; t.classList.remove('hidden'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.add('hidden'), 3000); }

// time/duration formatting for the feed
function fmtClock(iso) { const d = new Date(iso); return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }); }
function fmtMMSS(sec) { const m = Math.floor(sec / 60), s = Math.round(sec % 60); return `${m}:${String(s).padStart(2, '0')}`; }
function fmtDuration(sec) {
  if (sec < 60) return `${Math.round(sec)} sec`;
  const h = Math.floor(sec / 3600), m = Math.round((sec % 3600) / 60);
  if (h > 0) return `${h} h ${m} min`;
  return `${m} min`;
}
function dayKey(iso) { return new Date(iso).toDateString(); }
function dayHeader(iso) {
  const d = new Date(iso), now = new Date();
  const same = (a, b) => a.toDateString() === b.toDateString();
  const optsShort = { month: 'short', day: 'numeric' };
  if (same(d, now)) return 'Today, ' + d.toLocaleDateString(undefined, optsShort);
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (same(d, y)) return 'Yesterday, ' + d.toLocaleDateString(undefined, optsShort);
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
}

// inline icons
const ICON = {
  bell: '<svg class="ic" viewBox="0 0 24 24"><path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg>',
  home: '<svg class="ic" viewBox="0 0 24 24"><path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/></svg>',
  chat: '<svg class="ic" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="13" rx="3"/><path d="M8 20l4-3 4 3"/></svg>',
  compass: '<svg class="ic" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M15 9l-2 5-4 2 2-5z"/></svg>',
  grid: '<svg class="ic" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>',
  invite: '<svg class="ic" viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.5"/><path d="M3 20a6 6 0 0 1 12 0"/><path d="M18 8v6M15 11h6"/></svg>',
  search: '<svg class="ic" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/></svg>',
  video: '<svg class="ic" viewBox="0 0 24 24"><rect x="3" y="6" width="13" height="12" rx="2"/><path d="M16 10l5-3v10l-5-3"/></svg>',
  importc: '<svg class="ic" viewBox="0 0 24 24"><path d="M12 15V3m0 0l-4 4m4-4l4 4"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/></svg>',
  mic: '<svg class="ic" viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>',
  panel: '<svg class="ic" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M14 4v16"/></svg>',
  chev: '<svg class="ic chev" viewBox="0 0 24 24" style="width:14px;height:14px"><path d="M6 9l6 6 6-6"/></svg>',
  play: '<svg class="ic" viewBox="0 0 24 24" style="width:14px;height:14px;fill:#fff;stroke:none"><path d="M8 5v14l11-7z"/></svg>',
  x: '<svg class="ic" viewBox="0 0 24 24" style="width:16px;height:16px"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  gear: '<svg class="ic" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3.2"/><path d="M19.4 13.5a7.7 7.7 0 0 0 0-3l1.8-1.4-1.8-3.2-2.2.9a7.6 7.6 0 0 0-2.6-1.5L12 2h-3.6l-.7 2.3a7.6 7.6 0 0 0-2.6 1.5l-2.2-.9L1.1 8.1 2.9 9.5a7.7 7.7 0 0 0 0 3L1.1 13.9l1.8 3.2 2.2-.9a7.6 7.6 0 0 0 2.6 1.5l.7 2.3H12l.7-2.3a7.6 7.6 0 0 0 2.6-1.5l2.2.9 1.8-3.2z"/></svg>',
  book: '<svg class="ic" viewBox="0 0 24 24"><path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 19a2 2 0 0 1 2-2h13"/></svg>',
  game: '<svg class="ic" viewBox="0 0 24 24"><rect x="2" y="7" width="20" height="11" rx="4"/><path d="M6 11v3M4.5 12.5h3"/><circle cx="15.5" cy="11.5" r="1.1"/><circle cx="18" cy="14" r="1.1"/></svg>',
};
// LectureNotes wordmark (soundwave → notes). Replaces the old demo branding.
const LOGO_SVG = '<svg viewBox="0 0 24 24"><path d="M5 10v4M9.5 6v12M14.5 8.5v7M19 11v2"/></svg>';
const BRAND = `<div class="brandmark"><span class="logo">${LOGO_SVG}</span><span class="wm">LectureNotes</span></div>`;

// ---- Phase 3: study preferences (drive adaptive summaries in Phase 4) ----
const STUDY_LEVELS = [
  { id: 'hs', label: 'High school', hint: 'Plain language, everyday examples' },
  { id: 'ug', label: 'Undergraduate', hint: 'Standard course depth' },
  { id: 'grad', label: 'Graduate / exam prep', hint: 'Rigorous, assumes fundamentals' },
];
const SUMMARY_LENGTHS = [
  { id: 'brief', label: 'Brief', hint: 'The 5–6 key takeaways' },
  { id: 'standard', label: 'Standard', hint: 'Balanced section-by-section' },
  { id: 'detailed', label: 'Detailed', hint: 'Thorough, nothing dropped' },
];
const SUMMARY_STYLES = [
  { id: 'bullets', label: 'Bullet points' },
  { id: 'narrative', label: 'Narrative paragraphs' },
  { id: 'outline', label: 'Structured outline' },
];
const FOCUS_AREAS = [
  { id: 'concepts', label: 'Key concepts' },
  { id: 'definitions', label: 'Definitions & terms' },
  { id: 'formulas', label: 'Formulas & equations' },
  { id: 'examples', label: 'Worked examples' },
  { id: 'exam', label: 'Likely exam points' },
  { id: 'actions', label: 'To-dos & deadlines' },
];
const ROLES = [
  { id: 'student', label: 'Student', hint: 'Study summaries, key terms, self-quiz' },
  { id: 'professor', label: 'Professor', hint: 'Lesson recap, student handout, assessment question bank' },
];
const DEFAULT_PREFS = { role: 'student', level: 'ug', length: 'standard', style: 'bullets', focus: ['concepts', 'definitions', 'exam'], simplify: true };
const COURSE_COLORS = ['#2b6cf6', '#0a7d4d', '#b4531f', '#7b3fe4', '#c01f6b', '#1f8fb4', '#8a6d1f', '#d23b3b'];
const SEED_COURSES = [
  { id: 'crs_general', name: 'General', color: '#6b7280', createdAt: new Date().toISOString() },
];

const state = { user: null, flags: {}, channels: [], courses: [], prefs: null, visualPrefs: {} };

// ---- Courses + preferences: load/cache from IndexedDB (offline-safe) ----
async function loadCourses() {
  try { if (window.LDB && LDB.available()) { let c = await LDB.getCourses(); if (!c.length) { c = SEED_COURSES.slice(); await LDB.setCourses(c); } state.courses = c; return c; } } catch {}
  state.courses = SEED_COURSES.slice(); return state.courses;
}
async function saveCourses() { try { if (window.LDB && LDB.available()) await LDB.setCourses(state.courses); } catch {} }
function courseById(id) { return state.courses.find((c) => c.id === id) || null; }
async function addCourse(name) {
  const id = 'crs_' + Math.random().toString(16).slice(2, 10);
  const color = COURSE_COLORS[state.courses.filter((c) => c.id !== 'crs_general').length % COURSE_COLORS.length];
  const c = { id, name: name.trim(), color, createdAt: new Date().toISOString() };
  state.courses.push(c); await saveCourses(); return c;
}
async function loadPrefs() {
  let ldb = null, ls = null;
  try { if (window.LDB && LDB.available()) ldb = await LDB.getStudentPrefs(); } catch {}
  try { const raw = localStorage.getItem('ln_prefs'); if (raw) ls = JSON.parse(raw); } catch {}
  // localStorage is written on every save; overlay it LAST so a silently-failed
  // IndexedDB write can't resurrect stale prefs on the next load.
  state.prefs = Object.assign({}, DEFAULT_PREFS, ldb || {}, ls || {});
  return state.prefs;
}
async function savePrefs(p) {
  state.prefs = Object.assign({}, DEFAULT_PREFS, p || {});
  try { localStorage.setItem('ln_prefs', JSON.stringify(state.prefs)); } catch {}
  try { if (window.LDB && LDB.available()) await LDB.setStudentPrefs(state.prefs); } catch {}
  return state.prefs;
}

// Cleanup for the currently-mounted view (stop recording, revoke blob URLs, …).
// Invoked by the router before rendering the next view so nothing leaks or runs on.
let viewCleanup = null;
function runViewCleanup() { if (viewCleanup) { try { viewCleanup(); } catch {} viewCleanup = null; } }
// Remember the signed-in user locally so the app works offline on return visits.
function cacheUser(u) { try { localStorage.setItem('ln_user', JSON.stringify(u)); } catch {} }

// ============================ SIGN IN ============================
async function renderSignIn() {
  const nav = navSeq;
  const { data: pd } = await api('/providers');
  const providers = pd.providers || [];
  const ig = (id) => ({ google: 'G', microsoft: 'M', apple: '' }[id] || '?');
  if (nav !== navSeq) return;  // user already navigated elsewhere
  root().innerHTML = '';
  const page = el(`<div class="auth"><div class="auth-card">
    ${BRAND}
    <h2>Sign in</h2><p class="sub">Local demo — no real account or password is used.</p>
    <div id="provs"></div>
    <div class="calnote">Why does LectureNotes need calendar access? <a id="why">Learn more</a></div>
    <div class="divider">or</div>
    <div id="emailArea"><button class="btn block" id="other">Other ways to log in</button></div>
    <p class="legal">Runs only on your machine. Local demo for testing.</p>
  </div></div>`);
  root().appendChild(page);
  const ph = $('#provs', page);
  providers.forEach((p) => { const b = el(`<button class="btn prov"><span class="g">${ig(p.id)}</span>Continue with ${esc(p.label.replace('Continue with ', ''))}</button>`); b.onclick = () => oauth(p, b); ph.appendChild(b); });
  $('#why', page).onclick = () => toast('Calendar access lets LectureNotes see your classes and auto-join to record (simulated here).');
  $('#other', page).onclick = () => emailForm(page);
}
function emailForm(page) {
  const a = $('#emailArea', page); a.innerHTML = '';
  const f = el(`<div><input class="field" id="email" type="email" placeholder="you@example.com" autocomplete="off"><button class="btn brand block" id="send" disabled>Send magic link</button><div id="linkArea"></div></div>`);
  a.appendChild(f);
  const email = $('#email', f), send = $('#send', f); email.focus();
  email.oninput = () => (send.disabled = !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.value));
  send.onclick = async () => {
    send.disabled = true; send.innerHTML = '<span class="spin"></span>';
    const { status, data } = await api('/login/email', { method: 'POST', body: { email: email.value } });
    if (status !== 200) { toast(data.detail || 'Error'); send.disabled = false; send.textContent = 'Send magic link'; return; }
    const link = el(`<div style="margin-top:12px;padding:12px;border:1px dashed var(--line);border-radius:10px;font-size:13px">
      <div class="muted" style="margin-bottom:8px">Magic link “sent” to <b>${esc(data.email)}</b>:</div>
      <button class="btn brand block" id="use">Open magic link →</button></div>`);
    $('#linkArea', f).innerHTML = ''; $('#linkArea', f).appendChild(link);
    $('#use', link).onclick = async () => { const r = await api(data.magic_link.replace(API, '')); if (r.status === 200) { state.user = r.data.user; cacheUser(r.data.user); location.hash = '#/home'; } else toast('Link expired'); };
  };
}
async function oauth(p, btn) {
  const old = btn.innerHTML; btn.innerHTML = '<span class="spin"></span>'; btn.disabled = true;
  const { status, data } = await api('/login/oauth', { method: 'POST', body: { provider: p.id } });
  if (status === 200) { state.user = data.user; cacheUser(data.user); location.hash = '#/home'; }
  else { toast(data.detail || 'Login failed'); btn.innerHTML = old; btn.disabled = false; }
}

// ============================ APP SHELL ============================
function shell(active, bodyNode, opts = {}) {
  root().innerHTML = '';
  const u = state.user;
  const courseItems = (state.courses || []).map((c) => `<a class="sb-item" href="#/course/${c.id}"><span class="cdot" style="display:inline-block;width:9px;height:9px;border-radius:3px;background:${c.color};margin-right:8px"></span>${esc(c.name)}</a>`).join('')
    + `<a class="sb-item muted" id="sb-newcourse" style="cursor:pointer">＋ New course</a>`;
  const navItem = (hash, icon, label) => `<a class="nav ${active === hash ? 'active' : ''}" href="${hash}">${icon}<span>${label}</span></a>`;
  const app = el(`<div class="app">
    <aside class="sb">
      <div class="sb-top">${BRAND}<span class="bell">${ICON.bell}</span></div>
      <div class="usercard">
        <div class="row"><div class="avatar" style="width:34px;height:34px;font-size:13px;background:${u.color || 'var(--avatar)'}">${esc(u.avatar)}</div>
          <div style="min-width:0"><div class="nm">${esc(u.name)}</div><div class="em">${esc(u.email)}</div></div></div>
      </div>
      ${navItem('#/home', ICON.home, 'Home')}
      ${navItem('#/record', ICON.mic, 'Record')}
      ${navItem('#/courses', ICON.book, 'Courses')}
      ${navItem('#/games', ICON.game, 'Games')}
      ${navItem('#/chat', ICON.chat, 'AI Chat')}
      ${navItem('#/settings', ICON.gear, 'Study Prefs')}
      <div class="sb-group" id="g-cr"><div class="gh">${ICON.chev} Courses</div><div class="gitems">${courseItems}</div></div>
      <div class="sb-spacer"></div>
      <div class="sb-tip">${ICON.mic} Tip: press <b>Record</b> to capture a lecture — it transcribes on your device.</div>
    </aside>
    <div class="main">
      <div class="topbar">
        <div class="searchbar">${ICON.search}<input id="globalSearch" placeholder="Ask or search"><span class="kbd">Ctrl K</span></div>
        <div class="sp"></div>
        <button class="btn" id="tb-import">${ICON.importc} Import</button>
        <button class="btn brand" id="tb-record">${ICON.mic} Record</button>
      </div>
      <div class="content"><div id="contentInner"></div></div>
    </div>
  </div>`);
  root().appendChild(app);
  $('#contentInner', app).appendChild(bodyNode);
  const g = $('#g-cr', app); if (g) $('.gh', g).onclick = () => g.classList.toggle('collapsed');
  const nc = $('#sb-newcourse', app);
  if (nc) nc.onclick = async () => { const name = (window.prompt('New course name (e.g. Calculus II):') || '').trim(); if (!name) return; const c = await addCourse(name); toast('Course added: ' + c.name); location.hash = '#/course/' + c.id; };
  $('#tb-record', app).onclick = () => (location.hash = '#/record');
  $('#tb-import', app).onclick = () => (location.hash = '#/import');
  const gs = $('#globalSearch', app);
  gs.onkeydown = (e) => { if (e.key === 'Enter' && gs.value.trim()) location.hash = '#/search/' + encodeURIComponent(gs.value.trim()); };
}

function avatarFor(name, color) { return `<div class="avatar av" style="background:${color || 'var(--avatar)'}">${esc((name || '?').slice(0, 1).toUpperCase())}</div>`; }

// ============================ HOME (feed) ============================
// Map a "speech" (recording) object from /feed to a feed card.
function speechToCard(s) {
  return {
    id: s.speech_id,
    title: s.title,
    createdAt: new Date((s.start_time || s.created_at) * 1000).toISOString(),
    durationSec: s.duration,
    owner: (s.owner && s.owner.name) || 'You',
    speakers: (s.speakers || []).map((x) => x.name),
    speakerColors: {},
    thumbnail: s.has_photos ? 'purple' : null,
    summary: s.summary || '',
    segmentCount: (s.speakers || []).length,
  };
}

// Map a locally-stored lecture (IndexedDB) to a feed card.
function localToCard(l) {
  return {
    id: l.id, title: l.title, createdAt: l.createdAt, durationSec: l.durationSec,
    owner: l.owner || 'You', speakers: l.speakers || [], speakerColors: l.speakerColors || {},
    thumbnail: null, summary: l.summary || '', segmentCount: (l.segments || []).length,
    local: true, status: l.status || 'transcribed', courseId: l.courseId || null,
  };
}

async function renderHome(query) {
  const nav = navSeq;
  // Local-first: merge on-device lectures (always available, offline) with the
  // server feed (when online). Local entries win on id collision.
  let server = [], online = true;
  try {
    const { status, data } = await api(`/feed?modified_after=0`);
    if (status === 200) server = (data.speeches || []).map(speechToCard); else online = false;
  } catch { online = false; }
  let local = [], localRaw = [];
  try { if (window.LDB && LDB.available()) { localRaw = await LDB.listLectures(); local = localRaw.map(localToCard); } } catch {}
  // Server ids that are really the same lecture already held locally (post-sync).
  const syncedServerIds = new Set(localRaw.map((l) => l.serverId).filter(Boolean));
  const byId = new Map();
  server.forEach((c) => { if (!syncedServerIds.has(c.id)) byId.set(c.id, c); });
  local.forEach((c) => byId.set(c.id, c)); // local overrides
  let convos = [...byId.values()].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  if (query) convos = convos.filter((c) => (c.title + ' ' + c.summary + ' ' + c.speakers.join(' ')).toLowerCase().includes(query.toLowerCase()));
  // group by day
  const groups = [];
  convos.forEach((c) => { const k = dayKey(c.createdAt); let g = groups.find((x) => x.k === k); if (!g) { g = { k, header: dayHeader(c.createdAt), items: [] }; groups.push(g); } g.items.push(c); });

  const feed = el(`<div class="feed"></div>`);
  if (!online) feed.appendChild(el(`<div class="offline-banner">● Offline — showing lectures saved on this device. Recording & transcription still work; summaries sync when you’re back online.</div>`));
  if (query) feed.appendChild(el(`<div class="feed-head"><span class="datehdr">Results for “${esc(query)}”</span></div>`));
  groups.forEach((g, gi) => {
    feed.appendChild(el(`<div class="feed-head"><span class="datehdr">${esc(g.header)} ${ICON.chev}</span>${gi === 0 && !query ? `<span class="foryou">For you ${ICON.chev}</span>` : ''}</div>`));
    g.items.forEach((c) => feed.appendChild(convCard(c)));
  });
  if (!convos.length) feed.appendChild(el(`<div class="empty">${query ? 'No conversations match “' + esc(query) + '”.' : 'No conversations yet. Press Record to start.'}</div>`));
  if (nav !== navSeq) return;  // user already navigated elsewhere
  shell('#/home', feed);
  const gs = $('#globalSearch'); if (gs && query) { gs.value = query; }
}

function convCard(c) {
  const spk = (c.speakers || []).map((s) => `<div class="avatar av" style="background:${(c.speakerColors || {})[s] || 'var(--avatar)'}" title="${esc(s)}">${esc(s.slice(0, 1).toUpperCase())}</div>`).join('');
  const long = (c.summary || '').length > 180;
  const crs = c.courseId ? courseById(c.courseId) : null;
  const crsChip = crs ? `<span class="course-chip" style="background:${crs.color}1f;color:${crs.color}"><span class="cdot" style="display:inline-block;width:8px;height:8px;border-radius:3px;background:${crs.color};margin-right:5px"></span>${esc(crs.name)}</span>` : '';
  const card = el(`<div class="conv">
    ${avatarFor(c.owner, c.owner === state.user.name ? state.user.color : null)}
    <div class="body">
      <h3>${esc(c.title)}${crsChip}</h3>
      <div class="meta">${fmtClock(c.createdAt)} · ${fmtDuration(c.durationSec)} · ${esc(c.owner)}</div>
      ${c.summary ? `<div class="sum">${esc(c.summary)}</div>${long ? '<span class="showmore">Show more</span>' : ''}` : ''}
      ${c.speakers && c.speakers.length > 1 ? `<div class="spk">${spk}</div>` : ''}
    </div>
    ${c.thumbnail ? `<div class="thumb"><div class="play">${ICON.play}</div></div>` : ''}
  </div>`);
  card.onclick = () => (location.hash = '#/c/' + c.id);
  return card;
}

// Minimal, safe markdown → HTML. Escapes first (so model output can't inject
// HTML), then applies a few headings/bold/italic/code/list/paragraph rules.
function mdLite(src) {
  let s = esc(String(src == null ? '' : src));
  s = s.replace(/^\s*###\s+(.*)$/gm, '<h4>$1</h4>').replace(/^\s*##\s+(.*)$/gm, '<h3>$1</h3>').replace(/^\s*#\s+(.*)$/gm, '<h3>$1</h3>');
  s = s.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/`([^`]+)`/g, '<code>$1</code>');
  s = s.replace(/(?:^|\n)((?:[ \t]*[-*][ \t]+.*(?:\n|$))+)/g, (m, blk) =>
    '\n<ul>' + blk.trim().split(/\n/).map((l) => `<li>${l.replace(/^[ \t]*[-*][ \t]+/, '')}</li>`).join('') + '</ul>');
  s = s.replace(/(?:^|\n)((?:[ \t]*\d+\.[ \t]+.*(?:\n|$))+)/g, (m, blk) =>
    '\n<ol>' + blk.trim().split(/\n/).map((l) => `<li>${l.replace(/^[ \t]*\d+\.[ \t]+/, '')}</li>`).join('') + '</ol>');
  s = s.split(/\n{2,}/).map((blk) => {
    const t = blk.trim(); if (!t) return '';
    return /^<(h\d|ul|ol|li|pre|blockquote)/.test(t) ? t : '<p>' + t.replace(/\n/g, '<br>') + '</p>';
  }).join('\n');
  return s;
}

function prefsLine() {
  const p = state.prefs || DEFAULT_PREFS;
  const lv = (STUDY_LEVELS.find((x) => x.id === p.level) || {}).label || p.level;
  const ln = (SUMMARY_LENGTHS.find((x) => x.id === p.length) || {}).label || p.length;
  const sv = (SUMMARY_STYLES.find((x) => x.id === p.style) || {}).label || p.style;
  return `Tailored for ${esc(lv)} · ${esc(ln)} · ${esc(sv)}`;
}

// ---- Phase 5: export the lecture (transcript + study materials) ----
function lectureToMarkdown(c) {
  const crs = c.courseId ? courseById(c.courseId) : null;
  const L = [];
  L.push('# ' + (c.title || 'Lecture'), '');
  L.push(`_${fmtClock(c.createdAt)} · ${fmtDuration(c.durationSec)}${crs ? ' · ' + crs.name : ''}_`, '');
  if (c.aiSummary || c.summary) { L.push('## Summary', '', c.aiSummary || c.summary, ''); }
  if (Array.isArray(c.keyTerms) && c.keyTerms.length) { L.push('## Key terms', ''); c.keyTerms.forEach((k) => { if (k && typeof k === 'object') L.push(`- **${k.term}** — ${k.definition}`); }); L.push(''); }
  if (Array.isArray(c.quiz) && c.quiz.length) {
    L.push('## Quiz', '');
    c.quiz.forEach((q, i) => { if (!q || typeof q !== 'object') return; L.push(`${i + 1}. ${q.question}`); if (q.type === 'mcq' && Array.isArray(q.options)) q.options.forEach((o) => L.push(`   - ${o}`)); L.push(`   **Answer:** ${q.answer || ''}`, ''); });
  }
  const tp = c.teachingPack;
  if (tp) {
    if (tp.recap) L.push('## Lesson recap', '', tp.recap, '');
    if (tp.handout) L.push('## Student handout', '', tp.handout, '');
    if (Array.isArray(tp.questionBank) && tp.questionBank.length) {
      L.push('## Question bank (answer key)', '');
      tp.questionBank.forEach((q, i) => {
        if (!q || typeof q !== 'object') return;
        L.push(`${i + 1}. [${q.difficulty || ''}${q.topic ? ' · ' + q.topic : ''}] ${q.question}`);
        if (q.type === 'mcq' && Array.isArray(q.options)) q.options.forEach((o) => L.push(`   - ${o}`));
        L.push(`   **Answer:** ${q.answer || ''}`, '');
      });
    }
  }
  L.push('## Transcript', '');
  (c.segments || []).forEach((s) => L.push(`**[${fmtMMSS(s.t)}] ${s.speaker}:** ${s.text}`));
  L.push('');
  return L.join('\n');
}
function safeFilename(name, ext) {
  const base = String(name || 'lecture').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').slice(0, 60) || 'lecture';
  return base + ext;
}
function downloadText(filename, text, mime) {
  try {
    const blob = new Blob([text], { type: (mime || 'text/plain') + ';charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => { try { URL.revokeObjectURL(url); } catch {} }, 1000);
  } catch (e) { toast('Could not export: ' + (e.message || e)); }
}

// The Summary tab: adaptive AI study materials (Phase 4), with a generate/
// regenerate action. `rerender` re-renders this tab after a successful run.
function studyView(c, isLocal, rerender) {
  const d = el('<div class="pb study"></div>');
  if (c.aiSummary) {
    d.innerHTML =
      `<div class="study-head"><span class="badge">AI study summary</span><span class="hint">${prefsLine()}</span><div class="sp"></div><button class="btn" id="regen">Regenerate</button></div>
       <div class="md">${mdLite(c.aiSummary)}</div>
       ${(Array.isArray(c.keyTerms) && c.keyTerms.length) ? `<h4 class="study-sub">Key terms</h4><dl class="keyterms">${c.keyTerms.filter((k) => k && typeof k === 'object').map((k) => `<dt>${esc(k.term)}</dt><dd>${esc(k.definition)}</dd>`).join('')}</dl>` : ''}
       ${(c.quiz && c.quiz.length) ? `<h4 class="study-sub">Quiz yourself</h4><div class="quiz" id="quiz"></div>` : ''}
       <div id="genmsg" class="hint" style="margin-top:10px"></div>`;
    const qh = $('#quiz', d);
    if (qh && Array.isArray(c.quiz)) c.quiz.forEach((q, i) => {
      if (!q || typeof q !== 'object') return;
      const opts = (q.type === 'mcq' && Array.isArray(q.options)) ? `<ul class="qopts">${q.options.map((o) => `<li>${esc(o)}</li>`).join('')}</ul>` : '';
      const item = el(`<div class="qitem"><div class="qq">${i + 1}. ${esc(q.question)}</div>${opts}<button class="btn qreveal">Show answer</button><div class="qa hidden">${esc(q.answer || '')}</div></div>`);
      const btn = $('.qreveal', item), ans = $('.qa', item);
      btn.onclick = () => { ans.classList.toggle('hidden'); btn.textContent = ans.classList.contains('hidden') ? 'Show answer' : 'Hide answer'; };
      qh.appendChild(item);
    });
    const rg = $('#regen', d); if (rg) rg.onclick = () => generateSummary(c, isLocal, d, rerender);
  } else {
    d.innerHTML =
      `<div class="muted" style="margin-bottom:12px">${c.summary ? esc(c.summary) : 'No summary yet.'}</div>
       <div class="study-cta"><button class="btn brand" id="gen">✨ Generate study summary</button>
         <div class="hint" style="margin-top:8px">${prefsLine()} — <a href="#/settings">change</a></div></div>
       <div id="genmsg" class="hint" style="margin-top:10px"></div>`;
    $('#gen', d).onclick = () => generateSummary(c, isLocal, d, rerender);
  }
  return d;
}

async function generateSummary(c, isLocal, container, rerender) {
  const setMsg = (t) => { const m = $('#genmsg', container); if (m) m.textContent = t; };
  const btns = () => $$('#gen, #regen', container);
  btns().forEach((b) => (b.disabled = true));
  const done = () => btns().forEach((b) => (b.disabled = false));
  if (!navigator.onLine) { setMsg('You’re offline. Your recording and transcript are saved — connect to the internet to generate the AI summary.'); done(); return; }
  let status; try { status = (await api('/claude_status')).data || {}; } catch { status = {}; }
  if (!status.configured) { setMsg('No Claude API key yet — add one in Study Preferences, then try again.'); done(); return; }
  setMsg('Generating with Claude… this usually takes 10–30 seconds.');
  const transcript = (c.segments || []).map((s) => s.text).join(' ').trim();
  if (!transcript) { setMsg('This lecture has no transcript text to summarize.'); done(); return; }
  const course = c.courseId ? courseById(c.courseId) : null;
  let resp;
  try { resp = await api('/summarize', { method: 'POST', body: { transcript, title: c.title, courseName: course ? course.name : 'General', prefs: state.prefs } }); }
  catch { setMsg('Network error reaching the summarizer.'); done(); return; }
  if (resp.status !== 200) { setMsg('Could not generate: ' + ((resp.data && (resp.data.detail || resp.data.error)) || ('HTTP ' + resp.status))); done(); return; }
  const data = resp.data;
  c.aiSummary = data.summary; c.keyTerms = data.keyTerms || []; c.quiz = data.quiz || [];
  c.summarizedAt = new Date().toISOString(); c.summaryPrefs = Object.assign({}, state.prefs); c.summaryModel = data.model;
  // Keep the card's quick summary in sync with a short excerpt.
  if (data.summary) c.summary = String(data.summary).replace(/[#*`>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 180);
  // Persist for ALL lectures (local or server-backed) so re-opening reuses the
  // cached summary instead of re-calling the paid Claude API. renderDetail loads
  // local-first, so a cached server lecture resolves from here on reopen.
  if (window.LDB) { try { await LDB.putLecture(c); } catch {} }
  toast('Study summary ready ✓');
  rerender();
}

// ---- Professor mode: teaching pack (recap + handout + question bank) ----
function teachingView(c, isLocal, rerender) {
  const d = el('<div class="pb study"></div>');
  const tp = c.teachingPack;
  if (tp) {
    const diffColor = { easy: 'var(--ok)', medium: '#b4531f', hard: 'var(--bad)' };
    d.innerHTML =
      `<div class="study-head"><span class="badge">Teaching pack</span><div class="sp"></div><button class="btn" id="regen">Regenerate</button></div>
       ${tp.recap ? `<h4 class="study-sub">Lesson recap</h4><div class="md">${mdLite(tp.recap)}</div>` : ''}
       ${tp.handout ? `<h4 class="study-sub">Student handout</h4><div class="md">${mdLite(tp.handout)}</div>` : ''}
       ${(Array.isArray(tp.questionBank) && tp.questionBank.length) ? `<h4 class="study-sub">Question bank · with answer key</h4><div class="quiz" id="qbank"></div>` : ''}
       <div id="genmsg" class="hint" style="margin-top:10px"></div>`;
    const qh = $('#qbank', d);
    if (qh && Array.isArray(tp.questionBank)) tp.questionBank.forEach((q, i) => {
      if (!q || typeof q !== 'object') return;
      const opts = (q.type === 'mcq' && Array.isArray(q.options)) ? `<ul class="qopts">${q.options.map((o) => `<li>${esc(o)}</li>`).join('')}</ul>` : '';
      const tag = `<span class="qtag" style="color:${diffColor[q.difficulty] || 'var(--muted)'}">${esc(q.difficulty || '')}${q.topic ? ' · ' + esc(q.topic) : ''}</span>`;
      const item = el(`<div class="qitem"><div class="qq">${i + 1}. ${esc(q.question)} ${tag}</div>${opts}<button class="btn qreveal">Show answer</button><div class="qa hidden">${esc(q.answer || '')}</div></div>`);
      const btn = $('.qreveal', item), ans = $('.qa', item);
      btn.onclick = () => { ans.classList.toggle('hidden'); btn.textContent = ans.classList.contains('hidden') ? 'Show answer' : 'Hide answer'; };
      qh.appendChild(item);
    });
    const rg = $('#regen', d); if (rg) rg.onclick = () => generateTeachingPack(c, isLocal, d, rerender);
  } else {
    d.innerHTML =
      `<div class="muted" style="margin-bottom:12px">Professor mode — generate teaching materials from this lecture: a lesson recap, a student handout, and an assessment question bank with answer keys.</div>
       <div class="study-cta"><button class="btn brand" id="gen">✨ Generate teaching pack</button>
         <div class="hint" style="margin-top:8px">Role: Professor — <a href="#/settings">change</a></div></div>
       <div id="genmsg" class="hint" style="margin-top:10px"></div>`;
    $('#gen', d).onclick = () => generateTeachingPack(c, isLocal, d, rerender);
  }
  return d;
}

async function generateTeachingPack(c, isLocal, container, rerender) {
  const setMsg = (t) => { const m = $('#genmsg', container); if (m) m.textContent = t; };
  const btns = () => $$('#gen, #regen', container);
  btns().forEach((b) => (b.disabled = true));
  const done = () => btns().forEach((b) => (b.disabled = false));
  if (!navigator.onLine) { setMsg('You’re offline. Connect to the internet to generate the teaching pack.'); done(); return; }
  let status; try { status = (await api('/claude_status')).data || {}; } catch { status = {}; }
  if (!status.configured) { setMsg('No Claude API key yet — add one in Settings, then try again.'); done(); return; }
  setMsg('Generating teaching materials with Claude… this usually takes 15–40 seconds.');
  const transcript = (c.segments || []).map((s) => s.text).join(' ').trim();
  if (!transcript) { setMsg('This lecture has no transcript text.'); done(); return; }
  const course = c.courseId ? courseById(c.courseId) : null;
  let resp;
  try { resp = await api('/teaching_pack', { method: 'POST', body: { transcript, title: c.title, courseName: course ? course.name : 'General' } }); }
  catch { setMsg('Network error reaching the generator.'); done(); return; }
  if (resp.status !== 200) { setMsg('Could not generate: ' + ((resp.data && (resp.data.detail || resp.data.error)) || ('HTTP ' + resp.status))); done(); return; }
  const data = resp.data;
  c.teachingPack = { recap: data.recap || '', handout: data.handout || '', questionBank: data.questionBank || [], generatedAt: new Date().toISOString(), model: data.model };
  if (window.LDB) { try { await LDB.putLecture(c); } catch {} }
  toast('Teaching pack ready ✓');
  rerender();
}

// ============================ DETAIL ============================
async function renderDetail(id) {
  const nav = navSeq;
  // Local-first: load the on-device lecture if present, else the server copy.
  let c = null, isLocal = false;
  try { if (window.LDB && LDB.available()) { const loc = await LDB.getLecture(id); if (loc) { c = loc; isLocal = true; } } } catch {}
  if (!c) { const { status, data } = await api('/conversations/' + id); if (status === 200) c = data.conversation; }
  if (!c) { toast('Lecture not found'); location.hash = '#/home'; return; }
  c.outline = c.outline || []; c.actionItems = c.actionItems || [];

  let audioURL = null; try { if (c.audio instanceof Blob) audioURL = URL.createObjectURL(c.audio); } catch {}
  // Revoke the blob URL when leaving this view so it doesn't pin the audio in memory.
  if (audioURL) viewCleanup = () => { try { URL.revokeObjectURL(audioURL); } catch {} };

  const isProf = !!(state.prefs && state.prefs.role === 'professor');
  const body = el(`<div>
    <div class="page-head">${avatarFor(c.owner, state.user.color)}
      <div><h1>${esc(c.title)}</h1><div class="meta">${fmtClock(c.createdAt)} · ${fmtDuration(c.durationSec)} · ${esc(c.owner)} · ${esc((c.speakers || []).join(', '))}${isLocal ? ' · <span style="color:var(--ok)">on this device</span>' : ''}</div></div>
      <div class="sp"></div>
      <button class="btn" id="copy" title="Copy as Markdown">Copy</button>
      <button class="btn" id="export" title="Download as Markdown">Export</button>
      <button class="btn" id="print" title="Print or save as PDF">Print</button>
      <button class="btn" id="del" style="color:var(--bad)">Delete</button></div>
    ${audioURL ? `<audio id="player" src="${audioURL}" controls preload="metadata" style="width:100%;margin-bottom:14px"></audio>` : ''}
    <div class="detail">
      <div class="panel"><div class="ph">Transcript<div class="sp"></div><div class="mini-search">${ICON.search}<input id="tq" placeholder="Search transcript"></div></div><div class="pb" id="transcript"></div></div>
      <div class="panel"><div class="tabs" id="tabs">
        <div class="tab active" data-tab="summary">${isProf ? 'Teaching' : 'Summary'}</div>
        <div class="tab" data-tab="outline">Outline</div>
        <div class="tab" data-tab="actions">Action items</div>
        <div class="tab" data-tab="visuals">Visuals</div>
        <div class="tab" data-tab="play">Play</div>
        <div class="tab" data-tab="ask">Ask AI</div></div><div id="tabbody"></div></div>
    </div></div>`);

  const player = $('#player', body);
  const seekTo = (t) => { if (player) { try { player.currentTime = Math.max(0, t); player.play().catch(() => {}); } catch {} } };
  const tHost = $('#transcript', body);
  const draw = (q = '') => {
    tHost.innerHTML = '';
    (c.segments || []).forEach((s) => {
      const hit = q && s.text.toLowerCase().includes(q.toLowerCase());
      const node = el(`<div class="seg ${hit ? 'hit' : ''}" data-t="${s.t}" style="cursor:${audioURL ? 'pointer' : 'default'}"><div class="t">${fmtMMSS(s.t)}</div><div><div class="sp" style="flex:unset"><span class="dot" style="background:${(c.speakerColors || {})[s.speaker] || 'var(--brand)'}"></span><span class="who">${esc(s.speaker)}</span></div><div>${esc(s.text)}</div></div></div>`);
      if (audioURL) node.onclick = () => seekTo(s.t);
      tHost.appendChild(node);
    });
    if (q && !(c.segments || []).some((s) => s.text.toLowerCase().includes(q.toLowerCase()))) tHost.appendChild(el(`<div class="muted" style="padding:8px">No matches.</div>`));
  };
  draw();
  $('#tq', body).oninput = (e) => draw(e.target.value);
  $('#del', body).onclick = async () => {
    if (!confirm('Delete this lecture?')) return;
    if (audioURL) try { URL.revokeObjectURL(audioURL); } catch {}
    if (isLocal && window.LDB) await LDB.deleteLecture(id);
    // A synced local lecture also has a server copy under a different id; delete both
    // so it doesn't reappear in the feed.
    try { await api('/conversations/' + (c.serverId || id), { method: 'DELETE' }); } catch {}
    toast('Deleted'); location.hash = '#/home';
  };
  // Export: download Markdown, copy Markdown, or print / save-as-PDF.
  $('#export', body).onclick = () => { downloadText(safeFilename(c.title, '.md'), lectureToMarkdown(c), 'text/markdown'); toast('Downloaded Markdown.'); };
  $('#copy', body).onclick = async () => {
    const md = lectureToMarkdown(c);
    try { await navigator.clipboard.writeText(md); toast('Copied to clipboard.'); }
    catch { downloadText(safeFilename(c.title, '.md'), md, 'text/markdown'); toast('Clipboard blocked — downloaded instead.'); }
  };
  $('#print', body).onclick = () => { try { window.print(); } catch {} };
  const scrollT = (t) => { const n = tHost.querySelector(`[data-t="${t}"]`); if (n) { n.scrollIntoView({ behavior: 'smooth', block: 'center' }); n.classList.add('hit'); setTimeout(() => n.classList.remove('hit'), 1400); } };
  const tb = $('#tabbody', body);
  const views = {
    summary: () => (isProf ? teachingView(c, isLocal, () => setTab('summary')) : studyView(c, isLocal, () => setTab('summary'))),
    outline: () => { const d = el('<div class="pb"></div>'); if (!c.outline.length) d.appendChild(el('<span class="muted">No outline.</span>')); c.outline.forEach((o) => { const it = el(`<div class="outline-item"><span class="t">${fmtMMSS(o.t)}</span><span>${esc(o.label)}</span></div>`); it.onclick = () => { scrollT(o.t); seekTo(o.t); }; d.appendChild(it); }); return d; },
    actions: () => { const d = el('<div class="pb"></div>'); if (!c.actionItems.length) d.appendChild(el('<span class="muted">No action items.</span>')); c.actionItems.forEach((a) => d.appendChild(el(`<div class="ai-item"><span class="own">${esc(a.owner)}</span><span>${esc(a.text)}</span></div>`))); return d; },
    visuals: () => visualsTab(c, isLocal, () => setTab('visuals')),
    play: () => gamesView(c),
    ask: () => askPanel(c, isLocal),
  };
  const setTab = (n) => { $$('.tab', body).forEach((t) => t.classList.toggle('active', t.dataset.tab === n)); tb.innerHTML = ''; tb.appendChild(views[n]()); };
  $$('.tab', body).forEach((t) => (t.onclick = () => setTab(t.dataset.tab)));
  setTab('summary');
  if (nav !== navSeq) return;  // user already navigated elsewhere
  shell('#/home', body);
}

// Client-side Q&A fallback for locally-stored lectures (no server round-trip).
function clientAnswer(c, q) {
  const ql = q.toLowerCase();
  if (/action|todo|task|next step/.test(ql) && (c.actionItems || []).length) return 'Action items:\n' + c.actionItems.map((a) => `• ${a.owner}: ${a.text}`).join('\n');
  if (/summar|tl;?dr|about/.test(ql) && c.summary) return c.summary;
  const hits = (c.segments || []).filter((s) => ql.split(/\s+/).some((w) => w.length > 3 && s.text.toLowerCase().includes(w)));
  if (hits.length) return 'From the transcript:\n' + hits.slice(0, 3).map((s) => `[${Math.round(s.t)}s] ${s.speaker}: “${s.text}”`).join('\n');
  return 'I couldn’t find that in this transcript. For smarter answers, add a Claude API key in Study Preferences and ask again while online.';
}
function askPanel(c, isLocal) {
  const wrap = el(`<div class="chat"><div class="log" id="log"><div class="bubble ai">Ask anything about “${esc(c.title)}” — e.g. “explain the main idea” or “what are the action items?”</div></div><div class="composer"><input class="field" id="q" style="margin:0" placeholder="Ask about this lecture…"><button class="btn brand" id="send">Send</button></div></div>`);
  const log = $('#log', wrap), input = $('#q', wrap), sendB = $('#send', wrap);
  const add = (cls, text) => { const b = el(`<div class="bubble ${cls}"></div>`); b.textContent = text; log.appendChild(b); log.scrollTop = log.scrollHeight; return b; };
  const ask = async () => {
    const q = input.value.trim(); if (!q) return; add('me', q); input.value = '';
    const th = add('ai', '…'); sendB.disabled = true;
    try {
      // Prefer Claude (answers from the transcript) when online + a key is set;
      // otherwise fall back to the on-device keyword matcher so Ask works offline.
      let claudeOK = false;
      if (navigator.onLine) { try { claudeOK = !!((await api('/claude_status')).data || {}).configured; } catch {} }
      if (claudeOK) {
        const transcript = (c.segments || []).map((s) => s.text).join(' ').trim();
        const r = await api('/ask_lecture', { method: 'POST', body: { transcript, question: q, title: c.title } });
        if (r.status === 200 && r.data.answer) { th.textContent = r.data.answer; }
        else { th.textContent = clientAnswer(c, q) + '\n\n(Claude unavailable: ' + ((r.data && (r.data.detail || r.data.error)) || ('HTTP ' + r.status)) + ')'; }
      } else if (isLocal) {
        th.textContent = clientAnswer(c, q);
      } else {
        const { data } = await api('/conversations/' + c.id + '/ask', { method: 'POST', body: { question: q } });
        th.textContent = data.answer || clientAnswer(c, q);
      }
    } catch { th.textContent = clientAnswer(c, q); }
    finally { sendB.disabled = false; log.scrollTop = log.scrollHeight; }
  };
  sendB.onclick = ask; input.onkeydown = (e) => { if (e.key === 'Enter') ask(); };
  return wrap;
}

// ============================ STUDY GAMES ============================
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function celebrate(host) {
  try {
    const c = el('<div class="confetti"></div>'); const colors = ['#6d5efc', '#ff7a8a', '#ffb45e', '#12a66b', '#9a6bff'];
    for (let k = 0; k < 26; k++) { const p = document.createElement('i'); p.style.left = Math.random() * 100 + '%'; p.style.background = colors[k % colors.length]; p.style.animationDelay = (Math.random() * 0.35) + 's'; c.appendChild(p); }
    host.appendChild(c); setTimeout(() => { try { c.remove(); } catch {} }, 2300);
  } catch {}
}
// Build multiple-choice questions from the lecture's quiz (mcq items) plus
// auto-generated "which definition fits this term?" items from the key terms.
function keyTermMCQs(keyTerms) {
  const terms = (keyTerms || []).filter((k) => k && k.term && k.definition);
  if (terms.length < 2) return [];
  return terms.map((k) => {
    const distractors = shuffle(terms.filter((t) => t !== k).map((t) => t.definition)).slice(0, 3);
    const options = shuffle([k.definition, ...distractors]);
    return { q: `Which best defines “${k.term}”?`, options, answer: k.definition };
  });
}
function buildQuizQuestions(c) {
  const out = [];
  (c.quiz || []).forEach((q) => {
    if (q && q.type === 'mcq' && Array.isArray(q.options) && q.options.length >= 2 && q.answer) {
      const options = q.options.slice(); if (!options.includes(q.answer)) options.push(q.answer);
      out.push({ q: q.question, options: shuffle(options), answer: q.answer });
    }
  });
  out.push(...keyTermMCQs(c.keyTerms));
  return shuffle(out).slice(0, 10);
}

// Top-level Games hub — brain games are always playable here; study games live
// inside each lecture's Play tab (built from its key terms + quiz).
function renderGames() {
  const body = el(`<div class="feed">
    <div class="feed-head"><span class="datehdr">Games</span></div>
    <div class="panel"><div class="pb" id="ghub"></div></div>
  </div>`);
  shell('#/games', body);
  const d = $('#ghub', body);
  const open = (make) => { d.innerHTML = ''; d.appendChild(make(menu)); };
  function menu() {
    d.innerHTML = `
      <h4 class="study-sub" style="margin-top:0">Brain breaks · play anytime</h4>
      <div class="game-menu games-menu-3">
        <div class="game-card"><div class="game-emoji">🔢</div><h4>2048</h4><p>Merge tiles to reach 2048. Addictive.</p><button class="btn brand" id="g-2048">Play</button></div>
        <div class="game-card"><div class="game-emoji">🐍</div><h4>Snake</h4><p>Classic arcade — grow and survive.</p><button class="btn brand" id="g-snake">Play</button></div>
        <div class="game-card"><div class="game-emoji">🃏</div><h4>Memory Match</h4><p>Find the pairs — train your memory.</p><button class="btn brand" id="g-mem">Play</button></div>
      </div>
      <div class="hint" style="margin-top:18px">📚 <b>Study games</b> — Flashcards &amp; a Quiz Challenge built from a specific lecture — live in that lecture's <b>Play</b> tab once you generate its summary.</div>`;
    $('#g-2048', d).onclick = () => open(game2048);
    $('#g-snake', d).onclick = () => open(snakeGame);
    $('#g-mem', d).onclick = () => open(memoryGame);
  }
  menu();
}

function gamesView(c) {
  const d = el('<div class="pb"></div>');
  const hasTerms = Array.isArray(c.keyTerms) && c.keyTerms.filter((k) => k && k.term && k.definition).length >= 2;
  const hasQuiz = (Array.isArray(c.quiz) && c.quiz.some((q) => q && q.type === 'mcq')) || hasTerms;
  const open = (makeNode) => { d.innerHTML = ''; d.appendChild(makeNode(menu)); };
  function menu() {
    d.innerHTML = `
      <div class="games-sec">
        <h4 class="study-sub" style="margin-top:0">Study games · from this lecture</h4>
        <div class="game-menu">
          <div class="game-card"><div class="game-emoji">🧠</div><h4>Flashcards</h4><p>Flip the key terms and mark what you know.</p><button class="btn brand" id="g-flash" ${hasTerms ? '' : 'disabled'}>Play</button></div>
          <div class="game-card"><div class="game-emoji">⚡</div><h4>Quiz Challenge</h4><p>Beat the clock — score points and streaks.</p><button class="btn brand" id="g-quiz" ${hasQuiz ? '' : 'disabled'}>Play</button></div>
        </div>
        ${(!hasTerms && !hasQuiz) ? '<div class="hint" style="margin-top:8px">Generate a study summary (Summary tab) to unlock these.</div>' : ''}
      </div>
      <div class="games-sec">
        <h4 class="study-sub">Brain breaks · take five while you study</h4>
        <div class="game-menu games-menu-3">
          <div class="game-card"><div class="game-emoji">🔢</div><h4>2048</h4><p>Merge tiles to reach 2048.</p><button class="btn brand" id="g-2048">Play</button></div>
          <div class="game-card"><div class="game-emoji">🐍</div><h4>Snake</h4><p>Classic arcade — grow and survive.</p><button class="btn brand" id="g-snake">Play</button></div>
          <div class="game-card"><div class="game-emoji">🃏</div><h4>Memory Match</h4><p>Find the pairs.</p><button class="btn brand" id="g-mem">Play</button></div>
        </div>
      </div>`;
    const bindFlash = $('#g-flash', d); if (bindFlash && !bindFlash.disabled) bindFlash.onclick = () => open((back) => flashcardGame(c, back));
    const bindQuiz = $('#g-quiz', d); if (bindQuiz && !bindQuiz.disabled) bindQuiz.onclick = () => open((back) => quizChallenge(c, back));
    $('#g-2048', d).onclick = () => open(game2048);
    $('#g-snake', d).onclick = () => open(snakeGame);
    $('#g-mem', d).onclick = () => open(memoryGame);
  }
  menu();
  return d;
}

// ---- Brain-break mind games (not tied to lecture content) ----
function memoryGame(onBack) {
  const symbols = ['🧠', '📚', '⚡', '🎯', '🔬', '📐', '🎨', '🎵'];
  const deck = shuffle([...symbols, ...symbols]);
  let first = null, lock = false, moves = 0, matched = 0;
  const wrap = el('<div class="game"></div>');
  const win = () => {
    wrap.innerHTML = `<div class="game-end"><div class="game-emoji">🎉</div><h3>Solved!</h3><p>${moves} moves.</p><div class="row" style="justify-content:center;gap:10px"><button class="btn brand" id="again">Play again</button><button class="btn" id="back">Back</button></div></div>`;
    celebrate(wrap); $('#again', wrap).onclick = () => { shuffle(deck); first = null; lock = false; moves = 0; matched = 0; render(); }; $('#back', wrap).onclick = onBack;
  };
  const flip = (b, s) => {
    if (lock || b.classList.contains('matched') || b.classList.contains('flip')) return;
    b.classList.add('flip'); $('span', b).textContent = s;
    if (!first) { first = { b, s }; return; }
    moves++; const mv = $('#mv', wrap); if (mv) mv.textContent = 'Moves ' + moves;
    if (first.s === s) { first.b.classList.add('matched'); b.classList.add('matched'); first = null; matched++; if (matched === symbols.length) setTimeout(win, 450); }
    else { lock = true; const f = first; first = null; setTimeout(() => { [f.b, b].forEach((x) => { x.classList.remove('flip'); $('span', x).textContent = ''; }); lock = false; }, 720); }
  };
  const render = () => {
    wrap.innerHTML = `<div class="game-top"><span>Memory Match</span><span class="sp"></span><span class="q-score" id="mv">Moves 0</span><button class="btn" id="back" style="margin-left:10px">✕</button></div><div class="mem-grid" id="grid"></div>`;
    $('#back', wrap).onclick = onBack;
    const grid = $('#grid', wrap);
    deck.forEach((s) => { const b = el('<button class="mem-card"><span></span></button>'); b.onclick = () => flip(b, s); grid.appendChild(b); });
  };
  render();
  return wrap;
}

// 2048 — swipe/arrow-key tile merging. Great for short bursts while recording.
function game2048(onBack) {
  const SIZE = 4;
  let grid, score = 0, over = false, won = false;
  let best = Number(localStorage.getItem('ln_2048_best') || 0);
  const wrap = el('<div class="game g2048"></div>');
  const slide = (line) => { const a = line.filter((x) => x); for (let i = 0; i < a.length - 1; i++) { if (a[i] === a[i + 1]) { a[i] *= 2; score += a[i]; if (a[i] === 2048) won = true; a.splice(i + 1, 1); } } while (a.length < SIZE) a.push(0); return a; };
  const addTile = () => { const e = []; for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) if (!grid[r][c]) e.push([r, c]); if (!e.length) return; const [r, c] = e[Math.floor(Math.random() * e.length)]; grid[r][c] = Math.random() < 0.9 ? 2 : 4; };
  const canMove = () => { for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) { if (!grid[r][c]) return true; if (c < SIZE - 1 && grid[r][c] === grid[r][c + 1]) return true; if (r < SIZE - 1 && grid[r][c] === grid[r + 1][c]) return true; } return false; };
  const move = (dir) => {
    if (over) return; let moved = false;
    if (dir === 'l' || dir === 'r') { for (let r = 0; r < SIZE; r++) { let line = grid[r].slice(); if (dir === 'r') line.reverse(); const m = slide(line); if (dir === 'r') m.reverse(); for (let c = 0; c < SIZE; c++) { if (grid[r][c] !== m[c]) moved = true; grid[r][c] = m[c]; } } }
    else { for (let c = 0; c < SIZE; c++) { let line = []; for (let r = 0; r < SIZE; r++) line.push(grid[r][c]); if (dir === 'd') line.reverse(); const m = slide(line); if (dir === 'd') m.reverse(); for (let r = 0; r < SIZE; r++) { if (grid[r][c] !== m[r]) moved = true; grid[r][c] = m[r]; } } }
    if (moved) { addTile(); if (!canMove()) over = true; if (score > best) { best = score; try { localStorage.setItem('ln_2048_best', best); } catch {} } draw(); }
  };
  const draw = () => {
    wrap.innerHTML = `<div class="game-top"><span>2048</span><span class="sp"></span><span class="q-score">Score ${score} · Best ${best}</span><button class="btn" id="back" style="margin-left:10px">✕</button></div>
      <div class="g2048-board">${grid.flat().map((v) => `<div class="t2048 v${v}">${v || ''}</div>`).join('')}</div>
      <div class="g2048-hint">Arrow keys / swipe${over ? ' · <b>Game over</b>' : won ? ' · <b>2048! keep going</b>' : ''}</div>
      <div class="game-actions" style="margin-top:8px"><button class="btn" id="new">New game</button>${over ? '<button class="btn brand" id="again">Try again</button>' : ''}</div>`;
    $('#back', wrap).onclick = onBack; $('#new', wrap).onclick = start; const ag = $('#again', wrap); if (ag) ag.onclick = start;
  };
  const start = () => { grid = Array.from({ length: SIZE }, () => Array(SIZE).fill(0)); score = 0; over = false; won = false; addTile(); addTile(); draw(); };
  const onKey = (e) => { if (!document.body.contains(wrap)) { document.removeEventListener('keydown', onKey); return; } if (/^(input|textarea|select)$/i.test((document.activeElement || {}).tagName)) return; const map = { ArrowLeft: 'l', ArrowRight: 'r', ArrowUp: 'u', ArrowDown: 'd' }; const d = map[e.key]; if (d) { e.preventDefault(); move(d); } };
  document.addEventListener('keydown', onKey);
  let sx = null, sy = null;
  wrap.addEventListener('touchstart', (e) => { const t = e.touches[0]; sx = t.clientX; sy = t.clientY; }, { passive: true });
  wrap.addEventListener('touchend', (e) => { if (sx == null) return; const t = e.changedTouches[0]; const dx = t.clientX - sx, dy = t.clientY - sy; if (Math.abs(dx) > 24 || Math.abs(dy) > 24) { if (Math.abs(dx) > Math.abs(dy)) move(dx > 0 ? 'r' : 'l'); else move(dy > 0 ? 'd' : 'u'); } sx = sy = null; });
  start();
  return wrap;
}

// Snake — classic arcade on a canvas, steered with the arrow keys.
function snakeGame(onBack) {
  const N = 15, CELL = 15;
  let snake, dir, nextDir, food, score = 0, loop = null, dead = false;
  let best = Number(localStorage.getItem('ln_snake_best') || 0);
  const wrap = el('<div class="game gsnake"></div>');
  const stop = () => { if (loop) { clearInterval(loop); loop = null; } };
  const placeFood = () => { do { food = { x: Math.floor(Math.random() * N), y: Math.floor(Math.random() * N) }; } while (snake.some((s) => s.x === food.x && s.y === food.y)); };
  const paint = () => {
    const cv = $('#cv', wrap); if (!cv) return; const g = cv.getContext('2d');
    g.fillStyle = getComputedStyle(cv).getPropertyValue('background-color') || '#fff'; g.fillRect(0, 0, N * CELL, N * CELL);
    g.fillStyle = '#ff7a8a'; g.fillRect(food.x * CELL + 1, food.y * CELL + 1, CELL - 2, CELL - 2);
    snake.forEach((s, i) => { g.fillStyle = i === 0 ? '#6d5efc' : '#9a6bff'; g.fillRect(s.x * CELL + 1, s.y * CELL + 1, CELL - 2, CELL - 2); });
  };
  const render = () => {
    wrap.innerHTML = `<div class="game-top"><span>Snake</span><span class="sp"></span><span class="q-score">Score ${score} · Best ${best}</span><button class="btn" id="back" style="margin-left:10px">✕</button></div>
      <canvas id="cv" width="${N * CELL}" height="${N * CELL}" class="snake-cv"></canvas>
      <div class="g2048-hint">Arrow keys to steer${dead ? ' · <b>Game over</b>' : ''}</div>
      ${dead ? '<div class="game-actions" style="margin-top:8px"><button class="btn brand" id="again">Play again</button></div>' : ''}`;
    $('#back', wrap).onclick = () => { stop(); onBack(); }; const ag = $('#again', wrap); if (ag) ag.onclick = start;
    paint();
  };
  const step = () => {
    if (!document.body.contains(wrap)) { stop(); return; }
    dir = nextDir;
    const head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };
    if (head.x < 0 || head.y < 0 || head.x >= N || head.y >= N || snake.some((s) => s.x === head.x && s.y === head.y)) {
      dead = true; stop(); if (score > best) { best = score; try { localStorage.setItem('ln_snake_best', best); } catch {} } if (score >= 10) celebrate(wrap); render(); return;
    }
    snake.unshift(head);
    if (head.x === food.x && head.y === food.y) { score++; placeFood(); } else snake.pop();
    paint();
  };
  const onKey = (e) => { if (!document.body.contains(wrap)) { document.removeEventListener('keydown', onKey); stop(); return; } if (/^(input|textarea|select)$/i.test((document.activeElement || {}).tagName)) return; const m = { ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 }, ArrowUp: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 } }; const nd = m[e.key]; if (nd) { e.preventDefault(); if (nd.x !== -dir.x || nd.y !== -dir.y) nextDir = nd; } };
  const start = () => { snake = [{ x: 7, y: 7 }, { x: 6, y: 7 }, { x: 5, y: 7 }]; dir = { x: 1, y: 0 }; nextDir = dir; score = 0; dead = false; placeFood(); stop(); loop = setInterval(step, 130); render(); };
  document.addEventListener('keydown', onKey);
  start();
  return wrap;
}

function flashcardGame(c, onBack) {
  const cards = shuffle(c.keyTerms.filter((k) => k && k.term && k.definition).map((k) => ({ term: k.term, definition: k.definition })));
  let i = 0, known = 0;
  const wrap = el('<div class="game"></div>');
  const draw = () => {
    if (i >= cards.length) {
      wrap.innerHTML = `<div class="game-end"><div class="game-emoji">🎉</div><h3>Nice work!</h3><p>You knew ${known} of ${cards.length} terms.</p><div class="row" style="justify-content:center;gap:10px"><button class="btn brand" id="again">Play again</button><button class="btn" id="back">Back</button></div></div>`;
      celebrate(wrap); $('#again', wrap).onclick = () => { i = 0; known = 0; shuffle(cards); draw(); }; $('#back', wrap).onclick = onBack; return;
    }
    const k = cards[i];
    wrap.innerHTML = `<div class="game-top"><span>Card ${i + 1} / ${cards.length}</span><span class="sp"></span><button class="btn" id="back">✕</button></div>
      <div class="flashcard" id="fc"><div class="fc-inner"><div class="fc-face fc-front"><div class="fc-hint">TERM · TAP TO FLIP</div><div class="fc-text">${esc(k.term)}</div></div><div class="fc-face fc-back"><div class="fc-hint">DEFINITION</div><div class="fc-text">${esc(k.definition)}</div></div></div></div>
      <div class="game-actions"><button class="btn" id="review">↻ Review</button><button class="btn brand" id="got">✓ Got it</button></div>`;
    const fc = $('#fc', wrap); fc.onclick = () => fc.classList.toggle('flipped');
    $('#review', wrap).onclick = () => { i++; draw(); };
    $('#got', wrap).onclick = () => { known++; i++; draw(); };
    $('#back', wrap).onclick = onBack;
  };
  draw();
  return wrap;
}

function quizChallenge(c, onBack) {
  const qs = buildQuizQuestions(c);
  const wrap = el('<div class="game"></div>');
  let i = 0, score = 0, streak = 0, best = 0, timer = null;
  const TOTAL = 15;
  const stop = () => { if (timer) { clearInterval(timer); timer = null; } };
  const draw = () => {
    stop();
    if (!qs.length || i >= qs.length) {
      wrap.innerHTML = `<div class="game-end"><div class="game-emoji">🏆</div><h3>Final score: ${score}</h3><p>Best streak: ${best} · ${qs.length} question${qs.length === 1 ? '' : 's'}</p><div class="row" style="justify-content:center;gap:10px"><button class="btn brand" id="again">Play again</button><button class="btn" id="back">Back</button></div></div>`;
      if (score > 0) celebrate(wrap); $('#again', wrap).onclick = () => { i = 0; score = 0; streak = 0; best = 0; shuffle(qs); draw(); }; $('#back', wrap).onclick = onBack; return;
    }
    const q = qs[i]; let timeLeft = TOTAL;
    wrap.innerHTML = `<div class="game-top"><span>Q ${i + 1} / ${qs.length}</span><span class="sp"></span><span class="q-score">Score ${score} · 🔥 ${streak}</span><button class="btn" id="back" style="margin-left:10px">✕</button></div>
      <div class="q-timer"><div class="q-timer-fill" id="tf"></div></div>
      <div class="q-question">${esc(q.q)}</div>
      <div class="q-opts">${q.options.map((o) => `<button class="q-opt">${esc(o)}</button>`).join('')}</div>`;
    $('#back', wrap).onclick = () => { stop(); onBack(); };
    const tf = $('#tf', wrap);
    const answer = (chosen) => {
      stop();
      if (chosen === q.answer) { score += 10 + Math.max(0, Math.round(timeLeft)); streak++; best = Math.max(best, streak); } else { streak = 0; }
      $$('.q-opt', wrap).forEach((b) => { b.disabled = true; if (b.textContent === q.answer) b.classList.add('correct'); else if (b.textContent === chosen) b.classList.add('wrong'); });
      setTimeout(() => { i++; draw(); }, 1100);
    };
    $$('.q-opt', wrap).forEach((b) => (b.onclick = () => answer(b.textContent)));
    timer = setInterval(() => { if (!document.body.contains(wrap)) { stop(); return; } timeLeft -= 0.1; if (tf) tf.style.width = Math.max(0, timeLeft / TOTAL * 100) + '%'; if (timeLeft <= 0) answer(null); }, 100);
  };
  draw();
  return wrap;
}

// ============================ VISUAL SLIDES ============================
const MERMAID_CDN = 'https://cdn.jsdelivr.net/npm/mermaid@11.15.0/dist/mermaid.min.js';
// One listener resizes/hides each sandboxed diagram iframe by matching its window.
if (!window.__mmListener) {
  window.__mmListener = true;
  window.addEventListener('message', (e) => {
    const d = e.data; if (!d || typeof d !== 'object') return;
    document.querySelectorAll('iframe.mermaid-frame').forEach((f) => {
      if (f.contentWindow === e.source) { if (d.__mmh) f.style.height = Math.min(440, Math.max(70, d.__mmh + 14)) + 'px'; if (d.__mmfail) f.style.display = 'none'; }
    });
  });
}
// Render untrusted (LLM-generated) mermaid code INSIDE a sandboxed iframe: no
// same-origin, so it can't touch the app even if the code is malicious.
function mermaidIframe(code) {
  const fr = el('<iframe class="mermaid-frame" sandbox="allow-scripts" referrerpolicy="no-referrer" loading="lazy"></iframe>');
  const dark = document.documentElement.getAttribute('data-theme') === 'dark' || (window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
  fr.srcdoc = '<!doctype html><meta charset="utf-8"><style>body{margin:0;background:transparent;font-family:system-ui,sans-serif}#d{display:flex;justify-content:center;padding:6px}</style>'
    + '<div id="d" class="mermaid">' + esc(code) + '</div>'
    + '<scr' + 'ipt src="' + MERMAID_CDN + '"></scr' + 'ipt>'
    + '<scr' + 'ipt>try{mermaid.initialize({startOnLoad:false,securityLevel:"strict",theme:"' + (dark ? 'dark' : 'default') + '"});mermaid.run({querySelector:"#d"}).then(function(){parent.postMessage({__mmh:document.getElementById("d").scrollHeight},"*");}).catch(function(){parent.postMessage({__mmfail:1},"*");});}catch(e){parent.postMessage({__mmfail:1},"*");}</scr' + 'ipt>';
  return fr;
}
async function fetchSlideImage(q) {
  if (!q) return null;
  try { const r = await api('/image?q=' + encodeURIComponent(q)); if (r.status === 200 && r.data && r.data.url) return r.data; } catch {}
  return null;
}
// Persist a rating signal that personalizes future slide prompts.
async function recordVisualRating(delta, chip) {
  try {
    const vp = (await LDB.getVisualPrefs()) || {};
    if (chip) vp[chip] = (vp[chip] || 0) + 1;
    else if (delta > 0) vp.likes = (vp.likes || 0) + 1;
    else vp.dislikes = (vp.dislikes || 0) + 1;
    await LDB.setVisualPrefs(vp); state.visualPrefs = vp;
  } catch {}
}
// Offline / no-key fallback: plain text concept-cards from a transcript chunk.
function localSlides(text) {
  const sentences = String(text || '').split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter((s) => s.length > 24);
  if (!sentences.length) return [];
  const title = sentences[0].split(/\s+/).slice(0, 7).join(' ') + '…';
  return [{ topic: 'Notes', title, bullets: sentences.slice(0, 5), explainer: '', diagram: { type: 'none', code: '' }, imageQuery: '', basic: true }];
}
// Navigable slideshow over `deck`. Returns { add, setStatus, stop }.
function slideshow(host, deck, opts) {
  opts = opts || {};
  let idx = (opts.live && deck.length) ? deck.length - 1 : 0, auto = false, autoTimer = null, statusText = opts.status || '';
  const clearAuto = () => { if (autoTimer) { clearInterval(autoTimer); autoTimer = null; } };
  const startAuto = () => { clearAuto(); autoTimer = setInterval(() => { if (!document.body.contains(host)) { clearAuto(); return; } if (idx < deck.length - 1) { idx++; render(); } else { auto = false; clearAuto(); render(); } }, 25000); };
  const go = (n) => { if (!deck.length) return; idx = Math.max(0, Math.min(deck.length - 1, n)); render(); };
  async function paintImage(slide, wrap) {
    if (slide._img === undefined) { slide._img = null; const im = await fetchSlideImage(slide.imageQuery); if (!document.body.contains(host)) return; slide._img = im; }
    wrap.innerHTML = (slide._img && slide._img.url) ? `<img class="slide-img" src="${esc(slide._img.url)}" alt="" loading="lazy"><div class="slide-attr">${esc(slide._img.attribution || '')}</div>` : '';
  }
  function render() {
    if (!deck.length) { host.innerHTML = `<div class="slide-empty">${esc(statusText || 'No slides yet.')}</div>`; return; }
    if (idx >= deck.length) idx = deck.length - 1;
    const s = deck[idx];
    host.innerHTML = `
      <div class="slide-top"><span class="slide-count">Slide ${idx + 1} / ${deck.length}${opts.live ? ' · live' : ''}</span><span class="sp"></span><span class="hint slide-status">${esc(statusText)}</span></div>
      <div class="slide-card">
        <div class="slide-img-wrap"></div>
        <h3 class="slide-title">${esc(s.title)}</h3>
        ${s.explainer ? `<div class="slide-explainer md">${mdLite(s.explainer)}</div>` : ''}
        ${(Array.isArray(s.bullets) && s.bullets.length) ? `<ul class="slide-bullets">${s.bullets.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>` : ''}
        <div class="slide-diagram"></div>
        <div class="slide-rate"><button class="chip" data-r="up">👍</button><button class="chip" data-r="down">👎</button><span class="sp"></span><button class="chip" data-c="diagrams">+diagrams</button><button class="chip" data-c="simpler">simpler</button><button class="chip" data-c="detail">+detail</button><button class="chip" data-c="images">+images</button><span class="rate-ack" id="rack"></span></div>
      </div>
      <div class="slide-nav"><button class="btn" id="sprev">‹ Prev</button><button class="btn" id="sauto">${auto ? '⏸ Auto' : '▶ Auto'}</button><button class="btn brand" id="snext">Next ›</button></div>
      <div class="hint" style="margin-top:8px;text-align:center">AI-interpreted from the live transcript</div>`;
    paintImage(s, $('.slide-img-wrap', host));
    if (s.diagram && s.diagram.type === 'mermaid' && s.diagram.code) { try { $('.slide-diagram', host).appendChild(mermaidIframe(s.diagram.code)); } catch {} }
    const ack = $('#rack', host);
    const pauseAuto = () => { if (auto) { auto = false; clearAuto(); } };
    $('#sprev', host).onclick = () => { pauseAuto(); go(idx - 1); };
    $('#snext', host).onclick = () => { pauseAuto(); go(idx + 1); };
    $('#sauto', host).onclick = () => { auto = !auto; if (auto) startAuto(); else clearAuto(); render(); };
    $$('.chip[data-r]', host).forEach((b) => (b.onclick = () => { const up = b.dataset.r === 'up'; s.rating = up ? 1 : -1; recordVisualRating(up ? 1 : -1, null); if (opts.onChange) opts.onChange(); if (ack) ack.textContent = up ? 'thanks' : 'noted'; }));
    $$('.chip[data-c]', host).forEach((b) => (b.onclick = () => { s.chips = (s.chips || []).concat(b.dataset.c); recordVisualRating(1, b.dataset.c); if (opts.onChange) opts.onChange(); if (ack) ack.textContent = 'noted'; }));
    if (auto) startAuto();
  }
  render();
  return {
    add(slides) { if (!Array.isArray(slides) || !slides.length) return; const wasEnd = idx >= deck.length - 1; deck.push.apply(deck, slides); if (opts.cap && deck.length > opts.cap) deck.splice(0, deck.length - opts.cap); if (wasEnd) idx = deck.length - 1; render(); },
    setStatus(t) { statusText = t || ''; const c = $('.slide-status', host); if (c) c.textContent = statusText; else render(); },
    stop() { clearAuto(); },
  };
}

// Detail-page Visuals tab: replay the saved deck + regenerate a clean deck.
function visualsTab(c, isLocal, rerender) {
  const d = el('<div class="pb"></div>');
  const bar = el(`<div class="study-head"><span class="badge">Visual slides</span><div class="sp"></div><button class="btn" id="vregen">✨ Regenerate clean deck</button></div>`);
  const host = el('<div class="slidedeck"></div>');
  const msg = el('<div class="hint" id="vmsg" style="margin-top:8px"></div>');
  d.appendChild(bar); d.appendChild(host); d.appendChild(msg);
  const persist = async () => { if (window.LDB) { try { await LDB.putLecture(c); } catch {} } };
  if (Array.isArray(c.slides) && c.slides.length) slideshow(host, c.slides.slice(), { live: false, onChange: persist });
  else host.innerHTML = '<div class="slide-empty">No slides yet. Open the Visuals panel while recording, or regenerate a clean deck from the transcript.</div>';
  $('#vregen', bar).onclick = async () => {
    const btn = $('#vregen', bar); btn.disabled = true;
    if (!navigator.onLine) { msg.textContent = 'You’re offline — connect to regenerate.'; btn.disabled = false; return; }
    let status; try { status = (await api('/claude_status')).data || {}; } catch { status = {}; }
    if (!status.configured) { msg.textContent = 'Add a Claude key in Study Preferences to regenerate.'; btn.disabled = false; return; }
    const transcript = (c.segments || []).map((s) => s.text).join(' ').trim();
    if (!transcript) { msg.textContent = 'No transcript to build from.'; btn.disabled = false; return; }
    msg.textContent = 'Regenerating from the full transcript…';
    let r; try { r = await api('/slides', { method: 'POST', body: { transcript, prefs: state.prefs, visualPrefs: state.visualPrefs } }); } catch { msg.textContent = 'Network error.'; btn.disabled = false; return; }
    if (r.status !== 200 || !r.data || !Array.isArray(r.data.slides) || !r.data.slides.length) { msg.textContent = 'Could not regenerate: ' + ((r.data && (r.data.detail || r.data.error)) || ('HTTP ' + r.status)); btn.disabled = false; return; }
    c.slides = r.data.slides; await persist(); msg.textContent = 'Done ✓'; rerender();
  };
  return d;
}

// ============================ RECORD ============================
const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
const WHISPER_MODELS = {
  'Xenova/whisper-tiny.en': 'Whisper tiny · ~40 MB · fastest',
  'Xenova/whisper-base.en': 'Whisper base · ~145 MB · recommended',
  'Xenova/whisper-small.en': 'Whisper small · ~460 MB · most accurate',
};

// Assemble the final audio Blob from a MediaRecorder, never hanging the Save.
function recorderBlob(mediaRec, chunks, mime) {
  return new Promise((resolve) => {
    const build = () => (chunks.length ? new Blob(chunks, { type: mime }) : null);
    if (!mediaRec || mediaRec.state === 'inactive') return resolve(build());
    let done = false; const fin = () => { if (done) return; done = true; resolve(build()); };
    mediaRec.onstop = fin; setTimeout(fin, 2500);
    try { mediaRec.stop(); } catch { fin(); }
  });
}

// Shared save: write the lecture locally (offline-safe) and best-effort sync to
// the server. Returns { ok, targetId } or { ok:false, reason }.
async function saveRecording(segs, audio, durationSec, title, courseId, slides) {
  const id = 'c_rec_' + Math.random().toString(16).slice(2, 10);
  const sentences = segs.map((s) => s.text).join(' ').split(/(?<=[.!?])\s+/).filter(Boolean);
  const lecture = {
    id, courseId: courseId || null, title: title || 'Live Recording',
    createdAt: new Date().toISOString(), durationSec,
    owner: 'You', speakers: ['You'], speakerColors: { You: '#f6a21e' },
    segments: segs, outline: segs.slice(0, 3).map((s) => ({ t: s.t, label: s.text.slice(0, 48) })),
    actionItems: [], summary: sentences.slice(0, 2).join(' '),
    slides: Array.isArray(slides) ? slides.map((s) => ({ topic: s.topic, title: s.title, bullets: s.bullets, explainer: s.explainer, diagram: s.diagram, imageQuery: s.imageQuery, rating: s.rating || 0, chips: s.chips || [] })) : [],
    status: 'transcribed', audio, audioType: audio ? audio.type : null, synced: false,
  };
  let savedLocal = false, targetId = id;
  if (window.LDB && LDB.available()) { try { savedLocal = await LDB.putLecture(lecture); } catch { savedLocal = false; } }
  try {
    const { status, data } = await api('/speeches', { method: 'POST', body: { title: lecture.title, durationSec, segments: segs } });
    if (status === 200) { if (savedLocal) { lecture.synced = true; lecture.serverId = data.speech_id; try { await LDB.putLecture(lecture); } catch {} } else targetId = data.speech_id; }
    else if (!savedLocal) return { ok: false, reason: 'Save failed (offline, and local storage unavailable).' };
  } catch { if (!savedLocal) return { ok: false, reason: 'Offline and local storage unavailable — could not save.' }; }
  return { ok: true, targetId };
}

function renderRecord() {
  const whisperOK = !!(window.Whisper && Whisper.supported());
  const hasMic = !!SpeechRec;
  let engine = localStorage.getItem('ln_engine') || (hasMic ? 'browser' : (whisperOK ? 'whisper' : 'scripted'));
  if (engine === 'whisper' && !whisperOK) engine = hasMic ? 'browser' : 'scripted';
  if (engine === 'browser' && !hasMic) engine = whisperOK ? 'whisper' : 'scripted';

  const callOK = whisperOK && !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia);
  if (engine === 'call' && !callOK) engine = whisperOK ? 'whisper' : (hasMic ? 'browser' : 'scripted');
  const curModel = localStorage.getItem('ln_whisper_model') || 'Xenova/whisper-base.en';
  const modelPicker = ((engine === 'whisper' || engine === 'call') && whisperOK) ? `<div class="model-row" style="display:flex;align-items:center;gap:8px;margin-top:8px;font-size:13px;color:var(--muted)">
    <label for="wmodel" style="font-weight:600">Accuracy / speed</label>
    <select id="wmodel" style="padding:5px 8px;border-radius:8px;border:1px solid var(--line);background:var(--bg);color:var(--ink)">
      ${Object.entries(WHISPER_MODELS).map(([k, v]) => `<option value="${k}" ${k === curModel ? 'selected' : ''}>${esc(v)}</option>`).join('')}
    </select>
    <span style="font-size:12px">bigger = more accurate, slower, larger one-time download</span>
  </div>` : '';
  const engineBar = (hasMic || whisperOK) ? `<div class="engine-bar">
    ${hasMic ? `<button class="eng ${engine === 'browser' ? 'on' : ''}" data-eng="browser">Browser · fast</button>` : ''}
    ${whisperOK ? `<button class="eng ${engine === 'whisper' ? 'on' : ''}" data-eng="whisper">Whisper · on-device</button>` : ''}
    ${callOK ? `<button class="eng ${engine === 'call' ? 'on' : ''}" data-eng="call">🎧 Capture a call</button>` : ''}
  </div>${modelPicker}` : '';
  const intro = engine === 'call'
    ? 'Press <b>Start</b>, pick your <b>Meet / Zoom tab</b> and check <b>“Share tab audio”</b> — the whole call (everyone) is transcribed on your device, even with headphones on.<br><span style="font-size:12px">Captures the call audio + your mic. Nothing leaves your device.</span>'
    : engine === 'whisper'
    ? 'Press <b>Start</b> and speak — transcribed on your device with Whisper.<br><span style="font-size:12px">First run downloads the model once (then works fully offline). Everything stays on your device.</span>'
    : hasMic ? 'Press <b>Start</b> and speak — your microphone is transcribed live in your browser.<br><span style="font-size:12px">Fast, but uses the browser’s online speech service. Switch to Whisper for offline.</span>'
    : 'Your browser has no speech recognition, so this plays a <b>scripted demo</b>.';

  const curCourse = (() => { try { return localStorage.getItem('ln_record_course') || 'crs_general'; } catch { return 'crs_general'; } })();
  const curTitle = (() => { try { return localStorage.getItem('ln_record_title') || ''; } catch { return ''; } })();
  const courseOpts = (state.courses || []).map((c) => `<option value="${c.id}" ${c.id === curCourse ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
  const recMeta = `<div class="rec-meta" style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:10px">
    <input id="rec-title" placeholder="Lecture title (optional)" value="${esc(curTitle)}" style="flex:1;min-width:180px;padding:8px 10px;border-radius:8px;border:1px solid var(--line);background:var(--bg);color:var(--ink)">
    <label style="display:flex;align-items:center;gap:6px;font-size:13px;color:var(--muted)">Course
      <select id="rec-course" style="padding:8px 10px;border-radius:8px;border:1px solid var(--line);background:var(--bg);color:var(--ink)">${courseOpts}</select>
    </label>
  </div>`;
  const body = el(`<div class="rec-wrap"><div class="rec-stage">
    ${engineBar}
    ${recMeta}
    <div class="rec-head"><span class="pulse hidden" id="pulse"></span><div id="status" style="font-weight:700">Ready to record</div><div class="sp"></div><div class="timer" id="timer">0:00</div></div>
    <div class="rec-live-grid">
      <div class="rec-col">
        <div class="rec-col-head">${ICON.mic}<span>Live transcript</span></div>
        <div class="rec-live" id="live"><div class="empty">${intro}</div></div>
      </div>
      <div class="rec-col rec-notes-col">
        <div class="rec-col-head">
          <div class="rp-tabs"><button class="rp-tab on" data-p="notes">✦ Notes</button><button class="rp-tab" data-p="visuals">✨ Visuals</button><button class="rp-tab" data-p="games">🎮 Games</button></div>
          <span class="sp"></span><span class="hint" id="notelevel"></span>
        </div>
        <div class="rec-notes" id="notes"><div class="empty note-empty">Key points appear here as you speak — short notes in your study level.</div></div>
        <div class="rec-visuals hidden" id="recvisuals"></div>
        <div class="rec-games hidden" id="recgames"></div>
      </div>
    </div>
    <div class="rec-controls"><button class="btn brand" id="start">${ICON.mic} ${engine === 'scripted' ? 'Start demo' : 'Start recording'}</button><button class="btn" id="pause" disabled>Pause</button><button class="btn" id="stop" disabled style="margin-left:auto">Stop & save</button></div>
  </div></div>`);
  shell('#/record', body);
  $$('.eng', body).forEach((b) => (b.onclick = () => { runViewCleanup(); localStorage.setItem('ln_engine', b.dataset.eng); renderRecord(); }));
  const wmodel = $('#wmodel', body);
  if (wmodel) wmodel.onchange = () => { runViewCleanup(); localStorage.setItem('ln_whisper_model', wmodel.value); toast('Model set — downloads on next Start if new.'); renderRecord(); };
  const live = $('#live', body), notes = $('#notes', body), startB = $('#start', body), pauseB = $('#pause', body), stopB = $('#stop', body), pulse = $('#pulse', body), st = $('#status', body), tm = $('#timer', body);
  let t0, timer;
  const tick = () => (tm.textContent = fmtMMSS((Date.now() - t0) / 1000));

  // Live notes: condense each transcript segment into a short bullet, with
  // length tuned to the student's study level (shorter for earlier levels).
  const noteLevel = (state.prefs && state.prefs.level) || 'ug';
  const levelLabel = (STUDY_LEVELS.find((x) => x.id === noteLevel) || {}).label || '';
  const nl = $('#notelevel', body); if (nl && levelLabel) nl.textContent = levelLabel + ' level';
  let lastNoteKey = '';
  const condenseNote = (text) => {
    let t = String(text || '').trim().replace(/\s+/g, ' ');
    if (t.length < 14) return null;                 // skip short filler utterances
    t = t.replace(/^(so|and so|and|um+|uh+|okay|ok|now|right|well|you know|basically|like|i mean)[,\s]+/i, '');
    const maxWords = noteLevel === 'hs' ? 11 : noteLevel === 'grad' ? 22 : 15;
    const words = t.split(' ');
    if (words.length > maxWords) t = words.slice(0, maxWords).join(' ') + '…';
    return t.charAt(0).toUpperCase() + t.slice(1);
  };
  const appendNote = (s) => {
    const n = condenseNote(s && s.text);
    if (!n) return;
    const key = n.toLowerCase().slice(0, 24);
    if (key === lastNoteKey) return;                // skip near-duplicate of the last note
    lastNoteKey = key;
    const empty = $('.note-empty', notes); if (empty) empty.remove();
    notes.appendChild(el(`<div class="note-item">${esc(n)}</div>`));
    notes.scrollTop = notes.scrollHeight;
  };
  // Live Visual Slides state (batched generation from the growing transcript).
  let recFullText = '', recDeck = [], recSlideshow = null, recGenLoop = null, recGenBusy = false, recLastGenLen = 0, recLastGenAt = 0, recKeyOK = null;
  const stopVisuals = () => { if (recGenLoop) { clearInterval(recGenLoop); recGenLoop = null; } if (recSlideshow) { try { recSlideshow.stop(); } catch {} } };
  const appendSeg = (s) => {
    live.appendChild(el(`<div class="seg"><div class="t">${fmtMMSS(s.t)}</div><div><div class="sp" style="flex:unset"><span class="dot" style="background:var(--brand)"></span><span class="who">${esc(s.speaker)}</span></div><div>${esc(s.text)}</div></div></div>`));
    live.scrollTop = live.scrollHeight;
    appendNote(s);
    if (s && s.text) recFullText += ' ' + s.text;
  };
  const recCourseSel = $('#rec-course', body), recTitleInp = $('#rec-title', body);
  if (recCourseSel) recCourseSel.onchange = () => { try { localStorage.setItem('ln_record_course', recCourseSel.value); } catch {} };
  // Persist the typed title too, so toggling engine/model (which re-renders the
  // whole view) doesn't blank it. Cleared after a successful save.
  if (recTitleInp) recTitleInp.oninput = () => { try { localStorage.setItem('ln_record_title', recTitleInp.value); } catch {} };
  const recMetaVals = () => ({ title: (recTitleInp && recTitleInp.value.trim()) || '', courseId: (recCourseSel && recCourseSel.value) || null });
  const clearRecMeta = () => { try { localStorage.removeItem('ln_record_title'); } catch {} };

  // Right panel toggles Notes / Visuals / Games — play or watch slides while the
  // lecture keeps recording. Notes keep accumulating in the background when hidden.
  const recgames = $('#recgames', body), recvisuals = $('#recvisuals', body);
  const recGamesMenu = () => {
    recgames.innerHTML = `<div class="rg-pick">
        <button class="btn brand rg-b" data-g="2048">🔢 2048</button>
        <button class="btn brand rg-b" data-g="snake">🐍 Snake</button>
        <button class="btn brand rg-b" data-g="mem">🃏 Memory</button>
      </div><div class="hint" style="margin-top:10px;text-align:center">Recording keeps running — your notes are still being captured.</div>`;
    $$('.rg-b', recgames).forEach((b) => (b.onclick = () => { const g = b.dataset.g; recgames.innerHTML = ''; recgames.appendChild((g === '2048' ? game2048 : g === 'snake' ? snakeGame : memoryGame)(recGamesMenu)); }));
  };

  // Live Visual Slides: build a deck in batched bursts from the growing transcript.
  const GEN_CHARS = 3600, GEN_TIME_MS = 210000; // ~600 words, or ~3.5 min if slower
  const startVisuals = async () => {
    if (recSlideshow) return;
    recSlideshow = slideshow(recvisuals, recDeck, { live: true, cap: 60, status: 'Listening… visual slides will appear as topics build.' });
    if (recKeyOK === null) { try { recKeyOK = !!((await api('/claude_status')).data || {}).configured; } catch { recKeyOK = false; } }
    if (!document.body.contains(recvisuals)) return;
    if (!navigator.onLine) recSlideshow.setStatus('Offline — basic slides from the transcript; reconnect for rich visuals.');
    else if (!recKeyOK) recSlideshow.setStatus('Add a Claude key in Study Prefs for AI visuals; basic slides meanwhile.');
    recLastGenAt = Date.now();
    if (!recGenLoop) recGenLoop = setInterval(genTick, 12000);
    genTick();
  };
  const genTick = async () => {
    if (!document.body.contains(recvisuals)) { clearInterval(recGenLoop); recGenLoop = null; return; }
    if (recGenBusy) return;
    const newLen = recFullText.length - recLastGenLen;
    const enough = newLen >= GEN_CHARS || ((Date.now() - recLastGenAt) >= GEN_TIME_MS && newLen >= 400);
    if (!enough) return;
    const chunk = recFullText.slice(recLastGenLen).trim();
    if (!chunk) return;
    recGenBusy = true; recLastGenLen = recFullText.length; recLastGenAt = Date.now();
    try {
      if (navigator.onLine && recKeyOK) {
        const recentTitles = recDeck.slice(-8).map((s) => s.title);
        const r = await api('/slides', { method: 'POST', body: { transcript: chunk, recentTitles, prefs: state.prefs, visualPrefs: state.visualPrefs } });
        if (!document.body.contains(recvisuals)) return;
        if (r.status === 200 && r.data && Array.isArray(r.data.slides) && r.data.slides.length) { recSlideshow.add(r.data.slides); recSlideshow.setStatus(''); }
        else if (r.status === 400) { recKeyOK = false; recSlideshow.add(localSlides(chunk)); recSlideshow.setStatus('Add a Claude key for AI visuals.'); }
        else recSlideshow.setStatus('Slides paused: ' + ((r.data && (r.data.detail || r.data.error)) || ('HTTP ' + r.status)));
      } else if (document.body.contains(recvisuals)) {
        recSlideshow.add(localSlides(chunk));
      }
    } catch { if (document.body.contains(recvisuals)) recSlideshow.setStatus('Slides paused (network).'); }
    finally { recGenBusy = false; }
  };

  $$('.rp-tab', body).forEach((t) => (t.onclick = () => {
    $$('.rp-tab', body).forEach((x) => x.classList.toggle('on', x === t));
    const p = t.dataset.p;
    notes.classList.toggle('hidden', p !== 'notes');
    recvisuals.classList.toggle('hidden', p !== 'visuals');
    recgames.classList.toggle('hidden', p !== 'games');
    if (p === 'games' && !recgames.children.length) recGamesMenu();
    if (p === 'visuals') startVisuals();
  }));

  if (engine === 'call') return wireCallCapture();
  if (engine === 'whisper') return wireWhisperRecording();
  if (engine === 'browser') return wireMicRecording();
  return wireScriptedRecording();

  // ---- Capture a call: tab/system audio (Meet/Zoom) + your mic, Whisper on-device ----
  function wireCallCapture() {
    let displayStream = null, micStream = null, mixCtx = null, mediaRec = null, audioChunks = [], audioMime = 'audio/webm', rec = null, segs = [], recording = false, paused = false, cancelled = false, finalizing = false;
    const model = localStorage.getItem('ln_whisper_model') || 'Xenova/whisper-base.en';
    const stopStreams = () => {
      try { displayStream && displayStream.getTracks().forEach((t) => t.stop()); } catch {}
      try { micStream && micStream.getTracks().forEach((t) => t.stop()); } catch {}
      try { if (mixCtx && mixCtx.state !== 'closed') mixCtx.close(); } catch {}
    };
    const stopMediaRec = () => { try { if (mediaRec && mediaRec.state !== 'inactive') mediaRec.stop(); } catch {} };
    const teardown = () => { cancelled = true; recording = false; paused = false; clearInterval(timer); if (rec) { try { rec.stop(); } catch {} } stopMediaRec(); stopStreams(); if (finalizing) { try { Whisper.terminate(); } catch {} } stopVisuals(); };
    viewCleanup = teardown;
    const resetIdle = (msg) => { recording = false; clearInterval(timer); pulse.classList.add('hidden'); if (msg) st.textContent = msg; startB.disabled = false; pauseB.disabled = true; stopB.disabled = true; pauseB.textContent = 'Pause'; };

    startB.onclick = async () => {
      startB.disabled = true; cancelled = false;
      // 1) Capture the meeting tab/window/screen audio.
      try { displayStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true }); }
      catch { toast('Screen/tab share was cancelled.'); resetIdle('Ready to record'); return; }
      if (cancelled) { stopStreams(); return; }
      const callAudio = displayStream.getAudioTracks();
      if (!callAudio.length) { toast('No call audio — when sharing, pick a tab and tick “Share tab audio”.'); stopStreams(); resetIdle('Ready to record'); return; }
      // 2) Also grab your mic (your own voice), best-effort.
      try { micStream = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch { micStream = null; }
      if (cancelled) { stopStreams(); return; }
      // 3) Mix call audio + mic into one stream.
      let mixed;
      try {
        mixCtx = new (window.AudioContext || window.webkitAudioContext)();
        const dest = mixCtx.createMediaStreamDestination();
        mixCtx.createMediaStreamSource(new MediaStream(callAudio)).connect(dest);
        if (micStream) { try { mixCtx.createMediaStreamSource(micStream).connect(dest); } catch {} }
        mixed = dest.stream;
      } catch (e) { toast('Could not mix the call audio.'); stopStreams(); resetIdle('Ready to record'); return; }
      // 4) Record the mixed audio for playback.
      try { const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((m) => window.MediaRecorder && MediaRecorder.isTypeSupported(m)) || ''; mediaRec = new MediaRecorder(mixed, mime ? { mimeType: mime } : undefined); audioMime = mediaRec.mimeType || 'audio/webm'; mediaRec.ondataavailable = (e) => { if (e.data && e.data.size) audioChunks.push(e.data); }; mediaRec.start(1000); } catch (err) { console.warn('[call] recorder unavailable', err); }
      // If the user clicks Chrome's "Stop sharing", end the capture cleanly.
      try { callAudio[0].addEventListener('ended', () => { if (recording) stopB.onclick(); }); } catch {}

      live.innerHTML = `<div class="empty" id="wload"><div style="font-weight:600;margin-bottom:8px">Loading ${esc(WHISPER_MODELS[model] || 'Whisper model')}…</div><div class="wbar"><div class="wbar-fill" id="wfill"></div></div><div id="wmsg" style="font-size:12px;margin-top:8px">First run downloads the model, then it’s cached for offline use.</div></div>`;
      st.textContent = 'Loading model…';
      try {
        await Whisper.load(model, (p) => { if (p && p.status === 'progress') { const pct = Math.round(p.progress || 0); const f = $('#wfill'); if (f) f.style.width = pct + '%'; const m = $('#wmsg'); if (m) m.textContent = `${p.file || 'model'} — ${pct}%`; } });
      } catch (e) { toast('Could not load Whisper: ' + (e.message || e)); resetIdle('Ready to record'); stopMediaRec(); stopStreams(); return; }
      if (cancelled) { stopMediaRec(); stopStreams(); return; }

      live.innerHTML = ''; segs = []; recording = true; paused = false;
      t0 = Date.now(); timer = setInterval(tick, 500); tick();
      pulse.classList.remove('hidden'); st.textContent = 'Capturing the call…'; startB.disabled = true; pauseB.disabled = false; stopB.disabled = false;
      rec = Whisper.Recorder(mixed, { window_s: 6, onSegment: (s) => { segs.push(s); appendSeg(s); }, onError: (e) => console.warn('whisper', e) });
      try { await rec.start(); } catch (e) { toast('Audio capture failed: ' + (e.message || e)); resetIdle('Ready to record'); stopMediaRec(); stopStreams(); }
    };

    pauseB.onclick = () => {
      if (!recording) return; paused = !paused;
      if (paused) { rec && rec.pause(); try { mediaRec && mediaRec.state === 'recording' && mediaRec.pause(); } catch {} st.textContent = 'Paused'; pulse.classList.add('hidden'); pauseB.textContent = 'Resume'; }
      else { rec && rec.resume(); try { mediaRec && mediaRec.state === 'paused' && mediaRec.resume(); } catch {} st.textContent = 'Capturing the call…'; pulse.classList.remove('hidden'); pauseB.textContent = 'Pause'; }
    };

    stopB.onclick = async () => {
      if (!recording) return;
      recording = false; paused = false; clearInterval(timer); pulse.classList.add('hidden');
      st.textContent = 'Finishing transcription…'; stopB.disabled = true; pauseB.disabled = true;
      try { rec && (await rec.stop()); } catch {}
      const durationSec = Math.round((Date.now() - t0) / 1000);
      const audio = await recorderBlob(mediaRec, audioChunks, audioMime);
      stopStreams();
      if (!segs.length) { toast('No speech captured — did you tick “Share tab audio”?'); resetIdle('Ready to record'); return; }
      let finalSegs = Whisper.cleanSegments(segs);
      if (audio) {
        finalizing = true;
        try {
          st.textContent = 'Polishing transcript (high accuracy)…';
          const pcm = await Whisper.decodeToPCM16k(audio);
          if (!cancelled) { const res = await Whisper.transcribeLong(pcm, { onProgress: () => { if (!cancelled) st.textContent = 'Polishing transcript…'; } }); const cleaned = Whisper.cleanSegments(res.segments); if (cleaned.length) finalSegs = cleaned; }
        } catch (e) { console.warn('[call] final pass failed — keeping live transcript', e); }
        finalizing = false;
      }
      if (!finalSegs.length && segs.length) finalSegs = segs;
      if (!finalSegs.length) { toast('No speech captured.'); resetIdle('Ready to record'); return; }
      st.textContent = 'Saving…';
      const meta = recMetaVals();
      const r = await saveRecording(finalSegs, audio, durationSec, meta.title || 'Meeting', meta.courseId, recDeck);
      if (!r.ok) { toast(r.reason); st.textContent = 'Ready to record'; startB.disabled = false; return; }
      clearRecMeta();
      if (cancelled) return;
      viewCleanup = null; st.textContent = 'Saved ✓'; toast('Saved — opening transcript…');
      setTimeout(() => (location.hash = '#/c/' + r.targetId), 500);
    };
  }

  // ---- ON-DEVICE Whisper transcription (offline) ----
  function wireWhisperRecording() {
    let mediaStream = null, mediaRec = null, audioChunks = [], audioMime = 'audio/webm', rec = null, segs = [], recording = false, paused = false, cancelled = false, finalizing = false;
    const model = localStorage.getItem('ln_whisper_model') || 'Xenova/whisper-base.en';
    const stopTracks = () => { try { mediaStream && mediaStream.getTracks().forEach((t) => t.stop()); } catch {} };
    const stopMediaRec = () => { try { if (mediaRec && mediaRec.state !== 'inactive') mediaRec.stop(); } catch {} };
    // `cancelled` guards the pre-record await window: if the user leaves during
    // getUserMedia or the model download, the startB continuation must abort
    // instead of starting a mic/worker that nothing tears down. If we leave while
    // a (possibly multi-minute) final pass is running, terminate the worker so the
    // orphaned long job can't keep burning CPU or block the next recording.
    const teardown = () => { cancelled = true; recording = false; paused = false; clearInterval(timer); if (rec) { try { rec.stop(); } catch {} } stopMediaRec(); stopTracks(); if (finalizing) { try { Whisper.terminate(); } catch {} } stopVisuals(); };
    viewCleanup = teardown;
    const resetIdle = (msg) => { recording = false; clearInterval(timer); pulse.classList.add('hidden'); if (msg) st.textContent = msg; startB.disabled = false; pauseB.disabled = true; stopB.disabled = true; pauseB.textContent = 'Pause'; };

    startB.onclick = async () => {
      startB.disabled = true; cancelled = false;
      try { mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
      catch { toast('Microphone blocked — allow mic access, then Start again.'); resetIdle('Mic blocked'); return; }
      if (cancelled) { stopTracks(); return; } // left the view during the permission prompt
      try { const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((m) => window.MediaRecorder && MediaRecorder.isTypeSupported(m)) || ''; mediaRec = new MediaRecorder(mediaStream, mime ? { mimeType: mime } : undefined); audioMime = mediaRec.mimeType || 'audio/webm'; mediaRec.ondataavailable = (e) => { if (e.data && e.data.size) audioChunks.push(e.data); }; mediaRec.start(1000); } catch (err) { console.warn('[rec] MediaRecorder unavailable — transcript only', err); }

      live.innerHTML = `<div class="empty" id="wload"><div style="font-weight:600;margin-bottom:8px">Loading ${esc(WHISPER_MODELS[model] || 'Whisper model')}…</div><div class="wbar"><div class="wbar-fill" id="wfill"></div></div><div id="wmsg" style="font-size:12px;margin-top:8px">First run downloads the model, then it’s cached for offline use.</div></div>`;
      st.textContent = 'Loading model…';
      try {
        await Whisper.load(model, (p) => {
          if (!p) return;
          if (p.status === 'progress') { const pct = Math.round(p.progress || 0); const f = $('#wfill'); if (f) f.style.width = pct + '%'; const m = $('#wmsg'); if (m) m.textContent = `${p.file || 'model'} — ${pct}%`; }
          else if (p.status === 'error') toast('Model error: ' + (p.message || ''));
        });
      } catch (e) { toast('Could not load Whisper: ' + (e.message || e)); resetIdle('Ready to record'); stopMediaRec(); stopTracks(); return; }
      if (cancelled) { stopMediaRec(); stopTracks(); return; } // left the view during the model download

      live.innerHTML = ''; segs = []; recording = true; paused = false;
      t0 = Date.now(); timer = setInterval(tick, 500); tick();
      pulse.classList.remove('hidden'); st.textContent = 'Listening (Whisper)…'; startB.disabled = true; pauseB.disabled = false; stopB.disabled = false;
      rec = Whisper.Recorder(mediaStream, { window_s: 6, onSegment: (s) => { segs.push(s); appendSeg(s); }, onError: (e) => console.warn('whisper', e) });
      try { await rec.start(); } catch (e) { toast('Audio capture failed: ' + (e.message || e)); resetIdle('Ready to record'); stopMediaRec(); stopTracks(); }
    };

    pauseB.onclick = () => {
      if (!recording) return; paused = !paused;
      if (paused) { rec && rec.pause(); try { mediaRec && mediaRec.state === 'recording' && mediaRec.pause(); } catch {} st.textContent = 'Paused'; pulse.classList.add('hidden'); pauseB.textContent = 'Resume'; }
      else { rec && rec.resume(); try { mediaRec && mediaRec.state === 'paused' && mediaRec.resume(); } catch {} st.textContent = 'Listening (Whisper)…'; pulse.classList.remove('hidden'); pauseB.textContent = 'Pause'; }
    };

    stopB.onclick = async () => {
      if (!recording) return;
      recording = false; paused = false; clearInterval(timer); pulse.classList.add('hidden');
      st.textContent = 'Finishing transcription…'; stopB.disabled = true; pauseB.disabled = true;
      try { rec && (await rec.stop()); } catch {}
      const durationSec = Math.round((Date.now() - t0) / 1000);
      const audio = await recorderBlob(mediaRec, audioChunks, audioMime);
      stopTracks();
      if (!segs.length) { toast('No speech captured — speak after Start.'); resetIdle('Ready to record'); return; }

      // High-accuracy final pass: re-transcribe the whole recording from the
      // saved audio in ONE long-form pass (30 s chunks + stride + timestamps),
      // then strip hallucinations. This is the study transcript. Falls back to
      // the cleaned live segments if the audio can't be decoded/re-transcribed.
      let finalSegs = Whisper.cleanSegments(segs);
      if (audio) {
        finalizing = true;
        try {
          st.textContent = 'Polishing transcript (high accuracy)…';
          const pcm = await Whisper.decodeToPCM16k(audio);
          if (!cancelled) {
            const res = await Whisper.transcribeLong(pcm, { onProgress: () => { if (!cancelled) st.textContent = 'Polishing transcript…'; } });
            const cleaned = Whisper.cleanSegments(res.segments);
            if (cleaned.length) finalSegs = cleaned;
          }
        } catch (e) { console.warn('[whisper] final pass failed — keeping live transcript', e); }
        finalizing = false;
      }
      // Never discard a recording that had speech: if cleaning emptied the final
      // segments, fall back to the raw live segments rather than losing the audio.
      if (!finalSegs.length && segs.length) finalSegs = segs;
      if (!finalSegs.length) { toast('No speech captured — speak after Start.'); resetIdle('Ready to record'); return; }

      st.textContent = 'Saving…';
      const meta = recMetaVals();
      const r = await saveRecording(finalSegs, audio, durationSec, meta.title, meta.courseId, recDeck);
      if (!r.ok) { toast(r.reason); st.textContent = 'Ready to record'; startB.disabled = false; return; }
      clearRecMeta();
      // If the user navigated away during the pass, the recording is saved — but
      // do NOT null viewCleanup (it now belongs to the new view) or navigate.
      if (cancelled) return;
      viewCleanup = null; st.textContent = 'Saved ✓'; toast('Saved — opening transcript…');
      setTimeout(() => (location.hash = '#/c/' + r.targetId), 500);
    };
  }

  // ---- REAL microphone transcription (Web Speech API) + audio capture ----
  function wireMicRecording() {
    let recog, segs = [], recording = false, paused = false, interimEl = null, cancelled = false;
    let mediaStream = null, mediaRec = null, audioChunks = [], audioMime = 'audio/webm';
    const showInterim = (text) => {
      if (!text) { if (interimEl) { interimEl.remove(); interimEl = null; } return; }
      if (!interimEl) { interimEl = el(`<div class="seg" style="opacity:.55"><div class="t">…</div><div><div class="sp" style="flex:unset"><span class="dot" style="background:var(--muted)"></span><span class="who">You</span></div><div class="itx"></div></div></div>`); live.appendChild(interimEl); }
      $('.itx', interimEl).textContent = text; live.scrollTop = live.scrollHeight;
    };
    const stopRecog = () => { try { if (recog) { recog.onend = null; recog.stop(); } } catch {} };
    const stopMediaRec = () => { try { if (mediaRec && mediaRec.state !== 'inactive') mediaRec.stop(); } catch {} };
    const stopTracks = () => { try { mediaStream && mediaStream.getTracks().forEach((t) => t.stop()); } catch {} };
    // Full teardown: called on error, and by the router when leaving this view,
    // so the mic never stays live and the recognition loop never runs on.
    const teardown = () => { cancelled = true; recording = false; paused = false; clearInterval(timer); stopRecog(); stopMediaRec(); stopTracks(); stopVisuals(); };
    viewCleanup = teardown;
    const resetIdle = (msg) => { teardown(); if (msg) st.textContent = msg; pulse.classList.add('hidden'); startB.disabled = false; pauseB.disabled = true; stopB.disabled = true; pauseB.textContent = 'Pause'; };

    startB.onclick = async () => {
      startB.disabled = true; cancelled = false; // block a second click during the permission prompt
      segs = []; live.innerHTML = ''; recording = true; paused = false;
      audioChunks = []; mediaStream = null; mediaRec = null;
      // Audio capture (best-effort; transcription still works without it).
      try {
        mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((m) => window.MediaRecorder && MediaRecorder.isTypeSupported(m)) || '';
        mediaRec = new MediaRecorder(mediaStream, mime ? { mimeType: mime } : undefined);
        audioMime = mediaRec.mimeType || 'audio/webm';
        mediaRec.ondataavailable = (e) => { if (e.data && e.data.size) audioChunks.push(e.data); };
        mediaRec.start(1000);
      } catch (err) { console.warn('[rec] audio capture unavailable — transcript only', err); }
      if (cancelled) { stopMediaRec(); stopTracks(); return; } // left the view during the permission prompt

      recog = new SpeechRec(); recog.continuous = true; recog.interimResults = true; recog.lang = 'en-US';
      t0 = Date.now(); timer = setInterval(tick, 500); tick();
      pulse.classList.remove('hidden'); st.textContent = 'Listening…'; startB.disabled = true; pauseB.disabled = false; stopB.disabled = false;
      recog.onresult = (e) => {
        let interim = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const r = e.results[i];
          if (r.isFinal) { const text = r[0].transcript.trim(); if (text) { const t = (Date.now() - t0) / 1000; const seg = { t, speaker: 'You', text }; segs.push(seg); appendSeg(seg); } }
          else interim += r[0].transcript;
        }
        showInterim(interim.trim());
      };
      recog.onerror = (e) => {
        if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { toast('Microphone blocked — allow mic access, then Start again.'); resetIdle('Mic blocked'); }
        else if (e.error === 'audio-capture') { toast('No microphone found.'); resetIdle('Ready to record'); }
      };
      recog.onend = () => { if (recording && !paused) { try { recog.start(); } catch {} } };
      try { recog.start(); } catch { toast('Could not start the microphone.'); resetIdle('Ready to record'); }
    };

    pauseB.onclick = () => {
      if (!recording) return; paused = !paused;
      if (paused) { stopRecog(); try { mediaRec && mediaRec.state === 'recording' && mediaRec.pause(); } catch {} st.textContent = 'Paused'; pulse.classList.add('hidden'); pauseB.textContent = 'Resume'; }
      else { try { recog.start(); } catch {} try { mediaRec && mediaRec.state === 'paused' && mediaRec.resume(); } catch {} st.textContent = 'Listening…'; pulse.classList.remove('hidden'); pauseB.textContent = 'Pause'; }
    };

    stopB.onclick = async () => {
      if (!recording) return;
      showInterim(''); recording = false; paused = false; clearInterval(timer); pulse.classList.add('hidden'); stopRecog();
      if (!segs.length) { toast('No speech captured — try again and speak after Start.'); stopMediaRec(); stopTracks(); st.textContent = 'Ready to record'; startB.disabled = false; pauseB.disabled = true; stopB.disabled = true; return; }
      st.textContent = 'Saving…'; stopB.disabled = true; pauseB.disabled = true;
      const durationSec = Math.round((Date.now() - t0) / 1000);
      const audio = await recorderBlob(mediaRec, audioChunks, audioMime);
      stopTracks();
      const meta = recMetaVals();
      const r = await saveRecording(segs, audio, durationSec, meta.title, meta.courseId, recDeck);
      if (!r.ok) { toast(r.reason); st.textContent = 'Ready to record'; startB.disabled = false; return; }
      clearRecMeta();
      viewCleanup = null; // saved & stopped; nothing left to tear down
      st.textContent = 'Saved ✓'; toast('Saved — opening transcript…');
      setTimeout(() => (location.hash = '#/c/' + r.targetId), 500);
    };
  }

  // ---- Fallback: scripted stream over the WebSocket (no mic support) ----
  function wireScriptedRecording() {
    let ws, paused = false, n = 0, cancelled = false;
    // Leaving the view must close the socket and stop the timer, and the late
    // 'final' message must not force-navigate a user who already left.
    const teardown = () => { cancelled = true; clearInterval(timer); try { if (ws) { ws.onmessage = null; ws.close(); } } catch {} stopVisuals(); };
    viewCleanup = teardown;
    startB.onclick = () => {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      ws = new WebSocket(`${proto}://${location.host}/ws/transcribe`); live.innerHTML = ''; n = 0;
      ws.onopen = () => { t0 = Date.now(); timer = setInterval(tick, 500); tick(); pulse.classList.remove('hidden'); st.textContent = 'Playing demo…'; startB.disabled = true; pauseB.disabled = false; stopB.disabled = false; };
      ws.onmessage = (e) => { if (cancelled) return; const m = JSON.parse(e.data);
        if (m.type === 'segment') { n++; appendSeg(m.segment); }
        else if (m.type === 'final') { clearInterval(timer); pulse.classList.add('hidden'); st.textContent = 'Saved ✓'; toast('Saved — opening transcript…'); if (!cancelled) { viewCleanup = null; setTimeout(() => (location.hash = '#/c/' + m.conversationId), 700); } } };
      ws.onerror = () => toast('WebSocket error'); ws.onclose = () => clearInterval(timer);
    };
    pauseB.onclick = () => { if (!ws || ws.readyState !== 1) return; paused = !paused; ws.send(JSON.stringify({ type: paused ? 'pause' : 'resume' })); pauseB.textContent = paused ? 'Resume' : 'Pause'; st.textContent = paused ? 'Paused' : 'Playing demo…'; pulse.classList.toggle('hidden', paused); };
    stopB.onclick = () => { if (!ws || ws.readyState !== 1) return; if (!n) { toast('Nothing recorded yet.'); return; } st.textContent = 'Generating summary…'; stopB.disabled = true; pauseB.disabled = true; ws.send(JSON.stringify({ type: 'stop' })); };
  }
}

// ============================ SIMPLE PAGES ============================
function renderPlaceholder(active, title, text) {
  const body = el(`<div class="feed"><div class="panel"><div class="ph">${esc(title)}</div><div class="pb muted">${esc(text)}</div></div></div>`);
  shell(active, body);
}
// ---- Phase 3: Study Preferences ----
async function renderSettings() {
  const nav = navSeq;
  const p = state.prefs || await loadPrefs();
  const radios = (group, opts, cur) => opts.map((o) => `<label class="pref-opt"><input type="radio" name="${group}" value="${o.id}" ${o.id === cur ? 'checked' : ''}><span><b>${esc(o.label)}</b>${o.hint ? `<span class="hint"> — ${esc(o.hint)}</span>` : ''}</span></label>`).join('');
  const checks = (group, opts, cur) => opts.map((o) => `<label class="pref-opt"><input type="checkbox" name="${group}" value="${o.id}" ${cur.includes(o.id) ? 'checked' : ''}><span>${esc(o.label)}</span></label>`).join('');
  const body = el(`<div class="feed"><div class="panel settings">
    <div class="ph">Preferences</div>
    <div class="pb muted">These tailor what you get after each lecture. They’re saved on this device.</div>
    <div class="pref-sec"><h4>I am a…</h4><div class="pref-grid">${radios('role', ROLES, p.role || 'student')}</div></div>
    <div class="pref-sec"><h4>Your study level</h4><div class="pref-grid">${radios('level', STUDY_LEVELS, p.level)}</div></div>
    <div class="pref-sec"><h4>Summary length</h4><div class="pref-grid">${radios('length', SUMMARY_LENGTHS, p.length)}</div></div>
    <div class="pref-sec"><h4>Summary style</h4><div class="pref-grid">${radios('style', SUMMARY_STYLES, p.style)}</div></div>
    <div class="pref-sec"><h4>Focus on</h4><div class="pref-grid">${checks('focus', FOCUS_AREAS, p.focus || [])}</div></div>
    <div class="pref-sec"><label class="pref-opt"><input type="checkbox" id="pref-simplify" ${p.simplify ? 'checked' : ''}><span>Explain hard parts in simpler words</span></label></div>
    <div class="pref-actions"><button class="btn brand" id="pref-save">Save preferences</button><span id="pref-saved" class="hint" style="margin-left:10px"></span></div>
  </div>
  <div class="panel settings" style="margin-top:16px">
    <div class="ph">Claude API key</div>
    <div class="pb muted">AI summaries use Anthropic’s Claude. Your key is sent to this app’s local server and kept only in memory for the session — never written to disk, never stored in the browser. Recording and transcription don’t need it and work offline.</div>
    <div id="claude-box" class="pref-sec"><span class="hint">Checking…</span></div>
  </div></div>`);
  if (nav !== navSeq) return;  // user already navigated elsewhere
  shell('#/settings', body);
  $('#pref-save', body).onclick = async () => {
    const val = (g) => { const x = $(`input[name="${g}"]:checked`, body); return x ? x.value : DEFAULT_PREFS[g]; };
    const focus = $$(`input[name="focus"]:checked`, body).map((x) => x.value);
    await savePrefs({ role: val('role'), level: val('level'), length: val('length'), style: val('style'), focus, simplify: $('#pref-simplify', body).checked });
    const s = $('#pref-saved', body); if (s) { s.textContent = 'Saved ✓'; setTimeout(() => (s.textContent = ''), 2000); }
    toast('Study preferences saved.');
  };
  wireClaudeKey($('#claude-box', body));
}

// Claude API key panel: shows status and lets the user set/clear the key.
// The key is entered by the user and posted to the local server; the app never
// stores or displays it.
async function wireClaudeKey(box) {
  if (!box) return;
  let status = {}; try { status = (await api('/claude_status')).data || {}; } catch { status = { error: true }; }
  const model = status.model ? ` <span class="hint">(model: ${esc(status.model)})</span>` : '';
  if (status.error) { box.innerHTML = `<span class="hint">Can’t reach the local server — start it with <code>node server.js</code>.</span>`; return; }
  if (status.configured && status.fromEnv) {
    box.innerHTML = `<div class="key-ok">✓ Key configured from the server environment${model}</div>`;
    return;
  }
  if (status.configured) {
    box.innerHTML = `<div class="key-ok">✓ Key set for this session${model}</div><div class="pref-actions"><button class="btn" id="key-clear">Remove key</button></div>`;
    $('#key-clear', box).onclick = async () => { try { await api('/claude_key', { method: 'DELETE' }); } catch {} toast('Key removed.'); wireClaudeKey(box); };
    return;
  }
  box.innerHTML =
    `<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">
       <input id="key-in" type="password" autocomplete="off" placeholder="sk-ant-…" style="flex:1;min-width:220px;padding:9px 12px;border-radius:10px;border:1px solid var(--line);background:var(--bg);color:var(--ink)">
       <button class="btn brand" id="key-save">Save key</button>
     </div>
     <div id="key-msg" class="hint" style="margin-top:8px">Get a key at console.anthropic.com. You can also start the server with <code>ANTHROPIC_API_KEY=sk-… node server.js</code> to skip this.</div>`;
  const save = async () => {
    const inp = $('#key-in', box), msg = $('#key-msg', box);
    const key = (inp.value || '').trim(); if (!key) { inp.focus(); return; }
    msg.textContent = 'Saving…';
    let r; try { r = await api('/claude_key', { method: 'POST', body: { key } }); } catch { msg.textContent = 'Network error.'; return; }
    inp.value = '';
    if (r.status === 200) { toast('Claude key saved.'); wireClaudeKey(box); }
    else { msg.textContent = (r.data && r.data.detail) || 'Could not save key.'; }
  };
  $('#key-save', box).onclick = save;
  $('#key-in', box).onkeydown = (e) => { if (e.key === 'Enter') save(); };
}

// ---- Import: upload an audio file and transcribe it on-device (Whisper) ----
function renderImport() {
  const whisperOK = !!(window.Whisper && Whisper.supported());
  const curModel = localStorage.getItem('ln_whisper_model') || 'Xenova/whisper-base.en';
  const courseOpts = (state.courses || []).map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
  const inStyle = 'padding:9px 12px;border-radius:10px;border:1px solid var(--line);background:var(--bg);color:var(--ink)';
  const body = el(`<div class="feed"><div class="panel settings">
    <div class="ph">Import a recording</div>
    <div class="pb muted">Upload an audio file of a lecture and transcribe it on your device with Whisper — nothing leaves your computer. (The browser speech engine only works for live mic, so imports use on-device Whisper.) First run downloads the model once, then it works offline.</div>
    ${whisperOK ? `
    <div class="pref-sec">
      <label class="imp-drop" id="drop">
        <input type="file" id="file" accept="audio/*,video/*" style="display:none">
        <div><div style="font-weight:700;margin-bottom:4px">📂 Choose an audio file</div><div class="hint" id="fname">or drag &amp; drop · mp3, m4a, wav, webm, mp4…</div></div>
      </label>
    </div>
    <div class="pref-sec" style="display:flex;gap:14px;flex-wrap:wrap;align-items:center">
      <label class="hint" style="font-weight:600">Accuracy <select id="imodel" style="${inStyle};margin-left:6px">${Object.entries(WHISPER_MODELS).map(([k, v]) => `<option value="${k}" ${k === curModel ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select></label>
      <label class="hint" style="font-weight:600">Course <select id="icourse" style="${inStyle};margin-left:6px">${courseOpts}</select></label>
      <input id="ititle" placeholder="Lecture title (optional)" style="flex:1;min-width:170px;${inStyle}">
    </div>
    <div class="pref-actions"><button class="btn brand" id="go" disabled>Transcribe &amp; save</button><span id="imsg" class="hint" style="margin-left:12px"></span></div>
    <div class="wbar" id="wrap" style="display:none;margin-top:16px;max-width:none"><div class="wbar-fill" id="fill"></div></div>
    ` : '<div class="pb muted">On-device transcription isn’t supported in this browser. Try a recent Chrome or Edge.</div>'}
  </div></div>`);
  shell('#/import', body);
  if (!whisperOK) return;
  const fileInp = $('#file', body), drop = $('#drop', body), fname = $('#fname', body), go = $('#go', body),
    imsg = $('#imsg', body), model = $('#imodel', body), course = $('#icourse', body), title = $('#ititle', body),
    wrap = $('#wrap', body), fill = $('#fill', body);
  let file = null, busy = false, cancelled = false;
  const MAX_MB = 300;
  // Leaving the view aborts an in-flight import (terminate the worker) and
  // prevents the late result from force-navigating a user who already left.
  viewCleanup = () => { cancelled = true; if (busy) { try { Whisper.terminate(); } catch {} } };
  const setFile = (f) => {
    if (!f) return;
    if (f.size > MAX_MB * 1024 * 1024) { fname.textContent = 'That file is over ' + MAX_MB + ' MB — try a smaller one.'; file = null; go.disabled = true; return; }
    file = f; fname.textContent = f.name + ' · ' + (Math.round(f.size / 1024 / 1024 * 10) / 10) + ' MB'; go.disabled = busy; // don't re-enable mid-run
  };
  fileInp.onchange = () => setFile(fileInp.files[0]);
  drop.ondragover = (e) => { e.preventDefault(); drop.classList.add('drag'); };
  drop.ondragleave = () => drop.classList.remove('drag');
  drop.ondrop = (e) => { e.preventDefault(); drop.classList.remove('drag'); setFile(e.dataTransfer.files[0]); };
  go.onclick = async () => {
    if (!file || busy) return;
    busy = true; go.disabled = true; const m = model.value; try { localStorage.setItem('ln_whisper_model', m); } catch {}
    wrap.style.display = 'block';
    try {
      imsg.textContent = 'Loading model…';
      await Whisper.load(m, (p) => { if (p && p.status === 'progress') { const pct = Math.round(p.progress || 0); fill.style.width = pct + '%'; imsg.textContent = (p.file || 'model') + ' — ' + pct + '%'; } });
      if (cancelled) return;
      imsg.textContent = 'Decoding audio…'; fill.style.width = '100%';
      const pcm = await Whisper.decodeToPCM16k(file);
      if (cancelled) return;
      const durationSec = Math.round(pcm.length / 16000);
      imsg.textContent = 'Transcribing on your device… (longer files take longer)';
      const res = await Whisper.transcribeLong(pcm, { onProgress: () => { if (!cancelled) imsg.textContent = 'Transcribing on your device…'; } });
      if (cancelled) return;
      const segs = Whisper.cleanSegments(res.segments);
      if (!segs.length) { imsg.textContent = 'No speech found in that file.'; busy = false; go.disabled = false; return; }
      imsg.textContent = 'Saving…';
      const name = (title.value || '').trim() || file.name.replace(/\.[^.]+$/, '');
      const r = await saveRecording(segs, file, durationSec, name, course.value);
      if (!r.ok) { imsg.textContent = r.reason || 'Save failed.'; busy = false; go.disabled = false; return; }
      imsg.textContent = 'Saved ✓'; toast('Imported — opening transcript…');
      if (cancelled) return;                 // saved, but user left — don't yank them
      viewCleanup = null;
      setTimeout(() => (location.hash = '#/c/' + r.targetId), 400);
    } catch (e) { imsg.textContent = 'Import failed: ' + ((e && e.message) || e); busy = false; go.disabled = false; }
  };
}

// ---- Phase 3: Courses ----
function lectureInCourse(l, courseId) {
  if (courseId === 'crs_general') return l.courseId === 'crs_general' || !l.courseId;
  return l.courseId === courseId;
}
async function renderCourses() {
  const nav = navSeq;
  let lectures = [];
  try { if (window.LDB && LDB.available()) lectures = await LDB.listLectures(); } catch {}
  const count = (id) => lectures.filter((l) => lectureInCourse(l, id)).length;
  const cards = (state.courses || []).map((c) => `<div class="course-card" data-id="${c.id}">
      <div class="course-top"><span class="cdot" style="display:inline-block;width:14px;height:14px;border-radius:4px;background:${c.color}"></span><h3>${esc(c.name)}</h3></div>
      <div class="meta">${count(c.id)} lecture${count(c.id) === 1 ? '' : 's'}</div>
    </div>`).join('');
  const body = el(`<div class="feed">
    <div class="feed-head"><span class="datehdr">Courses</span></div>
    <div class="course-grid">${cards}</div>
    <div class="course-new"><input id="nc-name" placeholder="New course name (e.g. Organic Chemistry)"><button class="btn brand" id="nc-add">Add course</button></div>
  </div>`);
  if (nav !== navSeq) return;  // user already navigated elsewhere
  shell('#/courses', body);
  $$('.course-card', body).forEach((card) => (card.onclick = () => (location.hash = '#/course/' + card.dataset.id)));
  const add = async () => { const inp = $('#nc-name', body); const name = (inp.value || '').trim(); if (!name) { inp.focus(); return; } const c = await addCourse(name); toast('Course added: ' + c.name); location.hash = '#/course/' + c.id; };
  $('#nc-add', body).onclick = add;
  $('#nc-name', body).onkeydown = (e) => { if (e.key === 'Enter') add(); };
}
async function renderCourse(id) {
  const nav = navSeq;
  const course = courseById(id);
  if (!course) { toast('Course not found'); location.hash = '#/courses'; return; }
  let lectures = [];
  try { if (window.LDB && LDB.available()) lectures = await LDB.listLectures(); } catch {}
  const items = lectures.filter((l) => lectureInCourse(l, id)).map(localToCard);
  const feed = el(`<div class="feed">
    <div class="feed-head"><span class="datehdr"><span class="cdot" style="display:inline-block;width:12px;height:12px;border-radius:4px;background:${course.color};margin-right:8px"></span>${esc(course.name)}</span>
      <button class="btn brand" id="crs-rec">${ICON.mic} Record for this course</button></div>
  </div>`);
  if (!items.length) feed.appendChild(el(`<div class="empty">No lectures in ${esc(course.name)} yet. Press “Record for this course” to add one.</div>`));
  items.forEach((c) => feed.appendChild(convCard(c)));
  if (nav !== navSeq) return;  // user already navigated elsewhere
  shell('#/courses', feed);
  $('#crs-rec', feed).onclick = () => { try { localStorage.setItem('ln_record_course', id); } catch {} location.hash = '#/record'; };
}

function renderChat() {
  const body = el(`<div class="simple"><div class="panel">${askShell()}</div></div>`);
  shell('#/chat', body);
  wireGlobalChat(body);
}
function askShell() { return `<div class="chat"><div class="log" id="log"><div class="bubble ai">Hi — I’m your AI Chat. Ask me about any of your conversations, e.g. “summarize the complex numbers lecture” or “what did the study group sync cover?”</div></div><div class="composer"><input class="field" id="q" style="margin:0" placeholder="Ask across your conversations…"><button class="btn brand" id="send">Send</button></div></div>`; }
async function wireGlobalChat(body) {
  const { data } = await api('/conversations');
  const convos = data.conversations || [];
  const log = $('#log', body), input = $('#q', body);
  const add = (cls, t) => { const b = el(`<div class="bubble ${cls}"></div>`); b.textContent = t; log.appendChild(b); log.scrollTop = log.scrollHeight; return b; };
  const ask = async () => {
    const q = input.value.trim(); if (!q) return; add('me', q); input.value = '';
    // Pick the conversation whose title shares the most meaningful words with the question.
    const words = (t) => (t.toLowerCase().match(/[a-z0-9]+/g) || []).filter((w) => w.length > 3);
    const qw = new Set(words(q));
    let target = null, best = 0;
    convos.forEach((c) => { const n = words(c.title).filter((w) => qw.has(w)).length; if (n > best) { best = n; target = c; } });
    target = target || convos[0];
    const th = add('ai', '…');
    if (!target) { th.textContent = 'You have no conversations yet.'; return; }
    const { data } = await api('/conversations/' + target.id + '/ask', { method: 'POST', body: { question: q } });
    th.textContent = `(${target.title}) ` + (data.answer || 'No answer.');
  };
  $('#send', body).onclick = ask; input.onkeydown = (e) => { if (e.key === 'Enter') ask(); };
}

// ============================ ROUTER ============================
async function logout() { try { await api('/logout', { method: 'POST' }); } catch {} state.user = null; try { localStorage.removeItem('ln_user'); } catch {} location.hash = '#/signin'; }
// Bumped on every navigation so a slow async view can't overwrite a newer one.
let navSeq = 0;
async function router() {
  const nav = ++navSeq;
  runViewCleanup();  // stop any recorder / revoke blob URLs from the previous view
  const hash = location.hash || '#/home';
  const parts = hash.slice(2).split('/'); const route = '/' + (parts[0] || '');
  if (!state.user && route !== '/signin') { location.hash = '#/signin'; return; }
  if (state.user && route === '/signin') { location.hash = '#/home'; return; }
  if (state.user && !state.channels.length) { try { state.channels = (await api('/channels')).data.channels || []; } catch {} }
  if (nav !== navSeq) return;  // a newer navigation started while we waited
  if (route === '/signin') return renderSignIn();
  if (route === '/home' || route === '/') return renderHome();
  if (route === '/search') return renderHome(decodeURIComponent(parts[1] || ''));
  if (route === '/record') return renderRecord();
  if (route === '/chat') return renderChat();
  if (route === '/games') return renderGames();
  if (route === '/settings') return renderSettings();
  if (route === '/import') return renderImport();
  if (route === '/courses') return renderCourses();
  if (route === '/course') return renderCourse(parts[1]);
  if (route === '/c') return renderDetail(parts[1]);
  if (route === '/logout') return logout();
  location.hash = '#/home';
}

// ============================ BOOT ============================
async function boot() {
  try { const th = localStorage.getItem('theme'); if (th) document.documentElement.setAttribute('data-theme', th); } catch {}
  // Guard every network call so the app still renders offline (SW serves the
  // shell; past lectures come from IndexedDB). Never let boot() reject.
  try { await api('/login_csrf'); } catch {}
  fetch('/otel-token').catch(() => {});
  try { state.flags = (await fetch('/v1/initialize').then((r) => r.json())).feature_gates || {}; } catch {}
  let me; try { me = await api('/me'); } catch { me = { status: 0 }; }
  if (me.status === 200) {
    state.user = me.data.user; cacheUser(state.user);
    try { state.channels = (await api('/channels')).data.channels || []; } catch {}
  } else {
    // Offline / not reachable: fall back to the last signed-in user so on-device
    // lectures remain accessible without a fresh server login.
    try { const cached = localStorage.getItem('ln_user'); if (cached) state.user = JSON.parse(cached); } catch {}
  }
  // Phase 3: courses + study preferences (local-first, offline-safe).
  try { await loadCourses(); } catch {}
  try { await loadPrefs(); } catch {}
  try { state.visualPrefs = await LDB.getVisualPrefs(); } catch {}
  window.addEventListener('hashchange', router);
  router();
}
boot();
