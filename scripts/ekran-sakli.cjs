// v2.7 saklanma yuzeylerinin ekran goruntusu: acik kartta "Kenara sakla", cene (acik ve koyu zeminde:
// Ada'nin arkasinda tarayici sekme seridi de olabilir, koyu duvar kagidi da), seni bekleyen cene (amber),
// uyuyan cene degil (30 dk ister), sarkan kart. test:ui DOM'a bakar, bu goze.
// Izole: gecici KOKPIT_DIZIN, limit ucu yerel sahte sunucu, dis oturum kaydi gecici dizin. claude acmaz.
// Kullanim: npm run build && npm run ekran:sakli [cikti-dizini]
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');
const os = require('os');
const WebSocket = require('ws');

const KOK = path.join(__dirname, '..');
const PORT = 9337;
const electronBin = require('electron');
const CIKTI = process.argv[2] || os.tmpdir();
const DIZIN = fs.mkdtempSync(path.join(os.tmpdir(), 'kokpit-ekran-sakli-'));
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

/** Secilen ogenin cevresi; zemin verilirse sayfa o renge boyanir (saydam pencerede arkadakini taklit). */
async function cek(ada, ad, secici, { zemin = null, pay = 16, genislik = null } = {}) {
  await ada.js(`(() => { document.body.style.background = ${JSON.stringify(zemin ?? 'transparent')}; return true; })()`);
  await uyu(120);
  const k = await ada.js(`(() => { const r = document.querySelector(${JSON.stringify(secici)}).getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; })()`);
  const w = genislik ?? k.w + 2 * pay;
  const x = Math.max(0, k.x + k.w / 2 - w / 2);
  const { result } = await ada.gonder('Page.captureScreenshot', { format: 'png', clip: { x, y: 0, width: w, height: k.y + k.h + pay, scale: 3 } });
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
    for (let i = 0; i < 60 && !(await ada.js(`document.body.innerText.includes('hafta %92')`)); i++) await uyu(250);
    await uyu(600);

    await ada.gonder('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 230, y: 18 });
    await uyu(700);
    await cek(ada, 'kokpit-v27-kart-sakla.png', '.ada-kart > div', { pay: 12 });
    await ada.js(`(() => { document.querySelector('.ada-kart button[aria-label="Kenara sakla"]').click(); return true; })()`);
    await ada.gonder('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 5, y: 510 });
    await uyu(600);
    await cek(ada, 'kokpit-v27-cene-acik.png', '.ada-cene', { zemin: '#dee1e6', genislik: 120, pay: 20 });
    await cek(ada, 'kokpit-v27-cene-koyu.png', '.ada-cene', { zemin: '#1b1d22', genislik: 120, pay: 20 });

    const simdi = Date.now();
    fs.writeFileSync(path.join(DIS, '1.json'), JSON.stringify({ pid: bekleyenCocuk.pid, kind: 'interactive', sessionId: 'b', cwd: 'C:\\x\\YapiRisk', status: 'waiting', startedAt: simdi - 600_000, statusUpdatedAt: simdi - 40_000 }));
    for (let i = 0; i < 40 && !(await ada.js(`document.querySelector('.ada-cene')?.dataset.hal === 'bekliyor'`)); i++) await uyu(250);
    await uyu(300);
    await cek(ada, 'kokpit-v27-cene-bekliyor-acik.png', '.ada-cene', { zemin: '#dee1e6', genislik: 120, pay: 20 });
    await cek(ada, 'kokpit-v27-cene-bekliyor-koyu.png', '.ada-cene', { zemin: '#1b1d22', genislik: 120, pay: 20 });

    await ada.gonder('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 230, y: 4 });
    await uyu(900);
    await cek(ada, 'kokpit-v27-sarkan.png', '.ada-kart', { zemin: '#1b1d22', pay: 16 });
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
