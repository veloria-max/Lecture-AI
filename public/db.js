'use strict';
/* Local-first storage (IndexedDB) so recordings, audio and transcripts live on
   the device and the app works fully offline. Everything is wrapped in
   try/catch and degrades gracefully if IndexedDB is unavailable. */
(function () {
  const DB_NAME = 'lecturenotes';
  const DB_VERSION = 1;
  const STORE = 'lectures';        // { id, courseId, title, createdAt, durationSec, owner, speakers, segments, summary, status, audioType, audio(Blob), synced }
  const PREFS = 'prefs';           // { key, value }

  let dbPromise = null;

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      // Reset the cached promise on failure so a transient error (private mode,
      // first-call hiccup) doesn't poison storage for the whole session.
      const fail = (err) => { dbPromise = null; reject(err); };
      let req;
      try { req = indexedDB.open(DB_NAME, DB_VERSION); }
      catch (e) { return fail(e); }
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const os = db.createObjectStore(STORE, { keyPath: 'id' });
          os.createIndex('by_course', 'courseId', { unique: false });
          os.createIndex('by_created', 'createdAt', { unique: false });
        }
        if (!db.objectStoreNames.contains(PREFS)) {
          db.createObjectStore(PREFS, { keyPath: 'key' });
        }
      };
      req.onblocked = () => {}; // another tab holds an older version open; wait
      req.onsuccess = () => {
        const db = req.result;
        // If another tab upgrades the schema later, close so it isn't blocked.
        db.onversionchange = () => { try { db.close(); } catch {} dbPromise = null; };
        resolve(db);
      };
      req.onerror = () => fail(req.error);
    });
    return dbPromise;
  }

  function tx(store, mode) {
    return open().then((db) => db.transaction(store, mode).objectStore(store));
  }
  // Read: resolve on request success.
  function readReq(r) {
    return new Promise((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
  }
  // Write: resolve on TRANSACTION commit (durable), not just request success,
  // so a rolled-back commit (quota/abort) is reported as a failure.
  function writeReq(r) {
    return new Promise((resolve, reject) => {
      const t = r.transaction;
      r.onerror = () => {};
      t.oncomplete = () => resolve(r.result);
      t.onabort = () => reject(t.error || new Error('transaction aborted'));
      t.onerror = () => reject(t.error || new Error('transaction error'));
    });
  }

  const LDB = {
    available() { try { return typeof indexedDB !== 'undefined'; } catch { return false; } },

    async putLecture(rec) {
      try { const os = await tx(STORE, 'readwrite'); await writeReq(os.put(rec)); return true; }
      catch (e) { console.warn('putLecture failed', e); return false; }
    },
    async getLecture(id) {
      try { const os = await tx(STORE, 'readonly'); return await readReq(os.get(id)); }
      catch (e) { console.warn('getLecture failed', e); return null; }
    },
    async listLectures() {
      try {
        const os = await tx(STORE, 'readonly');
        const all = await readReq(os.getAll());
        // newest first
        return (all || []).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
      } catch (e) { console.warn('listLectures failed', e); return []; }
    },
    async deleteLecture(id) {
      try { const os = await tx(STORE, 'readwrite'); await writeReq(os.delete(id)); return true; }
      catch (e) { console.warn('deleteLecture failed', e); return false; }
    },
    async getPref(key, dflt) {
      try { const os = await tx(PREFS, 'readonly'); const r = await readReq(os.get(key)); return r ? r.value : dflt; }
      catch { return dflt; }
    },
    async setPref(key, value) {
      try { const os = await tx(PREFS, 'readwrite'); await writeReq(os.put({ key, value })); return true; }
      catch { return false; }
    },

    // ---- Courses (Phase 3): stored as a prefs list, so no schema bump. ----
    async getCourses() { const c = await this.getPref('ln_courses', null); return Array.isArray(c) ? c : []; },
    async setCourses(list) { return this.setPref('ln_courses', Array.isArray(list) ? list : []); },

    // ---- Student study preferences (Phase 3) — drive adaptive summaries. ----
    async getStudentPrefs() { return await this.getPref('ln_student_prefs', null); },
    async setStudentPrefs(p) { return this.setPref('ln_student_prefs', p || {}); },

    // ---- Visual-slide rating signals — personalize future slides. ----
    async getVisualPrefs() { const v = await this.getPref('ln_visual_prefs', null); return (v && typeof v === 'object') ? v : {}; },
    async setVisualPrefs(v) { return this.setPref('ln_visual_prefs', (v && typeof v === 'object') ? v : {}); },
  };

  window.LDB = LDB;
})();
