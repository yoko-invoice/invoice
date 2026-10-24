(function(){
    // צופה תמונה במסך מלא עם זום (צביטה/דאבל-טאפ) וגרירה (פאן).
    // במצב רגיל (scale=1) הגלילה היא הגלילה הטבעית של הדפדפן; ברגע שמתחיל זום -
    // עוברים לשליטה ידנית מלאה במחוות (touch-action:none) כדי שהדפדפן לא יתערב.
    var open=false, img=null, body=null, bound=false;
    var z = { scale:1, tx:0, ty:0 };
    var pointers = new Map();       // pointerId -> {x,y}
    var pinch = null;               // { d0, s0, p0:{x,y} } - מרחק התחלתי, סקייל התחלתי, נקודת תוכן מתחת לאמצע
    var panStart = null;            // { x, y, tx, ty }
    var lastTapT = 0, lastTapX = 0, lastTapY = 0;
    var moved = false;

    function clamp(v,a,b){ return Math.max(a, Math.min(b, v)); }
    function layout(){ return { L: img.offsetLeft, T: img.offsetTop, W: img.offsetWidth, H: img.offsetHeight, vw: body.clientWidth, vh: body.clientHeight }; }
    function contentX(clientX){ var r = body.getBoundingClientRect(); return clientX - r.left + body.scrollLeft; }
    function contentY(clientY){ var r = body.getBoundingClientRect(); return clientY - r.top + body.scrollTop; }

    function clampPan(){
        var m = layout(), sw = m.W * z.scale, sh = m.H * z.scale;
        z.tx = (sw <= m.vw) ? (m.vw - sw) / 2 - m.L : clamp(z.tx, m.vw - m.L - sw, -m.L);
        z.ty = (sh <= m.vh) ? (m.vh - sh) / 2 - m.T : clamp(z.ty, m.vh - m.T - sh, -m.T);
    }

    function apply(){
        if (z.scale <= 1.001) {
            z = { scale:1, tx:0, ty:0 };
            img.style.transform = '';
            img.style.touchAction = 'pan-x pan-y';
            body.style.overflow = '';
            return;
        }
        clampPan();
        img.style.transform = 'translate(' + z.tx + 'px,' + z.ty + 'px) scale(' + z.scale + ')';
        img.style.touchAction = 'none';
        body.style.overflow = 'hidden';
        body.scrollTop = 0; body.scrollLeft = 0;
    }

    function zoomTo(scale, cx, cy){
        // שומר את נקודת התוכן שמתחת ל-(cx,cy) באותו מקום על המסך
        var m = layout();
        var Sx = contentX(cx), Sy = contentY(cy);
        var pX = (Sx - m.L - z.tx) / z.scale, pY = (Sy - m.T - z.ty) / z.scale;
        z.scale = clamp(scale, 1, 6);
        z.tx = Sx - m.L - pX * z.scale;
        z.ty = Sy - m.T - pY * z.scale;
        apply();
    }

    function resetZoom(){ z = { scale:1, tx:0, ty:0 }; pointers.clear(); pinch = null; panStart = null; if (img) { img.style.transform=''; img.style.touchAction='pan-x pan-y'; } if (body) body.style.overflow=''; }

    function onDown(ev){
        if (ev.button != null && ev.button > 0) return;
        try { img.setPointerCapture(ev.pointerId); } catch (e) {}
        pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
        moved = false;
        if (pointers.size === 1) {
            panStart = { x: ev.clientX, y: ev.clientY, tx: z.tx, ty: z.ty };
        } else if (pointers.size === 2) {
            var pts = Array.from(pointers.values());
            var m = layout();
            var mx = contentX((pts[0].x + pts[1].x) / 2), my = contentY((pts[0].y + pts[1].y) / 2);
            pinch = {
                d0: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1,
                s0: z.scale,
                p0: { x: (mx - m.L - z.tx) / z.scale, y: (my - m.T - z.ty) / z.scale }
            };
            panStart = null;
            ev.preventDefault();
        }
    }

    function onMove(ev){
        var p = pointers.get(ev.pointerId);
        if (!p) return;
        p.x = ev.clientX; p.y = ev.clientY;
        if (pinch && pointers.size >= 2) {
            var pts = Array.from(pointers.values()).slice(0, 2);
            var d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1;
            var mx = contentX((pts[0].x + pts[1].x) / 2), my = contentY((pts[0].y + pts[1].y) / 2);
            z.scale = clamp(pinch.s0 * d / pinch.d0, 1, 6);
            var m = layout();
            z.tx = mx - m.L - pinch.p0.x * z.scale;
            z.ty = my - m.T - pinch.p0.y * z.scale;
            moved = true;
            apply();
            ev.preventDefault();
        } else if (panStart && z.scale > 1.001) {
            z.tx = panStart.tx + (ev.clientX - panStart.x);
            z.ty = panStart.ty + (ev.clientY - panStart.y);
            moved = true;
            apply();
            ev.preventDefault();
        } else if (panStart) {
            if (Math.hypot(ev.clientX - panStart.x, ev.clientY - panStart.y) > 12) moved = true;   // גרירה = לא טאפ
        }
    }

    function onUp(ev){
        pointers.delete(ev.pointerId);
        if (pinch && pointers.size < 2) {
            pinch = null;
            var rest = pointers.values().next().value;
            panStart = rest ? { x: rest.x, y: rest.y, tx: z.tx, ty: z.ty } : null;
            if (z.scale <= 1.001) apply();
        }
        if (pointers.size === 0) {
            if (!moved) {
                // דאבל-טאפ: מחליף בין זום 2.5x בנקודת הטאפ לתצוגה מלאה
                var now = Date.now();
                if (now - lastTapT < 350 && Math.hypot(ev.clientX - lastTapX, ev.clientY - lastTapY) < 30) {
                    if (z.scale > 1.001) resetZoomApply();
                    else zoomTo(2.5, ev.clientX, ev.clientY);
                    lastTapT = 0;
                } else {
                    lastTapT = now; lastTapX = ev.clientX; lastTapY = ev.clientY;
                }
            }
            panStart = null;
        }
    }

    function resetZoomApply(){ z = { scale:1, tx:0, ty:0 }; apply(); }

    function bind(){
        if (bound) return; bound = true;
        img = document.getElementById('imgViewerImg');
        body = document.querySelector('#imgViewerOverlay .iv-body');
        if (!img || !body) return;
        body.style.position = 'relative';
        img.style.transformOrigin = '0 0';
        img.style.touchAction = 'pan-x pan-y';
        img.draggable = false;
        img.addEventListener('pointerdown', onDown);
        img.addEventListener('pointermove', onMove);
        img.addEventListener('pointerup', onUp);
        img.addEventListener('pointercancel', onUp);
    }

    window.openImageViewer = function(url){
        if (!url) return;
        bind();
        resetZoom();
        document.getElementById('imgViewerImg').src = url;
        document.getElementById('imgViewerOverlay').classList.remove('hidden');
        if (!open) { open = true; try { history.pushState({ imgViewer:1 }, ''); } catch(e) {} }
    };
    function hide(){
        document.getElementById('imgViewerOverlay').classList.add('hidden');
        document.getElementById('imgViewerImg').src = '';
        resetZoom();
        open = false;
    }
    window.closeImageViewer = function(){
        if (open) { open = false; try { history.back(); return; } catch(e) {} }
        hide();
    };
    window.addEventListener('popstate', function(){ if (!document.getElementById('imgViewerOverlay').classList.contains('hidden')) hide(); });
})();
