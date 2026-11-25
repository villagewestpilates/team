// Makes the small header wordmark from the official brand file: the "VILLAGE WEST" line, on a clear background.
const { chromium } = require('playwright'); const fs = require('fs'); const path = require('path');
const SRC = process.argv[2], OUT = process.argv[3];
(async () => {
  const b = await chromium.launch(); const p = await b.newPage();
  const data = 'data:image/png;base64,' + fs.readFileSync(SRC).toString('base64');
  const res = await p.evaluate(async d => {
    const img = new Image(); img.src = d; await img.decode();
    // find the bottom of the first line of lettering by scanning rows for ink
    const probe = document.createElement('canvas'); probe.width = 400; probe.height = Math.round(400 * img.height / img.width);
    const g = probe.getContext('2d'); g.drawImage(img, 0, 0, probe.width, probe.height);
    const px = g.getImageData(0, 0, probe.width, probe.height).data;
    const ink = y => { let n = 0; for (let x = 0; x < probe.width; x++) { const i = (y * probe.width + x) * 4; if (px[i + 3] > 40 && px[i] + px[i + 1] + px[i + 2] < 600) n++; } return n; };
    let top = 0; while (top < probe.height && !ink(top)) top++;
    let bottom = top; while (bottom < probe.height && ink(bottom)) bottom++;
    const sy = top / probe.height * img.height, sh = (bottom - top) / probe.height * img.height;
    const W = 720, H = Math.round(W * sh / img.width);
    const c = document.createElement('canvas'); c.width = W; c.height = H; const k = c.getContext('2d');
    k.drawImage(img, 0, sy, img.width, sh, 0, 0, W, H);
    const im = k.getImageData(0, 0, W, H); const q = im.data;
    for (let i = 0; i < q.length; i += 4) { const light = (q[i] + q[i + 1] + q[i + 2]) / 3; if (q[i + 3] > 0 && light > 235) q[i + 3] = 0; }   // clear any white backing
    k.putImageData(im, 0, 0);
    return { url: c.toDataURL('image/png'), W, H };
  }, data);
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, Buffer.from(res.url.split(',')[1], 'base64'));
  console.log('wordmark', res.W + 'x' + res.H, fs.statSync(OUT).size + ' bytes');
  await b.close();
})();
