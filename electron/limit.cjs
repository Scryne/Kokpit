// Plan limitleri, oturum olmadan (v2.6). Statusline yalniz bir claude oturumu calisirken limit
// verir; Scryne limitleri "terminal acmadan da surekli" gormek istedi. Kaynak, Claude Code'un
// kendi /usage ekraninin okudugu uc: GET api.anthropic.com/api/oauth/usage (olculdu 2026-10-04:
// five_hour / seven_day -> utilization + resets_at, statusline'daki sayilarla ayni).
//
// Token: ~/.claude/.credentials.json (Claude Code'un kendi oturumu). Her yoklamada yeniden okunur
// (claude yeniledikce degisir). YALNIZ bu surecte kalir, yalniz api.anthropic.com'a gider; renderer'a,
// loga, diske hicbir yere yazilmaz. Kokpit token YENILEMEZ: refresh token donduren bir yenileme
// Claude Code'un elindeki kopyayi gecersiz kilabilir. Token suresi dolduysa (claude ~8 saattir
// acilmadiysa) son olcum "eski" olarak kalir; claude acilinca kendisi yeniler, sonraki yoklama tutar.
//
// Son olcum ~/.kokpit/limit.json'a yazilir: Kokpit acilir acilmaz Ada'da bir sayi olsun.
// Test kosuculari (KOKPIT_TEST_KABUK=1) gercek uca gitmez; KOKPIT_LIMIT_URL verilirse oraya gider.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { log } = require('./log.cjs');
const { KOKPIT_DIZIN } = require('./config.cjs');

const URL_ = process.env.KOKPIT_LIMIT_URL || 'https://api.anthropic.com/api/oauth/usage';
const KIMLIK = process.env.KOKPIT_KIMLIK || path.join(os.homedir(), '.claude', '.credentials.json');
const DOSYA = path.join(KOKPIT_DIZIN, 'limit.json');
const ARALIK_MS = 5 * 60 * 1000;
/** 429 / ag hatasinda aralik ikiye katlanir, en fazla bu kadar. */
const EN_UZUN_MS = 30 * 60 * 1000;
/** Elle tazeleme (Ada) en sik bu aralikla uca gider. */
const ELLE_EN_SIK_MS = Number(process.env.KOKPIT_LIMIT_ELLE_MS ?? 30 * 1000);
const ZAMAN_ASIMI_MS = 10 * 1000;

let son = null; // { besSaat, hafta, olculdu, kaynak: 'usage' }
let durum = 'bekliyor'; // 'tamam' | 'token-yok' | 'token-eski' | 'hata' | 'bekliyor'
let aralik = ARALIK_MS;
let zamanlayici = null;
let sonIstek = 0;
let ucusta = null;
let dinleyici = () => {};

/** Yanit govdesinden limitler. Bilinmeyen alanlar yok sayilir; ikisi de yoksa null. */
function ayristir(govde, simdi) {
  const limit = (x) => {
    const y = Number(x?.utilization);
    if (!x || !Number.isFinite(y)) return null;
    const t = Date.parse(x.resets_at);
    return { yuzde: Math.max(0, Math.min(100, y)), sifirlanma: Number.isFinite(t) ? t : null };
  };
  const besSaat = limit(govde?.five_hour);
  const hafta = limit(govde?.seven_day);
  if (!besSaat && !hafta) return null;
  return { besSaat, hafta, olculdu: simdi, kaynak: 'usage' };
}

function tokenOku() {
  try {
    const o = JSON.parse(fs.readFileSync(KIMLIK, 'utf8'))?.claudeAiOauth;
    if (!o || typeof o.accessToken !== 'string') return { token: null, sebep: 'token-yok' };
    if (Number.isFinite(o.expiresAt) && o.expiresAt < Date.now()) return { token: null, sebep: 'token-eski' };
    return { token: o.accessToken, sebep: null };
  } catch {
    return { token: null, sebep: 'token-yok' };
  }
}

function diskeYaz(l) {
  try {
    fs.mkdirSync(path.dirname(DOSYA), { recursive: true });
    const gecici = DOSYA + '.' + process.pid + '.tmp';
    fs.writeFileSync(gecici, JSON.stringify(l) + '\n', 'utf8');
    fs.renameSync(gecici, DOSYA);
  } catch (e) {
    log('limit yazilamadi: ' + e.message);
  }
}

function diskten() {
  try {
    const l = JSON.parse(fs.readFileSync(DOSYA, 'utf8'));
    if (l && Number.isFinite(l.olculdu) && (l.besSaat || l.hafta)) return l;
  } catch {
    /* ilk calisma */
  }
  return null;
}

function bildir() {
  try {
    dinleyici(son, durum);
  } catch (e) {
    log('limit dinleyici hatasi: ' + e.message);
  }
}

async function yokla() {
  if (ucusta) return ucusta;
  ucusta = (async () => {
    sonIstek = Date.now();
    const { token, sebep } = tokenOku();
    if (!token) {
      if (durum !== sebep) log('limit: ' + sebep + ' (son olcum korunuyor)');
      durum = sebep;
      bildir();
      return;
    }
    try {
      const r = await fetch(URL_, {
        headers: { Authorization: 'Bearer ' + token, 'anthropic-beta': 'oauth-2025-04-20', 'User-Agent': 'kokpit' },
        signal: AbortSignal.timeout(ZAMAN_ASIMI_MS),
      });
      if (r.status === 401 || r.status === 403) {
        durum = 'token-eski';
        log('limit: ' + r.status + ', token gecersiz (son olcum korunuyor)');
      } else if (!r.ok) {
        durum = 'hata';
        aralik = Math.min(EN_UZUN_MS, aralik * 2);
        log('limit: HTTP ' + r.status + ', sonraki yoklama ' + Math.round(aralik / 60000) + ' dk');
      } else {
        const l = ayristir(await r.json(), Date.now());
        if (!l) {
          durum = 'hata';
          log('limit: yanitta five_hour/seven_day yok');
        } else {
          son = l;
          durum = 'tamam';
          aralik = ARALIK_MS;
          diskeYaz(l);
        }
      }
    } catch (e) {
      durum = 'hata';
      aralik = Math.min(EN_UZUN_MS, aralik * 2);
      log('limit: istek basarisiz (' + e.message + ')');
    }
    bildir();
  })().finally(() => {
    ucusta = null;
  });
  return ucusta;
}

function planla() {
  clearTimeout(zamanlayici);
  zamanlayici = setTimeout(async () => {
    await yokla();
    planla();
  }, aralik);
}

/** @param {(l: object | null, durum: string) => void} d */
function baslat(d) {
  dinleyici = d;
  son = diskten();
  if (son) bildir();
  if (process.env.KOKPIT_TEST_KABUK === '1' && !process.env.KOKPIT_LIMIT_URL) return;
  void yokla().then(planla);
}

/** Ada'dan elle tazeleme. Siklik sinirli; uc yine en fazla ELLE_EN_SIK_MS'de bir sorulur. */
function tazele() {
  if (Date.now() - sonIstek < ELLE_EN_SIK_MS) return Promise.resolve();
  return yokla().then(planla);
}

/** Bilgisayar uykudan donunce limit pencereleri kaymis olabilir: hemen bir yoklama. */
function uyandi() {
  if (zamanlayici) void tazele();
}

function durdur() {
  clearTimeout(zamanlayici);
  zamanlayici = null;
}

module.exports = { baslat, tazele, uyandi, durdur, ayristir, son: () => son, durum: () => durum };
