// Gorsel denetim turu: her sayfa iki genislikte (1440 ve 1024). Gercek vault/durum salt okunur, sahte claude. Kalip ekran-aria'dan; v3.3 Aria sayfasinin ekran goruntusu (sahte claude: scripts/sahte-claude.cjs; gercek claude acilmaz). Ayni kalip:
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
const DIZIN = fs.mkdtempSync(path.join(os.tmpdir(), 'kokpit-ekran-tur-'));
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


const GERCEK = path.join(os.homedir(), '.kokpit');
for (const ad of ['ayarlar.json', 'oturumlar.jsonl', 'komutlar.json', 'calistir.json']) {
  try { fs.copyFileSync(path.join(GERCEK, ad), path.join(DIZIN, ad)); } catch { /* yoksa varsayilan */ }
}
(async () => {
  await new Promise((r) => limit.listen(0, '127.0.0.1', r));
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
    await ana.js(`(() => { window.__hatalar = []; window.addEventListener('error', (e) => window.__hatalar.push(String(e.message))); window.addEventListener('unhandledrejection', (e) => window.__hatalar.push('red: ' + String(e.reason))); return true; })()`);
    await ana.bekle(`!!document.querySelector('button[aria-label="Aria"]')`, 40000);
    await ana.js(`window.kokpit.durumGetir().then(() => true)`);
    await uyu(1500);
    const sayfalar = (process.env.SAYFALAR || 'Pano,Terminaller,Sağlık,Envanter,Botlar,Teslim,Aria').split(',');
    for (const [w, h] of [[1440, 900], [1024, 720]]) {
      await ana.gonder('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
      for (const s of sayfalar) {
        await ana.js(`(() => { const b = document.querySelector('button[aria-label=${JSON.stringify(s)}]'); if (b) b.click(); return !!b; })()`);
        await uyu(s === 'Teslim' || s === 'Aria' ? 2500 : 1200);
        const { result } = await ana.gonder('Page.captureScreenshot', { format: 'png' });
        const dosya = path.join(CIKTI, `tur-${w}-${s.normalize('NFD').replace(/[^\w]/g, '')}.png`);
        fs.writeFileSync(dosya, Buffer.from(result.data, 'base64'));
        const tasma = await ana.js(`document.documentElement.scrollWidth > window.innerWidth + 1 ? 'YATAY TASMA ' + document.documentElement.scrollWidth : ''`);
        console.log(dosya, tasma);
      }
    }
    console.log('hatalar', JSON.stringify(await ana.js('window.__hatalar')));
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
