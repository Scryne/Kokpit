// v3.2, paralel oturumlar (Faz 54): ayni projede iki is ayni anda, birbirine dokunmadan. Kokpit projenin
// icinde bir git calisma agaci acar (`.claude/worktrees/<ad>`, Claude Code'un kendi duzeni), yeni dalda
// (`kokpit/<ad>`) claude orada calisir. Is bitince Teslim sayfasinda diff'e bakilir: Birlestir (ana dala
// --no-ff merge) ya da At (agac + dal silinir, onayli).
//
// Neden: v3.0'da onerilip alinmamisti; v3.2'de Scryne "hepsini yap" dedi. Olcum: Kokpit'te cogunlukla 2-3
// oturum ayni anda aciliyor (v3.0 kullanim verisi); ayni projede iki oturum ayni agaci yarisiyordu.
// Gece vardiyasi (gece.cjs) her gorevi kendi agacinda calistirir: sabah ana dal temiz, karar Scryne'in.
//
// Agac `.git/info/exclude`'a yazilir (yerel, commit'lenmez): ana deponun `git status`'u kirlenmez.
// node_modules ve .venv ana agacin klasorune "junction" olarak baglanir: agac hemen calisir (bagimlilik
// degisirse claude kendi agacinda yeniden kurar; junction silinip gercek klasor olur). Gizli .env
// dosyalari kopyalanir (ayni makine, ayni sahip; git'e girmezler).

const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const { KOKPIT_DIZIN } = require('./config.cjs');
const { log } = require('./log.cjs');

const KAYIT = path.join(KOKPIT_DIZIN, 'paralel.json');
const DAL_ONEKI = 'kokpit/';
const BAGLANACAK = ['node_modules', '.venv', 'venv'];

function git(cwd, args, ms = 30_000) {
  return new Promise((coz) => {
    execFile('git', ['-C', cwd, '-c', 'core.quotepath=false', ...args], { windowsHide: true, timeout: ms, maxBuffer: 8 * 1024 * 1024, env: { ...process.env, GIT_TERMINAL_PROMPT: '0', LC_ALL: 'C' } }, (hata, cikti, hc) =>
      coz({ tamam: !hata, kod: hata ? hata.code : 0, cikti: String(cikti ?? ''), hata: String(hc ?? '') })
    );
  });
}

/** SAF: kullanicinin verdigi ya da uretilen adi dal/klasor icin guvenli yapar. */
function adTemizle(ham) {
  const tr = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', Ç: 'c', Ğ: 'g', İ: 'i', Ö: 'o', Ş: 's', Ü: 'u' };
  const a = String(ham || '')
    .replace(/[çğıöşüÇĞİÖŞÜ]/g, (h) => tr[h])
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);
  return a;
}

/** SAF: listede olmayan ilk ad ("p1", "p2" ...) ya da verilen adin bos olmayan hali. */
function adUret(ham, mevcut) {
  const temiz = adTemizle(ham);
  if (temiz && !mevcut.includes(temiz)) return temiz;
  const kok = temiz || 'p';
  for (let i = 1; i < 100; i++) if (!mevcut.includes(kok + i)) return kok + i;
  return kok + Date.now().toString(36);
}

function kayitOku() {
  try {
    const j = JSON.parse(fs.readFileSync(KAYIT, 'utf8'));
    return Array.isArray(j) ? j.filter((k) => k && typeof k.yol === 'string' && typeof k.dal === 'string') : [];
  } catch {
    return [];
  }
}
function kayitYaz(liste) {
  fs.mkdirSync(path.dirname(KAYIT), { recursive: true });
  const gecici = KAYIT + '.' + process.pid + '.tmp';
  fs.writeFileSync(gecici, JSON.stringify(liste, null, 2) + '\n', 'utf8');
  fs.renameSync(gecici, KAYIT);
}

/** Ana deponun `.git/info/exclude`'una `.claude/worktrees/` (yoksa). Ortak git dizini worktree'de de ayni. */
async function disla(projeYol) {
  const r = await git(projeYol, ['rev-parse', '--git-common-dir']);
  if (!r.tamam) return;
  const gitDizin = path.resolve(projeYol, r.cikti.trim());
  const dosya = path.join(gitDizin, 'info', 'exclude');
  let icerik = '';
  try {
    icerik = fs.readFileSync(dosya, 'utf8');
  } catch {
    /* yok */
  }
  if (/^\/?\.claude\/worktrees\/?$/m.test(icerik)) return;
  fs.mkdirSync(path.dirname(dosya), { recursive: true });
  fs.appendFileSync(dosya, (icerik && !icerik.endsWith('\n') ? '\n' : '') + '# Kokpit paralel oturumlar (v3.2)\n.claude/worktrees/\n');
}

/**
 * Yeni calisma agaci + dal. Taban: ana agacin su anki dali (HEAD). Ana agac kirliyse de olur: agac commit'ten
 * acilir, kirli degisiklikler ana agacta kalir (Scryne'a soylenir).
 * @returns {Promise<{ kayit: object, notlar: string[] } | { hata: string }>}
 */
async function olustur(projeYol, projeAd, istenenAd) {
  const kok = await git(projeYol, ['rev-parse', '--show-toplevel']);
  if (!kok.tamam) return { hata: projeAd + ' bir git deposu değil' };
  const anaKok = path.resolve(kok.cikti.trim());
  const dal = await git(anaKok, ['symbolic-ref', '--quiet', '--short', 'HEAD']);
  if (!dal.tamam) return { hata: 'Ana ağaç bir dalda değil (detached HEAD)' };
  const taban = dal.cikti.trim();
  const mevcut = kayitOku().filter((k) => path.resolve(k.projeYol).toLowerCase() === anaKok.toLowerCase()).map((k) => k.ad);
  const dallar = await git(anaKok, ['for-each-ref', '--format=%(refname:short)', 'refs/heads/' + DAL_ONEKI]);
  const dolu = [...mevcut, ...dallar.cikti.split(/\r?\n/).filter(Boolean).map((d) => d.slice(DAL_ONEKI.length))];
  const ad = adUret(istenenAd, dolu);
  const yol = path.join(anaKok, '.claude', 'worktrees', ad);
  if (fs.existsSync(yol)) return { hata: 'Klasör zaten var: ' + yol };
  await disla(anaKok);
  const r = await git(anaKok, ['worktree', 'add', '-b', DAL_ONEKI + ad, yol, 'HEAD'], 120_000);
  if (!r.tamam) return { hata: 'git worktree add: ' + (r.hata.trim() || r.cikti.trim()).slice(0, 300) };
  const notlar = [];
  for (const ad2 of BAGLANACAK) {
    const kaynak = path.join(anaKok, ad2);
    const hedef = path.join(yol, ad2);
    if (fs.existsSync(kaynak) && !fs.existsSync(hedef)) {
      try {
        fs.symlinkSync(kaynak, hedef, 'junction');
        notlar.push(ad2 + ' ana ağaca bağlandı');
      } catch (e) {
        notlar.push(ad2 + ' bağlanamadı: ' + e.message);
      }
    }
  }
  for (const f of fs.readdirSync(anaKok)) {
    if (/^\.env(\..+)?$/.test(f) && !/\.(example|sample|template)$/.test(f) && !fs.existsSync(path.join(yol, f))) {
      try {
        fs.copyFileSync(path.join(anaKok, f), path.join(yol, f));
        notlar.push(f + ' kopyalandı');
      } catch {
        /* okunamadi */
      }
    }
  }
  const kirli = await git(anaKok, ['status', '--porcelain']);
  if (kirli.tamam && kirli.cikti.trim()) notlar.push('Ana ağaçtaki commit edilmemiş değişiklikler paralel ağaca geçmedi');
  const kayit = { proje: projeAd, projeYol: anaKok, ad, yol, dal: DAL_ONEKI + ad, taban, olusturuldu: Date.now() };
  kayitYaz([...kayitOku(), kayit]);
  log('paralel: ' + projeAd + ' / ' + ad + ' acildi (' + taban + ' -> ' + kayit.dal + ')');
  return { kayit, notlar };
}

/** Kayitlar + her birinin hali (taban'a gore ileride commit, kirli dosya, satir farki). Silinmis agac kayittan duser. */
async function liste() {
  const kayitlar = kayitOku();
  const yasayan = kayitlar.filter((k) => fs.existsSync(k.yol));
  if (yasayan.length !== kayitlar.length) kayitYaz(yasayan);
  return Promise.all(
    yasayan.map(async (k) => {
      const [ileri, kirli, fark, tabanIleri] = await Promise.all([
        git(k.projeYol, ['rev-list', '--count', k.taban + '..' + k.dal]),
        git(k.yol, ['status', '--porcelain']),
        git(k.projeYol, ['diff', '--shortstat', k.taban + '...' + k.dal]),
        git(k.projeYol, ['rev-list', '--count', k.dal + '..' + k.taban]),
      ]);
      const m = /(\d+) files? changed(?:, (\d+) insertions?\(\+\))?(?:, (\d+) deletions?\(-\))?/.exec(fark.cikti);
      return {
        ...k,
        gece: k.ad.startsWith('gece'),
        ileride: Number(ileri.cikti.trim()) || 0,
        geride: Number(tabanIleri.cikti.trim()) || 0,
        kirli: kirli.cikti.split(/\r?\n/).filter(Boolean).length,
        dosya: m ? Number(m[1]) : 0,
        arti: m && m[2] ? Number(m[2]) : 0,
        eksi: m && m[3] ? Number(m[3]) : 0,
      };
    })
  );
}

function bul(yol) {
  const n = path.resolve(String(yol || '')).toLowerCase();
  return kayitOku().find((k) => path.resolve(k.yol).toLowerCase() === n) ?? null;
}

/** Dalin taban'a gore tum diff'i (uc nokta: ortak atadan beri yalniz bu dalin yaptigi). */
async function fark(yol) {
  const k = bul(yol);
  if (!k) return { hata: 'paralel ağaç bulunamadı' };
  const r = await git(k.projeYol, ['diff', '--stat', '--patch', k.taban + '...' + k.dal]);
  if (!r.tamam) return { hata: r.hata.trim() || 'okunamadı' };
  const m = r.cikti;
  return m.length > 400 * 1024 ? { metin: m.slice(0, m.lastIndexOf('\n', 400 * 1024) + 1), kesildi: true } : { metin: m || '(fark yok)', kesildi: false };
}

/**
 * Birlestir: paralel dal ana agacta taban dala --no-ff merge edilir. Kosullar: paralel agac temiz (commit
 * edilmemis is kaybolmasin), ana agac temiz ve taban dalda. Cakisma olursa merge geri alinir (--abort), ana
 * agac eski haline doner; Scryne'a dosyalar soylenir. Basarida agac ve dal silinmez: "At" ayri karar.
 */
async function birlestir(yol) {
  const k = bul(yol);
  if (!k) return { tamam: false, cikti: 'paralel ağaç bulunamadı' };
  const pk = await git(k.yol, ['status', '--porcelain']);
  if (pk.cikti.trim()) return { tamam: false, cikti: 'Paralel ağaçta commit edilmemiş değişiklik var: önce commit et (ya da claude\'a ettir).' };
  const ak = await git(k.projeYol, ['status', '--porcelain', '--untracked-files=no']);
  if (ak.cikti.trim()) return { tamam: false, cikti: 'Ana ağaçta commit edilmemiş değişiklik var; birleştirme onları karıştırırdı. Önce ana ağacı temizle.' };
  const dal = await git(k.projeYol, ['symbolic-ref', '--quiet', '--short', 'HEAD']);
  if (dal.cikti.trim() !== k.taban) return { tamam: false, cikti: 'Ana ağaç ' + k.taban + ' dalında değil (' + (dal.cikti.trim() || 'detached') + ').' };
  const ileri = await git(k.projeYol, ['rev-list', '--count', k.taban + '..' + k.dal]);
  if ((Number(ileri.cikti.trim()) || 0) === 0) return { tamam: false, cikti: 'Birleştirilecek commit yok.' };
  const r = await git(k.projeYol, ['merge', '--no-ff', '--no-edit', '-m', 'Paralel: ' + k.ad + ' (' + k.dal + ')', k.dal], 120_000);
  if (!r.tamam) {
    const cakisan = await git(k.projeYol, ['diff', '--name-only', '--diff-filter=U']);
    await git(k.projeYol, ['merge', '--abort']);
    log('paralel: ' + k.ad + ' birlestirilemedi, merge geri alindi');
    return { tamam: false, cikti: 'Çakışma; birleştirme geri alındı. Çakışan dosyalar:\n' + (cakisan.cikti.trim() || r.hata.trim()).slice(0, 1500) };
  }
  log('paralel: ' + k.ad + ' -> ' + k.taban + ' birlestirildi');
  return { tamam: true, cikti: (r.cikti + r.hata).trim().slice(0, 2000) };
}

/** At: agac ve dal silinir. `zorla`: commit edilmemis degisiklik / birlestirilmemis commit olsa da (onayli). */
async function at(yol, zorla) {
  const k = bul(yol);
  if (!k) return { tamam: false, cikti: 'paralel ağaç bulunamadı' };
  // Junction'lar once kaldirilir: git worktree remove baglantiyi izleyip ana node_modules'a dokunmasin.
  for (const ad2 of BAGLANACAK) {
    const h = path.join(k.yol, ad2);
    try {
      if (fs.lstatSync(h).isSymbolicLink()) fs.unlinkSync(h);
    } catch {
      /* yok */
    }
  }
  const r = await git(k.projeYol, ['worktree', 'remove', ...(zorla ? ['--force'] : []), k.yol], 60_000);
  if (!r.tamam) return { tamam: false, cikti: (r.hata.trim() || r.cikti.trim()).slice(0, 600) };
  const d = await git(k.projeYol, ['branch', zorla ? '-D' : '-d', k.dal]);
  kayitYaz(kayitOku().filter((x) => x.yol !== k.yol));
  log('paralel: ' + k.ad + ' atildi' + (d.tamam ? '' : ' (dal kaldi: ' + d.hata.trim().slice(0, 80) + ')'));
  return { tamam: true, cikti: d.tamam ? 'Ağaç ve ' + k.dal + ' silindi.' : 'Ağaç silindi; dal kaldı (birleştirilmemiş commit): ' + k.dal };
}

module.exports = {
  olustur,
  liste,
  fark,
  birlestir,
  at,
  bul,
  adTemizle,
  adUret,
  /** Teslim'in yol denetimi: Kokpit'in actigi agaclar. */
  yollar: () => kayitOku().map((k) => k.yol),
};
