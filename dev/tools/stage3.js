// Stage 3 checks (posting) at phone width, with the server faked so nothing lands in the real Sheet.
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const ROOT = path.join(__dirname, '..', 'site'); const OUT = process.argv[2];
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };
const K = 'faketokenfaketokenfaketoken1234';
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
  const f = path.join(ROOT, p); if (!f.startsWith(ROOT) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
});
const CATS = [{ id: 'cat_announcements', name: 'Announcements', color: '#3F5FC0' }, { id: 'cat_policies', name: 'Policies', color: '#7B52B9' }, { id: 'cat_schedule', name: 'Schedule', color: '#4E8A6B' }, { id: 'cat_promos', name: 'Promotions & Events', color: '#B8892B' }];
const PEOPLE = ['Adam Caldwell', 'Bethany Bradshaw', 'Cole Preston', 'Charlotte Harper', 'Dana Wade', 'Molly Hartman', 'Aubrey Walsh', 'Lillian Marsh'].map((n, i) => ({ id: 'p' + i, name: n, firstName: n.split(' ')[0], apprentice: i === 1 || i > 5 }));
const base0 = { body: 'Body text.', categoryId: 'cat_announcements', pinned: false, needsRead: true, readBy: '', eventDate: '', author: 'Bethany', mine: false, updated: false, buttonText: '', links: [], forMe: true, readAt: '', photo: null };
const log = [];
const check = (name, ok, extra) => log.push((ok ? 'PASS ' : 'FAIL ') + name + (extra ? '  [' + extra + ']' : ''));

(async () => {
  await new Promise(r => server.listen(8768, r));
  const browser = await chromium.launch(); const base = 'http://localhost:8768/';
  async function session(role, posts) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 }); await ctx.addInitScript(() => { try { localStorage.setItem('vwp.edit', '1'); } catch (e) {} });
    const page = await ctx.newPage(); const errors = []; const sent = [];
    page.on('pageerror', e => errors.push(String(e)));
    const canPost = role !== 'member';
    await page.route('**/script.google.com/**', async route => {
      const req = JSON.parse(route.request().postData() || '{}'); let out = { ok: false };
      if (req.action === 'boot') out = { ok: true, me: { id: 'p0', name: 'Adam Caldwell', firstName: 'Adam', role, apprentice: false }, settings: { beta: true }, categories: CATS, posts, canPost, people: canPost ? PEOPLE : [], defaultCategory: 'cat_announcements', serverTime: new Date().toISOString() };
      else if (req.action === 'savePost') {
        sent.push(req); const d = req.post; const isNew = !d.id; const id = d.id || 'new1';
        const post = Object.assign({}, base0, { id, title: d.title.trim(), body: d.body.trim(), categoryId: d.categoryId, pinned: d.pinned, needsRead: d.needsRead, readBy: d.readBy, eventDate: d.eventDate, author: 'Adam', mine: true, createdAt: new Date().toISOString(), readAt: new Date().toISOString(), buttonText: d.buttonText, links: d.links.filter(l => l.url), photo: req.photo ? { w: req.photo.w, h: req.photo.h } : null, canEdit: true, stats: { read: 1, total: 8 }, audience: d.audience, audienceIds: d.audienceIds, skipEmail: d.skipEmail, updated: req.change === 'real' });
        const i = posts.findIndex(x => x.id === id); if (i === -1) posts.unshift(post); else posts[i] = post;
        if (req.photo) posts.photoData = req.photo.data;
        out = { ok: true, postId: id, isNew, real: req.change === 'real', posts };
      } else if (req.action === 'archivePost') { sent.push(req); const i = posts.findIndex(x => x.id === req.postId); posts.splice(i, 1); out = { ok: true, posts }; }
      else if (req.action === 'getPhoto') out = posts.photoData ? { ok: true, data: posts.photoData } : { ok: false };
      else out = { ok: true };
      route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(out) });
    });
    return { ctx, page, errors, sent };
  }
  const shot = (page, name) => page.screenshot({ path: path.join(OUT, name + '.png') });
  const toastText = page => page.textContent('#toast');
  const existing = () => [Object.assign({}, base0, { id: 'a', title: 'Front desk coverage for Thanksgiving week', categoryId: 'cat_schedule', createdAt: '2026-11-20T15:00:00Z', readAt: '2026-11-20T18:00:00Z', mine: true, author: 'Adam', canEdit: true, stats: { read: 6, total: 13 }, audience: 'everyone', audienceIds: [], skipEmail: false, readBy: '2026-11-27' })];

  // Team member: no way to post.
  let s = await session('member', existing().map(p => Object.assign(p, { canEdit: false, stats: undefined })));
  await s.page.goto(base + '?k=' + K); await s.page.waitForSelector('.rows-list');
  check('team member has no New post button', !(await s.page.$('.fab')));
  await s.page.click('.post-row'); await s.page.waitForSelector('.post-title');
  check('team member has no Edit button', !(await s.page.$('[data-edit]')));
  await s.ctx.close();

  // Admin: write a new post.
  s = await session('admin', existing());
  await s.page.goto(base + '?k=' + K); await s.page.waitForSelector('.fab'); await s.page.waitForTimeout(300);
  await shot(s.page, '01-home-with-new-post');
  await s.page.click('.fab'); await s.page.waitForSelector('#f-title'); await s.page.waitForTimeout(300);
  await shot(s.page, '02-compose-empty');
  await s.page.click('[data-submit]'); await s.page.waitForTimeout(200);
  check('empty title is caught', (await toastText(s.page)) === 'Add a title');
  await s.page.fill('#f-title', 'Holiday open house on Saturday, December 5');
  await s.page.click('[data-submit]'); await s.page.waitForTimeout(200);
  check('empty post text is caught', (await toastText(s.page)) === 'Add the post text');
  await s.page.fill('#f-body', 'We are opening the doors from 10 to 2.\n\nSign up for a shift here: https://villagewestpilates.com/openhouse\n\n- Bring a friend\n= See you there');
  await s.page.setInputFiles('#photo-input', path.join(ROOT, 'icons', 'icon-512.png'));
  await s.page.waitForSelector('.photo-pick.has img');
  check('photo preview shows', true);
  await s.page.click('[data-cat="cat_promos"]'); await s.page.waitForSelector('#f-event');
  check('event date appears for Promotions & Events', true);
  check('text survives picking a category', (await s.page.inputValue('#f-title')).startsWith('Holiday open house') && (await s.page.inputValue('#f-body')).includes('Bring a friend'));
  check('photo survives picking a category', !!(await s.page.$('.photo-pick.has img')));
  await s.page.fill('#f-event', '2026-12-05');
  await s.page.click('[data-aud="people"]'); await s.page.waitForSelector('.people');
  await s.page.click('[data-submit]'); await s.page.waitForTimeout(200);
  check('selected people needs at least one', (await toastText(s.page)) === 'Pick at least one person');
  await s.page.click('[data-person="p1"]'); await s.page.click('[data-person="p5"]');
  await s.page.fill('#f-readby', '2026-11-27');
  await s.page.screenshot({ path: path.join(OUT, '03-compose-filled-full.png'), fullPage: true });
  await s.page.click('[data-more]'); await s.page.waitForSelector('#f-btn');
  await s.page.fill('[data-f="link0label"]', 'Sign up for a shift');
  await s.page.click('[data-submit]'); await s.page.waitForTimeout(200);
  check('link label without a link is caught', (await toastText(s.page)).includes('Add the link for'));
  await s.page.fill('[data-f="link0url"]', 'villagewestpilates.com/openhouse');
  await s.page.click('[data-submit]'); await s.page.waitForTimeout(200);
  check('link without https is caught', (await toastText(s.page)) === 'Links need to start with https://');
  await s.page.fill('[data-f="link0url"]', 'https://villagewestpilates.com/openhouse');
  await s.page.click('[data-toggle="pinned"]');
  await s.page.fill('#f-btn', 'Got it');
  check('no side scroll on the form', await s.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await s.page.screenshot({ path: path.join(OUT, '04-compose-more-full.png'), fullPage: true });
  await s.page.click('[data-submit]'); await s.page.waitForSelector('.sheet'); await s.page.waitForTimeout(250);
  const sheetText = await s.page.textContent('.sheet');
  check('review sheet names the audience and date', sheetText.includes('Bethany, Molly') && sheetText.includes('Yes, by Fri, Nov 27'), sheetText.slice(0, 160));
  await shot(s.page, '05-review-sheet');
  check('nothing sent before Post now', s.sent.length === 0);
  await s.page.click('[data-sheet="post"]'); await s.page.waitForSelector('.post-title'); await s.page.waitForSelector('.photo img'); await s.page.waitForTimeout(400);
  const sent = s.sent[0];
  check('post sent once with the right fields', s.sent.length === 1 && sent.post.categoryId === 'cat_promos' && sent.post.audience === 'people' && sent.post.audienceIds.join() === 'p1,p5' && sent.post.readBy === '2026-11-27' && sent.post.eventDate === '2026-12-05' && sent.post.pinned === true && sent.post.buttonText === 'Got it' && sent.post.links[0].url.startsWith('https://'), JSON.stringify(sent.post).slice(0, 200));
  check('photo was shrunk to a JPEG', /^data:image\/jpeg;base64,/.test(sent.photo.data) && sent.photo.w === 512, sent.photo.w + 'x' + sent.photo.h + ' ' + Math.round(sent.photo.data.length / 1024) + 'KB');
  check('lands on the new post with read count', (await s.page.textContent('.stats')).includes('1 of 8 read'));
  check('pasted link is tappable', !!(await s.page.$('.post-body a[target="_blank"]')));
  await shot(s.page, '06-posted'); await s.page.screenshot({ path: path.join(OUT, '06-posted-full.png'), fullPage: true });
  await s.page.click('.photo'); await s.page.waitForSelector('.viewer'); await shot(s.page, '07-photo-full');
  await s.page.click('.viewer-close'); check('photo viewer closes', !(await s.page.$('.viewer')));
  check('draft cleared after posting', await s.page.evaluate(() => !localStorage.getItem('vwp.draft')));

  // Edit it: small fix or real change.
  await s.page.click('[data-edit]'); await s.page.waitForSelector('#f-title');
  check('edit form is filled in', (await s.page.inputValue('#f-title')).startsWith('Holiday open house') && (await s.page.inputValue('#f-btn')) === 'Got it');
  await s.page.fill('#f-title', 'Holiday open house on Saturday, December 12');
  await s.page.click('[data-back]'); await s.page.waitForSelector('.sheet');
  check('leaving an edit asks first', (await s.page.textContent('.sheet h2')) === 'Leave without saving?');
  await s.page.click('[data-sheet="close"]');
  await s.page.click('[data-submit]'); await s.page.waitForSelector('.choice'); await s.page.waitForTimeout(250);
  await shot(s.page, '08-small-or-real');
  await s.page.click('[data-sheet="real"]'); await s.page.waitForSelector('.post-title'); await s.page.waitForTimeout(300);
  check('real change sent', s.sent[1].change === 'real' && s.sent[1].post.id === 'new1' && !s.sent[1].photo && !s.sent[1].removePhoto);
  check('updated tag shows', (await s.page.textContent('.minis')).includes('Updated'));
  // Remove it.
  await s.page.click('[data-edit]'); await s.page.waitForSelector('[data-archive]'); await s.page.click('[data-archive]'); await s.page.waitForSelector('.btn-danger');
  await shot(s.page, '09-remove');
  await s.page.click('[data-sheet="archive"]'); await s.page.waitForSelector('#search'); await s.page.waitForTimeout(300);
  check('removed post is gone', !(await s.page.textContent('#list')).includes('Holiday open house'));

  // A draft is kept if you leave mid-way.
  await s.page.click('.fab'); await s.page.waitForSelector('#f-title');
  await s.page.fill('#f-title', 'Half-written post'); await s.page.fill('#f-body', 'Phone rang.');
  await s.page.click('[data-back]'); await s.page.waitForSelector('.fab');
  await s.page.reload(); await s.page.waitForSelector('.fab'); await s.page.click('.fab'); await s.page.waitForSelector('#f-title');
  check('draft comes back after closing the app', (await s.page.inputValue('#f-title')) === 'Half-written post');
  check('no script errors', s.errors.length === 0, s.errors.join(' | '));
  await s.ctx.close();
  console.log(log.join('\n')); await browser.close(); server.close();
})().catch(e => { console.log(log.join('\n')); console.error(e); process.exit(1); });
