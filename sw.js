const CACHE = 'invoices-v19';

// קבצי האפליקציה (חובה לעבודה אופליין)
const CORE = [
  './', 'index.html', 'styles.css',
  'ui.js', 'app.js', 'register-sw.js', 'image-viewer.js', 'fold-cards.js',
  'manifest.json', 'icon-192.png', 'icon-512.png'
];

// ספריות חיצוניות: נשמרות מראש (אם יש רשת בהתקנה) ובנוסף נשמרות אוטומטית בכל שימוש ראשון
const LIBS = [
  'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
  'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js',
  'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js',
  'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js',
  'https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js'
];
const LIB_HOSTS = ['cdnjs.cloudflare.com', 'www.gstatic.com'];
const LIB_CACHE = 'invoices-libs-v1';   // לא תלוי בגרסת האפליקציה - הספריות מוצמדות לגרסה בכתובת

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil((async () => {
    // כל קובץ בנפרד: קובץ חסר (למשל אייקון) לא מפיל את ההתקנה כולה
    const app = await caches.open(CACHE);
    await Promise.all(CORE.map((u) => app.add(u).catch(() => {})));
    const libs = await caches.open(LIB_CACHE);
    await Promise.all(LIBS.map(async (u) => {
      if (await libs.match(u)) return;
      try { const r = await fetch(u); if (r.ok) await libs.put(u, r); } catch (err) {}
    }));
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      // 'shared-files' מחזיק קבצים ששותפו ועדיין לא נקלטו באפליקציה - אסור למחוק אותו בעדכון גרסה
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== LIB_CACHE && k !== 'shared-files').map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);

  // קבלת קבצים משיתוף (Share Target): שומר אותם זמנית ומפנה לאפליקציה
  if (req.method === 'POST' && url.searchParams.has('share')) {
    e.respondWith((async () => {
      try {
        const form = await req.formData();
        const files = form.getAll('files').filter((f) => f && f.size);
        const c = await caches.open('shared-files');
        for (const k of await c.keys()) await c.delete(k);
        let i = 0;
        for (const f of files) {
          await c.put(self.registration.scope + 'shared/' + (i++), new Response(f, {
            headers: { 'Content-Type': f.type || 'application/octet-stream', 'X-Name': encodeURIComponent(f.name || 'shared') }
          }));
        }
      } catch (err) {}
      // הנתיב נגזר מה-scope של ה-service worker, כך שלא נשבר אם האפליקציה נפרסת תחת נתיב אחר
      return Response.redirect(self.registration.scope + 'index.html?shared=1', 303);
    })());
    return;
  }
  if (req.method !== 'GET') return;

  // ספריות חיצוניות מוצמדות לגרסה: מטמון קודם, ואם אין - רשת ושמירה
  if (url.origin !== self.location.origin) {
    if (!LIB_HOSTS.includes(url.hostname) || !/\.(js|mjs)$/.test(url.pathname)) return;
    e.respondWith((async () => {
      const c = await caches.open(LIB_CACHE);
      const hit = await c.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res && (res.ok || res.type === 'opaque')) c.put(req, res.clone()).catch(() => {});
      return res;
    })());
    return;
  }

  // קבצי האפליקציה: רשת קודם (עדכון אוטומטי), ואם אין רשת - מהמטמון
  e.respondWith(
    fetch(req, { cache: 'no-cache' })
      .then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }).then((m) => m || (req.mode === 'navigate' ? caches.match('index.html') : Response.error())))
  );
});
