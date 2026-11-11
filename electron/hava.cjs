// v4.0, Ada'nin Hava sayfasi: Open-Meteo (anahtarsiz, kayitsiz). Istege yalniz secilen konumun enlem/boylami
// gider; kullaniciya dair baska hicbir sey yok.
//
// Onbellek: bellekte + <KOKPIT_DIZIN>/hava.json (son olcum). 20 dk taze; elle tazeleme bile en sik 60 sn'de
// bir gercek istek (Ada'da tazele dugmesine art arda basmak servise yuk olmasin). Ag yoksa diskteki son
// olcum ayni konumunsa "bayat" isaretiyle doner: bos sayfa yerine 2 saat onceki hava daha faydali.

const fs = require('fs');
const path = require('path');
const https = require('https');

const TAZE_MS = 20 * 60 * 1000;
const EN_SIK_MS = 60 * 1000;
const BAYAT_SINIR_MS = 6 * 3600 * 1000;
const ZAMAN_ASIMI_MS = 10 * 1000;
const EN_BUYUK_GOVDE = 2 * 1024 * 1024;

// ---------------------------------------------------------------------------------------------------
// WMO hava kodlari (Open-Meteo belgesindeki tablo)

const KODLAR = {
  0: ['Açık', 'acik'],
  1: ['Az bulutlu', 'parcali'],
  2: ['Parçalı bulutlu', 'parcali'],
  3: ['Kapalı', 'Cloud'],
  45: ['Sisli', 'CloudFog'],
  48: ['Kırağılı sis', 'CloudFog'],
  51: ['Hafif çisenti', 'CloudDrizzle'],
  53: ['Çisenti', 'CloudDrizzle'],
  55: ['Yoğun çisenti', 'CloudDrizzle'],
  56: ['Dondurucu çisenti', 'CloudDrizzle'],
  57: ['Yoğun dondurucu çisenti', 'CloudDrizzle'],
  61: ['Hafif yağmurlu', 'CloudRain'],
  63: ['Yağmurlu', 'CloudRain'],
  65: ['Şiddetli yağmur', 'CloudRainWind'],
  66: ['Dondurucu yağmur', 'CloudRain'],
  67: ['Şiddetli dondurucu yağmur', 'CloudRainWind'],
  71: ['Hafif karlı', 'CloudSnow'],
  73: ['Karlı', 'CloudSnow'],
  75: ['Yoğun kar', 'CloudSnow'],
  77: ['Kar taneleri', 'CloudSnow'],
  80: ['Hafif sağanak', 'CloudRain'],
  81: ['Sağanak', 'CloudRainWind'],
  82: ['Şiddetli sağanak', 'CloudRainWind'],
  85: ['Kar sağanağı', 'CloudSnow'],
  86: ['Yoğun kar sağanağı', 'CloudSnow'],
  95: ['Gök gürültülü fırtına', 'CloudLightning'],
  96: ['Dolulu fırtına', 'CloudLightning'],
  99: ['Şiddetli dolulu fırtına', 'CloudLightning'],
};

/** null/bos/metin kod "0" (acik) sanilmasin: yalniz tam sayi. */
function kodBul(kod) {
  return Number.isInteger(kod) ? KODLAR[kod] : undefined;
}

/** WMO kodu -> Turkce metin. Bilinmeyen kod "Belirsiz". */
function kodMetni(kod, _gunduz = true) {
  const k = kodBul(kod);
  return k ? k[0] : 'Belirsiz';
}

/** WMO kodu -> lucide ikon ADI. Bilinmeyen kod bulut (tarafsiz). Tek kaynak burasi. */
function kodIkonu(kod, gunduz = true) {
  const k = kodBul(kod);
  if (!k) return 'Cloud';
  const gece = gunduz === false;
  if (k[1] === 'acik') return gece ? 'Moon' : 'Sun';
  if (k[1] === 'parcali') return gece ? 'CloudMoon' : 'CloudSun';
  return k[1];
}

// ---------------------------------------------------------------------------------------------------
// Ag

/** Varsayilan istek: IPv4 zorunlu (AAAA'siz alan adinda bu makinede DNS ~12 sn), 10 sn zaman asimi. */
function istekAt(url) {
  return new Promise((coz, reddet) => {
    const r = https.get(url, { family: 4, timeout: ZAMAN_ASIMI_MS, headers: { 'User-Agent': 'Kokpit/4.0', Accept: 'application/json' } }, (yanit) => {
      let govde = '';
      let boy = 0;
      yanit.setEncoding('utf8');
      yanit.on('data', (p) => {
        boy += p.length;
        if (boy > EN_BUYUK_GOVDE) {
          r.destroy(Object.assign(new Error('yanıt çok büyük'), { code: 'BUYUK' }));
          return;
        }
        govde += p;
      });
      yanit.on('end', () => coz({ kod: yanit.statusCode, govde }));
      yanit.on('error', reddet);
    });
    r.on('timeout', () => r.destroy(Object.assign(new Error('zaman aşımı'), { code: 'ETIMEDOUT' })));
    r.on('error', reddet);
  });
}

/** Kullaniciya gosterilecek kisa neden. */
function hataNedeni(e) {
  const kod = e && e.code;
  if (kod === 'ETIMEDOUT' || kod === 'ESOCKETTIMEDOUT') return 'zaman aşımı.';
  if (kod === 'ENOTFOUND' || kod === 'EAI_AGAIN' || kod === 'ECONNREFUSED' || kod === 'ECONNRESET' || kod === 'ENETUNREACH') return 'bağlantı yok.';
  if (kod === 'DURUM') return 'sunucu ' + e.durum + ' hatası verdi.';
  if (kod === 'BICIM') return 'sunucu yanıtı geçersiz.';
  return 'bağlantı kurulamadı.';
}

async function jsonGetir(url, istek) {
  const { kod, govde } = await istek(url);
  if (kod !== 200) throw Object.assign(new Error('durum ' + kod), { code: 'DURUM', durum: kod });
  try {
    return typeof govde === 'string' ? JSON.parse(govde) : govde;
  } catch {
    throw Object.assign(new Error('json degil'), { code: 'BICIM' });
  }
}

// ---------------------------------------------------------------------------------------------------
// Konum ve ceviri

function konumGecerli(k) {
  return (
    !!k &&
    typeof k === 'object' &&
    typeof k.ad === 'string' &&
    Number.isFinite(k.enlem) &&
    Number.isFinite(k.boylam) &&
    Math.abs(k.enlem) <= 90 &&
    Math.abs(k.boylam) <= 180
  );
}

function konumSade(k) {
  const s = { ad: k.ad.slice(0, 120), enlem: k.enlem, boylam: k.boylam };
  if (typeof k.bolge === 'string' && k.bolge) s.bolge = k.bolge.slice(0, 120);
  if (typeof k.ulke === 'string' && k.ulke) s.ulke = k.ulke.slice(0, 120);
  return s;
}

function konumAnahtari(k) {
  return k.enlem.toFixed(3) + ',' + k.boylam.toFixed(3);
}

const tam = (x) => (Number.isFinite(Number(x)) && x !== null ? Math.round(Number(x)) : null);

/** Open-Meteo forecast yaniti -> HavaDurumu. Zorunlu alan yoksa BICIM hatasi. */
function cevir(j, konum, simdi) {
  const c = j && j.current;
  const sicaklik = tam(c && c.temperature_2m);
  if (!c || sicaklik === null || !Number.isFinite(Number(c.weather_code))) throw Object.assign(new Error('current yok'), { code: 'BICIM' });
  const saatlik = [];
  const h = j.hourly || {};
  const ht = Array.isArray(h.time) ? h.time : [];
  for (let i = 0; i < ht.length && saatlik.length < 12; i++) {
    const t = Number(ht[i]) * 1000;
    if (!Number.isFinite(t) || t <= simdi) continue;
    const s = tam(h.temperature_2m && h.temperature_2m[i]);
    if (s === null) continue;
    saatlik.push({ t, sicaklik: s, kod: tam(h.weather_code && h.weather_code[i]) ?? 0, yagis: tam(h.precipitation_probability && h.precipitation_probability[i]) ?? 0 });
  }
  const gunluk = [];
  const g = j.daily || {};
  const gt = Array.isArray(g.time) ? g.time : [];
  const fark = Number.isFinite(Number(j.utc_offset_seconds)) ? Number(j.utc_offset_seconds) : 0;
  for (let i = 0; i < gt.length && gunluk.length < 5; i++) {
    const t = Number(gt[i]);
    const enYuksek = tam(g.temperature_2m_max && g.temperature_2m_max[i]);
    const enDusuk = tam(g.temperature_2m_min && g.temperature_2m_min[i]);
    if (!Number.isFinite(t) || enYuksek === null || enDusuk === null) continue;
    // timezone=auto: gunun baslangici konumun yerel gece yarisi; konumun takvim gunu ofsetle bulunur.
    gunluk.push({
      gun: new Date((t + fark) * 1000).toISOString().slice(0, 10),
      enYuksek,
      enDusuk,
      kod: tam(g.weather_code && g.weather_code[i]) ?? 0,
      yagis: tam(g.precipitation_probability_max && g.precipitation_probability_max[i]) ?? 0,
    });
  }
  return {
    konum: konumSade(konum),
    sicaklik,
    hissedilen: tam(c.apparent_temperature) ?? sicaklik,
    kod: tam(c.weather_code),
    gunduz: Number(c.is_day) !== 0,
    ruzgar: tam(c.wind_speed_10m) ?? 0,
    nem: tam(c.relative_humidity_2m) ?? 0,
    saatlik,
    gunluk,
    olculdu: simdi,
  };
}

// ---------------------------------------------------------------------------------------------------
// Onbellek

/** dizin|konum -> { durum, sonIstek, sonSonuc, ucusta } */
const bellek = new Map();

function dosyaYolu(dizin) {
  return path.join(dizin || require('./config.cjs').KOKPIT_DIZIN, 'hava.json');
}

function diskOku(dosya, anahtar) {
  try {
    const j = JSON.parse(fs.readFileSync(dosya, 'utf8'));
    const d = j && j.durum;
    if (j.anahtar === anahtar && d && Number.isFinite(d.olculdu) && Number.isFinite(d.sicaklik) && konumGecerli(d.konum)) return d;
  } catch {
    /* ilk calisma ya da bozuk dosya: onbellek yok */
  }
  return null;
}

function diskeYaz(dosya, anahtar, durum) {
  const gecici = dosya + '.' + process.pid + '.tmp';
  try {
    fs.mkdirSync(path.dirname(dosya), { recursive: true });
    fs.writeFileSync(gecici, JSON.stringify({ surum: 1, anahtar, durum }) + '\n', 'utf8');
    fs.renameSync(gecici, dosya);
  } catch (e) {
    require('./log.cjs').log('hava: yazilamadi: ' + e.message);
    try {
      fs.unlinkSync(gecici);
    } catch {
      /* yok */
    }
  }
}

/**
 * @param {{ ad: string, enlem: number, boylam: number } | null} konum
 * @param {{ dizin?: string, istek?: (url: string) => Promise<{ kod: number, govde: string }>, simdi?: () => number, taze?: boolean }} secenek
 * @returns {Promise<object>} HavaSonucu (asla reddetmez)
 */
async function getir(konum, secenek = {}) {
  if (!konumGecerli(konum)) return { konumYok: true };
  const { dizin, istek = istekAt, simdi = Date.now, taze = false } = secenek || {};
  const dosya = dosyaYolu(dizin);
  const anahtar = konumAnahtari(konum);
  const kb = dosya + '|' + anahtar;
  let k = bellek.get(kb);
  if (!k) {
    k = { durum: diskOku(dosya, anahtar), sonIstek: 0, sonSonuc: null, ucusta: null };
    bellek.set(kb, k);
  }
  const t = simdi();
  if (!taze && k.durum && t - k.durum.olculdu < TAZE_MS) return { ...k.durum, konum: konumSade(konum) };
  // Gercek istek en sik 60 sn'de bir: arada son sonuc (olcum, bayat olcum ya da hata) aynen doner.
  if (t - k.sonIstek < EN_SIK_MS && k.sonSonuc) return k.sonSonuc;
  if (k.ucusta) return k.ucusta;
  k.sonIstek = t;
  const url =
    'https://api.open-meteo.com/v1/forecast?latitude=' +
    konum.enlem.toFixed(4) +
    '&longitude=' +
    konum.boylam.toFixed(4) +
    '&current=temperature_2m,apparent_temperature,is_day,weather_code,wind_speed_10m,relative_humidity_2m' +
    '&hourly=temperature_2m,weather_code,precipitation_probability' +
    '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max' +
    '&timezone=auto&forecast_days=5&timeformat=unixtime';
  k.ucusta = (async () => {
    let sonuc;
    try {
      const j = await jsonGetir(url, istek);
      const durum = cevir(j, konum, simdi());
      k.durum = durum;
      diskeYaz(dosya, anahtar, durum);
      sonuc = durum;
    } catch (e) {
      try {
        require('./log.cjs').log('hava: alinamadi: ' + (e && e.message));
      } catch {
        /* log yok */
      }
      const eski = k.durum || diskOku(dosya, anahtar);
      if (eski && simdi() - eski.olculdu <= BAYAT_SINIR_MS) sonuc = { ...eski, konum: konumSade(konum), bayat: true };
      else sonuc = { hata: 'Hava durumu alınamadı: ' + hataNedeni(e) };
    }
    k.sonSonuc = sonuc;
    k.ucusta = null;
    return sonuc;
  })();
  return k.ucusta;
}

/**
 * Sehir arama (Open-Meteo geocoding). 2 karakterden kisa sorgu bos liste. Ag hatasi bos liste (asla reddetmez).
 * @returns {Promise<{ ad: string, bolge?: string, ulke?: string, enlem: number, boylam: number }[]>}
 */
async function ara(sorgu, secenek = {}) {
  const s = typeof sorgu === 'string' ? sorgu.normalize('NFC').replace(/\s+/g, ' ').trim().slice(0, 80) : '';
  if ([...s].length < 2) return [];
  const { istek = istekAt } = secenek || {};
  const url = 'https://geocoding-api.open-meteo.com/v1/search?name=' + encodeURIComponent(s) + '&count=6&language=tr&format=json';
  let j;
  try {
    j = await jsonGetir(url, istek);
  } catch (e) {
    try {
      require('./log.cjs').log('hava: arama basarisiz: ' + (e && e.message));
    } catch {
      /* log yok */
    }
    return [];
  }
  const sonuc = [];
  for (const r of Array.isArray(j && j.results) ? j.results : []) {
    const k = { ad: typeof r.name === 'string' ? r.name : '', enlem: Number(r.latitude), boylam: Number(r.longitude) };
    if (typeof r.admin1 === 'string' && r.admin1) k.bolge = r.admin1;
    if (typeof r.country === 'string' && r.country) k.ulke = r.country;
    if (k.ad && konumGecerli(k)) sonuc.push(konumSade(k));
    if (sonuc.length >= 6) break;
  }
  return sonuc;
}

module.exports = { getir, ara, kodMetni, kodIkonu, cevir, KODLAR };
