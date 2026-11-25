// Taps the banner and the card body with a finger (touch), not a mouse.
const http = require('http'), fs = require('fs'), path = require('path'); const { chromium, devices } = require('playwright');
const ROOT = path.join(__dirname, '..', 'site'); const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.woff2': 'font/woff2' };
const srv = http.createServer((q, r) => { let p = q.url.split('?')[0]; if (p === '/') p = '/index.html'; const f = path.join(ROOT, p); if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'Content-Type': T[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r); });
(async () => {
  await new Promise(r => srv.listen(8771, r)); const b = await chromium.launch();
  const c = await b.newContext(Object.assign({}, devices['iPhone 13'])); await c.addInitScript(() => { try { localStorage.setItem('vwp.edit', '1'); } catch (e) {} }); const p = await c.newPage();
  const post = { id: 'a', title: 'Test', body: 'Body', categoryId: 'c', pinned: false, needsRead: true, readBy: '', eventDate: '', author: 'Test', mine: false, createdAt: new Date().toISOString(), updated: false, buttonText: '', links: [], forMe: true, readAt: '', photo: null };
  await p.route('**/script.google.com/**', route => { const q = JSON.parse(route.request().postData()); route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(q.action === 'boot' ? { ok: true, me: { id: 'p', name: 'A B', firstName: 'A', role: 'member' }, settings: {}, categories: [{ id: 'c', name: 'Announcements', color: '#3F5FC0' }], posts: [post, Object.assign({}, post, { id: 'b', title: 'Second' })] } : { ok: true }) }); });
  await p.goto('http://localhost:8771/?k=' + 'x'.repeat(30)); await p.waitForSelector('.todo');
  await p.tap('.todo-count'); await p.waitForSelector('.post-title', { timeout: 5000 }); console.log('finger tap on banner text opens the post: true');
  await p.goBack(); await p.waitForSelector('.todo');
  await p.tap('.preview'); await p.waitForSelector('.post-title', { timeout: 5000 }); console.log('finger tap on card text opens the post: true');
  await b.close(); srv.close();
})().catch(e => { console.error('FAILED', String(e).slice(0, 300)); process.exit(1); });
