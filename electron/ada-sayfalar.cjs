// v4.0, Ada'nin sayfalari: medya, odak, liste, sistem, hava, raf + Ada ayarlari. main.cjs buyumesin
// diye bu sayfalarin IPC'si ve yasam dongusu burada. Her sayfanin isi kendi modulunde (medya.cjs,
// odak.cjs, yapilacak.cjs, sistem.cjs, hava.cjs, raf.cjs); bu dosya yalniz baglar:
//   renderer (Ada ya da ana pencere) -> IPC -> modul -> yayin -> iki pencere.
//
// Kurallar:
// - Istek yalniz Kokpit'in kendi iki penceresinden kabul edilir (onizlemedeki konuk sayfa ya da
//   baska bir webContents bu kanallari kullanamaz).
// - Kapali sayfa arka planda calismaz: medya yardimcisi ve sistem ornekleyicisi yalniz sayfasi
//   acikken yasar. Odak, liste, raf edilgendir (dosya + bellek), hep kurulur.
// - Yol renderer'dan yalniz rafa EKLERKEN gelir (preload webUtils, birakilan dosya); sonraki butun
//   eylemler kimlikle, yol burada cozulur.

const path = require('path');
const { log } = require('./log.cjs');
const ayarlar = require('./ayarlar.cjs');
const medya = require('./medya.cjs');
const sozler = require('./sozler.cjs');
const odakModulu = require('./odak.cjs');
const yapilacak = require('./yapilacak.cjs');
const sistemModulu = require('./sistem.cjs');
const hava = require('./hava.cjs');
const rafModulu = require('./raf.cjs');
const sesSayfa = require('./ses-sayfa.cjs');

const SAYFALAR = ['medya', 'odak', 'liste', 'takvim', 'sistem', 'hava', 'raf'];
const MEDYA_KOMUTLARI = new Set(['oynat-duraklat', 'sonraki', 'onceki']);
const GORUNTU = /\.(png|jpe?g|gif|webp|bmp)$/i;

/** @type {null | { pencereler: () => import('electron').WebContents[], ayarDegisti: (d: object) => void, sesDurumu: () => { stt: boolean, tts: boolean }, duyur: (metin: string, konus: boolean) => void, rafOturuma: (yol: string) => void, test: boolean }} */
let s = null;
let odak = null;
let liste = null;
let sistem = null;
let raf = null;
let medyaCalisiyor = false;
let sonMedya = null;
const sistemIzleyenler = new Set();

function electron() {
  return require('electron');
}

function yayin(kanal, veri) {
  if (!s) return;
  for (const wc of s.pencereler()) {
    if (wc && !wc.isDestroyed()) wc.send(kanal, veri);
  }
}

function yetkili(e) {
  return !!s && s.pencereler().includes(e.sender);
}

function sayfaAyari() {
  const ham = ayarlar.oku().adaSayfalar;
  const sonuc = {};
  for (const k of SAYFALAR) sonuc[k] = !(ham && typeof ham === 'object' && ham[k] === false);
  return sonuc;
}

function konumGecerli(k) {
  return (
    !!k &&
    typeof k === 'object' &&
    typeof k.ad === 'string' &&
    k.ad.length > 0 &&
    Number.isFinite(k.enlem) &&
    Number.isFinite(k.boylam) &&
    Math.abs(k.enlem) <= 90 &&
    Math.abs(k.boylam) <= 180
  );
}

function konumSade(k) {
  return {
    ad: String(k.ad).slice(0, 80),
    ...(typeof k.bolge === 'string' && k.bolge ? { bolge: k.bolge.slice(0, 80) } : {}),
    ...(typeof k.ulke === 'string' && k.ulke ? { ulke: k.ulke.slice(0, 80) } : {}),
    enlem: Number(k.enlem),
    boylam: Number(k.boylam),
  };
}

/** Renderer'in gordugu ayar nesnesi (types.ts AdaAyarlari). */
function adaAyarlari() {
  const a = ayarlar.oku();
  return {
    acik: a.ada !== false,
    sayfalar: sayfaAyari(),
    minimal: a.adaMinimal === true,
    sozler: a.adaSozler !== false,
    hep: a.adaHep !== false,
    tamEkran: a.adaTamEkran !== false,
    sesli: a.adaSesli !== false,
    uyanma: a.adaUyanma === true,
    brifing: a.adaBrifing !== false,
    havaKonum: konumGecerli(a.havaKonum) ? konumSade(a.havaKonum) : null,
    ses: s ? s.sesDurumu() : { stt: false, tts: false },
  };
}

const ANAHTAR = { acik: 'ada', minimal: 'adaMinimal', sozler: 'adaSozler', hep: 'adaHep', tamEkran: 'adaTamEkran', sesli: 'adaSesli', uyanma: 'adaUyanma', brifing: 'adaBrifing' };

/** Dar sema: bilinmeyen anahtar ve yanlis tur diske inmez. Donus: ayarlar.json'a yazilan yama. */
function ayarYamasi(ham) {
  const yama = {};
  if (!ham || typeof ham !== 'object') return yama;
  for (const [k, hedef] of Object.entries(ANAHTAR)) {
    if (typeof ham[k] === 'boolean') yama[hedef] = ham[k];
  }
  if (ham.sayfalar && typeof ham.sayfalar === 'object') {
    const yeni = sayfaAyari();
    let degisti = false;
    for (const k of SAYFALAR) {
      if (typeof ham.sayfalar[k] === 'boolean' && ham.sayfalar[k] !== yeni[k]) {
        yeni[k] = ham.sayfalar[k];
        degisti = true;
      }
    }
    if (degisti) yama.adaSayfalar = yeni;
  }
  if (ham.havaKonum === null) yama.havaKonum = null;
  else if (konumGecerli(ham.havaKonum)) yama.havaKonum = konumSade(ham.havaKonum);
  return yama;
}

function ayarYaz(ham) {
  const yama = ayarYamasi(ham);
  if (Object.keys(yama).length > 0) {
    ayarlar.yaz(yama);
    log('ada ayari: ' + Object.keys(yama).join(', '));
    sayfalariUygula();
    if (s) s.ayarDegisti(yama);
    ayarYayinla();
  }
  return adaAyarlari();
}

function ayarYayinla() {
  yayin('ada:ayarlar', adaAyarlari());
}

/** Sayfa acik/kapali ayarina gore arka plan islerini baslat ya da durdur. */
function sayfalariUygula() {
  if (!s) return;
  const sayfa = sayfaAyari();
  // Test kosuculari gercek medya oturumunu okumaz; yalniz sahte yardimci verildiyse.
  const medyaIzinli = !s.test || !!process.env.KOKPIT_MEDYA_YARDIMCI;
  if (sayfa.medya && medyaIzinli && !medyaCalisiyor) {
    medyaCalisiyor = true;
    medya.baslat({
      yayin: (d) => {
        sonMedya = d;
        yayin('medya:durum', d);
      },
    });
  } else if (!sayfa.medya && medyaCalisiyor) {
    medyaCalisiyor = false;
    medya.durdur();
    sonMedya = null;
    yayin('medya:durum', null);
  }
  if (sayfa.sistem && !sistem) {
    sistem = sistemModulu.kur({ yayin: (d) => yayin('sistem:durum', d) });
    if (sistemIzleyenler.size > 0) sistem.izle(true);
  } else if (!sayfa.sistem && sistem) {
    sistem.kapat();
    sistem = null;
  }
}

function sistemIzle(wc, acik) {
  const onceBos = sistemIzleyenler.size === 0;
  if (acik) {
    if (sistemIzleyenler.has(wc.id)) return;
    sistemIzleyenler.add(wc.id);
    // Pencere izlerken olurse sayac takili kalmasin.
    wc.once('destroyed', () => sistemIzle(wc, false));
  } else if (!sistemIzleyenler.delete(wc.id)) return;
  const simdiBos = sistemIzleyenler.size === 0;
  if (sistem && onceBos !== simdiBos) sistem.izle(!simdiBos);
}

function rafOnizleme(yol) {
  if (!GORUNTU.test(yol)) return null;
  try {
    const img = electron().nativeImage.createFromPath(yol);
    if (img.isEmpty()) return null;
    const { width, height } = img.getSize();
    const olcek = Math.min(1, 64 / Math.max(width, height));
    return img.resize({ width: Math.max(1, Math.round(width * olcek)), height: Math.max(1, Math.round(height * olcek)) }).toDataURL();
  } catch {
    return null;
  }
}

async function rafSurukle(wc, id) {
  const yol = raf ? raf.yol(id) : null;
  if (!yol) return;
  const { app, nativeImage } = electron();
  let ikon = null;
  try {
    ikon = await app.getFileIcon(yol, { size: 'normal' });
  } catch {
    ikon = null;
  }
  if (!ikon || ikon.isEmpty()) ikon = nativeImage.createFromPath(path.join(__dirname, '..', 'public', 'kokpit.png'));
  if (wc.isDestroyed() || ikon.isEmpty()) return;
  try {
    wc.startDrag({ file: yol, icon: ikon });
  } catch (e) {
    log('raf: surukleme baslatilamadi: ' + e.message);
  }
}

const yuzde = (n) => 'yüzde ' + Math.round(n);
const dakikaMetni = (ms) => {
  const d = Math.max(1, Math.round(ms / 60000));
  return d + ' dakika';
};
const ODAK_ADI = { odak: 'Odak', kisa: 'Kısa mola', uzun: 'Uzun mola' };

/**
 * Sesli komut (Ada'nin sesi): cumlenin TAMAMI bir sayfa komutuysa burada yapilir ve Ada'nin
 * soyleyecegi cumle doner; degilse null (cumle her zamanki yola, oturum notuna / Aria'ya gider).
 * @returns {Promise<null | { tur: 'bilgi', cumle: string, konus: boolean }>}
 */
async function sesKomutu(metin) {
  const k = sesSayfa.coz(metin, Date.now());
  if (!k) return null;
  const sayfa = sayfaAyari();
  const bilgi = (cumle, konus = true) => ({ tur: 'bilgi', cumle, konus });
  switch (k.tur) {
    case 'medya': {
      if (!sayfa.medya) return bilgi('Medya sayfası kapalı.');
      if (!sonMedya) return bilgi('Çalan bir şey yok.');
      // Durdur/devam yalniz durum degisecekse gonderilir: tus acma-kapama, "durdur" duran sarkiyi baslatmasin.
      if (k.istek === 'durdur') {
        if (sonMedya.caliyor) medya.komut('oynat-duraklat');
        return bilgi('Duraklatıldı', false);
      }
      if (k.istek === 'devam') {
        if (!sonMedya.caliyor) medya.komut('oynat-duraklat');
        return bilgi('Çalıyor', false);
      }
      medya.komut(k.komut);
      return bilgi(k.istek === 'sonraki' ? 'Sonraki parça' : 'Önceki parça', false);
    }
    case 'odak': {
      if (!sayfa.odak || !odak) return bilgi('Odak sayfası kapalı.');
      odak.komut(k.komut);
      const d = odak.durum();
      if (k.komut.tur === 'baslat') return bilgi(dakikaMetni(d.kalanMs) + 'lık ' + ODAK_ADI[d.asama].toLocaleLowerCase('tr-TR') + ' başladı.');
      if (k.komut.tur === 'duraklat') return bilgi('Sayaç duraklatıldı.');
      if (k.komut.tur === 'atla') return bilgi('Atlandı: sırada ' + ODAK_ADI[d.asama].toLocaleLowerCase('tr-TR') + '.');
      return bilgi('Sayaç sıfırlandı.');
    }
    case 'odak-durum': {
      if (!sayfa.odak || !odak) return bilgi('Odak sayfası kapalı.');
      const d = odak.durum();
      const kalan = d.calisiyor && d.bitis ? Math.max(0, d.bitis - Date.now()) : d.kalanMs;
      return bilgi(d.calisiyor ? ODAK_ADI[d.asama] + ': ' + dakikaMetni(kalan) + ' kaldı. Bugün ' + d.tur + ' tur.' : 'Sayaç duruyor. Bugün ' + d.tur + ' tur.');
    }
    case 'liste-ekle': {
      if (!sayfa.liste || !liste) return bilgi('Liste sayfası kapalı.');
      const r = liste.komut({ tur: 'ekle', metin: k.metin, tarih: k.tarih ?? null });
      return bilgi('hata' in r ? r.hata : 'Listeye eklendi: ' + k.metin);
    }
    case 'liste-oku': {
      if (!sayfa.liste || !liste) return bilgi('Liste sayfası kapalı.');
      const acik = liste.liste().filter((x) => !x.bitti);
      if (acik.length === 0) return bilgi('Liste boş.');
      const ilk = acik.slice(0, 5).map((x) => x.metin);
      return bilgi(acik.length + ' açık iş var: ' + ilk.join('; ') + (acik.length > 5 ? '; ve ' + (acik.length - 5) + ' tane daha.' : '.'));
    }
    case 'hava': {
      if (!sayfa.hava) return bilgi('Hava sayfası kapalı.');
      const konum = adaAyarlari().havaKonum;
      if (!konum) return bilgi("Önce Ada'nın Hava sayfasından bir şehir seç.");
      const h = await hava.getir(konum, {}).catch((e) => ({ hata: 'Hava durumu alınamadı: ' + e.message }));
      if ('hata' in h) return bilgi(h.hata);
      if ('konumYok' in h) return bilgi("Önce Ada'nın Hava sayfasından bir şehir seç.");
      const yagis = Math.max(0, ...h.saatlik.slice(0, 6).map((x) => x.yagis));
      return bilgi(
        h.konum.ad + ' ' + h.sicaklik + ' derece, ' + hava.kodMetni(h.kod, h.gunduz).toLocaleLowerCase('tr-TR') + '.' +
          (h.gunluk[0] ? ' Bugün en yüksek ' + h.gunluk[0].enYuksek + ', en düşük ' + h.gunluk[0].enDusuk + '.' : '') +
          (yagis >= 40 ? ' Önümüzdeki saatlerde yağış olasılığı ' + yuzde(yagis) + '.' : '')
      );
    }
    case 'sistem': {
      if (!sayfa.sistem || !sistem) return bilgi('Sistem sayfası kapalı.');
      const d = sistem.anlik();
      if (!d) return bilgi('Henüz ölçülmedi.');
      return bilgi('İşlemci ' + yuzde(d.cpu) + ', bellek ' + yuzde((d.bellek.kullanilan / d.bellek.toplam) * 100) + (d.gpu ? ', ekran kartı ' + yuzde(d.gpu.yuzde) : '') + '.');
    }
    default:
      return null;
  }
}

/**
 * @param {{ pencereler: () => import('electron').WebContents[], ayarDegisti: (d: object) => void,
 *   sesDurumu: () => { stt: boolean, tts: boolean }, duyur: (metin: string, konus: boolean) => void,
 *   rafOturuma: (yol: string) => void, test: boolean }} bagimlilik
 */
function kur(bagimlilik) {
  if (s) return;
  s = bagimlilik;
  const { ipcMain, shell } = electron();

  odak = odakModulu.kur({
    yayin: (d) => yayin('odak:durum', d),
    // Asama doldu: Ada soyler. Odak bitince mola kendiliginden basladi; mola bitince sayac durur.
    bitti: (asama) => {
      log('odak: ' + asama + ' bitti');
      s.duyur(asama === 'odak' ? 'Odak bitti, mola zamanı.' : 'Mola bitti. Hazır olunca odağı başlat.', true);
    },
  });
  liste = yapilacak.kur({ yayin: (l) => yayin('liste:durum', l) });
  raf = rafModulu.kur({ yayin: (l) => yayin('raf:durum', l), onizleme: rafOnizleme });
  sayfalariUygula();

  ipcMain.handle('ada:ayarlar', (e) => (yetkili(e) ? adaAyarlari() : null));
  ipcMain.handle('ada:ayar-yaz', (e, ham) => (yetkili(e) ? ayarYaz(ham) : null));

  ipcMain.handle('medya:getir', (e) => (yetkili(e) ? sonMedya : null));
  ipcMain.on('medya:komut', (e, k) => {
    if (yetkili(e) && MEDYA_KOMUTLARI.has(k) && medyaCalisiyor) medya.komut(k);
  });
  ipcMain.handle('medya:sozler', async (e) => {
    if (!yetkili(e) || !sonMedya || ayarlar.oku().adaSozler === false) return null;
    const parca = { baslik: sonMedya.baslik, sanatci: sonMedya.sanatci, album: sonMedya.album, sureMs: sonMedya.sureMs };
    try {
      return await sozler.getir(parca, {});
    } catch (err) {
      log('sozler alinamadi: ' + err.message);
      return { anahtar: sozler.anahtarUret(parca), yok: true };
    }
  });

  ipcMain.handle('odak:getir', (e) => (yetkili(e) ? odak.durum() : null));
  ipcMain.on('odak:komut', (e, k) => {
    if (yetkili(e) && k && typeof k === 'object' && typeof k.tur === 'string') odak.komut(k);
  });

  ipcMain.handle('liste:getir', (e) => (yetkili(e) ? liste.liste() : []));
  ipcMain.on('liste:komut', (e, k) => {
    if (!yetkili(e) || !k || typeof k !== 'object' || typeof k.tur !== 'string') return;
    // Elle eklenen metinde "yarın ..." gibi bir tarih varsa ayiklanir (sesli komutla ayni kural).
    if (k.tur === 'ekle' && typeof k.metin === 'string' && k.tarih === undefined) {
      const a = yapilacak.tarihAyikla(k.metin, Date.now());
      k = { tur: 'ekle', metin: a.metin, tarih: a.tarih };
    }
    const r = liste.komut(k);
    if (r && 'hata' in r) log('liste: ' + r.hata);
  });

  ipcMain.on('sistem:izle', (e, acik) => {
    if (yetkili(e)) sistemIzle(e.sender, acik === true);
  });

  ipcMain.handle('hava:getir', async (e, taze) => {
    if (!yetkili(e)) return { hata: 'yetkisiz' };
    const konum = adaAyarlari().havaKonum;
    if (!konum) return { konumYok: true };
    return hava.getir(konum, { taze: taze === true }).catch((err) => ({ hata: 'Hava durumu alınamadı: ' + err.message }));
  });
  ipcMain.handle('hava:ara', async (e, sorgu) => {
    if (!yetkili(e) || typeof sorgu !== 'string') return [];
    return hava.ara(sorgu.trim().slice(0, 80), {}).catch((err) => {
      log('hava: arama basarisiz: ' + err.message);
      return [];
    });
  });
  ipcMain.handle('hava:konum', async (e, k) => {
    if (!yetkili(e)) return { hata: 'yetkisiz' };
    if (!konumGecerli(k)) return { konumYok: true };
    ayarYaz({ havaKonum: k });
    return hava.getir(konumSade(k), { taze: true }).catch((err) => ({ hata: 'Hava durumu alınamadı: ' + err.message }));
  });

  ipcMain.handle('raf:getir', (e) => (yetkili(e) ? raf.liste() : []));
  ipcMain.on('raf:ekle', (e, yollar) => {
    if (!yetkili(e) || !Array.isArray(yollar)) return;
    const n = raf.ekle(yollar.filter((y) => typeof y === 'string' && path.isAbsolute(y)).slice(0, 24));
    if (n) log('raf: ' + n + ' oge eklendi');
  });
  ipcMain.on('raf:baglanti', (e, adres) => {
    if (yetkili(e) && typeof adres === 'string') raf.baglantiEkle(adres.trim());
  });
  ipcMain.on('raf:sil', (e, kimlikler) => {
    if (!yetkili(e)) return;
    if (kimlikler === 'hepsi') raf.sil('hepsi');
    else if (Array.isArray(kimlikler)) raf.sil(kimlikler.filter((k) => typeof k === 'string').slice(0, 24));
  });
  ipcMain.on('raf:ac', (e, id) => {
    if (!yetkili(e) || typeof id !== 'string') return;
    const o = raf.oge(id);
    if (!o) return;
    if (o.tur === 'baglanti') {
      if (/^https?:\/\//i.test(o.adres || '')) void shell.openExternal(o.adres);
      return;
    }
    const yol = raf.yol(id);
    if (yol) void shell.openPath(yol).then((hata) => hata && log('raf: acilamadi: ' + hata));
  });
  ipcMain.on('raf:goster', (e, id) => {
    const yol = yetkili(e) && typeof id === 'string' ? raf.yol(id) : null;
    if (yol) shell.showItemInFolder(yol);
  });
  ipcMain.on('raf:surukle', (e, id) => {
    if (yetkili(e) && typeof id === 'string') void rafSurukle(e.sender, id);
  });
  ipcMain.on('raf:oturuma', (e, id) => {
    const yol = yetkili(e) && typeof id === 'string' ? raf.yol(id) : null;
    if (yol) s.rafOturuma(yol);
  });
  log('ada sayfalari hazir (' + SAYFALAR.filter((k) => sayfaAyari()[k]).join(', ') + ')');
}

function kapat() {
  if (medyaCalisiyor) medya.durdur();
  medyaCalisiyor = false;
  if (sistem) sistem.kapat();
  sistem = null;
  if (odak) odak.kapat();
  if (liste) liste.kapat();
  if (raf) raf.kapat();
  odak = liste = raf = null;
  s = null;
}

module.exports = {
  kur,
  kapat,
  adaAyarlari,
  ayarYaz,
  ayarYayinla,
  ayarYamasi,
  sesKomutu,
  /** Odak calisiyor mu (sesli "bitti" bildirimi odakta susar; brifing icin de). */
  odakDurumu: () => (odak ? odak.durum() : null),
  yapilacaklar: () => (liste ? liste.liste() : []),
  medyaDurumu: () => sonMedya,
};
