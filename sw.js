const CACHE = 'invoices-v8';
const CORE = ['./', 'index.html', 'manifest.json'];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).catch(() => {}));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  // קבלת קבצים משיתוף (Share Target): שומר אותם זמנית ומפנה לאפליקציה
  if (req.method === 'POST' && new URL(req.url).searchParams.has('share')) {
    e.respondWith((async () => {
      try {
        const form = await req.formData();
        const files = form.getAll('files').filter((f) => f && f.size);
        const c = await caches.open('shared-files');
        for (const k of await c.keys()) await c.delete(k);
        let i = 0;
        for (const f of files) {
          await c.put('/invoice/shared/' + (i++), new Response(f, {
            headers: { 'Content-Type': f.type || 'application/octet-stream', 'X-Name': encodeURIComponent(f.name || 'shared') }
          }));
        }
      } catch (err) {}
      return Response.redirect('/invoice/index.html?shared=1', 303);
    })());
    return;
  }
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    fetch(req, { cache: 'no-cache' })   // תמיד בודק מול השרת, לא מסתמך על מטמון ה-HTTP של הדפדפן/GitHub
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
        return res;
      })
      .catch(() => caches.match(req))
  );
});
