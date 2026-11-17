// Okuma sayfasi UI testi (v2.9): uretim paketini SAHTE vault ile (KOKPIT_VAULT) gercek Electron'da
// acar, CDP ile tiklar ve DOM'u okur. test-ui.cjs'ten ayri: o gercek vault'un durum.py'sine
// bagli; bu test vault icerigini kendisi kurdugu icin gercek vault'a hic dokunmaz.
//
// Kullanim: npm run build && npm run test:okuma-ui
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');
const os = require('os');
const WebSocket = require('ws');
const { okumaVaultKur, COMPANION } = require('./okuma-fixture.cjs');

const KOK = path.join(__dirname, '..');
const PORT = 9334;
const electronBin = require('electron');
const TEST_DIZIN = fs.mkdtempSync(path.join(os.tmpdir(), 'kokpit-okuma-ui-'));
const VAULT = okumaVaultKur(TEST_DIZIN);
const KOKPIT_DIZIN = path.join(TEST_DIZIN, 'kokpit');

let basarisiz = 0;
function kontrol(ad, kosul, detay) {
  console.log((kosul ? '  ok   ' : '  FAIL ') + ad + (kosul || detay === undefined ? '' : '  -> ' + JSON.stringify(detay)));
  if (!kosul) basarisiz++;
}
const uyu = (ms) => new Promise((r) => setTimeout(r, ms));

function jsonGetir(url) {
  return new Promise((coz, red) => {
    http
      .get(url, (res) => {
        let veri = '';
        res.on('data', (d) => (veri += d));
        res.on('end', () => {
          try {
            coz(JSON.parse(veri));
          } catch (e) {
            red(e);
          }
        });
      })
      .on('error', red);
  });
}

const KODLAR = { '5': 53, ArrowLeft: 37 };

// test-ui.cjs'teki Cdp'nin kucuk kopyasi (o dosya modul degil, require edilince kosar).
class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.sira = 0;
    this.bekleyen = new Map();
    this.istisnalar = [];
    ws.on('message', (ham) => {
      const m = JSON.parse(ham.toString());
      if (m.id && this.bekleyen.has(m.id)) {
        const { coz, red } = this.bekleyen.get(m.id);
        this.bekleyen.delete(m.id);
        if (m.error) red(new Error(m.error.message));
        else coz(m.result);
      } else if (m.method === 'Runtime.exceptionThrown') {
        this.istisnalar.push(m.params.exceptionDetails?.exception?.description ?? m.params.exceptionDetails?.text);
      }
    });
  }
  gonder(method, params = {}) {
    const id = ++this.sira;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((coz, red) => this.bekleyen.set(id, { coz, red }));
  }
  async js(ifade) {
    const r = await this.gonder('Runtime.evaluate', { expression: ifade, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error('sayfa hatasi: ' + (r.exceptionDetails.exception?.description ?? r.exceptionDetails.text));
    return r.result.value;
  }
  async bekle(ifade, ms = 8000, ad = ifade) {
    const son = Date.now() + ms;
    while (Date.now() < son) {
      if (await this.js(ifade)) return true;
      await uyu(120);
    }
    throw new Error('zaman asimi: ' + ad);
  }
  async tus(key, mods = 0, code) {
    const ortak = { key, modifiers: mods, code, windowsVirtualKeyCode: KODLAR[key] };
    await this.gonder('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...ortak });
    await this.gonder('Input.dispatchKeyEvent', { type: 'keyUp', ...ortak });
  }
}

async function baslat() {
  const app = spawn(electronBin, [KOK, '--remote-debugging-port=' + PORT, '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding'], {
    cwd: KOK,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, KOKPIT_DEV: '0', KOKPIT_TEST_KABUK: '1', KOKPIT_DIZIN, KOKPIT_VAULT: VAULT },
  });
  app.stderr.on('data', () => {});
  app.stdout.on('data', () => {});
  let hedef = null;
  for (let i = 0; i < 60 && !hedef; i++) {
    await uyu(250);
    try {
      hedef = (await jsonGetir(`http://127.0.0.1:${PORT}/json`)).find((t) => t.type === 'page' && !t.url.startsWith('devtools'));
    } catch {
      /* henuz dinlemiyor */
    }
  }
  if (!hedef) throw new Error('CDP hedefi bulunamadi');
  const ws = new WebSocket(hedef.webSocketDebuggerUrl);
  await new Promise((r) => ws.once('open', r));
  const cdp = new Cdp(ws);
  await cdp.gonder('Runtime.enable');
  await cdp.bekle(`!!document.querySelector('nav button[aria-label="Okuma"]')`, 15000, 'uygulama acildi');
  return { app, cdp };
}

async function kapat(app, cdp) {
  const cikis = new Promise((r) => {
    const t = setTimeout(() => r('zaman-asimi'), 8000);
    app.on('exit', (k) => {
      clearTimeout(t);
      r(k);
    });
  });
  void cdp.gonder('Browser.close').catch(() => {});
  if ((await cikis) === 'zaman-asimi') app.kill();
}

const OKUMA = `document.querySelector('section[aria-label="Okuma"]')`;
const satir = (metin) => `[...${OKUMA}.querySelectorAll('ul button')].find(b => b.textContent.includes(${JSON.stringify(metin)}))`;
const bolum = (ad) => `(() => { [...${OKUMA}.querySelectorAll('nav[aria-label="Okuma bölümleri"] button')].find(b => b.textContent.startsWith(${JSON.stringify(ad)})).click(); return true; })()`;
const makaleH1 = `${OKUMA}.querySelector('article .okuma-metin h1')?.textContent`;

async function main() {
  if (!fs.existsSync(path.join(KOK, 'dist', 'index.html'))) {
    console.error('dist yok: once npm run build');
    process.exit(2);
  }
  let { app, cdp } = await baslat();
  try {
    console.log('Sayfa ve Akis');
    await cdp.tus('5', 2, 'Digit5');
    await cdp.bekle(`document.querySelector('h1')?.textContent === 'Okuma'`, 3000, 'okuma basligi');
    kontrol('Ctrl+5 Okuma sayfasini acti', true);
    await cdp.bekle(`!!${satir('Last-Session')}`, 5000, 'akis listesi');
    kontrol('Akis alan disi dosya gostermiyor', await cdp.js(`!${OKUMA}.textContent.includes('kok dosyasi') && !${satir('gizli')}`));
    const rozet = await cdp.js(`document.querySelector('nav button[aria-label="Okuma"] .enstruman')?.textContent ?? ''`);
    kontrol('nav rozetinde okunmamis sayi', Number(rozet) > 0, rozet);
    kontrol('Last-Session okunmamis isaretli', await cdp.js(`${satir('Last-Session')}.textContent.includes('okunmamış')`));

    console.log('Not okuma');
    await cdp.js(`(() => { ${satir('Last-Session')}.click(); return true; })()`);
    await cdp.bekle(`${makaleH1} === 'Son Oturum'`, 5000, 'not acildi');
    kontrol('not acildi, frontmatter govdeye basilmadi', await cdp.js(`!${OKUMA}.querySelector('article').textContent.includes('type: memory')`));
    kontrol('tablo <table> olarak cizildi', await cdp.js(`!!${OKUMA}.querySelector('article .okuma-tablo table td')`));
    kontrol('ham HTML calismadi, metin olarak kaldi', await cdp.js(`window.__xss === undefined && ${OKUMA}.querySelector('article').textContent.includes('<script>') && !${OKUMA}.querySelector('article script')`));
    kontrol('kod icindeki [[...]] baglanti olmadi', await cdp.js(`[...${OKUMA}.querySelectorAll('article code')].some(c => c.textContent === '[[kod-icinde]]' && !c.closest('a'))`));
    await cdp.bekle(`!!${OKUMA}.querySelector('article .kirik-link')`, 3000, 'kirik baglanti');
    kontrol('alan disi/olmayan wikilink soluk metin', await cdp.js(`${OKUMA}.querySelector('article .kirik-link').textContent === 'Yok-Boyle-Not'`));
    kontrol('etiketler altta', await cdp.js(`${OKUMA}.querySelector('article').textContent.includes('sureklilik')`));
    await cdp.bekle(`!${satir('Last-Session')}.textContent.includes('okunmamış')`, 3000, 'okunmamis sondu');
    kontrol('acilan notun okunmamis noktasi sondu', true);
    kontrol('okuma.json Kokpit dizininde, vault temiz', fs.existsSync(path.join(KOKPIT_DIZIN, 'okuma.json')) && !fs.existsSync(path.join(VAULT, 'okuma.json')));

    console.log('Baglanti ve geri');
    await cdp.js(`(() => { [...${OKUMA}.querySelectorAll('article a')].find(a => a.textContent === 'kanit-standardi').click(); return true; })()`);
    await cdp.bekle(`${makaleH1} === 'Kanıt Standardı'`, 5000, 'wikilink');
    kontrol('wikilink hedef notu acti', true);
    await cdp.tus('ArrowLeft', 1, 'ArrowLeft');
    await cdp.bekle(`${makaleH1} === 'Son Oturum'`, 5000, 'geri');
    kontrol('Alt+Sol geri dondu', true);

    console.log('Bilgi: goreli link');
    await cdp.js(bolum('Bilgi'));
    await cdp.bekle(`!!${satir('Bilgi Tabanı İndeksi')}`, 5000, 'bilgi listesi');
    await cdp.js(`(() => { ${satir('Bilgi Tabanı İndeksi')}.click(); return true; })()`);
    await cdp.bekle(`${makaleH1} === 'Bilgi Tabanı İndeksi'`, 5000, 'index');
    await cdp.js(`(() => { [...${OKUMA}.querySelectorAll('article a')].find(a => a.textContent === 'Kanıt').click(); return true; })()`);
    await cdp.bekle(`${makaleH1} === 'Kanıt Standardı'`, 5000, 'goreli link');
    kontrol('goreli .md linki acildi', true);

    console.log('Projeler');
    await cdp.js(bolum('Projeler'));
    await cdp.bekle(`!!${OKUMA}.querySelector('#proje-ornek-proje')`, 5000, 'proje ozeti');
    const ozet = await cdp.js(`${OKUMA}.querySelector('#proje-ornek-proje').closest('section').textContent`);
    kontrol('proje ozeti son oturumun kararlarini gosteriyor', ozet.includes('Karar bir alındı') && ozet.includes('İş bir') && !ozet.includes('eski karar'), ozet.slice(0, 200));
    kontrol('kaydi olmayan proje ayri satirda', await cdp.js(`${OKUMA}.querySelector('article').textContent.includes('Kaydı olmayan projeler: Bos-Proje')`));
    await cdp.js(`(() => { ${OKUMA}.querySelector('#proje-ornek-proje').closest('section').querySelector('a').click(); return true; })()`);
    await cdp.bekle(`!!${OKUMA}.querySelector('article h3[id^="oturum-09-10"]')`, 5000, 'daily acildi');
    const konum = await cdp.js(`(() => { const h = ${OKUMA}.querySelector('article h3[id^="oturum-09-10"]'); const k = h.closest('.overflow-y-auto'); return Math.round(h.getBoundingClientRect().top - k.getBoundingClientRect().top); })()`);
    kontrol('son oturum linki daily notunu o basliga kaydirarak acti', konum >= -2 && konum < 120, konum);
    await cdp.tus('ArrowLeft', 1, 'ArrowLeft');
    await cdp.bekle(`!!${OKUMA}.querySelector('#proje-ornek-proje')`, 5000, 'ozete geri');
    kontrol('geri proje ozetine dondu', true);

    console.log('Guvenlik (IPC)');
    const kacis = await cdp.js(`Promise.all(['../kokpit/okuma.json', 'CLAUDE.md', '.claude/scripts/kokpit-projeler.json', ${JSON.stringify(path.join(VAULT, COMPANION, 'Last-Session.md'))}].map(y => window.kokpit.vaultOku(y).then(r => !!r.hata)))`);
    kontrol('alan disi yollar renderer ucundan da reddediliyor', kacis.every(Boolean), kacis);

    console.log('Tema');
    await cdp.js(`(() => { [...${OKUMA}.querySelectorAll('button[aria-pressed]')].find(b => b.textContent.includes('Aydınlık')).click(); return true; })()`);
    await cdp.bekle(`!!${OKUMA}.querySelector('[data-tema="acik"]')`, 3000, 'aydinlik');
    // Hareket azaltma acikken global kural her ogeye 0.01 ms gecis koyar; rengin oturmasi beklenir.
    const kagit = `getComputedStyle(${OKUMA}.querySelector('[data-tema="acik"]')).backgroundColor`;
    const oturdu = await cdp.bekle(`${kagit} === 'rgb(246, 245, 242)'`, 3000).catch(() => false);
    kontrol('aydinlik tema kagit zemin', oturdu, oturdu || (await cdp.js(kagit)));
    const navRenk = await cdp.js(`getComputedStyle(document.querySelector('nav button[aria-label="Okuma"]')).color`);
    kontrol('nav koyu temada kaldi (aydinlik yalniz Okuma)', navRenk !== 'rgb(27, 29, 33)', navRenk);
    await uyu(500);
    const ayar = JSON.parse(fs.readFileSync(path.join(KOKPIT_DIZIN, 'ayarlar.json'), 'utf8'));
    kontrol('tema ayara yazildi', ayar.okumaTema === 'acik', ayar.okumaTema);
    kontrol('sayfa istisnasi yok', cdp.istisnalar.length === 0, cdp.istisnalar);
  } catch (e) {
    kontrol('okuma senaryosu', false, e.message);
  }
  await kapat(app, cdp);

  console.log('Yeniden acilis');
  ({ app, cdp } = await baslat());
  try {
    await cdp.tus('5', 2, 'Digit5');
    await cdp.bekle(`!!${OKUMA}.querySelector('[data-tema="acik"]')`, 5000, 'tema korundu');
    kontrol('aydinlik tema yeniden acilista korundu', true);
    kontrol('okunan not okunmus kaldi', await cdp.bekle(`!!${satir('Last-Session')}`, 5000).then(() => cdp.js(`!${satir('Last-Session')}.textContent.includes('okunmamış')`)));
  } catch (e) {
    kontrol('yeniden acilis', false, e.message);
  }
  await kapat(app, cdp);

  try {
    fs.rmSync(TEST_DIZIN, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
  } catch {
    /* bir surec hala tutuyorsa temp'te kalir */
  }
  console.log(basarisiz === 0 ? '\nTUMU GECTI' : `\n${basarisiz} KONTROL BASARISIZ`);
  process.exit(basarisiz === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('test kosucusu hatasi: ' + e.stack);
  process.exit(1);
});
