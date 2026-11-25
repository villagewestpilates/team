const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ proxy: { server: process.env.HTTPS_PROXY } });
  const c = await b.newContext({ viewport: { width: 390, height: 844 }, ignoreHTTPSErrors: true });
  const p = await c.newPage();
  const errs = []; p.on('pageerror', e => errs.push(String(e)));
  await p.goto('https://team.villagewestpilates.com/?k=' + require('../.test-token.json').k);
  await p.waitForSelector('.hello-name', { timeout: 45000 });
  console.log('greets:', await p.textContent('.hello-name'), '| errors:', errs.length);
  const q = await c.newPage(); await q.goto('https://team.villagewestpilates.com/?k=notarealtokennotarealtoken');
  await q.waitForSelector('.center h1', { timeout: 45000 }); console.log('bad link:', await q.textContent('.center h1'));
  await b.close();
})().catch(e => { console.error(String(e).slice(0, 300)); process.exit(1); });
