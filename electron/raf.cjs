// v4.0, Ada'nin Raf sayfasi: Ada'ya birakilan dosya, klasor ve baglantilari gecici tutar. Dosya KOPYALANMAZ,
// yalniz yolu saklanir (raf bir isaret defteri; dosyanin sahibi yine yerinde). <KOKPIT_DIZIN>/raf.json.
//
// Yol renderer'a GITMEZ: Ada kimlikle ister, main yolu buradan cozer (yakala.cjs'teki ekler gibi). Boylece
// renderer'a sizan bir icerik "su yolu ac" diyemez; yalniz rafa main'in denetleyip koydugu yollar acilir.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const EN_COK = 24;
const EN_UZUN_ADRES = 2000;
const EN_UZUN_YOL = 4096;
const EN_BUYUK_ONIZLEME = 60 * 1024;
const GORUNTU_UZANTI = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.ico']);
const TURLER = new Set(['dosya', 'klasor', 'baglanti']);

const kimlik = (s) => crypto.createHash('sha1').update(s).digest('hex').slice(0, 12);

/** Mutlak, kontrol karaktersiz, makul uzunlukta yol. */
function yolUygun(yol) {
  return typeof yol === 'string' && yol.length > 0 && yol.length <= EN_UZUN_YOL && path.isAbsolute(yol) && !/[\u0000-\u001f]/.test(yol);
}

/** Yalniz http/https; kimlik bilgisi tasiyan adres (user:pass@) reddedilir: rafta duz metin parola durmasin. */
function adresCoz(adres) {
  if (typeof adres !== 'string') return null;
  const a = adres.trim();
  if (!a || a.length > EN_UZUN_ADRES || /[\s\u0000-\u001f]/.test(a)) return null;
  let u;
  try {
    u = new URL(a);
  } catch {
    return null;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  if (!u.hostname || u.username || u.password) return null;
  if (u.href.length > EN_UZUN_ADRES) return null;
  return u;
}

/** Baglantinin kartta gorunen adi: host (www'suz) + kisaltilmis yol. */
function baglantiAdi(u) {
  const host = u.hostname.replace(/^www\./, '');
  let yol = u.pathname === '/' ? '' : decodeURIComponentGuvenli(u.pathname).replace(/\/$/, '');
  if (yol.length > 40) yol = yol.slice(0, 18) + '…' + yol.slice(-18);
  return (host + yol).slice(0, 80);
}

function decodeURIComponentGuvenli(s) {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

function onizlemeUygun(o) {
  return typeof o === 'string' && o.startsWith('data:image/') && o.length <= EN_BUYUK_ONIZLEME ? o : null;
}

/** Diskten gelen kaydi dogrular; bozuksa null. */
function kayitDuzgun(r) {
  if (!r || typeof r !== 'object' || !TURLER.has(r.tur) || !Number.isFinite(r.t)) return null;
  if (r.tur === 'baglanti') {
    const u = adresCoz(r.adres);
    if (!u) return null;
    return { id: kimlik(u.href), tur: 'baglanti', ad: baglantiAdi(u), adres: u.href, boyut: null, onizleme: null, t: r.t };
  }
  if (!yolUygun(r.yol)) return null;
  const yol = path.resolve(r.yol);
  return {
    id: kimlik(yol),
    tur: r.tur,
    ad: typeof r.ad === 'string' && r.ad ? r.ad.slice(0, 260) : path.basename(yol) || yol,
    yol,
    boyut: r.tur === 'dosya' && Number.isFinite(r.boyut) && r.boyut >= 0 ? r.boyut : null,
    onizleme: onizlemeUygun(r.onizleme),
    t: r.t,
  };
}

/**
 * @param {{ dosya?: string, yayin: (l: object[]) => void, onizleme?: (yol: string) => string | null, simdi?: () => number }} s
 */
function kur({ dosya, yayin, onizleme, simdi = Date.now } = {}) {
  const { log } = require('./log.cjs');
  const DOSYA = dosya || path.join(require('./config.cjs').KOKPIT_DIZIN, 'raf.json');
  let kapali = false;

  /** Kayitlar en yeni once; liste sirasi budur, budama sondan yapilir. */
  let kayitlar = oku();

  function oku() {
    try {
      const ham = JSON.parse(fs.readFileSync(DOSYA, 'utf8'));
      const gorulen = new Set();
      return (Array.isArray(ham?.ogeler) ? ham.ogeler : [])
        .map(kayitDuzgun)
        .filter((r) => r && !gorulen.has(r.id) && gorulen.add(r.id))
        .slice(0, EN_COK);
    } catch (e) {
      if (e.code !== 'ENOENT') {
        log('raf: dosya okunamadi, bos raf: ' + e.message);
        try {
          fs.copyFileSync(DOSYA, DOSYA + '.bozuk');
        } catch {
          /* kopyalanamadi */
        }
      }
      return [];
    }
  }

  function kaydet() {
    const gecici = DOSYA + '.' + process.pid + '.tmp';
    try {
      fs.mkdirSync(path.dirname(DOSYA), { recursive: true });
      fs.writeFileSync(gecici, JSON.stringify({ surum: 1, ogeler: kayitlar }) + '\n', 'utf8');
      fs.renameSync(gecici, DOSYA);
    } catch (e) {
      log('raf: yazilamadi: ' + e.message);
      try {
        fs.unlinkSync(gecici);
      } catch {
        /* yok */
      }
    }
  }

  function liste() {
    return kayitlar.map((r) => {
      const o = { id: r.id, ad: r.ad, tur: r.tur, boyut: r.boyut, onizleme: r.onizleme, t: r.t, var: r.tur === 'baglanti' ? true : fs.existsSync(r.yol) };
      if (r.tur === 'baglanti') o.adres = r.adres;
      return o;
    });
  }

  function degisti() {
    while (kayitlar.length > EN_COK) kayitlar.pop();
    kaydet();
    if (kapali || !yayin) return;
    try {
      yayin(liste());
    } catch (e) {
      log('raf: yayin hatasi: ' + e.message);
    }
  }

  /** Ayni kimlik varsa cikarilir; yeni kayit en uste. */
  function oneKoy(r) {
    kayitlar = [r, ...kayitlar.filter((x) => x.id !== r.id)];
  }

  return {
    liste,
    /** @returns {number} kabul edilen yol sayisi (yeni ya da tazelenen) */
    ekle(yollar) {
      if (kapali) return 0;
      const dizi = typeof yollar === 'string' ? [yollar] : Array.isArray(yollar) ? yollar : [];
      let n = 0;
      for (const ham of dizi.slice(0, 100)) {
        if (!yolUygun(ham)) continue;
        const yol = path.resolve(ham);
        let st;
        try {
          st = fs.statSync(yol);
        } catch {
          continue;
        }
        const klasor = st.isDirectory();
        if (!klasor && !st.isFile()) continue;
        let on = null;
        if (!klasor && onizleme && GORUNTU_UZANTI.has(path.extname(yol).toLowerCase())) {
          try {
            on = onizlemeUygun(onizleme(yol));
          } catch {
            on = null;
          }
        }
        oneKoy({ id: kimlik(yol), tur: klasor ? 'klasor' : 'dosya', ad: path.basename(yol) || yol, yol, boyut: klasor ? null : st.size, onizleme: on, t: simdi() });
        n++;
      }
      if (n) degisti();
      return n;
    },
    /** @returns {boolean} */
    baglantiEkle(adres) {
      if (kapali) return false;
      const u = adresCoz(adres);
      if (!u) return false;
      oneKoy({ id: kimlik(u.href), tur: 'baglanti', ad: baglantiAdi(u), adres: u.href, boyut: null, onizleme: null, t: simdi() });
      degisti();
      return true;
    },
    /** @returns {number} silinen sayisi */
    sil(kimlikler) {
      if (kapali) return 0;
      const once = kayitlar.length;
      if (kimlikler === 'hepsi') kayitlar = [];
      else if (Array.isArray(kimlikler)) {
        const s = new Set(kimlikler.filter((k) => typeof k === 'string'));
        kayitlar = kayitlar.filter((r) => !s.has(r.id));
      }
      const silinen = once - kayitlar.length;
      if (silinen) degisti();
      return silinen;
    },
    /** Yalniz dosya/klasor ve hala yerindeyse yol; baglanti ve kayip dosya null. */
    yol(id) {
      const r = kayitlar.find((x) => x.id === id);
      if (!r || r.tur === 'baglanti' || !fs.existsSync(r.yol)) return null;
      return r.yol;
    },
    /** Ham kayit (yol ve adres dahil): yalniz main icinde kullanilir. */
    oge(id) {
      const r = kayitlar.find((x) => x.id === id);
      return r ? { ...r } : null;
    },
    kapat() {
      kapali = true;
    },
  };
}

module.exports = { kur, adresCoz };
