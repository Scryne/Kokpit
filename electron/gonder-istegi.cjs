// Oturuma metin gonderme isteginin sekil denetimi (gece gorevi -> main -> ana pencere). SAF:
// Electron yok, test-kanca dogrudan sinar. Burada yalniz bicim: kimlik ve metnin tek satira
// indirilmesi.

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
  return null;
}

module.exports = { gonderIstegi };
