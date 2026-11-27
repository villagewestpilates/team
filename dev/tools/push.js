// Phone-width checks for the Notifications switch in Settings. The phone's notification system is faked.
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const ROOT = path.join(__dirname, '..', 'site'); const OUT = process.argv[2];
const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.woff2': 'font/woff2', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((q, r) => { let p = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (p.endsWith(path.sep) || p === ROOT) p = path.join(ROOT, 'index.html'); fs.readFile(p, (e, d) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': T[path.extname(p)] || 'text/plain', 'cache-control': 'no-store' }); r.end(d); }); });
const K = 'thisisnotarealtokenatall12345678';
const log = []; const check = (n, ok, x) => log.push((ok ? 'PASS ' : 'FAIL ') + n + (x ? '  [' + x + ']' : ''));

/** Stands in for the phone: permission, the worker, and the subscription. */
function fakePhone(o) {
  const st = { perm: o.perm || 'default', answer: o.answer || 'granted', sub: o.sub ? { endpoint: 'https://web.push.apple.com/fake-1' } : null, registered: !!o.sub };
  if (o.noPush) { try { delete window.PushManager; } catch (e) {} Object.defineProperty(window, 'PushManager', { value: undefined, configurable: true }); return; }
  window.PushManager = window.PushManager || function () {};
  window.Notification = { get permission() { return st.perm; }, requestPermission: () => { st.perm = st.answer; return Promise.resolve(st.perm); } };
  const mkSub = () => ({ endpoint: st.sub.endpoint, unsubscribe: () => { st.sub = null; return Promise.resolve(true); } });
  const reg = { pushManager: { getSubscription: () => Promise.resolve(st.sub ? mkSub() : null), subscribe: opts => { window.__subOpts = { visible: opts.userVisibleOnly, keyLen: opts.applicationServerKey.length }; st.sub = { endpoint: 'https://web.push.apple.com/fake-1' }; return Promise.resolve(mkSub()); } } };
  Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { register: (u, opt) => { window.__reg = { u, scope: opt && opt.scope }; st.registered = true; return Promise.resolve(reg); }, get ready() { return Promise.resolve(reg); }, getRegistration: () => Promise.resolve(st.registered ? reg : undefined) } });
}

(async () => {
  await new Promise(r => server.listen(8793, r));
  const browser = await chromium.launch({ args: ['--no-proxy-server'] }); /* The checks always run as if it were this moment, so dates in them never go stale. */ { const nc = browser.newContext.bind(browser); browser.newContext = async o => { const c = await nc(o); await c.clock.setFixedTime(new Date('2026-11-25T18:44:00Z')); return c; }; } const base = 'http://localhost:8793/';
  async function session(o) {
    const ctx = await browser.newContext(Object.assign({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 }, o.ua ? { userAgent: o.ua } : {}));
    await ctx.addInitScript(fakePhone, o); const page = await ctx.newPage(); const errors = [], sent = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.route('**/script.google.com/**', async route => {
      const req = JSON.parse(route.request().postData() || '{}'); sent.push(req); let out = { ok: true };
      if (req.action === 'boot') out = { ok: true, me: { id: 'p1', name: 'Molly Hartman', firstName: 'Molly', role: 'member', apprentice: false, tools: false }, settings: { beta: true }, categories: [], posts: [], resources: [], contacts: [] };
      else if (req.action === 'pushKey') out = o.failKey ? { ok: false } : { ok: true, key: 'B' + 'A'.repeat(86) };
      route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(out) });
    });
    await page.goto(base + '?k=' + K); await page.waitForSelector('.tabbar-in'); await page.click('[data-tab="team"]'); await page.waitForSelector('.section-label');
    return { ctx, page, errors, sent };
  }
  const toastText = async p => { await p.waitForSelector('.toast.show', { timeout: 3000 }).catch(() => {}); return (await p.textContent('#toast')).trim(); };
  const labels = p => p.$$eval('.section-label', e => e.map(x => x.textContent.trim()));

  // 1. Off to on
  let s = await session({});
  check('Settings has a Notifications section, after text size', (await labels(s.page)).join('|').includes('Text size on this phone|Notifications on this phone'), (await labels(s.page)).join('|'));
  check('the switch starts off', (await s.page.getAttribute('[data-pushtoggle]', 'aria-checked')) === 'false');
  await s.page.screenshot({ path: path.join(OUT, '01-notifications-off.png') });
  await s.page.click('[data-pushtoggle]');
  check('turning it on says so', (await toastText(s.page)) === 'Notifications are on for this phone');
  check('the switch shows on', (await s.page.getAttribute('[data-pushtoggle]', 'aria-checked')) === 'true');
  const acts = s.sent.map(r => r.action).filter(a => a.startsWith('push'));
  check('it fetched the key, then saved this phone with the server', acts.join(',') === 'pushKey,pushOn' && s.sent.find(r => r.action === 'pushOn').endpoint === 'https://web.push.apple.com/fake-1', acts.join(','));
  check('the worker is registered for the app only, with a visible-notification subscription', await s.page.evaluate(() => window.__reg.u === 'sw.js' && window.__reg.scope === './' && window.__subOpts.visible === true && window.__subOpts.keyLen === 65));
  await s.page.screenshot({ path: path.join(OUT, '02-notifications-on.png') });
  await s.page.evaluate(() => { const b = document.querySelector('[data-pushtoggle]'); b.click(); b.click(); b.click(); });
  check('turning it off says so, even on a triple tap', (await toastText(s.page)) === 'Notifications are off for this phone' && s.sent.filter(r => r.action === 'pushOff').length === 1, String(s.sent.filter(r => r.action === 'pushOff').length));
  check('the switch shows off again', (await s.page.getAttribute('[data-pushtoggle]', 'aria-checked')) === 'false');
  check('no script errors', s.errors.length === 0, s.errors.join(' | '));
  await s.ctx.close();

  // 2. Already on from an earlier visit
  s = await session({ perm: 'granted', sub: true });
  await s.page.waitForFunction(() => document.querySelector('[data-pushtoggle]').getAttribute('aria-checked') === 'true', null, { timeout: 3000 }).catch(() => {});
  check('a phone that is already signed up shows on, and tells the server again', (await s.page.getAttribute('[data-pushtoggle]', 'aria-checked')) === 'true' && s.sent.some(r => r.action === 'pushOn'));
  await s.ctx.close();

  // 3. The person says no
  s = await session({ answer: 'denied' });
  await s.page.click('[data-pushtoggle]');
  check('declining leaves it off and explains', (await toastText(s.page)) === 'Notifications weren\'t allowed, so they\'re still off.' && !s.sent.some(r => r.action === 'pushOn'));
  check('after declining, it explains how to allow them', (await s.page.textContent('#app')).includes('Notifications are blocked for this app on this phone.') && !(await s.page.$('[data-pushtoggle]')));
  await s.ctx.close();

  // 4. The server cannot be reached
  s = await session({ failKey: true });
  await s.page.click('[data-pushtoggle]');
  check('a failure leaves it off and says to try again', (await toastText(s.page)) === 'That didn\'t work. Check your connection and try again.' && (await s.page.getAttribute('[data-pushtoggle]', 'aria-checked')) === 'false');
  await s.ctx.close();

  // 5. iPhone in Safari, not from the Home Screen
  s = await session({ noPush: true, ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1' });
  check('an iPhone in Safari is told to open from the Home Screen', (await s.page.textContent('#app')).includes('To get notifications on an iPhone, open the app from its Home Screen icon.') && !(await s.page.$('[data-pushtoggle]')));
  await s.page.screenshot({ path: path.join(OUT, '03-notifications-iphone-safari.png') });
  check('no script errors (iPhone)', s.errors.length === 0, s.errors.join(' | '));
  await s.ctx.close();

  // 6. The worker file itself
  const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  check('the worker only handles notifications and never intercepts page loads', /addEventListener\('push'/.test(sw) && /notificationclick/.test(sw) && !/addEventListener\('fetch'/.test(sw) && !/caches\./.test(sw));
  check('the notification wording has no emoji, dash, or names', /showNotification\('Something new to read', \{\s+body: 'Open the app to see it\.'/.test(sw));

  console.log(log.join('\n'));
  await browser.close(); server.close();
})().catch(e => { console.log(log.join('\n')); console.log('Error ' + e.message); process.exit(1); });
