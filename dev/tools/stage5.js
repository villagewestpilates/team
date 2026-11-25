// Stage 5 checks (Resources and Contact) at phone width with a faked server.
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
const ALL = () => [
  ['Forms and tools', 'everyone', 'Arketa staff login', ''], ['Forms and tools', 'everyone', 'Studio Today', 'https://script.google.com/macros/s/x/exec'], ['Forms and tools', 'everyone', 'Incident Report Form', ''],
  ['Documents', 'everyone', 'Instructor Front Desk Binder', 'https://drive.google.com/file/d/1/view'], ['Documents', 'everyone', 'Employee Handbook', 'https://drive.google.com/file/d/2/view'], ['Documents', 'everyone', 'Class Menu and Instructor Guidelines', 'https://docs.google.com/spreadsheets/d/3/edit'],
  ['How-to videos', 'everyone', 'Setting the alarm', 'https://drive.google.com/file/d/4/view'], ['How-to videos', 'everyone', 'Thermostat', 'https://drive.google.com/file/d/5/view'],
  ['Apprentices', 'apprentices', 'Co-Teaching Sign Up', 'https://docs.google.com/spreadsheets/d/6/edit'], ['Apprentices', 'apprentices', 'Apprentice Meetings recordings', 'https://drive.google.com/drive/folders/7'],
  ['Admins', 'admins', 'Intermediate Class Approval SOP', 'https://docs.google.com/document/d/8/edit']
].map((r, i) => ({ id: 'r' + i, section: r[0], audience: r[1], title: r[2], url: r[3] }));
const CONTACTS = [{ name: 'The studio', label: 'Text the studio', phone: '+14435550100', primary: true }, { name: 'Bethany', label: 'Text Bethany', phone: '+14435550101' }, { name: 'Cole', label: 'Text Cole', phone: '+14435550102' }, { name: 'Adam', label: 'Text Adam', phone: '+12145550103' }];
const visible = (all, role, apprentice) => all.filter(r => !r.archived && (role === 'admin' || (r.url && (r.audience === 'everyone' || (r.audience === 'apprentices' && apprentice)))));

(async () => {
  await new Promise(r => server.listen(8772, r));
  const browser = await chromium.launch(); const base = 'http://localhost:8772/';
  async function session(role, apprentice) {
    const all = ALL(); let n = 50;
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 }); await ctx.addInitScript(() => { try { localStorage.setItem('vwp.edit', '1'); } catch (e) {} });
    const page = await ctx.newPage(); const errors = []; const sent = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.route('**/script.google.com/**', async route => {
      const req = JSON.parse(route.request().postData() || '{}'); let out = { ok: true };
      if (req.action === 'boot') out = { ok: true, me: { id: 'p0', name: 'Molly Hartman', firstName: 'Molly', role, apprentice }, settings: { beta: true }, categories: [], posts: [], canPost: role !== 'member', people: [], resources: visible(all, role, apprentice), contacts: CONTACTS };
      else if (req.action === 'saveResource') { sent.push(req.resource); const d = req.resource; if (d.id) Object.assign(all.find(r => r.id === d.id), { title: d.title, url: d.url, section: d.section, audience: d.audience, archived: d.archived }); else all.push({ id: 'r' + (n++), title: d.title, url: d.url, section: d.section, audience: d.audience }); out = { ok: true, resources: visible(all, role, apprentice) }; }
      route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(out) });
    });
    await page.goto(base + '?k=' + 'k'.repeat(30)); await page.waitForSelector('#tabbar:not([hidden])');
    return { ctx, page, errors, sent };
  }
  const shot = (page, n) => page.screenshot({ path: path.join(OUT, n + '.png') });
  const toast = page => page.textContent('#toast');
  const labels = page => page.$$eval('#res-list .section-label', e => e.map(x => x.textContent.trim()));

  // Team member, not an apprentice.
  let s = await session('member', false); let pg = s.page;
  await pg.click('[data-tab="resources"]'); await pg.waitForSelector('#res-list .res-row'); await pg.waitForTimeout(300);
  check('team member sees only Everyone sections', (await labels(pg)).join('|') === 'Forms and tools|Documents|How-to videos', (await labels(pg)).join('|'));
  check('resources without a link are hidden from the team', !(await pg.textContent('#res-list')).includes('Arketa staff login') && !(await pg.textContent('#res-list')).includes('Incident Report'));
  check('Binder and Handbook are two separate rows', (await pg.$$eval('.res-title', e => e.map(x => x.textContent))).filter(t => /Binder|Handbook/.test(t)).length === 2);
  check('links open in a new tab', await pg.$$eval('a.res-row', e => e.length === 6 && e.every(a => a.target === '_blank' && a.rel.includes('noopener'))));
  check('team member has no edit or add buttons', !(await pg.$('.res-edit')) && !(await pg.$('[data-res-add]')));
  await shot(pg, '01-resources-member');
  await pg.fill('#res-search', 'alarm'); await pg.waitForTimeout(150);
  check('search finds one and keeps its section heading', (await pg.$$('a.res-row')).length === 1 && (await labels(pg)).join() === 'How-to videos');
  await pg.fill('#res-search', 'zzz'); await pg.waitForTimeout(150); check('search empty state', (await pg.textContent('.empty .calm-title')) === 'Nothing matches');
  await pg.click('[data-res-clear]'); await pg.waitForTimeout(150); check('clear brings everything back', (await pg.$$('a.res-row')).length === 6);
  // Contact
  await pg.click('[data-tab="contact"]'); await pg.waitForSelector('.contact-main'); await pg.waitForTimeout(300);
  const hrefs = await pg.$$eval('.screen a[href^="sms:"]', e => e.map(a => a.getAttribute('href') + '|' + a.target));
  check('four Text buttons with sms links in new tabs, studio first', hrefs.join(',') === 'sms:+14435550100|_blank,sms:+14435550101|_blank,sms:+14435550102|_blank,sms:+12145550103|_blank', hrefs.join(','));
  check('studio is the big one, number shown plainly', (await pg.textContent('.contact-main-title')) === 'Text the studio' && (await pg.textContent('.contact-num')) === '(443) 555-0100');
  check('tap targets at least 44px', await pg.$$eval('.screen a[href^="sms:"]', e => e.every(a => a.getBoundingClientRect().height >= 44)));
  check('no side scroll', await pg.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await shot(pg, '02-contact');
  check('no script errors (member)', s.errors.length === 0, s.errors.join(' | '));
  await s.ctx.close();

  // Apprentice sees the Apprentices section, not Admins.
  s = await session('member', true); await s.page.click('[data-tab="resources"]'); await s.page.waitForSelector('#res-list .res-row');
  check('apprentice also sees Apprentices', (await labels(s.page)).join('|') === 'Forms and tools|Documents|How-to videos|Apprentices');
  await s.ctx.close();

  // Admin manages the list.
  s = await session('admin', false); pg = s.page;
  await pg.click('[data-tab="resources"]'); await pg.waitForSelector('#res-list .res-row'); await pg.waitForTimeout(300);
  check('admin sees all five sections', (await labels(pg)).length === 5);
  check('admin sees the ones that still need a link', (await pg.$$('.res-row.todo-link')).length === 2);
  await shot(pg, '03-resources-admin'); await pg.screenshot({ path: path.join(OUT, '03-resources-admin-full.png'), fullPage: true });
  await pg.click('.res-row.todo-link'); await pg.waitForSelector('#rf-url'); await pg.waitForTimeout(200); await shot(pg, '04-resource-form');
  await pg.fill('#rf-url', 'arketa.co/login'); await pg.click('[data-sheet="saveres"]'); await pg.waitForTimeout(200);
  check('link without https is caught', (await toast(pg)) === 'Links need to start with https://');
  await pg.fill('#rf-url', 'https://app.arketa.co/login'); await pg.click('[data-sheet="saveres"]'); await pg.waitForTimeout(500);
  check('adding a link turns it into a real row', (await pg.$$('.res-row.todo-link')).length === 1 && !!(await pg.$('a.res-row[href="https://app.arketa.co/login"]')));
  await pg.click('[data-res-add]'); await pg.waitForSelector('#rf-title');
  await pg.fill('#rf-title', 'Retail price list'); await pg.fill('#rf-url', 'https://docs.google.com/spreadsheets/d/9/edit'); await pg.fill('#rf-newsec', 'Retail'); await pg.click('[data-raud="admins"]');
  await pg.click('[data-sheet="saveres"]'); await pg.waitForTimeout(500);
  const last = s.sent[s.sent.length - 1];
  check('new resource sent with a new section and audience', last.section === 'Retail' && last.audience === 'admins' && !last.id, JSON.stringify(last));
  check('new section appears with an Admins only tag', (await labels(pg)).includes('Retail') && (await pg.textContent('#res-list')).includes('Retail price listAdmins only'));
  await pg.click('[data-res-edit="r7"]'); await pg.waitForSelector('#rf-title'); check('edit form is filled in', (await pg.inputValue('#rf-title')) === 'Thermostat');
  await pg.click('[data-sheet="removeres"]'); await pg.waitForTimeout(500);
  check('removed resource is gone', !(await pg.textContent('#res-list')).includes('Thermostat'));
  check('no script errors (admin)', s.errors.length === 0, s.errors.join(' | '));
  await s.ctx.close();

  // The public "link didn't work" screen uses the studio line, not a personal number.
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } }); await ctx.addInitScript(() => { try { localStorage.setItem('vwp.edit', '1'); } catch (e) {} }); const p0 = await ctx.newPage();
  await p0.goto(base); await p0.waitForSelector('.center h1');
  check('link problem screen offers Text the studio', (await p0.textContent('.center .btn')).trim() === 'Text the studio');
  const src = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
  check('no personal phone numbers in the public app files', !/4435550111|4435550112|2145550113/.test(src));
  await ctx.close();
  console.log(log.join('\n')); await browser.close(); server.close();
})().catch(e => { console.log(log.join('\n')); console.error(e); process.exit(1); });
