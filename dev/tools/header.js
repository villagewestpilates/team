// Shows the Home header at four times of day and checks it fits. Faked server.
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
(async () => {
  await new Promise(r => server.listen(8775, r));
  const browser = await chromium.launch(); const shots = [];
  const cases = [['07:44', 'Good morning', 'tod-morning', 'Megan'], ['13:05', 'Good afternoon', 'tod-afternoon', 'Megan'], ['18:30', 'Good evening', 'tod-evening', 'Megan'], ['22:15', 'Good evening', 'tod-night', 'Christine-Alexandra']];
  for (const [time, word, cls, name] of cases) {
    const ctx = await browser.newContext({ viewport: { width: name.length > 8 ? 320 : 390, height: 844 }, deviceScaleFactor: 2, timezoneId: 'America/New_York' });
    const page = await ctx.newPage();
    await page.clock.install({ time: new Date('2026-11-25T' + time + ':00-05:00') });
    await page.route('**/script.google.com/**', route => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ ok: true, me: { id: 'p', name: name + ' H', firstName: name, role: 'member' }, settings: { beta: true }, categories: [{ id: 'c', name: 'Announcements', color: '#3F5FC0' }], posts: [], canPost: false, people: [], resources: [], contacts: [] }) }));
    await page.goto('http://localhost:8775/?k=' + 'k'.repeat(30)); await page.waitForSelector('.top'); await page.waitForTimeout(400);
    const got = await page.evaluate(() => ({ word: document.querySelector('.hello-small').textContent, cls: document.querySelector('.tod').className, day: document.querySelector('.stamp-day').textContent, time: document.querySelector('.stamp-time').textContent, centered: Math.abs((document.querySelector('.top-brand').getBoundingClientRect().left + document.querySelector('.top-brand').getBoundingClientRect().right) / 2 - window.innerWidth / 2) < 2, logoAbove: document.querySelector('.wordmark-img').getBoundingClientRect().bottom < document.querySelector('.hello').getBoundingClientRect().top, fits: document.documentElement.scrollWidth <= window.innerWidth, nameCut: document.querySelector('.hello-name').scrollWidth > document.querySelector('.hello-name').clientWidth, logoOk: document.querySelector('.wordmark-img').naturalWidth > 0 }));
    const [hh, mm] = time.split(':').map(Number); const expect = ((hh % 12) || 12) + ':' + String(mm).padStart(2, '0') + (hh < 12 ? ' AM' : ' PM');
    check(time + ' ' + word + ' with the right icon', got.word === word && got.cls.includes(cls), got.word + ' ' + got.cls);
    check(time + ' stamp shows the day and time', got.day === 'Wed, Nov 25' && got.time.replace(/ /g, ' ') === expect, got.day + ' / ' + got.time);
    check(time + ' logo is centered above the greeting and loads', got.centered && got.logoAbove && got.logoOk);
    check(time + ' fits the screen' + (name.length > 8 ? ' (narrow phone, long name)' : ''), got.fits);
    const f = path.join(OUT, 'header-' + time.replace(':', '') + '.png'); await page.screenshot({ path: f, clip: { x: 0, y: 0, width: name.length > 8 ? 320 : 390, height: 250 } }); shots.push(f);
    if (time === '07:44') { await page.clock.fastForward(61000); await page.waitForTimeout(200); check('the clock keeps time while the app is open', (await page.textContent('#stamp-time')).replace(/ /g, ' ') === '7:45 AM', await page.textContent('#stamp-time')); await page.screenshot({ path: path.join(OUT, 'home-morning.png') }); }
    await ctx.close();
  }
  const pg = await browser.newPage({ viewport: { width: 820, height: 560 }, deviceScaleFactor: 2 });
  await pg.setContent('<body style="margin:0;background:#DDD;display:grid;grid-template-columns:390px 390px;gap:20px;padding:10px">' + shots.map(f => '<img style="width:' + (f.includes('2215') ? 320 : 390) + 'px;border-radius:12px" src="data:image/png;base64,' + fs.readFileSync(f).toString('base64') + '">').join('') + '</body>');
  await pg.waitForTimeout(300); await pg.screenshot({ path: path.join(OUT, 'four-times.png') });
  console.log(log.join('\n')); await browser.close(); server.close();
})().catch(e => { console.log(log.join('\n')); console.error(e); process.exit(1); });
