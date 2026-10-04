// Kokpit'in KENDI ayarlari: pencere, kenar cubugu, yazi boyutu. ~/.kokpit/ayarlar.json.
// Bu vault'a yazma degil; Kokpit'in calisma durumu. Tek yazar main surecidir, renderer
// IPC ile okur/yamalar. Yazim atomik (gecici dosya + rename): yarim JSON kalmaz.
const fs = require('fs');
const path = require('path');
const { log } = require('./log.cjs');
const { KOKPIT_DIZIN } = require('./config.cjs');

const DOSYA = path.join(KOKPIT_DIZIN, 'ayarlar.json');

const VARSAYILAN = Object.freeze({
  surum: 1,
  pencere: null, // { x, y, width, height, maksimize }
  kenarAcik: true,
  yaziBoyutu: 13,
  arsivAcik: false, // proje listelerinde arsiv grubu (olduğu gibi / donduruldu / birakildi)
  ada: true, // ust ortadaki ada
  adaHep: true, // v2.6: ada Kokpit ondeyken ve oturum yokken de gorunur
  tepsi: true, // v2.6: pencerenin X'i tepsiye indirir, cikis tepsi menusunden
  tepsiBildirildi: false, // "tepside calisiyor" balonu bir kez
  // acilistaBaslat: bilerek varsayilansiz. Yoksa ilk calisma kaydi acar (main.cjs tepsiKur).
  seffaf: true, // akrilik pencere; false -> opak (Windows 11 22H2 alti zaten opak)
});

let bellek = null;

function oku() {
  if (bellek) return bellek;
  try {
    const ham = JSON.parse(fs.readFileSync(DOSYA, 'utf8'));
    bellek = { ...VARSAYILAN, ...(ham && typeof ham === 'object' ? ham : {}) };
  } catch (e) {
    if (e.code !== 'ENOENT') log('ayarlar okunamadi, varsayilan: ' + e.message);
    bellek = { ...VARSAYILAN };
  }
  return bellek;
}

function yaz(yama) {
  const yeni = { ...oku(), ...yama, surum: VARSAYILAN.surum };
  bellek = yeni;
  try {
    fs.mkdirSync(path.dirname(DOSYA), { recursive: true });
    const gecici = DOSYA + '.' + process.pid + '.tmp';
    fs.writeFileSync(gecici, JSON.stringify(yeni, null, 2) + '\n', 'utf8');
    fs.renameSync(gecici, DOSYA);
  } catch (e) {
    log('ayarlar yazilamadi: ' + e.message);
  }
  return yeni;
}

/** Renderer'dan gelen yamayi dar bir sema ile suzer; rastgele anahtar diske inmez. */
function rendererYamasi(ham) {
  const yama = {};
  if (!ham || typeof ham !== 'object') return yama;
  if (typeof ham.kenarAcik === 'boolean') yama.kenarAcik = ham.kenarAcik;
  if (typeof ham.arsivAcik === 'boolean') yama.arsivAcik = ham.arsivAcik;
  if (Number.isInteger(ham.yaziBoyutu) && ham.yaziBoyutu >= 9 && ham.yaziBoyutu <= 28) {
    yama.yaziBoyutu = ham.yaziBoyutu;
  }
  return yama;
}

module.exports = { oku, yaz, rendererYamasi, DOSYA };
