// v2.6 masaustu ajani yuzeylerinin ekran goruntusu: oturumsuz hap (limitler), acik kart (Kokpit
// disindaki oturumlar, gorev ver, limit olcum satiri), proje listesi acik. test:ui DOM'a bakar, bu goze.
// Izole: gecici KOKPIT_DIZIN, limit ucu yerel sahte sunucu, dis oturum kaydi gecici dizin. claude acmaz.
// Kullanim: npm run build && npm run ekran:ajan [cikti-dizini]
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');
const os = require('os');
const WebSocket = require('ws');

const KOK = path.join(__dirname, '..');
const PORT = 9336;
const electronBin = require('electron');
const CIKTI = process.argv[2] || os.tmpdir();
const DIZIN = fs.mkdtempSync(path.join(os.tmpdir(), 'kokpit-ekran-ajan-'));
const KIMLIK = path.join(DIZIN, 'kimlik.json');
const DIS = path.join(DIZIN, 'sessions');
fs.mkdirSync(DIS);
fs.writeFileSync(KIMLIK, JSON.stringify({ claudeAiOauth: { accessToken: 'ekran', expiresAt: Date.now() + 3600_000 } }));
const uyu = (ms) => new Promise((r) => setTimeout(r, ms));

const sunucu = http.createServer((_q, res) =>
  res.writeHead(200, { 'Content-Type': 'application/json' }).end(
    JSON.stringify({
      five_hour: { utilization: 15, resets_at: new Date(Date.now() + 2.4 * 3600_000).toISOString() },
      seven_day: { utilization: 92, resets_at: new Date(Date.now() + 55 * 3600_000).toISOString() },
    })
  )
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
  return { gonder, js };
}

async function cek(ada, ad, ek = 16) {
  const k = await ada.js(`(() => { const r = document.querySelector('.ada-kart').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; })()`);
  const { result } = await ada.gonder('Page.captureScreenshot', { format: 'png', clip: { x: Math.max(0, k.x - 12), y: 0, width: k.w + 24, height: k.y + k.h + ek, scale: 2 } });
  const dosya = path.join(CIKTI, ad);
  fs.writeFileSync(dosya, Buffer.from(result.data, 'base64'));
  console.log(dosya);
}

(async () => {
  await new Promise((r) => sunucu.listen(0, '127.0.0.1', r));
  const bekleyenCocuk = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 120000)'], { stdio: 'ignore' });
  const app = spawn(electronBin, [KOK, '--remote-debugging-port=' + PORT, '--disable-backgrounding-occluded-windows'], {
    cwd: KOK,
    stdio: 'ignore',
    env: {
      ...process.env,
      KOKPIT_DEV: '0',
      KOKPIT_TEST_KABUK: '1',
      KOKPIT_TEST_ADA: '1',
      KOKPIT_DIZIN: DIZIN,
      KOKPIT_LIMIT_URL: 'http://127.0.0.1:' + sunucu.address().port + '/u',
      KOKPIT_KIMLIK: KIMLIK,
      KOKPIT_CLAUDE_OTURUMLAR: DIS,
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
    for (let i = 0; i < 60 && !(await ana.js(`document.querySelectorAll('table tbody tr').length > 0`)); i++) await uyu(250);
    for (let i = 0; i < 60 && !(await ada.js(`document.body.innerText.includes('hafta %92')`)); i++) await uyu(250);
    await uyu(600);
    await cek(ada, 'kokpit-v26-hap.png');

    const simdi = Date.now();
    const yaz = (n, k) => fs.writeFileSync(path.join(DIS, n + '.json'), JSON.stringify({ pid: bekleyenCocuk.pid, kind: 'interactive', ...k }));
    yaz(1, { sessionId: 'a', cwd: 'C:\\Users\\scryn\\Documents\\ScryneOS', status: 'busy', startedAt: simdi - 900_000, statusUpdatedAt: simdi - 95_000 });
    yaz(2, { sessionId: 'b', cwd: 'C:\\Users\\scryn\\Documents\\Projeler\\YapiRisk', status: 'waiting', startedAt: simdi - 600_000, statusUpdatedAt: simdi - 40_000 });
    for (let i = 0; i < 40 && !(await ada.js(`document.body.innerText.includes('YapiRisk')`)); i++) await uyu(250);
    await uyu(400);
    await cek(ada, 'kokpit-v26-hap-dis.png');

    await ada.gonder('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 230, y: 18 });
    await uyu(700);
    await cek(ada, 'kokpit-v26-kart.png');
    await ada.js(`(() => { document.querySelector('section[aria-label="Görev ver"] button[aria-expanded]').click(); return true; })()`);
    await uyu(400);
    await cek(ada, 'kokpit-v26-kart-proje.png', 24);
    await ada.gonder('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 5, y: 510 });
  } catch (e) {
    console.error('ekran hatasi: ' + e.stack);
    process.exitCode = 1;
  } finally {
    try { app.kill(); } catch { /* */ }
    try { bekleyenCocuk.kill(); } catch { /* */ }
    sunucu.close();
    await uyu(800);
    try { fs.rmSync(DIZIN, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* temp'te kalir */ }
  }
})();
