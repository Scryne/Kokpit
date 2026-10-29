// v3.2, Teslim sayfasi (Ctrl+6): bir isi "disari cikarmanin" son metresi. Push bekleyen commit'ler, commit
// edilmemis dosyalar ve diff'leri tek yerde; push onayli ve public repoda yayin kapisindan gecer.
//
// Neden: Kokpit'in 10-29 gunlugunde uc ayri "push onay bekliyor" maddesi vardi (Kokpit'in kendisi dahil);
// Pano ↑N gosteriyordu ama ne gidecegini gormek icin terminal gerekiyordu. 10-27'de 18 repo public oldu:
// public repoya giden her commit yayindir (yayin-oncesi kurali), kapi `yayin_tara.py --gecmis` ile ayni.
//
// Yetki: yol renderer'dan gelir ama main'in bildigi proje listesinde (durum.py) olmali; git argumanlari
// sabit, kullanici girdisi yalniz denetlenmis commit kimligi (hex) ve depo icindeki dosya yolu.
// Saf ayristiricilar (commitleriAyristir, durumAyristir, farkKes, githubDepo) test-ada'da sinanir.

const { execFile } = require('child_process');
const fs = require('fs');
const https = require('https');
const os = require('os');
const path = require('path');
const { log } = require('./log.cjs');

const AZAMI_FARK = 400 * 1024;
const GIT_MS = 15_000;
const PUSH_MS = 120_000;
const GORUNURLUK_OMRU_MS = 6 * 3600_000;
const KAPI = path.join(os.homedir(), '.claude', 'skills', 'yayin-oncesi', 'scripts', 'yayin_tara.py');

function git(cwd, args, { ms = GIT_MS, buyuk = false, kabul = [0] } = {}) {
  return new Promise((coz) => {
    execFile(
      'git',
      ['-C', cwd, '-c', 'core.quotepath=false', '-c', 'color.ui=false', ...args],
      { windowsHide: true, timeout: ms, maxBuffer: buyuk ? 8 * 1024 * 1024 : 2 * 1024 * 1024, env: { ...process.env, GIT_TERMINAL_PROMPT: '0', LC_ALL: 'C' } },
      (hata, cikti, hataCikti) => {
        const kod = hata ? (typeof hata.code === 'number' ? hata.code : -1) : 0;
        coz({ tamam: kabul.includes(kod), kod, cikti: String(cikti ?? ''), hata: String(hataCikti ?? '') });
      }
    );
  });
}

/** `git log --format=%h%x1f%H%x1f%s%x1f%ct%x1f%an%x1f%ae%x1e` -> commit listesi. SAF. */
function commitleriAyristir(metin) {
  return String(metin)
    .split('\x1e')
    .map((k) => k.replace(/^\s+/, ''))
    .filter(Boolean)
    .map((k) => {
      const [kisa, tam, konu, zaman, yazar, eposta] = k.split('\x1f');
      return { kisa, tam, konu: konu ?? '', zaman: Number(zaman) * 1000 || null, yazar: yazar ?? '', eposta: (eposta ?? '').trim() };
    })
    .filter((c) => /^[0-9a-f]{40}$/.test(c.tam || ''));
}

/** `git status --porcelain=v1 -z` -> [{ durum: 'M ', yol }]. Yeniden adlandirmada (R/C) ikinci yol eski addir. SAF. */
function durumAyristir(metin) {
  const parca = String(metin).split('\0');
  const sonuc = [];
  for (let i = 0; i < parca.length; i++) {
    const p = parca[i];
    if (p.length < 4) continue;
    const durum = p.slice(0, 2);
    const yol = p.slice(3);
    if (durum[0] === 'R' || durum[0] === 'C') i++; // eski ad
    sonuc.push({ durum, yol });
  }
  return sonuc;
}

/** `git diff --numstat -z HEAD` -> { yol: { arti, eksi } } (ikili dosyada null). SAF. */
function sayilariAyristir(metin) {
  const sonuc = {};
  const parca = String(metin).split('\0');
  for (let i = 0; i < parca.length; i++) {
    const m = /^(-|\d+)\t(-|\d+)\t(.*)$/s.exec(parca[i]);
    if (!m) continue;
    let yol = m[3];
    // Yeniden adlandirma: yol bos, sonraki iki parca eski ve yeni ad.
    if (yol === '') {
      yol = parca[i + 2] ?? '';
      i += 2;
    }
    sonuc[yol] = { arti: m[1] === '-' ? null : Number(m[1]), eksi: m[2] === '-' ? null : Number(m[2]) };
  }
  return sonuc;
}

/** Buyuk diff'i satir sinirinda keser. SAF. */
function farkKes(metin, sinir = AZAMI_FARK) {
  const m = String(metin);
  if (m.length <= sinir) return { metin: m, kesildi: false };
  return { metin: m.slice(0, m.lastIndexOf('\n', sinir) + 1), kesildi: true };
}

/** Remote URL'den GitHub sahibi/depo. SAF. https, ssh ve scp bicimleri. */
function githubDepo(url) {
  const m = /github\.com[:/]([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/i.exec(String(url || '').trim());
  return m ? { sahip: m[1], depo: m[2] } : null;
}

// --- GitHub gorunurlugu (public/private): kapinin karari buna bagli ---
let token = null;
let tokenOkundu = 0;
const gorunurlukOnbellek = new Map();

function ghToken() {
  if (token && Date.now() - tokenOkundu < 3600_000) return Promise.resolve(token);
  return new Promise((coz) => {
    execFile('gh', ['auth', 'token'], { windowsHide: true, timeout: 8000 }, (hata, cikti) => {
      token = hata ? null : String(cikti).trim() || null;
      tokenOkundu = Date.now();
      coz(token);
    });
  });
}

/**
 * @returns {Promise<'public' | 'private' | 'bilinmiyor'>} Bilinmiyorsa kapi public gibi davranir.
 * IPv4 zorlanir: api.github.com'un AAAA'siz cozumu bu makinede ~12 sn suruyor (dns-aaaa-tuzagi).
 */
async function gorunurluk(url) {
  const d = githubDepo(url);
  if (!d) return 'bilinmiyor';
  const anahtar = (d.sahip + '/' + d.depo).toLowerCase();
  const o = gorunurlukOnbellek.get(anahtar);
  if (o && Date.now() - o.t < GORUNURLUK_OMRU_MS) return o.deger;
  const tk = await ghToken();
  const deger = await new Promise((coz) => {
    const istek = https.request(
      {
        host: 'api.github.com',
        path: '/repos/' + encodeURIComponent(d.sahip) + '/' + encodeURIComponent(d.depo),
        family: 4,
        timeout: 8000,
        headers: { 'User-Agent': 'kokpit', Accept: 'application/vnd.github+json', ...(tk ? { Authorization: 'Bearer ' + tk } : {}) },
      },
      (yanit) => {
        let govde = '';
        yanit.on('data', (p) => (govde += p));
        yanit.on('end', () => {
          try {
            const j = JSON.parse(govde);
            coz(yanit.statusCode === 200 ? (j.private ? 'private' : 'public') : 'bilinmiyor');
          } catch {
            coz('bilinmiyor');
          }
        });
      }
    );
    istek.on('timeout', () => istek.destroy());
    istek.on('error', () => coz('bilinmiyor'));
    istek.end();
  });
  if (deger !== 'bilinmiyor') gorunurlukOnbellek.set(anahtar, { deger, t: Date.now() });
  return deger;
}

/**
 * Bir projenin teslim hali: dal, uzak, ileride/geride, giden commit'ler (uzak dal yoksa son 15), commit
 * edilmemis dosyalar ve satir sayilari, remote ve (arka planda) gorunurluk.
 */
async function detay(yol) {
  const st = await git(yol, ['status', '--porcelain=v2', '--branch']);
  if (!st.tamam) return { hata: 'git deposu değil ya da git okunamadı' };
  let dal = null;
  let uzak = null;
  let ileride = 0;
  let geride = 0;
  for (const s of st.cikti.split(/\r?\n/)) {
    if (s.startsWith('# branch.head ')) dal = s.slice(14).trim();
    else if (s.startsWith('# branch.upstream ')) uzak = s.slice(18).trim();
    else if (s.startsWith('# branch.ab ')) {
      const m = /\+(\d+) -(\d+)/.exec(s);
      if (m) {
        ileride = Number(m[1]);
        geride = Number(m[2]);
      }
    }
  }
  const BICIM = '--format=%h%x1f%H%x1f%s%x1f%ct%x1f%an%x1f%ae%x1e';
  const lg = uzak ? await git(yol, ['log', BICIM, '-n', '100', '@{u}..HEAD']) : await git(yol, ['log', BICIM, '-n', '15']);
  const commitler = lg.tamam ? commitleriAyristir(lg.cikti) : [];
  const ds = await git(yol, ['status', '--porcelain=v1', '-z', '--untracked-files=all']);
  const dosyalar = ds.tamam ? durumAyristir(ds.cikti).slice(0, 500) : [];
  const ns = await git(yol, ['diff', '--numstat', '-z', 'HEAD']);
  const sayilar = ns.tamam ? sayilariAyristir(ns.cikti) : {};
  const rm = await git(yol, ['remote', 'get-url', 'origin']);
  const remote = rm.tamam ? rm.cikti.trim() : null;
  return {
    yol,
    dal: dal === '(detached)' ? null : dal,
    uzak,
    ileride,
    geride,
    commitler,
    dosyalar: dosyalar.map((d) => ({ ...d, ...(sayilar[d.yol] ?? { arti: null, eksi: null }) })),
    remote: remote ? remote.replace(/\/\/[^@/]+@/, '//') : null,
    github: githubDepo(remote),
  };
}

/** Bir commit'in ya da commit edilmemis bir dosyanin diff'i. */
async function fark(yol, istek) {
  if (istek && typeof istek.commit === 'string') {
    if (!/^[0-9a-f]{7,40}$/.test(istek.commit)) return { hata: 'geçersiz commit' };
    const r = await git(yol, ['show', '--stat', '--patch', '--format=%H%n%an <%ae>%n%ad%n%n%B', istek.commit], { buyuk: true });
    return r.tamam ? farkKes(r.cikti) : { hata: r.hata.trim() || 'okunamadı' };
  }
  if (istek && typeof istek.dosya === 'string') {
    const tam = path.resolve(yol, istek.dosya);
    // Depo disina cikan yol (.. ile) reddedilir.
    if (!tam.toLowerCase().startsWith(path.resolve(yol).toLowerCase() + path.sep)) return { hata: 'geçersiz yol' };
    const izli = await git(yol, ['ls-files', '--error-unmatch', '--', istek.dosya]);
    if (izli.tamam) {
      const r = await git(yol, ['diff', 'HEAD', '--', istek.dosya], { buyuk: true });
      return r.tamam ? farkKes(r.cikti) : { hata: r.hata.trim() || 'okunamadı' };
    }
    // Izlenmeyen yeni dosya: tamami eklenen satir.
    try {
      const st = fs.statSync(tam);
      if (!st.isFile()) return { hata: 'dosya değil' };
      if (st.size > AZAMI_FARK) return { metin: '(yeni dosya, ' + Math.round(st.size / 1024) + ' KB: gösterilmiyor)', kesildi: false };
      const icerik = fs.readFileSync(tam);
      if (icerik.includes(0)) return { metin: '(yeni ikili dosya)', kesildi: false };
      const satirlar = String(icerik).split(/\r?\n/);
      return { metin: 'yeni dosya: ' + istek.dosya + '\n@@ -0,0 +1,' + satirlar.length + ' @@\n' + satirlar.map((s) => '+' + s).join('\n'), kesildi: false };
    } catch (e) {
      return { hata: e.message };
    }
  }
  return { hata: 'istek eksik' };
}

/** Yayin kapisi: `yayin_tara.py <repo> --gecmis --json`. Betik yoksa null (kapi atlandi diye soylenir). */
function kapi(yol) {
  if (!fs.existsSync(KAPI)) return Promise.resolve(null);
  return new Promise((coz) => {
    execFile(
      'python',
      [KAPI, yol, '--gecmis', '--json'],
      { windowsHide: true, timeout: 90_000, maxBuffer: 4 * 1024 * 1024, env: { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' } },
      (hata, cikti) => {
        try {
          const j = JSON.parse(String(cikti));
          coz({ bulgular: Array.isArray(j.bulgular) ? j.bulgular : [], notlar: j.notlar ?? [] });
        } catch {
          coz({ hata: hata ? hata.message : 'tarama çıktısı okunamadı', bulgular: [] });
        }
      }
    );
  });
}

/**
 * Push. Uzak dal varsa `git push`, yoksa `git push -u origin <dal>` (origin varsa). Zorlama yok (--force
 * hic yok); reddedilirse (geride) git'in mesaji doner.
 */
async function push(yol) {
  const d = await detay(yol);
  if ('hata' in d) return { tamam: false, cikti: d.hata };
  if (!d.dal) return { tamam: false, cikti: 'Dal yok (detached HEAD)' };
  const args = d.uzak ? ['push'] : d.remote ? ['push', '-u', 'origin', d.dal] : null;
  if (!args) return { tamam: false, cikti: 'origin tanımlı değil' };
  const t0 = Date.now();
  const r = await git(yol, args, { ms: PUSH_MS });
  log('teslim: push ' + path.basename(yol) + ' ' + d.dal + ' -> ' + (r.tamam ? 'tamam' : 'HATA ' + r.kod) + ' (' + (Date.now() - t0) + ' ms)');
  return { tamam: r.tamam, cikti: (r.hata + r.cikti).trim().slice(0, 4000) };
}

module.exports = { detay, fark, push, kapi, gorunurluk, commitleriAyristir, durumAyristir, sayilariAyristir, farkKes, githubDepo };
