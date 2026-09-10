// Tek komut: Vite dev sunucusunu baslat, hazir olunca Electron'u ac.
// Ekstra bagimlilik (concurrently/wait-on) yok - Faz 0'da bu bekleme sekli zaten dogrulandi.
const { spawn } = require('child_process');
const path = require('path');

const KOK = path.join(__dirname, '..');
// npm.cmd/.bat spawn edilmez: Node 20+ Windows'ta shell:false ile EINVAL atiyor.
// Vite'i dogrudan Node ile calistiriyoruz, kabuk araya girmiyor.
const viteBin = path.join(KOK, 'node_modules', 'vite', 'bin', 'vite.js');
const electronBin = require('electron');

const net = require('net');
const { DEV_PORT: PORT } = require('../kokpit.config.cjs');

let vite = null;
let electron = null;
let kapaniyor = false;

/**
 * Port dolu mu? Onceki oturumun Vite'i ayakta kalmis olabilir (pencere kapansa bile
 * surec agaci hep birlikte olmuyor). strictPort:true oldugu icin Vite bu durumda
 * yigin iziyle patliyordu; bunun yerine mevcut sunucuyu yeniden kullaniyoruz.
 */
function adresteDinliyor(host) {
  return new Promise((cozul) => {
    const s = net.connect({ host, port: PORT });
    const bitir = (sonuc) => {
      s.destroy();
      cozul(sonuc);
    };
    s.setTimeout(1200);
    s.on('connect', () => bitir(true));
    s.on('error', () => bitir(false));
    s.on('timeout', () => bitir(false));
  });
}

/**
 * IKI AILEYI DE SOR. Vite "localhost"a baglaniyor ve bu makinede yalnizca ::1
 * uzerinde dinleyebiliyor; sadece 127.0.0.1'e bakan kontrol portu "bos" sanip
 * Vite'i baslatiyordu ve Vite kendi bind'inde patliyordu.
 */
async function portDolu() {
  const sonuclar = await Promise.all([adresteDinliyor('127.0.0.1'), adresteDinliyor('::1')]);
  return sonuclar.some(Boolean);
}

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

function electronAc() {
  console.log('[kokpit] arayuz hazir, electron aciliyor');
  electron = spawn(electronBin, [KOK], { cwd: KOK, stdio: 'inherit' });
  electron.on('exit', (kod) => {
    console.log('[kokpit] electron kapandi (' + kod + ')');
    kapat(kod === null ? 0 : kod);
  });
}

// Vite URL'i ANSI renk kodlariyla basiyor: "localhost:" ile port arasina escape giriyor.
// Duz string eslesmesi sessizce tutmaz -> once soy, sonra ara.
const ansiSoy = (s) => s.replace(/[[0-9;]*m/g, '');

void (async () => {
  if (await portDolu()) {
    console.log('[kokpit] ' + PORT + ' portunda calisan bir dev sunucusu var, ona baglaniyorum');
    electronAc();
    return;
  }

  vite = spawn(process.execPath, [viteBin], {
    cwd: KOK,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false,
  });
  vite.stdout.setEncoding('utf8');
  vite.stderr.setEncoding('utf8');
  vite.stderr.on('data', (d) => process.stderr.write('[vite] ' + d));

  let hazir = false;
  vite.stdout.on('data', (d) => {
    process.stdout.write('[vite] ' + d);
    if (!hazir && /localhost:\d+/.test(ansiSoy(d))) {
      hazir = true;
      electronAc();
    }
  });

  vite.on('exit', (kod) => {
    if (!hazir) console.error('[kokpit] vite baslamadan cikti, kod ' + kod);
    kapat(kod === null ? 0 : kod);
  });
})();

process.on('SIGINT', () => kapat(0));
process.on('SIGTERM', () => kapat(0));
