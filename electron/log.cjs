const fs = require('fs');
const path = require('path');
const { LOG_DOSYA } = require('./config.cjs');

fs.mkdirSync(path.dirname(LOG_DOSYA), { recursive: true });

/** Log sinirsiz buyumesin: acilista esigi gecen dosya `.1`'e devredilir (tek kusak). */
const DEVIR_ESIGI = 2 * 1024 * 1024;
function logDevret(dosya) {
  try {
    if (fs.statSync(dosya).size > DEVIR_ESIGI) fs.renameSync(dosya, dosya + '.1');
  } catch { /* dosya yok ya da kilitli: sonraki acilista */ }
}
logDevret(LOG_DOSYA);
logDevret(path.join(path.dirname(LOG_DOSYA), 'pty-server.log'));

// Teshis kablosu: spike'ta iki sessiz hata sinifi cikti, ucuncusune hazirlikli olunuyor.
function log(mesaj) {
  const satir = `[${new Date().toISOString()}] ${mesaj}`;
  console.log(satir);
  try { fs.appendFileSync(LOG_DOSYA, satir + '\n'); } catch { /* log yazamamak uygulamayi durdurmaz */ }
}

function logHata(baglam, err) {
  log(`HATA ${baglam}: ${err && err.stack ? err.stack : err}`);
}

module.exports = { log, logHata, LOG_DOSYA };
