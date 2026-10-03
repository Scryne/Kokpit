// Kokpit oturumlarinin statusline komutu (kanca.cjs'in yazdigi --settings json'u cagirir).
// Duz `node` ile calisir, Electron'suz. Iki is yapar, ikisi paralel:
//   1. Claude Code'un verdigi JSON'u Kokpit'e iletir (limitler, baglam). 300 ms'de cevap
//      gelmezse vazgecer: statusline'i Kokpit yuzunden asla geciktirmez.
//   2. Kullanicinin kendi statusline komutunu ayni girdiyle calistirir, ciktisini aynen basar.
//      Komut yoksa hicbir sey basmaz. Kokpit'in icinde durum satiri disaridakiyle ayni kalir.

const http = require('http');
const { spawn } = require('child_process');

const ILETIM_SINIRI_MS = 300;

function girdiOku() {
  return new Promise((coz) => {
    const parcalar = [];
    process.stdin.on('data', (p) => parcalar.push(p));
    process.stdin.on('end', () => coz(Buffer.concat(parcalar)));
    process.stdin.on('error', () => coz(Buffer.concat(parcalar)));
  });
}

function ilet(govde) {
  const port = Number(process.env.KOKPIT_KANCA_PORT);
  const token = process.env.KOKPIT_KANCA_TOKEN;
  const oturum = process.env.KOKPIT_OTURUM;
  if (!port || !token || !oturum) return Promise.resolve();
  return new Promise((coz) => {
    const istek = http.request(
      {
        host: '127.0.0.1',
        port,
        path: '/durum-satiri',
        method: 'POST',
        timeout: ILETIM_SINIRI_MS,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': govde.length,
          Authorization: 'Bearer ' + token,
          'X-Kokpit-Oturum': oturum,
        },
      },
      (res) => {
        res.resume();
        res.on('end', coz);
      }
    );
    istek.on('timeout', () => istek.destroy());
    istek.on('error', () => coz());
    istek.on('close', () => coz());
    istek.end(govde);
  });
}

function asilCalistir(govde) {
  const komut = process.env.KOKPIT_ASIL_DURUM_SATIRI;
  if (!komut) return Promise.resolve();
  return new Promise((coz) => {
    let cocuk;
    try {
      cocuk = spawn(komut, { shell: true, stdio: ['pipe', 'inherit', 'inherit'], windowsHide: true });
    } catch {
      coz();
      return;
    }
    cocuk.on('error', () => coz());
    cocuk.on('exit', (kod) => {
      process.exitCode = kod ?? 0;
      coz();
    });
    cocuk.stdin.on('error', () => {});
    cocuk.stdin.end(govde);
  });
}

girdiOku().then((govde) => Promise.all([ilet(govde), asilCalistir(govde)]));
