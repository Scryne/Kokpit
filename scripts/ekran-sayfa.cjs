// v4.0 yuzeylerinin ekran goruntusu: Ada'nin sayfalari (medya, odak, liste, takvim, sistem, hava, raf,
// ayarlar), kapali hapta canli gostergeler, minimal hap ve ana penceredeki Ayarlar sayfasi.
// Izole veri dizininde calisir (gercek ~/.kokpit'e dokunmaz). Gercek medya oturumu OKUNMAZ: sahte bir
// yardimci (KOKPIT_MEDYA_YARDIMCI) herkesin bildigi bir parcayi yayinlar (esli sozler gercek agdan gelsin diye). Hava icin gercek ag kullanilir (genel bir
// sehir; ag yoksa sayfa hata halini gosterir, o da bir goruntudur).
// Kullanim: npm run build && node scripts/ekran-sayfa.cjs [cikti-dizini]
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
const TEST_DIZIN = fs.mkdtempSync(path.join(os.tmpdir(), 'kokpit-ekran-sayfa-'));
const uyu = (ms) => new Promise((r) => setTimeout(r, ms));

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

// Sahte medya yardimcisi: protokol electron/medya-yardimci.ps1 ile ayni (satir basina JSON).
const KAPAK_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"><rect width="120" height="120" fill="#2b3340"/><circle cx="60" cy="60" r="34" fill="#8fa3bd"/><circle cx="60" cy="60" r="8" fill="#2b3340"/></svg>';
const YARDIMCI = `
const yaz = (o) => process.stdout.write(JSON.stringify(o) + '\\n');
yaz({ tur: 'hazir' });
const kimlik = 'ornek';
let caliyor = true;
const durum = () => yaz({ tur: 'durum', uygulama: 'Spotify.exe', baslik: 'Bohemian Rhapsody', sanatci: 'Queen', album: 'A Night at the Opera', caliyor, konumMs: 73000, sureMs: 354000, guncelMs: Date.now(), oynat: true, sonraki: true, onceki: true, kapakKimlik: kimlik });
durum();
yaz({ tur: 'kapak', kimlik, mime: 'image/svg+xml', veri: ${JSON.stringify(Buffer.from(KAPAK_SVG).toString('base64'))} });
process.stdin.on('data', (d) => { const k = String(d).trim(); if (k === 'cik') process.exit(0); if (k === 'oynat-duraklat') { caliyor = !caliyor; durum(); } });
process.stdin.on('end', () => process.exit(0));
setInterval(() => {}, 1000);
`;

(async () => {
  const yardimci = path.join(TEST_DIZIN, 'sahte-medya.cjs');
  fs.writeFileSync(yardimci, YARDIMCI);
  const gun = (n) => { const d = new Date(Date.now() + n * 86400000); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  fs.writeFileSync(path.join(TEST_DIZIN, 'ayarlar.json'), JSON.stringify({ surum: 1, ada: true, kenarAcik: true, yaziBoyutu: 13, havaKonum: { ad: 'Ankara', ulke: 'Türkiye', enlem: 39.92, boylam: 32.85 } }));
  fs.writeFileSync(path.join(TEST_DIZIN, 'yapilacaklar.json'), JSON.stringify({ surum: 1, ogeler: [
    { id: 'a00000000001', metin: 'Roadmap v4.0 bölümünü yaz', bitti: false, t: Date.now() - 4000, bittiT: null, tarih: gun(0) },
    { id: 'a00000000002', metin: 'Sunum taslağını gözden geçir', bitti: false, t: Date.now() - 3000, bittiT: null, tarih: gun(1) },
    { id: 'a00000000003', metin: 'Geciken raporu gönder', bitti: false, t: Date.now() - 2000, bittiT: null, tarih: gun(-2) },
    { id: 'a00000000004', metin: 'Tarihsiz bir iş: klavye kısayollarını dene', bitti: false, t: Date.now() - 1000, bittiT: null, tarih: null },
    { id: 'a00000000005', metin: 'Testleri koş', bitti: true, t: Date.now() - 9000, bittiT: Date.now() - 500, tarih: null },
  ] }));
  const rafDizin = path.join(TEST_DIZIN, 'ornek');
  fs.mkdirSync(rafDizin);
  fs.writeFileSync(path.join(rafDizin, 'notlar.md'), '# ornek\n'.repeat(400));
  fs.writeFileSync(path.join(rafDizin, 'veri.csv'), 'a,b\n1,2\n');

  const app = spawn(electronBin, [KOK, '--remote-debugging-port=' + PORT, '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding'], {
    cwd: KOK, stdio: 'ignore',
    env: { ...process.env, KOKPIT_DEV: '0', KOKPIT_TEST_KABUK: '1', KOKPIT_TEST_ADA: '1', KOKPIT_DIZIN: TEST_DIZIN, KOKPIT_MEDYA_YARDIMCI: yardimci },
  });
  let hedefler = [];
  for (let i = 0; i < 60 && hedefler.length < 2; i++) {
    await uyu(250);
    try { hedefler = (await jsonGetir(`http://127.0.0.1:${PORT}/json`)).filter((t) => t.type === 'page' && !t.url.startsWith('devtools')); } catch { /* bekle */ }
  }
  const anaHedef = hedefler.find((t) => !t.url.endsWith('#ada'));
  const adaHedef = hedefler.find((t) => t.url.endsWith('#ada'));
  if (!anaHedef || !adaHedef) throw new Error('hedefler: ' + hedefler.map((t) => t.url).join(', '));
  const ana = await baglan(anaHedef);
  const ada = await baglan(adaHedef);
  let kod = 0;
  const cek = async (s, ad, kirp) => {
    const kutu = kirp ? await s.js(`(() => { const r = document.querySelector('.ada-kart')?.getBoundingClientRect(); return r ? { x: r.x, y: r.y, w: r.width, h: r.height } : null; })()`) : null;
    const { result } = await s.gonder('Page.captureScreenshot', { format: 'png', ...(kutu ? { clip: { x: Math.max(0, kutu.x - 12), y: 0, width: kutu.w + 24, height: kutu.y + kutu.h + 16, scale: 2 } } : {}) });
    const dosya = path.join(CIKTI, 'kokpit-v40-' + ad + '.png');
    fs.writeFileSync(dosya, Buffer.from(result.data, 'base64'));
    return dosya;
  };
  try {
    await ada.bekle(`!!document.querySelector('.ada-kart')`, 20000);
    await ada.js(`(() => { window.kokpit.odakKomut({ tur: 'baslat', asama: 'odak' }); window.kokpit.rafEkle(${JSON.stringify([path.join(rafDizin, 'notlar.md'), path.join(rafDizin, 'veri.csv'), rafDizin])}); window.kokpit.rafBaglanti('https://example.com/ornek/sayfa'); return true; })()`);
    await ada.bekle(`!!document.querySelector('[data-ada-medya]') && !!document.querySelector('[data-ada-odak]')`, 15000);
    await uyu(600);
    console.log('hap: ' + (await ada.js(`document.body.innerText`)).replace(/\s+/g, ' ').slice(0, 200));
    await cek(ada, 'hap', true);

    // Minimal hap: yalniz goz + gostergeler.
    await ada.js(`window.kokpit.adaAyarYaz({ minimal: true }).then(() => true)`);
    await uyu(500);
    await cek(ada, 'hap-minimal', true);
    await ada.js(`window.kokpit.adaAyarYaz({ minimal: false }).then(() => true)`);

    // Kart: imlec ustune gelir, sekmeler sirayla.
    await ada.gonder('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 230, y: 18 });
    await ada.bekle(`!!document.querySelector('[role="tablist"]')`, 5000);
    const sekmeler = await ada.js(`[...document.querySelectorAll('[data-ada-sekme]')].map((b) => b.dataset.adaSekme)`);
    console.log('sekmeler: ' + sekmeler.join(', '));
    for (const k of sekmeler) {
      // Kart imlec ustundeyken acik kalir; gercek imlec baska yerde oldugu icin her adimda yeniden "ustune gelinir".
      const ac = async () => {
        await ada.gonder('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 230, y: 18 });
        await ada.bekle(`!!document.querySelector('[data-ada-sekme="${k}"]')`, 5000);
      };
      await ac();
      await ada.js(`(() => { document.querySelector('[data-ada-sekme="${k}"]').click(); return true; })()`);
      // Hava gercek aga gider; sistem ilk olcumunu 2 sn'de alir.
      await uyu(k === 'hava' ? 4500 : k === 'sistem' ? 5000 : k === 'medya' ? 2500 : 700);
      await ac();
      await uyu(300);
      const tasma = await ada.js(`(() => { const p = document.querySelector('[role="tabpanel"]'); return p ? { yatay: p.scrollWidth - p.clientWidth, dikey: p.scrollHeight - p.clientHeight, metin: p.innerText.replace(/\\s+/g, ' ').slice(0, 220) } : null; })()`);
      console.log(k + ': yatay tasma ' + (tasma?.yatay ?? '?') + ', dikey kayma ' + (tasma?.dikey ?? '?') + ' | ' + (tasma?.metin ?? ''));
      if (tasma && tasma.yatay > 0) { console.log('FAIL ' + k + ' sayfasi yatay tasiyor'); kod = 1; }
      await ac();
      await uyu(120);
      await cek(ada, 'ada-' + k, true);
    }
    await ada.js(`(() => { document.querySelector('[data-ada-sekme="oturum"]').click(); return true; })()`);
    await ada.gonder('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 5, y: 510 });

    // Ana pencere: Ayarlar (Ctrl+8).
    await ana.gonder('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: '8', code: 'Digit8', modifiers: 2, windowsVirtualKeyCode: 56 });
    await ana.gonder('Input.dispatchKeyEvent', { type: 'keyUp', key: '8', code: 'Digit8', modifiers: 2, windowsVirtualKeyCode: 56 });
    await ana.bekle(`!!document.querySelector('section[aria-label="Ada ayarları"]')`, 8000);
    await uyu(500);
    await cek(ana, 'ayarlar', false);

    for (const [ad, s] of [['ada', ada], ['ana', ana]]) {
      for (const k of s.konsol) { console.log('FAIL ' + ad + ' ' + k.slice(0, 300)); kod = 1; }
    }
    console.log('yazildi: ' + CIKTI + ' (kokpit-v40-*.png)');
  } catch (e) {
    console.error('HATA ' + e.message);
    kod = 1;
  }
  const cikis = new Promise((r) => { app.on('exit', r); setTimeout(() => { try { app.kill(); } catch { /* */ } r(); }, 15000); });
  void ana.gonder('Browser.close');
  await cikis;
  try { fs.rmSync(TEST_DIZIN, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 }); } catch { /* temp */ }
  process.exit(kod);
})().catch((e) => { console.error(e); process.exit(1); });
