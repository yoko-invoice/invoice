// In-memory Firebase stub for local integration testing of the invoice app.
// Maps the same exports app.js imports from the Firebase CDN modules.
// persisted per scenario+run so a page reload (resume flow) keeps state; isolated between scenarios/runs
const __params = new URLSearchParams(location.search);
const PKEY = 'fbstub:' + (__params.get('scenario') || 'default') + ':' + (__params.get('run') || 'x');
const store = new Map(JSON.parse(localStorage.getItem(PKEY) || '[]')); // 'col/id' -> data object; 'storage:path' -> dataURL
function persist() { try { localStorage.setItem(PKEY, JSON.stringify([...store.entries()])); } catch (e) {} }

function docsIn(colPathStr) {
  const out = [];
  for (const [p, d] of store) {
    if (p.startsWith(colPathStr + '/')) {
      const rest = p.slice(colPathStr.length + 1);
      if (!rest.includes('/')) out.push({ id: rest, data: () => d });
    }
  }
  return out;
}
function snapFor(ref) {
  const filters = ref.filters || [];
  return { docs: docsIn(ref.path).filter(x => filters.every(w => w.fn(x.data()))) };
}
function fire() { listeners.slice().forEach(l => { try { l.cb(snapFor(l.ref)); } catch (e) {} }); }
const listeners = [];

export function initializeApp() { return {}; }
export function getFirestore() { return {}; }
export function initializeFirestore() { return {}; }
export function persistentLocalCache() { return {}; }
export function persistentMultipleTabManager() { return {}; }
export function collection(db, ...segs) { return { kind: 'col', path: segs.join('/') }; }
export function doc(dbOrRef, ...segs) {
  const base = dbOrRef && dbOrRef.path ? dbOrRef.path + '/' : '';
  return { kind: 'doc', path: base + segs.join('/') };
}
export function query(colRef, ...ws) { return { kind: 'q', path: colRef.path, filters: ws }; }
export function where(f, op, v) { return { fn: d => d[f] === v }; }
const DELETED = { __del: true };
export function deleteField() { return DELETED; }
export async function getDoc(ref) {
  const d = store.get(ref.path);
  return { id: ref.path.split('/').pop(), exists: () => d !== undefined, data: () => d };
}
export async function getDocs(q) {
  const docs = snapFor(q).docs.map(x => ({ id: x.id, data: x.data }));
  return { docs, size: docs.length, empty: docs.length === 0, forEach: (cb) => docs.forEach(cb) };
}
export async function setDoc(ref, data, opts) {
  const cur = (opts && opts.merge) ? (store.get(ref.path) || {}) : {};
  const out = { ...cur };
  for (const [k, v] of Object.entries(data)) { if (v === DELETED) delete out[k]; else out[k] = v; }
  store.set(ref.path, out);
  persist();
  fire();
}
export async function deleteDoc(ref) { store.delete(ref.path); persist(); fire(); }
export function onSnapshot(ref, cb, errcb) {
  const l = { ref, cb };
  listeners.push(l);
  queueMicrotask(() => { try { cb(snapFor(ref)); } catch (e) { if (errcb) errcb(e); } });
  return () => { const i = listeners.indexOf(l); if (i >= 0) listeners.splice(i, 1); };
}
export function writeBatch() {
  const ops = [];
  return {
    set: (r, d, o) => ops.push(() => setDoc(r, d, o)),
    update: (r, d) => ops.push(() => setDoc(r, d, { merge: true })),
    delete: (r) => ops.push(() => deleteDoc(r)),
    commit: async () => { for (const o of ops) await o(); }
  };
}
export function getStorage() { return {}; }
export function ref(storage, path) { return { path }; }
export async function uploadString(ref, dataUrl) { store.set('storage:' + ref.path, dataUrl); }
export async function getDownloadURL(ref) { return 'fake-download://' + ref.path; }
export async function deleteObject(ref) { store.delete('storage:' + ref.path); }
const user = {
  getIdToken: async () => 'tok',
  getIdTokenResult: async () => ({ claims: { invApp: true, rid: 'yoko' } })
};
export function getAuth() { return { currentUser: user, authStateReady: async () => {} }; }
export async function signInWithCustomToken() {}

// test hooks
export const __store = store;
export function __seed(path, data) { store.set(path, data); persist(); }
