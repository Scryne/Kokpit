const fs = require('fs');
const path = require('path');
const { LOG_DOSYA } = require('./config.cjs');

fs.mkdirSync(path.dirname(LOG_DOSYA), { recursive: true });

/**
 * Log sinirsiz buyumesin: esigi gecen dosya `.1`'e devredilir (tek kusak). Acilista ve calisirken
 * her DEVIR_YAZIM satirda bir bakilir: Kokpit v2.6'dan beri Windows acilisinda baslayip gunlerce
 * acik kaliyor, yalniz acilista bakmak yetmiyordu. Her yazim dosyayi acip kapattigi icin (append)
 * calisirken yeniden adlandirmak guvenli.
 */
const DEVIR_ESIGI = 2 * 1024 * 1024;
const DEVIR_YAZIM = 500;
let yazim = 0;
function logDevret(dosya) {
  try {
    if (fs.statSync(dosya).size > DEVIR_ESIGI) fs.renameSync(dosya, dosya + '.1');
  } catch { /* dosya yok ya da kilitli: sonraki acilista */ }
}
process.stdout.on?.('error', () => {});
logDevret(LOG_DOSYA);
logDevret(path.join(path.dirname(LOG_DOSYA), 'pty-server.log'));

// Teshis kablosu: spike'ta iki sessiz hata sinifi cikti, ucuncusune hazirlikli olunuyor.
function log(mesaj) {
  const satir = `[${new Date().toISOString()}] ${mesaj}`;
  // stdout kapali bir boruysa (baslatan terminal kapandi) console.log EPIPE atar; o hata da log'a gelip
  // ayni hatayi tekrar uretirdi.
  try {
    console.log(satir);
  } catch {
    /* stdout yok */
  }
  try { fs.appendFileSync(LOG_DOSYA, satir + '\n'); } catch { /* log yazamamak uygulamayi durdurmaz */ }
  if (++yazim % DEVIR_YAZIM === 0) logDevret(LOG_DOSYA);
}

function logHata(baglam, err) {
  log(`HATA ${baglam}: ${err && err.stack ? err.stack : err}`);
}

module.exports = { log, logHata, LOG_DOSYA };
