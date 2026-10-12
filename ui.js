// ---- הודעות קופצות ודיאלוגים (מחליפים alert / confirm / prompt) ----
(function () {
    function box() {
        var b = document.getElementById('toastBox');
        if (!b) { b = document.createElement('div'); b.id = 'toastBox'; document.body.appendChild(b); }
        return b;
    }
    window.showToast = function (msg, type) {
        var t = document.createElement('div');
        t.className = 'toast' + (type ? ' ' + type : '');
        t.textContent = String(msg);
        var ms = Math.min(9000, 3500 + String(msg).length * 40);
        var timer = setTimeout(remove, ms);
        function remove() { clearTimeout(timer); if (t.parentNode) t.parentNode.removeChild(t); }
        t.onclick = remove;
        box().appendChild(t);
    };
    window.alert = function (msg) {
        var m = String(msg);
        var isErr = /שגיאה|נכשל|לא ניתן|אנא|שגוי|אזהרה|⚠/.test(m);
        var isOk = /בהצלחה|נשמר/.test(m);
        window.showToast(m, isErr ? 'err' : (isOk ? 'ok' : ''));
    };
    function dialog(msg, opts, withInput, def) {
        opts = opts || {};
        return new Promise(function (resolve) {
            var ov = document.createElement('div');
            ov.id = 'dlgOverlay';
            var d = document.createElement('div'); d.className = 'dlg';
            var m = document.createElement('div'); m.className = 'dlg-msg'; m.textContent = String(msg);
            d.appendChild(m);
            var inp = null;
            if (withInput) {
                inp = document.createElement('input');
                inp.type = opts.password ? 'password' : 'text';
                inp.value = def || '';
                inp.style.marginBottom = '10px';
                d.appendChild(inp);
            }
            var row = document.createElement('div'); row.className = 'dlg-btns';
            var ok = document.createElement('button'); ok.textContent = opts.ok || 'אישור'; ok.style.backgroundColor = '#1877f2';
            var no = document.createElement('button'); no.textContent = opts.cancel || 'ביטול'; no.style.backgroundColor = '#7f8c8d';
            function done(v) { if (ov.parentNode) ov.parentNode.removeChild(ov); resolve(v); }
            ok.onclick = function () { done(withInput ? inp.value : true); };
            no.onclick = function () { done(withInput ? null : false); };
            if (inp) inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') ok.click(); });
            row.appendChild(ok); row.appendChild(no); d.appendChild(row);
            ov.appendChild(d); document.body.appendChild(ov);
            if (inp) setTimeout(function () { inp.focus(); inp.select(); }, 50);
        });
    }
    window.appConfirm = function (msg, opts) { return dialog(msg, opts, false); };
    window.appPrompt = function (msg, def, opts) { return dialog(msg, opts, true, def); };
})();
