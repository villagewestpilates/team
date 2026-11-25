// Checks for swipe-to-go-back, drafts, and scheduling, at iPhone size with real touch events. Faked server.
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium, devices } = require('playwright');
const ROOT = path.join(__dirname, '..', 'site'); const OUT = process.argv[2];
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.woff2': 'font/woff2', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
  const f = path.join(ROOT, p); if (!f.startsWith(ROOT) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
});
const log = []; const check = (n, ok, x) => log.push((ok ? 'PASS ' : 'FAIL ') + n + (x ? '  [' + x + ']' : ''));
const base0 = { categoryId: 'c', pinned: false, needsRead: true, readBy: '', eventDate: '', updated: false, buttonText: '', links: [], forMe: true, photo: null };
(async () => {
  await new Promise(r => server.listen(8773, r));
  const browser = await chromium.launch(); const base = 'http://localhost:8773/';
  const ctx = await browser.newContext(Object.assign({}, devices['iPhone 13']));
  const page = await ctx.newPage(); const errors = []; const sent = []; page.on('pageerror', e => errors.push(String(e)));
  const cdp = await ctx.newCDPSession(page);
  const posts = [Object.assign({}, base0, { id: 'a', title: 'Skim me', body: 'Line\n'.repeat(60), author: 'Bethany', mine: false, createdAt: '2026-11-23T15:00:00Z', readAt: '' })];
  let n = 1;
  await page.route('**/script.google.com/**', async route => {
    const req = JSON.parse(route.request().postData() || '{}'); let out = { ok: true };
    if (req.action === 'boot') out = { ok: true, me: { id: 'p0', name: 'Adam Caldwell', firstName: 'Adam', role: 'admin', apprentice: false }, settings: { beta: true }, categories: [{ id: 'c', name: 'Announcements', color: '#3F5FC0' }], posts, canPost: true, people: [{ id: 'p0', name: 'Adam Caldwell', firstName: 'Adam', role: 'admin' }, { id: 'p1', name: 'Molly Hartman', firstName: 'Molly', role: 'member' }], defaultCategory: 'c', resources: [], contacts: [] };
    else if (req.action === 'savePost') {
      sent.push(req); const d = req.post; const id = d.id || 'n' + (n++);
      const status = d.status === 'draft' ? 'draft' : d.publishAt ? 'scheduled' : '';
      const post = Object.assign({}, base0, { id, title: d.title.trim(), body: d.body, author: 'Adam', mine: true, createdAt: new Date().toISOString(), readAt: status === 'draft' ? '' : new Date().toISOString(), canEdit: true, stats: { read: 1, total: 2 }, audience: d.audience, audienceIds: d.audienceIds, authorId: 'p0', status, publishAt: d.publishAt || '', savedAt: new Date().toISOString() });
      const i = posts.findIndex(x => x.id === id); if (i === -1) posts.unshift(post); else posts[i] = post;
      out = { ok: true, postId: id, isNew: !d.id, real: false, status, posts };
    }
    route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(out) });
  });
  async function swipe(x1, y1, x2, y2) {
    const pt = (x, y) => [{ x, y, id: 1 }];
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt(x1, y1) });
    for (let i = 1; i <= 8; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pt(x1 + (x2 - x1) * i / 8, y1 + (y2 - y1) * i / 8) });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(450);
  }
  const shot = n2 => page.screenshot({ path: path.join(OUT, n2 + '.png') });
  const onPost = async () => !!(await page.$('.post-title'));
  const toast = () => page.textContent('#toast');

  await page.goto(base + '?k=' + 'k'.repeat(30)); await page.waitForSelector('.todo');
  // --- Swipe ---
  await page.tap('.post-card .card-title'); await page.waitForSelector('.post-title'); await page.waitForTimeout(1200);
  check('first post shows the swipe tip once', (await toast()) === 'Tip: swipe sideways to go back');
  await swipe(120, 400, 320, 410);
  check('swipe right goes back to Home', !(await onPost()) && !!(await page.$('.todo')));
  check('swiping back did not mark it read', (await page.textContent('.todo-count')) === '1 post to read' && !sent.length);
  await page.tap('.post-card .card-title'); await page.waitForSelector('.post-title'); await page.waitForTimeout(300);
  await swipe(320, 400, 110, 395);
  check('swipe left also goes back', !(await onPost()));
  await page.tap('.post-card .card-title'); await page.waitForSelector('.post-title'); await page.waitForTimeout(300);
  await swipe(200, 600, 205, 250); await page.waitForTimeout(300);
  check('scrolling up and down does not go back', (await onPost()) && (await page.evaluate(() => window.scrollY)) > 100, 'scrollY ' + await page.evaluate(() => window.scrollY));
  await swipe(150, 400, 190, 402);
  check('a short sideways nudge does not go back', await onPost());
  await swipe(5, 400, 250, 400);
  check('the very edge is left to the phone', await onPost());
  await page.tap('.bar-back'); await page.waitForSelector('.todo'); check('bottom Back button still works', true);

  // --- Drafts ---
  await page.tap('.fab'); await page.waitForSelector('#f-title');
  await page.tap('[data-savedraft]'); await page.waitForTimeout(250);
  check('a draft needs a title', (await toast()) === 'Give the draft a title first');
  await page.fill('#f-title', 'Winter schedule changes'); await shot('01-compose-bar');
  await page.tap('[data-savedraft]'); await page.waitForSelector('.pending-row'); await page.waitForTimeout(300);
  check('draft saved with no body, sent as a draft', sent[0].post.status === 'draft' && sent[0].post.body === '');
  check('lands on Bulletins with the draft and its saved time', /^Draft, saved .+ at \d+:\d\d/.test(await page.textContent('.pending-row .post-row-sub')), await page.textContent('.pending-row .post-row-sub'));
  check('draft is not in the normal list or the unread count', !(await page.textContent('#list')).includes('Winter schedule') && (await page.textContent('.tab .count')) === '1');
  await shot('02-drafts-list');
  await page.tap('[data-tab="home"]'); await page.waitForSelector('.pending-link');
  check('Home points to the draft', (await page.textContent('.pending-link')).trim() === '1 draft or scheduled post');
  await page.tap('.pending-link'); await page.waitForSelector('.pending-row'); await page.tap('.pending-row'); await page.waitForSelector('#f-title');
  check('tapping a draft opens it for editing', (await page.inputValue('#f-title')) === 'Winter schedule changes' && !!(await page.$('[data-savedraft]')));
  // --- Schedule it ---
  await page.fill('#f-body', 'New hours start in January.');
  await page.tap('[data-when="later"]'); await page.waitForSelector('#f-when');
  check('choosing Later shows a date and time, and keeps the text', (await page.inputValue('#f-body')).startsWith('New hours') && (await page.textContent('[data-submit]')) === 'Review and schedule');
  await page.fill('#f-when', '2020-01-01T09:00'); await page.tap('[data-submit]'); await page.waitForTimeout(250);
  check('a past time is caught', (await toast()) === 'Pick a date and time in the future');
  await page.fill('#f-when', '2027-01-04T06:00'); await shot('03-schedule-form');
  await page.tap('[data-submit]'); await page.waitForSelector('.sheet'); await page.waitForTimeout(200);
  const st = await page.textContent('.sheet');
  check('review shows when it goes out', st.includes('Ready to schedule?') && st.includes('Mon, Jan 4 at 6:00 AM') && st.includes('Schedule it'), st.slice(0, 120));
  await shot('04-schedule-review');
  await page.tap('[data-sheet="post"]'); await page.waitForSelector('.pending-row'); await page.waitForTimeout(300);
  const s2 = sent[sent.length - 1].post;
  check('scheduled with the right time, same post', s2.id === 'n1' && s2.status === '' && s2.publishAt === '2027-01-04T11:00:00.000Z', s2.publishAt);
  check('shows as scheduled, not live', (await page.textContent('.pending-row .post-row-sub')) === 'Goes out Mon, Jan 4 at 6:00 AM' && !(await page.textContent('#list')).includes('Winter schedule'), await page.textContent('.pending-row .post-row-sub'));
  await shot('05-scheduled-list');
  const dst = await page.evaluate(() => { const f = window.__vwpTest; return f ? [f('2027-07-04T06:00'), f('2027-01-04T06:00')] : null; });
  check('summer and winter times both convert correctly', dst && dst[0] === '2027-07-04T10:00:00.000Z' && dst[1] === '2027-01-04T11:00:00.000Z', JSON.stringify(dst));
  // --- Post a scheduled one now ---
  await page.tap('.pending-row'); await page.waitForSelector('#f-title');
  check('scheduled post reopens with Later selected', !!(await page.$('[data-when="later"].on')) && (await page.inputValue('#f-when')) === '2027-01-04T06:00');
  await page.tap('[data-when="now"]'); await page.tap('[data-submit]'); await page.waitForSelector('.sheet'); await page.tap('[data-sheet="post"]'); await page.waitForSelector('.post-title'); await page.waitForTimeout(300);
  check('posting now makes it live', sent[sent.length - 1].post.publishAt === '' && (await toast()) === 'Posted' && !(await page.$('.sched-note')));
  check('no script errors', errors.length === 0, errors.join(' | '));
  console.log(log.join('\n')); await browser.close(); server.close();
})().catch(e => { console.log(log.join('\n')); console.error(e); process.exit(1); });
