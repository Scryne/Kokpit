// UI testi: uretim paketini gercek Electron'da acar, CDP (Chrome DevTools Protocol)
// uzerinden gercek tiklama/tus gonderir ve sonucu DOM'dan okur.
//
// Neden CDP, neden Playwright degil: bagimlilik sifir (ws zaten var), Electron'un kendi
// --remote-debugging-port'u yetiyor. Test claude ACMAZ: KOKPIT_TEST_KABUK=1 ile PTY
// sunucusu duz pwsh acar (her gercek claude acilisi transcript + hook tetikler).
//
// Kullanim: npm run build && npm run test:ui
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');
const os = require('os');
const WebSocket = require('ws');

const KOK = path.join(__dirname, '..');
const PORT = 9333;
const electronBin = require('electron');
const AYARLAR = path.join(os.homedir(), '.kokpit', 'ayarlar.json');

let basarisiz = 0;
function kontrol(ad, kosul, detay) {
  console.log((kosul ? '  ok   ' : '  FAIL ') + ad + (kosul || detay === undefined ? '' : '  -> ' + detay));
  if (!kosul) basarisiz++;
}
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
    this.konsol = [];
    ws.on('message', (ham) => {
      const m = JSON.parse(ham.toString());
      if (m.id && this.bekleyen.has(m.id)) {
        const { coz, red } = this.bekleyen.get(m.id);
        this.bekleyen.delete(m.id);
        if (m.error) red(new Error(m.error.message));
        else coz(m.result);
      } else if (m.method === 'Runtime.consoleAPICalled') {
        this.konsol.push(m.params.args.map((a) => a.value ?? a.description ?? '').join(' '));
      }
    });
  }
  gonder(method, params = {}) {
    const id = ++this.sira;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((coz, red) => this.bekleyen.set(id, { coz, red }));
  }
  /** Sayfada ifade calistirir; Promise donerse bekler. */
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
    // mods: 2 = Ctrl, 8 = Shift (CDP modifier bitleri)
    const ortak = { key, modifiers: mods, code, windowsVirtualKeyCode: KODLAR[key] };
    await this.gonder('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...ortak });
    if (key.length === 1 && mods === 0) {
      await this.gonder('Input.dispatchKeyEvent', { type: 'char', text: key, ...ortak });
    }
    await this.gonder('Input.dispatchKeyEvent', { type: 'keyUp', ...ortak });
  }
  async yaz(metin) {
    await this.gonder('Input.insertText', { text: metin });
  }
}
const KODLAR = { Enter: 13, Escape: 27, Tab: 9, F: 70, f: 70, '1': 49, '2': 50, '=': 187, '-': 189, '0': 48 };

async function main() {
  if (!fs.existsSync(path.join(KOK, 'dist', 'index.html'))) {
    console.error('dist yok: once npm run build');
    process.exit(2);
  }
  const ayarOnce = fs.existsSync(AYARLAR) ? fs.readFileSync(AYARLAR, 'utf8') : null;

  const app = spawn(electronBin, [KOK, '--remote-debugging-port=' + PORT], {
    cwd: KOK,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, KOKPIT_DEV: '0', KOKPIT_TEST_KABUK: '1' },
  });
  app.stderr.on('data', () => {});
  app.stdout.on('data', () => {});

  let hedefler = null;
  for (let i = 0; i < 40 && !hedefler; i++) {
    await uyu(250);
    try {
      const liste = await jsonGetir(`http://127.0.0.1:${PORT}/json`);
      hedefler = liste.filter((t) => t.type === 'page' && !t.url.startsWith('devtools'));
      if (hedefler.length === 0) hedefler = null;
    } catch { /* henuz dinlemiyor */ }
  }
  if (!hedefler) throw new Error('CDP hedefi bulunamadi');
  const ws = new WebSocket(hedefler[0].webSocketDebuggerUrl);
  await new Promise((r) => ws.once('open', r));
  const cdp = new Cdp(ws);
  await cdp.gonder('Runtime.enable');

  try {
    console.log('Pano');
    await cdp.bekle(`document.querySelectorAll('table tbody tr').length > 0`, 20000, 'proje tablosu');
    const satir = await cdp.js(`document.querySelectorAll('table tbody tr').length`);
    kontrol('proje tablosu dolu', satir > 0, satir);

    console.log('Terminal ac');
    await cdp.js(`(() => { const b = [...document.querySelectorAll('table tbody tr button')].find(x => x.textContent.trim() === 'Aç'); b.click(); return true; })()`);
    await cdp.bekle(`!!document.querySelector('.xterm')`, 10000, 'xterm');
    await cdp.bekle(`!!document.querySelector('[role="tab"] .bg-aksan')`, 20000, 'oturum acik');
    kontrol('oturum acildi (sekme noktasi aksan)', true);
    await uyu(800);
    kontrol('webgl renderer aktif', cdp.konsol.some((k) => k.includes('webgl renderer aktif')), cdp.konsol.slice(-3).join(' | '));

    console.log('Zil -> rozet');
    await cdp.js(`(() => { document.querySelector('.xterm-helper-textarea')?.focus(); return true; })()`);
    // Pencere odakta sayilmasin ki rozet dussun: bakmiyor senaryosu.
    await cdp.js(`(() => { document.hasFocus = () => false; return true; })()`);
    await cdp.yaz('[char]7');
    await cdp.tus('Enter');
    await cdp.bekle(`!!document.querySelector('[role="tab"][title*="dikkat bekliyor"]')`, 8000, 'dikkat rozeti');
    kontrol('zil sekmeye dikkat rozeti koydu', true);
    await cdp.js(`(() => { document.hasFocus = () => true; window.dispatchEvent(new Event('focus')); return true; })()`);
    await uyu(300);
    const rozetKalkti = await cdp.js(`!document.querySelector('[role="tab"][title*="dikkat bekliyor"]')`);
    kontrol('bakinca rozet dustu', rozetKalkti);

    console.log('Arama');
    await cdp.js(`(() => { document.querySelector('.xterm-helper-textarea')?.focus(); return true; })()`);
    await cdp.tus('F', 2 | 8, 'KeyF');
    await cdp.bekle(`!!document.querySelector('[role="search"] input')`, 3000, 'arama kutusu');
    kontrol('Ctrl+Shift+F arama cubugunu acti', true);
    await cdp.tus('Escape');
    await uyu(200);
    kontrol('Escape aramayi kapatti', await cdp.js(`!document.querySelector('[role="search"]')`));

    console.log('Yazi boyutu');
    await cdp.js(`(() => { document.querySelector('.xterm-helper-textarea')?.focus(); return true; })()`);
    await cdp.tus('=', 2, 'Equal');
    await uyu(500);
    const ayar = JSON.parse(fs.readFileSync(AYARLAR, 'utf8'));
    kontrol('Ctrl+= yazi boyutunu 14 yapip diske yazdi', ayar.yaziBoyutu === 14, JSON.stringify(ayar));
    await cdp.tus('0', 2, 'Digit0');
    await uyu(500);
    kontrol('Ctrl+0 varsayilana dondurdu', JSON.parse(fs.readFileSync(AYARLAR, 'utf8')).yaziBoyutu === 13);

    console.log('Kisayollar terminale sizmiyor');
    await cdp.tus('1', 2, 'Digit1');
    await uyu(200);
    kontrol('Ctrl+1 Pano\'ya gecti', await cdp.js(`document.querySelector('h1')?.textContent === 'Pano'`));
    await cdp.tus('2', 2, 'Digit2');
    await uyu(200);
    kontrol('Ctrl+2 Terminaller\'e dondu', await cdp.js(`document.querySelector('h1')?.textContent !== 'Pano'`));

    console.log('Sekmeyi kapat (cocuk surec yok -> diyalog yok)');
    await cdp.js(`(() => { document.querySelector('[aria-label$="sekmesini kapat"]').click(); return true; })()`);
    await cdp.bekle(`document.querySelectorAll('[role="tab"]').length === 0`, 5000, 'sekme kapandi');
    kontrol('sekme kapandi, Pano\'ya donuldu', await cdp.js(`document.querySelector('h1')?.textContent === 'Pano'`));
  } catch (e) {
    kontrol('senaryo', false, e.message);
  }

  // Kapanis: acik oturum yok, renderer onayi hemen verir. Browser.close'un cevabi
  // beklenmez — tarayici cevap veremeden kapanir ve bekleyen promise olay dongusunu
  // bosaltip sureci sessizce bitirir (ilk kosuda oldu).
  const cikisSozu = new Promise((r) => {
    const t = setTimeout(() => r('zaman-asimi'), 8000);
    app.on('exit', (k) => { clearTimeout(t); r(k); });
  });
  void cdp.gonder('Browser.close').catch(() => {});
  const cikis = await cikisSozu;
  kontrol('uygulama temiz kapandi', cikis !== 'zaman-asimi', cikis);
  if (cikis === 'zaman-asimi') try { app.kill(); } catch { /* */ }
  // Ayar dosyasini testten onceki haline getir.
  if (ayarOnce !== null) fs.writeFileSync(AYARLAR, ayarOnce);

  console.log(basarisiz === 0 ? '\nTUMU GECTI' : `\n${basarisiz} KONTROL BASARISIZ`);
  process.exit(basarisiz === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('test kosucusu hatasi: ' + e.stack);
  process.exit(1);
});
