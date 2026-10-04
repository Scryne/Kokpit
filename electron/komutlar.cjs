// Hizli komutlar: bir oturuma tek tikla gonderilen hazir mesajlar. ~/.kokpit/komutlar.json.
// Kokpit'in KENDI verisi (ayarlar gibi), vault'a yazma degil. Dosya yoksa varsayilanlarla
// olusturulur ki Scryne elle duzenleyebilsin; main yalniz okur, bir daha ustune yazmaz.
//
// Varsayilanlar kanittan (2026-10-04, son 30 gunun 727 prompt'u): "devam et" 10 kez birebir,
// "kaldigimiz yerden devam / neredeyiz / ne kaldi" ~70, "sen karar ver / sence" 65,
// commit/push 20. Metinler Scryne'in kendi kaliplarinin netlestirilmis hali.
const fs = require('fs');
const path = require('path');
const { log } = require('./log.cjs');
const { KOKPIT_DIZIN } = require('./config.cjs');

const DOSYA = path.join(KOKPIT_DIZIN, 'komutlar.json');
const AZAMI = 12;

const VARSAYILAN = [
  { ad: 'Devam et', metin: 'devam et' },
  {
    ad: 'Neredeyiz?',
    metin:
      'Kaldığımız yerden devam ediyoruz. Önce en fazla 5 satırda durumu söyle: ne bitti, ne yarım kaldı, sıradaki adım ne. Sıradaki adıma geçmeden onay bekle.',
  },
  {
    ad: 'Sen karar ver',
    metin: 'En doğru olanı sen seç ve uygula. Seçimini ve gerekçesini tek cümleyle söyle.',
  },
  {
    ad: 'Doğrula',
    metin:
      'Bu oturumda yaptığını urun-dogrulama ile doğrula: ürünü gerçekten çalıştır, kanıtı göster, açık kalanları yaz.',
  },
  { ad: 'Commit', metin: 'Çalışma ağacını gözden geçir ve anlamlı commit(ler) at. Push etme.' },
  {
    ad: 'Özetle',
    metin: 'Bu oturumda ne yaptığını kısa özetle: değişen dosyalar, doğrulama kanıtı, açık kalanlar.',
  },
];

/** Dar sema: ad <= 40, metin <= 2000, tek satir (TUI'de yeni satir gonderimi tetikler). */
function temizle(liste) {
  if (!Array.isArray(liste)) return null;
  const sonuc = [];
  for (const k of liste) {
    if (!k || typeof k.ad !== 'string' || typeof k.metin !== 'string') continue;
    const ad = k.ad.trim().slice(0, 40);
    const metin = k.metin.replace(/\s*[\r\n]+\s*/g, ' ').trim().slice(0, 2000);
    if (ad && metin) sonuc.push({ ad, metin });
    if (sonuc.length >= AZAMI) break;
  }
  return sonuc;
}

function oku() {
  try {
    const ham = JSON.parse(fs.readFileSync(DOSYA, 'utf8'));
    const liste = temizle(Array.isArray(ham) ? ham : ham && ham.komutlar);
    if (liste) return liste;
    log('komutlar.json bicimi tanınmadi, varsayilan kullaniliyor');
  } catch (e) {
    if (e.code === 'ENOENT') {
      try {
        fs.mkdirSync(path.dirname(DOSYA), { recursive: true });
        fs.writeFileSync(DOSYA, JSON.stringify({ surum: 1, komutlar: VARSAYILAN }, null, 2) + '\n', 'utf8');
      } catch (y) {
        log('komutlar.json yazilamadi: ' + y.message);
      }
    } else {
      log('komutlar.json okunamadi, varsayilan: ' + e.message);
    }
  }
  return VARSAYILAN.map((k) => ({ ...k }));
}

module.exports = { oku, temizle, DOSYA, VARSAYILAN };
