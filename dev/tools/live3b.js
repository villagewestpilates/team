const { chromium } = require('playwright'); const path = require('path'); const fs = require('fs');
const K = require('../.test-token.json').k;
const API = 'https://script.google.com/macros/s/' + fs.readFileSync(path.join(__dirname, '..', 'DEPLOYMENT_ID.txt'), 'utf8').trim() + '/exec';
(async () => {
  const b = await chromium.launch({ proxy: { server: process.env.HTTPS_PROXY } });
  const c = await b.newContext({ ignoreHTTPSErrors: true }); const p = await c.newPage();
  await p.goto('https://team.villagewestpilates.com/manifest.webmanifest');
  const out = await p.evaluate(async ([u, k]) => {
    const call = async bd => (await fetch(u, { method: 'POST', credentials: 'omit', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(Object.assign({ k }, bd)) })).json();
    // A noisy picture is the worst case for size, like a busy real photo.
    const cv = document.createElement('canvas'); cv.width = 1000; cv.height = 750; const g = cv.getContext('2d');
    const im = g.createImageData(1000, 750); for (let i = 0; i < im.data.length; i++) im.data[i] = i % 4 === 3 ? 255 : Math.random() * 255; g.putImageData(im, 0, 0);
    const data = cv.toDataURL('image/jpeg', 0.6);
    const me = (await call({ action: 'boot', quiet: true })).me.id;
    const t0 = Date.now();
    const r = await call({ action: 'savePost', photo: { data, w: 1000, h: 750 }, post: { title: 'Throwaway photo check', body: 'Storage check.', audience: 'people', audienceIds: [me], needsRead: false, links: [] } });
    const saveMs = Date.now() - t0; const t1 = Date.now();
    const back = await call({ action: 'getPhoto', postId: r.postId }); const getMs = Date.now() - t1;
    const gone = await call({ action: 'archivePost', postId: r.postId });
    return { sizeKB: Math.round(data.length / 1024), pieces: Math.ceil((data.length - 23) / 40000), identical: back.data === data, saveMs, getMs, removed: gone.ok };
  }, [API, K]);
  console.log(JSON.stringify(out)); await b.close();
})().catch(e => { console.error(String(e).slice(0, 400)); process.exit(1); });
