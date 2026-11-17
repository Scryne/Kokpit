// Model saglayici ayari: Kokpit'in actigi claude oturumlari hangi API'ye gitsin. ~/.kokpit/saglayici.json.
// Anahtar DUZ METIN olarak kullanici profilinde durur; log'a, hataya, renderer'a ve IPC donusune
// ASLA girmez. Okuma her cagrida diskten (onbellek yok): secim bir sonraki sekmede aninda gecerli.
const fs = require('fs');
const path = require('path');
const { KOKPIT_DIZIN } = require('./config.cjs');

const DOSYA = path.join(KOKPIT_DIZIN, 'saglayici.json');

const SAGLAYICILAR = ['varsayilan', 'anthropic', 'opencode', 'deepseek', 'ozel'];
const EFORLAR = ['varsayilan', 'low', 'medium', 'high', 'xhigh', 'max'];
const ANAHTARLI = ['anthropic', 'opencode', 'deepseek', 'ozel'];
// Base URL'li saglayicilar: ayni alanlar, ayni dogrulama ve ayni ortam yolu.
const URLLI = ['opencode', 'deepseek', 'ozel'];

// PTY ortamina mudahale ettigimiz tum adlar. ANTHROPIC_SMALL_FAST_MODEL deprecated: yalniz
// silinir, asla yazilmaz (miras kalan deger yeni oturumlara sizmasin).
const YONETILEN = [
  'ANTHROPIC_BASE_URL',
  'ANTHROPIC_AUTH_TOKEN',
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_MODEL',
  'ANTHROPIC_DEFAULT_OPUS_MODEL',
  'ANTHROPIC_DEFAULT_SONNET_MODEL',
  'ANTHROPIC_DEFAULT_HAIKU_MODEL',
  'ANTHROPIC_DEFAULT_FABLE_MODEL',
  'CLAUDE_CODE_SUBAGENT_MODEL',
  'CLAUDE_CODE_EFFORT_LEVEL',
  'CLAUDE_CODE_AUTO_COMPACT_WINDOW',
  'ANTHROPIC_SMALL_FAST_MODEL',
];

// ANTHROPIC_API_KEY HICBIR saglayicida silinmez: ortamdan miras alinan gercek anahtara
// dokunulmaz. Anthropic anahtari API_KEY (x-api-key) olarak, DeepSeek/Ozel anahtari
// AUTH_TOKEN (Bearer) olarak yazilir; Claude Code'da AUTH_TOKEN onceliklidir.
const SILINEN = YONETILEN.filter((ad) => ad !== 'ANTHROPIC_API_KEY');

const HATA_ANAHTAR = 'API anahtarı en fazla 500 karakter olabilir; satır sonu ve kontrol karakteri içeremez.';
const HATA_URL = 'Base URL geçerli bir http/https adresi olmalı (en fazla 500 karakter).';
const HATA_MODEL = 'Model adı en fazla 200 karakter olabilir; kontrol karakteri içeremez.';
const HATA_BAGLAM = 'Bağlam penceresi 100000 ile 1000000 arasında bir tam sayı olmalı.';

function varsayilan() {
  return {
    surum: 1,
    secili: 'varsayilan',
    efor: 'varsayilan',
    saglayicilar: {
      anthropic: { anahtar: '' },
      opencode: {
        anahtar: '',
        baseUrl: 'https://opencode.ai/inference/go/anthropic',
        model: 'deepseek-v4.1-flash[1m]',
        hafifModel: 'deepseek-v4.1-flash',
        altModel: 'deepseek-v4.1-flash',
        baglam: 786432,
      },
      deepseek: {
        anahtar: '',
        baseUrl: 'https://api.deepseek.com/anthropic',
        model: 'deepseek-flash[1m]',
        hafifModel: 'deepseek-flash',
        altModel: 'deepseek-flash',
        baglam: 786432,
      },
      ozel: {
        anahtar: '',
        baseUrl: '',
        model: '',
        hafifModel: '',
        altModel: '',
        baglam: 0,
      },
    },
  };
}

// Kontrol karakterleri (CR/LF dahil) hicbir metin alanina giremez: PTY env'ine satir sonu
// sokmak komut zincirini bozabilir.
const KONTROL = /[\u0000-\u001f\u007f]/;

function metinGecerli(x, azami) {
  return typeof x === 'string' && x.length <= azami && !KONTROL.test(x);
}

function urlGecerli(x) {
  if (!metinGecerli(x, 500) || x === '') return false;
  try {
    const u = new URL(x);
    return (u.protocol === 'http:' || u.protocol === 'https:') && Boolean(u.host);
  } catch {
    return false;
  }
}

function anahtarGecerli(x) {
  return typeof x === 'string' && x.length <= 500 && !KONTROL.test(x);
}

/** Diskteki kaydi sablonla birlestirir; bozuk ya da elle bozulmus deger varsayilana doner. */
function oku() {
  const sonuc = varsayilan();
  let ham = null;
  try {
    ham = JSON.parse(fs.readFileSync(DOSYA, 'utf8'));
  } catch {
    // Dosya yok ya da bozuk: varsayilanlarla devam. Icerik log'a yazilmaz (anahtar olabilir).
  }
  if (!ham || typeof ham !== 'object') return sonuc;
  if (SAGLAYICILAR.includes(ham.secili)) sonuc.secili = ham.secili;
  if (EFORLAR.includes(ham.efor)) sonuc.efor = ham.efor;
  const hs = ham.saglayicilar;
  if (!hs || typeof hs !== 'object') return sonuc;

  if (hs.anthropic && typeof hs.anthropic === 'object' && anahtarGecerli(hs.anthropic.anahtar)) {
    sonuc.saglayicilar.anthropic.anahtar = hs.anthropic.anahtar;
  }
  for (const ad of URLLI) {
    const kaynak = hs[ad];
    if (!kaynak || typeof kaynak !== 'object') continue;
    const hedef = sonuc.saglayicilar[ad];
    if (anahtarGecerli(kaynak.anahtar)) hedef.anahtar = kaynak.anahtar;
    // Bos deger ozel bir durum degil, "yazilmamis" sayilir: on tanimi dolu saglayicida (opencode,
    // deepseek) preset korunur — arayuz Base URL'i salt okunur gosterir ve yamaya koymaz, diskteki
    // bos deger aksi halde kullaniciyi cikissiz birakirdi. On tanimi bos saglayicida (ozel) hedef
    // zaten bos kalir; kullanici kendisi doldurur.
    if (typeof kaynak.baseUrl === 'string' && kaynak.baseUrl.length <= 500 && urlGecerli(kaynak.baseUrl)) {
      hedef.baseUrl = kaynak.baseUrl;
    }
    for (const alan of ['model', 'hafifModel', 'altModel']) {
      if (metinGecerli(kaynak[alan], 200)) hedef[alan] = kaynak[alan];
    }
    if (kaynak.baglam === 0 || kaynak.baglam === null) hedef.baglam = 0;
    else if (Number.isInteger(kaynak.baglam) && kaynak.baglam >= 100000 && kaynak.baglam <= 1000000) {
      hedef.baglam = kaynak.baglam;
    }
  }
  return sonuc;
}

function kopya(ayar) {
  return JSON.parse(JSON.stringify(ayar));
}

/** Atomik yazim (ayarlar.cjs deseni): yarim JSON kalmaz. */
function yaz(ayar) {
  fs.mkdirSync(path.dirname(DOSYA), { recursive: true });
  const gecici = DOSYA + '.' + process.pid + '.tmp';
  fs.writeFileSync(gecici, JSON.stringify(ayar, null, 2) + '\n', 'utf8');
  fs.renameSync(gecici, DOSYA);
}

/** Renderer'a giden gorunum: anahtarin kendisi DEGIL, yalniz var/yok bilgisi. */
function disa(ayar) {
  const urlli = (ad) => {
    const p = ayar.saglayicilar[ad];
    return {
      baseUrl: p.baseUrl,
      anahtarVar: p.anahtar !== '',
      model: p.model,
      hafifModel: p.hafifModel,
      altModel: p.altModel,
      baglam: p.baglam,
    };
  };
  return {
    secili: ayar.secili,
    efor: ayar.efor,
    anthropic: { anahtarVar: ayar.saglayicilar.anthropic.anahtar !== '' },
    ...Object.fromEntries(URLLI.map((ad) => [ad, urlli(ad)])),
  };
}

function gorunum() {
  return disa(oku());
}

/**
 * Yamayi dogrular ve atomik yazar. Gecersiz alan varsa HICBIR SEY yazilmaz; mevcut degerler
 * korunur (kullanici diyalogu acik tutup hatayi gorur). Hata metinleri anahtar icermez.
 */
function kaydet(yama) {
  const mevcut = oku();
  if (!yama || typeof yama !== 'object') {
    return { ok: false, hata: 'Geçersiz ayar.', gorunum: disa(mevcut) };
  }

  const hatalar = [];
  const yeni = kopya(mevcut);

  if ('secili' in yama) {
    if (SAGLAYICILAR.includes(yama.secili)) yeni.secili = yama.secili;
    else hatalar.push('Geçersiz sağlayıcı seçimi.');
  }
  if ('efor' in yama) {
    if (EFORLAR.includes(yama.efor)) yeni.efor = yama.efor;
    else hatalar.push('Geçersiz efor seviyesi.');
  }

  for (const ad of ANAHTARLI) {
    const blok = yama[ad];
    if (!blok || typeof blok !== 'object') continue;
    const hedef = yeni.saglayicilar[ad];

    // anahtarSil kazanir: anahtar ayni yamada gelse bile silinir.
    if (blok.anahtarSil === true) {
      hedef.anahtar = '';
    } else if ('anahtar' in blok) {
      if (!anahtarGecerli(blok.anahtar)) hatalar.push(HATA_ANAHTAR);
      else hedef.anahtar = blok.anahtar;
    }

    if (ad === 'anthropic') continue; // Anthropic'te baseUrl/model alani yok

    if ('baseUrl' in blok) {
      if (typeof blok.baseUrl === 'string' && blok.baseUrl !== '') {
        if (!urlGecerli(blok.baseUrl)) hatalar.push(HATA_URL);
        else hedef.baseUrl = blok.baseUrl;
      } else if (blok.baseUrl === '') {
        hedef.baseUrl = '';
      } else {
        hatalar.push(HATA_URL);
      }
    }
    for (const alan of ['model', 'hafifModel', 'altModel']) {
      if (!(alan in blok)) continue;
      if (!metinGecerli(blok[alan], 200)) hatalar.push(HATA_MODEL);
      else hedef[alan] = blok[alan];
    }
    if ('baglam' in blok) {
      if (blok.baglam === 0 || blok.baglam === null) {
        hedef.baglam = 0;
      } else if (Number.isInteger(blok.baglam) && blok.baglam >= 100000 && blok.baglam <= 1000000) {
        hedef.baglam = blok.baglam;
      } else {
        hatalar.push(HATA_BAGLAM);
      }
    }
  }

  // Ust duzey anahtarSil: secili (yama.secili varsa o, yoksa mevcut secili) saglayicinin anahtari.
  if (yama.anahtarSil === true) {
    const hedefAd = ANAHTARLI.includes(yama.secili) ? yama.secili : mevcut.secili;
    if (ANAHTARLI.includes(hedefAd)) yeni.saglayicilar[hedefAd].anahtar = '';
  }

  if (hatalar.length > 0) {
    return { ok: false, hata: [...new Set(hatalar)].join(' '), gorunum: disa(mevcut) };
  }

  // Etkin saglayici icin baseUrl zorunlu: bossa sessizce gercek Anthropic'e dusmesin.
  const adlar = { opencode: 'OpenCode Go', deepseek: 'DeepSeek', ozel: 'Özel API' };
  for (const ad of URLLI) {
    if (yeni.secili === ad && yeni.saglayicilar[ad].baseUrl === '') {
      return { ok: false, hata: adlar[ad] + ' için Base URL gerekli.', gorunum: disa(mevcut) };
    }
  }

  try {
    yaz(yeni);
  } catch {
    return { ok: false, hata: 'Sağlayıcı ayarı yazılamadı.', gorunum: disa(mevcut) };
  }
  return { ok: true, gorunum: disa(yeni) };
}

/**
 * PTY sunucusunun uygulayacagi ortam. `sil` temiz ORTAM'dan once silinir, `ekle` sonra yazilir.
 * DeepSeek/OpenCode Go/Ozel: anahtar bos -> miras AUTH_TOKEN/API_KEY korunur; dolu -> AUTH_TOKEN uzerine yazilir.
 * Donen nesnede anahtar degerleri vardir; yalniz PTY sunucusu kullanir, log'a yazilmaz.
 */
function ortam() {
  const ayar = oku();
  const secili = ayar.secili;
  const efor = ayar.efor !== 'varsayilan' ? ayar.efor : '';
  const sil = [];
  const ekle = {};

  if (secili === 'varsayilan') {
    if (efor) ekle.CLAUDE_CODE_EFFORT_LEVEL = efor;
    return { secili, efor: ayar.efor, model: '', sil, ekle };
  }

  if (secili === 'anthropic') {
    // API_KEY silinMEZ: kullanicinin ortamdan miras aldigi gercek anahtar ezilmesin.
    // Kullanici anahtar yazarsa API_KEY (x-api-key) olarak uzerine yazilir; Anthropic
    // endpoint'i AUTH_TOKEN (Bearer) degil bu basligi kullanir.
    for (const ad of SILINEN) sil.push(ad);
    const anahtar = ayar.saglayicilar.anthropic.anahtar;
    if (anahtar) ekle.ANTHROPIC_API_KEY = anahtar;
    if (efor) ekle.CLAUDE_CODE_EFFORT_LEVEL = efor;
    return { secili, efor: ayar.efor, model: '', sil, ekle };
  }

  // opencode / deepseek / ozel: yonetilenler (API_KEY ve AUTH_TOKEN HARIC) silinir, secilenler yazilir.
  // Anahtar alani bos = "ortamdan miras": miras AUTH_TOKEN korunur; doluysa Object.assign
  // ile uzerine yazilir. Turetilen anahtar yalniz AUTH_TOKEN (Bearer) olarak eklenir.
  // baseUrl bossa hata yok; o anahtar eklenmez (kaydet zaten bos baseUrl'i reddeder).
  for (const ad of SILINEN) if (ad !== 'ANTHROPIC_AUTH_TOKEN') sil.push(ad);
  const p = ayar.saglayicilar[secili];
  if (urlGecerli(p.baseUrl)) ekle.ANTHROPIC_BASE_URL = p.baseUrl;
  if (p.anahtar) ekle.ANTHROPIC_AUTH_TOKEN = p.anahtar;
  if (p.model) {
    ekle.ANTHROPIC_MODEL = p.model;
    ekle.ANTHROPIC_DEFAULT_OPUS_MODEL = p.model;
    ekle.ANTHROPIC_DEFAULT_SONNET_MODEL = p.model;
    ekle.ANTHROPIC_DEFAULT_FABLE_MODEL = p.model;
  }
  const hafif = p.hafifModel || p.model;
  if (hafif) ekle.ANTHROPIC_DEFAULT_HAIKU_MODEL = hafif;
  const alt = p.altModel || p.hafifModel || p.model;
  if (alt) ekle.CLAUDE_CODE_SUBAGENT_MODEL = alt;
  if (Number.isInteger(p.baglam) && p.baglam > 0) {
    ekle.CLAUDE_CODE_AUTO_COMPACT_WINDOW = String(p.baglam);
  }
  if (efor) ekle.CLAUDE_CODE_EFFORT_LEVEL = efor;
  return { secili, efor: ayar.efor, model: p.model || '', sil, ekle };
}

module.exports = { gorunum, kaydet, ortam, DOSYA };
