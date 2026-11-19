// Usta: Opus'un kod islerini devrettigi ucuz model iscisi (OpenCode Go). Bu modul anahtarin ve model
// seciminin tek yazaridir: ~/.kokpit/usta.json. Isci betigi (scripts/usta.py) ayni dosyayi okur.
//
// Anahtar DPAPI ile sifreli durur (dpapi.cjs). Renderer'a, log'a, hata metnine ve IPC donusune ASLA
// girmez; renderer yalniz "var mi" ve son dort karakteri gorur.
//
// Kokpit'in terminal sekmelerine dokunmaz: ana oturumlar Claude'da kalir, ucuz model yalniz iscide.
// Fikir ve ortam esleme kayisu dalindaki saglayici.cjs + ds-isci.ps1'den (Emre Kaan Atas) geldi.
const fs = require('fs');
const path = require('path');
const https = require('https');
const { KOKPIT_DIZIN } = require('./config.cjs');
const dpapi = require('./dpapi.cjs');

const DOSYA = path.join(KOKPIT_DIZIN, 'usta.json');
const IS_DIZIN = path.join(KOKPIT_DIZIN, 'usta', 'is');

// OpenCode Go'nun Anthropic bicimli ucu. Claude Code bu ucun "dogrulanmis istemcisi": oturum
// basligini kendisi gonderir (opencode.ai/v2/docs/console/go, 2026-11-19).
const VARSAYILAN_URL = 'https://opencode.ai/inference/go/anthropic';
const VARSAYILAN_MODEL = 'glm-5.3';
// Claude Code'un arka plan cagrilari (baslik, ozet) icin: kucuk ve hizli.
const VARSAYILAN_HAFIF = 'deepseek-v4.1-flash';

const ZAMAN_ASIMI_MS = 15000;
const KONTROL = /[\u0000-\u001f\u007f]/;
const MODEL_DESENI = /^[A-Za-z0-9._:/\-[\]]{1,100}$/;

function varsayilan() {
  return {
    surum: 1,
    baseUrl: VARSAYILAN_URL,
    anahtar: null, // { dpapi, ipucu, kaydedildi }
    model: VARSAYILAN_MODEL,
    hafifModel: VARSAYILAN_HAFIF,
    modeller: [], // [{ id, ad }]
    modellerZamani: null,
    dogrulama: null, // { durum: 'gecerli'|'gecersiz'|'ulasilamadi', zaman }
  };
}

function urlGecerli(x) {
  if (typeof x !== 'string' || !x || x.length > 500 || KONTROL.test(x)) return false;
  try {
    const u = new URL(x);
    return u.protocol === 'https:' && Boolean(u.host);
  } catch {
    return false;
  }
}

const modelGecerli = (x) => typeof x === 'string' && MODEL_DESENI.test(x);

/** Diskteki kaydi sablonla birlestirir; bozuk alan varsayilana doner. Icerik log'a yazilmaz. */
function oku() {
  const s = varsayilan();
  let ham = null;
  try {
    ham = JSON.parse(fs.readFileSync(DOSYA, 'utf8'));
  } catch {
    return s;
  }
  if (!ham || typeof ham !== 'object') return s;
  if (urlGecerli(ham.baseUrl)) s.baseUrl = ham.baseUrl;
  if (modelGecerli(ham.model)) s.model = ham.model;
  if (modelGecerli(ham.hafifModel)) s.hafifModel = ham.hafifModel;
  const a = ham.anahtar;
  if (a && typeof a === 'object' && typeof a.dpapi === 'string' && a.dpapi) {
    s.anahtar = {
      dpapi: a.dpapi,
      ipucu: typeof a.ipucu === 'string' ? a.ipucu.slice(0, 4) : '',
      kaydedildi: typeof a.kaydedildi === 'string' ? a.kaydedildi : null,
    };
  }
  if (Array.isArray(ham.modeller)) {
    s.modeller = ham.modeller
      .filter((m) => m && modelGecerli(m.id))
      .map((m) => ({ id: m.id, ad: typeof m.ad === 'string' ? m.ad.slice(0, 100) : m.id }))
      .slice(0, 200);
  }
  if (typeof ham.modellerZamani === 'string') s.modellerZamani = ham.modellerZamani;
  const d = ham.dogrulama;
  if (d && ['gecerli', 'gecersiz', 'ulasilamadi'].includes(d.durum)) s.dogrulama = { durum: d.durum, zaman: String(d.zaman || '') };
  return s;
}

/** Atomik yazim: yarim JSON kalmaz. */
function yaz(ayar) {
  fs.mkdirSync(path.dirname(DOSYA), { recursive: true });
  const gecici = DOSYA + '.' + process.pid + '.tmp';
  fs.writeFileSync(gecici, JSON.stringify(ayar, null, 2) + '\n', 'utf8');
  fs.renameSync(gecici, DOSYA);
}

/** Renderer'in gordugu: anahtarin kendisi DEGIL. */
function disa(a) {
  return {
    baseUrl: a.baseUrl,
    varsayilanUrl: a.baseUrl === VARSAYILAN_URL,
    anahtarVar: Boolean(a.anahtar),
    ipucu: a.anahtar ? a.anahtar.ipucu : '',
    kaydedildi: a.anahtar ? a.anahtar.kaydedildi : null,
    model: a.model,
    hafifModel: a.hafifModel,
    modeller: a.modeller,
    modellerZamani: a.modellerZamani,
    dogrulama: a.dogrulama,
  };
}

function gorunum() {
  return disa(oku());
}

/** GET; IPv4 (bu makinede AAAA'siz alan adinda cift yigin DNS ~12 sn takiliyor). Anahtar yalniz baslikta. */
function getir(url, anahtar) {
  return new Promise((coz) => {
    const basliklar = { 'User-Agent': 'kokpit-usta/1.0', Accept: 'application/json', 'anthropic-version': '2023-06-01' };
    if (anahtar) basliklar.Authorization = 'Bearer ' + anahtar;
    let r;
    try {
      r = https.get(url, { family: 4, timeout: ZAMAN_ASIMI_MS, headers: basliklar }, (yanit) => {
        const parcalar = [];
        let boyut = 0;
        yanit.on('data', (p) => {
          boyut += p.length;
          if (boyut > 2_000_000) r.destroy();
          else parcalar.push(p);
        });
        yanit.on('end', () => {
          let json = null;
          try {
            json = JSON.parse(Buffer.concat(parcalar).toString('utf8'));
          } catch {
            /* govde JSON degil */
          }
          coz({ durum: yanit.statusCode || 0, json });
        });
        yanit.on('error', () => coz({ durum: 0, json: null }));
      });
    } catch {
      coz({ durum: 0, json: null });
      return;
    }
    r.on('timeout', () => r.destroy());
    r.on('error', () => coz({ durum: 0, json: null }));
  });
}

const modellerUrl = (baseUrl) => baseUrl.replace(/\/+$/, '') + '/v1/models';

/** Model listesini ceker (uc anahtarsiz da listeler). Iki bicimi de okur: Anthropic {display_name}, OpenAI {name}. */
async function modelleriYenile() {
  const a = oku();
  const { durum, json } = await getir(modellerUrl(a.baseUrl), null);
  if (durum !== 200 || !json || !Array.isArray(json.data)) {
    return { ok: false, hata: 'Model listesi alınamadı. Bağlantıyı ve Base URL’i kontrol edip tekrar dene.', gorunum: disa(a) };
  }
  const modeller = json.data
    .filter((m) => m && modelGecerli(m.id))
    .map((m) => ({ id: m.id, ad: String(m.display_name || m.name || m.id).slice(0, 100) }))
    .slice(0, 200);
  const yeni = { ...a, modeller, modellerZamani: new Date().toISOString() };
  yaz(yeni);
  return { ok: true, gorunum: disa(yeni) };
}

/**
 * Anahtari dogrular: /v1/models anahtarsiz 200, gecersiz anahtarla 401 doner (2026-11-19 olculdu).
 * Token harcamaz. Gecersizse KAYDEDILMEZ; ulasilamazsa kaydedilir, durum "ulasilamadi" kalir.
 */
async function anahtarKaydet(anahtar) {
  const a = oku();
  if (typeof anahtar !== 'string') return { ok: false, hata: 'Geçersiz anahtar.', gorunum: disa(a) };
  const temiz = anahtar.trim();
  if (!temiz || temiz.length > 500 || KONTROL.test(temiz) || /\s/.test(temiz)) {
    return { ok: false, hata: 'Anahtar boşluk ya da satır sonu içeremez, en fazla 500 karakter olabilir.', gorunum: disa(a) };
  }
  const { durum } = await getir(modellerUrl(a.baseUrl), temiz);
  const zaman = new Date().toISOString();
  if (durum === 401 || durum === 403) {
    return { ok: false, hata: 'OpenCode anahtarı reddetti. Konsoldan kopyaladığın anahtarı kontrol et.', gorunum: disa(a) };
  }
  let sifreli;
  try {
    sifreli = dpapi.sifrele(temiz);
  } catch {
    return { ok: false, hata: 'Anahtar şifrelenemedi, kaydedilmedi.', gorunum: disa(a) };
  }
  const yeni = {
    ...a,
    anahtar: { dpapi: sifreli, ipucu: temiz.slice(-4), kaydedildi: zaman },
    dogrulama: { durum: durum === 200 ? 'gecerli' : 'ulasilamadi', zaman },
  };
  try {
    yaz(yeni);
  } catch {
    return { ok: false, hata: 'Ayar dosyası yazılamadı.', gorunum: disa(a) };
  }
  return { ok: true, gorunum: disa(yeni) };
}

/** Kayitli anahtari yeniden dogrular (cozup ayni uca sorar). */
async function anahtarSina() {
  const a = oku();
  if (!a.anahtar) return { ok: false, hata: 'Kayıtlı anahtar yok.', gorunum: disa(a) };
  let acik;
  try {
    acik = dpapi.coz(a.anahtar.dpapi);
  } catch {
    return { ok: false, hata: 'Kayıtlı anahtar çözülemedi; yeniden gir.', gorunum: disa(a) };
  }
  const { durum } = await getir(modellerUrl(a.baseUrl), acik);
  const sonuc = durum === 200 ? 'gecerli' : durum === 401 || durum === 403 ? 'gecersiz' : 'ulasilamadi';
  const yeni = { ...a, dogrulama: { durum: sonuc, zaman: new Date().toISOString() } };
  yaz(yeni);
  return { ok: sonuc === 'gecerli', hata: sonuc === 'gecersiz' ? 'Anahtar artık geçerli değil.' : sonuc === 'ulasilamadi' ? 'OpenCode’a ulaşılamadı.' : undefined, gorunum: disa(yeni) };
}

function anahtarSil() {
  const a = oku();
  const yeni = { ...a, anahtar: null, dogrulama: null };
  yaz(yeni);
  return { ok: true, gorunum: disa(yeni) };
}

/** Model / hafif model / Base URL yamasi. Gecersiz alan varsa hicbir sey yazilmaz. */
function ayarKaydet(yama) {
  const a = oku();
  if (!yama || typeof yama !== 'object') return { ok: false, hata: 'Geçersiz ayar.', gorunum: disa(a) };
  const yeni = { ...a };
  if ('model' in yama) {
    if (!modelGecerli(yama.model)) return { ok: false, hata: 'Geçersiz model adı.', gorunum: disa(a) };
    yeni.model = yama.model;
  }
  if ('hafifModel' in yama) {
    if (!modelGecerli(yama.hafifModel)) return { ok: false, hata: 'Geçersiz model adı.', gorunum: disa(a) };
    yeni.hafifModel = yama.hafifModel;
  }
  if ('baseUrl' in yama) {
    const url = yama.baseUrl === '' || yama.baseUrl === null ? VARSAYILAN_URL : yama.baseUrl;
    if (!urlGecerli(url)) return { ok: false, hata: 'Base URL bir https adresi olmalı.', gorunum: disa(a) };
    if (url !== a.baseUrl) {
      // Baska uca gecince eski dogrulama ve model listesi o uca ait degil.
      yeni.baseUrl = url;
      yeni.dogrulama = null;
      yeni.modeller = [];
      yeni.modellerZamani = null;
    }
  }
  try {
    yaz(yeni);
  } catch {
    return { ok: false, hata: 'Ayar dosyası yazılamadı.', gorunum: disa(a) };
  }
  return { ok: true, gorunum: disa(yeni) };
}

/**
 * Isci gunlugu: scripts/usta.py her is icin ~/.kokpit/usta/is/<id>/durum.json yazar. Son N is
 * ve model bazli ozet (karar verilmis islerde kabul orani). Bozuk dosya atlanir.
 */
function isler(adet = 25) {
  let adlar = [];
  try {
    adlar = fs.readdirSync(IS_DIZIN);
  } catch {
    return { isler: [], ozet: [] };
  }
  const liste = [];
  for (const ad of adlar) {
    try {
      const d = JSON.parse(fs.readFileSync(path.join(IS_DIZIN, ad, 'durum.json'), 'utf8'));
      if (!d || typeof d.id !== 'string') continue;
      const turlar = Array.isArray(d.turlar) ? d.turlar : [];
      const son = turlar[turlar.length - 1] || {};
      const kabul = Array.isArray(son.kabul) ? son.kabul : [];
      liste.push({
        id: d.id,
        baslik: String(d.baslik || '').slice(0, 160),
        proje: String(d.proje || '').slice(0, 80),
        model: String(d.model || ''),
        baslangic: String(d.baslangic || ''),
        tur: turlar.length,
        sureSn: turlar.reduce((t, x) => t + (Number(x.sureSn) || 0), 0),
        ciktiToken: turlar.reduce((t, x) => t + (Number(x.ciktiToken) || 0), 0),
        kabulGecti: kabul.length ? kabul.every((k) => k && k.gecti) : null,
        degisiklik: d.degisiklik && typeof d.degisiklik === 'object' ? d.degisiklik : null,
        karar: ['kabul', 'duzeltip-kabul', 'ret'].includes(d.karar) ? d.karar : null,
        calisiyor: d.durum === 'calisiyor',
      });
    } catch {
      /* bozuk ya da yarim is */
    }
  }
  liste.sort((x, y) => (x.baslangic < y.baslangic ? 1 : -1));
  const gruplar = new Map();
  for (const i of liste) {
    const g = gruplar.get(i.model) || { model: i.model, is: 0, kabul: 0, duzeltip: 0, ret: 0, tur: 0 };
    g.is += 1;
    g.tur += i.tur;
    if (i.karar === 'kabul') g.kabul += 1;
    else if (i.karar === 'duzeltip-kabul') g.duzeltip += 1;
    else if (i.karar === 'ret') g.ret += 1;
    gruplar.set(i.model, g);
  }
  return { isler: liste.slice(0, adet), ozet: [...gruplar.values()].sort((x, y) => y.is - x.is) };
}

module.exports = { gorunum, modelleriYenile, anahtarKaydet, anahtarSina, anahtarSil, ayarKaydet, isler, DOSYA, IS_DIZIN, VARSAYILAN_URL };
