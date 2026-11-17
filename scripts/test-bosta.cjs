// Bosta maliyet olcumu: uretim paketini gercek Electron'da acar, CDP uzerinden Chromium'un
// Performance sayaclarini okur ve hicbir seye dokunmadan gecen 15 saniyede ne kadar is
// yapildigini yazar. Esik ve assert yok: sayilari rapor icin basar.
//
// Kullanim: npm run build && npm run test:bosta
//
// Kalibi test-ui.cjs'ten aldi (ayni Electron bayraklari, ayni CDP baglantisi, ayni gecici veri
// dizini). test-ui.cjs degismesin diye ortak kod cikarilmadi, gereken kopyalandi.
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');
const os = require('os');
const WebSocket = require('ws');

const KOK = path.join(__dirname, '..');
const PORT = 9337;
const electronBin = require('electron');
// Gercek ~/.kokpit'e dokunulmaz: her kosu kendi gecici dizininde calisir.
const TEST_DIZIN = fs.mkdtempSync(path.join(os.tmpdir(), 'kokpit-bosta-'));

const uyu = (ms) => new Promise((r) => setTimeout(r, ms));

async function jsonGetir(url) {
  return new Promise((coz, red) => {
    http.get(url, (res) => {
      let veri = '';
      res.on('data', (d) => (veri += d));
      res.on('end', () => {
        try { coz(JSON.parse(veri)); } catch (e) { red(e); }
      });
    }).on('error', red);
  });
}

class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.sira = 0;
    this.bekleyen = new Map();
    ws.on('message', (ham) => {
      const m = JSON.parse(ham.toString());
      if (m.id && this.bekleyen.has(m.id)) {
        const { coz, red } = this.bekleyen.get(m.id);
        this.bekleyen.delete(m.id);
        if (m.error) red(new Error(m.error.message));
        else coz(m.result);
      }
    });
  }
  gonder(method, params = {}) {
    const id = ++this.sira;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((coz, red) => this.bekleyen.set(id, { coz, red }));
  }
  async js(ifade) {
    const r = await this.gonder('Runtime.evaluate', {
      expression: ifade,
      awaitPromise: true,
      returnByValue: true,
    });
    if (r.exceptionDetails) throw new Error('sayfa hatasi: ' + (r.exceptionDetails.exception?.description ?? r.exceptionDetails.text));
    return r.result.value;
  }
  async bekle(ifade, ms = 15000, ad = ifade) {
    const son = Date.now() + ms;
    while (Date.now() < son) {
      if (await this.js(ifade)) return true;
      await uyu(150);
    }
    throw new Error('zaman asimi: ' + ad);
  }
  async tus(key, mods = 0, code) {
    const ortak = { key, modifiers: mods, code, windowsVirtualKeyCode: KODLAR[key] };
    await this.gonder('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...ortak });
    if (key.length === 1 && mods === 0) {
      await this.gonder('Input.dispatchKeyEvent', { type: 'char', text: key, ...ortak });
    }
    await this.gonder('Input.dispatchKeyEvent', { type: 'keyUp', ...ortak });
  }
}
const KODLAR = { '1': 49, '2': 50 };

/** Uygulamayi acar, CDP'ye baglanir. Bayraklar test-ui.cjs ile ayni. */
async function baslat() {
  const app = spawn(electronBin, [KOK, '--remote-debugging-port=' + PORT, '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding'], {
    cwd: KOK,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, KOKPIT_DEV: '0', KOKPIT_TEST_KABUK: '1', KOKPIT_TEST_SECIM: '0', KOKPIT_DIZIN: TEST_DIZIN },
  });
  app.stderr.on('data', () => {});
  app.stdout.on('data', () => {});

  let hedefler = null;
  for (let i = 0; i < 40 && !hedefler; i++) {
    await uyu(250);
    try {
      const liste = await jsonGetir(`http://127.0.0.1:${PORT}/json`);
      hedefler = liste.filter((t) => t.type === 'page' && !t.url.startsWith('devtools'));
    } catch { /* henuz dinlemiyor */ }
  }
  if (!hedefler) throw new Error('CDP hedefi bulunamadi');
  const baglan = async (hedef) => {
    const ws = new WebSocket(hedef.webSocketDebuggerUrl);
    await new Promise((r) => ws.once('open', r));
    const c = new Cdp(ws);
    await c.gonder('Runtime.enable');
    return c;
  };
  const cdp = await baglan(hedefler[0]);
  return { app, cdp };
}

/** test-ui.cjs'teki kapanis: Browser.close'un cevabi beklenmez. */
async function kapat(app, cdp, ms = 15000) {
  const cikisSozu = new Promise((r) => {
    const t = setTimeout(() => r('zaman-asimi'), ms);
    app.on('exit', (k) => { clearTimeout(t); r(k); });
  });
  void cdp.gonder('Browser.close').catch(() => {});
  const cikis = await cikisSozu;
  if (cikis === 'zaman-asimi') try { app.kill(); } catch { /* */ }
  return cikis !== 'zaman-asimi';
}

const AC_DUGMESI = `(() => { const b = [...document.querySelectorAll('table tbody tr button')].find(x => x.textContent.trim() === 'Aç'); if (!b) return false; b.click(); return true; })()`;

const SAYACLAR = ['ScriptDuration', 'TaskDuration', 'LayoutDuration', 'RecalcStyleDuration', 'LayoutCount', 'RecalcStyleCount'];
const SURE_SAYACLARI = new Set(['ScriptDuration', 'TaskDuration', 'LayoutDuration', 'RecalcStyleDuration']);

async function metrikAl(cdp) {
  const r = await cdp.gonder('Performance.getMetrics');
  const m = {};
  for (const { name, value } of r.metrics) m[name] = value;
  return m;
}

function bicim(ad, v) {
  return ad + ' ' + (SURE_SAYACLARI.has(ad) ? (v * 1000).toFixed(1) + ' ms' : String(Math.round(v)));
}

/** 2 sn yatis payi, sonra 15 sn hicbir seye dokunmadan: sayaclarin farki. */
async function olc(cdp, ad) {
  await uyu(2000);
  const once = await metrikAl(cdp);
  await uyu(15000);
  const sonra = await metrikAl(cdp);
  const fark = {};
  for (const s of SAYACLAR) fark[s] = (sonra[s] ?? 0) - (once[s] ?? 0);
  console.log('  ' + ad.padEnd(18) + SAYACLAR.map((s) => bicim(s, fark[s])).join(' · '));
  return fark;
}

async function main() {
  if (!fs.existsSync(path.join(KOK, 'dist', 'index.html'))) {
    console.error('dist yok: once npm run build');
    process.exit(2);
  }
  // Bayat paket kontrolu (test-ui.cjs ile ayni gerekce): eski dist'i olcmek anlamsiz.
  const enYeni = (dizin) =>
    fs.readdirSync(dizin, { withFileTypes: true }).reduce((m, d) => {
      const y = path.join(dizin, d.name);
      return Math.max(m, d.isDirectory() ? enYeni(y) : fs.statSync(y).mtimeMs);
    }, 0);
  const kaynak = Math.max(enYeni(path.join(KOK, 'src')), fs.statSync(path.join(KOK, 'index.html')).mtimeMs);
  const paket = fs.statSync(path.join(KOK, 'dist', 'index.html')).mtimeMs;
  if (kaynak > paket) {
    console.error('dist bayat: kaynak son derlemeden yeni. Once npm run build.');
    process.exit(2);
  }

  let { app, cdp } = await baslat();
  const sonuc = {};
  let temizKapandi = false;
  try {
    await cdp.gonder('Performance.enable');

    console.log('Bosta maliyet (15 sn, dokunmadan):');
    await cdp.bekle(`document.querySelectorAll('table tbody tr').length > 0`, 20000, 'proje tablosu');
    await cdp.bekle(`document.querySelector('h1')?.textContent === 'Pano'`, 10000, 'pano basligi');
    sonuc.oturumsuzPano = await olc(cdp, 'oturumsuz-pano');

    console.log('Oturum ac (bos kabuk)');
    const acildi = await cdp.js(AC_DUGMESI);
    if (!acildi) throw new Error('"Ac" dugmesi bulunamadi');
    await cdp.bekle(`!!document.querySelector('.xterm')`, 15000, 'xterm');
    await cdp.bekle(`!!document.querySelector('[role="tab"] .bg-aksan')`, 20000, 'oturum acik');
    await cdp.tus('2', 2, 'Digit2');
    await cdp.bekle(`document.querySelector('h1')?.textContent !== 'Pano'`, 5000, 'terminaller gorunur');
    sonuc.oturumluTerminal = await olc(cdp, 'oturumlu-terminal');

    await cdp.tus('1', 2, 'Digit1');
    await cdp.bekle(`document.querySelector('h1')?.textContent === 'Pano'`, 5000, 'pano gorunur');
    sonuc.oturumluPano = await olc(cdp, 'oturumlu-pano');
  } catch (e) {
    console.error('olcum hatasi: ' + e.message);
  }
  temizKapandi = await kapat(app, cdp);

  console.log('BOSTA_JSON ' + JSON.stringify({ sureMs: 15000, ...sonuc }));

  try { fs.rmSync(TEST_DIZIN, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 }); } catch { /* temp'te kalir */ }

  const eksik = Object.keys(sonuc).length !== 3
    ? ['senaryo']
    : SAYACLAR.filter((s) => typeof sonuc.oturumsuzPano[s] !== 'number');
  process.exit(temizKapandi && !eksik.length ? 0 : 1);
}

main().catch((e) => {
  console.error('test kosucusu hatasi: ' + e.stack);
  process.exit(1);
});
