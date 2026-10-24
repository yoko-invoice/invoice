// פרוקסי תמונות לחשבוניות: נועד למכשירים שחוסמים בקשות CORS ישירות ל-Firebase Storage
// (למשל סינון תוכן מקומי). האפליקציה פונה לכאן רק כשהטעינה הישירה נכשלת.
// מאומת ב-Firebase ID token כמו שאר הפונקציות, ומוגבל לנתיבי התמונות של המסעדה בלבד.
const { onRequest } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');

admin.initializeApp();

const BUCKET = 'work-schedule-17c39.firebasestorage.app';
const ALLOWED_PREFIX = 'yoko/invoices/';

exports.invoiceImageProxy = onRequest(
  { region: 'us-central1', cors: true, memory: '256MiB', timeoutSeconds: 60 },
  async (req, res) => {
    try {
      const m = /^Bearer (.+)$/.exec(req.headers.authorization || '');
      if (!m) { res.status(401).json({ error: 'missing auth token' }); return; }
      try {
        await admin.auth().verifyIdToken(m[1]);
      } catch (e) {
        res.status(401).json({ error: 'invalid auth token' }); return;
      }

      const p = String(req.query.path || '');
      if (!p.startsWith(ALLOWED_PREFIX) || p.includes('..') || p.includes('%2e')) {
        res.status(403).json({ error: 'path not allowed' }); return;
      }

      const file = admin.storage().bucket(BUCKET).file(p);
      const [exists] = await file.exists();
      if (!exists) { res.status(404).json({ error: 'not found' }); return; }
      const [meta] = await file.getMetadata().catch(() => [null]);
      res.setHeader('Content-Type', (meta && meta.contentType) || 'image/jpeg');
      res.setHeader('Cache-Control', 'private, max-age=300');
      file.createReadStream()
        .on('error', (e) => { console.error(e); if (!res.headersSent) res.status(500).end(); else res.end(); })
        .pipe(res);
    } catch (e) {
      console.error(e);
      if (!res.headersSent) res.status(500).json({ error: String((e && e.message) || e) });
    }
  }
);
