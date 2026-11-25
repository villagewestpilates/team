// Stage 4 checks at phone width with a faked server.
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const ROOT = path.join(__dirname, '..', 'site'); const OUT = process.argv[2];
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
  const f = path.join(ROOT, p); if (!f.startsWith(ROOT) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
});
const log = []; const check = (n, ok, x) => log.push((ok ? 'PASS ' : 'FAIL ') + n + (x ? '  [' + x + ']' : ''));
const THUMB = 'data:image/jpeg;base64,' + fs.readFileSync(path.join(ROOT, 'icons', 'icon-180.png')).toString('base64'); // any small image works for layout
function world() {
  const tok = i => ('tok' + i).padEnd(32, 'x');
  const team = ['Adam Caldwell|admin|0', 'Bethany Bradshaw|admin|1', 'Charlotte Holt|poster|0', 'Molly Hartman|member|0', 'Aubrey Walsh|member|1'].map((s, i) => { const [name, role, a] = s.split('|'); return { id: 'p' + i, name, firstName: name.split(' ')[0], email: name.split(' ')[0].toLowerCase() + '@example.com', role, apprentice: a === '1', deactivated: false, token: tok(i), lastVisit: i < 3 ? '2026-11-2' + (2 + i) + 'T15:00:00Z' : '', linkSentAt: '' }; });
  const categories = [{ id: 'cat_announcements', name: 'Announcements', color: '#3F5FC0', archived: false }, { id: 'cat_policies', name: 'Policies', color: '#7B52B9', archived: false }, { id: 'cat_old', name: 'Old one', color: '#5A6470', archived: true }];
  const base = { categoryId: 'cat_announcements', pinned: false, needsRead: true, readBy: '', eventDate: '', updated: false, buttonText: '', links: [], forMe: true, photo: null };
  const posts = [
    Object.assign({}, base, { id: 'a', title: 'Studio closed Thursday for Thanksgiving', body: '**Bring:**\n- Your mat\n- Water\n\nSee you Friday.', author: 'Bethany', mine: false, createdAt: '2026-11-23T15:00:00Z', readAt: '', thumb: THUMB, photo: { w: 4, h: 3 }, canEdit: true, stats: { read: 2, total: 5 }, audience: 'everyone', audienceIds: [], skipEmail: false, authorId: 'p1' }),
    Object.assign({}, base, { id: 'b', title: 'Retail shelf reset', body: 'Done.', author: 'Charlotte', mine: false, categoryId: 'cat_old', createdAt: '2026-11-20T15:00:00Z', readAt: '2026-11-21T15:00:00Z', canEdit: true, stats: { read: 5, total: 5 }, audience: 'everyone', audienceIds: [], skipEmail: false, authorId: 'p2' })
  ];
  return { team, categories, posts, beta: true, n: 10 };
}
(async () => {
  await new Promise(r => server.listen(8769, r));
  const browser = await chromium.launch(); const base = 'http://localhost:8769/';
  async function session(meIdx, w) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, permissions: ['clipboard-read', 'clipboard-write'] }); await ctx.addInitScript(() => { try { localStorage.setItem('vwp.edit', '1'); } catch (e) {} });
    const page = await ctx.newPage(); const errors = []; const sent = [];
    page.on('pageerror', e => errors.push(String(e)));
    const teamReply = x => Object.assign({ ok: true, team: w.team, settings: { beta: w.beta }, categories: w.categories, emailOn: false }, x || {});
    await page.route('**/script.google.com/**', async route => {
      const req = JSON.parse(route.request().postData() || '{}'); sent.push(req); let out = { ok: true };
      const me = w.team.find(t => t.token === req.k);
      if (!me || me.deactivated) out = { ok: false, code: 'auth' };
      else if (req.action === 'boot') out = { ok: true, me: { id: me.id, name: me.name, firstName: me.firstName, role: me.role, apprentice: me.apprentice }, settings: { beta: w.beta }, categories: w.categories, posts: me.role === 'member' ? w.posts.map(p => Object.assign({}, p, { canEdit: false, stats: undefined })) : me.role === 'poster' ? w.posts.map(p => p.authorId === me.id ? p : Object.assign({}, p, { canEdit: false, stats: undefined })) : w.posts, canPost: me.role !== 'member', people: me.role === 'member' ? [] : w.team.filter(t => !t.deactivated).map(t => ({ id: t.id, name: t.name, firstName: t.firstName, apprentice: t.apprentice, role: t.role })), defaultCategory: 'cat_announcements', serverTime: new Date().toISOString() };
      else if (req.action === 'readers') out = { ok: true, postId: req.postId, emailOn: false, groups: { read: [{ id: 'p1', name: 'Bethany Bradshaw', at: '2026-11-23T16:00:00Z', lastVisit: '2026-11-23T16:00:00Z' }, { id: 'p0', name: 'Adam Caldwell', at: '2026-11-23T15:30:00Z', lastVisit: '2026-11-24T15:00:00Z' }], opened: [{ id: 'p2', name: 'Charlotte Holt', at: '2026-11-24T14:00:00Z', lastVisit: '2026-11-24T14:00:00Z' }], notOpened: [{ id: 'p3', name: 'Molly Hartman', lastVisit: '2026-11-22T14:00:00Z' }, { id: 'p4', name: 'Aubrey Walsh', lastVisit: '' }] } };
      else if (req.action === 'nudge' || req.action === 'emailLink') out = { ok: false, code: 'email_off', message: 'Email isn\'t switched on yet. It comes in the last stage.' };
      else if (req.action === 'team') out = me.role === 'admin' ? teamReply() : { ok: false, code: 'forbidden', message: 'Only admins can do that.' };
      else if (req.action === 'savePerson') { const d = req.person; if (d.id) { Object.assign(w.team.find(t => t.id === d.id), { name: d.name, firstName: d.name.split(' ')[0], email: d.email, role: d.role, apprentice: d.apprentice }); out = teamReply({ personId: d.id }); } else { const id = 'p' + (w.n++); w.team.push({ id, name: d.name, firstName: d.name.split(' ')[0], email: d.email, role: d.role, apprentice: d.apprentice, deactivated: false, token: ('new' + id).padEnd(32, 'z'), lastVisit: '', linkSentAt: '' }); out = teamReply({ personId: id, added: true }); } }
      else if (req.action === 'newLink') { const t = w.team.find(x => x.id === req.id); t.token = ('rot' + (w.n++)).padEnd(32, 'r'); out = teamReply({ personId: t.id, newK: t.id === me.id ? t.token : '' }); }
      else if (req.action === 'setActive') { w.team.find(x => x.id === req.id).deactivated = !req.active; out = teamReply({ personId: req.id }); }
      else if (req.action === 'saveSetting') { w.beta = req.value; out = teamReply(); }
      else if (req.action === 'saveCategory') { const d = req.category; if (d.id) Object.assign(w.categories.find(c => c.id === d.id), { name: d.name, color: d.color, archived: !!d.archived }); else w.categories.push({ id: 'cat_n' + (w.n++), name: d.name, color: d.color, archived: false }); out = teamReply(); }
      else if (req.action === 'savePost') out = { ok: true, postId: 'a', isNew: true, posts: w.posts };
      else if (req.action === 'getPhoto') out = { ok: true, data: THUMB };
      route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(out) });
    });
    await page.goto(base + '?k=' + w.team[meIdx].token);
    return { ctx, page, errors, sent };
  }
  const shot = (page, n) => page.screenshot({ path: path.join(OUT, n + '.png') });
  const toast = page => page.textContent('#toast');

  // Admin
  let w = world(); let s = await session(0, w); const pg = s.page;
  await pg.waitForSelector('.post-card'); await pg.waitForTimeout(300);
  check('thumbnail shows on the card', !!(await pg.$('.post-card img.thumb')));
  check('card preview has no ** or dashes', !(await pg.textContent('.preview')).includes('*') && (await pg.textContent('.preview')).startsWith('Bring: Your mat'), await pg.textContent('.preview'));
  await shot(pg, '01-home-thumb');
  await pg.click('[data-open="a"]'); await pg.waitForSelector('.post-body');
  check('bold and bullets render', (await pg.$$('.post-body li')).length === 2 && (await pg.textContent('.post-body strong')) === 'Bring:');
  await pg.waitForTimeout(300); await shot(pg, '02-post-formatting');
  await pg.click('[data-readers]'); await pg.waitForSelector('.tally'); await pg.waitForTimeout(300);
  check('who has read: tally', (await pg.textContent('.tally-top b')) === '2 of 5 read' && (await pg.textContent('.tally-top span')) === '3 to go');
  const labels = await pg.$$eval('.section-label', e => e.map(x => x.textContent.trim()));
  check('three groups in order', labels.join('|') === 'Read 2|Opened but not marked 1|Not opened 2', labels.join('|'));
  const subs = await pg.$$eval('.person-sub', e => e.map(x => x.textContent));
  check('last visit wording', subs[2].startsWith('Opened ') && subs[3].startsWith('Last in the app ') && subs[4] === 'Hasn\'t opened the app yet', subs.join(' / '));
  check('nudge buttons only for people who have not read', (await pg.$$('.mini-btn')).length === 3);
  await shot(pg, '03-who-has-read');
  const sentBefore = s.sent.filter(r => r.action === 'nudge').length;
  await pg.$eval('.mini-btn', b => { b.click(); b.click(); b.click(); }); await pg.waitForTimeout(300);
  check('a triple tap on Nudge sends one request', s.sent.filter(r => r.action === 'nudge').length - sentBefore === 1, String(s.sent.filter(r => r.action === 'nudge').length - sentBefore));
  check('nudge says email is off for now', (await toast(pg)).startsWith('Email isn\'t switched on yet'));
  await pg.click('[data-back]'); await pg.waitForSelector('.post-body'); check('back returns to the post', true);
  await pg.click('[data-back]'); await pg.waitForSelector('#tabbar:not([hidden])');

  // Compose extras
  await pg.click('.fab'); await pg.waitForSelector('#f-body');
  await pg.fill('#f-body', 'Mat\nWater'); await pg.evaluate(() => { const t = document.getElementById('f-body'); t.setSelectionRange(0, t.value.length); });
  await pg.click('[data-fmt="list"]'); check('List button adds dashes', (await pg.inputValue('#f-body')) === '- Mat\n- Water');
  await pg.evaluate(() => { const t = document.getElementById('f-body'); t.setSelectionRange(2, 5); });
  await pg.click('[data-fmt="bold"]'); check('Bold button wraps the selection', (await pg.inputValue('#f-body')) === '- **Mat**\n- Water');
  await pg.click('[data-more]'); await pg.waitForSelector('[data-author]');
  const authors = await pg.$$eval('[data-author]', e => e.map(x => x.textContent));
  check('Post as lists admins and posters only', authors.join(',') === 'Me,Bethany,Charlotte', authors.join(','));
  check('archived category not offered', !(await pg.textContent('.compose')).includes('Old one'));
  await pg.click('[data-author="p1"]'); await pg.fill('#f-title', 'From Bethany');
  await pg.click('[data-submit]'); await pg.waitForSelector('.sheet'); await pg.click('[data-sheet="post"]'); await pg.waitForTimeout(500);
  const sp = s.sent.find(r => r.action === 'savePost');
  check('Post as is sent', sp && sp.post.authorId === 'p1');
  await pg.goto(base + '?k=' + w.team[0].token + '#/home'); await pg.waitForSelector('.post-card');

  // Team screen
  await pg.click('[data-tab="team"]'); await pg.click('[data-settab="team"]'); await pg.waitForSelector('[data-person-add]'); await pg.waitForTimeout(300);
  check('team list shows 5 people', (await pg.$$('[data-person-open]')).length === 5);
  check('Settings has My settings and Team buttons for an admin', (await pg.$$('.set-tabs .seg-btn')).length === 2 && (await pg.textContent('.set-tabs .seg-btn.on')) === 'Team');
  await shot(pg, '04-team'); await pg.screenshot({ path: path.join(OUT, '04-team-full.png'), fullPage: true });
  await pg.click('[data-person-open="p3"]'); await pg.waitForSelector('.linkbox'); await pg.waitForTimeout(250);
  const link0 = await pg.textContent('.linkbox'); await shot(pg, '05-person-sheet');
  await pg.click('[data-sheet="copy"]'); await pg.waitForTimeout(300);
  const clip = await pg.evaluate(() => navigator.clipboard.readText());
  check('Copy link puts the full link on the clipboard', clip === base + '?k=' + w.team[3].token, clip.slice(0, 60));
  await pg.click('[data-sheet="emaillink"]'); await pg.waitForTimeout(300); check('Email it says email is off for now', (await toast(pg)).startsWith('Email isn\'t switched on yet'));
  await pg.click('[data-sheet="asknewlink"]'); await pg.waitForTimeout(200); check('New link asks first', (await pg.textContent('.sheet h2')) === 'Give Molly a new link?');
  await shot(pg, '06-new-link-confirm');
  await pg.click('[data-sheet="newlink"]'); await pg.waitForSelector('.note'); const link1 = await pg.textContent('.linkbox');
  check('New link changes the link', link0 !== link1 && link1.includes('rot'));
  await pg.click('[data-sheet="askdeactivate"]'); await pg.waitForTimeout(200); await pg.click('[data-sheet="deactivate"]'); await pg.waitForTimeout(500);
  check('Deactivate moves them to Deactivated', (await pg.textContent('.screen')).includes('Deactivated 1'));
  await pg.click('[data-person-open="p3"]'); await pg.waitForSelector('[data-sheet="reactivate"]'); check('deactivated person shows no link', !(await pg.$('.linkbox')));
  await pg.click('[data-sheet="reactivate"]'); await pg.waitForSelector('.linkbox'); await pg.click('[data-sheet="close"]');
  check('Reactivate brings them back', !(await pg.textContent('.screen')).includes('Deactivated 1'));
  check('you cannot deactivate yourself', await (async () => { await pg.click('[data-person-open="p0"]'); await pg.waitForSelector('.linkbox'); const no = !(await pg.$('[data-sheet="askdeactivate"]')); return no; })());
  await pg.click('[data-sheet="asknewlink"]'); await pg.click('[data-sheet="newlink"]'); await pg.waitForSelector('.note'); await pg.waitForTimeout(300);
  check('my own new link: this device switches to it', pg.url().includes('k=' + w.team[0].token) && w.team[0].token.startsWith('rot'), pg.url().slice(0, 70));
  await pg.click('[data-sheet="close"]');
  // Add a team member
  await pg.click('[data-person-add]'); await pg.waitForSelector('#pf-name'); await pg.waitForTimeout(200); await shot(pg, '07-add-person');
  await pg.click('[data-sheet="saveperson"]'); await pg.waitForTimeout(200); check('add: name required', (await toast(pg)) === 'Add their name');
  await pg.fill('#pf-name', 'Jordan Rivers'); await pg.fill('#pf-email', 'not-an-email'); await pg.click('[data-sheet="saveperson"]'); await pg.waitForTimeout(200);
  check('add: bad email caught', (await toast(pg)) === 'That email doesn\'t look right');
  await pg.fill('#pf-email', 'jordan@example.com'); await pg.click('[data-prole="poster"]'); await pg.click('[data-papp]');
  await pg.click('[data-ptools]');
  check('typed text survives picking a role', (await pg.inputValue('#pf-name')) === 'Jordan Rivers');
  await pg.click('[data-sheet="saveperson"]'); await pg.waitForSelector('.note'); await pg.waitForTimeout(250);
  const added = s.sent.filter(r => r.action === 'savePerson').pop().person;
  check('add: sent with role, group, and editing tools', added.role === 'poster' && added.apprentice === true && added.tools === true && !added.id);
  check('add: shows the new link to copy', (await pg.textContent('.linkbox')).includes('new') && (await pg.textContent('.note')).startsWith('Added'));
  await shot(pg, '08-added'); await pg.click('[data-sheet="close"]');
  check('new person is on the list', (await pg.$$('[data-person-open]')).length === 6);
  // Settings
  await pg.click('[data-setting="Beta"]'); await pg.waitForTimeout(500);
  await pg.click('[data-tab="home"]'); await pg.waitForSelector('.hello'); check('Beta switch hides the tag', !(await pg.$('.beta')));
  await pg.click('[data-tab="team"]'); await pg.click('[data-settab="team"]'); await pg.waitForSelector('[data-cat-open]');
  await pg.click('[data-cat-open=""]'); await pg.waitForSelector('#cf-name'); await pg.fill('#cf-name', 'Retail'); await pg.click('[data-swatch="#C9432F"]'); await pg.waitForTimeout(150); await shot(pg, '09-category');
  await pg.click('[data-sheet="savecat"]'); await pg.waitForTimeout(500);
  await pg.click('[data-cat-open="cat_policies"]'); await pg.waitForSelector('#cf-name'); await pg.fill('#cf-name', 'Policies & Safety'); await pg.click('[data-sheet="savecat"]'); await pg.waitForTimeout(500);
  await pg.click('[data-tab="bulletins"]'); await pg.waitForSelector('#chips');
  const chips = await pg.$$eval('#chips .chip', e => e.map(x => x.textContent.trim()));
  check('new and renamed categories show in Bulletins, retired one does not', chips.includes('Retail') && chips.includes('Policies & Safety') && !chips.includes('Old one'), chips.join(','));
  check('old post keeps its retired category name', (await pg.textContent('#list')).includes('Retail shelf reset'));
  check('no side scroll', await pg.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  check('no script errors (admin)', s.errors.length === 0, s.errors.join(' | '));
  await s.ctx.close();

  // Poster: own posts only, no Team tab.
  w = world(); s = await session(2, w); await s.page.waitForSelector('.post-card');
  await s.page.click('[data-tab="team"]'); await s.page.waitForSelector('.textsize');
  check('poster gets Settings with text size but no Team tools', (await s.page.$$('.tab')).length === 5 && !(await s.page.$('[data-person-add]')) && !(await s.page.textContent('.screen')).includes('Add team member') && !s.sent.some(r => r.action === 'team'));
  await s.page.click('[data-tab="home"]'); await s.page.waitForSelector('.post-card');
  await s.page.click('[data-open="a"]'); await s.page.waitForSelector('.post-body'); check('poster: no count on someone else\'s post', !(await s.page.$('.stats')));
  await s.page.click('[data-back]'); await s.page.waitForSelector('.post-row'); await s.page.click('.post-row'); await s.page.waitForSelector('.post-body');
  check('poster: count on their own post', !!(await s.page.$('button.stats')));
  await s.page.click('[data-back]'); await s.page.click('.fab'); await s.page.waitForSelector('#f-body'); await s.page.click('[data-more]'); await s.page.waitForTimeout(150);
  check('poster: no Post as', !(await s.page.$('[data-author]')));
  await s.ctx.close();
  console.log(log.join('\n')); await browser.close(); server.close();
})().catch(e => { console.log(log.join('\n')); console.error(e); process.exit(1); });
