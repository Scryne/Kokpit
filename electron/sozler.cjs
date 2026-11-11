// v4.0 sarki sozleri: calan parcanin sozleri LRCLIB'den (lrclib.net, anahtarsiz, acik veri).
//
// Giden tek sey parca bilgisi (baslik, sanatci, album, sure); kullaniciya dair hicbir sey eklenmez.
// Ayar `sozler` kapaliysa cagiran (main) buraya hic gelmez.
//
// Sira: /api/get (ham baslik) -> 404 ise temizlenmis baslikla /api/get -> 404 ise /api/search ve
// sureye en yakin sonuc. LRC (syncedLyrics) varsa esli; yoksa duz sozler zamansiz.
//
// Onbellek: <KOKPIT_DIZIN>/sozler/<sha1(anahtar)>.json. Bulunan kalici (sozler degismez); "yok" 24 saat
// (LRCLIB'e sonradan eklenebilir). Ag hatasi onbellege YAZILMAZ ve reddetmez: { anahtar, yok: true,
// hata: true } doner ki Ada "alinamadi" diyebilsin ve sonraki cagri yeniden denesin.

const crypto = require('crypto');
const fs = require('fs');
const https = require('https');
const path = require('path');
const { log } = require('./log.cjs');

const TABAN = 'https://lrclib.net';
const ZAMAN_ASIMI_MS = 10 * 1000;
const YOK_OMRU_MS = 24 * 3600 * 1000;
const ONBELLEK_EN_COK = 200;
const GOVDE_EN_COK = 4 * 1024 * 1024;
/** Arama sonucunda sure bu kadar saniye icindeyse "ayni kayit" sayilir. */
const SURE_TOLERANS_SN = 3;

const ucusta = new Map(); // anahtar -> Promise<Sozler>

function varsayilanDizin() {
  return path.join(require('./config.cjs').KOKPIT_DIZIN, 'sozler');
}

const duz = (x) => (typeof x === 'string' ? x.replace(/\s+/g, ' ').trim() : '');

/** Parcanin kimligi: sanatci|baslik|album (kucuk harf, bosluk sadelesmis). Ham basliktan; temizle uygulanmaz. */
function anahtarUret(parca) {
  const p = parca && typeof parca === 'object' ? parca : {};
  return [p.sanatci, p.baslik, p.album].map((x) => duz(x).toLowerCase()).join('|');
}

// Aramayi bozan ekler. Yalniz arama sorgusunda kullanilir (ham baslik once denenir).
// ONDE: ekin basinda olmali ("(feat. X)", "(with X)", "- From "Film""); "(I Can't Live With You)" gibi
// baslik parcalari silinmesin diye "with" her yerde aranmaz. HER_YER: ekin icinde herhangi bir yerde.
// Basta duran parantez ("(I Can't Live With You) Tonight") basligin kendisidir, silinmez.
// Sinirlar \b degil harf siniflariyla: \b Turkce harfi (noktasiz i, s-cedilla) kelime saymiyor, "(Canli)" kacardi.
const ONDE = 'feat\\.?|ft\\.?|featuring|with|from';
const HER_YER =
  'remaster(?:ed)?|live|canl[ıi]|official|video|audio|lyrics?|visuali[sz]er|mv|hd|hq|4k|explicit|clean|' +
  'radio\\s+edit|edit|version|mono|stereo|deluxe|bonus\\s+track';
const SOL = '(?<![\\p{L}\\p{N}])';
const SAG = '(?![\\p{L}\\p{N}])';
const PARANTEZ_EKI = new RegExp(
  '(?<=\\S)\\s*[\\(\\[](?:\\s*(?:' + ONDE + ')' + SAG + '|[^\\)\\]]*?' + SOL + '(?:' + HER_YER + ')' + SAG + ')[^\\)\\]]*[\\)\\]]',
  'giu',
);
const TIRE_EKI = new RegExp(
  '\\s+[-–—]\\s+(?:(?:' + ONDE + ')' + SAG + '|[^-–—]*?' + SOL + '(?:' + HER_YER + ')' + SAG + ').*$',
  'iu',
);
const CIPLAK_FEAT = /\s+(?:feat\.?|ft\.|featuring)\s+.*$/iu;

/** "Song (Remastered 2011)", "Song - 2011 Remaster", "Song (feat. X)", "Song [Official Video]" -> "Song". */
function temizle(baslik) {
  const ham = duz(baslik);
  let s = ham;
  for (let i = 0; i < 3; i++) {
    const once = s;
    s = s.replace(PARANTEZ_EKI, '').replace(TIRE_EKI, '').replace(CIPLAK_FEAT, '');
    s = duz(s);
    if (s === once) break;
  }
  return s || ham;
}

/**
 * LRC metni -> [{ t, metin }], t (ms) artan. `[mm:ss.xx]`, `[mm:ss.xxx]`, `[mm:ss]`, satirda birden cok
 * zaman etiketi, `[offset:+/-ms]` (pozitif: sozler erken gelir). Meta etiketleri (`[ar:...]`) ve zaman
 * etiketsiz satirlar atlanir; bos metinli satir korunur (muzik arasi). Kelime zamanlari (`<mm:ss.xx>`) silinir.
 */
function lrcAyristir(metinGirdi) {
  if (typeof metinGirdi !== 'string') return [];
  const satirlar = [];
  let kayma = 0;
  const ZAMAN = /^\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/;
  for (const ham of metinGirdi.split(/\r?\n/)) {
    let s = ham.trim();
    const ofset = /^\[offset:\s*([+-]?\d+)\s*\]/i.exec(s);
    if (ofset) {
      kayma = Number(ofset[1]) || 0;
      continue;
    }
    const zamanlar = [];
    let m;
    while ((m = ZAMAN.exec(s))) {
      const dk = Number(m[1]);
      const sn = Number(m[2]);
      const kesir = m[3] ? Number(m[3].padEnd(3, '0')) : 0;
      if (sn < 60) zamanlar.push(dk * 60000 + sn * 1000 + kesir);
      s = s.slice(m[0].length).trimStart();
    }
    if (!zamanlar.length) continue; // meta etiketi ya da zamansiz satir
    const yazi = s.replace(/<\d{1,3}:\d{1,2}(?:[.:]\d{1,3})?>/g, '').replace(/\s+/g, ' ').trim();
    for (const t of zamanlar) satirlar.push({ t, metin: yazi });
  }
  for (const x of satirlar) x.t = Math.max(0, x.t - kayma);
  // Array.prototype.sort kararli: ayni zamanli satirlar metindeki sirayla kalir.
  return satirlar.sort((a, b) => a.t - b.t);
}

/** LRCLIB kaydi -> Sozler. Enstrumantal / bos -> yok. */
function kayittan(anahtar, k) {
  if (!k || typeof k !== 'object' || k.instrumental === true) return { anahtar, yok: true };
  if (typeof k.syncedLyrics === 'string' && k.syncedLyrics.trim()) {
    const satirlar = lrcAyristir(k.syncedLyrics);
    if (satirlar.some((x) => x.metin)) return { anahtar, satirlar, esli: true };
  }
  if (typeof k.plainLyrics === 'string' && k.plainLyrics.trim()) {
    const satirlar = k.plainLyrics
      .replace(/\s+$/, '')
      .split(/\r?\n/)
      .map((x) => ({ t: 0, metin: x.trim() }));
    while (satirlar.length && !satirlar[0].metin) satirlar.shift();
    return { anahtar, satirlar, esli: false };
  }
  return { anahtar, yok: true };
}

const sozluMu = (k) =>
  k && typeof k === 'object' && k.instrumental !== true &&
  ((typeof k.syncedLyrics === 'string' && k.syncedLyrics.trim()) || (typeof k.plainLyrics === 'string' && k.plainLyrics.trim()));
const esliMi = (k) => sozluMu(k) && typeof k.syncedLyrics === 'string' && !!k.syncedLyrics.trim();

/** Arama sonuclarindan: sureye +/-3 sn icinde en yakin (esli once); yoksa ilk esli; yoksa null. */
function aramadanSec(sonuclar, sureMs) {
  if (!Array.isArray(sonuclar)) return null;
  const sn = sureMs > 0 ? sureMs / 1000 : null;
  if (sn !== null) {
    const yakin = sonuclar
      .filter((k) => sozluMu(k) && Number.isFinite(Number(k.duration)) && Math.abs(Number(k.duration) - sn) <= SURE_TOLERANS_SN)
      .sort((a, b) => (esliMi(b) - esliMi(a)) || Math.abs(Number(a.duration) - sn) - Math.abs(Number(b.duration) - sn));
    if (yakin.length) return yakin[0];
  }
  return sonuclar.find(esliMi) || null;
}

/** Varsayilan istek: https, IPv4 (AAAA'siz alan adinda DNS ~12 sn bekliyor), 10 sn, govde siniri. */
function httpsIstek(url) {
  return new Promise((coz, reddet) => {
    let bitti = false;
    const son = (f, v) => {
      if (bitti) return;
      bitti = true;
      clearTimeout(zaman);
      f(v);
    };
    const req = https.get(url, { family: 4, timeout: ZAMAN_ASIMI_MS, headers: { 'User-Agent': 'Kokpit/4.0', Accept: 'application/json' } }, (res) => {
      const parcalar = [];
      let boy = 0;
      res.on('data', (d) => {
        boy += d.length;
        if (boy > GOVDE_EN_COK) {
          req.destroy(new Error('govde cok buyuk'));
          return;
        }
        parcalar.push(d);
      });
      res.on('end', () => son(coz, { kod: res.statusCode, govde: Buffer.concat(parcalar).toString('utf8') }));
      res.on('error', (e) => son(reddet, e));
    });
    // `timeout` yalniz bosta bekleyen soketi yakalar; toplam sure icin ayri zamanlayici.
    const zaman = setTimeout(() => req.destroy(new Error('zaman asimi')), ZAMAN_ASIMI_MS);
    req.on('timeout', () => req.destroy(new Error('zaman asimi')));
    req.on('error', (e) => son(reddet, e));
  });
}

function sorgu(yol, alanlar) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(alanlar)) if (v !== '' && v !== null && v !== undefined) q.set(k, String(v));
  return TABAN + yol + '?' + q.toString();
}

/** Bulunamadi -> null; 200 -> govde nesnesi; baska kod / bozuk JSON -> hata (onbellege yazilmaz). */
async function iste(istek, url) {
  const r = await istek(url);
  const kod = Number(r?.kod);
  if (kod === 404 || kod === 400) return null;
  if (kod !== 200) throw new Error('HTTP ' + kod);
  const g = r.govde;
  if (g && typeof g === 'object') return g;
  try {
    return JSON.parse(String(g));
  } catch {
    throw new Error('bozuk JSON');
  }
}

function dosyaYolu(dizin, anahtar) {
  return path.join(dizin, crypto.createHash('sha1').update(anahtar).digest('hex') + '.json');
}

function onbellektenOku(dizin, anahtar, simdi) {
  let k;
  try {
    k = JSON.parse(fs.readFileSync(dosyaYolu(dizin, anahtar), 'utf8'));
  } catch (e) {
    if (e.code !== 'ENOENT') log('sozler: onbellek dosyasi okunamadi, yeniden alinacak');
    return null;
  }
  if (!k || typeof k !== 'object' || k.anahtar !== anahtar) return null;
  if (k.yok === true) {
    const t = Number(k.t);
    if (Number.isFinite(t) && simdi - t < YOK_OMRU_MS && t <= simdi) return { anahtar, yok: true };
    return null; // suresi doldu: LRCLIB'e sonradan eklenmis olabilir
  }
  if (Array.isArray(k.satirlar) && typeof k.esli === 'boolean' &&
      k.satirlar.every((x) => x && Number.isFinite(x.t) && typeof x.metin === 'string')) {
    return { anahtar, satirlar: k.satirlar, esli: k.esli };
  }
  return null;
}

function onbellegeYaz(dizin, kayit) {
  try {
    fs.mkdirSync(dizin, { recursive: true });
    const hedef = dosyaYolu(dizin, kayit.anahtar);
    const gecici = hedef + '.' + process.pid + '.' + crypto.randomBytes(4).toString('hex') + '.tmp';
    fs.writeFileSync(gecici, JSON.stringify(kayit), 'utf8');
    fs.renameSync(gecici, hedef);
    budama(dizin);
  } catch (e) {
    log('sozler: onbellege yazilamadi: ' + e.message);
  }
}

/** En fazla ONBELLEK_EN_COK dosya; fazlasi en eskiden (mtime) silinir. */
function budama(dizin) {
  let dosyalar;
  try {
    dosyalar = fs.readdirSync(dizin).filter((a) => /^[0-9a-f]{40}\.json$/.test(a));
  } catch {
    return;
  }
  if (dosyalar.length <= ONBELLEK_EN_COK) return;
  const zamanli = [];
  for (const a of dosyalar) {
    try {
      zamanli.push({ a, t: fs.statSync(path.join(dizin, a)).mtimeMs });
    } catch {
      /* arada silindi */
    }
  }
  zamanli.sort((x, y) => x.t - y.t);
  for (const { a } of zamanli.slice(0, zamanli.length - ONBELLEK_EN_COK)) {
    try {
      fs.rmSync(path.join(dizin, a), { force: true });
    } catch {
      /* kilitli: bir dahaki budamada */
    }
  }
}

async function agdan(parca, anahtar, istek) {
  const baslik = duz(parca.baslik);
  const sanatci = duz(parca.sanatci);
  const album = duz(parca.album);
  const sure = Number(parca.sureMs) > 0 ? Math.round(Number(parca.sureMs) / 1000) : '';
  const temiz = temizle(baslik);
  // LRCLIB /api/get album ve sure ister; eksikse 400 doner, o da "bulunamadi" gibi aramaya duser.
  let k = await iste(istek, sorgu('/api/get', { track_name: baslik, artist_name: sanatci, album_name: album, duration: sure }));
  if (!k && temiz !== baslik) {
    k = await iste(istek, sorgu('/api/get', { track_name: temiz, artist_name: sanatci, album_name: album, duration: sure }));
  }
  if (k && !sozluMu(k) && k.instrumental !== true) k = null; // kayit var ama sozsuz: aramada baska kayit olabilir
  if (!k) {
    const sonuclar = await iste(istek, sorgu('/api/search', { track_name: temiz, artist_name: sanatci }));
    k = aramadanSec(sonuclar, Number(parca.sureMs) || 0);
  }
  return kayittan(anahtar, k);
}

/**
 * @param {{ baslik: string, sanatci: string, album?: string, sureMs?: number }} parca
 * @param {{ dizin?: string, istek?: (url: string) => Promise<{ kod: number, govde: string | object }>, simdi?: () => number }} secenek
 * @returns {Promise<{ anahtar: string, satirlar: { t: number, metin: string }[], esli: boolean } | { anahtar: string, yok: true, hata?: true }>}
 */
function getir(parca, secenek = {}) {
  const p = parca && typeof parca === 'object' ? parca : {};
  const anahtar = anahtarUret(p);
  if (!duz(p.baslik) || !duz(p.sanatci)) return Promise.resolve({ anahtar, yok: true });
  const dizin = secenek.dizin || varsayilanDizin();
  const istek = typeof secenek.istek === 'function' ? secenek.istek : httpsIstek;
  const simdi = typeof secenek.simdi === 'function' ? secenek.simdi : Date.now;
  const onbellek = onbellektenOku(dizin, anahtar, simdi());
  if (onbellek) return Promise.resolve(onbellek);
  const ucustaki = ucusta.get(dizin + '\n' + anahtar);
  if (ucustaki) return ucustaki;
  const is = agdan(p, anahtar, istek)
    .then((sonuc) => {
      onbellegeYaz(dizin, sonuc.yok ? { anahtar, yok: true, t: simdi() } : sonuc);
      return sonuc;
    })
    .catch((e) => {
      log('sozler: alinamadi (' + String(e && e.message).replace(/[^\x20-\x7e]/g, '?').slice(0, 120) + ')');
      return { anahtar, yok: true, hata: true };
    })
    .finally(() => ucusta.delete(dizin + '\n' + anahtar));
  ucusta.set(dizin + '\n' + anahtar, is);
  return is;
}

module.exports = { getir, lrcAyristir, anahtarUret, temizle };
