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
// Kokpit'in veri dizini testte GECICI (KOKPIT_DIZIN, config.cjs). 2026-10-04'e kadar gercek
// ~/.kokpit kullaniliyor, sonda yedekten geri yaziliyordu: gercek Kokpit aciksa test ornegi
// onun acik oturumunu "onceki calismadan kalan" sanip deftere sahte "kapandi" yaziyor, geri
// yazma da gercek ornegin o arada yazdigini ezebiliyordu. Artik iki ornek hic dosya paylasmaz.
const TEST_DIZIN = fs.mkdtempSync(path.join(os.tmpdir(), 'kokpit-ui-'));
const AYARLAR = path.join(TEST_DIZIN, 'ayarlar.json');
const DEFTER = path.join(TEST_DIZIN, 'oturumlar.jsonl');
const KOMUTLAR = path.join(TEST_DIZIN, 'komutlar.json');
const CALISTIR = path.join(TEST_DIZIN, 'calistir.json');
const LOG = (ad) => path.join(TEST_DIZIN, ad);
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
const KODLAR = { Enter: 13, Escape: 27, Tab: 9, F: 70, f: 70, N: 78, n: 78, P: 80, p: 80, '1': 49, '2': 50, '3': 51, '4': 52, '=': 187, '-': 189, '0': 48 };

/** Uygulamayi acar, CDP'ye baglanir. */
async function baslat() {
  // Ustu kapali pencerede Chromium kare uretmeyi durdurur (visibilityState hidden, rAF ve
  // ResizeObserver durur): Scryne makineyi kullanirken test penceresi arkada kalinca
  // olcum gerektiren cizimler (butce grafigi) hic olusmuyordu. Olculdu 2026-10-03.
  const app = spawn(electronBin, [KOK, '--remote-debugging-port=' + PORT, '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding'], {
    cwd: KOK,
    stdio: ['ignore', 'pipe', 'pipe'],
    // KOKPIT_TEST_SECIM=0: kapatma diyalogunda "Guvenli kapat" secilmis sayilir (yerel
    // diyalog CDP'den tiklanamaz).
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
  // Bayat paket: kaynak, son derlemeden yeniyse test ESKI arayuzu sinar ve yesil yanar.
  // 2026-10-04'te oldu: derleme bir tip hatasiyla dusmustu, dist eski kaldi, mutasyon testinin
  // uc bozuk surumu de "gecti". Derleme basarisizsa dist'e dokunulmaz, bu kontrol onu yakalar.
  const enYeni = (dizin) =>
    fs.readdirSync(dizin, { withFileTypes: true }).reduce((m, d) => {
      const y = path.join(dizin, d.name);
      return Math.max(m, d.isDirectory() ? enYeni(y) : fs.statSync(y).mtimeMs);
    }, 0);
  const kaynak = Math.max(enYeni(path.join(KOK, 'src')), fs.statSync(path.join(KOK, 'index.html')).mtimeMs);
  const paket = fs.statSync(path.join(KOK, 'dist', 'index.html')).mtimeMs;
  if (kaynak > paket) {
    console.error('dist bayat: kaynak son derlemeden yeni (' + new Date(kaynak).toLocaleTimeString('tr-TR') + ' > ' + new Date(paket).toLocaleTimeString('tr-TR') + '). Once npm run build; derleme hatasi varsa onu duzelt.');
    process.exit(2);
  }

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

    console.log('Kanca koprusu (oturumun icinden hook taklidi)');
    // Test kabugu claude acmaz; hook'u, claude'un yapacagi gibi oturumun KENDI ortamindan
    // (KOKPIT_KANCA_PORT/TOKEN, KOKPIT_OTURUM) gonderiyoruz. Bu, PTY'ye gecen ortami,
    // alicinin token/oturum dogrulamasini ve arayuzu birlikte sinar.
    await cdp.js(`(() => { document.querySelector('.xterm-helper-textarea')?.focus(); return true; })()`);
    await cdp.yaz(
      "$h=@{Authorization=\"Bearer $env:KOKPIT_KANCA_TOKEN\";'X-Kokpit-Oturum'=$env:KOKPIT_OTURUM};" +
        "$u=\"http://127.0.0.1:$env:KOKPIT_KANCA_PORT/kanca\";" +
        "function k($b){Invoke-RestMethod -Method Post -Uri $u -Headers $h -ContentType 'application/json' -Body $b|Out-Null};" +
        "k '{\"hook_event_name\":\"UserPromptSubmit\",\"session_id\":\"t\"}';" +
        "k '{\"hook_event_name\":\"PreToolUse\",\"session_id\":\"t\",\"tool_name\":\"Edit\",\"tool_input\":{\"file_path\":\"C:/x/Sorular.tsx\"}}'"
    );
    await cdp.tus('Enter');
    await cdp.bekle(`document.body.innerText.includes('Sorular.tsx') && document.body.innerText.includes('Çalışıyor')`, 15000, 'etkinlik seridi calisiyor');
    kontrol('etkinlik seridi: Calisiyor + Edit Sorular.tsx', true);
    kontrol('sekmede calisma isareti', await cdp.js(`!!document.querySelector('[role="tab"] .calisma-isareti')`));
    await cdp.js(`(() => { document.hasFocus = () => false; return true; })()`);
    await cdp.yaz(
      "k '{\"hook_event_name\":\"PostToolUse\",\"session_id\":\"t\",\"tool_name\":\"Edit\",\"tool_input\":{\"file_path\":\"C:/x/Sorular.tsx\"},\"tool_response\":{\"structuredPatch\":[{\"lines\":[\"+a\",\"+b\",\"-c\"]}]}}';" +
        "k '{\"hook_event_name\":\"Stop\",\"session_id\":\"t\"}'"
    );
    await cdp.tus('Enter');
    await cdp.bekle(`[...document.querySelectorAll('button[aria-expanded]')].some(b => b.textContent.includes('Bitti') && b.textContent.includes('1 dosya'))`, 15000, 'serit bitti + ozet');
    kontrol('serit: Bitti + "1 dosya +2 −1"', await cdp.js(`document.body.innerText.includes('+2') && document.body.innerText.includes('−1')`));
    await cdp.bekle(`!!document.querySelector('[role="tab"][title*="dikkat bekliyor"]')`, 5000, 'Stop -> dikkat');
    kontrol('Stop sinyali sekmeye dikkat rozeti koydu (zil yok, hook var)', true);
    await cdp.js(`(() => { document.hasFocus = () => true; window.dispatchEvent(new Event('focus')); return true; })()`);
    await cdp.js(`(() => { [...document.querySelectorAll('button[aria-expanded]')].find(b => b.textContent.includes('Bitti')).click(); return true; })()`);
    await cdp.bekle(`!!document.querySelector('ol[aria-label^="Son araçlar"] li')`, 3000, 'etkinlik akisi');
    kontrol('seride tiklayinca son araclar akisi acildi', await cdp.js(`document.querySelector('ol[aria-label^="Son araçlar"]').textContent.includes('Sorular.tsx')`));
    await cdp.tus('Escape');
    await uyu(200);
    kontrol('Escape akisi kapatti', await cdp.js(`!document.querySelector('ol[aria-label^="Son araçlar"]')`));

    console.log('Hizli komut (v2.3): menu -> oturuma yazilir ve gonderilir');
    // Test veri dizinindeki komut dosyasina gecici bir komut yazilir: pwsh'ta yan
    // etkisi olan bir satir, "yazildi + Enter'a basildi"nin tek kaniti olarak bir dosya yazar.
    const gonderDosyasi = path.join(os.tmpdir(), 'kokpit-gonder-' + Date.now().toString(36) + '.txt');
    fs.writeFileSync(KOMUTLAR, JSON.stringify({ surum: 1, komutlar: [{ ad: 'Test komutu', metin: "Set-Content -Path '" + gonderDosyasi + "' -Value hizli" }] }));
    await cdp.js(`(() => { window.dispatchEvent(new Event('focus')); return true; })()`); // komutlar odakta yeniden okunur
    await cdp.bekle(`!!document.querySelector('button[aria-label$="hızlı komut gönder"]')`, 5000, 'hizli komut dugmesi');
    await cdp.js(`(() => { document.querySelector('button[aria-label$="hızlı komut gönder"]').click(); return true; })()`);
    await cdp.bekle(`!!document.querySelector('[role="menu"] [role="menuitem"]')`, 3000, 'komut menusu');
    kontrol('menu acildi, odak ilk komutta', await cdp.bekle(`document.activeElement?.getAttribute('role') === 'menuitem' && document.activeElement.textContent.includes('Test komutu')`, 2000, 'menu odagi').catch(() => false));
    await cdp.tus('Escape');
    await uyu(200);
    kontrol('Escape menuyu kapatti, odak dugmeye dondu', await cdp.js(`!document.querySelector('[role="menu"]') && document.activeElement?.getAttribute('aria-haspopup') === 'menu'`));
    await cdp.js(`(() => { document.querySelector('button[aria-label$="hızlı komut gönder"]').click(); return true; })()`);
    await cdp.bekle(`!!document.querySelector('[role="menu"] [role="menuitem"]')`, 3000, 'komut menusu 2');
    await cdp.js(`(() => { [...document.querySelectorAll('[role="menuitem"]')].find(b => b.textContent.includes('Test komutu')).click(); return true; })()`);
    const yazildi = await (async () => { for (let i = 0; i < 40; i++) { if (fs.existsSync(gonderDosyasi)) return true; await uyu(250); } return false; })();
    kontrol('komut kabuga yazildi ve Enter ile calisti (dosya olustu)', yazildi, gonderDosyasi);

    console.log('Soruya cevap (v2.3): ada yolu, damga denetimi');
    await cdp.js(`(() => { document.querySelector('.xterm-helper-textarea')?.focus(); return true; })()`);
    await cdp.yaz(
      "k '{\"hook_event_name\":\"UserPromptSubmit\",\"session_id\":\"t\"}';" +
        "k '{\"hook_event_name\":\"PreToolUse\",\"session_id\":\"t\",\"tool_name\":\"AskUserQuestion\",\"tool_input\":{\"questions\":[{\"question\":\"Hangi renk?\",\"header\":\"Renk\",\"multiSelect\":false,\"options\":[{\"label\":\"Kirmizi\"},{\"label\":\"Mavi\"},{\"label\":\"Yesil\"}]}]}}'; cls"
    );
    await cdp.tus('Enter');
    await cdp.bekle(`document.body.innerText.includes('Seni bekliyor') && document.body.innerText.includes('Hangi renk?')`, 15000, 'serit seni bekliyor');
    kontrol('serit: Seni bekliyor + soru metni', true);
    const soru = await cdp.js(`window.kokpit.etkinlikAnlik().then(a => { const [id, e] = Object.entries(a.oturumlar).find(([, e]) => e.durum === 'bekliyor') ?? []; return id ? { id, damga: e.degisti, ayrinti: e.soruAyrinti } : null; })`);
    kontrol('kanca durumunda secenekler ve cevaplanabilir', !!soru && soru.ayrinti?.cevaplanabilir === true && soru.ayrinti.secenekler.length === 3, soru);
    // Bayat damga: soru degistiyse rakam gonderilmez.
    await cdp.js(`(() => { window.kokpit.adaGonder({ id: ${JSON.stringify(soru?.id)}, tur: 'secim', secim: 1, damga: ${(soru?.damga ?? 0) - 5} }); return true; })()`);
    kontrol('bayat damgali cevap reddedildi', await cdp.bekle(`true`, 100).then(async () => { for (let i = 0; i < 20; i++) { if (cdp.konsol.some((k) => k.includes('[gonder] soru değişti'))) return true; await uyu(150); } return false; }));
    // Dogru damga: "2" (Mavi) kabuga gider. Test kabugu pwsh: arkasina " | Out-File" yazilinca
    // gelen rakam dosyaya duser — rakamin gercekten PTY'ye ulastiginin kaniti.
    const secimDosyasi = path.join(os.tmpdir(), 'kokpit-secim-' + Date.now().toString(36) + '.txt');
    await cdp.js(`(() => { window.kokpit.adaGonder({ id: ${JSON.stringify(soru?.id)}, tur: 'secim', secim: 1, damga: ${soru?.damga ?? 0} }); return true; })()`);
    await uyu(600);
    await cdp.js(`(() => { document.querySelector('.xterm-helper-textarea')?.focus(); return true; })()`);
    await cdp.yaz(" | Out-File -FilePath '" + secimDosyasi + "'");
    await cdp.tus('Enter');
    const secim = await (async () => { for (let i = 0; i < 40; i++) { if (fs.existsSync(secimDosyasi)) return fs.readFileSync(secimDosyasi, 'utf8').replace(/\0|﻿/g, '').trim(); await uyu(250); } return null; })();
    kontrol('ada yolu: 2. secenek rakam olarak kabuga gitti', secim === '2', secim);
    for (const f of [gonderDosyasi, secimDosyasi]) try { fs.unlinkSync(f); } catch { /* yok */ }

    await cdp.js(`(() => { document.querySelector('.xterm-helper-textarea')?.focus(); return true; })()`);
    await cdp.yaz("k '{\"hook_event_name\":\"Stop\",\"session_id\":\"t\"}'; cls");
    await cdp.tus('Enter');

    console.log('Calistir (v2.3): servis bolmesi claude sekmesinin yaninda, adres, yeniden baslat, durdur');
    const projeAdi = await cdp.js(`document.querySelector('[role="tab"] .enstruman')?.textContent ?? ''`);
    const projeYolu = await cdp.js(`window.kokpit.durumGetir().then(d => d.veri.projeler.find(p => p.ad === ${JSON.stringify(projeAdi)})?.yol ?? null)`);
    const defterSatirOnce = fs.existsSync(DEFTER) ? fs.readFileSync(DEFTER, 'utf8').trim().split(/\r?\n/).length : 0;
    // Sahte "dev sunucusu": adresi yazar ve calismaya devam eder. Komut test veri dizinindeki
    // calistir.json'a yazilir.
    const servisKomutu = `node -e "console.log('  Local:   http://localhost:51999/'); setInterval(() => {}, 1000)"`;
    kontrol('tarif kaydedildi', !!projeYolu && (await cdp.js(`window.kokpit.calistirKaydet(${JSON.stringify(projeYolu)}, ${JSON.stringify(servisKomutu)})`)) === true, projeAdi + ' ' + projeYolu);
    await cdp.tus('1', 2, 'Digit1');
    await cdp.bekle(`!!document.querySelector('button[aria-label=${JSON.stringify(projeAdi + ' uygulamasını çalıştır')}]')`, 5000, 'calistir dugmesi');
    await cdp.js(`(() => { document.querySelector('button[aria-label=${JSON.stringify(projeAdi + ' uygulamasını çalıştır')}]').click(); return true; })()`);
    await cdp.bekle(`[...document.querySelectorAll('[role="tab"]')].some(t => t.textContent.includes(${JSON.stringify(projeAdi + ' +1')}))`, 8000, 'servis ayni sekmede');
    kontrol('servis bolmesi acik claude sekmesinin icine acildi ("' + projeAdi + ' +1")', true);
    await cdp.bekle(`[...document.querySelectorAll('button')].some(b => b.textContent.includes('localhost:51999'))`, 20000, 'servis adresi');
    kontrol('servis basliginda adres dugmesi (localhost:51999)', true);
    kontrol('Pano satirinda calisiyor isareti (adres)', await cdp.bekle(`(() => { const b = document.querySelector('button[aria-label=${JSON.stringify(projeAdi + ' çalışıyor, bölmesine git')}]'); return !!b && b.textContent.includes(':51999'); })()`, 5000, 'pano isareti').catch(() => false), await cdp.js(`[...document.querySelectorAll('table button[aria-label]')].map(b => b.getAttribute('aria-label') + '=' + b.textContent).filter(x => x.includes(${JSON.stringify(projeAdi)})).join(' | ')`));
    const servisSayisi = () => (fs.readFileSync(LOG('pty-server.log'), 'utf8').match(/komut=servis: /g) || []).length;
    const servisOnce = servisSayisi();
    await cdp.js(`(() => { document.querySelector('button[aria-label=${JSON.stringify(projeAdi + ' uygulamasını yeniden başlat')}]').click(); return true; })()`);
    // Kanit log'dan: eski agac olur, YENI bir servis sureci acilir. (Yalniz "adres gorunuyor"a
    // bakmak yetmez: bolme degismeseydi eski adres de gorunurdu.)
    let yeniAcildi = false;
    for (let i = 0; i < 60 && !yeniAcildi; i++) { yeniAcildi = servisSayisi() > servisOnce; if (!yeniAcildi) await uyu(250); }
    kontrol('yeniden baslat: yeni servis sureci acildi', yeniAcildi, cdp.konsol.slice(-6).join(' | '));
    await cdp.bekle(`[...document.querySelectorAll('button')].some(b => b.textContent.includes('localhost:51999'))`, 20000, 'yeniden baslatilan servis adresi');
    kontrol('yeniden baslat: bolme yerinde, adres yeniden geldi', await cdp.js(`[...document.querySelectorAll('[role="tab"]')].some(t => t.textContent.includes(${JSON.stringify(projeAdi + ' +1')}))`));
    const konsolOnce = cdp.konsol.length;
    await cdp.js(`(() => { document.querySelector('button[aria-label=${JSON.stringify(projeAdi + ' uygulamasını durdur')}]').click(); return true; })()`);
    await cdp.bekle(`![...document.querySelectorAll('[role="tab"]')].some(t => t.textContent.includes('+1'))`, 8000, 'servis kapandi');
    kontrol('durdur: servis sorusuz kapandi (kapatma diyalogu yok)', !cdp.konsol.slice(konsolOnce).some((k) => k.includes('[kapatma]')), cdp.konsol.slice(konsolOnce).join(' | '));
    const yeniSatirlar = fs.existsSync(DEFTER) ? fs.readFileSync(DEFTER, 'utf8').trim().split(/\r?\n/).slice(defterSatirOnce) : [];
    kontrol('servis oturum defterine girmedi (geri yukleme claude acmasin)', yeniSatirlar.length === 0, yeniSatirlar);
    // taskkill ~1 sn surer: log satiri bolme kapandiktan sonra gelir, beklenir.
    let servisLogu = '';
    for (let i = 0; i < 30; i++) {
      servisLogu = fs.readFileSync(LOG('pty-server.log'), 'utf8');
      if ((servisLogu.match(/servis agaci olduruldu pid=\d+ kod=0/g) || []).length >= 2) break;
      await uyu(250);
    }
    kontrol('yeniden baslat + durdur: iki servis agaci da olduruldu (pty-server.log)', (servisLogu.match(/servis agaci olduruldu pid=\d+ kod=0/g) || []).length >= 2, servisLogu.slice(-300));
    // Komut sorusu: "komutu degistir" kutuyu mevcut komutla acar; Esc kapatir.
    await cdp.tus('P', 2 | 8, 'KeyP');
    await cdp.bekle(`!!document.querySelector('dialog[open] [role="combobox"]')`, 3000, 'palet');
    await cdp.yaz(projeAdi + ' komutu');
    await uyu(150);
    await cdp.tus('Enter');
    await cdp.bekle(`!!document.querySelector('dialog[open] input[aria-label="Çalıştırma komutu"]')`, 3000, 'calistir kutusu');
    kontrol('komut kutusu mevcut komutla acildi', (await cdp.js(`document.querySelector('dialog[open] input[aria-label="Çalıştırma komutu"]').value`)) === servisKomutu);
    await cdp.tus('Escape');
    await uyu(200);
    kontrol('Esc komut kutusunu kapatti', await cdp.js(`!document.querySelector('dialog[open]')`));
    kontrol('tarif test dizinine yazildi, gercek ~/.kokpit\'e degil', fs.existsSync(CALISTIR) && fs.readFileSync(CALISTIR, 'utf8').includes('51999'));
    await cdp.tus('2', 2, 'Digit2');

    console.log('Arama');
    await cdp.js(`(() => { document.querySelector('.xterm-helper-textarea')?.focus(); return true; })()`);
    await cdp.tus('F', 2 | 8, 'KeyF');
    await cdp.bekle(`!!document.querySelector('[role="search"] input')`, 3000, 'arama kutusu');
    kontrol('Ctrl+Shift+F arama cubugunu acti', true);
    // Escape odak inputa gectikten sonra gonderilir; once gonderilirse xterm'e gider (yuk
    // altinda ara sira oluyordu). Sonuc ayni sekilde istenir, yalniz sabit uyku yerine beklenir.
    await cdp.bekle(`document.activeElement?.closest('[role="search"]') != null`, 3000, 'arama odagi');
    await cdp.tus('Escape');
    kontrol('Escape aramayi kapatti', await cdp.bekle(`!document.querySelector('[role="search"]')`, 3000, 'arama kapandi').catch(() => false));

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
    await uyu(300);
    const ozetSatiri = fs.readFileSync(DEFTER, 'utf8').trim().split(/\r?\n/).map((x) => JSON.parse(x)).filter((x) => x.olay === 'kapandi' && x.ozet).pop();
    kontrol('kapanan oturumun ozeti deftere yazildi (1 dosya +2 -1)', !!ozetSatiri && ozetSatiri.ozet.dosya === 1 && ozetSatiri.ozet.arti === 2 && ozetSatiri.ozet.eksi === 1, ozetSatiri && ozetSatiri.ozet);

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
    const grafik = await cdp.bekle(`!!document.querySelector('figure svg[role="img"]')`, 5000, 'butce grafigi').catch(() => false);
    kontrol('butce grafigi var', grafik, grafik ? undefined : JSON.stringify(await cdp.js(`(() => { const f = document.querySelector('figure'); const s = [...document.querySelectorAll('section')].find(x => x.textContent.includes('Bütçe')); return new Promise(c => { let raf = false; requestAnimationFrame(() => { raf = true; }); setTimeout(() => c({ figure: !!f, divGenislik: f?.firstElementChild?.clientWidth, gorunurluk: document.visibilityState, rafTetiklendi: raf }), 500); }); })()`)));
    kontrol('Aria ile konus dugmesi var', await cdp.js(`[...document.querySelectorAll('button')].some(b => b.textContent.includes('Aria ile konuş'))`));
    console.log('Envanter sayfasi');
    await cdp.tus('4', 2, 'Digit4');
    await cdp.bekle(`document.querySelector('h1')?.textContent === 'Envanter'`, 3000, 'envanter basligi');
    kontrol('Ctrl+4 Envanter sayfasini acti', true);
    kontrol('drift blogu + skill listesi cizildi', (await cdp.js(`document.querySelectorAll('[aria-label="Envanter"] section').length`)) >= 5);
    await cdp.tus('1', 2, 'Digit1');

    console.log('Arsiv grubu');
    const satirSay = `document.querySelectorAll('table tbody tr:not(:first-child)').length`;
    const arsivOnce = await cdp.js(`document.querySelector('table [aria-expanded]')?.getAttribute('aria-expanded')`);
    const satirOnce = await cdp.js(satirSay);
    await cdp.js(`(() => { document.querySelector('table [aria-expanded]').click(); return true; })()`);
    await uyu(300);
    const satirSonra = await cdp.js(satirSay);
    kontrol('arsiv dugmesi arsiv satirlarini ac/kapa yapiyor', satirSonra !== satirOnce, satirOnce + ' -> ' + satirSonra);
    await cdp.js(`(() => { document.querySelector('table [aria-expanded]').click(); return true; })()`);
    await uyu(300);
    kontrol('arsiv durumu geri alindi', (await cdp.js(`document.querySelector('table [aria-expanded]')?.getAttribute('aria-expanded')`)) === arsivOnce);

    console.log('Komut paleti (Ctrl+Shift+P)');
    await cdp.tus('P', 2 | 8, 'KeyP');
    await cdp.bekle(`!!document.querySelector('dialog[open] [role="combobox"]')`, 3000, 'palet');
    kontrol('palet acildi, odak arama kutusunda', await cdp.js(`document.activeElement?.getAttribute('role') === 'combobox'`));
    await cdp.yaz('envanter');
    await uyu(150);
    kontrol('arama suzuyor (tek sayfa sonucu ustte)', await cdp.js(`document.querySelector('[role="option"][aria-selected="true"]')?.textContent.includes('Envanter')`));
    await cdp.tus('Enter');
    await cdp.bekle(`document.querySelector('h1')?.textContent === 'Envanter'`, 3000, 'paletten envanter');
    kontrol('Enter komutu calistirdi, palet kapandi', await cdp.js(`!document.querySelector('dialog[open]')`));
    await cdp.tus('1', 2, 'Digit1');
    const kisayolLogu = fs.readFileSync(LOG('kokpit.log'), 'utf8').split('\n').filter((s) => s.includes('genel kisayol')).pop() ?? '';
    // Gercek Kokpit aciksa kisayol onda: test orneginde "KAYDEDILEMEDI" beklenen durum.
    kontrol('genel kisayol kaydi denendi ve loglandi', /genel kisayol Control\+Alt\+Shift\+N (kayitli|KAYDEDILEMEDI)/.test(kisayolLogu), kisayolLogu);

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
  const kapanisLogu = fs.readFileSync(LOG('pty-server.log'), 'utf8').split('\n').slice(-15).join('\n');
  kontrol('kapanista guvenli cikis tamamlandi (pty-server.log)', /guvenli cikis tamam/.test(kapanisLogu), kapanisLogu.slice(-300));

  console.log('Ikinci acilis: geri yukleme teklifi');
  ({ app, cdp } = await baslat());
  try {
    await cdp.bekle(`!!document.querySelector('[role="status"] button')`, 20000, 'geri yukleme seridi');
    const metin = await cdp.js(`document.querySelector('[role="status"]')?.textContent ?? ''`);
    kontrol('serit 1 oturumu teklif ediyor', metin.includes('1 oturum açıktı'), metin.slice(0, 80));
    await cdp.js(`(() => { [...document.querySelectorAll('[role="status"] button')].find(b => b.textContent.trim() === 'Geri yükle').click(); return true; })()`);
    await cdp.bekle(`!!document.querySelector('[role="tab"] .bg-aksan')`, 20000, 'geri yuklenen oturum acik');
    kontrol('Geri yukle sekmeyi acti (test kabugu; gercekte claude --resume <kimlik>)', true);
    // Kimlik zinciri: kapanista acik kalan oturumun claude kimligi, geri yuklenen oturuma aynen
    // gecmeli (yoksa --continue o klasordeki BASKA bir konusmayi acabilirdi).
    const acilislar = fs.readFileSync(DEFTER, 'utf8').trim().split(/\r?\n/).map((x) => JSON.parse(x)).filter((x) => x.olay === 'acildi');
    const sonIki = acilislar.slice(-2);
    kontrol(
      'geri yuklenen oturum ayni claude kimligiyle acildi (--resume)',
      sonIki.length === 2 && /^[0-9a-f-]{36}$/.test(sonIki[0].claude ?? '') && sonIki[0].claude === sonIki[1].claude && sonIki[0].id !== sonIki[1].id,
      sonIki
    );
    kontrol('her yeni oturum kendi kimligini aldi (tekrar yok)', new Set(acilislar.slice(0, -1).map((x) => x.claude)).size === acilislar.length - 1, acilislar.map((x) => x.claude));
    kontrol('serit kayboldu', await cdp.js(`!document.querySelector('[role="status"] button')`));
    await cdp.js(`(() => { document.querySelector('[aria-label$="sekmesini kapat"]').click(); return true; })()`);
    await cdp.bekle(`document.querySelectorAll('[role="tab"]').length === 0`, 5000, 'sekme kapandi');
  } catch (e) {
    kontrol('geri yukleme senaryosu', false, e.message);
  }
  await kapat(app, cdp, 'ikinci calisma temiz kapandi');

  // Gecici veri dizini silinir. Gercek ~/.kokpit'e test boyunca hic dokunulmadi.
  if (process.env.KOKPIT_TEST_KEEP === '1') {
    console.log('--- test dizini (silinmedi): ' + TEST_DIZIN + ' ---');
    console.log(fs.existsSync(DEFTER) ? fs.readFileSync(DEFTER, 'utf8') : '(defter yok)');
  } else {
    try { fs.rmSync(TEST_DIZIN, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 }); } catch { /* bir surec hala tutuyorsa temp'te kalir */ }
  }

  console.log(basarisiz === 0 ? '\nTUMU GECTI' : `\n${basarisiz} KONTROL BASARISIZ`);
  process.exit(basarisiz === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('test kosucusu hatasi: ' + e.stack);
  process.exit(1);
});
