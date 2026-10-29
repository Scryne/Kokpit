// v3.2, secili metni oturuma gonder (Ctrl+Alt+Shift+C): herhangi bir uygulamada secili metin (tarayicidaki
// hata, belge paragrafi, log satirlari) Ada'nin tepsisine duser; hedef oturum secilip gider. Ekran
// yakalamanin metin kardesi.
//
// Nasil: kisayolun tuslari birakilinca on plandaki uygulamaya Ctrl+Insert gonderilir (klasik "kopyala").
// Ctrl+C DEGIL: terminalde (VS Code terminali, Windows Terminal, conhost) secim yoksa Ctrl+C calisan isi
// keser (SIGINT); Ctrl+Insert her yerde yalniz kopyalar (spike 2026-10-30: Notepad'de pano 0 ms'de degisti;
// Chromium, VS Code ve Windows Terminal'in varsayilan kopya tusu). Pano once her turuyle yedeklenir, metin
// okununca geri yazilir: Scryne'in panosu degismez (v3.0 kurali). Kokpit'in kendi penceresi ondeyse tus
// gonderilmez; secim xterm'den alinir (main.cjs).

// electron gec yuklenir: saf yardimcilar test-ada'da duz node'da sinanir.
const electron = () => require('electron');
const { log } = require('./log.cjs');

const VK = { SHIFT: 0x10, CONTROL: 0x11, MENU: 0x12, INSERT: 0x2d, LWIN: 0x5b, RWIN: 0x5c };
const KEYEVENTF_EXTENDEDKEY = 0x1;
const KEYEVENTF_KEYUP = 0x2;
/** Kisayolun tuslari bu kadar surede birakilmazsa vazgecilir (basili Alt+Shift ile Ctrl+Insert baska bir sey olur). */
const BIRAKMA_MS = 2000;
/** Ctrl+Insert'ten sonra panonun degismesi bu kadar beklenir. */
const KOPYA_MS = 1200;
/** Tepsiye giden metin siniri (claude'a yapistirilan blok). */
const AZAMI = 20_000;

let w = null;
let yuklenemedi = false;
function yukle() {
  if (w || yuklenemedi) return w;
  if (process.platform !== 'win32') {
    yuklenemedi = true;
    return null;
  }
  try {
    const koffi = require('koffi');
    const u = koffi.load('user32.dll');
    w = {
      tus: u.func('int16 __stdcall GetAsyncKeyState(int vKey)'),
      keybd: u.func('void __stdcall keybd_event(uint8 bVk, uint8 bScan, uint32 dwFlags, uintptr dwExtraInfo)'),
      sira: u.func('uint32 __stdcall GetClipboardSequenceNumber()'),
      onPlan: u.func('void* __stdcall GetForegroundWindow()'),
      baslik: u.func('int __stdcall GetWindowTextW(void* h, _Out_ uint16_t* buf, int n)'),
      sinif: u.func('int __stdcall GetClassNameW(void* h, _Out_ uint16_t* buf, int n)'),
      adres: (h) => (h ? koffi.address(h) : 0n),
    };
  } catch (e) {
    yuklenemedi = true;
    log('secim: user32 yuklenemedi, secili metin gonderilemez: ' + e.message);
  }
  return w;
}

const uyu = (ms) => new Promise((r) => setTimeout(r, ms));

function metinOku(fn, h) {
  const b = new Uint16Array(512);
  const n = fn(h, b, 512);
  return n > 0 ? String.fromCharCode(...b.subarray(0, n)) : '';
}

/** On plandaki pencere: baslik + sinif + adres (Kokpit'in kendisi mi diye karsilastirmak icin). */
function onPlan() {
  const x = yukle();
  if (!x) return null;
  const h = x.onPlan();
  if (!h) return null;
  return { baslik: metinOku(x.baslik, h), sinif: metinOku(x.sinif, h), adres: x.adres(h) };
}

/**
 * Saf: pencere basligindan kisa kaynak adi. "Hata - Stack Overflow - Google Chrome" -> "Chrome: Hata - Stack
 * Overflow"; "App.tsx - Kokpit - Visual Studio Code" -> "VS Code: App.tsx - Kokpit".
 */
function kaynakAdi(baslik) {
  const b = String(baslik || '').replace(/\s+/g, ' ').trim();
  if (!b) return 'seçim';
  const uygulamalar = [
    [/ [-—] Google Chrome$/, 'Chrome'],
    [/ [-—] (?:Microsoft )?Edge$/, 'Edge'],
    [/ [-—] Mozilla Firefox$/, 'Firefox'],
    [/ [-—] Brave$/, 'Brave'],
    [/ [-—] Visual Studio Code$/, 'VS Code'],
    [/ [-—] Cursor$/, 'Cursor'],
    [/ [-—] Obsidian v[\d.]+$/, 'Obsidian'],
    [/ [-—] Word$/, 'Word'],
  ];
  for (const [k, ad] of uygulamalar) {
    if (k.test(b)) {
      const govde = b.replace(k, '').trim();
      return (ad + ': ' + govde).slice(0, 80);
    }
  }
  return b.slice(0, 80);
}

/** Saf: kopyalanan metni tepsiye hazirlar (satir sonlari korunur, kontrol karakteri atilir, sinirlanir). */
function metniHazirla(ham) {
  const m = String(ham || '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim();
  return m.length > AZAMI ? m.slice(0, AZAMI) + '\n…(kesildi)' : m;
}

async function tuslarBirakildi() {
  const x = yukle();
  const t0 = Date.now();
  while (Date.now() - t0 < BIRAKMA_MS) {
    const basili = [VK.CONTROL, VK.MENU, VK.SHIFT, 0x43, VK.LWIN, VK.RWIN].some((v) => (x.tus(v) & 0x8000) !== 0);
    if (!basili) return true;
    await uyu(20);
  }
  return false;
}

/** Panonun tum ogelerini (her tur) bellege alir; geri yazmak icin. */
async function panoYedegi() {
  const { clipboard } = electron();
  try {
    const ogeler = await clipboard.read();
    const yedek = [];
    for (const oge of ogeler) {
      const kayit = {};
      for (const tur of oge.types) {
        try {
          kayit[tur] = await oge.getType(tur);
        } catch {
          /* okunamayan tur atlanir */
        }
      }
      if (Object.keys(kayit).length) yedek.push(kayit);
    }
    return yedek;
  } catch (e) {
    log('secim: pano yedeklenemedi: ' + e.message);
    return null;
  }
}

async function panoyuGeriYaz(yedek) {
  const { clipboard, ClipboardItem } = electron();
  try {
    if (yedek && yedek.length) await clipboard.write(yedek.map((v) => new ClipboardItem(v)));
    else await clipboard.clear();
  } catch (e) {
    log('secim: pano geri yazilamadi: ' + e.message);
  }
}

/**
 * On plandaki uygulamanin secimini kopyalar ve panoyu eski haline getirir.
 * @param {{ sessiz?: (ms: number) => void }} s sessiz: pano bekcisini kisa sure susturur (geri yazma yeni goruntu sanilmasin)
 * @returns {Promise<{ metin: string, kaynak: string } | { hata: string }>}
 */
async function kopyala(s = {}) {
  const x = yukle();
  if (!x) return { hata: 'Seçim okunamıyor (user32 yok)' };
  const pencere = onPlan();
  if (!(await tuslarBirakildi())) return { hata: 'Tuşları bırak, sonra tekrar dene' };
  s.sessiz?.(KOPYA_MS + 1500);
  const yedek = await panoYedegi();
  const once = x.sira();
  x.keybd(VK.CONTROL, 0, 0, 0);
  x.keybd(VK.INSERT, 0, KEYEVENTF_EXTENDEDKEY, 0);
  x.keybd(VK.INSERT, 0, KEYEVENTF_EXTENDEDKEY | KEYEVENTF_KEYUP, 0);
  x.keybd(VK.CONTROL, 0, KEYEVENTF_KEYUP, 0);
  const t0 = Date.now();
  while (x.sira() === once && Date.now() - t0 < KOPYA_MS) await uyu(15);
  if (x.sira() === once) {
    // Secim yoktu ya da uygulama Ctrl+Insert'i tanimiyor; pano hic degismedi, geri yazmaya gerek yok.
    log('secim: pano degismedi (' + (pencere?.sinif || '?') + ')');
    return { hata: 'Seçili metin bulunamadı' };
  }
  // Uygulama panoya bir an sonra yazmayi bitirir (birden cok bicim): kisa bekle.
  await uyu(60);
  let metin = '';
  try {
    metin = await electron().clipboard.readText();
  } catch (e) {
    log('secim: metin okunamadi: ' + e.message);
  }
  await panoyuGeriYaz(yedek);
  const m = metniHazirla(metin);
  if (!m) return { hata: 'Seçimde metin yok' };
  log('secim: ' + m.length + ' karakter (' + (pencere?.sinif || '?') + ', ' + (Date.now() - t0) + ' ms)');
  return { metin: m, kaynak: kaynakAdi(pencere?.baslik) };
}

module.exports = { kopyala, onPlan, kaynakAdi, metniHazirla, AZAMI };
