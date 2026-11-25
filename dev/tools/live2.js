const { chromium } = require('playwright'); const path = require('path');
const OUT = process.argv[2]; const K = require('../.test-token.json').k;
(async () => {
  const b = await chromium.launch({ proxy: { server: process.env.HTTPS_PROXY } });
  const c = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, ignoreHTTPSErrors: true });
  const p = await c.newPage(); const errs = []; p.on('pageerror', e => errs.push(String(e)));
  const t0 = Date.now();
  await p.goto('https://team.villagewestpilates.com/?k=' + K);
  await p.waitForSelector('.todo, .calm', { timeout: 45000 });
  console.log('first load ms:', Date.now() - t0);
  await p.waitForTimeout(500); await p.screenshot({ path: path.join(OUT, 'live-1-home.png') });
  console.log('home:', await p.evaluate(() => (document.querySelector('.todo-count') || document.querySelector('.calm-title')).textContent));
  if (await p.$('[data-start]')) {
    await p.click('[data-start]'); await p.waitForSelector('#markread'); await p.waitForTimeout(500);
    await p.screenshot({ path: path.join(OUT, 'live-2-post.png') });
    console.log('post:', await p.textContent('.post-title'), '|', await p.textContent('.progress-text'));
    await p.click('#markread'); await p.waitForSelector('.done'); await p.waitForTimeout(4000);
    await p.screenshot({ path: path.join(OUT, 'live-3-done.png') });
    console.log('done:', await p.textContent('.done p'));
  }
  await p.reload(); await p.waitForSelector('.todo, .calm'); await p.waitForTimeout(4000);
  console.log('after reload:', await p.evaluate(() => (document.querySelector('.todo-count') || document.querySelector('.calm-title')).textContent), '| errors:', errs.length);
  await p.screenshot({ path: path.join(OUT, 'live-4-home-after.png') });
  await b.close();
})().catch(e => { console.error(String(e).slice(0, 400)); process.exit(1); });
