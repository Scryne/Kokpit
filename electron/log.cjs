const fs = require('fs');
const path = require('path');
const { LOG_DOSYA } = require('./config.cjs');

fs.mkdirSync(path.dirname(LOG_DOSYA), { recursive: true });

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
