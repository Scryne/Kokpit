// v3.0 pano bekcisinin canli testi: yakala.cjs GERCEK Windows panosuna yazilan goruntuyu aliyor mu? Electron ana
// sureci (electron scripts/test-pano.cjs). Panonun onceki icerigi her turuyle basta alinir, sonda geri yazilir.
// Elle calistirilir, CI'da degil: gercek panoya dokunur. Veri gecici KOKPIT_DIZIN'de.
//   npm run test:pano
const { app, clipboard, nativeImage, ClipboardItem } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

const DIZIN = fs.mkdtempSync(path.join(os.tmpdir(), 'kokpit-pano-'));
process.env.KOKPIT_DIZIN = DIZIN;
const yakala = require(path.join(__dirname, '..', 'electron', 'yakala.cjs'));

app.whenReady().then(async () => {
  const eski = [];
  for (const it of await clipboard.read()) { const v = {}; for (const t of it.types) { try { v[t] = await it.getType(t); } catch {} } eski.push(v); }
  console.log('onceki pano: ' + JSON.stringify(eski.map((v) => Object.keys(v))));
  const olaylar = [];
  yakala.dinle((ekler, neden) => olaylar.push({ neden, ekler }));
  yakala.baslat();
  await new Promise((r) => setTimeout(r, 1500));
  console.log('acilista teklif yok: ' + (olaylar.length === 0));
  const denemePng = fs.readFileSync(path.join(__dirname, '..', 'public', 'kokpit.png'));
  const deneme = nativeImage.createFromBuffer(denemePng);
  const yazPng = () => clipboard.write([new ClipboardItem({ 'image/png': new Blob([denemePng], { type: 'image/png' }) })]);
  await yazPng();
  const t0 = Date.now();
  while (Date.now() - t0 < 5000 && olaylar.length === 0) await new Promise((r) => setTimeout(r, 100));
  const sure = Date.now() - t0;
  const ek = olaylar[0]?.ekler?.[0];
  console.log('olay: ' + JSON.stringify(olaylar.map((o) => ({ neden: o.neden, n: o.ekler.length, onizleme: !!o.ekler[0]?.onizleme }))) + ' ' + sure + ' ms');
  const yol = ek ? yakala.yollar([ek.id])[0] : null;
  const yazilan = yol && fs.existsSync(yol) ? nativeImage.createFromPath(yol).getSize() : null;
  console.log('dosya: ' + (yol ? path.basename(yol) : 'yok') + ' boyut ' + JSON.stringify(yazilan) + ' (beklenen ' + JSON.stringify(deneme.getSize()) + ')');
  // Ayni goruntu yeniden yazilinca yeni ek dogmamali.
  await yazPng();
  await new Promise((r) => setTimeout(r, 1500));
  console.log('ayni goruntu tekrar: yeni olay yok: ' + (olaylar.length === 1));
  yakala.durdur();
  // Geri yukle
  if (eski.length) await clipboard.write(eski.map((v) => new ClipboardItem(v)));
  else clipboard.clear();
  console.log('pano geri yuklendi: ' + JSON.stringify((await clipboard.read()).map((x) => x.types)));
  fs.rmSync(DIZIN, { recursive: true, force: true });
  const gecti = olaylar.length === 1 && !!yazilan && yazilan.width === deneme.getSize().width && !!olaylar[0].ekler[0].onizleme;
  console.log(gecti ? 'TUMU GECTI' : 'KALDI');
  app.exit(gecti ? 0 : 1);
});
