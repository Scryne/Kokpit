// Calistir tarifi: bir projenin "uygulamayi ac" komutu. Kokpit bu komutu projenin yaninda bir
// SERVIS bolmesinde (claude degil, duz pwsh) calistirir, adresini yakalar, kapatinca surec
// agacini oldurur.
//
// Kanit (2026-10-04, 30 gunluk prompt gecmisi): "nasil calistiririm / acarim" 29 kez; Kokpit'in
// kendisi 7 kez elle `! cd ... && npm start` ile acilmis. Hayalet port tuzagi (hafiza): arka
// planda baslatilip oldurulen sunucu portu tutmaya devam ediyordu -> agac oldurme sart.
//
// Kaynak sirasi:
//   1. ~/.kokpit/calistir.json  { "<klasor yolu>": "komut" } — Scryne'in ya da claude'un
//      (calistir skill'i) yazdigi tarif. Kokpit'in kendi verisi; projeye dosya eklenmez.
//   2. package.json scripts: dev > start.
//   Bulunamazsa null: arayuz komutu bir kez sorar ve buraya yazar. Python projelerinde
//   (uvicorn modulu, compose) tahmin YAPILMAZ: yanlis komut, komut olmamasindan kotudur.
const fs = require('fs');
const path = require('path');
const { log } = require('./log.cjs');
const { KOKPIT_DIZIN } = require('./config.cjs');

const DOSYA = path.join(KOKPIT_DIZIN, 'calistir.json');
const KOK = path.resolve(path.join(__dirname, '..'));
const AZAMI_UZUNLUK = 500;

/** Windows'ta yol karsilastirmasi buyuk/kucuk harf ve ayirici bagimsiz. */
function anahtar(yol) {
  return path.resolve(String(yol)).toLowerCase();
}

function kayitlar() {
  try {
    const ham = JSON.parse(fs.readFileSync(DOSYA, 'utf8'));
    return ham && typeof ham === 'object' && !Array.isArray(ham) ? ham : {};
  } catch (e) {
    if (e.code !== 'ENOENT') log('calistir.json okunamadi: ' + e.message);
    return {};
  }
}

/** Tek satir, bos degil, sinirli: komut pwsh -Command'a tek arguman olarak gider. */
function komutTemizle(komut) {
  if (typeof komut !== 'string') return null;
  const k = komut.replace(/\s*[\r\n]+\s*/g, ' ').trim();
  return k && k.length <= AZAMI_UZUNLUK ? k : null;
}

/**
 * @returns {{ komut: string, kaynak: 'ayar' | 'package.json' } | { komut: null, neden: string }}
 */
function tarif(yol) {
  if (typeof yol !== 'string' || !yol) return { komut: null, neden: 'Klasör yok' };
  const kayit = kayitlar();
  for (const [k, v] of Object.entries(kayit)) {
    if (anahtar(k) === anahtar(yol)) {
      const komut = komutTemizle(v);
      if (komut) return { komut, kaynak: 'ayar' };
    }
  }
  // Kokpit'in kendisi: "npm start" ikinci bir Kokpit acar (tek ornek kilidi onu kapatir).
  if (anahtar(yol) === anahtar(KOK)) return { komut: null, neden: 'Kokpit zaten açık', kendisi: true };
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(yol, 'package.json'), 'utf8'));
    const s = pkg && pkg.scripts ? pkg.scripts : {};
    if (typeof s.dev === 'string') return { komut: 'npm run dev', kaynak: 'package.json' };
    if (typeof s.start === 'string') return { komut: 'npm start', kaynak: 'package.json' };
  } catch {
    /* package.json yok ya da bozuk */
  }
  return { komut: null, neden: 'Çalıştırma komutu bulunamadı' };
}

/** Tarifi kaydeder (Kokpit'in kendi dosyasi, atomik). Gecersiz girdi -> false. */
function kaydet(yol, komut) {
  const k = komutTemizle(komut);
  if (!k || typeof yol !== 'string') return false;
  try {
    if (!fs.statSync(yol).isDirectory()) return false;
  } catch {
    return false;
  }
  const kayit = kayitlar();
  for (const eski of Object.keys(kayit)) if (anahtar(eski) === anahtar(yol)) delete kayit[eski];
  kayit[path.resolve(yol)] = k;
  try {
    fs.mkdirSync(path.dirname(DOSYA), { recursive: true });
    const gecici = DOSYA + '.' + process.pid + '.tmp';
    fs.writeFileSync(gecici, JSON.stringify(kayit, null, 2) + '\n', 'utf8');
    fs.renameSync(gecici, DOSYA);
    log('calistir tarifi kaydedildi: ' + path.basename(yol) + ' -> ' + k);
    return true;
  } catch (e) {
    log('calistir.json yazilamadi: ' + e.message);
    return false;
  }
}

module.exports = { tarif, kaydet, komutTemizle, DOSYA };
