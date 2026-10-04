// Oturuma gonderme isteginin sekil denetimi (ada -> main -> ana pencere). SAF: Electron yok,
// test-kanca dogrudan sinar. "O soru hala acik mi" karari burada degil, App'te kanca durumuyla
// (damga) verilir; burada yalniz bicim: kimlik, metin tek satir, soru basina tek cevap.

function tekSatir(m, sinir) {
  return typeof m === 'string' ? m.replace(/\s*[\r\n]+\s*/g, ' ').trim().slice(0, sinir) : '';
}

/** @returns istek ya da null (gecersiz: hic gonderilmez) */
function gonderIstegi(ham) {
  if (!ham || typeof ham !== 'object' || typeof ham.id !== 'string' || !/^[\w.-]{1,160}$/.test(ham.id)) return null;
  if (ham.tur === 'metin') {
    const metin = tekSatir(ham.metin, 2000);
    return metin ? { id: ham.id, tur: 'metin', metin } : null;
  }
  // Soru cevabi: soru basina secenek sirasi (0-3) ya da serbest metin. Satir sonu metinde
  // Enter olurdu ve cevabi erken gonderirdi; tek satira indirilir.
  if (ham.tur === 'cevap') {
    if (!Array.isArray(ham.cevaplar) || ham.cevaplar.length < 1 || ham.cevaplar.length > 4 || !Number.isFinite(ham.damga)) return null;
    const cevaplar = [];
    for (const c of ham.cevaplar) {
      if (Number.isInteger(c) && c >= 0 && c <= 3) cevaplar.push(c);
      else if (typeof c === 'string' && tekSatir(c, 1000)) cevaplar.push(tekSatir(c, 1000));
      else return null;
    }
    return { id: ham.id, tur: 'cevap', cevaplar, damga: ham.damga };
  }
  return null;
}

module.exports = { gonderIstegi };
