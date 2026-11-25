// Live checks for stage 4. Uses only the Test Person. Changes no real team member.
const { chromium } = require('playwright'); const path = require('path'); const fs = require('fs');
const OUT = process.argv[2]; const TOK = path.join(__dirname, '..', '.test-token.json'); let K = require(TOK).k;
const API = 'https://script.google.com/macros/s/' + fs.readFileSync(path.join(__dirname, '..', 'DEPLOYMENT_ID.txt'), 'utf8').trim() + '/exec';
(async () => {
  const b = await chromium.launch({ proxy: { server: process.env.HTTPS_PROXY } });
  const c = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, ignoreHTTPSErrors: true });
  const p = await c.newPage(); const errs = []; p.on('pageerror', e => errs.push(String(e)));
  const raw = (k, body) => p.evaluate(async ([u, bd]) => (await fetch(u, { method: 'POST', credentials: 'omit', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(bd) })).json(), [API, Object.assign({ k }, body)]);
  const call = body => raw(K, body);
  await p.goto('https://team.villagewestpilates.com/?k=' + K); await p.waitForSelector('.fab', { timeout: 60000 });
  const boot = await call({ action: 'boot', quiet: true }); const me = boot.me.id; const alex = boot.people.find(x => x.name === 'Alex Chambers').id;

  await p.click('[data-tab="team"]'); await p.waitForSelector('[data-person-open]', { timeout: 60000 });
  console.log('team screen rows:', (await p.$$('[data-person-open]')).length, '| test person hidden:', !(await p.textContent('.screen')).includes('Test Person'));

  // The only link this test changes is the Test Person's own.
  let r = await call({ action: 'newLink', id: me }); const oldK = K;
  console.log('new link for test person:', r.ok, '| got a new token:', !!r.newK && r.newK !== oldK);
  if (r.newK) { K = r.newK; fs.writeFileSync(TOK, JSON.stringify({ ok: true, k: K }), { mode: 0o600 }); }
  const oldTry = await raw(oldK, { action: 'boot', quiet: true });
  console.log('old link stops working:', oldTry.ok === false && oldTry.code === 'auth', '| new link works:', (await call({ action: 'boot', quiet: true })).ok);
  r = await call({ action: 'setActive', id: me, active: false }); console.log('cannot deactivate yourself:', r.ok === false, '|', r.message);
  r = await call({ action: 'savePerson', person: { name: 'X', email: 'bad' } }); console.log('bad person rejected:', r.ok === false, '|', r.message);
  r = await call({ action: 'savePerson', person: { name: 'Someone New', email: 'alexhchambers@gmail.com' } }); console.log('duplicate email rejected:', r.ok === false, '|', r.message);
  r = await call({ action: 'saveSetting', key: 'Beta', value: false }); const off = r.settings.beta; r = await call({ action: 'saveSetting', key: 'Beta', value: true });
  console.log('beta switch off then on:', off === false && r.settings.beta === true);
  const sched = r.categories.find(x => x.id === 'cat_schedule');
  r = await call({ action: 'saveCategory', category: { id: sched.id, name: sched.name, color: sched.color } }); console.log('category save (same values):', r.ok, '| still 4 active:', r.categories.filter(x => !x.archived).length === 4);
  r = await call({ action: 'saveCategory', category: { id: 'cat_announcements', name: 'Announcements', color: '#3F5FC0', archived: true } }); console.log('default category cannot be retired:', r.ok === false, '|', r.message);
  r = await call({ action: 'nudge', postId: boot.posts[0].id, ids: [alex] }); console.log('nudge sends nothing yet:', r.ok === false, '|', r.message);
  r = await call({ action: 'emailLink', id: alex }); console.log('email link sends nothing yet:', r.ok === false);

  // Post as: a throwaway shown as Alex's, visible only to the test person, hidden right after.
  r = await call({ action: 'savePost', post: { title: 'Throwaway post-as check', body: 'x', audience: 'people', audienceIds: [me], needsRead: true, links: [], authorId: alex } });
  let t = r.posts.find(x => x.id === r.postId); console.log('post as:', t.author === 'Alex', '| writer also counted as read:', !!t.readAt);
  const rd = await call({ action: 'readers', postId: r.postId }); console.log('readers on it:', JSON.stringify({ read: rd.groups.read.length, opened: rd.groups.opened.length, not: rd.groups.notOpened.length }));
  await call({ action: 'archivePost', postId: r.postId });

  // The test post for Alex: thumbnail, bold, bullets. Posted through the real screen.
  await p.goto('https://team.villagewestpilates.com/?k=' + K + '#/home'); await p.waitForSelector('.fab', { timeout: 60000 });
  await p.click('.fab'); await p.waitForSelector('#f-title');
  await p.fill('#f-title', 'Test post 2: thumbnail, bold, and bullets');
  await p.fill('#f-body', 'This one is for you only, Alex.\n\n**What to look for:**\n- A small photo on the card on Home\n- This list showing as bullets\n- The bold line above\n\nMark it as read, then take it down with the pencil.');
  await p.setInputFiles('#photo-input', process.argv[3]); await p.waitForSelector('.photo-pick.has img', { timeout: 30000 });
  await p.click('[data-aud="people"]'); await p.click('.person:has-text("Alex Chambers")');
  await p.click('[data-more]'); await p.click('[data-toggle="skipEmail"]');
  await p.click('[data-submit]'); await p.waitForSelector('.sheet'); await p.click('[data-sheet="post"]'); await p.waitForSelector('.post-title', { timeout: 90000 });
  const id = await p.evaluate(() => location.hash.split('/').pop());
  const after = await call({ action: 'boot', quiet: true }); t = after.posts.find(x => x.id === id);
  console.log('posted:', t.title, '| has thumbnail:', !!t.thumb, Math.round((t.thumb || '').length / 1024) + 'KB', '| bullets:', (await p.$$('.post-body li')).length, '| bold:', await p.textContent('.post-body strong'));
  await p.click('button.stats'); await p.waitForSelector('.tally', { timeout: 60000 });
  console.log('who has read (live screen):', await p.textContent('.tally-top b'), '|', (await p.$$eval('.section-label', e => e.map(x => x.textContent.trim()))).join(' / '));
  await p.screenshot({ path: path.join(OUT, 'live-who-has-read.png') });
  console.log('script errors:', errs.length);
  await b.close();
})().catch(e => { console.error(String(e).slice(0, 500)); process.exit(1); });
