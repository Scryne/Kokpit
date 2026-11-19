// v4.1 Usta bolumunun gorsel ve davranis denetimi (ana pencere > Ayarlar, Ctrl+8).
// Izole veri dizini: sahte (DPAPI ile sifrelenmis) anahtar + uc ornek is. Gercek ~/.kokpit'e dokunmaz.
// Denetler: uc genislikte yatay tasma, konsol hatasi, DOM'da anahtar sizintisi, gercek akis (sahte anahtar
// girilince OpenCode reddeder, hata metni gorunur; ag gerekir, token harcamaz).
// Kullanim: npm run build && node scripts/ekran-usta.cjs [cikti-dizini]
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');
const os = require('os');
const WebSocket = require('ws');

const KOK = path.join(__dirname, '..');
const PORT = 9341;
const electronBin = require('electron');
const CIKTI = process.argv[2] || os.tmpdir();
const TEST_DIZIN = fs.mkdtempSync(path.join(os.tmpdir(), 'kokpit-ekran-usta-'));
process.env.KOKPIT_DIZIN = TEST_DIZIN;
const dpapi = require('../electron/dpapi.cjs');
const uyu = (ms) => new Promise((r) => setTimeout(r, ms));
const ANAHTAR = 'sk-ekran-denemesi-9f3a7c2e';

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
  const konsol = [];
  ws.on('message', (ham) => {
    const m = JSON.parse(ham.toString());
    if (m.id && bekleyen.has(m.id)) { bekleyen.get(m.id)(m); bekleyen.delete(m.id); }
    if (m.method === 'Runtime.exceptionThrown') konsol.push('HATA ' + (m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text));
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') konsol.push('konsol ' + m.params.args.map((a) => a.value ?? a.description ?? '').join(' '));
  });
  const gonder = (method, params = {}) => new Promise((coz) => { const id = ++sira; bekleyen.set(id, coz); ws.send(JSON.stringify({ id, method, params })); });
  const js = async (exp) => {
    const r = await gonder('Runtime.evaluate', { expression: exp, awaitPromise: true, returnByValue: true });
    if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description ?? 'sayfa hatasi');
    return r.result?.result?.value;
  };
  const bekle = async (exp, ms = 15000) => { const son = Date.now() + ms; while (Date.now() < son) { if (await js(exp)) return true; await uyu(150); } throw new Error('zaman asimi: ' + exp); };
  await gonder('Runtime.enable');
  return { ws, gonder, js, bekle, konsol };
}

function tohumla() {
  fs.writeFileSync(path.join(TEST_DIZIN, 'ayarlar.json'), JSON.stringify({ surum: 1, ada: false, kenarAcik: true, yaziBoyutu: 13 }));
  fs.writeFileSync(path.join(TEST_DIZIN, 'usta.json'), JSON.stringify({
    surum: 1, baseUrl: 'https://opencode.ai/inference/go/anthropic', model: 'glm-5.3', hafifModel: 'deepseek-v4.1-flash',
    anahtar: { dpapi: dpapi.sifrele(ANAHTAR), ipucu: ANAHTAR.slice(-4), kaydedildi: new Date(Date.now() - 3600e3).toISOString() },
    modeller: [{ id: 'glm-5.3', ad: 'GLM-5.3' }, { id: 'deepseek-v4.1-flash', ad: 'DeepSeek V4.1 Flash 1017' }, { id: 'kimi-k3.1-pro', ad: 'Kimi K3.1 Pro' }],
    modellerZamani: new Date().toISOString(), dogrulama: { durum: 'gecerli', zaman: new Date(Date.now() - 3600e3).toISOString() },
  }));
  const is = (id, o) => {
    fs.mkdirSync(path.join(TEST_DIZIN, 'usta', 'is', id), { recursive: true });
    fs.writeFileSync(path.join(TEST_DIZIN, 'usta', 'is', id, 'durum.json'), JSON.stringify({ id, durum: 'bitti', ...o }));
  };
  const t = (dk) => new Date(Date.now() - dk * 60e3).toISOString();
  is('1119-2010-aaaa', { baslik: 'Teklif servisine PDF dışa aktarma uç noktası ekle', projeAd: 'Citefield', model: 'glm-5.3', baslangic: t(90), karar: 'kabul',
    turlar: [{ sureSn: 412, ciktiToken: 9100, kabul: [{ komut: 'uv run pytest -q', gecti: true }] }], degisiklik: { dosya: 4, ekleme: 186, silme: 12 } });
  is('1119-2040-bbbb', { baslik: 'Fiyat geçmişi tablosu için migration ve repository katmanı', projeAd: 'Dolum', model: 'deepseek-v4.1-flash', baslangic: t(60), karar: 'duzeltip-kabul',
    turlar: [{ sureSn: 300, ciktiToken: 7000, kabul: [{ komut: 'npm test', gecti: false }] }, { sureSn: 140, ciktiToken: 2100, kabul: [{ komut: 'npm test', gecti: true }] }], degisiklik: { dosya: 3, ekleme: 97, silme: 4 } });
  is('1119-2105-cccc', { baslik: 'Kimlik doğrulama ara katmanını yeniden düzenle', projeAd: 'Citefield', model: 'glm-5.3', baslangic: t(10), karar: null, durum: 'bekliyor',
    turlar: [{ sureSn: 220, ciktiToken: 5000, kabul: [{ komut: 'uv run pytest -q', gecti: false }] }], degisiklik: { dosya: 2, ekleme: 40, silme: 31 } });
}

(async () => {
  tohumla();
  const app = spawn(electronBin, [KOK, '--remote-debugging-port=' + PORT, '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding'], {
    cwd: KOK, stdio: 'ignore',
    env: { ...process.env, KOKPIT_DEV: '0', KOKPIT_TEST_KABUK: '1', KOKPIT_TEST_ADA: '1', KOKPIT_DIZIN: TEST_DIZIN },
  });
  let kod = 0;
  const hata = (m) => { console.log('FAIL ' + m); kod = 1; };
  try {
    let hedefler = [];
    for (let i = 0; i < 80 && !hedefler.some((t) => !t.url.endsWith('#ada')); i++) {
      await uyu(250);
      try { hedefler = (await jsonGetir(`http://127.0.0.1:${PORT}/json`)).filter((t) => t.type === 'page' && !t.url.startsWith('devtools')); } catch { /* bekle */ }
    }
    const anaHedef = hedefler.find((t) => !t.url.endsWith('#ada'));
    if (!anaHedef) throw new Error('ana pencere bulunamadi');
    const ana = await baglan(anaHedef);
    await ana.bekle(`document.readyState === 'complete' && !!document.body.innerText`, 20000);
    await ana.gonder('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: '8', code: 'Digit8', modifiers: 2, windowsVirtualKeyCode: 56 });
    await ana.gonder('Input.dispatchKeyEvent', { type: 'keyUp', key: '8', code: 'Digit8', modifiers: 2, windowsVirtualKeyCode: 56 });
    const BOLUM = `[...document.querySelectorAll('section')].find((s) => s.querySelector('h2')?.textContent.includes('Usta'))`;
    await ana.bekle(`!!(${BOLUM}) && document.body.innerText.includes('Teklif servisine')`, 10000);

    for (const genislik of [900, 1280, 1600]) {
      await ana.gonder('Emulation.setDeviceMetricsOverride', { width: genislik, height: 1000, deviceScaleFactor: 1, mobile: false });
      await uyu(400);
      const olcum = await ana.js(`(() => {
        const b = ${BOLUM}; b.scrollIntoView({ block: 'start' });
        const tasan = [...b.querySelectorAll('*')].filter((e) => { const r = e.getBoundingClientRect(); const br = b.getBoundingClientRect(); return r.width > 0 && (r.right > br.right + 1) && !e.closest('.overflow-x-auto'); }).map((e) => e.tagName + '.' + (e.className?.toString?.() || '').slice(0, 40));
        return { tasan: tasan.slice(0, 5), sayfaYatay: document.documentElement.scrollWidth - document.documentElement.clientWidth };
      })()`);
      console.log(`${genislik}px: bolum disina tasan ${olcum.tasan.length}, sayfa yatay kayma ${olcum.sayfaYatay}`);
      if (olcum.tasan.length) hata(genislik + 'px tasan: ' + olcum.tasan.join(', '));
      if (olcum.sayfaYatay > 0) hata(genislik + 'px sayfa yatay kayiyor');
      await uyu(200);
      const { result } = await ana.gonder('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      const dosya = path.join(CIKTI, `kokpit-usta-${genislik}.png`);
      fs.writeFileSync(dosya, Buffer.from(result.data, 'base64'));
      console.log('  ' + dosya);
    }

    const dom = await ana.js(`document.documentElement.outerHTML`);
    if (dom.includes(ANAHTAR) || dom.includes(ANAHTAR.slice(0, 14))) hata('anahtar DOM\'da gorunuyor');
    else console.log('anahtar DOM\'da yok; ipucu gorunur: ' + dom.includes('••••' + ANAHTAR.slice(-4)));
    const metin = await ana.js(`(${BOLUM}).innerText.replace(/\\s+/g, ' ')`);
    for (const beklenen of ['Kayıtlı ••••', 'Doğrulandı', 'glm-5.3', 'kabul 1', 'düzeltip kabul', 'bekliyor', 'kaldı']) {
      if (!metin.includes(beklenen)) hata('metinde yok: ' + beklenen);
    }

    // Gercek akis: Degistir -> sahte anahtar -> OpenCode reddeder (401), eski anahtar yerinde kalir.
    await ana.gonder('Emulation.setDeviceMetricsOverride', { width: 1280, height: 1000, deviceScaleFactor: 1, mobile: false });
    await ana.js(`(() => { [...(${BOLUM}).querySelectorAll('button')].find((b) => b.textContent.trim() === 'Değiştir').click(); return true; })()`);
    await ana.bekle(`!!(${BOLUM}).querySelector('input[type=password]')`, 3000);
    await ana.js(`(() => { const i = (${BOLUM}).querySelector('input[type=password]'); i.focus(); return true; })()`);
    await ana.gonder('Input.insertText', { text: 'sk-tamamen-sahte-anahtar-000' });
    await ana.js(`(() => { (${BOLUM}).querySelector('form button[type=submit]').click(); return true; })()`);
    await ana.bekle(`!!(${BOLUM}).querySelector('[role=alert]')`, 20000);
    const uyari = await ana.js(`(${BOLUM}).querySelector('[role=alert]').textContent`);
    console.log('sahte anahtar uyarisi: ' + uyari);
    if (!/reddetti/.test(uyari)) hata('beklenen red uyarisi yok');
    const g = await ana.js(`window.kokpit.ustaGetir()`);
    if (g.ipucu !== ANAHTAR.slice(-4)) hata('reddedilen anahtar eskisinin yerine yazildi');
    const { result } = await ana.gonder('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(CIKTI, 'kokpit-usta-red.png'), Buffer.from(result.data, 'base64'));

    for (const k of ana.konsol) hata('konsol: ' + k.slice(0, 300));
    console.log(kod ? 'denetim BASARISIZ' : 'denetim tamam');
  } catch (e) {
    console.error('HATA ' + e.message);
    kod = 1;
  }
  // Yalniz kendi surecimiz, PID ile (baslik/imaj filtresi gercek Kokpit'i de oldurur).
  try { process.kill(app.pid); } catch { /* cikmis */ }
  await new Promise((r) => { app.on('exit', r); setTimeout(r, 8000); });
  try { fs.rmSync(TEST_DIZIN, { recursive: true, force: true }); } catch { /* kilitli olabilir */ }
  process.exit(kod);
})();
