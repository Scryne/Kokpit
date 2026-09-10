// Tek komut: Vite dev sunucusunu baslat, hazir olunca Electron'u ac.
// Ekstra bagimlilik (concurrently/wait-on) yok - Faz 0'da bu bekleme sekli zaten dogrulandi.
const { spawn } = require('child_process');
const path = require('path');

const KOK = path.join(__dirname, '..');
// npm.cmd/.bat spawn edilmez: Node 20+ Windows'ta shell:false ile EINVAL atiyor.
// Vite'i dogrudan Node ile calistiriyoruz, kabuk araya girmiyor.
const viteBin = path.join(KOK, 'node_modules', 'vite', 'bin', 'vite.js');
const electronBin = require('electron');

let vite = null;
let electron = null;
let kapaniyor = false;

function kapat(kod) {
  if (kapaniyor) return;
  kapaniyor = true;
  for (const p of [electron, vite]) {
    if (p && p.exitCode === null) {
      try { p.kill(); } catch { /* zaten olmus */ }
    }
  }
  process.exit(kod);
}

vite = spawn(process.execPath, [viteBin], { cwd: KOK, stdio: ['ignore', 'pipe', 'pipe'], shell: false });
vite.stdout.setEncoding('utf8');
vite.stderr.setEncoding('utf8');
vite.stderr.on('data', (d) => process.stderr.write('[vite] ' + d));

// Vite URL'i ANSI renk kodlariyla basiyor: "localhost:" ile port arasina escape giriyor.
// Duz string eslesmesi sessizce tutmaz -> once soy, sonra ara.
const ansiSoy = (s) => s.replace(/\[[0-9;]*m/g, '');

let hazir = false;
vite.stdout.on('data', (d) => {
  process.stdout.write('[vite] ' + d);
  if (!hazir && /localhost:\d+/.test(ansiSoy(d))) {
    hazir = true;
    console.log('\n[kokpit] vite hazir, electron aciliyor\n');
    electron = spawn(electronBin, [KOK], { cwd: KOK, stdio: 'inherit' });
    electron.on('exit', (kod) => {
      console.log('[kokpit] electron kapandi (' + kod + '), vite durduruluyor');
      kapat(kod === null ? 0 : kod);
    });
  }
});

vite.on('exit', (kod) => {
  if (!hazir) console.error('[kokpit] vite baslamadan cikti, kod ' + kod);
  kapat(kod === null ? 0 : kod);
});

process.on('SIGINT', () => kapat(0));
process.on('SIGTERM', () => kapat(0));
