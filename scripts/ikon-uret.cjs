// Uygulama ikonu: SVG -> cok boyutlu PNG (Electron offscreen render) -> public/kokpit.ico
// Bagimlilik yok: Electron zaten var, ICO formati PNG girdileriyle basit (Vista+).
// Kullanim: npm run ikon   (public/kokpit.svg degisince tekrar calistir)
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const KOK = path.join(__dirname, '..');
const SVG = path.join(KOK, 'public', 'kokpit.svg');
const ICO = path.join(KOK, 'public', 'kokpit.ico');
const PNG = path.join(KOK, 'public', 'kokpit.png');
const BOYUTLAR = [16, 24, 32, 48, 64, 128, 256];

function icoPaketle(pngler) {
  // ICONDIR (6) + ICONDIRENTRY (16 x n) + veriler
  const baslik = Buffer.alloc(6);
  baslik.writeUInt16LE(0, 0);
  baslik.writeUInt16LE(1, 2);
  baslik.writeUInt16LE(pngler.length, 4);
  const girisler = [];
  let ofset = 6 + 16 * pngler.length;
  for (const { boyut, veri } of pngler) {
    const g = Buffer.alloc(16);
    g.writeUInt8(boyut >= 256 ? 0 : boyut, 0);
    g.writeUInt8(boyut >= 256 ? 0 : boyut, 1);
    g.writeUInt8(0, 2); // palet yok
    g.writeUInt8(0, 3);
    g.writeUInt16LE(1, 4); // duzlem
    g.writeUInt16LE(32, 6); // bit/piksel
    g.writeUInt32LE(veri.length, 8);
    g.writeUInt32LE(ofset, 12);
    ofset += veri.length;
    girisler.push(g);
  }
  return Buffer.concat([baslik, ...girisler, ...pngler.map((p) => p.veri)]);
}

app.whenReady().then(async () => {
  const svg = fs.readFileSync(SVG, 'utf8');
  // Rasterizasyon renderer'daki <canvas> ile: offscreen + transparent + capturePage
  // kombinasyonu bu makinede hic donmedi (olculdu, 90 sn), canvas.toDataURL aninda.
  const w = new BrowserWindow({ show: false, webPreferences: { sandbox: true } });
  await w.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent('<!doctype html><html><body></body></html>'));
  const pngler = [];
  for (const boyut of BOYUTLAR) {
    const veriUrl = await w.webContents.executeJavaScript(`
      new Promise((coz, red) => {
        const img = new Image();
        img.onload = () => {
          const c = document.createElement('canvas');
          c.width = ${boyut}; c.height = ${boyut};
          const ctx = c.getContext('2d');
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, 0, 0, ${boyut}, ${boyut});
          coz(c.toDataURL('image/png'));
        };
        img.onerror = () => red(new Error('svg yuklenemedi'));
        img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(${JSON.stringify(svg)});
      })
    `);
    pngler.push({ boyut, veri: Buffer.from(veriUrl.split(',')[1], 'base64') });
  }
  w.destroy();
  fs.writeFileSync(ICO, icoPaketle(pngler));
  fs.writeFileSync(PNG, pngler[pngler.length - 1].veri);
  console.log('yazildi: ' + ICO + ' (' + pngler.map((p) => p.boyut).join(',') + ') ve ' + PNG);
  app.quit();
});
