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
const DEFTER = path.join(os.homedir(), '.kokpit', 'oturumlar.jsonl');
const { VAULT } = require('../electron/config.cjs');
const INBOX = path.join(VAULT, '\u{1F4E5} 000-Inbox', 'Dump');

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
const KODLAR = { Enter: 13, Escape: 27, Tab: 9, F: 70, f: 70, N: 78, n: 78, '1': 49, '2': 50, '3': 51, '4': 52, '=': 187, '-': 189, '0': 48 };

/** Uygulamayi acar, CDP'ye baglanir. */
async function baslat() {
  const app = spawn(electronBin, [KOK, '--remote-debugging-port=' + PORT], {
    cwd: KOK,
    stdio: ['ignore', 'pipe', 'pipe'],
    // KOKPIT_TEST_SECIM=0: kapatma diyalogunda "Guvenli kapat" secilmis sayilir (yerel
    // diyalog CDP'den tiklanamaz).
    env: { ...process.env, KOKPIT_DEV: '0', KOKPIT_TEST_KABUK: '1', KOKPIT_TEST_SECIM: '0' },
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
  return { app, cdp };
}

/**
 * Kapanis. Browser.close'un cevabi beklenmez — tarayici cevap veremeden kapanir ve
 * bekleyen promise olay dongusunu bosaltip sureci sessizce bitirir (ilk kosuda oldu).
 */
async function kapat(app, cdp, ad, ms = 8000) {
  const cikisSozu = new Promise((r) => {
    const t = setTimeout(() => r('zaman-asimi'), ms);
    app.on('exit', (k) => { clearTimeout(t); r(k); });
  });
  void cdp.gonder('Browser.close').catch(() => {});
  const cikis = await cikisSozu;
  kontrol(ad, cikis !== 'zaman-asimi', cikis);
  if (cikis === 'zaman-asimi') try { app.kill(); } catch { /* */ }
}

const AC_DUGMESI = `(() => { const b = [...document.querySelectorAll('table tbody tr button')].find(x => x.textContent.trim() === 'Aç'); b.click(); return true; })()`;

/** Acik terminalde uzun bir surec baslatir: kapatma korumasinin "cocuk var" dali. */
async function cocukBaslat(cdp) {
  await uyu(1500); // pwsh istemi
  await cdp.js(`(() => { document.querySelector('.xterm-helper-textarea')?.focus(); return true; })()`);
  await cdp.yaz('ping -n 60 127.0.0.1');
  await cdp.tus('Enter');
  await uyu(1500);
}

async function main() {
  if (!fs.existsSync(path.join(KOK, 'dist', 'index.html'))) {
    console.error('dist yok: once npm run build');
    process.exit(2);
  }
  const ayarOnce = fs.existsSync(AYARLAR) ? fs.readFileSync(AYARLAR, 'utf8') : null;
  const defterOnce = fs.existsSync(DEFTER) ? fs.readFileSync(DEFTER, 'utf8') : null;

  let { app, cdp } = await baslat();
  try {
    console.log('Pano');
    await cdp.bekle(`document.querySelectorAll('table tbody tr').length > 0`, 20000, 'proje tablosu');
    const satir = await cdp.js(`document.querySelectorAll('table tbody tr').length`);
    kontrol('proje tablosu dolu', satir > 0, satir);

    console.log('Terminal ac');
    await cdp.js(AC_DUGMESI);
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

    console.log('Guvenli kapat (cocuk surec var -> cikis tuslari, kendi kapanmasi beklenir)');
    await cdp.js(AC_DUGMESI);
    await cdp.bekle(`!!document.querySelector('[role="tab"] .bg-aksan')`, 20000, 'oturum acik');
    await cocukBaslat(cdp);
    await cdp.js(`(() => { document.querySelector('[aria-label$="sekmesini kapat"]').click(); return true; })()`);
    await cdp.bekle(`[...document.querySelectorAll('[role="status"]')].some(p => p.textContent.includes('Güvenli kapatılıyor'))`, 10000, 'kapaniyor seridi');
    kontrol('bolmede "Guvenli kapatiliyor" seridi', true);
    await cdp.bekle(`document.querySelectorAll('[role="tab"]').length === 0`, 30000, 'guvenli cikis sonrasi sekme');
    kontrol('surec kendi yoluyla bitti, sekme kendiliginden kapandi', true);

    console.log('Defter: son oturum Pano\'da');
    await cdp.bekle(`[...document.querySelectorAll('table tbody th')].some(th => th.textContent.includes('son oturum'))`, 5000, 'son oturum satiri');
    kontrol('kapanan oturum Pano satirinda "son oturum" olarak goruluyor', true);
    const beyinMetni = await cdp.js(`[...document.querySelectorAll('table tbody th')].map(th => th.textContent).find(t => t.includes('son oturum')) ?? ''`);
    kontrol('son oturumun yaninda beyin kaydi var (test kabugu claude acmaz -> "transcript yok")', beyinMetni.includes('transcript yok'), beyinMetni.slice(0, 80));

    console.log('Saglik sayfasi');
    await cdp.tus('3', 2, 'Digit3');
    await cdp.bekle(`document.querySelector('h1')?.textContent === 'Sağlık'`, 3000, 'saglik basligi');
    kontrol('Ctrl+3 Saglik sayfasini acti', true);
    kontrol('boru zinciri cizildi (4 halka)', (await cdp.js(`document.querySelectorAll('[aria-label="Beyin boru zinciri"] p.etiket').length`)) === 4);
    kontrol('butce grafigi var', await cdp.js(`!!document.querySelector('figure svg[role="img"]')`));
    kontrol('Aria ile konus dugmesi var', await cdp.js(`[...document.querySelectorAll('button')].some(b => b.textContent.includes('Aria ile konuş'))`));
    console.log('Envanter sayfasi');
    await cdp.tus('4', 2, 'Digit4');
    await cdp.bekle(`document.querySelector('h1')?.textContent === 'Envanter'`, 3000, 'envanter basligi');
    kontrol('Ctrl+4 Envanter sayfasini acti', true);
    kontrol('drift blogu + skill listesi cizildi', (await cdp.js(`document.querySelectorAll('[aria-label="Envanter"] section').length`)) >= 5);
    await cdp.tus('1', 2, 'Digit1');

    console.log('Inbox notu (Ctrl+Shift+N)');
    const d = new Date();
    const gun = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); // yerel gun, UTC degil
    const inboxDosya = path.join(INBOX, gun + '.md');
    const inboxOnce = fs.existsSync(inboxDosya) ? fs.readFileSync(inboxDosya, 'utf8') : null;
    await cdp.tus('N', 2 | 8, 'KeyN');
    await cdp.bekle(`!!document.querySelector('dialog[open] textarea')`, 3000, 'not kutusu');
    kontrol('not kutusu acildi ve odak textarea\'da', await cdp.js(`document.activeElement?.tagName === 'TEXTAREA'`));
    const isaret = 'kokpit-test-notu-' + Date.now().toString(36);
    await cdp.yaz(isaret);
    await cdp.tus('Enter');
    await cdp.bekle(`!document.querySelector('dialog[open]')`, 5000, 'not kutusu kapandi');
    const inboxSonra = fs.existsSync(inboxDosya) ? fs.readFileSync(inboxDosya, 'utf8') : '';
    kontrol('not Inbox/Dump/' + gun + '.md dosyasina SONA eklendi', inboxSonra.includes(isaret) && (inboxOnce === null || inboxSonra.startsWith(inboxOnce)), inboxSonra.slice(-120));
    kontrol('baslikta "Not Inbox\'a düştü" bildirimi', await cdp.js(`!!document.querySelector('header [role="status"]')`));
    // Test notunu geri al: dosya yoksa sil, varsa eklenen satiri cikar.
    if (inboxOnce === null) fs.unlinkSync(inboxDosya);
    else fs.writeFileSync(inboxDosya, inboxSonra.split('\n').filter((l) => !l.includes(isaret)).join('\n'));

    console.log('Surec calisirken uygulamayi kapat (guvenli kapat + geri yukleme)');
    await cdp.js(AC_DUGMESI);
    await cdp.bekle(`!!document.querySelector('[role="tab"] .bg-aksan')`, 20000, 'oturum acik');
    await cocukBaslat(cdp);
  } catch (e) {
    kontrol('senaryo', false, e.message);
  }
  // Main'in eski 3 sn bekcisi burada pencereyi, guvenli cikis bitmeden kapatirdi.
  await kapat(app, cdp, 'uygulama guvenli cikisi bekleyip kapandi', 30000);
  const kapanisLogu = fs.readFileSync(path.join(os.homedir(), '.kokpit', 'pty-server.log'), 'utf8').split('\n').slice(-15).join('\n');
  kontrol('kapanista guvenli cikis tamamlandi (pty-server.log)', /guvenli cikis tamam/.test(kapanisLogu), kapanisLogu.slice(-300));

  console.log('Ikinci acilis: geri yukleme teklifi');
  ({ app, cdp } = await baslat());
  try {
    await cdp.bekle(`!!document.querySelector('[role="status"] button')`, 20000, 'geri yukleme seridi');
    const metin = await cdp.js(`document.querySelector('[role="status"]')?.textContent ?? ''`);
    kontrol('serit 1 oturumu teklif ediyor', metin.includes('1 oturum açıktı'), metin.slice(0, 80));
    await cdp.js(`(() => { [...document.querySelectorAll('[role="status"] button')].find(b => b.textContent.trim() === 'Geri yükle').click(); return true; })()`);
    await cdp.bekle(`!!document.querySelector('[role="tab"] .bg-aksan')`, 20000, 'geri yuklenen oturum acik');
    kontrol('Geri yukle sekmeyi acti (test kabugu; gercekte claude --continue)', true);
    kontrol('serit kayboldu', await cdp.js(`!document.querySelector('[role="status"] button')`));
    await cdp.js(`(() => { document.querySelector('[aria-label$="sekmesini kapat"]').click(); return true; })()`);
    await cdp.bekle(`document.querySelectorAll('[role="tab"]').length === 0`, 5000, 'sekme kapandi');
  } catch (e) {
    kontrol('geri yukleme senaryosu', false, e.message);
  }
  await kapat(app, cdp, 'ikinci calisma temiz kapandi');

  // Ayar ve defter dosyalarini testten onceki haline getir: test oturumlari gercek
  // "son oturum" verisini kirletmesin.
  if (process.env.KOKPIT_TEST_KEEP === '1') {
    // Teshis: dosyalari geri alma, defteri goster.
    console.log('--- oturumlar.jsonl ---');
    console.log(fs.existsSync(DEFTER) ? fs.readFileSync(DEFTER, 'utf8') : '(yok)');
  } else {
    if (ayarOnce !== null) fs.writeFileSync(AYARLAR, ayarOnce);
    if (defterOnce !== null) fs.writeFileSync(DEFTER, defterOnce);
    else if (fs.existsSync(DEFTER)) fs.unlinkSync(DEFTER);
  }

  console.log(basarisiz === 0 ? '\nTUMU GECTI' : `\n${basarisiz} KONTROL BASARISIZ`);
  process.exit(basarisiz === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('test kosucusu hatasi: ' + e.stack);
  process.exit(1);
});
