const { chromium } = require('playwright'); const path = require('path'); const fs = require('fs');
const OUT = process.argv[2]; const K = require('../.test-token.json').k;
const API = 'https://script.google.com/macros/s/' + fs.readFileSync(path.join(__dirname, '..', 'DEPLOYMENT_ID.txt'), 'utf8').trim() + '/exec';
(async () => {
  const b = await chromium.launch({ proxy: { server: process.env.HTTPS_PROXY } });
  // A big, detailed test picture (3000x2000) to prove shrinking and storage work.
  const mk = await b.newPage({ viewport: { width: 1500, height: 1000 }, deviceScaleFactor: 2 });
  await mk.setContent('<body style="margin:0;height:1000px;background:conic-gradient(from 20deg,#465a50,#e9e2d3,#163D38,#E58B7C,#465a50);display:flex;align-items:center;justify-content:center;font:600 120px sans-serif;color:#fff;text-shadow:0 4px 30px #0008">Test photo</body>');
  const big = path.join(OUT, 'big-test-photo.png'); await mk.screenshot({ path: big }); await mk.close();
  const c = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, ignoreHTTPSErrors: true });
  const p = await c.newPage(); const errs = []; p.on('pageerror', e => errs.push(String(e)));
  const call = (body) => p.evaluate(async ([u, bd]) => (await fetch(u, { method: 'POST', credentials: 'omit', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(bd) })).json(), [API, Object.assign({ k: K }, body)]);
  await p.goto('https://team.villagewestpilates.com/?k=' + K); await p.waitForSelector('.fab', { timeout: 60000 });

  // 1. The test post for Adam, with a photo.
  await p.click('.fab'); await p.waitForSelector('#f-title');
  await p.fill('#f-title', 'Test post: try Mark as read');
  await p.fill('#f-body', 'This one is just for you, Adam, so you can try the whole flow on your phone.\n\n1. Tap the photo to see it full size.\n2. Scroll down and tap "Mark as read."\n3. You should land on "You\'re all caught up."\n\nYou can remove this post afterward: open it, tap the pencil, then More options, then "Remove this post."');
  await p.setInputFiles('#photo-input', big); await p.waitForSelector('.photo-pick.has img', { timeout: 30000 });
  await p.click('[data-aud="people"]'); await p.waitForSelector('.people');
  await p.click('.person:has-text("Adam Caldwell")');
  await p.click('[data-more]'); await p.click('[data-toggle="skipEmail"]');
  await p.click('[data-submit]'); await p.waitForSelector('.sheet'); console.log('review:', (await p.textContent('.sheet')).replace(/\s+/g, ' ').slice(0, 150));
  const t0 = Date.now(); await p.click('[data-sheet="post"]'); await p.waitForSelector('.post-title', { timeout: 90000 });
  console.log('posted in ms:', Date.now() - t0, '| title:', await p.textContent('.post-title'), '| stats:', await p.textContent('.stats'));
  const postId = await p.evaluate(() => location.hash.split('/').pop());
  // Reload so the photo has to come back from the Sheet, not from memory.
  await p.reload(); await p.waitForSelector('.photo img', { timeout: 90000 }); await p.waitForTimeout(500);
  const dims = await p.$eval('.photo img', i => i.naturalWidth + 'x' + i.naturalHeight);
  const ph = await call({ action: 'getPhoto', postId });
  console.log('photo back from the Sheet:', dims, '| size KB:', Math.round(ph.data.length / 1024));
  await p.screenshot({ path: path.join(OUT, 'live-post-with-photo.png') });

  // 2. A throwaway post: text that looks like a formula, small fix, real change, then remove.
  let r = await call({ action: 'savePost', post: { title: 'Throwaway check', body: '=SUM(1,2) should stay as text\n+1 and -1 and @home too', categoryId: 'cat_schedule', audience: 'people', audienceIds: ['__none__'], needsRead: true, links: [] } });
  console.log('bad audience rejected:', r.ok === false, r.message);
  const me = (await call({ action: 'boot', quiet: true })).me.id;
  r = await call({ action: 'savePost', post: { title: 'Throwaway check', body: '=SUM(1,2) should stay as text\n+1 and -1 and @home too', categoryId: 'cat_schedule', audience: 'people', audienceIds: [me], needsRead: true, readBy: '2026-12-01', links: [{ label: 'Site', url: 'https://villagewestpilates.com' }] } });
  const tid = r.postId; let t = r.posts.find(x => x.id === tid);
  console.log('formula-like text kept as text:', t.body.startsWith('=SUM(1,2) should stay as text'), '| readBy:', t.readBy, '| link:', t.links.length, '| author read:', !!t.readAt);
  r = await call({ action: 'savePost', change: 'small', post: { id: tid, title: 'Throwaway check (fixed)', body: t.body, categoryId: 'cat_schedule', audience: 'people', audienceIds: [me], needsRead: true, links: [] } });
  t = r.posts.find(x => x.id === tid); console.log('small fix: title', t.title, '| updated tag:', t.updated, '| still read:', !!t.readAt);
  r = await call({ action: 'savePost', change: 'real', post: { id: tid, title: 'Throwaway check (changed)', body: t.body, categoryId: 'cat_schedule', audience: 'people', audienceIds: [me], needsRead: true, links: [] } });
  t = r.posts.find(x => x.id === tid); console.log('real change: updated tag:', t.updated, '| author counted as read again:', !!t.readAt, '| stats:', JSON.stringify(t.stats));
  r = await call({ action: 'archivePost', postId: tid }); console.log('removed:', r.ok && !r.posts.find(x => x.id === tid));
  r = await call({ action: 'getPhoto', postId: tid }); console.log('no photo on removed post:', r.ok === false);
  console.log('script errors:', errs.length);
  await b.close();
})().catch(e => { console.error(String(e).slice(0, 500)); process.exit(1); });
