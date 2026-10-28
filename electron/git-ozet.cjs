// v3.0, Ada'nin bitti kartinda sonuc: tur bitince oturumun klasorunde git ne diyor? Oturum basladigindan
// beri commit atildi mi, push bekleyen var mi, kirli dosya var mi. Yalniz Stop/StopFailure aninda iki git
// sureci (status + rev-list); yoklama yok. Ayristirma SAF (`durumAyristir`), test-ada dogrudan sinar.

const { execFile } = require('child_process');

function git(cwd, args) {
  return new Promise((coz) => {
    execFile('git', ['-C', cwd, ...args], { windowsHide: true, timeout: 5000, maxBuffer: 1024 * 1024 }, (hata, cikti) =>
      coz(hata ? null : String(cikti))
    );
  });
}

/**
 * `git status --porcelain=v2 --branch` ciktisi -> { dal, ileride, uzakVar, kirli }.
 * Basliklar `# branch.head|upstream|ab`; geri kalan her satir bir giris (1/2/u/?), sayilir. `!` (yok
 * sayilan) istenmedigi icin gelmez.
 */
function durumAyristir(metin) {
  let dal = null;
  let ileride = 0;
  let uzakVar = false;
  let kirli = 0;
  for (const satir of String(metin).split(/\r?\n/)) {
    if (!satir) continue;
    if (satir.startsWith('# branch.head ')) {
      const d = satir.slice(14).trim();
      dal = d === '(detached)' ? null : d;
    } else if (satir.startsWith('# branch.upstream ')) uzakVar = true;
    else if (satir.startsWith('# branch.ab ')) {
      const m = /\+(\d+)/.exec(satir);
      ileride = m ? Number(m[1]) : 0;
    } else if (!satir.startsWith('#')) kirli++;
  }
  return { dal, ileride, uzakVar, kirli };
}

/** @returns GitOzeti ya da null (git deposu degil / git yok / zaman asimi). */
async function gitOzeti(cwd, baslangicMs, simdi = Date.now()) {
  const durum = await git(cwd, ['status', '--porcelain=v2', '--branch']);
  if (durum === null) return null;
  const d = durumAyristir(durum);
  let commit = 0;
  if (Number.isFinite(baslangicMs) && baslangicMs > 0) {
    // Commit tarihi saniye hassasiyetinde; oturum acilisindan 1 sn once bile atilmis olanlar sayilmasin.
    const say = await git(cwd, ['rev-list', '--count', '--since=@' + Math.ceil(baslangicMs / 1000), 'HEAD']);
    commit = say === null ? 0 : Number(say.trim()) || 0;
  }
  return { ...d, commit, olculdu: simdi };
}

module.exports = { durumAyristir, gitOzeti };
