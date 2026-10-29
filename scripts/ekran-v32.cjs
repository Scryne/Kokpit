// v3.2 yuzeylerinin ekran goruntusu: Teslim sayfasi (+ diff), gece vardiyasi kutusu, onizleme + isaret karti, Ada'da
// brifing ve uzun sesli cevap. test:ui DOM'a bakar, bu goze. Izole: gecici KOKPIT_DIZIN, limit ucu sahte, claude
// acmaz. Teslim gercek projeleri okur (yalniz okuma: git status/log/diff + GitHub gorunurlugu); push yok.
// Kullanim: npm run build && npm run ekran:v32 [cikti-dizini]
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');
const os = require('os');
const WebSocket = require('ws');

const KOK = path.join(__dirname, '..');
const PORT = 9338;
const electronBin = require('electron');
const CIKTI = process.argv[2] || os.tmpdir();
const DIZIN = fs.mkdtempSync(path.join(os.tmpdir(), 'kokpit-ekran-v32-'));
const KIMLIK = path.join(DIZIN, 'kimlik.json');
const DIS = path.join(DIZIN, 'sessions');
fs.mkdirSync(DIS);
fs.writeFileSync(KIMLIK, JSON.stringify({ claudeAiOauth: { accessToken: 'ekran', expiresAt: Date.now() + 3600_000 } }));
const uyu = (ms) => new Promise((r) => setTimeout(r, ms));
const limit = http.createServer((_q, res) =>
  res.writeHead(200, { 'Content-Type': 'application/json' }).end(
    JSON.stringify({
      five_hour: { utilization: 34, resets_at: new Date(Date.now() + 2.4 * 3600_000).toISOString() },
      seven_day: { utilization: 81, resets_at: new Date(Date.now() + 50 * 3600_000).toISOString() },
    })
  )
);
// Onizlenecek "uygulama": bir hero, bir dugme, bir konsol hatasi.
const SAYFA =
  '<!doctype html><meta charset=utf-8><title>Matbaa</title><body style="margin:0;font:15px system-ui;background:#f6f4ef;color:#222">' +
  '<header style="padding:18px 28px;background:#1d2a3a;color:#fff;font-weight:600">Matbaa · Mağaza</header>' +
  '<main style="padding:40px 28px"><h1 style="margin:0 0 8px;font-size:30px">Kış koleksiyonu</h1><p style="color:#555">72 tasarım, 3 ürün.</p>' +
  '<button class="cta" style="margin-top:18px;padding:12px 26px;border:0;border-radius:8px;background:#e85d3f;color:#fff;font-size:15px">Satın al</button></main>' +
  '<script>console.error("TypeError: fiyat undefined (Sepet.tsx:42)")</script>';
const uygulama = http.createServer((_q, res) => res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(SAYFA));

const T = Date.now();
fs.writeFileSync(
  path.join(DIZIN, 'gece.json'),
  JSON.stringify({
    surum: 1,
    baslangic: '01:30',
    baslaZamani: T + 4 * 3600_000,
    aktif: true,
    son: null,
    alarmlar: [],
    gorevler: [
      { id: 'a', proje: 'Kokpit', projeYol: 'C:/x', metin: 'Teslim sayfasına kenar durumları için test yaz; boş depo ve detached HEAD.', durum: 'bitti', agacAd: 'gece1', basladi: T - 9 * 3600_000, bitti: T - 8.2 * 3600_000, ozet: '6 test eklendi, hepsi yeşil. Detached HEAD için push düğmesi gizleniyor.' },
      { id: 'b', proje: 'Matbaa', projeYol: 'C:/x', metin: 'İlan başlıklarındaki yazım hatalarını düzelt, 59 ilanı tara.', durum: 'takildi', agacAd: 'gece2', basladi: T - 8 * 3600_000, bitti: T - 7.5 * 3600_000, neden: 'izin ya da seçeneksiz soru bekliyor' },
      { id: 'c', proje: 'GridGrade', projeYol: 'C:/x', metin: 'Eyalet sayfalarına "son güncelleme" satırı ekle.', durum: 'bekliyor' },
    ],
  })
);

function jsonGetir(url) {
  return new Promise((coz, red) => {
    http.get(url, (res) => {
      let v = '';
      res.on('data', (d) => (v += d));
      res.on('end', () => { try { coz(JSON.parse(v)); } catch (e) { red(e); } });
    }).on('error', red);
  });
}
async function baglan(hedef) {
  const ws = new WebSocket(hedef.webSocketDebuggerUrl);
  await new Promise((r) => ws.once('open', r));
  let sira = 0;
  const bekleyen = new Map();
  ws.on('message', (ham) => {
    const m = JSON.parse(ham.toString());
    if (m.id && bekleyen.has(m.id)) { bekleyen.get(m.id)(m); bekleyen.delete(m.id); }
  });
  const gonder = (method, params = {}) => new Promise((coz) => { const id = ++sira; bekleyen.set(id, coz); ws.send(JSON.stringify({ id, method, params })); });
  const js = async (exp) => (await gonder('Runtime.evaluate', { expression: exp, awaitPromise: true, returnByValue: true })).result?.result?.value;
  const bekle = async (exp, ms = 10000) => { for (let t = Date.now(); Date.now() - t < ms; await uyu(200)) if (await js(exp)) return true; return false; };
  return { gonder, js, bekle };
}
async function cek(hedef, ad, secici, olcek = 1.5) {
  if (!(await hedef.bekle(`!!document.querySelector(${JSON.stringify(secici)})`, 10000))) {
    console.error('yok: ' + secici);
    return;
  }
  await hedef.js(`(() => { document.querySelector(${JSON.stringify(secici)}).scrollIntoView({ block: 'start' }); return true; })()`);
  await uyu(300);
  const k = await hedef.js(`(() => { const r = document.querySelector(${JSON.stringify(secici)}).getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: Math.min(r.height, 1000) }; })()`);
  const { result } = await hedef.gonder('Page.captureScreenshot', { format: 'png', clip: { x: Math.max(0, k.x - 8), y: Math.max(0, k.y - 8), width: k.w + 16, height: k.h + 16, scale: olcek } });
  const dosya = path.join(CIKTI, ad);
  fs.writeFileSync(dosya, Buffer.from(result.data, 'base64'));
  console.log(dosya);
}

(async () => {
  await new Promise((r) => limit.listen(0, '127.0.0.1', r));
  await new Promise((r) => uygulama.listen(0, '127.0.0.1', r));
  const app = spawn(electronBin, [KOK, '--remote-debugging-port=' + PORT, '--disable-backgrounding-occluded-windows'], {
    cwd: KOK,
    stdio: 'ignore',
    env: {
      ...process.env,
      KOKPIT_DEV: '0',
      KOKPIT_TEST_KABUK: '1',
      KOKPIT_TEST_ADA: '1',
      KOKPIT_DIZIN: DIZIN,
      KOKPIT_LIMIT_URL: 'http://127.0.0.1:' + limit.address().port + '/u',
      KOKPIT_KIMLIK: KIMLIK,
      KOKPIT_CLAUDE_OTURUMLAR: DIS,
      KOKPIT_LIMIT_ELLE_MS: '0',
    },
  });
  try {
    let hedefler = null;
    for (let i = 0; i < 60 && !hedefler; i++) {
      await uyu(250);
      try {
        const l = (await jsonGetir(`http://127.0.0.1:${PORT}/json`)).filter((t) => t.type === 'page');
        if (l.some((t) => t.url.endsWith('#ada')) && l.some((t) => !t.url.endsWith('#ada'))) hedefler = l;
      } catch { /* henuz yok */ }
    }
    const ada = await baglan(hedefler.find((t) => t.url.endsWith('#ada')));
    const ana = await baglan(hedefler.find((t) => !t.url.endsWith('#ada')));
    await ana.bekle(`!!document.querySelector('table tbody tr')`, 40000);

    // Teslim (gercek projeler): ozet + liste + secilinin ayrintisi, sonra ilk commit'in diff'i.
    await ana.js(`(() => { document.querySelector('button[aria-label="Teslim"]').click(); return true; })()`);
    await ana.bekle(`!!document.querySelector('section[aria-label$="teslim ayrıntısı"] header')`, 20000);
    await uyu(1200);
    await cek(ana, 'kokpit-v32-teslim.png', 'section[aria-label="Teslim"] > div');
    const commitVar = await ana.js(`(() => { const b = document.querySelector('section[aria-label="Commit\\'ler"] button'); if (b) b.click(); return !!b; })()`);
    if (commitVar) {
      await ana.bekle(`!!document.querySelector('[data-teslim-fark] pre')`, 10000);
      await uyu(500);
      await cek(ana, 'kokpit-v32-teslim-diff.png', '[data-teslim-fark]');
    }

    // Gece vardiyasi kutusu (fikstur: biri bitti, biri takildi, biri sirada; 01:30'da baslayacak).
    await ana.js(`(() => { [...document.querySelectorAll('section[aria-label="Teslim"] button')].find(b => b.textContent.includes('Gece vardiyası')).click(); return true; })()`);
    await ana.bekle(`!!document.querySelector('dialog[open][data-gece-kutusu]')`);
    await uyu(500);
    await cek(ana, 'kokpit-v32-gece.png', 'dialog[open][data-gece-kutusu]');
    await ana.js(`(() => { document.querySelector('dialog[open][data-gece-kutusu]').close(); return true; })()`);

    // Onizleme: ilk projeye calistirma tarifi = yerel "uygulama" (adresini yazar, sayfayi sunar).
    // Pano'da gorunen (arsivde olmayan) ilk projenin Calistir dugmesi.
    await ana.js(`(() => { document.querySelector('button[aria-label="Pano"]').click(); return true; })()`);
    await ana.bekle(`!!document.querySelector('button[aria-label$=" uygulamasını çalıştır"]')`, 8000);
    const ad = await ana.js(`document.querySelector('button[aria-label$=" uygulamasını çalıştır"]').getAttribute('aria-label').replace(' uygulamasını çalıştır', '')`);
    const proje = await ana.js(`window.kokpit.durumGetir().then(d => { const p = d.veri.projeler.find(x => x.ad === ${JSON.stringify(ad)}); return { ad: p.ad, yol: p.yol }; })`);
    const adres = 'http://127.0.0.1:' + uygulama.address().port + '/';
    await ana.js(`window.kokpit.calistirKaydet(${JSON.stringify(proje.yol)}, ${JSON.stringify("node -e \"console.log('  Local:   " + adres + "'); setInterval(() => {}, 1000)\"")})`);
    await uyu(400);
    await ana.js(`(() => { document.querySelector('button[aria-label=${JSON.stringify(proje.ad + ' uygulamasını çalıştır')}]').click(); return true; })()`);
    await ana.bekle(`(() => { const w = document.querySelector('[data-onizleme] webview'); try { return !!w && w.getURL().startsWith('http') && !w.isLoading(); } catch { return false; } })()`, 20000);
    await ana.bekle(`document.querySelector('[data-onizleme] webview').executeJavaScript('!!document.querySelector(".cta")')`, 10000);
    await uyu(1200);
    await ana.js(`(() => { document.querySelector('[data-isaretle]').click(); return true; })()`);
    await uyu(400);
    const o = await ana.js(`document.querySelector('[data-onizleme] webview').executeJavaScript('(() => { const r = document.querySelector(".cta").getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()')`);
    await ana.js(`(() => { const w = document.querySelector('[data-onizleme] webview'); w.sendInputEvent({ type: 'mouseMove', x: ${o.x}, y: ${o.y} }); return true; })()`);
    await uyu(500);
    await cek(ana, 'kokpit-v32-onizleme-isaretleme.png', '[data-onizleme]', 1);
    // Isletim sistemi duzeyinde (DWM) ekran goruntusu: CDP'nin webview birlestirmesi olcekli ekranda kayabiliyor.
    if (process.env.EKRAN_OS === '1') {
      await ana.gonder('Page.bringToFront');
      await uyu(800);
      const os2 = path.join(CIKTI, 'kokpit-v32-onizleme-os.png');
      require('child_process').execFileSync('pwsh', ['-NoProfile', '-Command', "Add-Type -AssemblyName System.Windows.Forms,System.Drawing; $b=[System.Windows.Forms.Screen]::PrimaryScreen.Bounds; $bmp=New-Object System.Drawing.Bitmap $b.Width,$b.Height; $g=[System.Drawing.Graphics]::FromImage($bmp); $g.CopyFromScreen($b.Location,[System.Drawing.Point]::Empty,$b.Size); $bmp.Save('" + os2 + "')"]);
      console.log(os2);
    }
    await ana.js(`(() => { const w = document.querySelector('[data-onizleme] webview'); w.sendInputEvent({ type: 'mouseDown', x: ${o.x}, y: ${o.y}, button: 'left', clickCount: 1 }); w.sendInputEvent({ type: 'mouseUp', x: ${o.x}, y: ${o.y}, button: 'left', clickCount: 1 }); return true; })()`);
    await ana.bekle(`!!document.querySelector('[data-isaret-karti] img')`, 8000);
    await ana.js(`(() => { const i = document.querySelector('[data-isaret-karti] input'); const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; s.call(i, 'bunu biraz daha büyüt, gölgeyi kaldır'); i.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
    await ana.js(`(() => { document.querySelector('[data-onizleme-hata]')?.click(); return true; })()`);
    await uyu(500);
    await cek(ana, 'kokpit-v32-onizleme-kart.png', '[data-onizleme]', 1);

    // Ada: brifing (gece fiksturu + gercek durum) ve kart.
    await ana.js(`(() => { window.kokpit.brifingVer(); return true; })()`);
    await ada.bekle(`!!document.querySelector('[data-ada-brifing]')`, 20000);
    await ada.gonder('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 230, y: 18 });
    await uyu(800);
    const k = await ada.js(`(() => { const r = document.querySelector('.ada-kart').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; })()`);
    const { result } = await ada.gonder('Page.captureScreenshot', { format: 'png', clip: { x: Math.max(0, k.x - 12), y: 0, width: k.w + 24, height: k.y + k.h + 24, scale: 2 } });
    fs.writeFileSync(path.join(CIKTI, 'kokpit-v32-ada-brifing.png'), Buffer.from(result.data, 'base64'));
    console.log(path.join(CIKTI, 'kokpit-v32-ada-brifing.png'));
  } catch (e) {
    console.error('ekran hatasi: ' + e.stack);
    process.exitCode = 1;
  } finally {
    // Yalniz bu PID'in agaci (baslik suzgeci gercek Kokpit'i de oldururdu: kokpit-taskkill-baslik-tuzagi).
    try { require('child_process').execFileSync('taskkill', ['/T', '/F', '/PID', String(app.pid)], { stdio: 'ignore' }); } catch { /* */ }
    limit.close();
    uygulama.close();
    await uyu(800);
    try { fs.rmSync(DIZIN, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* temp'te kalir */ }
  }
})();
