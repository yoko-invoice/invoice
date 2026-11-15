// Integration test driver for the invoice-split feature.
// Runs inside the app page (test-harness.html) against stubbed Firebase/recognition.
import { __store, __seed, __failNextWrite } from './firebase-stub.js';

const scenario = new URLSearchParams(location.search).get('scenario') || 'saveall';
const SUP = 'ספק בדיקה בע"מ';
const NUMS = ['22889733', '22889946', '22890297', '23094043'];
const DATES = ['2026-11-01', '2026-11-02', '2026-11-04', '2026-11-12'];
const AMTS = [130, 80, 115, 1717];
const INBOX_ID = 'manual_testhash1';
const ORIGINAL_PATH = 'yoko/invoices/inbox_testhash1.original';

window.__log = [];
window.__alerts = [];
window.__confirms = [];
window.__recogCalls = [];
window.__prints = 0;
window.__confirmScript = [];
window.__promptAnswer = SUP;

function log(name, ok, detail) {
  window.__log.push({ name, ok: !!ok, detail: detail || '' });
  console.log('[test]', ok ? 'ok' : 'FAIL', name, detail || '');
}
function finish(failed) {
  const pre = document.createElement('pre');
  pre.id = 'testlog';
  pre.textContent = window.__log.map(l => (l.ok ? 'ok ' : 'FAIL ') + l.name + (l.detail ? ' :: ' + l.detail : '')).join('\n');
  document.body.appendChild(pre);
  document.title = failed ? 'FAIL' : 'DONE';
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, label, timeout = 30000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    try { const v = fn(); if (v) return v; } catch (e) {}
    await sleep(100);
  }
  throw new Error('timeout waiting: ' + label);
}
const formVisible = () => { const f = document.getElementById('invoiceConfirmForm'); return f && !f.classList.contains('hidden'); };
const formTitle = () => (document.getElementById('confirmFormTitle') || {}).innerText || '';
const invoiceDocs = () => [...__store.keys()].filter(k => k.startsWith('yoko_invoices/')).map(k => ({ id: k.split('/')[1], ...__store.get(k) }));
const inboxDoc = () => __store.get('yoko_inbox/' + INBOX_ID);
const slug = s => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ').replace(/\//g, '') || '-';
const keyOf = (n, sup, kind) => INBOX_ID + '__' + (n ? 'n' + n : 'p1') + '__s' + slug(sup) + '__' + kind;

// ---- stubs (installed before the app's load-event boot runs) ----
localStorage.setItem('invoices_last_active_yoko', String(Date.now()));
window.appConfirm = async (msg) => {
  window.__confirms.push(String(msg));
  for (const r of window.__confirmScript) if (String(msg).includes(r.match)) return r.answer;
  return true;
};
window.appPrompt = async () => window.__promptAnswer;
const origAlert = window.alert;
window.alert = (m) => { window.__alerts.push(String(m)); origAlert(m); };
window.__toasts = [];
window.addEventListener('load', () => {
  const origToast = window.showToast;
  if (typeof origToast === 'function') window.showToast = (m, t) => { window.__toasts.push(String(m)); return origToast(m, t); };
});
window.print = () => { window.__prints = document.querySelectorAll('#printArea img').length; };

const realFetch = window.fetch.bind(window);
const pdfResp = await (await realFetch('test/sample.pdf')).arrayBuffer();
window.fetch = async (url, opts) => {
  const u = String(url);
  if (u.includes('recognizeinvoice')) {
    const body = JSON.parse(opts.body);
    if (body.headerOnly) return new Response(JSON.stringify({ result: {} }), { status: 200 });
    const idx = window.__pageLen[String(body.image).length];
    if (idx === undefined) return new Response(JSON.stringify({ error: 'unknown page image' }), { status: 400 });
    window.__recogCalls.push(idx);
    return new Response(JSON.stringify({ result: window.__canned[idx] }), { status: 200 });
  }
  if (u.startsWith('fake-download://')) return new Response(pdfResp.slice(0), { status: 200 });
  return realFetch(url, opts);
};

// canned recognition per page index
window.__canned = NUMS.map((n, i) => ({
  supplier: SUP, taxId: '515000001', invoiceNumber: n, invoiceDate: DATES[i],
  isCredit: i < 3, docType: 'invoice', amount: AMTS[i],
  items: [{ name: 'item' + (i + 1), quantity: 1, price: AMTS[i] }], paymentMethod: 'כרטיס אשראי', handwrittenNotes: []
}));
if (scenario === 'ambiguity' || scenario === 'regroup-partial' || scenario === 'mixedowner' || scenario === 'partialclose') {
  window.__canned[1] = { supplier: '', items: [{ name: 'cont', quantity: 1, price: 80 }], handwrittenNotes: [] };
}
if (scenario === 'allmissing') {
  window.__canned = AMTS.map((a, i) => ({
    supplier: SUP, taxId: '515000001', invoiceDate: DATES[i], docType: 'invoice', amount: a,
    items: [{ name: 'item' + (i + 1), quantity: 1, price: a }], paymentMethod: 'כרטיס אשראי', handwrittenNotes: []
  }));
}
if (scenario === 'supcollide' || scenario === 'typecollide') {
  const mk = (sup, credit, amt, i) => ({
    supplier: sup, taxId: '515000001', invoiceNumber: '555', invoiceDate: DATES[i], isCredit: credit, docType: 'invoice',
    amount: amt, items: [{ name: 'item', quantity: 1, price: amt }], paymentMethod: 'כרטיס אשראי', handwrittenNotes: []
  });
  window.__canned = scenario === 'supcollide'
    ? [mk('ספק א', false, 100, 0), mk('ספק א', false, 100, 1), mk('ספק ב', false, 200, 2), mk('ספק ב', false, 200, 3)]
    : [mk(SUP, false, 100, 0), mk(SUP, false, 100, 1), mk(SUP, true, 300, 2), mk(SUP, true, 300, 3)];
}

// pre-render the PDF exactly like pdfFileToPagesBase64 to key recognition responses
const pdf = await window.pdfjsLib.getDocument({ data: pdfResp.slice(0) }).promise;
window.__pageLen = {};
for (let i = 1; i <= pdf.numPages; i++) {
  const page = await pdf.getPage(i);
  const viewport = page.getViewport({ scale: 2 });
  const canvas = document.createElement('canvas');
  canvas.width = viewport.width; canvas.height = viewport.height;
  await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
  window.__pageLen[String(canvas.toDataURL('image/jpeg', 0.9).split(',')[1].length)] = i - 1;
}

// seed the pending queue item + its stored original
if (!__store.has('yoko_inbox/' + INBOX_ID)) __seed('yoko_inbox/' + INBOX_ID, {
  status: 'pending', source: 'device', originalPath: ORIGINAL_PATH,
  filename: 'sample.pdf', mime: 'application/pdf', mailDate: new Date().toISOString(), fields: {}, printStatus: 'needed'
});
if (scenario === 'dupblock' && !__store.has('yoko_invoices/existing_dup')) {
  __seed('yoko_invoices/existing_dup', {
    id: 'existing_dup', docType: 'invoice', supplier: SUP, invoiceNumber: '22889946',
    invoiceDate: '2026-11-02', amount: -80, monthKey: '2026-11', items: []
  });
}

// ---- flow helpers ----
async function openItemFromInbox() {
  await waitFor(() => document.getElementById('inboxFab'), 'inbox button');
  window.openInboxModal();
  const btn = await waitFor(() => [...document.querySelectorAll('#inboxModalBox button')].find(b => b.textContent.includes('פתח לבדיקה')), 'open-item button');
  btn.click();
}
async function waitSummary() { return waitFor(() => document.getElementById('splitSummaryOverlay'), 'split summary'); }
function clickOkSummary() { document.querySelector('#splitSummaryOverlay #splitSummaryOk').click(); }
async function waitDocForm(k, total) {
  await waitFor(() => formVisible() && formTitle().includes('מסמך ' + k + ' מתוך ' + total), 'doc form ' + k);
}
function fillSupplierAndSave(supName) {
  if (supName) window.__promptAnswer = supName;
  const sel = document.getElementById('invoiceSupplierSelect');
  sel.value = '__other__';
  document.getElementById('saveInvoiceBtn').click();
}
async function waitSavedAlert(minCount) {
  await waitFor(() => window.__alerts.filter(a => a.includes('נשמרה בהצלחה')).length >= minCount, 'saved alert ' + minCount);
}
async function waitOkAlert(minCount) {
  await waitFor(() => window.__alerts.filter(a => a.includes('בהצלחה')).length >= minCount, 'success alert ' + minCount);
}

try {
  // wait for the app to boot into the main view
  await waitFor(() => !document.getElementById('mainView').classList.contains('hidden'), 'app unlock');

  if (scenario === 'saveall') {
    await openItemFromInbox();
    const ov = await waitSummary();
    log('summary title 4 docs', ov.textContent.includes('זוהו 4 מסמכים נפרדים בקובץ'));
    log('no ambiguity radios', !ov.querySelector('input[type=radio]'));
    log('credit labels', (ov.textContent.match(/חשבונית זיכוי/g) || []).length === 3);
    log('ltr amounts', (ov.innerHTML.match(/dir="ltr">-?\d+ ₪/g) || []).length === 4);
    clickOkSummary();
    for (let k = 1; k <= 4; k++) {
      await waitDocForm(k, 4);
      const num = document.getElementById('invoiceNumberInput').value;
      const amt = parseFloat(document.getElementById('invoiceAmountInput').value);
      log('doc' + k + ' number', num === NUMS[k - 1], num);
      log('doc' + k + ' amount', amt === (k < 4 ? -AMTS[k - 1] : AMTS[k - 1]), String(amt));
      fillSupplierAndSave();
      await waitSavedAlert(k);
      if (k < 4) {
        log('inbox still pending after doc' + k, inboxDoc() && inboxDoc().status === 'pending');
      }
    }
    await waitFor(() => inboxDoc() && inboxDoc().status === 'approved', 'inbox approved');
    const docs = invoiceDocs();
    log('4 invoice docs', docs.length === 4, docs.map(d => d.id).join(','));
    log('stable full-identity ids', NUMS.every((n, i) => docs.some(d => d.id === keyOf(n, SUP, i < 3 ? 'credit' : 'invoice'))));
    log('credit signs', docs.filter(d => d.amount < 0).length === 3);
    log('single recognition round', window.__recogCalls.length === 4);
  }

  else if (scenario === 'ambiguity') {
    await openItemFromInbox();
    const ov = await waitSummary();
    log('summary 3 initial docs', ov.textContent.includes('זוהו 3 מסמכים נפרדים בקובץ'));
    log('decision row for page 2', ov.textContent.includes('עמוד 2 - לא נקרא מספר חשבונית'));
    log('page 2 offers continue/new/next', [...ov.querySelectorAll('input[name="splitDec1"]')].map(r => r.value).join(',') === 'continue,new,next');
    log('ok disabled before decision', ov.querySelector('#splitSummaryOk').disabled);
    // choose "new document" for page 2 -> 4 groups
    ov.querySelector('input[name="splitDec1"][value="new"]').click();
    const ov2 = await waitFor(() => document.querySelector('#splitSummaryTitle'), 'rerender');
    log('regroup new -> 4 docs', ov2.textContent.includes('זוהו 4 מסמכים'));
    log('no-number note shown', document.getElementById('splitSummaryOverlay').textContent.includes('ללא מספר שזוהה - יושלם ידנית'));
    // switch back to "continue" -> 3 groups
    document.querySelector('input[name="splitDec1"][value="continue"]').click();
    await waitFor(() => document.querySelector('#splitSummaryTitle').textContent.includes('זוהו 3 מסמכים'), 'regroup back');
    log('regroup continue -> 3 docs', true);
    log('ok enabled after decision', !document.querySelector('#splitSummaryOk').disabled);
    clickOkSummary();
    await waitDocForm(1, 3);
    log('doc1 number', document.getElementById('invoiceNumberInput').value === '22889733');
    fillSupplierAndSave();
    await waitSavedAlert(1);
    const d1 = invoiceDocs().find(d => d.id === keyOf('22889733', SUP, 'credit'));
    log('doc1 saved with 2 pages merged', d1 && d1.pageCount === 2, d1 && String(d1.pageCount));
    await waitDocForm(2, 3);
    // cancel mid-split: queue must stay open
    [...document.querySelectorAll('#invoiceConfirmForm button')].find(b => b.textContent.trim() === 'ביטול').click();
    await sleep(300);
    log('inbox pending after cancel', inboxDoc() && inboxDoc().status === 'pending');
    log('only doc1 saved', invoiceDocs().length === 1);
  }

  else if (scenario === 'cancel-resume') {
    await openItemFromInbox();
    await waitSummary();
    clickOkSummary();
    await waitDocForm(1, 4);
    fillSupplierAndSave();
    await waitSavedAlert(1);
    await waitDocForm(2, 4);
    [...document.querySelectorAll('#invoiceConfirmForm button')].find(b => b.textContent.trim() === 'ביטול').click();
    await sleep(300);
    log('1 doc saved before cancel', invoiceDocs().length === 1);
    log('inbox pending after cancel', inboxDoc() && inboxDoc().status === 'pending');
    log('ownership persisted on queue item', inboxDoc().splitOwners && inboxDoc().splitOwners['1'] === keyOf('22889733', SUP, 'credit'));
    // resume: recognition runs again, but doc1 pages are owned -> offer edit, not a new record
    await openItemFromInbox();
    await waitSummary();
    clickOkSummary();
    window.__confirmScript = [{ match: 'כבר נשמר', answer: true }];
    await waitFor(() => formVisible(), 'edit form for owned doc');
    log('ownership edit confirm shown', window.__confirms.some(c => c.includes('כבר נשמר')));
    log('existing record opened with its values', document.getElementById('invoiceNumberInput').value === '22889733');
    fillSupplierAndSave();
    await waitOkAlert(2);
    const docs = invoiceDocs();
    log('resume update kept single record', docs.length === 1 && docs[0].id === keyOf('22889733', SUP, 'credit'), docs.map(d => d.id).join(','));
    log('second recognition round happened', window.__recogCalls.length === 8, String(window.__recogCalls.length));
    await waitDocForm(2, 4);
    [...document.querySelectorAll('#invoiceConfirmForm button')].find(b => b.textContent.trim() === 'ביטול').click();
  }

  else if (scenario === 'dupblock') {
    await openItemFromInbox();
    await waitSummary();
    clickOkSummary();
    await waitDocForm(1, 4);
    fillSupplierAndSave();
    await waitSavedAlert(1);
    await waitDocForm(2, 4);
    log('duplicate box shown on doc2', !document.getElementById('duplicateWarningBox').classList.contains('hidden'));
    log('duplicate alert fired', window.__alerts.some(a => a.includes('כבר קיימת במאגר')));
    window.__confirmScript = [{ match: 'כבר קיימת', answer: false }];
    fillSupplierAndSave();
    await sleep(600);
    log('blocked save left form open', formVisible());
    log('no second record for dup number', invoiceDocs().filter(d => d.invoiceNumber === '22889946').length === 1);
    log('inbox still pending', inboxDoc() && inboxDoc().status === 'pending');
    [...document.querySelectorAll('#invoiceConfirmForm button')].find(b => b.textContent.trim() === 'ביטול').click();
  }

  else if (scenario === 'print') {
    await openItemFromInbox();
    await waitSummary();
    clickOkSummary();
    await waitDocForm(1, 4);
    const sel = document.getElementById('invoiceSupplierSelect');
    sel.value = '__other__';
    document.getElementById('saveAndPrintBtn').click();
    await waitSavedAlert(1);
    await sleep(500);
    log('print fired with 1 page', window.__prints === 1, String(window.__prints));
    await waitDocForm(2, 4);
    log('split continued to doc2 after print', true);
    log('doc1 saved', invoiceDocs().some(d => d.id === keyOf('22889733', SUP, 'credit')));
  }

  else if (scenario === 'supcollide') {
    await openItemFromInbox();
    const ov = await waitSummary();
    log('same number two suppliers -> 2 docs', ov.textContent.includes('זוהו 2 מסמכים'));
    clickOkSummary();
    await waitDocForm(1, 2);
    fillSupplierAndSave('ספק א');
    await waitSavedAlert(1);
    await waitDocForm(2, 2);
    fillSupplierAndSave('ספק ב');
    await waitSavedAlert(2);
    await waitFor(() => inboxDoc() && inboxDoc().status === 'approved', 'inbox approved');
    const dA = invoiceDocs().find(d => d.id === keyOf('555', 'ספק א', 'invoice'));
    const dB = invoiceDocs().find(d => d.id === keyOf('555', 'ספק ב', 'invoice'));
    log('same number saved per supplier', !!dA && !!dB, invoiceDocs().map(d => d.id).join(','));
    log('amounts not clobbered', dA && dA.amount === 100 && dB && dB.amount === 200);
    log('no collision fallback used', !invoiceDocs().some(d => d.id.includes('__x')));
  }

  else if (scenario === 'typecollide') {
    await openItemFromInbox();
    const ov = await waitSummary();
    log('same number invoice+credit -> 2 docs', ov.textContent.includes('זוהו 2 מסמכים'));
    clickOkSummary();
    await waitDocForm(1, 2);
    fillSupplierAndSave();
    await waitSavedAlert(1);
    await waitDocForm(2, 2);
    fillSupplierAndSave();
    await waitSavedAlert(2);
    await waitFor(() => inboxDoc() && inboxDoc().status === 'approved', 'inbox approved');
    const dI = invoiceDocs().find(d => d.id === keyOf('555', SUP, 'invoice'));
    const dC = invoiceDocs().find(d => d.id === keyOf('555', SUP, 'credit'));
    log('same number saved per doc type', !!dI && !!dC, invoiceDocs().map(d => d.id).join(','));
    log('invoice +100 / credit -300', dI && dI.amount === 100 && dC && dC.amount === -300);
  }

  else if (scenario === 'allmissing') {
    await openItemFromInbox();
    const ov = await waitSummary();
    log('single initial group still opens decision screen', ov.textContent.includes('זוהו 1 מסמכים'));
    log('all 4 pages need a decision', [...ov.querySelectorAll('input[type=radio]')].length > 0 && ov.querySelectorAll('input[name="splitDec3"]').length > 0);
    log('page 1 has no continue option', !ov.querySelector('input[name="splitDec0"][value="continue"]'));
    log('no numbered page -> no next option at all', !ov.querySelector('input[name="splitDec0"][value="next"]') && !ov.querySelector('input[name="splitDec3"][value="next"]'));
    log('ok disabled before decisions', ov.querySelector('#splitSummaryOk').disabled);
    for (let i = 0; i < 4; i++) document.querySelector('input[name="splitDec' + i + '"][value="new"]').click();
    await waitFor(() => document.querySelector('#splitSummaryTitle').textContent.includes('זוהו 4 מסמכים'), 'regroup 4');
    log('all new -> 4 docs', true);
    for (let i = 1; i < 4; i++) document.querySelector('input[name="splitDec' + i + '"][value="continue"]').click();
    await waitFor(() => document.querySelector('#splitSummaryTitle').textContent.includes('זוהו 1 מסמכים'), 'regroup 1');
    log('new+continue -> 1 doc', true);
    clickOkSummary();
    await waitFor(() => formVisible(), 'single-doc form');
    document.getElementById('invoiceNumberInput').value = '777';
    fillSupplierAndSave();
    await waitSavedAlert(1);
    await waitFor(() => inboxDoc() && inboxDoc().status === 'approved', 'inbox approved');
    const d = invoiceDocs().find(x => x.id === keyOf('777', SUP, 'invoice'));
    log('saved under typed number', !!d, invoiceDocs().map(x => x.id).join(','));
    log('all 4 pages kept', d && d.pageCount === 4, d && String(d.pageCount));
  }

  else if (scenario === 'editresume') {
    await openItemFromInbox();
    await waitSummary();
    clickOkSummary();
    await waitDocForm(1, 4);
    document.getElementById('invoiceNumberInput').value = '99999';
    fillSupplierAndSave();
    await waitSavedAlert(1);
    const edited = invoiceDocs().find(d => d.invoiceNumber === '99999');
    log('edited identity saved under edited key', edited && edited.id === keyOf('99999', SUP, 'credit'), edited && edited.id);
    log('ownership meta kept', inboxDoc().splitOwnersMeta && inboxDoc().splitOwnersMeta[edited.id].number === '99999');
    await waitDocForm(2, 4);
    [...document.querySelectorAll('#invoiceConfirmForm button')].find(b => b.textContent.trim() === 'ביטול').click();
    await sleep(300);
    // resume with edit: the edited record opens, no second record
    await openItemFromInbox();
    await waitSummary();
    clickOkSummary();
    window.__confirmScript = [{ match: 'כבר נשמר', answer: true }];
    await waitFor(() => formVisible(), 'edit form for edited doc');
    log('edited identity retained for edit', document.getElementById('invoiceNumberInput').value === '99999');
    fillSupplierAndSave();
    await waitOkAlert(2);
    let docs = invoiceDocs();
    const orig = docs.find(d => d.id === keyOf('99999', SUP, 'credit'));
    log('no duplicate after edit-resume', docs.length === 1 && !!orig, docs.map(d => d.id).join(','));
    log('edited doc preserved', orig && orig.amount === -130 && orig.invoiceNumber === '99999');
    log('no false duplicate block', !window.__confirms.some(c => c.includes('כבר קיימת')));
    // resume again with skip: doc1 skipped, doc2 opens fresh
    await openItemFromInbox();
    await waitSummary();
    clickOkSummary();
    window.__confirmScript = [{ match: 'כבר נשמר', answer: false }];
    await waitDocForm(2, 4);
    log('skip advanced to doc2 fresh form', document.getElementById('invoiceNumberInput').value === '22889946');
    docs = invoiceDocs();
    log('still one record after skip', docs.length === 1, docs.map(d => d.id).join(','));
    log('inbox still pending', inboxDoc() && inboxDoc().status === 'pending');
    [...document.querySelectorAll('#invoiceConfirmForm button')].find(b => b.textContent.trim() === 'ביטול').click();
  }

  else if (scenario === 'regroup-partial') {
    // pages: [22889733, unnumbered, 22890297, 23094043]; run 1: page2 continues doc1
    await openItemFromInbox();
    const ov = await waitSummary();
    ov.querySelector('input[name="splitDec1"][value="continue"]').click();
    await waitFor(() => document.querySelector('#splitSummaryTitle').textContent.includes('זוהו 3 מסמכים'), 'regroup 3');
    clickOkSummary();
    await waitDocForm(1, 3);
    fillSupplierAndSave();
    await waitSavedAlert(1);
    const d1id = keyOf('22889733', SUP, 'credit');
    log('pages 1-2 owned by doc1', inboxDoc().splitOwners && inboxDoc().splitOwners['1'] === d1id && inboxDoc().splitOwners['2'] === d1id);
    await waitDocForm(2, 3);
    [...document.querySelectorAll('#invoiceConfirmForm button')].find(b => b.textContent.trim() === 'ביטול').click();
    await sleep(300);
    // run 2: change the decision - page2 is now "new document"; both page1 and page2 groups are owned
    await openItemFromInbox();
    await waitSummary();
    document.querySelector('input[name="splitDec1"][value="new"]').click();
    await waitFor(() => document.querySelector('#splitSummaryTitle').textContent.includes('זוהו 4 מסמכים'), 'regroup 4');
    clickOkSummary();
    window.__confirmScript = [{ match: 'כבר נשמר', answer: false }];   // skip owned docs
    await waitFor(() => formVisible() && document.getElementById('invoiceNumberInput').value === '22890297', 'page3 fresh form');
    log('regroup did not duplicate owned pages', invoiceDocs().length === 1);
    log('two owned docs were skipped', window.__confirms.filter(c => c.includes('כבר נשמר')).length === 2);
    fillSupplierAndSave();
    await waitSavedAlert(2);
    const docs = invoiceDocs();
    log('page3 saved fresh', docs.length === 2 && docs.some(d => d.id === keyOf('22890297', SUP, 'credit')), docs.map(d => d.id).join(','));
    log('edited doc untouched', docs.find(d => d.id === d1id) && docs.find(d => d.id === d1id).invoiceNumber === '22889733');
    await waitDocForm(4, 4);
    [...document.querySelectorAll('#invoiceConfirmForm button')].find(b => b.textContent.trim() === 'ביטול').click();
    log('inbox still pending', inboxDoc() && inboxDoc().status === 'pending');
  }

  else if (scenario === 'reloadresume') {
    const phase = new URLSearchParams(location.search).get('phase') || '1';
    if (phase === '1') {
      await openItemFromInbox();
      await waitSummary();
      clickOkSummary();
      await waitDocForm(1, 4);
      fillSupplierAndSave();
      await waitSavedAlert(1);
      await waitDocForm(2, 4);
      [...document.querySelectorAll('#invoiceConfirmForm button')].find(b => b.textContent.trim() === 'ביטול').click();
      await sleep(300);
      log('saved before reload', invoiceDocs().length === 1);
      const q = new URLSearchParams(location.search); q.set('phase', '2');
      location.href = location.pathname + '?' + q.toString();   // real reload - ownership must survive
      await new Promise(() => {});
    } else {
      await openItemFromInbox();
      await waitSummary();
      clickOkSummary();
      window.__confirmScript = [{ match: 'כבר נשמר', answer: false }];
      await waitDocForm(2, 4);
      log('ownership survived reload (skip offered)', window.__confirms.some(c => c.includes('כבר נשמר')));
      log('doc2 opens fresh after skip', document.getElementById('invoiceNumberInput').value === '22889946');
      log('single record preserved across reload', invoiceDocs().length === 1);
      [...document.querySelectorAll('#invoiceConfirmForm button')].find(b => b.textContent.trim() === 'ביטול').click();
    }
  }

  else if (scenario === 'savefault') {
    await openItemFromInbox();
    await waitSummary();
    clickOkSummary();
    await waitDocForm(1, 4);
    __failNextWrite('yoko_inbox/');   // the ownership write fails inside the batch -> whole save must roll back
    fillSupplierAndSave();
    await waitFor(() => window.__alerts.some(a => a.includes('שגיאה בשמירת')), 'save error alert');
    log('failed save alerted', true);
    log('no numbered invoice record written', !invoiceDocs().some(d => d.invoiceNumber === '22889733'));
    log('no ownership claimed on failure', !inboxDoc().splitOwners || !inboxDoc().splitOwners['1']);
    log('form stays open after failure', formVisible());
    log('inbox still pending', inboxDoc() && inboxDoc().status === 'pending');
    fillSupplierAndSave();   // retry without failure
    await waitSavedAlert(1);
    const docs = invoiceDocs();
    log('retry saved single record', docs.length === 1 && docs[0].id === keyOf('22889733', SUP, 'credit'), docs.map(d => d.id).join(','));
    log('ownership claimed after success', inboxDoc().splitOwners && inboxDoc().splitOwners['1'] === docs[0].id);
    await waitDocForm(2, 4);
    [...document.querySelectorAll('#invoiceConfirmForm button')].find(b => b.textContent.trim() === 'ביטול').click();
  }

  else if (scenario === 'mixedowner') {
    // run 1: page2 continues doc1 -> doc1 = pages 1-2 saved; cancel at doc2
    await openItemFromInbox();
    const ov = await waitSummary();
    ov.querySelector('input[name="splitDec1"][value="continue"]').click();
    await waitFor(() => document.querySelector('#splitSummaryTitle').textContent.includes('זוהו 3 מסמכים'), 'regroup 3');
    clickOkSummary();
    await waitDocForm(1, 3);
    fillSupplierAndSave();
    await waitSavedAlert(1);
    await waitDocForm(2, 3);
    [...document.querySelectorAll('#invoiceConfirmForm button')].find(b => b.textContent.trim() === 'ביטול').click();
    await sleep(300);
    // run 2: page2 declared "part of next" -> group [2,3] mixes saved page 2 with unsaved page 3
    await openItemFromInbox();
    await waitSummary();
    document.querySelector('input[name="splitDec1"][value="next"]').click();
    await waitFor(() => document.querySelector('#splitSummaryTitle').textContent.includes('זוהו 3 מסמכים'), 'regroup mixed');
    clickOkSummary();
    window.__confirmScript = [{ match: 'כבר נשמר בעבר', answer: false }, { match: 'שים לב', answer: false }];
    await waitFor(() => formVisible() && document.getElementById('invoiceNumberInput').value === '22890297', 'mixed group form');
    window.__step = 'mix1';
    log('fully-owned doc skipped first', window.__confirms.some(c => c.includes('כבר נשמר בעבר')));
    window.__step = 'mix2';
    log('mixed warning shown', window.__confirms.some(c => c.includes('שים לב')));
    const boxes = [...document.querySelectorAll('#pageSelectorBox input[type=checkbox]')];
    window.__step = 'mix3';
    log('owned page unchecked, unsaved kept', boxes.length === 2 && !boxes[0].checked && boxes[1].checked, boxes.map(b => b.checked).join(','));
    fillSupplierAndSave();
    await waitSavedAlert(2);
    const d3 = invoiceDocs().find(d => d.id === keyOf('22890297', SUP, 'credit'));
    window.__step = 'mix4';
    log('only unsaved page saved', d3 && d3.pageCount === 1, d3 && String(d3.pageCount));
    log('items only from unsaved page', d3 && d3.items.length === 1 && d3.items[0].name === 'item3', d3 && JSON.stringify(d3.items));
    log('amount from unsaved page only', d3 && d3.amount === -115, d3 && String(d3.amount));
    window.__step = 'mix5';
    log('page 2 still owned by doc1', inboxDoc().splitOwners['2'] === keyOf('22889733', SUP, 'credit'));
    window.__step = 'mix6';
    log('page 3 owned by new record', inboxDoc().splitOwners['3'] === d3.id);
    await waitDocForm(3, 3);
    fillSupplierAndSave();
    await waitSavedAlert(3);
    await waitFor(() => inboxDoc() && inboxDoc().status === 'approved', 'inbox approved only after all pages saved');
    window.__step = 'mix7';
    log('inbox approved when complete', true);
    window.__step = 'mix8';
    log('no duplicate records', invoiceDocs().length === 3, invoiceDocs().map(d => d.id).join(','));
  }

  else if (scenario === 'partialclose') {
    await openItemFromInbox();
    const ov = await waitSummary();
    ov.querySelector('input[name="splitDec1"][value="continue"]').click();
    await waitFor(() => document.querySelector('#splitSummaryTitle').textContent.includes('זוהו 3 מסמכים'), 'regroup 3');
    clickOkSummary();
    await waitDocForm(1, 3);
    [...document.querySelectorAll('#pageSelectorBox input[type=checkbox]')][1].click();   // uncheck doc1's second page
    await sleep(400);
    fillSupplierAndSave();
    await waitSavedAlert(1);
    log('doc1 saved without page 2', invoiceDocs().length === 1 && invoiceDocs()[0].pageCount === 1);
    log('page 2 not owned', !inboxDoc().splitOwners || !inboxDoc().splitOwners['2']);
    for (let k = 2; k <= 3; k++) {
      await waitDocForm(k, 3);
      fillSupplierAndSave();
      await waitSavedAlert(k);
    }
    await sleep(400);
    log('inbox NOT closed with unowned page', inboxDoc() && inboxDoc().status === 'pending');
    log('user told which pages remain', window.__toasts && window.__toasts.some(t => t.includes('עמודים 2')), JSON.stringify(window.__toasts || []));
  }

  else if (scenario === 'shot-ambiguity') {
    if (window.__canned[1].invoiceNumber) window.__canned[1] = { supplier: '', items: [{ name: 'cont', quantity: 1, price: 80 }], handwrittenNotes: [] };
    await openItemFromInbox();
    await waitSummary();
    window.__shotReady = true;
    throw { __shot: true };
  }

  else if (scenario === 'shot-summary') {
    await openItemFromInbox();
    await waitSummary();
    window.__shotReady = true;
    throw { __shot: true }; // runner screenshots; leave page open
  }
  else if (scenario === 'shot-form') {
    await openItemFromInbox();
    await waitSummary();
    clickOkSummary();
    await waitDocForm(1, 4);
    window.__shotReady = true;
    throw { __shot: true };
  }

  const fails = window.__log.filter(l => !l.ok).length;
  finish(fails > 0);
} catch (e) {
  if (e && e.__shot) { /* screenshot scenario: leave the page as-is for the runner */ }
  else {
    log('driver exception', false, (window.__step || '?') + ' :: ' + String(e && (e.stack || e.message) || e).slice(0,400));
    finish(true);
  }
}
