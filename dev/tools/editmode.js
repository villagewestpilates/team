// Checks Edit mode: off by default so admins see what the team sees, one tap to bring the tools back. Faked server.
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
const b0 = { categoryId: 'c', pinned: false, needsRead: true, readBy: '', eventDate: '', updated: false, buttonText: '', links: [], forMe: true, photo: null };
const world = role => ({ ok: true, me: { id: 'p0', name: 'Adam Caldwell', firstName: 'Adam', role }, settings: { beta: true }, categories: [{ id: 'c', name: 'Announcements', color: '#3F5FC0' }],
  posts: role === 'member' ? [Object.assign({}, b0, { id: 'a', title: 'Studio closed Thursday', body: 'Body', author: 'Bethany', mine: false, createdAt: '2026-11-23T15:00:00Z', readAt: '2026-11-23T16:00:00Z' })] : [
    Object.assign({}, b0, { id: 'a', title: 'Studio closed Thursday', body: 'Body', author: 'Bethany', mine: false, createdAt: '2026-11-23T15:00:00Z', readAt: '2026-11-23T16:00:00Z', canEdit: true, stats: { read: 2, total: 5 }, audience: 'everyone', audienceIds: [], authorId: 'p1', status: '' }),
    Object.assign({}, b0, { id: 'd', title: 'Half-written draft', body: '', author: 'Adam', mine: true, createdAt: '2026-11-24T15:00:00Z', readAt: '', canEdit: true, stats: { read: 0, total: 5 }, audience: 'everyone', audienceIds: [], authorId: 'p0', status: 'draft', savedAt: '2026-11-24T15:00:00Z' })],
  canPost: role !== 'member', people: [], defaultCategory: 'c',
  resources: [{ id: 'r1', title: 'Employee Handbook', url: 'https://drive.google.com/file/d/1/view', section: 'Documents', audience: 'everyone' }, { id: 'r3', title: 'Class Approval SOP', url: 'https://docs.google.com/document/d/3/edit', section: 'Admins', audience: 'admins' }].concat(role === 'admin' ? [{ id: 'r2', title: 'Incident Report Form', url: '', section: 'Documents', audience: 'everyone' }] : []).filter(r => role === 'admin' || r.audience === 'everyone'),
  contacts: [] });
(async () => {
  await new Promise(r => server.listen(8776, r));
  const browser = await chromium.launch(); const base = 'http://localhost:8776/';
  async function open(role) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(String(e)));
    await page.route('**/script.google.com/**', route => { const q = JSON.parse(route.request().postData()); route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(q.action === 'boot' ? world(role) : q.action === 'team' ? { ok: true, team: [], settings: { beta: true }, categories: [], emailMode: 'test' } : { ok: true }) }); });
    await page.goto(base + '?k=' + 'k'.repeat(30)); await page.waitForSelector('#tabbar:not([hidden])'); await page.waitForTimeout(300);
    return { ctx, page, errors };
  }
  const shot = (page, n) => page.screenshot({ path: path.join(OUT, n + '.png') });

  const flip = async pg => { await pg.click('[data-tab="team"]'); await pg.waitForSelector('.switch-row[data-editmode]'); await pg.click('.switch-row[data-editmode]'); await pg.waitForTimeout(300); };
  let s = await open('admin'); let pg = s.page;
  check('no floating switch anywhere', !(await pg.$('.editchip')));
  check('off by default: no New post button, no drafts link on Home', !(await pg.$('.fab')) && !(await pg.$('.pending-link')));
  await pg.click('.post-row'); await pg.waitForSelector('.post-title');
  check('off: an open post has no pencil and no read count', !(await pg.$('[data-edit]')) && !(await pg.$('.stats')));
  await pg.click('.bar-back'); await pg.waitForSelector('.calm');
  await pg.click('[data-tab="resources"]'); await pg.waitForSelector('#res-list .res-row'); await pg.waitForTimeout(300);
  check('off: Resources has no pencils, no Add button, no unfinished rows', !(await pg.$('.res-edit')) && !(await pg.$('[data-res-add]')) && !(await pg.$('.todo-link')) && !(await pg.textContent('#res-list')).includes('Incident Report'));
  check('off: nothing floats over the list', !(await pg.$('.fab')) && !(await pg.$('.editchip')));
  await shot(pg, '01-resources-edit-off');
  await pg.click('[data-tab="team"]'); await pg.waitForSelector('.switch-row[data-editmode]'); await pg.waitForTimeout(300);
  const first = await pg.evaluate(() => document.querySelector('.screen .section-label').textContent.trim());
  check('Edit mode is the first thing in Settings, switched off', first === 'Edit mode' && (await pg.getAttribute('.switch-row[data-editmode]', 'aria-checked')) === 'false', first);
  await shot(pg, '02-settings-edit-off');
  await pg.click('.switch-row[data-editmode]'); await pg.waitForTimeout(300);
  check('switching it on says so', (await pg.getAttribute('.switch-row[data-editmode]', 'aria-checked')) === 'true' && (await pg.textContent('#toast')).startsWith('Edit mode is on'));
  await pg.click('[data-tab="resources"]'); await pg.waitForSelector('.res-edit');
  check('on: pencils, Add, and unfinished rows appear in Resources', !!(await pg.$('[data-res-add]')) && !!(await pg.$('.todo-link')));
  await pg.click('[data-tab="bulletins"]'); await pg.waitForSelector('.pending-row'); check('on: drafts show in Bulletins, New post is back', !!(await pg.$('.fab')));
  await pg.click('[data-tab="home"]'); await pg.waitForSelector('.fab'); await pg.waitForTimeout(300); await shot(pg, '03-home-edit-on');
  await pg.click('.post-row'); await pg.waitForSelector('.post-title'); check('on: pencil and read count are back on the post', !!(await pg.$('[data-edit]')) && !!(await pg.$('.stats')));
  await pg.click('.bar-back'); await pg.reload(); await pg.waitForSelector('.fab'); check('the choice is remembered', true);
  await flip(pg); await pg.click('[data-tab="home"]'); await pg.waitForSelector('.calm'); await pg.waitForTimeout(300);
  check('switching it off hides the tools again', !(await pg.$('.fab')) && !(await pg.$('.pending-link')));
  check('no script errors (admin)', s.errors.length === 0, s.errors.join(' | ')); await s.ctx.close();

  s = await open('poster'); check('poster: off to start', !(await s.page.$('.fab')));
  await flip(s.page); await s.page.click('[data-tab="home"]'); await s.page.waitForSelector('.fab'); check('poster: on shows New post', true);
  await s.page.click('[data-tab="resources"]'); await s.page.waitForSelector('#res-list .res-row'); check('poster: still no resource pencils, those are admin only', !(await s.page.$('.res-edit')));
  await s.ctx.close();
  s = await open('member'); await s.page.click('[data-tab="team"]'); await s.page.waitForSelector('.textsize');
  check('team member has no Edit mode switch', !(await s.page.$('[data-editmode]')) && (await s.page.evaluate(() => document.querySelector('.screen .section-label').textContent.trim())) === 'Text size on this phone');
  await s.ctx.close();
  console.log(log.join('\n')); await browser.close(); server.close();
})().catch(e => { console.log(log.join('\n')); console.error(e); process.exit(1); });
