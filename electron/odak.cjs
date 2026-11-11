// v4.0, Ada'nin Odak sayfasi: pomodoro. Saf cekirdek (bos / uygula / ilerle) + ince kosucu (kur).
//
// Neden saf cekirdek: sayacin butun kurallari (tur sayimi, mola secimi, gun devri) saatsiz sinanabilsin;
// kosucu yalniz dosya, tek zamanlayici ve yayin isini yapar. Geri sayimi renderer kendi cizer (bitis'ten):
// main'de saniyelik tik yok, yalniz asama bitisine kurulu tek setTimeout.
//
// Zaman her zaman `bitis` (epoch ms) uzerinden hesaplanir, kalan sure biriktirilmez: bilgisayar uykudan
// donunce setTimeout kayar ama bitis kaymaz; her komut/durum cagrisinda Date.now() ile yeniden bakilir.

const fs = require('fs');
const path = require('path');
const { brifingGunu } = require('./brifing.cjs');

const DAKIKA = 60 * 1000;
const SURELER = Object.freeze({ odak: 25 * DAKIKA, kisa: 5 * DAKIKA, uzun: 15 * DAKIKA });
const ASAMALAR = Object.freeze(['odak', 'kisa', 'uzun']);
/** Her dort tamamlanan odaktan sonra uzun mola. */
const UZUN_ARALIK = 4;
const EN_AZ_DAKIKA = 1;
const EN_COK_DAKIKA = 180;
const EN_UZUN_MS = EN_COK_DAKIKA * DAKIKA;
/** Kapaliyken (ya da uykudayken) coktan biten asama icin bildirim yok: gec gelen "odak bitti" yaniltir. */
const BAYAT_BILDIRIM_MS = 2 * DAKIKA;

/**
 * Sayacin "gunu": 05:00 sinirli yerel tarih. Gece yarisindan sonra calisan ayni gunu surdurur
 * (brifing ile ayni kural; tek kaynak brifing.cjs).
 */
function gunu(simdi) {
  return brifingGunu(simdi);
}

/** Bugunun ilk durumu: odak asamasi, duruyor, tur 0. */
function bos(simdi) {
  return { asama: 'odak', calisiyor: false, bitis: null, kalanMs: SURELER.odak, sureMs: SURELER.odak, tur: 0, gun: gunu(simdi) };
}

/**
 * Diskten ya da disaridan gelen durumu alan alan onarir: gecerli alan korunur, bozuk alan varsayilana
 * duser. Calisan sayacin kalani bitis'ten yeniden hesaplanir.
 */
function duzgun(ham, simdi) {
  const d = bos(simdi);
  if (!ham || typeof ham !== 'object') return d;
  if (ASAMALAR.includes(ham.asama)) d.asama = ham.asama;
  d.sureMs = Number.isFinite(ham.sureMs) && ham.sureMs > 0 && ham.sureMs <= EN_UZUN_MS ? Math.round(ham.sureMs) : SURELER[d.asama];
  d.kalanMs = Number.isFinite(ham.kalanMs) && ham.kalanMs >= 0 ? Math.min(Math.round(ham.kalanMs), d.sureMs) : d.sureMs;
  if (Number.isInteger(ham.tur) && ham.tur >= 0 && ham.tur < 10000) d.tur = ham.tur;
  if (typeof ham.gun === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(ham.gun)) d.gun = ham.gun;
  // Calisan sayacin bitisi makul olmali: sureden uzak gelecekteki bir bitis (saat geri alinmis ya da elle
  // bozulmus dosya) sayaci saatlerce kilitlerdi; o durumda duruyor sayilir.
  if (ham.calisiyor === true && Number.isFinite(ham.bitis) && ham.bitis - simdi <= d.sureMs + DAKIKA) {
    d.calisiyor = true;
    d.bitis = Math.round(ham.bitis);
    d.kalanMs = Math.max(0, d.bitis - simdi);
  }
  return d;
}

/** Gun degistiyse tur sifirlanir (yeni gune ait). */
function gunDevri(d, simdi) {
  const g = gunu(simdi);
  if (g !== d.gun) {
    d.tur = 0;
    d.gun = g;
  }
  return d;
}

function asamaKur(d, asama, sureMs) {
  d.asama = asama;
  d.sureMs = sureMs;
  d.kalanMs = sureMs;
  d.calisiyor = false;
  d.bitis = null;
}

/** Bir odaktan sonra hangi mola: tamamlanan tur sayisi 4'un katiysa uzun. */
function molaSec(tur) {
  return tur > 0 && tur % UZUN_ARALIK === 0 ? 'uzun' : 'kisa';
}

/**
 * Komutu uygular. SAF: girdiyi degistirmez, yeni durum dondurur. Gecersiz komut durumu degistirmez.
 * @param {object} durum OdakDurumu
 * @param {{ tur: 'baslat', asama?: 'odak' | 'kisa' | 'uzun', dakika?: number } | { tur: 'duraklat' | 'sifirla' | 'atla' }} komut
 * @param {number} simdi epoch ms
 */
function uygula(durum, komut, simdi) {
  const d = gunDevri(duzgun(durum, simdi), simdi);
  if (!komut || typeof komut !== 'object') return d;
  if (komut.tur === 'baslat') {
    const asamaVar = komut.asama !== undefined && komut.asama !== null;
    const dakikaVar = komut.dakika !== undefined && komut.dakika !== null;
    if (asamaVar && !ASAMALAR.includes(komut.asama)) return d;
    if (dakikaVar && !(Number.isFinite(komut.dakika) && komut.dakika >= EN_AZ_DAKIKA && komut.dakika <= EN_COK_DAKIKA)) return d;
    if (asamaVar || dakikaVar) {
      // Asama ya da sure verildiyse o asamanin basindan; ozel sure yalniz bu sefer icin.
      const asama = asamaVar ? komut.asama : d.asama;
      asamaKur(d, asama, dakikaVar ? Math.round(komut.dakika) * DAKIKA : SURELER[asama]);
    } else if (d.calisiyor) {
      return d;
    } else if (d.kalanMs <= 0) {
      d.kalanMs = d.sureMs;
    }
    d.calisiyor = true;
    d.bitis = simdi + d.kalanMs;
    return d;
  }
  if (komut.tur === 'duraklat') {
    if (!d.calisiyor) return d;
    d.kalanMs = Math.max(0, d.bitis - simdi);
    d.calisiyor = false;
    d.bitis = null;
    return d;
  }
  if (komut.tur === 'sifirla') {
    // Asamanin basina: bu asamaya ozel sure verildiyse o sure korunur.
    d.calisiyor = false;
    d.bitis = null;
    d.kalanMs = d.sureMs;
    return d;
  }
  if (komut.tur === 'atla') {
    // Atlanan odak tamamlanmis sayilmaz (tur artmaz); odaktan sonra hep kisa mola.
    asamaKur(d, d.asama === 'odak' ? 'kisa' : 'odak', SURELER[d.asama === 'odak' ? 'kisa' : 'odak']);
    return d;
  }
  return d;
}

/**
 * Sure dolduysa bir sonraki asamaya gecer. Odak bitince tur artar ve mola KENDILIGINDEN baslar (bitis'ten
 * itibaren: uykudan donuste mola gercek saate gore isler); mola bitince odaga gecilir ve DURUR (yeni odagi
 * Scryne baslatir). Tek adim: kapaliyken hem odak hem mola dolduysa cagiran tekrar cagirir.
 * @returns {{ durum: object, biten: 'odak' | 'kisa' | 'uzun' | null, bitisAni?: number }}
 */
function ilerle(durum, simdi) {
  const d = duzgun(durum, simdi);
  if (!d.calisiyor || d.bitis > simdi) return { durum: gunDevri(d, simdi), biten: null };
  const biten = d.asama;
  const bitisAni = d.bitis;
  if (biten === 'odak') {
    // Odak hangi gunde bittiyse o gune sayilir (gece 23:50'de biten odak sabah acilista bugune yazilmaz).
    gunDevri(d, bitisAni);
    d.tur += 1;
    const mola = molaSec(d.tur);
    asamaKur(d, mola, SURELER[mola]);
    d.calisiyor = true;
    d.bitis = bitisAni + d.sureMs;
    d.kalanMs = Math.max(0, d.bitis - simdi);
  } else {
    asamaKur(d, 'odak', SURELER.odak);
  }
  return { durum: gunDevri(d, simdi), biten, bitisAni };
}

/** Yayin icin: calisiyorsa kalan bu ana gore. */
function goster(d, simdi) {
  return { ...d, kalanMs: d.calisiyor ? Math.max(0, d.bitis - simdi) : d.kalanMs };
}

/** Diske yazmaya deger bir degisim mi (calisirken kalanMs her an degisir, sayilmaz). */
function ayni(a, b) {
  return (
    a.asama === b.asama &&
    a.calisiyor === b.calisiyor &&
    a.bitis === b.bitis &&
    a.sureMs === b.sureMs &&
    a.tur === b.tur &&
    a.gun === b.gun &&
    (a.calisiyor || a.kalanMs === b.kalanMs)
  );
}

/**
 * Kosucu: durum dosyada kalici, asama bitisine tek zamanlayici.
 * @param {{ dosya?: string, yayin: (d: object) => void, bitti: (asama: string, d: object) => void,
 *   simdi?: () => number, zamanlayici?: { kur: (fn: () => void, ms: number) => any, iptal: (h: any) => void } }} s
 */
function kur({ dosya, yayin, bitti, simdi = Date.now, zamanlayici } = {}) {
  const { log } = require('./log.cjs');
  const DOSYA = dosya || path.join(require('./config.cjs').KOKPIT_DIZIN, 'odak.json');
  const zaman = zamanlayici || {
    kur: (fn, ms) => {
      const h = setTimeout(fn, ms);
      h.unref?.();
      return h;
    },
    iptal: (h) => clearTimeout(h),
  };
  let kapali = false;
  let saat = null;

  function oku() {
    try {
      return duzgun(JSON.parse(fs.readFileSync(DOSYA, 'utf8')), simdi());
    } catch (e) {
      if (e.code !== 'ENOENT') log('odak: durum okunamadi, varsayilan: ' + e.message);
      return bos(simdi());
    }
  }

  function kaydet() {
    const gecici = DOSYA + '.' + process.pid + '.tmp';
    try {
      fs.mkdirSync(path.dirname(DOSYA), { recursive: true });
      fs.writeFileSync(gecici, JSON.stringify({ surum: 1, ...d }) + '\n', 'utf8');
      fs.renameSync(gecici, DOSYA);
    } catch (e) {
      log('odak: durum yazilamadi: ' + e.message);
      try {
        fs.unlinkSync(gecici);
      } catch {
        /* yok */
      }
    }
  }

  function guvenli(ad, fn) {
    try {
      fn();
    } catch (e) {
      log('odak: ' + ad + ' hatasi: ' + e.message);
    }
  }

  function zamanlayiciKur() {
    if (saat !== null) zaman.iptal(saat);
    saat = null;
    if (kapali || !d.calisiyor) return;
    // Erken uyanma (saat kaymasi) zararsiz: tazele bitis'e bakar ve yeniden kurar.
    const ms = Math.min(Math.max(0, d.bitis - simdi()) + 50, 2 ** 31 - 1);
    saat = zaman.kur(() => {
      saat = null;
      tazele();
      zamanlayiciKur();
    }, ms);
  }

  /** Dolan asamalari isler; degistiyse yazar ve yayinlar. */
  function tazele() {
    const t = simdi();
    const onceki = d;
    const bitenler = [];
    for (let i = 0; i < 4; i++) {
      const r = ilerle(d, t);
      d = r.durum;
      if (!r.biten) break;
      bitenler.push(r);
    }
    if (ayni(onceki, d)) return false;
    kaydet();
    if (kapali) return true;
    for (const r of bitenler) {
      if (t - r.bitisAni > BAYAT_BILDIRIM_MS) {
        log('odak: ' + r.biten + ' bitti (bildirim bayat, atlandi)');
        continue;
      }
      guvenli('bitti', () => bitti && bitti(r.biten, goster(d, t)));
    }
    guvenli('yayin', () => yayin && yayin(goster(d, t)));
    return true;
  }

  let d = oku();
  tazele();
  zamanlayiciKur();

  return {
    durum() {
      if (!kapali && tazele()) zamanlayiciKur();
      return goster(d, simdi());
    },
    komut(k) {
      if (kapali) return goster(d, simdi());
      tazele();
      const t = simdi();
      const yeni = uygula(d, k, t);
      if (!ayni(d, yeni)) {
        d = yeni;
        kaydet();
        guvenli('yayin', () => yayin && yayin(goster(d, t)));
      }
      zamanlayiciKur();
      return goster(d, t);
    },
    kapat() {
      kapali = true;
      if (saat !== null) zaman.iptal(saat);
      saat = null;
    },
  };
}

module.exports = { SURELER, bos, uygula, ilerle, gunu, kur };
