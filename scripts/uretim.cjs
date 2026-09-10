// Uretim modunu calistir: once derle, sonra Electron'u dev sunucusu OLMADAN ac.
// Gunluk kullanim bu yoldan gecer -- Vite dev sunucusu, HMR ve kaynak haritalari yok.
const { spawn } = require('child_process');
const path = require('path');

const KOK = path.join(__dirname, '..');
const viteBin = path.join(KOK, 'node_modules', 'vite', 'bin', 'vite.js');
const electronBin = require('electron');

const derle = spawn(process.execPath, [viteBin, 'build'], { cwd: KOK, stdio: 'inherit' });

derle.on('exit', (kod) => {
  if (kod !== 0) {
    console.error('[kokpit] derleme basarisiz, kod ' + kod);
    process.exit(kod ?? 1);
  }
  const elektron = spawn(electronBin, [KOK], {
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
