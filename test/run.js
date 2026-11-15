// Puppeteer runner for the invoice-split integration harness.
const puppeteer = require('/tmp/pptr/node_modules/puppeteer-core');
const { spawn } = require('child_process');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PORT = 8631;
const SCENARIOS = process.argv[2] ? process.argv[2].split(',') : ['saveall', 'ambiguity', 'cancel-resume', 'dupblock', 'print', 'supcollide', 'typecollide', 'allmissing', 'editresume', 'regroup-partial', 'reloadresume', 'savefault', 'mixedowner', 'partialclose'];
const RUN = String(Date.now());
const SHOTS = process.argv[3] === 'shots';

async function runScenario(browser, scenario) {
  const page = await browser.newPage();
  await page.setViewport({ width: 480, height: 900 });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`http://127.0.0.1:${PORT}/test-harness.html?scenario=${scenario}&run=${RUN}`, { waitUntil: 'domcontentloaded' });
  let settled = false;
  try {
    await page.waitForFunction(() => document.title === 'DONE' || document.title === 'FAIL', { timeout: 90000 });
    settled = true;
  } catch (e) {
    if (String(e).includes('Execution context')) {   // scenario reloaded the page (resume flow) - wait on the new context
      try { await page.waitForFunction(() => document.title === 'DONE' || document.title === 'FAIL', { timeout: 90000 }); settled = true; } catch (e2) {}
    }
  }
  if (!settled) {
    const title = await page.title();
    const body = await page.evaluate(() => document.body.innerText.slice(0, 800)).catch(() => '');
    console.log(`[${scenario}] TIMEOUT (title=${title})\n${body}\npage errors: ${errors.join(' | ')}`);
    await page.close();
    return false;
  }
  const title = await page.title();
  const logText = await page.evaluate(() => (document.getElementById('testlog') || {}).textContent || '');
  console.log(`[${scenario}] ${title}\n${logText}`);
  if (errors.length) console.log(`[${scenario}] page errors: ${errors.slice(0, 5).join(' | ')}`);
  await page.close();
  return title === 'DONE';
}

async function runShot(browser, scenario, waitExpr, file) {
  const page = await browser.newPage();
  await page.setViewport({ width: 480, height: 900 });
  await page.goto(`http://127.0.0.1:${PORT}/test-harness.html?scenario=${scenario}&run=${RUN}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(waitExpr, { timeout: 90000 });
  await new Promise(r => setTimeout(r, 600));
  await page.screenshot({ path: file });
  console.log(`[${scenario}] screenshot -> ${file}`);
  await page.close();
}

(async () => {
  const server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 800));
  const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--disable-gpu'] });
  let allOk = true;
  try {
    for (const s of SCENARIOS) allOk = (await runScenario(browser, s)) && allOk;
    if (SHOTS) {
      await runShot(browser, 'shot-summary', () => window.__shotReady === true, '/tmp/split_shot_summary.png');
      await runShot(browser, 'shot-form', () => window.__shotReady === true, '/tmp/split_shot_form.png');
      await runShot(browser, 'shot-ambiguity', () => window.__shotReady === true, '/tmp/split_shot_ambiguity.png');
    }
  } finally {
    await browser.close();
    server.kill();
  }
  console.log(allOk ? 'ALL SCENARIOS PASS' : 'SOME SCENARIOS FAILED');
  process.exit(allOk ? 0 : 1);
})();
