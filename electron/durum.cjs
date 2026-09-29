const { execFile } = require('child_process');
const { DURUM_SCRIPT, PYTHON, VAULT } = require('./config.cjs');
const { log } = require('./log.cjs');

// Kokpit'in kendi toplayicisi YOK. Tek dogruluk kaynagi durum.py.
// Olculdu: cache'li calisma ~457 ms (09-10); 09-29'da 15 proje + saglik/kapsama ile ~1.6-2.2 sn.
// Asenkron calisir, arayuzu kilitlemez; odak tazelemesi 30 sn'den sik degil -> izleyici gereksiz.
function durumOku() {
  return new Promise((resolve) => {
    const t0 = Date.now();
    execFile(
      PYTHON,
      [DURUM_SCRIPT, '--json'],
      { cwd: VAULT, maxBuffer: 32 * 1024 * 1024, encoding: 'utf8', windowsHide: true },
      (err, stdout, stderr) => {
        const sure = Date.now() - t0;
        if (err) {
          log(`durum.py basarisiz (${sure} ms): ${err.message}`);
          if (stderr) log(`durum.py stderr: ${String(stderr).slice(0, 800)}`);
          return resolve({ hata: err.message, stderr: String(stderr || '').slice(0, 2000) });
        }
        try {
          const veri = JSON.parse(stdout);
          log(`durum.py okundu (${sure} ms, ${veri.projeler ? veri.projeler.length : 0} proje)`);
          resolve({ veri });
        } catch (e) {
          log(`durum.py JSON cozulemedi: ${e.message}`);
          resolve({ hata: 'JSON cozulemedi: ' + e.message, ham: String(stdout).slice(0, 2000) });
        }
      }
    );
  });
}

module.exports = { durumOku };
