// Electron main tarafi: PTY sunucusunu cocuk surec olarak yonetir.
// Yasam dongusu tek yerde toplanir ki "yetim surec" sorusunun tek bir cevabi olsun.

const { spawn } = require('child_process');
const crypto = require('crypto');
const path = require('path');
const { log, logHata } = require('./log.cjs');

const SUNUCU = path.join(__dirname, 'pty-server.cjs');
const HAZIR_ZAMAN_ASIMI_MS = 15_000;

let cocuk = null;
let bilgi = null; // { port, token }
let baslatmaSozu = null;

function baslat() {
  if (baslatmaSozu) return baslatmaSozu;

  baslatmaSozu = new Promise((resolve, reject) => {
    const token = crypto.randomBytes(32).toString('hex');

    // ONEMLI: process.execPath (Electron) DEGIL, PATH'teki duz node.
    // node-pty boylece Electron'un ABI'sini gormez -> electron-rebuild gerekmez.
    cocuk = spawn('node', [SUNUCU], {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
      env: { ...process.env, KOKPIT_PTY_TOKEN: token },
    });

    log('pty sunucusu baslatildi pid=' + cocuk.pid);

    let tampon = '';
    let cozuldu = false;

    cocuk.stdout.setEncoding('utf8');
    cocuk.stdout.on('data', (d) => {
      tampon += d;
      const satir = tampon.split('\n').find((s) => s.includes('"hazir"'));
      if (!satir || cozuldu) return;
      cozuldu = true;
      try {
        const m = JSON.parse(satir);
        if (!m.hazir) throw new Error(m.hata || 'sunucu hazir degil');
        bilgi = { port: m.port, token };
        log('pty sunucusu hazir port=' + m.port);
        resolve(bilgi);
      } catch (e) {
        logHata('pty sunucusu hazir mesaji cozulemedi', e);
        reject(e);
      }
    });

    cocuk.stderr.setEncoding('utf8');
    cocuk.stderr.on('data', (d) => log('pty sunucusu stderr: ' + d.trim()));

    cocuk.on('exit', (kod, sinyal) => {
      log(`pty sunucusu cikti kod=${kod} sinyal=${sinyal}`);
      cocuk = null;
      bilgi = null;
      baslatmaSozu = null;
      if (!cozuldu) { cozuldu = true; reject(new Error('pty sunucusu hazir olmadan cikti')); }
    });

    cocuk.on('error', (e) => {
      logHata('pty sunucusu spawn', e);
      if (!cozuldu) { cozuldu = true; reject(e); }
    });

    setTimeout(() => {
      if (cozuldu) return;
      cozuldu = true;
      // Hazir olmayan sureci birakmak yetim demek; bir sonraki baslat() ikincisini acardi.
      const asili = cocuk;
      if (asili) {
        log('pty sunucusu zaman asimi, oldurluyor pid=' + asili.pid);
        try { asili.kill(); } catch { /* zaten olmus */ }
      }
      reject(new Error('pty sunucusu ' + HAZIR_ZAMAN_ASIMI_MS + ' ms icinde hazir olmadi'));
    }, HAZIR_ZAMAN_ASIMI_MS);
  }).catch((e) => {
    baslatmaSozu = null;
    throw e;
  });

  return baslatmaSozu;
}

// Yetim birakmama: once stdin'i kapat (sunucu bunu gorup temiz cikar),
// takilirsa kill. Faz 0'da olculdu: stdin kapanisi yeterli.
function durdur() {
  if (!cocuk) return;
  const p = cocuk;
  log('pty sunucusu durduruluyor pid=' + p.pid);
  try { p.stdin.end(); } catch { /* zaten kapali */ }
  setTimeout(() => {
    if (p.exitCode === null) {
      log('pty sunucusu temiz cikmadi, kill');
      try { p.kill(); } catch { /* zaten olmus */ }
    }
  }, 1500);
  cocuk = null;
  bilgi = null;
  baslatmaSozu = null;
}

module.exports = { baslat, durdur, mevcutBilgi: () => bilgi };
