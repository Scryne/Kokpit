// Uretim modunu calistir: once derle, sonra Electron'u dev sunucusu OLMADAN ac.
// Gunluk kullanim bu yoldan gecer -- Vite dev sunucusu, HMR ve kaynak haritalari yok.
//
// Derleme dusse de Kokpit acilir (v2.9): Windows acilisi ve surum bekcisi bu betigi gizli
// pencerede calistiriyor (kokpit-sessiz.vbs); derleme hatasinda eskiden hicbir sey acilmiyor ve
// sebebi hicbir yere yazilmiyordu. Vite cikti dizinini ancak paket basariyla uretildikten sonra
// bosaltir; derleme hatasinda onceki dist yerinde kalir. O zaman onunla acilir, hata kokpit.log'a
// yazilir. Hic dist yoksa (ilk kurulum) acilacak bir sey yok, cikilir.
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const KOK = path.join(__dirname, '..');
const viteBin = path.join(KOK, 'node_modules', 'vite', 'bin', 'vite.js');
const electronBin = require('electron');
const { log } = require('../electron/log.cjs');

const derle = spawn(process.execPath, [viteBin, 'build'], { cwd: KOK, stdio: ['ignore', 'pipe', 'pipe'] });
// Cikti terminale aynen gider; son kismi hata olursa loga yazilir (gizli pencerede gorunmuyordu).
let kuyruk = '';
const aktar = (hedef) => (parca) => {
  hedef.write(parca);
  kuyruk = (kuyruk + parca.toString()).slice(-1500);
};
derle.stdout.on('data', aktar(process.stdout));
derle.stderr.on('data', aktar(process.stderr));

derle.on('exit', (kod) => {
  if (kod !== 0) {
    const eskiPaket = fs.existsSync(path.join(KOK, 'dist', 'index.html'));
    console.error('[kokpit] derleme basarisiz, kod ' + kod + (eskiPaket ? ': onceki paketle aciliyor' : ''));
    log('FAIL derleme basarisiz (kod ' + kod + ')' + (eskiPaket ? ', onceki dist ile aciliyor' : ', dist yok, acilmadi') + ':\n' + kuyruk.replace(/\x1b\[[0-9;]*m/g, '').trim());
    if (!eskiPaket) process.exit(kod ?? 1);
  }
  // Argumanlar Electron'a gecer (`--arka`: Windows acilisi, pencere gizli baslar).
  const elektron = spawn(electronBin, [KOK, ...process.argv.slice(2)], {
    cwd: KOK,
    stdio: 'inherit',
    env: { ...process.env, KOKPIT_DEV: '0' },
  });
  elektron.on('exit', (k) => process.exit(k ?? 0));

  // Terminalde Ctrl+C: Electron'u yetim birakma.
  const kapat = () => {
    if (elektron.exitCode === null) {
      try { elektron.kill(); } catch { /* zaten olmus */ }
    }
    process.exit(0);
  };
  process.on('SIGINT', kapat);
  process.on('SIGTERM', kapat);
});
