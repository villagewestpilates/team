// Serves ./site locally and takes phone-width screenshots against the real server.
// Usage: node tools/shots.js <outDir>
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const ROOT = path.join(__dirname, '..', 'site');
const OUT = process.argv[2];
const K = require('../.test-token.json').k;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});

(async () => {
  await new Promise(r => server.listen(8765, r));
  const browser = await chromium.launch({ proxy: { server: process.env.HTTPS_PROXY, bypass: 'localhost,127.0.0.1' } });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, ignoreHTTPSErrors: true });
  const base = 'http://localhost:8765/';
  const results = [];
  async function shot(name, url, waitFor, before) {
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    if (before) await before(page);
    await page.goto(url);
    await page.waitForSelector(waitFor, { timeout: 45000 });
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(OUT, name + '.png') });
    results.push({ name, errors, overflowX: await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth) });
    return page;
  }
  const good = await shot('1-home', base + '?k=' + K, '.hello-name');
  results.push({ greeted: await good.textContent('.hello-name'), tabs: await good.$$eval('.tab', t => t.map(x => x.textContent)) });
  // Saved link: open again with no ?k, should still greet from localStorage.
  const again = await shot('2-saved', base, '.hello-name');
  results.push({ savedGreets: await again.textContent('.hello-name') });
  await again.click('[data-tab="team"]'); await again.waitForTimeout(300);
  await again.screenshot({ path: path.join(OUT, '3-tab.png') });
  await shot('4-badlink', base + '?k=thisisnotarealtokenatall12345', '.center h1');
  const fresh = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, ignoreHTTPSErrors: true });
  const p5 = await fresh.newPage(); await p5.goto(base); await p5.waitForSelector('.center h1');
  await p5.screenshot({ path: path.join(OUT, '5-nolink.png') });
  results.push({ noLink: await p5.textContent('.center h1') });
  // Offline: block the server call.
  const p6 = await fresh.newPage();
  await p6.route('**/script.google.com/**', r => r.abort());
  await p6.goto(base + '?k=' + K); await p6.waitForSelector('#retry');
  await p6.screenshot({ path: path.join(OUT, '6-offline.png') });
  results.push({ offline: await p6.textContent('.center h1') });
  // Skeleton: hold the server call.
  const p7 = await fresh.newPage();
  await p7.route('**/script.google.com/**', () => {});
  await p7.goto(base + '?k=' + K); await p7.waitForSelector('.sk');
  await p7.screenshot({ path: path.join(OUT, '7-loading.png') });
  console.log(JSON.stringify(results, null, 1));
  await browser.close(); server.close();
})().catch(e => { console.error(e); process.exit(1); });
