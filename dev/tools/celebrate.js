// Shows the celebration mid-burst and checks it cleans up after itself. Faked server.
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const ROOT = path.join(__dirname, '..', 'site'); const OUT = process.argv[2];
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.woff2': 'font/woff2', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
  const f = path.join(ROOT, p); if (!f.startsWith(ROOT) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
});
const log = []; const check = (n, ok, x) => log.push((ok ? 'PASS ' : 'FAIL ') + n + (x ? '  [' + x + ']' : ''));
async function run(browser, reduce) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, reducedMotion: reduce ? 'reduce' : 'no-preference' });
  const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(String(e)));
  const post = { id: 'a', title: 'Studio closed Thursday', body: 'Short.', categoryId: 'c', pinned: false, needsRead: true, readBy: '', eventDate: '', author: 'Barbara', mine: false, createdAt: '2026-11-23T15:00:00Z', updated: false, buttonText: '', links: [], forMe: true, readAt: '', photo: null };
  await page.route('**/script.google.com/**', route => { const q = JSON.parse(route.request().postData()); route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(q.action === 'boot' ? { ok: true, me: { id: 'p', name: 'Megan Hopkins', firstName: 'Megan', role: 'member' }, settings: { beta: true }, categories: [{ id: 'c', name: 'Announcements', color: '#3F5FC0' }], posts: [post], resources: [], contacts: [] } : { ok: true, readAt: new Date().toISOString() }) }); });
  await page.goto('http://localhost:8777/?k=' + 'k'.repeat(30)); await page.waitForSelector('.post-card');
  if (!reduce) {
    const b = await page.evaluate(() => { const beta = document.querySelector('.beta').getBoundingClientRect(), logo = document.querySelector('.wordmark-img').getBoundingClientRect(); const mid = r => (r.left + r.right) / 2; return { above: beta.bottom <= logo.top, betaC: Math.abs(mid(beta) - window.innerWidth / 2) < 2, logoC: Math.abs(mid(logo) - window.innerWidth / 2) < 2 }; });
    check('Beta tag sits above the logo, both centered', b.above && b.betaC && b.logoC, JSON.stringify(b));
    await page.screenshot({ path: path.join(OUT, 'header-beta-above.png'), clip: { x: 0, y: 0, width: 390, height: 230 } });
  }
  await page.click('.post-card'); await page.waitForSelector('#markread'); await page.click('#markread'); await page.waitForSelector('.done');
  await page.waitForTimeout(700);
  const bits = await page.$$eval('.party .bit', e => e.length).catch(() => 0);
  if (reduce) { check('reduced motion setting: no celebration, screen still shows', bits === 0 && !!(await page.$('.done h1'))); }
  else {
    check('celebration plays when caught up', bits > 30, bits + ' pieces');
    check('it never blocks taps', (await page.evaluate(() => getComputedStyle(document.querySelector('.party')).pointerEvents)) === 'none');
    await page.screenshot({ path: path.join(OUT, 'celebrate.png') });
    await page.click('[data-home]'); check('Back to Home works during it', !!(await page.waitForSelector('.calm')));
    await page.waitForTimeout(2600); check('it cleans up after itself', !(await page.$('.party')));
  }
  check((reduce ? 'reduced motion' : 'celebration') + ': no script errors', errors.length === 0, errors.join(' | '));
  await ctx.close();
}
(async () => {
  await new Promise(r => server.listen(8777, r));
  const browser = await chromium.launch();
  await run(browser, false); await run(browser, true);
  console.log(log.join('\n')); await browser.close(); server.close();
})().catch(e => { console.log(log.join('\n')); console.error(e); process.exit(1); });
