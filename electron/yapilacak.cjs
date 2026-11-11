// v4.0, Ada'nin Liste sayfasi: yapilacaklar. Saf cekirdek (uygula / tarihAyikla / sirala) + ince kosucu (kur).
// ~/.kokpit/yapilacaklar.json, tek yazar main sureci. Vault'a degil: bu Scryne'in gunluk el listesi; kalici
// bilgi ya da proje vadesi degil (vadeler vault'taki proje notunda yasar, Takvim ikisini birlikte gosterir).

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { brifingGunu } = require('./brifing.cjs');

const EN_COK_OGE = 200;
const EN_UZUN_METIN = 300;
/** Bitenler bu kadar gun sonra listeden kendiliginden duser (temizle demeye gerek kalmasin). */
const BITEN_OMRU_MS = 7 * 86400_000;

// ---------------------------------------------------------------------------------------------------
// Metin ve tarih yardimcilari

/** Kontrol karakterleri bosluga, bosluklar teke; NFC. */
function metinTemizle(ham) {
  return String(ham ?? '')
    .normalize('NFC')
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ')
    .replace(/[\p{Zl}\p{Zp}]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tarihMetni(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

/** 'YYYY-MM-DD' gercek bir takvim gunu mu (2026-02-30 degil). */
function tarihGecerli(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, a, g] = s.split('-').map(Number);
  const d = new Date(y, a - 1, g, 12);
  return d.getFullYear() === y && d.getMonth() === a - 1 && d.getDate() === g;
}

/** Turkce kucuk harf, UZUNLUK KORUNARAK (eslesme konumu ozgun metinde ayni yere duser). */
function kucukHarf(s) {
  let out = '';
  for (const c of s) {
    const l = c.toLocaleLowerCase('tr-TR');
    out += l.length === c.length ? l : c;
  }
  return out;
}

// Gun adlari: JS getDay sirasiyla (0 pazar). Aksansiz yazim da kabul (klavyeden "sali", whisper'dan "Salı").
const GUN_KALIP = [
  ['pazartesi', 1],
  ['sal[ıi]', 2],
  ['[çc]ar[şs]amba', 3],
  ['per[şs]embe', 4],
  ['cumartesi', 6],
  ['cuma', 5],
  ['pazar', 0],
];
const AY_KALIP = ['ocak', '[şs]ubat', 'mart', 'nisan', 'may[ıi]s', 'haziran', 'temmuz', 'a[ğg]ustos', 'eyl[üu]l', 'ekim', 'kas[ıi]m', 'aral[ıi]k'];
const GUN = '(?:' + GUN_KALIP.map(([k]) => k).join('|') + ')';
const GUNU = String.raw`(?:\s+g[üu]n[üu])?`;
const AY = '(?:' + AY_KALIP.join('|') + ')';
// Taninan tarih ifadeleri. Siralama onemli: uzun olan once (cumartesi > cuma, ISO > gun.ay).
const IFADE = [
  String.raw`\d{4}-\d{2}-\d{2}`,
  String.raw`\d{1,2}\s+` + AY + String.raw`(?:\s+\d{4})?`,
  String.raw`\d{1,2}[./]\d{1,2}(?:[./]\d{4})?`,
  'bug[üu]n',
  'yar[ıi]n',
  String.raw`[öo]b[üu]r\s?g[üu]n`,
  String.raw`haftaya(?:\s+` + GUN + GUNU + ')?',
  GUN + GUNU,
].join('|');
// Ifadeden sonra harf/rakam/kesme gelmez ("yarına", "cumartesi"nin "cuma"si, "12.11.2026"nin "12.11"i degil).
const SON_SINIR = String.raw`(?![\p{L}\p{N}'’]|[./]\d)`;
const BAS_KALIP = new RegExp('^(' + IFADE + ')' + SON_SINIR + String.raw`\s*([:,;])?\s*`, 'u');
const SON_KALIP = new RegExp(String.raw`(^|\s*[:,;]\s*|\s+)(` + IFADE + String.raw`)[.!]*$`, 'u');

// Bastaki goreli ifadeden sonra bu sozcuklerden biri gelirse ifade cumlenin parcasidir ("yarın için sunumu
// bitir", "yarın sabah koşu", "yarın 14:00 toplantı"): tarih atanir, metin BOZULMAZ.
const BAGLI_SONRA = new Set(['için', 'icin', 'kadar', 'önce', 'once', 'sonra', 'sabah', 'sabahı', 'öğle', 'öğlen', 'öğleden', 'akşam', 'aksam', 'akşamı', 'gece', 'gecesi', 'saat', 'de', 'da', 've', 'ile', 'gibi', 'mi', 'mı', 'mu', 'mü', 'ki', 'olan', 'değil', 'ise', 'yine', 'tekrar']);
// Sondaki ifadeden once bu sozcuklerden biri varsa ifade bir obegin parcasidir ("en geç yarın", "bu cuma").
const BAGLI_ONCE = new Set(['en', 'geç', 'gec', 'bu', 'gelecek', 'önümüzdeki', 'onumuzdeki', 'sonraki', 've', 'veya', 'ya', 'da', 'de', 'ile', 'değil', 'ki', 'hatta', 'belki', 'yani', 'mesela']);
const GORELI = /^(?:bug[üu]n|yar[ıi]n|[öo]b[üu]r\s?g[üu]n|haftaya)$/u;

/** Referans gunun yerel ogle vakti (gun ekleme yaz saatinde kaymasin). */
function referans(simdi) {
  const [y, a, g] = brifingGunu(simdi).split('-').map(Number);
  return new Date(y, a - 1, g, 12);
}

function gunEkle(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

/** Tek bir taninmis ifadeyi (kucuk harf) tarihe cevirir; gecersizse null. */
function ifadeTarihi(ifade, simdi) {
  const bugun = referans(simdi);
  const s = ifade.replace(/\s+/g, ' ');
  if (/^bug[üu]n$/u.test(s)) return tarihMetni(bugun);
  if (/^yar[ıi]n$/u.test(s)) return tarihMetni(gunEkle(bugun, 1));
  if (/^[öo]b[üu]r ?g[üu]n$/u.test(s)) return tarihMetni(gunEkle(bugun, 2));
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m) return tarihGecerli(s) ? s : null;
  const gunNo = (ad) => {
    for (const [k, n] of GUN_KALIP) if (new RegExp('^' + k + '$', 'u').test(ad)) return n;
    return null;
  };
  m = /^haftaya(?: (\S+)(?: g[üu]n[üu])?)?$/u.exec(s);
  if (m) {
    if (!m[1]) return tarihMetni(gunEkle(bugun, 7));
    const n = gunNo(m[1]);
    if (n === null) return null;
    // Haftalar pazartesi baslar: gelecek haftanin pazartesisi + gunun haftadaki yeri.
    const pazartesi = gunEkle(bugun, -((bugun.getDay() + 6) % 7) + 7);
    return tarihMetni(gunEkle(pazartesi, (n + 6) % 7));
  }
  m = /^(\S+)(?: g[üu]n[üu])?$/u.exec(s);
  if (m && gunNo(m[1]) !== null) {
    // Ciplak gun adi: bugunden SONRAKI ilk o gun (bugun saliysa "salı" gelecek hafta).
    const fark = (gunNo(m[1]) - bugun.getDay() + 7) % 7 || 7;
    return tarihMetni(gunEkle(bugun, fark));
  }
  let gun = null;
  let ay = null;
  let yil = null;
  m = /^(\d{1,2}) (\S+)(?: (\d{4}))?$/u.exec(s);
  if (m) {
    const i = AY_KALIP.findIndex((k) => new RegExp('^' + k + '$', 'u').test(m[2]));
    if (i < 0) return null;
    gun = Number(m[1]);
    ay = i + 1;
    yil = m[3] ? Number(m[3]) : null;
  } else {
    m = /^(\d{1,2})[./](\d{1,2})(?:[./](\d{4}))?$/.exec(s);
    if (!m) return null;
    gun = Number(m[1]);
    ay = Number(m[2]);
    yil = m[3] ? Number(m[3]) : null;
  }
  if (ay < 1 || ay > 12 || gun < 1 || gun > 31) return null;
  const metin = (y) => y + '-' + String(ay).padStart(2, '0') + '-' + String(gun).padStart(2, '0');
  if (yil !== null) return tarihGecerli(metin(yil)) ? metin(yil) : null;
  // Yilsiz tarih gecmiste kaldiysa bir sonraki yil (kasimda "3 ocak" gelecek ocaktir).
  let y = bugun.getFullYear();
  if (metin(y) < tarihMetni(bugun)) y += 1;
  return tarihGecerli(metin(y)) ? metin(y) : null;
}

/**
 * Metnin BASINDA ya da SONUNDA bir tarih ifadesi varsa ayiklar. Ortadaki ifadeye dokunmaz.
 *
 * Kural (sirayla):
 *  1. Basta ifade + ayrac (":" "," ";") -> ifade ve ayrac metinden silinir. "yarın: rapor yaz" -> "rapor yaz".
 *  2. Basta GORELI ifade (bugün/yarın/öbür gün/haftaya) + anlamli metin -> ifade silinir. "yarın rapor yaz".
 *     Ama ardindaki sozcuk bir baglacsa (için, kadar, sabah, akşam, saat, de, rakam ...) ifade cumlenin
 *     parcasidir: tarih atanir, metin aynen kalir. "yarın için sunumu bitir".
 *  3. Basta GUN ADI ya da TAKVIM tarihi + ayracsiz metin -> tarih atanir, metin aynen kalir ("pazar
 *     alışverişi", "cuma namazı", "12 kasım toplantısı" gibi ad obeklerini bozmamak icin).
 *  4. Sonda ifade (onunde bosluk ya da ayrac) -> ifade silinir. "rapor yaz yarın", "sunum provası, cuma".
 *     Onundeki sozcuk bir niteleyiciyse ("en geç yarın", "bu cuma") tarih atanir, metin aynen kalir.
 *  5. Ifadeden baska bir sey kalmiyorsa ("yarın") tarih atanir, metin aynen kalir.
 * Taninmazsa tarih null, metin aynen (yalniz bosluklar sadelesir).
 * @returns {{ metin: string, tarih: string | null }}
 */
function tarihAyikla(metin, simdi = Date.now()) {
  const temiz = metinTemizle(metin);
  if (!temiz) return { metin: '', tarih: null };
  const kucuk = kucukHarf(temiz);

  const bas = BAS_KALIP.exec(kucuk);
  if (bas) {
    const tarih = ifadeTarihi(bas[1], simdi);
    if (tarih) {
      const kalan = temiz.slice(bas[0].length).trim();
      if (!kalan) return { metin: temiz, tarih };
      if (bas[2]) return { metin: kalan, tarih };
      if (!GORELI.test(bas[1].replace(/\s+/g, ' '))) return { metin: temiz, tarih };
      const ilk = kucukHarf(kalan).split(/[\s,.;:!?]+/)[0];
      if (BAGLI_SONRA.has(ilk) || /^\d/.test(ilk)) return { metin: temiz, tarih };
      return { metin: kalan, tarih };
    }
  }

  const son = SON_KALIP.exec(kucuk);
  if (son && son.index > 0) {
    const tarih = ifadeTarihi(son[2], simdi);
    if (tarih) {
      const govde = temiz.slice(0, son.index).trim();
      const onceki = kucukHarf(govde).split(/\s+/).pop();
      if (!govde || BAGLI_ONCE.has(onceki)) return { metin: temiz, tarih };
      return { metin: govde.replace(/[\s,:;]+$/, ''), tarih };
    }
  }
  return { metin: temiz, tarih: null };
}

// ---------------------------------------------------------------------------------------------------
// Liste cekirdegi

function yeniId() {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 12);
}

/** Diskten gelen ogeyi dogrular; bozuksa null. */
function ogeDuzgun(o) {
  if (!o || typeof o !== 'object') return null;
  if (typeof o.id !== 'string' || !/^[0-9a-f]{1,32}$/i.test(o.id)) return null;
  const metin = metinTemizle(o.metin);
  if (!metin || [...metin].length > EN_UZUN_METIN) return null;
  if (!Number.isFinite(o.t)) return null;
  const bitti = o.bitti === true;
  return {
    id: o.id,
    metin,
    bitti,
    t: o.t,
    bittiT: bitti ? (Number.isFinite(o.bittiT) ? o.bittiT : o.t) : null,
    tarih: tarihGecerli(o.tarih) ? o.tarih : null,
  };
}

function metinDenetle(ham) {
  if (typeof ham !== 'string') return { hata: 'Metin boş olamaz.' };
  const metin = metinTemizle(ham);
  if (!metin) return { hata: 'Metin boş olamaz.' };
  if ([...metin].length > EN_UZUN_METIN) return { hata: 'Metin en fazla ' + EN_UZUN_METIN + ' karakter olabilir.' };
  return { metin };
}

function tarihDenetle(ham) {
  if (ham === null || ham === undefined || ham === '') return { tarih: null };
  return tarihGecerli(ham) ? { tarih: ham } : { hata: 'Tarih geçersiz (YYYY-AA-GG bekleniyor).' };
}

/**
 * Komutu uygular. SAF: girdi listesini degistirmez.
 * `ekle`de `tarih` HIC verilmemisse metnin basi/sonu tarihAyikla ile taranir ("yarın rapor yaz");
 * `tarih: null` verilmisse tarama yapilmaz (Scryne tarihi bilerek kaldirmistir).
 * @returns {{ liste: object[], oge?: object } | { hata: string }}
 */
function uygula(liste, komut, simdi = Date.now()) {
  const l = Array.isArray(liste) ? liste.map(ogeDuzgun).filter(Boolean) : [];
  if (!komut || typeof komut !== 'object') return { hata: 'Geçersiz komut.' };
  const bul = (id) => (typeof id === 'string' ? l.findIndex((o) => o.id === id) : -1);
  switch (komut.tur) {
    case 'ekle': {
      if (l.length >= EN_COK_OGE) return { hata: 'Liste dolu (en fazla ' + EN_COK_OGE + ' öğe). Bitenleri temizle.' };
      let { metin, hata } = metinDenetle(komut.metin);
      if (hata) return { hata };
      let tarih = null;
      if (komut.tarih === undefined) {
        const a = tarihAyikla(metin, simdi);
        if (a.tarih && a.metin) ({ metin, tarih } = a);
      } else {
        const t = tarihDenetle(komut.tarih);
        if (t.hata) return { hata: t.hata };
        tarih = t.tarih;
      }
      let id = yeniId();
      while (bul(id) >= 0) id = yeniId();
      const oge = { id, metin, bitti: false, t: simdi, bittiT: null, tarih };
      return { liste: [...l, oge], oge };
    }
    case 'degistir': {
      const i = bul(komut.id);
      if (i < 0) return { hata: 'Öğe bulunamadı.' };
      if (typeof komut.bitti !== 'boolean') return { hata: 'Geçersiz komut.' };
      const oge = { ...l[i], bitti: komut.bitti, bittiT: komut.bitti ? (l[i].bitti ? l[i].bittiT : simdi) : null };
      l[i] = oge;
      return { liste: l, oge };
    }
    case 'duzenle': {
      const i = bul(komut.id);
      if (i < 0) return { hata: 'Öğe bulunamadı.' };
      const { metin, hata } = metinDenetle(komut.metin);
      if (hata) return { hata };
      let tarih = l[i].tarih;
      if ('tarih' in komut) {
        const t = tarihDenetle(komut.tarih);
        if (t.hata) return { hata: t.hata };
        tarih = t.tarih;
      }
      const oge = { ...l[i], metin, tarih };
      l[i] = oge;
      return { liste: l, oge };
    }
    case 'sil': {
      const i = bul(komut.id);
      if (i < 0) return { hata: 'Öğe bulunamadı.' };
      const [oge] = l.splice(i, 1);
      return { liste: l, oge };
    }
    case 'temizle':
      return { liste: l.filter((o) => !o.bitti) };
    default:
      return { hata: 'Geçersiz komut.' };
  }
}

/**
 * Gosterim sirasi: bitmemisler once (tarihliler tarihe gore artan, sonra tarihsizler yeni en ustte),
 * bitenler sonda (yeni biten ustte). SAF, yeni dizi.
 */
function sirala(liste) {
  const l = Array.isArray(liste) ? liste.filter((o) => o && typeof o === 'object') : [];
  const sira = (o) => (o.bitti ? 2 : o.tarih ? 0 : 1);
  return [...l].sort((a, b) => {
    const s = sira(a) - sira(b);
    if (s) return s;
    if (sira(a) === 0 && a.tarih !== b.tarih) return a.tarih < b.tarih ? -1 : 1;
    if (sira(a) === 2) return (b.bittiT ?? 0) - (a.bittiT ?? 0) || (b.t ?? 0) - (a.t ?? 0);
    return (b.t ?? 0) - (a.t ?? 0);
  });
}

/** 7 gunden eski bitenler duser. */
function budanmis(liste, simdi) {
  return liste.filter((o) => !o.bitti || simdi - (o.bittiT ?? o.t) <= BITEN_OMRU_MS);
}

/**
 * Kosucu: dosya + yayin.
 * @param {{ dosya?: string, yayin: (l: object[]) => void, simdi?: () => number }} s
 */
function kur({ dosya, yayin, simdi = Date.now } = {}) {
  const { log } = require('./log.cjs');
  const DOSYA = dosya || path.join(require('./config.cjs').KOKPIT_DIZIN, 'yapilacaklar.json');
  let kapali = false;

  function kaydet() {
    const gecici = DOSYA + '.' + process.pid + '.tmp';
    try {
      fs.mkdirSync(path.dirname(DOSYA), { recursive: true });
      fs.writeFileSync(gecici, JSON.stringify({ surum: 1, ogeler }, null, 1) + '\n', 'utf8');
      fs.renameSync(gecici, DOSYA);
    } catch (e) {
      log('yapilacak: yazilamadi: ' + e.message);
      try {
        fs.unlinkSync(gecici);
      } catch {
        /* yok */
      }
    }
  }

  function oku() {
    try {
      const ham = JSON.parse(fs.readFileSync(DOSYA, 'utf8'));
      const l = (Array.isArray(ham?.ogeler) ? ham.ogeler : []).map(ogeDuzgun).filter(Boolean);
      // Ayni kimlik iki kez (elle duzenlenmis dosya): ilki kalir.
      const gorulen = new Set();
      return l.filter((o) => !gorulen.has(o.id) && gorulen.add(o.id)).slice(0, EN_COK_OGE);
    } catch (e) {
      if (e.code !== 'ENOENT') {
        log('yapilacak: dosya okunamadi, bos liste: ' + e.message);
        try {
          fs.copyFileSync(DOSYA, DOSYA + '.bozuk');
        } catch {
          /* kopyalanamadi */
        }
      }
      return [];
    }
  }

  let ogeler = oku();

  /** Okurken eski bitenleri dusurur; dustuyse diske de yansir. */
  function guncel() {
    const b = budanmis(ogeler, simdi());
    if (b.length !== ogeler.length) {
      ogeler = b;
      kaydet();
    }
    return sirala(ogeler);
  }

  return {
    liste: guncel,
    komut(k) {
      if (kapali) return { hata: 'Liste kapalı.' };
      guncel();
      const r = uygula(ogeler, k, simdi());
      if (r.hata) return { hata: r.hata };
      ogeler = r.liste;
      kaydet();
      try {
        yayin && yayin(sirala(ogeler));
      } catch (e) {
        log('yapilacak: yayin hatasi: ' + e.message);
      }
      return r.oge ? { tamam: true, oge: r.oge } : { tamam: true };
    },
    kapat() {
      kapali = true;
    },
  };
}

module.exports = { uygula, tarihAyikla, sirala, kur, EN_COK_OGE, EN_UZUN_METIN };
