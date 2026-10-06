// Surum bekcisi (v2.8): calisan Kokpit kendi kodunun degistigini fark eder.
// Her surum notu ayni cumleyle bitiyordu: "calisan Kokpit eski surum, yeniden baslatinca gelir"
// (v2.3-v2.7). Scryne bunu bilmek zorunda kalmamali. Imza = git HEAD commit'i: yeni commit yeni
// surumdur; commit'lenmemis yarim is sayilmaz. Okuma yalniz dosya (git sureci acilmaz), dakikada bir.
//
// Yeniden baslatma uretim yolundan gecer (scripts/kokpit-sessiz.vbs -> uretim.cjs: once derle, sonra
// Electron). app.relaunch() kullanilmadi: Electron'u dogrudan acar, derlemeyi atlar ve eski dist'i
// yukler.

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { log } = require('./log.cjs');

const HASH = /^[0-9a-f]{40}$/;

/**
 * Deponun HEAD commit'i; okunamazsa null.
 * @param {string} kok depo koku (.git burada)
 */
function imzaOku(kok) {
  try {
    const git = path.join(kok, '.git');
    const bas = fs.readFileSync(path.join(git, 'HEAD'), 'utf8').trim();
    if (HASH.test(bas)) return bas; // ayrik HEAD
    const m = /^ref: (refs\/[^\s]+)$/.exec(bas);
    if (!m) return null;
    try {
      const h = fs.readFileSync(path.join(git, m[1]), 'utf8').trim();
      if (HASH.test(h)) return h;
    } catch {
      /* gevsek ref yok: packed-refs'te */
    }
    const paket = fs.readFileSync(path.join(git, 'packed-refs'), 'utf8');
    for (const satir of paket.split('\n')) {
      const [h, ref] = satir.trim().split(' ');
      if (ref === m[1] && HASH.test(h)) return h;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Imzayi bir kez alir, `aralikMs`'de bir yeniden okur; degisince `degisti(yeni)` bir kez cagrilir.
 * @returns {() => void} durdur
 */
function izle({ kok, aralikMs = 60_000, degisti }) {
  const ilk = imzaOku(kok);
  if (!ilk) {
    log('surum bekcisi: git imzasi okunamadi, izlenmiyor');
    return () => {};
  }
  const z = setInterval(() => {
    const simdi = imzaOku(kok);
    if (!simdi || simdi === ilk) return;
    clearInterval(z);
    log('surum bekcisi: yeni surum ' + ilk.slice(0, 7) + ' -> ' + simdi.slice(0, 7));
    degisti(simdi);
  }, aralikMs);
  z.unref?.();
  return () => clearInterval(z);
}

/** Uretim baslaticisini Kokpit'ten bagimsiz baslatir (bu surec cikinca da yasar). */
function yenidenBaslat(kok, arka, ek = []) {
  const vbs = path.join(kok, 'scripts', 'kokpit-sessiz.vbs');
  const wscript = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'wscript.exe');
  try {
    const c = spawn(wscript, [vbs, ...(arka ? ['--arka'] : []), ...ek], { cwd: kok, detached: true, stdio: 'ignore', windowsHide: true });
    c.unref();
    log('yeniden baslatma: baslatici calisti' + (arka ? ' (--arka)' : ''));
    return true;
  } catch (e) {
    log('FAIL yeniden baslatma: ' + e.message);
    return false;
  }
}

module.exports = { imzaOku, izle, yenidenBaslat };
