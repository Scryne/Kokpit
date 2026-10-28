// v3.0, ekran yakalama ve Ada'ya birakma: oturuma gidecek "ekler" (goruntu ya da dosya yolu).
//
// Neden: 10-04..28 arasi 1.184 prompt'un 197'si ekran goruntusu tasiyordu (Matbaa 82, ScryneOS 61);
// akis Win+Shift+S -> Kokpit'e gec -> yapistir. Burada pano izlenir: panoya yeni bir goruntu dusunce
// (Win+Shift+S, Ctrl+Alt+Shift+S ya da herhangi bir "goruntuyu kopyala") PNG olarak
// `~/.kokpit/goruntu/` altina yazilir ve Ada'ya teklif edilir. Scryne hedef oturumu secer.
//
// Oturuma nasil gider (spike 2026-10-29, gercek claude 2.1.312): goruntunun YOLU bracketed paste ile
// yazilinca claude girdide `[Image #1]` dogurur ve model goruntuyu gorur. Panoya yazmak gerekmez:
// Scryne'in panosu degismez.
//
// Pano bekcisi: `GetClipboardSequenceNumber` (user32, koffi) panonun her degisiminde artar; 600 ms
// yoklamada yalniz sayi okunur (~µs). Sayi degisince bicimlere bakilir, goruntu varsa okunur.
// Acilista mevcut pano teklif edilmez (yalniz sonradan gelen).
//
// Ekler bellekte bir kayitta (kimlik -> yol). Renderer yol gondermez: Ada kimlik secer, main yolu
// buradan cozer. Birakilan dosyalar da (Faz 39) ayni kayda girer; yol main'de denetlenir.

// electron gec yuklenir: saf yardimcilar (dosyaUygun) test-ada'da duz node'da sinanir.
const electron = () => require('electron');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { KOKPIT_DIZIN } = require('./config.cjs');
const { log } = require('./log.cjs');

const DIZIN = path.join(KOKPIT_DIZIN, 'goruntu');
const YOKLAMA_MS = 600;
/** Yakalamalar bu kadar gun sonra silinir (claude transcript'i yolu tutar; dosya o oturum icin yeter). */
const SAKLAMA_GUN = 7;
/** Ada'daki tepside en fazla bu kadar ek; fazlasi en eskiyi duser. */
const EK_SINIRI = 8;
/** Ekler bu kadar sure sonra tepsiden duser (dosya diskte kalir). */
const EK_OMRU_MS = 30 * 60 * 1000;
const ONIZLEME_GENISLIK = 176;
const GORUNTU_UZANTI = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp']);

let win32 = null;
let yuklenemedi = false;
let zamanlayici = null;
let sonSira = null;
let sonOzet = null;
let okunuyor = false; // pano okumasi asenkron: biri bitmeden digeri baslamaz
let dinleyici = (_ekler, _neden) => {};
/** @type {Map<string, { id: string, tur: 'goruntu' | 'dosya', yol: string, ad: string, onizleme: string | null, t: number }>} */
const ekler = new Map();

function yukle() {
  if (win32 || yuklenemedi) return win32;
  if (process.platform !== 'win32') {
    yuklenemedi = true;
    return null;
  }
  try {
    const koffi = require('koffi');
    const u = koffi.load('user32.dll');
    win32 = { sira: u.func('uint32 __stdcall GetClipboardSequenceNumber()') };
  } catch (e) {
    yuklenemedi = true;
    log('pano bekcisi kurulamadi (ekran yakalama Ada\'ya dusmeyecek): ' + e.message);
  }
  return win32;
}

/** Saf: bir yol oturuma eklenebilir mi (var, normal dosya, makul boyut). Klasor ve aygit yolu degil. */
function dosyaUygun(yol, stat) {
  if (typeof yol !== 'string' || !path.isAbsolute(yol) || yol.length > 1024) return false;
  if (/[\r\n\u0000-\u001f]/.test(yol)) return false;
  return !!stat && stat.isFile() && stat.size > 0 && stat.size <= 64 * 1024 * 1024;
}

function goruntuMu(yol) {
  return GORUNTU_UZANTI.has(path.extname(yol).toLowerCase());
}

/** Ada'ya giden liste: yol GITMEZ (renderer kimlikle secer), ad ve onizleme gider. */
function liste() {
  const simdi = Date.now();
  for (const [k, e] of ekler) if (simdi - e.t > EK_OMRU_MS) ekler.delete(k);
  return [...ekler.values()].map(({ id, tur, ad, onizleme, t }) => ({ id, tur, ad, onizleme, t }));
}

function ekle(ek, neden) {
  ekler.set(ek.id, ek);
  while (ekler.size > EK_SINIRI) ekler.delete(ekler.keys().next().value);
  dinleyici(liste(), neden);
}

function onizlemeUret(img) {
  try {
    const { width } = img.getSize();
    const k = width > ONIZLEME_GENISLIK ? img.resize({ width: ONIZLEME_GENISLIK, quality: 'good' }) : img;
    return k.toDataURL();
  } catch {
    return null;
  }
}

/**
 * Electron 44'un pano API'si W3C bicimli ve asenkron: `has(mime)`, `read()` -> ClipboardItem, `getType()` ->
 * Blob. Eski `availableFormats`/`readImage` YOK (olculdu 2026-10-29: 44.9.3'te clipboard'un anahtarlari
 * clear, has, readText, writeText, read, write). Yazilan PNG 1 ms'de okundu.
 */
async function panoyuOku() {
  const { clipboard, nativeImage } = electron();
  if (!(await clipboard.has('image/png'))) return;
  const oge = (await clipboard.read()).find((x) => x.types.includes('image/png'));
  if (!oge) return;
  const png = Buffer.from(await (await oge.getType('image/png')).arrayBuffer());
  if (png.length === 0 || png.length > 32 * 1024 * 1024) return;
  const img = nativeImage.createFromBuffer(png);
  if (img.isEmpty()) return;
  const ozet = crypto.createHash('sha1').update(png).digest('hex');
  // Ayni goruntu tekrar kopyalandiysa (ya da baska bir bicimle birlikte yeniden yazildiysa) yeni ek yok.
  if (ozet === sonOzet) return;
  sonOzet = ozet;
  fs.mkdirSync(DIZIN, { recursive: true });
  const ad = 'yakala-' + new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19) + '.png';
  const yol = path.join(DIZIN, ad);
  fs.writeFileSync(yol, png);
  const { width, height } = img.getSize();
  log('yakala: panodan goruntu ' + width + 'x' + height + ' -> ' + ad);
  ekle({ id: ozet.slice(0, 12), tur: 'goruntu', yol, ad, onizleme: onizlemeUret(img), t: Date.now() }, 'pano');
}

function yokla() {
  const w = yukle();
  if (!w) return;
  let n;
  try {
    n = w.sira();
  } catch {
    return;
  }
  if (n === sonSira || okunuyor) return;
  sonSira = n;
  okunuyor = true;
  panoyuOku()
    .catch((e) => log('yakala: pano okunamadi: ' + e.message))
    .finally(() => {
      okunuyor = false;
    });
}

/** 7 gunden eski yakalamalari siler; yalniz bu dizindeki `yakala-*.png`. */
function temizle(simdi = Date.now()) {
  let silinen = 0;
  try {
    for (const ad of fs.readdirSync(DIZIN)) {
      if (!/^yakala-.*\.png$/.test(ad)) continue;
      const yol = path.join(DIZIN, ad);
      const st = fs.statSync(yol);
      if (simdi - st.mtimeMs > SAKLAMA_GUN * 86400000) {
        fs.rmSync(yol, { force: true });
        silinen++;
      }
    }
  } catch {
    // dizin yok: silinecek bir sey yok
  }
  if (silinen) log('yakala: ' + silinen + ' eski goruntu silindi');
}

module.exports = {
  DIZIN,
  dosyaUygun,
  goruntuMu,
  /**
   * Ek kaydinin dinleyicisi: birakma ve silme pano bekcisinden bagimsiz calisir (test kosucusunda bekci
   * kapali ama Ada'ya birakma sinanir).
   * @param {(ekler: object[], neden: 'pano' | 'birak' | 'sil') => void} onDegisim
   */
  dinle(onDegisim) {
    dinleyici = onDegisim;
  },
  /** Pano bekcisi (gercek panoyu izler). */
  baslat() {
    const w = yukle();
    if (!w || zamanlayici) return;
    try {
      sonSira = w.sira(); // acilistaki pano teklif edilmez
    } catch {
      sonSira = null;
    }
    temizle();
    zamanlayici = setInterval(yokla, YOKLAMA_MS);
    setInterval(() => temizle(), 6 * 3600 * 1000).unref?.();
    log('yakala: pano bekcisi kuruldu');
  },
  durdur() {
    if (zamanlayici) clearInterval(zamanlayici);
    zamanlayici = null;
  },
  liste,
  /** Ada'ya birakilan dosyalar. Denetlenmeyen yol kayda girmez. @returns eklenen sayisi */
  birak(yollar) {
    let n = 0;
    for (const yol of Array.isArray(yollar) ? yollar.slice(0, EK_SINIRI) : []) {
      let st = null;
      try {
        st = fs.statSync(yol);
      } catch {
        st = null;
      }
      if (!dosyaUygun(yol, st)) {
        log('yakala: birakilan yol reddedildi');
        continue;
      }
      const goruntu = goruntuMu(yol);
      let onizleme = null;
      if (goruntu) {
        try {
          onizleme = onizlemeUret(electron().nativeImage.createFromPath(yol));
        } catch {
          onizleme = null;
        }
      }
      const id = crypto.createHash('sha1').update(yol + ':' + st.mtimeMs).digest('hex').slice(0, 12);
      ekler.set(id, { id, tur: goruntu ? 'goruntu' : 'dosya', yol, ad: path.basename(yol), onizleme, t: Date.now() });
      n++;
    }
    while (ekler.size > EK_SINIRI) ekler.delete(ekler.keys().next().value);
    if (n) dinleyici(liste(), 'birak');
    return n;
  },
  /** Kimliklerden yollar; bilinmeyen kimlik atlanir. Silinmis dosya da atlanir. */
  yollar(kimlikler) {
    const sonuc = [];
    for (const k of Array.isArray(kimlikler) ? kimlikler : []) {
      const e = ekler.get(k);
      if (e && fs.existsSync(e.yol)) sonuc.push(e.yol);
    }
    return sonuc;
  },
  /** Tepsiden dusur (gonderildi ya da Scryne vazgecti). Dosya diskte kalir. */
  sil(kimlikler) {
    let degisti = false;
    for (const k of kimlikler === 'hepsi' ? [...ekler.keys()] : Array.isArray(kimlikler) ? kimlikler : []) {
      degisti = ekler.delete(k) || degisti;
    }
    if (degisti) dinleyici(liste(), 'sil');
  },
};
