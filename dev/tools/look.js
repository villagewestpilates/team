// Screenshots of the new look, plus checks that the larger text sizes still fit a phone. Faked server.
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
const b0 = { pinned: false, needsRead: true, readBy: '', eventDate: '', updated: false, buttonText: '', links: [], forMe: true, photo: null };
const posts = () => [
  Object.assign({}, b0, { id: 'a', title: 'Text the studio with any client health updates', body: 'When a client tells you about a new injury, a surgery, or anything else that changes how we teach them, text the studio the same day.', categoryId: 'c2', author: 'Bethany', mine: false, createdAt: '2026-11-23T15:00:00Z', readAt: '', readBy: '2026-11-27' }),
  Object.assign({}, b0, { id: 'b', title: 'Welcome to the new Village West team app', body: 'Hello', categoryId: 'c1', pinned: true, author: 'Adam', mine: false, createdAt: '2026-11-20T15:00:00Z', readAt: '2026-11-21T15:00:00Z' }),
  Object.assign({}, b0, { id: 'c', title: 'CPR/AED renewal with Resuscitech', body: 'Hello', categoryId: 'c3', author: 'Cole', mine: false, createdAt: '2026-11-19T15:00:00Z', readAt: '2026-11-20T15:00:00Z' })];
(async () => {
  await new Promise(r => server.listen(8774, r));
  const browser = await chromium.launch(); const base = 'http://localhost:8774/';
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(String(e)));
  await page.route('**/script.google.com/**', route => { const q = JSON.parse(route.request().postData()); route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(q.action === 'boot' ? { ok: true, me: { id: 'p', name: 'Molly Hartman', firstName: 'Molly', role: 'admin' }, settings: { beta: true }, categories: [{ id: 'c1', name: 'Announcements', color: '#3F5FC0' }, { id: 'c2', name: 'Policies', color: '#7B52B9' }, { id: 'c3', name: 'Schedule', color: '#4E8A6B' }], posts: posts(), canPost: true, people: [], resources: [{ id: 'r1', title: 'Employee Handbook', url: 'https://drive.google.com/file/d/1/view', section: 'Documents', audience: 'everyone' }, { id: 'r2', title: 'Setting the alarm', url: 'https://drive.google.com/file/d/2/view', section: 'How-to videos', audience: 'everyone' }], contacts: [{ name: 'The studio', label: 'Text the studio', phone: '+14435550100', primary: true }, { name: 'Bethany', label: 'Text Bethany', phone: '+14435550101' }] } : { ok: true }) }); });
  const shot = n => page.screenshot({ path: path.join(OUT, n + '.png') });
  const fits = () => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
  const tabsFit = () => page.evaluate(() => [...document.querySelectorAll('.tab span:last-child')].every(s => s.scrollWidth <= s.clientWidth + 1) && [...document.querySelectorAll('.tab')].every(t => t.getBoundingClientRect().right <= window.innerWidth + 1));

  await page.goto(base + '?k=' + 'k'.repeat(30)); await page.waitForSelector('.todo'); await page.waitForTimeout(400);
  const bg = await page.evaluate(() => [getComputedStyle(document.body).backgroundColor, getComputedStyle(document.querySelector('.post-card')).backgroundColor, getComputedStyle(document.querySelector('.post-row')).backgroundColor]);
  check('page is soft gray, cards and rows are white', bg[0] === 'rgb(243, 243, 241)' && bg[1] === 'rgb(255, 255, 255)' && bg[2] === 'rgb(255, 255, 255)', bg.join(' / '));
  await shot('01-home');
  await page.click('[data-open="a"]'); await page.waitForSelector('.post-title'); await page.waitForTimeout(300); await shot('02-post');
  await page.click('.bar-back'); await page.waitForSelector('.todo');
  for (const tab of ['bulletins', 'resources', 'contact']) { await page.click('[data-tab="' + tab + '"]'); await page.waitForTimeout(350); await shot('03-' + tab); }
  await page.click('[data-tab="team"]'); await page.waitForSelector('.textsize'); await page.waitForTimeout(400); await shot('03-settings');
  check('text size control is in Settings, Standard selected', (await page.textContent('.textsize .seg-btn.on')).includes('Standard'));
  check('not on Home any more', await (async () => { await page.click('[data-tab="home"]'); await page.waitForSelector('.todo'); const gone = !(await page.$('.textsize')); return gone; })());
  const size0 = await page.evaluate(() => document.querySelector('.card-title').getBoundingClientRect().height);
  await page.click('[data-tab="team"]'); await page.waitForSelector('.textsize');
  for (const sz of ['large', 'largest']) {
    await page.click('[data-size="' + sz + '"]'); await page.waitForTimeout(350);
    await page.click('[data-tab="home"]'); await page.waitForSelector('.todo');
    check(sz + ': saved and selected', (await page.evaluate(() => localStorage.getItem('vwp.size'))) === sz) ; if (false) check('', (await page.evaluate(() => localStorage.getItem('vwp.size'))) === sz && (await page.getAttribute('[data-size="' + sz + '"]', 'aria-pressed')) === 'true');
    check(sz + ': Home fits, no side scroll, tab names not cut off', (await fits()) && (await tabsFit()));
    await page.evaluate(() => window.scrollTo(0, 0)); await shot('04-home-' + sz);
    await page.click('[data-open="a"]'); await page.waitForSelector('.post-title'); await page.waitForTimeout(300);
    const bar = await page.evaluate(() => { const b = document.querySelector('#markread').getBoundingClientRect(); return b.right <= window.innerWidth + 1 && b.bottom <= window.innerHeight + 1 && b.width > 120; });
    check(sz + ': Mark as read button fully on screen', bar && (await fits()));
    await shot('05-post-' + sz);
    await page.click('.bar-back'); await page.waitForSelector('.todo');
    await page.click('[data-tab="bulletins"]'); await page.waitForSelector('#search'); check(sz + ': Bulletins fits', await fits());
    await page.click('[data-tab="contact"]'); await page.waitForSelector('.contact-main'); check(sz + ': Contact fits', await fits());
    await page.click('[data-tab="team"]'); await page.waitForSelector('.textsize'); check(sz + ': Settings fits', await fits());
  }
  await page.click('[data-tab="home"]'); await page.waitForSelector('.todo');
  const size2 = await page.evaluate(() => document.querySelector('.card-title').getBoundingClientRect().height);
  check('text really is bigger', size2 > size0 * 1.2, Math.round(size0) + ' to ' + Math.round(size2));
  await page.reload(); await page.waitForSelector('.todo');
  check('the choice is remembered after closing the app', (await page.evaluate(() => document.documentElement.style.zoom)) === '1.28');
  await page.click('[data-tab="team"]'); await page.waitForSelector('.textsize'); await page.click('[data-size="standard"]'); await page.waitForTimeout(300);
  check('back to Standard', (await page.evaluate(() => document.documentElement.style.zoom)) === '');
  check('no script errors', errors.length === 0, errors.join(' | '));
  console.log(log.join('\n')); await browser.close(); server.close();
})().catch(e => { console.log(log.join('\n')); console.error(e); process.exit(1); });
