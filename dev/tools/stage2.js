// Stage 2 checks at phone width. The server is faked here so no test posts land in the real Sheet.
// Usage: node tools/stage2.js <outDir>
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const ROOT = path.join(__dirname, '..', 'site');
const OUT = process.argv[2];
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };
const K = 'faketokenfaketokenfaketoken1234';

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});

const CATS = [
  { id: 'cat_announcements', name: 'Announcements', color: '#3F5FC0' },
  { id: 'cat_policies', name: 'Policies', color: '#7B52B9' },
  { id: 'cat_schedule', name: 'Schedule', color: '#4E8A6B' },
  { id: 'cat_promos', name: 'Promotions & Events', color: '#B8892B' }
];
const LONG = Array.from({ length: 14 }, (_, i) => 'Paragraph ' + (i + 1) + '. When a client tells you about a new injury, a surgery, or anything else that changes how we teach them, text the studio the same day so every instructor sees it before their next class.').join('\n\n') + '\n\nFull policy: https://villagewestpilates.com/policies/client-health-updates-and-notes?ref=team-app';
function post(o) {
  return Object.assign({ body: 'Body text.', categoryId: 'cat_announcements', pinned: false, needsRead: true, readBy: '', eventDate: '',
    author: 'Barbara', mine: false, updated: false, buttonText: '', links: [], forMe: true, readAt: '' }, o);
}
function fullSet() {
  return [
    post({ id: 'a', title: 'Text the studio with any client health updates', categoryId: 'cat_policies', readBy: '2026-11-27', createdAt: '2026-11-23T15:00:00Z',
      body: 'When a client tells you about a new injury, a surgery, or anything else that changes how we teach them, text the studio the same day.\n\nWe add it to their notes so every instructor sees it before their next class.',
      links: [{ label: 'Text the studio', url: 'sms:+14437025786' }] }),
    post({ id: 'b', title: 'CPR/AED renewal with Resuscitech', categoryId: 'cat_schedule', author: 'Cory', createdAt: '2026-11-22T15:00:00Z', body: 'Group renewal is coming up. Details and what to bring are inside.' }),
    post({ id: 'c', title: 'Holiday open house and member appreciation weekend with extended retail hours and a very long title that keeps going to test wrapping', categoryId: 'cat_promos', eventDate: '2026-12-05', updated: true, pinned: true, createdAt: '2026-11-21T15:00:00Z', body: LONG, buttonText: 'I\'ve read the full policy' }),
    post({ id: 'd', title: 'Welcome to the new Village West app (beta)', pinned: true, author: 'Alex', createdAt: '2026-11-20T15:00:00Z', readAt: '2026-11-20T18:00:00Z' }),
    post({ id: 'e', title: 'Front desk coverage for Thanksgiving week', categoryId: 'cat_schedule', createdAt: '2026-11-18T15:00:00Z', readAt: '2026-11-19T18:00:00Z' }),
    post({ id: 'f', title: 'New retail arrivals are on the shelf', categoryId: 'cat_promos', needsRead: false, author: 'Christine', createdAt: '2026-11-17T15:00:00Z' })
  ];
}

const log = [];
(async () => {
  await new Promise(r => server.listen(8767, r));
  const browser = await chromium.launch();
  const base = 'http://localhost:8767/';
  const check = (name, ok, extra) => { log.push((ok ? 'PASS ' : 'FAIL ') + name + (extra ? '  [' + extra + ']' : '')); };

  async function session(posts, opts = {}) {
    const ctx = await browser.newContext({ viewport: { width: opts.width || 390, height: 844 }, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    const errors = []; const calls = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
    await page.route('**/script.google.com/**', async route => {
      const req = JSON.parse(route.request().postData() || '{}');
      calls.push(req.action);
      if (opts.delay) await new Promise(r => setTimeout(r, opts.delay));
      let out = { ok: false };
      if (req.k !== K) out = { ok: false, code: 'auth' };
      else if (req.action === 'boot') out = { ok: true, me: { id: 'p1', name: 'Megan Hopkins', firstName: 'Megan', role: opts.role || 'member', apprentice: false }, settings: { beta: true }, categories: CATS, posts };
      else if (req.action === 'markRead') {
        if (opts.failMark) return route.abort();
        const p = posts.find(x => x.id === req.postId); p.readAt = new Date().toISOString(); out = { ok: true, readAt: p.readAt };
      } else if (req.action === 'viewPost') out = { ok: true };
      route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(out) });
    });
    return { ctx, page, errors, calls };
  }
  const shot = (page, name) => page.screenshot({ path: path.join(OUT, name + '.png') });
  const noSideScroll = page => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

  // 1. Home with things to read, then the whole read flow.
  let s = await session(fullSet());
  await s.page.goto(base + '?k=' + K); await s.page.waitForSelector('.todo');
  await s.page.waitForTimeout(400);
  check('home shows count', (await s.page.textContent('.todo-count')) === '3 posts to read', await s.page.textContent('.todo-count'));
  check('home earliest due', (await s.page.textContent('.todo-sub')) === 'Earliest due Fri, Nov 27', await s.page.textContent('.todo-sub'));
  check('bulletins badge', (await s.page.textContent('.tab .count')) === '3');
  check('home no side scroll', await noSideScroll(s.page));
  await shot(s.page, '01-home'); await s.page.screenshot({ path: path.join(OUT, '01-home-full.png'), fullPage: true });

  await s.page.click('[data-start]'); await s.page.waitForSelector('#markread'); await s.page.waitForTimeout(450);
  check('start opens earliest due', (await s.page.textContent('.post-title')).startsWith('Text the studio'));
  check('progress 1 of 3', (await s.page.textContent('.progress-text')) === '1 of 3 to read');
  check('opening did not mark read', !s.calls.includes('markRead'));
  check('tab bar hidden on post', await s.page.$eval('#tabbar', e => e.hidden));
  check('sms link opens in new tab', (await s.page.getAttribute('.link-row', 'target')) === '_blank');
  await shot(s.page, '02-post');
  await s.page.click('#markread'); await s.page.waitForTimeout(900);
  check('slides to next unread', (await s.page.textContent('.progress-text')) === '2 of 3 to read', await s.page.textContent('.progress-text'));
  check('long title post, custom button', (await s.page.textContent('#markread')).includes('read the full policy'));
  check('long post no side scroll', await noSideScroll(s.page));
  await shot(s.page, '04-long-post-top');
  await s.page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); await s.page.waitForTimeout(200);
  const overlap = await s.page.evaluate(() => { const a = document.querySelector('.post-body').getBoundingClientRect().bottom; const b = document.querySelector('.readbar').getBoundingClientRect().top; return a <= b; });
  check('long post end clears the button bar', overlap);
  await shot(s.page, '05-long-post-bottom');
  await s.page.click('#markread'); await s.page.waitForTimeout(900);
  check('third post', (await s.page.textContent('.progress-text')) === '3 of 3 to read');
  await shot(s.page, '03-post-last');
  await s.page.click('#markread'); await s.page.waitForSelector('.done'); await s.page.waitForTimeout(500);
  check('caught up text', (await s.page.textContent('.done p')) === 'All 3 posts are marked as read. Thank you, Megan.', await s.page.textContent('.done p'));
  check('just read lists 3', (await s.page.$$('.rows-list .post-row')).length === 3);
  check('markRead sent 3 times', s.calls.filter(c => c === 'markRead').length === 3);
  await shot(s.page, '06-caught-up');
  await s.page.click('[data-home]'); await s.page.waitForSelector('.calm'); await s.page.waitForTimeout(300);
  check('home is calm after', (await s.page.textContent('.calm-title')) === 'You\'re all caught up');
  check('badge gone', !(await s.page.$('.tab .count')));
  await shot(s.page, '07-home-calm');
  // Reread and back button
  await s.page.click('.post-row:has(.row-read)'); await s.page.waitForSelector('.read-done'); await s.page.waitForTimeout(400);
  check('read post has no Mark as read button', !(await s.page.$('#markread')));
  await shot(s.page, '08-reread');
  await s.page.goBack(); await s.page.waitForSelector('.calm');
  check('phone back button returns home', true);
  check('no script errors (flow)', s.errors.length === 0, s.errors.join(' | '));
  await s.ctx.close();

  // 2. Bulletins: filters and search.
  s = await session(fullSet());
  await s.page.goto(base + '?k=' + K); await s.page.waitForSelector('.todo');
  await s.page.click('[data-tab="bulletins"]'); await s.page.waitForSelector('#search'); await s.page.waitForTimeout(300);
  check('bulletins pinned first, in their own group', (await s.page.textContent('.pin-group')).includes('Holiday open house') && (await s.page.textContent('.pin-label')).trim() === 'Pinned');
  await shot(s.page, '09-bulletins'); await s.page.screenshot({ path: path.join(OUT, '09-bulletins-full.png'), fullPage: true });
  await s.page.click('[data-filter="unread"]'); await s.page.waitForTimeout(150);
  check('unread filter shows 3 cards', (await s.page.$$('#list .post-card')).length === 3 && (await s.page.$$('#list .post-row')).length === 0);
  await s.page.click('[data-filter="cat_schedule"]'); await s.page.waitForTimeout(150);
  check('category filter', (await s.page.$$('#list .post-card, #list .post-row')).length === 2);
  await s.page.click('[data-filter="all"]');
  await s.page.fill('#search', 'thanksgiving'); await s.page.waitForTimeout(150);
  check('search finds one', (await s.page.$$('#list .post-card, #list .post-row')).length === 1);
  check('search keeps focus', await s.page.evaluate(() => document.activeElement.id === 'search'));
  await s.page.fill('#search', 'zzzz'); await s.page.waitForTimeout(150);
  check('search empty state', (await s.page.textContent('.empty .calm-title')) === 'No posts match');
  await shot(s.page, '10-bulletins-empty');
  await s.page.click('[data-clear]'); await s.page.waitForTimeout(150);
  check('clear restores list', (await s.page.$$('#list .post-card, #list .post-row')).length === 6);
  check('no script errors (bulletins)', s.errors.length === 0, s.errors.join(' | '));
  await s.ctx.close();

  // 3. Saving fails: the post goes back to unread.
  s = await session(fullSet().slice(1, 2), { failMark: true });
  await s.page.goto(base + '?k=' + K); await s.page.waitForSelector('.todo');
  await s.page.click('[data-open]'); await s.page.waitForSelector('#markread'); await s.page.click('#markread');
  await s.page.waitForTimeout(1500);
  await shot(s.page, '11-save-failed');
  check('failed save: still on the post, button back', !!(await s.page.$('#markread:not([disabled])')) && (await s.page.textContent('.progress-text')) === '1 of 1 to read', await s.page.evaluate(() => document.body.innerText.slice(0, 60)));
  await s.page.click('[data-back]'); await s.page.waitForTimeout(400);
  check('failed save: post is still unread on Home', !!(await s.page.$('.todo')));
  await s.ctx.close();

  // 3b. Saving fails after a slow wait (already moved on to "caught up").
  s = await session(fullSet().slice(1, 2), { failMark: true, delay: 1500 });
  await s.page.goto(base + '?k=' + K); await s.page.waitForSelector('.todo');
  await s.page.click('[data-open]'); await s.page.waitForSelector('#markread'); await s.page.click('#markread');
  await s.page.waitForTimeout(3200);
  check('slow failed save: brought back to the post', !!(await s.page.$('#markread:not([disabled])')), await s.page.evaluate(() => document.body.innerText.slice(0, 60)));
  await s.ctx.close();

  // 4. First-time and empty states.
  s = await session([]);
  await s.page.goto(base + '?k=' + K); await s.page.waitForSelector('.calm'); await s.page.waitForTimeout(300);
  check('no posts yet', (await s.page.textContent('.calm-title')) === 'Nothing posted yet');
  await shot(s.page, '12-no-posts');
  await s.ctx.close();

  // 5. Slow connection shows placeholders, second visit paints from memory at once.
  s = await session(fullSet(), { delay: 2500 });
  await s.page.goto(base + '?k=' + K); await s.page.waitForSelector('.sk'); await shot(s.page, '13-loading');
  await s.page.waitForSelector('.todo');
  const t0 = Date.now(); await s.page.reload(); await s.page.waitForSelector('.todo'); const ms = Date.now() - t0;
  check('second visit shows instantly from memory', ms < 1500, ms + ' ms with a 2.5 s server');
  await s.ctx.close();

  // 5b. An icon saved while on another tab still opens on Home.
  s = await session(fullSet());
  await s.page.goto(base + '?k=' + K + '#/contact'); await s.page.waitForSelector('.todo');
  check('opening the app always starts on Home', (await s.page.textContent('.tab.on')).trim() === 'Home' && s.page.url().endsWith('#/home'), s.page.url().slice(-20));
  await s.ctx.close();

  // 6. Narrow phone (320px) and a link from an email straight to a post.
  s = await session(fullSet(), { width: 320, role: 'admin' });
  await s.page.goto(base + '?k=' + K + '&p=b'); await s.page.waitForSelector('#markread'); await s.page.waitForTimeout(400);
  check('email link opens that post', (await s.page.textContent('.post-title')).startsWith('CPR/AED'));
  await s.page.click('[data-back]'); await s.page.waitForSelector('.todo'); await s.page.waitForTimeout(300);
  check('320px home no side scroll', await noSideScroll(s.page));
  check('admin has 5 tabs', (await s.page.$$('.tab')).length === 5);
  await shot(s.page, '14-narrow-home');
  await s.ctx.close();

  console.log(log.join('\n'));
  await browser.close(); server.close();
})().catch(e => { console.log(log.join('\n')); console.error(e); process.exit(1); });
