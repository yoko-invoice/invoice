// ---- כרטיסים מתקפלים ----
(function () {
    var KEY = 'invoices_folded_cards_v1';
    function load() { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { return {}; } }
    function save(o) { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) {} }
    function init() {
        var main = document.getElementById('mainView');
        if (!main || main.dataset.foldInit) return;
        main.dataset.foldInit = '1';
        var cards = [];
        Array.prototype.forEach.call(main.children, function (card) {
            if (!card.classList.contains('card')) return;
            var h = card.firstElementChild;
            if (!h || h.tagName !== 'H3') return;
            var key = h.textContent.trim().slice(0, 40);
            var body = document.createElement('div');
            body.className = 'card-body';
            while (h.nextSibling) body.appendChild(h.nextSibling);
            card.appendChild(body);
            card.classList.add('foldable');
            card.classList.add('folded');   // בכל פתיחה של האפליקציה הכול מקופל
            h.setAttribute('role', 'button');
            h.addEventListener('click', function () {
                card.classList.toggle('folded');
            });
            cards.push({ card: card, key: key });
        });
        if (!cards.length) return;
        var tools = document.createElement('div');
        tools.className = 'fold-tools';
        function setAll(fold) {
            cards.forEach(function (c) { c.card.classList.toggle('folded', fold); });
        }
        var b1 = document.createElement('button'); b1.textContent = '⬇ פתח הכול'; b1.onclick = function () { setAll(false); };
        var b2 = document.createElement('button'); b2.textContent = '⬆ סגור הכול'; b2.onclick = function () { setAll(true); };
        tools.appendChild(b1); tools.appendChild(b2);
        main.insertBefore(tools, main.firstElementChild);
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
