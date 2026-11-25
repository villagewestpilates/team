// Lays several screenshots side by side in one picture, for reviewing the whole app at a glance.
const { chromium } = require('playwright'); const fs = require('fs');
const out = process.argv[2]; const files = process.argv.slice(3);
(async () => {
  const b = await chromium.launch(); const W = 300, H = 660;
  const p = await b.newPage({ viewport: { width: files.length * (W + 12) + 12, height: H + 24 }, deviceScaleFactor: 1 });
  await p.setContent('<body style="margin:0;background:#BDBDBD;display:flex;gap:12px;padding:12px">' + files.map(f => '<div style="width:' + W + 'px;height:' + H + 'px;overflow:hidden;border-radius:10px;background:#fff"><img style="width:' + W + 'px;display:block" src="data:image/png;base64,' + fs.readFileSync(f).toString('base64') + '"></div>').join('') + '</body>');
  await p.waitForTimeout(500); await p.screenshot({ path: out }); await b.close();
})();
