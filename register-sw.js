// רישום ה-service worker. העדכון אוטומטי: ה-SW עובד "רשת קודם" (network-first) לקבצי האפליקציה,
// והדפדפן בודק אם יש גרסה חדשה של sw.js בכל טעינה ובכל חזרה לאפליקציה.
// כדי לדחוף גרסה חדשה מספיק להעלות את CACHE ב-sw.js.
// בכוונה אין טעינה מחדש אוטומטית, כדי לא להפיל משתמש באמצע הזנת חשבונית.
if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
        navigator.serviceWorker.register('sw.js').then(function (reg) {
            document.addEventListener('visibilitychange', function () {
                if (document.visibilityState === 'visible') reg.update().catch(function () {});
            });
        }).catch(function (e) { console.warn('רישום service worker נכשל:', e); });
    });
}
