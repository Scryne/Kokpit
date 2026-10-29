// v3.4 Aria'nin agi (gercek vault salt okunur, sahte claude). Kalip ekran-aria'dan; v3.3 Aria sayfasinin ekran goruntusu (sahte claude: scripts/sahte-claude.cjs; gercek claude acilmaz). Ayni kalip:
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
const PORT = 9339;
const electronBin = require('electron');
const CIKTI = process.argv[2] || os.tmpdir();
const DIZIN = fs.mkdtempSync(path.join(os.tmpdir(), 'kokpit-ekran-ag-'));
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
  const { VAULT } = require('../electron/config.cjs');
  const V = VAULT.split(path.sep).join('/').replace(/ /g, '+');
  const app = spawn(electronBin, [KOK, '--remote-debugging-port=' + PORT, '--disable-backgrounding-occluded-windows'], {
    cwd: KOK,
    stdio: 'ignore',
    env: {
      ...process.env,
      KOKPIT_DEV: '0',
      KOKPIT_TEST_KABUK: '1',
      KOKPIT_DIZIN: DIZIN,
      KOKPIT_LIMIT_URL: 'http://127.0.0.1:' + limit.address().port + '/u',
      KOKPIT_KIMLIK: KIMLIK,
      KOKPIT_CLAUDE_OTURUMLAR: DIS,
      KOKPIT_LIMIT_ELLE_MS: '0',
      KOKPIT_TEST_ARIA_SAHTE: path.join(__dirname, 'sahte-claude.cjs'),
    },
  });
  try {
    let hedefler = null;
    for (let i = 0; i < 60 && !hedefler; i++) {
      await uyu(250);
      try {
        const l = (await jsonGetir(`http://127.0.0.1:${PORT}/json`)).filter((t) => t.type === 'page');
        if (l.length) hedefler = l;
      } catch { /* henuz yok */ }
    }
    const ana = await baglan(hedefler.find((t) => !t.url.endsWith('#ada')));
    await ana.bekle(`!!document.querySelector('button[aria-label="Aria"]')`, 40000);
    await ana.js(`(() => { window.__agHata = []; window.addEventListener('error', (e) => window.__agHata.push(String(e.message))); return true; })()`);
    await ana.gonder('Emulation.setDeviceMetricsOverride', { width: 1680, height: 1000, deviceScaleFactor: 1, mobile: false });
    await ana.js(`window.kokpit.durumGetir().then(() => true)`);
    await ana.js(`(() => { document.querySelector('button[aria-label="Aria"]').click(); return true; })()`);
    await ana.js(`(() => { const b = document.querySelector('[data-ag-dugme]'); if (b && b.getAttribute('aria-pressed') !== 'true') b.click(); return true; })()`);
    const t0 = Date.now();
    await ana.bekle(`Number(document.querySelector('[data-aria-ag]')?.getAttribute('data-dugum')) > 0`, 15000);
    console.log('ag hazir ms', Date.now() - t0, await ana.js(`document.querySelector('[data-aria-ag]').getAttribute('data-dugum') + ' not / ' + document.querySelector('[data-aria-ag]').getAttribute('data-kenar') + ' bag'`));
    await uyu(800);
    console.log('teshis', JSON.stringify(await ana.js(`(() => { const c = document.querySelector('[data-aria-ag] canvas'); const g = c.getContext('2d'); const d = g.getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i]) n++; return { w: c.width, h: c.height, css: c.style.width + 'x' + c.style.height, dolu: n, hata: window.__agHata ?? null }; })()`)));
    await cek(ana, 'kokpit-v34-ag-bos.png', 'section[aria-label="Aria"]', 1);
    // Ates: hafiza dosyalari, bir proje, bir arama; sinyal yolculugu sirasinda kareler.
    const msg = `Matbaa olcumu ne zaman? dosya=${V}/🔮+850-Companion/Threads.md dosya=${V}/🏰+300-Projects/Matbaa.md ara=matbaa dosya=${V}/knowledge/concepts/otomat.md yavas`;
    await ana.js(`window.kokpit.ariaGonder(${JSON.stringify(msg)})`);
    for (const [ms, ad] of [[350, 'kokpit-v34-ag-ates1.png'], [700, 'kokpit-v34-ag-ates2.png'], [900, 'kokpit-v34-ag-ates3.png']]) {
      await uyu(ms);
      await cek(ana, ad, '[data-aria-ag]', 1);
    }
    console.log('son ates', await ana.js(`document.querySelector('[data-aria-ag]').getAttribute('data-ag-gecmis')`));
    await ana.bekle(`![...document.querySelectorAll('[data-aria-mesaj="aria"]')].some(x => x.hasAttribute('data-akiyor'))`, 15000);
    await ana.js(`window.kokpit.ariaGonder(${JSON.stringify('Last-Session guncelle yaz=' + V + '/🔮+850-Companion/Last-Session.md')})`);
    await uyu(600);
    await cek(ana, 'kokpit-v34-ag-yazma.png', '[data-aria-ag]', 1);
    await uyu(2500);
    // Uzerine gelme + not acma (cekmece).
    const k = await ana.js(`(() => { const c = document.querySelector('[data-aria-ag] canvas').getBoundingClientRect(); return { x: c.x + c.width / 2, y: c.y + c.height / 2 }; })()`);
    await ana.gonder('Input.dispatchMouseEvent', { type: 'mouseMoved', x: k.x, y: k.y });
    await uyu(300);
    await ana.js(`(() => { const i = document.querySelector('[data-ag-ara]'); const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; s.call(i, 'kokpit'); i.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
    await uyu(400);
    await cek(ana, 'kokpit-v34-ag-arama.png', '[data-aria-ag]', 1);
    await ana.js(`(() => { const i = document.querySelector('[data-ag-ara]'); i.focus(); i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); return true; })()`);
    await ana.bekle(`!!document.querySelector('[data-ag-cekmece]')`, 5000);
    await uyu(600);
    await cek(ana, 'kokpit-v34-ag-cekmece.png', 'section[aria-label="Aria"]', 1);
  } catch (e) {
    console.error('ekran hatasi: ' + e.stack);
    process.exitCode = 1;
  } finally {
    try { require('child_process').execFileSync('taskkill', ['/T', '/F', '/PID', String(app.pid)], { stdio: 'ignore' }); } catch { /* */ }
    limit.close();
    await uyu(800);
    try { fs.rmSync(DIZIN, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* temp'te kalir */ }
  }
})();
