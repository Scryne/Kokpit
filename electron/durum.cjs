const { execFile } = require('child_process');
const { DURUM_SCRIPT, PYTHON, VAULT } = require('./config.cjs');
const { log } = require('./log.cjs');

// Kokpit'in kendi toplayicisi YOK. Tek dogruluk kaynagi durum.py.
// Olculdu: cache'li calisma ~457 ms (09-10); 09-29'da 15 proje + saglik/kapsama ile ~1.6-2.2 sn;
// 10-21'de 22 projede 3-6 sn (git cagrilari sirali) -> durum.py git'i paralel okuyor, ~0.8 sn.
// Asenkron calisir, arayuzu kilitlemez; odak tazelemesi 30 sn'den sik degil -> izleyici gereksiz.
//
// Zaman asimi: takilan bir git (kilitli depo, ag surucusu) Pano'yu sonsuza dek "Okunuyor"da
// birakiyordu; Promise hic cozulmuyordu. Ayni anda gelen istekler tek surece iner (ana pencere
// ve palet ust uste tazeleyince iki Python sureci yarisiyordu).
const ZAMAN_ASIMI_MS = 60_000;
let ucusta = null;

function durumOku() {
  if (ucusta) return ucusta;
  ucusta = calistir().finally(() => {
    ucusta = null;
  });
  return ucusta;
}

function calistir() {
  return new Promise((resolve) => {
    const t0 = Date.now();
    execFile(
      PYTHON,
      [DURUM_SCRIPT, '--json'],
      {
        cwd: VAULT,
        maxBuffer: 32 * 1024 * 1024,
        encoding: 'utf8',
        windowsHide: true,
        timeout: ZAMAN_ASIMI_MS,
        // durum.py stdout'u kendisi utf-8'e ceviriyor; hata yolunda (stderr, traceback) da Turkce
        // karakter bozulmasin (hafiza: Windows alt surec kodlama tuzagi, cp1254).
        env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
      },
      (err, stdout, stderr) => {
        const sure = Date.now() - t0;
        if (err) {
          if (err.killed) err.message = 'durum.py ' + ZAMAN_ASIMI_MS / 1000 + ' sn icinde bitmedi (zaman asimi)';
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
