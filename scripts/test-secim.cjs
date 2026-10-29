// v3.2 secili metni gonder: secim.cjs GERCEK bir uygulamanin (Notepad) secimini Ctrl+Insert ile aliyor ve
// panoyu eski haline getiriyor mu? Electron ana sureci (electron scripts/test-secim.cjs). Gercek panoya ve
// klavyeye dokunur (Notepad'i one getirir): elle calistirilir, CI'da degil. Scryne'in panosu basta her
// turuyle alinir, sonda geri yazilir.
//   npm run test:secim
const { app, clipboard, ClipboardItem } = require('electron');
const { spawn, execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const DIZIN = fs.mkdtempSync(path.join(os.tmpdir(), 'kokpit-secim-'));
process.env.KOKPIT_DIZIN = DIZIN;
const secim = require(path.join(__dirname, '..', 'electron', 'secim.cjs'));
const yakala = require(path.join(__dirname, '..', 'electron', 'yakala.cjs'));
const koffi = require('koffi');

let gecen = 0;
let kalan = 0;
function kontrol(ad, kosul, ayrinti) {
  if (kosul) gecen++;
  else kalan++;
  console.log((kosul ? 'PASS ' : 'FAIL ') + ad + (!kosul && ayrinti ? '\n     ' + ayrinti : ''));
}
const uyu = (ms) => new Promise((r) => setTimeout(r, ms));

app.whenReady().then(async () => {
  const eski = [];
  for (const it of await clipboard.read()) {
    const v = {};
    for (const t of it.types) {
      try {
        v[t] = await it.getType(t);
      } catch {}
    }
    if (Object.keys(v).length) eski.push(v);
  }
  console.log('Scryne panosu yedeklendi: ' + JSON.stringify(eski.map((v) => Object.keys(v))));
  let notepad = null;
  let pencereKapat = null;
  try {
    // Denemeden once panoya bilinen bir icerik (metin + html): geri yazma bunun birebir geldigini sinar.
    await clipboard.write([new ClipboardItem({ 'text/plain': new Blob(['ONCEKI PANO 31'], { type: 'text/plain' }), 'text/html': new Blob(['<b>ONCEKI</b>'], { type: 'text/html' }) })]);
    const dosya = path.join(DIZIN, 'secim-deneme.txt');
    const ICERIK = 'TypeError: x is undefined\n    at App (App.tsx:12:5)\nsatır üç: ğüşıöç';
    fs.writeFileSync(dosya, ICERIK, 'utf8');
    notepad = spawn('notepad.exe', [dosya], { detached: false });
    await uyu(1800);
    const u = koffi.load('user32.dll');
    const bul = u.func('void* __stdcall FindWindowW(str16 cls, str16 name)');
    const one = u.func('int __stdcall SetForegroundWindow(void* h)');
    const keybd = u.func('void __stdcall keybd_event(uint8 bVk, uint8 bScan, uint32 dwFlags, uintptr dwExtraInfo)');
    // YALNIZ deneme dosyasinin penceresi: Scryne'in acik bir Notepad'i varsa ona dokunulmaz (Ctrl+A + kapatma
    // onu bozardi). Yeni acilan pencere on plana gelir; basligi dosya adini tasimali.
    const onPlan = u.func('void* __stdcall GetForegroundWindow()');
    const baslik = u.func('int __stdcall GetWindowTextW(void* h, _Out_ uint16_t* buf, int n)');
    const baslikOku = (x) => {
      const b = new Uint16Array(256);
      const n = baslik(x, b, 256);
      return String.fromCharCode(...b.subarray(0, Math.max(0, n)));
    };
    let h = null;
    for (let i = 0; i < 20 && !h; i++) {
      const aday = onPlan();
      if (aday && baslikOku(aday).includes('secim-deneme')) h = aday;
      else await uyu(150);
    }
    void bul;
    // Windows 11 Notepad tek surec: spawn edilen pid hemen cikar, pencere baska surecte yasar. Pencereye WM_CLOSE.
    const yolla = u.func('int __stdcall PostMessageW(void* h, uint32 m, uintptr w, intptr l)');
    pencereKapat = () => h && yolla(h, 0x10, 0, 0);
    kontrol('Notepad acildi (deneme dosyasinin penceresi)', !!h);
    if (!h) throw new Error('deneme penceresi on planda bulunamadi; baska pencereye dokunulmadi');
    one(h);
    await uyu(400);
    // Ctrl+A: tum metni sec.
    keybd(0x11, 0, 0, 0);
    keybd(0x41, 0, 0, 0);
    keybd(0x41, 0, 2, 0);
    keybd(0x11, 0, 2, 0);
    await uyu(200);
    const olaylar = [];
    yakala.dinle((ekler, neden) => olaylar.push(neden));
    yakala.baslat();
    await uyu(700);
    const t0 = Date.now();
    const r = await secim.kopyala({ sessiz: (ms) => yakala.sessiz(ms) });
    const sure = Date.now() - t0;
    console.log('sonuc: ' + JSON.stringify(r).slice(0, 200) + ' (' + sure + ' ms)');
    kontrol('secim alindi, satir sonlari ve Turkce harfler birebir', r.metin === ICERIK.replace(/\r\n/g, '\n'), JSON.stringify(r));
    kontrol('kaynak pencere basligindan', typeof r.kaynak === 'string' && /secim-deneme/.test(r.kaynak), r.kaynak);
    kontrol('2 sn icinde', sure < 2000, sure + ' ms');
    const sonra = await clipboard.read();
    const metin = await clipboard.readText();
    const html = sonra[0]?.types.includes('text/html') ? await (await sonra[0].getType('text/html')).text() : '';
    kontrol('pano eski haline dondu (metin)', metin === 'ONCEKI PANO 31', metin);
    kontrol('pano eski haline dondu (html bicimi de)', /ONCEKI/.test(html), JSON.stringify(sonra.map((x) => x.types)));
    await uyu(1500);
    kontrol('pano bekcisi geri yazmayi yeni ek saymadi', olaylar.length === 0, JSON.stringify(olaylar));
    // Panoda GORUNTU varken (Scryne'in son ekran goruntusu): secim alinir, goruntu birebir geri gelir.
    const png = fs.readFileSync(path.join(__dirname, '..', 'public', 'kokpit.png'));
    await clipboard.write([new ClipboardItem({ 'image/png': new Blob([png], { type: 'image/png' }) })]);
    await uyu(300);
    keybd(0x11, 0, 0, 0);
    keybd(0x41, 0, 0, 0);
    keybd(0x41, 0, 2, 0);
    keybd(0x11, 0, 2, 0);
    await uyu(200);
    const r2 = await secim.kopyala({ sessiz: (ms) => yakala.sessiz(ms) });
    const goruntuOge = (await clipboard.read()).find((x) => x.types.includes('image/png'));
    const geriPng = goruntuOge ? Buffer.from(await (await goruntuOge.getType('image/png')).arrayBuffer()) : null;
    kontrol('goruntulu pano: secim alindi', r2.metin === ICERIK, JSON.stringify(r2).slice(0, 120));
    kontrol('goruntulu pano: goruntu geri geldi', !!geriPng && geriPng.length > 0, geriPng ? geriPng.length + ' bayt' : 'yok');
    await uyu(1500);
    kontrol('goruntulu pano: bekci geri yazilan goruntuyu yeni ek saymadi', olaylar.length === 0, JSON.stringify(olaylar));
    await clipboard.write([new ClipboardItem({ 'text/plain': new Blob(['ONCEKI PANO 31'], { type: 'text/plain' }) })]);
    // Secim yokken: Notepad'de imleci sona al (secim kalkar), pano degismemeli.
    keybd(0x23, 0, 1, 0);
    keybd(0x23, 0, 3, 0);
    await uyu(150);
    const bos = await secim.kopyala({ sessiz: (ms) => yakala.sessiz(ms) });
    kontrol('secim yokken hata doner, pano dokunulmaz', 'hata' in bos && (await clipboard.readText()) === 'ONCEKI PANO 31', JSON.stringify(bos));
    yakala.durdur();
  } catch (e) {
    kontrol('kosucu', false, e.stack);
  } finally {
    try {
      if (pencereKapat) pencereKapat();
      else if (notepad) execFileSync('taskkill', ['/PID', String(notepad.pid), '/T', '/F'], { stdio: 'ignore' });
    } catch {}
    if (eski.length) await clipboard.write(eski.map((v) => new ClipboardItem(v)));
    else await clipboard.clear();
    console.log('Scryne panosu geri yazildi: ' + JSON.stringify((await clipboard.read()).map((x) => x.types)));
    fs.rmSync(DIZIN, { recursive: true, force: true });
  }
  console.log('\n' + gecen + ' gecti, ' + kalan + ' kaldi');
  if (kalan === 0) console.log('TUMU GECTI');
  app.exit(kalan === 0 ? 0 : 1);
});
