// "Geri doldur": beyne dusmemis TEK bir oturumu vault'un kendi betigiyle gunluge dusurur.
//
// Kokpit burada vault'a YAZMAZ (README kurali 5): yazan vault'un flush zinciridir
// (flush_kapsama.py --oturum -> flush.py, oturum basina kilitli). Kokpit yalniz tetikler,
// tipki SessionEnd hook'unun yaptigi gibi. Korumalar:
//   - yalniz tek oturum (--doldur degil: o, dizindeki acik oturumlari da doldururdu)
//   - betik son 30 dk'da yazilmis transcript'i reddeder (acik oturum olabilir)
//   - renderer, Kokpit'te o klasorde acik oturum varken dugmeyi kapatir
//   - ayni anda tek doldurma (her biri bir model cagrisi, ~1 dk)
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const { VAULT, PYTHON } = require('./config.cjs');
const { log } = require('./log.cjs');

const BETIK = path.join(VAULT, '.claude', 'scripts', 'flush_kapsama.py');
const PROJELER = path.join(path.dirname(VAULT), 'Projeler');
const ZAMAN_ASIMI_MS = 11 * 60 * 1000; // betigin kendi siniri 10 dk

let kuyruk = Promise.resolve();

function gecerliMi(session, proje) {
  if (typeof session !== 'string' || !/^[0-9a-f-]{8,64}$/i.test(session)) return false;
  if (proje === 'vault') return true;
  if (typeof proje !== 'string' || !/^[A-Za-z0-9._-]+$/.test(proje)) return false;
  try {
    return fs.statSync(path.join(PROJELER, proje)).isDirectory();
  } catch {
    return false;
  }
}

function calistir(session, proje) {
  return new Promise((coz) => {
    const argumanlar = [BETIK, '--oturum', session];
    if (proje !== 'vault') argumanlar.push('--proje', proje);
    const t0 = Date.now();
    execFile(
      PYTHON,
      argumanlar,
      {
        cwd: VAULT,
        timeout: ZAMAN_ASIMI_MS,
        windowsHide: true,
        encoding: 'utf8',
        env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
      },
      (hata, stdout, stderr) => {
        const satir = String(stdout || '')
          .split(/\r?\n/)
          .reverse()
          .find((s) => s.startsWith('sonuc: '));
        const sonuc = satir ? satir.slice(7).trim() : 'hata:' + (hata ? hata.message.split(/\r?\n/)[0] : 'cikti-yok');
        log(`geri doldurma ${session.slice(0, 8)} (${proje}) -> ${sonuc} (${Date.now() - t0} ms)`);
        if (hata && stderr) log('geri doldurma stderr: ' + String(stderr).slice(0, 600));
        coz({ sonuc, tamam: sonuc.startsWith('ok') });
      }
    );
  });
}

/** Kuyruga ekler; sirasi gelince calisir. */
function doldur(session, proje) {
  if (!gecerliMi(session, proje)) return Promise.resolve({ sonuc: 'red:gecersiz', tamam: false });
  const is = kuyruk.then(() => calistir(session, proje));
  kuyruk = is.catch(() => {});
  return is;
}

module.exports = { doldur };
