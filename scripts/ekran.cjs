// Ekran goruntusu: uygulamayi acar, istenen sayfaya gecer, PNG kaydeder, kapatir.
// Gorsel dogrulama icin (grafik, hizalama) — test:ui DOM'a bakar, bu goze.
// Kullanim: node scripts/ekran.cjs [pano|saglik|envanter] [cikti.png]
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');
const os = require('os');
const WebSocket = require('ws');

const KOK = path.join(__dirname, '..');
const PORT = 9334;
const electronBin = require('electron');
const SAYFA = process.argv[2] || 'saglik';
const CIKTI = process.argv[3] || path.join(os.tmpdir(), 'kokpit-' + SAYFA + '.png');
const TUS = { pano: '1', saglik: '3', envanter: '4' };
const uyu = (ms) => new Promise((r) => setTimeout(r, ms));
// Uygulama ayri bir veri dizininde acilir (KOKPIT_DIZIN): gercek ayar ve defterin KOPYASI
// oraya konur (ekran gercek gorunsun), gercek dosyalara hic yazilmaz. Eskiden gercek dizinde
// acilip sonra geri yaziliyordu; acik bir gercek Kokpit'in o arada yazdigini ezebilirdi.
const GERCEK = path.join(os.homedir(), '.kokpit');
const TEST_DIZIN = fs.mkdtempSync(path.join(os.tmpdir(), 'kokpit-ekran-'));
for (const ad of ['ayarlar.json', 'oturumlar.jsonl', 'komutlar.json', 'calistir.json']) {
  try { fs.copyFileSync(path.join(GERCEK, ad), path.join(TEST_DIZIN, ad)); } catch { /* yoksa varsayilan */ }
}
function geriKoy() {
  try { fs.rmSync(TEST_DIZIN, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 }); } catch { /* temp'te kalir */ }
}

function jsonGetir(url) {
  return new Promise((coz, red) => {
    http.get(url, (res) => {
      let v = '';
      res.on('data', (d) => (v += d));
      res.on('end', () => { try { coz(JSON.parse(v)); } catch (e) { red(e); } });
    }).on('error', red);
  });
}

(async () => {
  const app = spawn(electronBin, [KOK, '--remote-debugging-port=' + PORT, '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding'], {
    cwd: KOK, stdio: 'ignore', env: { ...process.env, KOKPIT_DEV: '0', KOKPIT_TEST_KABUK: '1', KOKPIT_DIZIN: TEST_DIZIN },
  });
  let hedef = null;
  for (let i = 0; i < 40 && !hedef; i++) {
    await uyu(250);
    try {
      hedef = (await jsonGetir(`http://127.0.0.1:${PORT}/json`)).find((t) => t.type === 'page' && !t.url.startsWith('devtools')) || null;
    } catch { /* bekle */ }
  }
  if (!hedef) throw new Error('CDP hedefi yok');
  const ws = new WebSocket(hedef.webSocketDebuggerUrl);
  await new Promise((r) => ws.once('open', r));
  let sira = 0;
  const bekleyen = new Map();
  ws.on('message', (ham) => {
    const m = JSON.parse(ham.toString());
    if (m.id && bekleyen.has(m.id)) { bekleyen.get(m.id)(m.result); bekleyen.delete(m.id); }
  });
  const gonder = (method, params = {}) => new Promise((coz) => { const id = ++sira; bekleyen.set(id, coz); ws.send(JSON.stringify({ id, method, params })); });
  const js = async (exp) => (await gonder('Runtime.evaluate', { expression: exp, awaitPromise: true, returnByValue: true })).result.value;

  await gonder('Runtime.enable');
  for (let i = 0; i < 80 && !(await js(`document.querySelectorAll('table tbody tr').length > 0`)); i++) await uyu(250);
  const tus = TUS[SAYFA];
  if (tus) {
    const ortak = { key: tus, modifiers: 2, code: 'Digit' + tus, windowsVirtualKeyCode: 48 + Number(tus) };
    await gonder('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...ortak });
    await gonder('Input.dispatchKeyEvent', { type: 'keyUp', ...ortak });
  }
  await uyu(600);
  const { data } = await gonder('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(CIKTI, Buffer.from(data, 'base64'));
  console.log('yazildi: ' + CIKTI);
  const cikis = new Promise((r) => { app.on('exit', r); setTimeout(() => { try { app.kill(); } catch { /* */ } r(); }, 6000); });
  void gonder('Browser.close');
  await cikis;
  geriKoy();
  process.exit(0);
})().catch((e) => { console.error(e.message); geriKoy(); process.exit(1); });
