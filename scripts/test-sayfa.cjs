// v4.0 Ada sayfalari arka uc testi: odak, yapilacak, sistem, hava, raf, ses-sayfa. Electron'suz, duz node.
//
// Gercek hicbir seye dokunmaz: Kokpit verisi gecici KOKPIT_DIZIN'de, saat enjekte (25 dakika beklenmez),
// odak zamanlayicisi sahte, hava istegi sahte (gercekci Open-Meteo fiksturu), GPU komutu sahte.

const fs = require('fs');
const os = require('os');
const path = require('path');

const GECICI = fs.mkdtempSync(path.join(os.tmpdir(), 'kokpit-sayfa-'));
process.env.KOKPIT_DIZIN = path.join(GECICI, 'kokpit');

const KOK = path.join(__dirname, '..');
const gerek = (ad) => require(path.join(KOK, 'electron', ad));
let gecen = 0;
let kalan = 0;
const sayac = {};
let bolum = '';
function kontrol(ad, kosul, ayrinti) {
  sayac[bolum] = (sayac[bolum] || 0) + 1;
  if (kosul) {
    gecen++;
    console.log('PASS ' + ad);
  } else {
    kalan++;
    console.log('FAIL ' + ad + (ayrinti !== undefined ? '  -> ' + JSON.stringify(ayrinti) : ''));
  }
}
function basla(ad) {
  bolum = ad;
  console.log('\n--- ' + ad + ' ---');
}
const uyu = (ms) => new Promise((r) => setTimeout(r, ms));
const DK = 60 * 1000;
// Sabit "simdi": 2026-11-11 Carsamba 10:00 yerel.
const T0 = new Date(2026, 10, 11, 10, 0).getTime();
const yerel = (y, a, g, s = 10, d = 0) => new Date(y, a - 1, g, s, d).getTime();

// ---------------------------------------------------------------------------------------------------
function odakTesti() {
  basla('odak');
  const odak = gerek('odak.cjs');
  const { SURELER } = odak;
  kontrol('sureler 25/5/15 dk', SURELER.odak === 25 * DK && SURELER.kisa === 5 * DK && SURELER.uzun === 15 * DK);
  const b = odak.bos(T0);
  kontrol('bos: odak, duruyor, 25 dk, tur 0, gun', b.asama === 'odak' && !b.calisiyor && b.bitis === null && b.kalanMs === 25 * DK && b.sureMs === 25 * DK && b.tur === 0 && b.gun === '2026-11-11', b);

  // Tam dongu: odak -> kisa -> odak x4 -> uzun
  let d = odak.uygula(b, { tur: 'baslat' }, T0);
  kontrol('baslat: calisiyor, bitis +25 dk', d.calisiyor && d.bitis === T0 + 25 * DK, d);
  kontrol('uygula girdiyi degistirmez', b.calisiyor === false && b.bitis === null);
  let r = odak.ilerle(d, T0 + 10 * DK);
  kontrol('ilerle: sure dolmadan degisim yok', r.biten === null && r.durum.asama === 'odak' && r.durum.kalanMs === 15 * DK, r);
  let t = T0;
  const molalar = [];
  for (let i = 1; i <= 4; i++) {
    if (i > 1) d = odak.uygula(d, { tur: 'baslat' }, t);
    t = d.bitis;
    r = odak.ilerle(d, t);
    kontrol('dongu ' + i + ': odak bitti, tur ' + i + ', mola kendiliginden basladi', r.biten === 'odak' && r.durum.tur === i && r.durum.calisiyor && r.durum.bitis === t + r.durum.sureMs, r);
    molalar.push(r.durum.asama);
    d = r.durum;
    t = d.bitis;
    r = odak.ilerle(d, t);
    kontrol('dongu ' + i + ': mola bitti, odaga gecti ve DURDU', r.biten === molalar[i - 1] && r.durum.asama === 'odak' && !r.durum.calisiyor && r.durum.kalanMs === 25 * DK, r);
    d = r.durum;
  }
  kontrol('molalar: kisa, kisa, kisa, uzun (dort odakta bir)', molalar.join(',') === 'kisa,kisa,kisa,uzun', molalar);
  kontrol('uzun mola 15 dk', SURELER.uzun === 15 * DK);

  // Duraklat / surdur
  d = odak.uygula(odak.bos(T0), { tur: 'baslat' }, T0);
  d = odak.uygula(d, { tur: 'duraklat' }, T0 + 10 * DK);
  kontrol('duraklat: kalan 15 dk, durdu', !d.calisiyor && d.bitis === null && d.kalanMs === 15 * DK, d);
  r = odak.ilerle(d, T0 + 300 * DK);
  kontrol('duraklatilmis sayac saatler sonra da dolmaz', r.biten === null && r.durum.kalanMs === 15 * DK, r);
  d = odak.uygula(d, { tur: 'baslat' }, T0 + 100 * DK);
  kontrol('surdur: kaldigi yerden (bitis +15 dk)', d.calisiyor && d.bitis === T0 + 115 * DK && d.sureMs === 25 * DK, d);
  const d2 = odak.uygula(d, { tur: 'baslat' }, T0 + 101 * DK);
  kontrol('calisirken yine baslat: degisim yok', d2.bitis === d.bitis);
  kontrol('duruyorken duraklat: degisim yok', odak.uygula(odak.bos(T0), { tur: 'duraklat' }, T0).kalanMs === 25 * DK);

  // Atla
  d = odak.uygula({ ...odak.bos(T0), tur: 3 }, { tur: 'baslat' }, T0);
  d = odak.uygula(d, { tur: 'atla' }, T0 + 5 * DK);
  kontrol('atla (odak): kisa molaya, durur, tur sayilmaz', d.asama === 'kisa' && !d.calisiyor && d.tur === 3 && d.kalanMs === 5 * DK, d);
  d = odak.uygula(d, { tur: 'atla' }, T0 + 6 * DK);
  kontrol('atla (mola): odaga, durur', d.asama === 'odak' && !d.calisiyor && d.kalanMs === 25 * DK && d.tur === 3, d);

  // Ozel dakika
  d = odak.uygula(odak.bos(T0), { tur: 'baslat', dakika: 40 }, T0);
  kontrol('ozel dakika: 40 dk', d.sureMs === 40 * DK && d.bitis === T0 + 40 * DK, d);
  r = odak.ilerle(d, T0 + 40 * DK);
  kontrol('ozel sure yalniz bu sefer: sonraki mola varsayilan 5 dk', r.durum.asama === 'kisa' && r.durum.sureMs === 5 * DK, r.durum);
  d = odak.uygula(odak.bos(T0), { tur: 'baslat', asama: 'uzun' }, T0);
  kontrol('asama verilince o asamanin basindan', d.asama === 'uzun' && d.sureMs === 15 * DK && d.calisiyor, d);
  d = odak.uygula(odak.bos(T0), { tur: 'baslat', asama: 'kisa', dakika: 2 }, T0);
  kontrol('asama + dakika birlikte', d.asama === 'kisa' && d.sureMs === 2 * DK, d);
  const bos0 = odak.bos(T0);
  for (const k of [{ tur: 'baslat', dakika: 0 }, { tur: 'baslat', dakika: 181 }, { tur: 'baslat', dakika: 'kirk' }, { tur: 'baslat', dakika: NaN }, { tur: 'baslat', asama: 'bozuk' }, { tur: 'yok' }, null, 'baslat', 42]) {
    const x = odak.uygula(bos0, k, T0);
    kontrol('bozuk komut durumu degistirmez: ' + JSON.stringify(k), !x.calisiyor && x.sureMs === 25 * DK && x.asama === 'odak', x);
  }
  kontrol('dakika 180 sinir kabul', odak.uygula(bos0, { tur: 'baslat', dakika: 180 }, T0).sureMs === 180 * DK);

  // Sifirla
  d = odak.uygula(odak.bos(T0), { tur: 'baslat', dakika: 30 }, T0);
  d = odak.uygula(d, { tur: 'sifirla' }, T0 + 10 * DK);
  kontrol('sifirla: asamanin basina, durur (ozel sure korunur)', !d.calisiyor && d.kalanMs === 30 * DK && d.asama === 'odak', d);

  // Gun devri (05:00 siniri)
  kontrol('gunu: 04:59 onceki gun, 05:00 yeni gun', odak.gunu(yerel(2026, 11, 12, 4, 59)) === '2026-11-11' && odak.gunu(yerel(2026, 11, 12, 5, 0)) === '2026-11-12');
  const dun = { ...odak.bos(T0), tur: 3 };
  kontrol('gun devri: gece 04:59 tur korunur', odak.ilerle(dun, yerel(2026, 11, 12, 4, 59)).durum.tur === 3);
  const yeni = odak.ilerle(dun, yerel(2026, 11, 12, 5, 0)).durum;
  kontrol('gun devri: 05:00 tur sifir, gun yeni', yeni.tur === 0 && yeni.gun === '2026-11-12', yeni);
  d = odak.uygula({ ...odak.bos(yerel(2026, 11, 11, 23, 25)), tur: 2 }, { tur: 'baslat' }, yerel(2026, 11, 11, 23, 25));
  r = odak.ilerle(d, yerel(2026, 11, 12, 9, 0));
  kontrol('gece biten odak sabah bugune sayilmaz (tur 0)', r.biten === 'odak' && r.durum.tur === 0 && r.durum.gun === '2026-11-12', r.durum);
  d = odak.uygula({ ...odak.bos(yerel(2026, 11, 12, 4, 40)), tur: 2 }, { tur: 'baslat' }, yerel(2026, 11, 12, 4, 40));
  r = odak.ilerle(d, yerel(2026, 11, 12, 5, 5));
  kontrol('04:40 baslayan odak 05:05 biter: bitis anina gore yeni gune sayilir (tur 1)', r.durum.tur === 1 && r.durum.gun === '2026-11-12', r.durum);

  // Bozuk durum
  const z = odak.ilerle(null, T0).durum;
  kontrol('bozuk durum (null) -> bos', z.asama === 'odak' && z.tur === 0 && !z.calisiyor);
  const y2 = odak.ilerle({ asama: 'xx', calisiyor: true, bitis: 'yarin', kalanMs: -5, sureMs: 9e12, tur: -1, gun: 'dun' }, T0).durum;
  kontrol('bozuk alanlar varsayilana duser', y2.asama === 'odak' && !y2.calisiyor && y2.sureMs === 25 * DK && y2.kalanMs === 25 * DK && y2.tur === 0 && y2.gun === '2026-11-11', y2);
  const y3 = odak.ilerle({ ...odak.bos(T0), calisiyor: true, bitis: T0 + 10 * 3600 * 1000 }, T0).durum;
  kontrol('saatlerce ilerideki bitis kabul edilmez (duruyor)', !y3.calisiyor, y3);

  // Kosucu: sahte saat + sahte zamanlayici
  const dosya = path.join(GECICI, 'odak', 'odak.json');
  let saat = T0;
  let sira = 0;
  const zam = {
    bekleyen: null,
    kur(fn, ms) {
      const h = ++sira;
      this.bekleyen = { h, fn, an: saat + ms };
      return h;
    },
    iptal(h) {
      if (this.bekleyen && this.bekleyen.h === h) this.bekleyen = null;
    },
  };
  const yayinlar = [];
  const bitenler = [];
  const ac = () => odak.kur({ dosya, yayin: (x) => yayinlar.push(x), bitti: (a, x) => bitenler.push({ a, x }), simdi: () => saat, zamanlayici: zam });
  let k = ac();
  kontrol('kosucu: ilk durum bos, zamanlayici yok', k.durum().asama === 'odak' && zam.bekleyen === null);
  k.komut({ tur: 'baslat' });
  kontrol('kosucu: baslat yayinlandi, zamanlayici bitise kuruldu', yayinlar.length === 1 && yayinlar[0].calisiyor && zam.bekleyen && zam.bekleyen.an >= T0 + 25 * DK && zam.bekleyen.an <= T0 + 25 * DK + 1000, zam.bekleyen && zam.bekleyen.an - T0);
  kontrol('kosucu: dosya gecerli JSON', JSON.parse(fs.readFileSync(dosya, 'utf8')).calisiyor === true);
  saat = zam.bekleyen.an;
  zam.bekleyen.fn();
  kontrol('kosucu: bitiste bitti(odak) cagrildi, mola basladi', bitenler.length === 1 && bitenler[0].a === 'odak' && bitenler[0].x.asama === 'kisa' && bitenler[0].x.calisiyor, bitenler);
  kontrol('kosucu: mola icin zamanlayici yeniden kuruldu', zam.bekleyen && zam.bekleyen.an > saat);
  // Kapat-ac: calisan sayac devam eder
  saat += 2 * DK;
  k.kapat();
  kontrol('kapat: zamanlayici iptal', zam.bekleyen === null);
  const yayinSayisi = yayinlar.length;
  k.komut({ tur: 'atla' });
  kontrol('kapatilmis kosucu yayin yapmaz', yayinlar.length === yayinSayisi);
  k = ac();
  let dd = k.durum();
  kontrol('yeniden acilis: mola surer, kalan 3 dk', dd.asama === 'kisa' && dd.calisiyor && dd.kalanMs <= 3 * DK && dd.kalanMs > 3 * DK - 1000 && dd.tur === 1, dd);
  kontrol('yeniden acilis: zamanlayici kuruldu', !!zam.bekleyen);
  // Kapaliyken dolan mola: bildirim bayat (>2 dk), bitti cagrilmaz
  k.kapat();
  const bitenOnce = bitenler.length;
  saat += 60 * DK;
  k = ac();
  dd = k.durum();
  kontrol('kapaliyken dolan mola: odaga gecti, durdu', dd.asama === 'odak' && !dd.calisiyor && dd.tur === 1, dd);
  kontrol('kapaliyken coktan biten asama icin bitti cagrilmaz', bitenler.length === bitenOnce, bitenler.slice(bitenOnce));
  // Kapaliyken taze biten odak: bitti cagrilir, mola gercek saate gore isler
  k.komut({ tur: 'baslat' });
  const bitis = k.durum().bitis;
  k.kapat();
  saat = bitis + 1 * DK;
  k = ac();
  dd = k.durum();
  kontrol('1 dk once biten odak: bitti cagrildi', bitenler.length === bitenOnce + 1 && bitenler[bitenler.length - 1].a === 'odak');
  kontrol('mola bitisten itibaren: kalan 4 dk', dd.asama === 'kisa' && dd.kalanMs === 4 * DK && dd.tur === 2, dd);
  // Uyku kaymasi: zamanlayici tetiklenmeden durum() cagrisi gercek saate bakar
  saat += 10 * DK;
  dd = k.durum();
  kontrol('uykudan donus: durum() dolan molayi isler', dd.asama === 'odak' && !dd.calisiyor, dd);
  // Erken tetiklenen zamanlayici zararsiz
  k.komut({ tur: 'baslat' });
  const an = zam.bekleyen.an;
  saat = an - 5 * DK;
  zam.bekleyen.fn();
  kontrol('erken tetik: asama degismez, yeniden kurulur', k.durum().asama === 'odak' && k.durum().calisiyor && zam.bekleyen && zam.bekleyen.an > saat);
  k.kapat();
  // Bozuk dosya
  fs.writeFileSync(dosya, '{bozuk json');
  k = ac();
  dd = k.durum();
  kontrol('bozuk dosya: varsayilan durum, cokme yok', dd.asama === 'odak' && dd.tur === 0 && !dd.calisiyor, dd);
  k.komut({ tur: 'baslat' });
  kontrol('bozuk dosyanin ustune gecerli JSON yazildi', JSON.parse(fs.readFileSync(dosya, 'utf8')).surum === 1);
  k.kapat();
  // Dinleyici hatasi kosucuyu dusurmez
  const k2 = odak.kur({ dosya: path.join(GECICI, 'odak2.json'), yayin: () => { throw new Error('x'); }, bitti: () => {}, simdi: () => saat, zamanlayici: zam });
  let hatasiz = true;
  try {
    k2.komut({ tur: 'baslat' });
  } catch {
    hatasiz = false;
  }
  kontrol('yayin hatasi yutulur', hatasiz && k2.durum().calisiyor);
  k2.kapat();
}

// ---------------------------------------------------------------------------------------------------
function yapilacakTesti() {
  basla('yapilacak');
  const y = gerek('yapilacak.cjs');
  const TA = (m, s = T0) => y.tarihAyikla(m, s);
  const TABLO = [
    ['yarın rapor yaz', 'rapor yaz', '2026-11-12'],
    ['Yarın: rapor yaz', 'rapor yaz', '2026-11-12'],
    ['bugün süt al', 'süt al', '2026-11-11'],
    ['öbür gün dişçi', 'dişçi', '2026-11-13'],
    ['yarın için sunumu bitir', 'yarın için sunumu bitir', '2026-11-12'],
    ['yarın sabah koşu', 'yarın sabah koşu', '2026-11-12'],
    ['yarın 14:00 toplantı', 'yarın 14:00 toplantı', '2026-11-12'],
    ['rapor yaz yarın', 'rapor yaz', '2026-11-12'],
    ['rapor yaz, yarın', 'rapor yaz', '2026-11-12'],
    ['sunumu yarın bitir', 'sunumu yarın bitir', null],
    ['yarına kadar bitir', 'yarına kadar bitir', null],
    ['cuma sunum provası', 'cuma sunum provası', '2026-11-13'],
    ['cuma: sunum provası', 'sunum provası', '2026-11-13'],
    ['sunum provası cuma', 'sunum provası', '2026-11-13'],
    ['cuma günü: kargo', 'kargo', '2026-11-13'],
    ['çarşamba: toplantı', 'toplantı', '2026-11-18'],
    ['Pazartesi: fatura öde', 'fatura öde', '2026-11-16'],
    ['cumartesi alışveriş', 'cumartesi alışveriş', '2026-11-14'],
    ['pazar alışverişi', 'pazar alışverişi', '2026-11-15'],
    ['sali: berber', 'berber', '2026-11-17'],
    ['haftaya salı: dişçi', 'dişçi', '2026-11-17'],
    ['haftaya pazar: piknik', 'piknik', '2026-11-22'],
    ['haftaya: rapor', 'rapor', '2026-11-18'],
    ['12 kasım: teslim', 'teslim', '2026-11-12'],
    ['11 kasım: bugünkü iş', 'bugünkü iş', '2026-11-11'],
    ['10 kasım: geçmiş', 'geçmiş', '2027-11-10'],
    ['3 ocak: vize', 'vize', '2027-01-03'],
    ['teslim 12.11', 'teslim', '2026-11-12'],
    ['teslim 05/01', 'teslim', '2027-01-05'],
    ['2026-12-31: yıl sonu', 'yıl sonu', '2026-12-31'],
    ['12.11.2027 kontrol', '12.11.2027 kontrol', '2027-11-12'],
    ['30.02: olmaz', '30.02: olmaz', null],
    ['2026-02-30: olmaz', '2026-02-30: olmaz', null],
    ['en geç yarın', 'en geç yarın', '2026-11-12'],
    ['toplantı bu cuma', 'toplantı bu cuma', '2026-11-13'],
    ['yarın', 'yarın', '2026-11-12'],
    ['YARIN İŞE GİT', 'İŞE GİT', '2026-11-12'],
    ['  yarın   rapor\n yaz ', 'rapor yaz', '2026-11-12'],
    ['süt al', 'süt al', null],
    ['cumartesinden sonra ara', 'cumartesinden sonra ara', null],
  ];
  for (const [g, m, t] of TABLO) {
    const r = TA(g);
    kontrol('tarihAyikla ' + JSON.stringify(g) + ' -> ' + JSON.stringify(m) + ' / ' + t, r.metin === m && r.tarih === t, r);
  }
  // Hafta / ay / yil devri ve 05:00 siniri
  const S1 = yerel(2026, 12, 30, 10); // Carsamba
  kontrol('yil devri: 30 aralikta "öbür gün" 2027-01-01', TA('öbür gün: x', S1).tarih === '2027-01-01');
  kontrol('yil devri: "haftaya pazartesi" 2027-01-04', TA('haftaya pazartesi: x', S1).tarih === '2027-01-04');
  kontrol('yil devri: "cuma" 2027-01-01', TA('x cuma', S1).tarih === '2027-01-01');
  kontrol('ay devri: 30 kasimda "yarın" 12-01', TA('yarın x', yerel(2026, 11, 30, 10)).tarih === '2026-12-01');
  kontrol('05:00 siniri: gece 02:00 "yarın" ayni takvim gunu', TA('yarın x', yerel(2026, 11, 12, 2)).tarih === '2026-11-12');
  kontrol('05:00 siniri: gece 02:00 "bugün" onceki takvim gunu', TA('bugün x', yerel(2026, 11, 12, 2)).tarih === '2026-11-11');
  kontrol('pazar gunu "haftaya pazartesi" ertesi gun degil sonraki hafta', TA('haftaya pazartesi: x', yerel(2026, 11, 15, 10)).tarih === '2026-11-16');
  kontrol('29 subat artik olmayan yilda tanınmaz', TA('29 şubat: x', T0).tarih === null);
  kontrol('bozuk girdi: null', JSON.stringify(TA(null)) === '{"metin":"","tarih":null}');
  kontrol('bozuk girdi: sayi', TA(42).metin === '42' && TA(42).tarih === null);

  // uygula
  let r = y.uygula([], { tur: 'ekle', metin: 'süt al' }, T0);
  kontrol('ekle: oge, 12 karakter id', r.oge && /^[0-9a-f]{12}$/.test(r.oge.id) && r.oge.metin === 'süt al' && r.oge.bitti === false && r.oge.t === T0 && r.oge.tarih === null, r);
  let l = r.liste;
  r = y.uygula(l, { tur: 'ekle', metin: 'yarın rapor yaz' }, T0 + 1);
  kontrol('ekle: tarih verilmemisse metinden ayiklanir', r.oge.metin === 'rapor yaz' && r.oge.tarih === '2026-11-12', r.oge);
  kontrol('uygula girdi listesini degistirmez', l.length === 1);
  l = r.liste;
  r = y.uygula(l, { tur: 'ekle', metin: 'yarın rapor yaz', tarih: null }, T0 + 2);
  kontrol('ekle: tarih null verilmisse ayiklama yok', r.oge.metin === 'yarın rapor yaz' && r.oge.tarih === null, r.oge);
  r = y.uygula(l, { tur: 'ekle', metin: 'x', tarih: '2026-12-01' }, T0 + 2);
  kontrol('ekle: acik tarih', r.oge.tarih === '2026-12-01');
  kontrol('ekle: gecersiz tarih hata', 'hata' in y.uygula(l, { tur: 'ekle', metin: 'x', tarih: '2026-02-30' }, T0));
  kontrol('ekle: bos metin hata', 'hata' in y.uygula(l, { tur: 'ekle', metin: '   ' }, T0));
  kontrol('ekle: metin yok hata', 'hata' in y.uygula(l, { tur: 'ekle' }, T0));
  kontrol('ekle: metin sayi hata', 'hata' in y.uygula(l, { tur: 'ekle', metin: 5 }, T0));
  kontrol('ekle: 300 karakter kabul', !('hata' in y.uygula([], { tur: 'ekle', metin: 'a'.repeat(300), tarih: null }, T0)));
  kontrol('ekle: 301 karakter hata', 'hata' in y.uygula([], { tur: 'ekle', metin: 'a'.repeat(301), tarih: null }, T0));
  r = y.uygula([], { tur: 'ekle', metin: 'a\u0007b\n\t  c\u0000', tarih: null }, T0);
  kontrol('kontrol karakterleri temizlenir, bosluk sadelesir', r.oge.metin === 'a b c', r.oge.metin);
  const dolu = [];
  for (let i = 0; i < 200; i++) dolu.push({ id: i.toString(16).padStart(12, '0'), metin: 'is ' + i, bitti: false, t: i, bittiT: null, tarih: null });
  kontrol('200 sinir: 201. eklenmez', 'hata' in y.uygula(dolu, { tur: 'ekle', metin: 'fazla' }, T0));
  kontrol('199 iken eklenir', !('hata' in y.uygula(dolu.slice(1), { tur: 'ekle', metin: 'son' }, T0)));
  const id = l[0].id;
  r = y.uygula(l, { tur: 'degistir', id, bitti: true }, T0 + 50);
  kontrol('degistir: bitti + bittiT', r.oge.bitti && r.oge.bittiT === T0 + 50, r.oge);
  r = y.uygula(r.liste, { tur: 'degistir', id, bitti: false }, T0 + 60);
  kontrol('degistir: geri al, bittiT null', !r.oge.bitti && r.oge.bittiT === null);
  kontrol('degistir: bilinmeyen id hata', 'hata' in y.uygula(l, { tur: 'degistir', id: 'yok', bitti: true }, T0));
  kontrol('degistir: bitti boolean degil hata', 'hata' in y.uygula(l, { tur: 'degistir', id, bitti: 'evet' }, T0));
  const tid = l[1].id;
  r = y.uygula(l, { tur: 'duzenle', id: tid, metin: 'raporu bitir' }, T0);
  kontrol('duzenle: metin degisir, tarih korunur', r.oge.metin === 'raporu bitir' && r.oge.tarih === '2026-11-12', r.oge);
  r = y.uygula(l, { tur: 'duzenle', id: tid, metin: 'raporu bitir', tarih: null }, T0);
  kontrol('duzenle: tarih null ile kalkar', r.oge.tarih === null);
  kontrol('duzenle: bos metin hata', 'hata' in y.uygula(l, { tur: 'duzenle', id: tid, metin: '' }, T0));
  r = y.uygula(l, { tur: 'sil', id }, T0);
  kontrol('sil', r.liste.length === 1 && r.liste[0].id === tid);
  kontrol('sil: bilinmeyen id hata', 'hata' in y.uygula(l, { tur: 'sil', id: 'yok' }, T0));
  r = y.uygula(y.uygula(l, { tur: 'degistir', id, bitti: true }, T0).liste, { tur: 'temizle' }, T0);
  kontrol('temizle: bitenler gider', r.liste.length === 1 && !r.liste[0].bitti);
  kontrol('bilinmeyen komut hata', 'hata' in y.uygula(l, { tur: 'patlat' }, T0));
  kontrol('null komut hata', 'hata' in y.uygula(l, null, T0));
  kontrol('bozuk liste girdisi bos sayilir', y.uygula('bozuk', { tur: 'ekle', metin: 'x' }, T0).liste.length === 1);
  kontrol('bozuk ogeler suzulur', y.uygula([null, { id: 'zz!', metin: 'x' }, { id: 'ab', metin: '', t: 1 }], { tur: 'temizle' }, T0).liste.length === 0);

  // sirala
  const o = (id, ek) => ({ id, metin: id, bitti: false, t: 0, bittiT: null, tarih: null, ...ek });
  const s = y.sirala([
    o('a', { t: 1 }),
    o('b', { t: 2 }),
    o('c', { tarih: '2026-11-20', t: 3 }),
    o('d', { tarih: '2026-11-12', t: 4 }),
    o('e', { bitti: true, bittiT: 10, t: 5 }),
    o('f', { bitti: true, bittiT: 20, t: 6 }),
  ]).map((x) => x.id);
  kontrol('sirala: tarihliler artan, tarihsizler yeni ustte, bitenler sonda yeni ustte', s.join('') === 'dcbafe', s.join(''));
  kontrol('sirala: bozuk girdi bos dizi', Array.isArray(y.sirala(null)) && y.sirala(null).length === 0);

  // kosucu
  const dosya = path.join(GECICI, 'liste', 'yapilacaklar.json');
  let saat = T0;
  const yayinlar = [];
  let k = y.kur({ dosya, yayin: (x) => yayinlar.push(x), simdi: () => saat });
  kontrol('kosucu: bos liste', k.liste().length === 0);
  let c = k.komut({ tur: 'ekle', metin: 'süt al' });
  kontrol('kosucu: ekle -> tamam + oge, yayin', c.tamam === true && c.oge && yayinlar.length === 1 && yayinlar[0].length === 1, c);
  const disk = JSON.parse(fs.readFileSync(dosya, 'utf8'));
  kontrol('atomik yazim: dosya gecerli JSON, surum 1', disk.surum === 1 && disk.ogeler.length === 1 && !fs.readdirSync(path.dirname(dosya)).some((a) => a.endsWith('.tmp')), disk);
  c = k.komut({ tur: 'ekle', metin: '' });
  kontrol('kosucu: hata doner, yayin yok', typeof c.hata === 'string' && yayinlar.length === 1, c);
  const eid = k.komut({ tur: 'ekle', metin: 'eski is' }).oge.id;
  k.komut({ tur: 'degistir', id: eid, bitti: true });
  saat = T0 + 6 * 86400_000;
  kontrol('6 gunluk biten durur', k.liste().some((x) => x.id === eid));
  saat = T0 + 8 * 86400_000;
  kontrol('7 gunden eski biten okurken duser', !k.liste().some((x) => x.id === eid) && k.liste().length === 1);
  kontrol('duseni diskte de yok', JSON.parse(fs.readFileSync(dosya, 'utf8')).ogeler.length === 1);
  k.kapat();
  kontrol('kapali kosucu komut almaz', 'hata' in k.komut({ tur: 'ekle', metin: 'x' }));
  k = y.kur({ dosya, yayin: () => {}, simdi: () => saat });
  kontrol('kalicilik: yeniden acilista ayni liste', k.liste().length === 1 && k.liste()[0].metin === 'süt al');
  k.kapat();
  fs.writeFileSync(dosya, '{"surum":1,"ogeler":[');
  k = y.kur({ dosya, yayin: () => {}, simdi: () => saat });
  kontrol('bozuk dosya: bos liste, .bozuk yedegi', k.liste().length === 0 && fs.existsSync(dosya + '.bozuk'));
  kontrol('bozuk dosyadan sonra ekle calisir', k.komut({ tur: 'ekle', metin: 'yeni' }).tamam === true && JSON.parse(fs.readFileSync(dosya, 'utf8')).ogeler.length === 1);
  k.kapat();
}

// ---------------------------------------------------------------------------------------------------
async function sistemTesti() {
  basla('sistem');
  const sistem = gerek('sistem.cjs');
  const g = sistem.gpuAyristir('NVIDIA Örnek GPU, 37, 2048, 8192, 55\r\nİkinci GPU, 1, 2, 3, 4\r\n');
  kontrol('gpuAyristir: ilk GPU, MiB -> bayt', g && g.ad === 'NVIDIA Örnek GPU' && g.yuzde === 37 && g.bellekKullanilan === 2048 * 1048576 && g.bellekToplam === 8192 * 1048576 && g.sicaklik === 55, g);
  kontrol('gpuAyristir: sicaklik [N/A] -> null', sistem.gpuAyristir('A, 5, 1, 2, [N/A]').sicaklik === null);
  kontrol('gpuAyristir: bozuk -> null', sistem.gpuAyristir('') === null && sistem.gpuAyristir('sacma') === null && sistem.gpuAyristir('A, [N/A], x, 2') === null && sistem.gpuAyristir(null) === null);

  // Sahte CPU: her ornekte bos +60, toplam +100 -> %40
  let n = 0;
  const cpular = () => {
    n++;
    return [{ times: { user: n * 30, nice: 0, sys: n * 10, idle: n * 60, irq: 0 } }];
  };
  const yayinlar = [];
  let gpuCagri = 0;
  const s = sistem.kur({
    yayin: (d) => yayinlar.push(d),
    aralikMs: 5,
    gpuAralikMs: 10,
    cpular,
    gpuKomutu: async () => {
      gpuCagri++;
      return 'NVIDIA Örnek GPU, 12, 1000, 8000, 40';
    },
  });
  await uyu(120);
  kontrol('izlenmezken yayin yok', yayinlar.length === 0);
  kontrol('izlenmezken GPU sorgusu yok', gpuCagri === 0);
  kontrol('izlenmezken de CPU orneklenir (gecmis doluyor)', s.anlik().gecmis.length > 3, s.anlik().gecmis.length);
  kontrol('cpu yuzdesi farktan: %40', s.anlik().cpu === 40, s.anlik().cpu);
  s.izle(true);
  kontrol('izle(true): hemen bir yayin', yayinlar.length >= 1);
  await uyu(80);
  kontrol('izlerken yayin ve GPU', yayinlar.length > 3 && gpuCagri >= 1 && s.anlik().gpu && s.anlik().gpu.yuzde === 12, { y: yayinlar.length, gpuCagri });
  const son = yayinlar[yayinlar.length - 1];
  kontrol('SistemDurumu bicimi', typeof son.cpu === 'number' && son.bellek.toplam > 0 && son.bellek.kullanilan >= 0 && son.bellek.kullanilan <= son.bellek.toplam && Array.isArray(son.gecmis) && Number.isFinite(son.olculdu), son);
  s.izle(true);
  s.izle(false);
  const y1 = yayinlar.length;
  await uyu(60);
  kontrol('iki izleyen, biri kapaninca yayin surer', yayinlar.length > y1 && s.izleyenSayisi() === 1);
  s.izle(false);
  s.izle(false);
  s.izle('evet');
  kontrol('izleyen sayaci sifirin altina inmez, bozuk girdi yok sayilir', s.izleyenSayisi() === 0);
  const y2 = yayinlar.length;
  const gc = gpuCagri;
  await uyu(60);
  kontrol('izleyen kalmayinca yayin ve GPU durur', yayinlar.length === y2 && gpuCagri === gc, { y: yayinlar.length - y2, g: gpuCagri - gc });
  for (let i = 0; i < 60 && s.anlik().gecmis.length < 60; i++) await uyu(50);
  await uyu(100);
  kontrol('gecmis 60 olcumde kirpilir', s.anlik().gecmis.length === 60, s.anlik().gecmis.length);
  s.kapat();
  const nk = n;
  await uyu(40);
  kontrol('kapat: ornekleme durur', n === nk);

  // ENOENT bir daha denenmez
  let enoent = 0;
  const s2 = sistem.kur({
    yayin: () => {},
    aralikMs: 5,
    gpuAralikMs: 5,
    gpuKomutu: () => {
      enoent++;
      return Promise.reject(Object.assign(new Error('yok'), { code: 'ENOENT' }));
    },
  });
  s2.izle(true);
  await uyu(60);
  s2.izle(false);
  s2.izle(true);
  await uyu(30);
  kontrol('ENOENT: GPU bir kez denendi, gpu null', enoent === 1 && s2.anlik().gpu === null, enoent);
  s2.kapat();
  // Gecici hata tekrar denenir
  let gecici = 0;
  const s3 = sistem.kur({ yayin: () => {}, aralikMs: 5, gpuAralikMs: 5, gpuKomutu: () => (gecici++, Promise.reject(Object.assign(new Error('zaman'), { code: 'ETIMEDOUT' }))) });
  s3.izle(true);
  await uyu(60);
  kontrol('gecici GPU hatasi tekrar denenir', gecici > 1 && s3.anlik().gpu === null, gecici);
  s3.kapat();
  // Gercek os.cpus ile yuzde 0-100 ve bozuk cpu listesi
  const s4 = sistem.kur({ yayin: () => {}, aralikMs: 20, gpuKomutu: async () => '' });
  await uyu(120);
  const g4 = s4.anlik().gecmis;
  kontrol('gercek os.cpus: yuzdeler 0-100', g4.length > 0 && g4.every((x) => x >= 0 && x <= 100), g4);
  s4.izle(true);
  await uyu(30);
  kontrol('bos GPU ciktisi -> gpu null', s4.anlik().gpu === null);
  s4.kapat();
  const s5 = sistem.kur({ yayin: () => {}, aralikMs: 5, cpular: () => [], gpuKomutu: async () => '' });
  await uyu(40);
  kontrol('bos cpu listesi: cokme yok, cpu 0', s5.anlik().cpu === 0);
  s5.kapat();
}

// ---------------------------------------------------------------------------------------------------
function havaFiksturu(simdiMs) {
  // 2026-11-11 Istanbul gibi bir yer: UTC+3. Saatlik veri yerel gece yarisindan 5 gun.
  const ofset = 10800;
  const gece = Date.UTC(2026, 10, 10, 21, 0) / 1000;
  const saat = [];
  const sic = [];
  const kod = [];
  const yag = [];
  for (let i = 0; i < 120; i++) {
    saat.push(gece + i * 3600);
    sic.push(Math.round((8 + i * 0.1) * 10) / 10);
    kod.push(i % 2 ? 3 : 61);
    yag.push(i % 5 === 0 ? null : (i * 7) % 100);
  }
  return {
    latitude: 39.92,
    longitude: 32.85,
    generationtime_ms: 0.1,
    utc_offset_seconds: ofset,
    timezone: 'Europe/Istanbul',
    timezone_abbreviation: 'GMT+3',
    elevation: 850,
    current_units: { time: 'unixtime', interval: 'seconds', temperature_2m: '°C' },
    current: { time: Math.floor(simdiMs / 1000 / 900) * 900, interval: 900, temperature_2m: 12.6, apparent_temperature: 10.2, is_day: 1, weather_code: 2, wind_speed_10m: 11.4, relative_humidity_2m: 71 },
    hourly_units: { time: 'unixtime', temperature_2m: '°C' },
    hourly: { time: saat, temperature_2m: sic, weather_code: kod, precipitation_probability: yag },
    daily_units: { time: 'unixtime' },
    daily: {
      time: [0, 1, 2, 3, 4].map((i) => gece + i * 86400),
      weather_code: [61, 3, 0, 80, 95],
      temperature_2m_max: [14.4, 15.5, 16.6, 13.2, 9.9],
      temperature_2m_min: [4.4, 5.5, 6.6, 3.2, -0.6],
      precipitation_probability_max: [80, 20, 0, 60, 90],
    },
  };
}

async function havaTesti() {
  basla('hava');
  const hava = gerek('hava.cjs');
  const KA = { ad: 'Örnekşehir', bolge: 'Örnek', ulke: 'Türkiye', enlem: 39.92, boylam: 32.85 };
  const KB = { ad: 'Başkayer', enlem: 41.0, boylam: 29.0 };
  const dizin = path.join(GECICI, 'hava');
  let saat = Date.UTC(2026, 10, 11, 9, 30);
  const urller = [];
  let cevap = () => ({ kod: 200, govde: JSON.stringify(havaFiksturu(saat)) });
  const istek = async (url) => {
    urller.push(url);
    const c = cevap(url);
    if (c instanceof Error) throw c;
    return c;
  };
  const sec = (ek) => ({ dizin, istek, simdi: () => saat, ...ek });

  kontrol('konum null -> konumYok', 'konumYok' in (await hava.getir(null, sec())));
  kontrol('konum bozuk -> konumYok', 'konumYok' in (await hava.getir({ ad: 'x', enlem: 'a', boylam: 2 }, sec())) && 'konumYok' in (await hava.getir({ ad: 'x', enlem: 95, boylam: 2 }, sec())));
  kontrol('konumYok iken istek yok', urller.length === 0);
  const h = await hava.getir(KA, sec());
  kontrol('getir: tek istek, dogru parametreler', urller.length === 1 && /latitude=39\.9200&longitude=32\.8500/.test(urller[0]) && urller[0].includes('timeformat=unixtime') && urller[0].includes('forecast_days=5') && urller[0].includes('timezone=auto') && urller[0].startsWith('https://api.open-meteo.com/v1/forecast?'), urller[0]);
  kontrol('getir: sicaklik yuvarlanir (12.6 -> 13, 10.2 -> 10)', h.sicaklik === 13 && h.hissedilen === 10, h);
  kontrol('getir: kod, gunduz, ruzgar, nem', h.kod === 2 && h.gunduz === true && h.ruzgar === 11 && h.nem === 71, h);
  kontrol('getir: konum geri doner', h.konum.ad === 'Örnekşehir' && h.konum.ulke === 'Türkiye');
  kontrol('saatlik: 12 kayit, hepsi simdiden sonra', h.saatlik.length === 12 && h.saatlik.every((x) => x.t > saat) && h.saatlik[0].t === Date.UTC(2026, 10, 11, 10, 0), h.saatlik.map((x) => x.t));
  kontrol('saatlik: tam sayi sicaklik, null yagis 0', h.saatlik.every((x) => Number.isInteger(x.sicaklik) && Number.isInteger(x.yagis)));
  kontrol('gunluk: 5 gun, konumun yerel takvim gunu', h.gunluk.length === 5 && h.gunluk[0].gun === '2026-11-11' && h.gunluk[4].gun === '2026-11-15', h.gunluk.map((x) => x.gun));
  kontrol('gunluk: yuvarlanmis en yuksek/en dusuk (-0.6 -> -1)', h.gunluk[0].enYuksek === 14 && h.gunluk[0].enDusuk === 4 && h.gunluk[4].enDusuk === -1 && h.gunluk[0].yagis === 80, h.gunluk);
  kontrol('olculdu = simdi, bayat yok', h.olculdu === saat && !h.bayat);
  const disk = JSON.parse(fs.readFileSync(path.join(dizin, 'hava.json'), 'utf8'));
  kontrol('diske yazildi (gecerli JSON)', disk.surum === 1 && disk.durum.sicaklik === 13);

  saat += 10 * DK;
  await hava.getir(KA, sec());
  kontrol('20 dk icinde onbellek: yeni istek yok', urller.length === 1);
  saat += 11 * DK;
  await hava.getir(KA, sec());
  kontrol('20 dk sonra yeni istek', urller.length === 2);
  saat += 10 * 1000;
  await hava.getir(KA, sec({ taze: true }));
  kontrol('taze: son istekten 10 sn sonra gercek istek yok', urller.length === 2);
  saat += 55 * 1000;
  await hava.getir(KA, sec({ taze: true }));
  kontrol('taze: 60 sn sonra gercek istek', urller.length === 3);

  // Konum degisince eski onbellek kullanilmaz
  const hb = await hava.getir(KB, sec());
  kontrol('konum degisti: yeni istek, yeni konum', urller.length === 4 && hb.konum.ad === 'Başkayer' && /latitude=41\.0000/.test(urller[3]), urller[3]);

  // Ag hatasi: bayat
  saat += 25 * DK;
  cevap = () => Object.assign(new Error('getaddrinfo ENOTFOUND'), { code: 'ENOTFOUND' });
  const hz = await hava.getir(KA, sec());
  kontrol('ag hatasi: son olcum bayat:true ile', hz.bayat === true && hz.sicaklik === 13 && hz.konum.ad === 'Örnekşehir', hz);
  // Diskten bayat: bellegi olmayan yeni bir dizine diski kopyala
  const dizin2 = path.join(GECICI, 'hava2');
  fs.mkdirSync(dizin2, { recursive: true });
  fs.copyFileSync(path.join(dizin, 'hava.json'), path.join(dizin2, 'hava.json'));
  const hd = await hava.getir(KB, sec({ dizin: dizin2 }));
  kontrol('ag hatasi: diskteki son olcum ayni konumunsa bayat', hd.bayat === true && hd.konum.ad === 'Başkayer', hd);
  const hfark = await hava.getir({ ad: 'Üçüncü', enlem: 10, boylam: 10 }, sec({ dizin: dizin2 }));
  kontrol('ag hatasi: diskteki olcum baska konumunsa hata', typeof hfark.hata === 'string' && hfark.hata === 'Hava durumu alınamadı: bağlantı yok.', hfark);
  saat += 7 * 3600 * 1000;
  const heski = await hava.getir(KA, sec());
  kontrol('6 saatten eski olcum: hata', typeof heski.hata === 'string' && heski.hata.startsWith('Hava durumu alınamadı'), heski);
  const istekOnce = urller.length;
  saat += 30 * 1000;
  const hTekrar = await hava.getir(KA, sec({ taze: true }));
  kontrol('hatadan sonra 60 sn icinde yeni istek yok (taze bile), ayni hata', urller.length === istekOnce && 'hata' in hTekrar, { n: urller.length - istekOnce, hTekrar });
  // Sunucu hatalari (onbelleksiz dizin)
  const dz = (ad) => path.join(GECICI, 'hava-' + ad);
  cevap = () => ({ kod: 500, govde: 'ic hata' });
  kontrol('HTTP 500: hata metni', (await hava.getir(KA, sec({ dizin: dz('500') }))).hata === 'Hava durumu alınamadı: sunucu 500 hatası verdi.');
  cevap = () => ({ kod: 200, govde: '<html>' });
  kontrol('bozuk JSON: hata', (await hava.getir(KA, sec({ dizin: dz('json') }))).hata === 'Hava durumu alınamadı: sunucu yanıtı geçersiz.');
  cevap = () => ({ kod: 200, govde: JSON.stringify({ hourly: {} }) });
  kontrol('current yok: hata', 'hata' in (await hava.getir(KA, sec({ dizin: dz('cur') }))));
  cevap = () => Object.assign(new Error('zaman'), { code: 'ETIMEDOUT' });
  kontrol('zaman asimi: hata metni', (await hava.getir(KA, sec({ dizin: dz('zaman') }))).hata === 'Hava durumu alınamadı: zaman aşımı.');
  // Bozuk disk dosyasi
  const dzb = dz('bozuk');
  fs.mkdirSync(dzb, { recursive: true });
  fs.writeFileSync(path.join(dzb, 'hava.json'), '{bozuk');
  cevap = () => ({ kod: 200, govde: JSON.stringify(havaFiksturu(saat)) });
  const hbz = await hava.getir(KA, sec({ dizin: dzb }));
  kontrol('bozuk hava.json: yok sayilir, yeni olcum', hbz.sicaklik === 13 && !hbz.bayat);
  // Ayni anda iki istek tek gercek istek
  const once = urller.length;
  const [p1, p2] = await Promise.all([hava.getir(KB, sec({ dizin: dz('es') })), hava.getir(KB, sec({ dizin: dz('es') }))]);
  kontrol('eszamanli iki getir: tek istek', urller.length === once + 1 && p1.sicaklik === p2.sicaklik);

  // ara
  const GEO = {
    results: [
      { id: 1, name: 'Örnekşehir', latitude: 39.92, longitude: 32.85, elevation: 900, feature_code: 'PPLC', country_code: 'TR', admin1: 'Örnek', country: 'Türkiye', timezone: 'Europe/Istanbul' },
      { id: 2, name: 'Örnekköy', latitude: 40.1, longitude: 33.2, country: 'Türkiye' },
      { id: 3, name: 'Bozuk', latitude: 'x', longitude: 1 },
    ],
    generationtime_ms: 0.5,
  };
  const geoUrl = [];
  const geoIstek = async (url) => (geoUrl.push(url), { kod: 200, govde: JSON.stringify(GEO) });
  const a = await hava.ara('Örnek şehir', { istek: geoIstek });
  kontrol('ara: ceviri ad/bolge/ulke/enlem/boylam', a.length === 2 && a[0].ad === 'Örnekşehir' && a[0].bolge === 'Örnek' && a[0].ulke === 'Türkiye' && a[0].enlem === 39.92 && a[0].boylam === 32.85, a);
  kontrol('ara: bolgesi olmayanda alan yok, bozuk sonuc atlanir', !('bolge' in a[1]) && a[1].ulke === 'Türkiye');
  kontrol('ara: URL kodlanmis, count=6, language=tr', geoUrl[0] === 'https://geocoding-api.open-meteo.com/v1/search?name=' + encodeURIComponent('Örnek şehir') + '&count=6&language=tr&format=json', geoUrl[0]);
  kontrol('ara: 2 karakterden kisa -> [] istek yok', (await hava.ara('a', { istek: geoIstek })).length === 0 && (await hava.ara('  ', { istek: geoIstek })).length === 0 && (await hava.ara(null, { istek: geoIstek })).length === 0 && geoUrl.length === 1);
  kontrol('ara: sonuc yok -> []', (await hava.ara('zzzz', { istek: async () => ({ kod: 200, govde: '{"generationtime_ms":1}' }) })).length === 0);
  kontrol('ara: ag hatasi -> [] (reddetmez)', (await hava.ara('Ankara', { istek: async () => { throw new Error('ag'); } })).length === 0);

  // Kodlar
  const WMO = [0, 1, 2, 3, 45, 48, 51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 71, 73, 75, 77, 80, 81, 82, 85, 86, 95, 96, 99];
  const IKONLAR = new Set(['Sun', 'Moon', 'CloudSun', 'CloudMoon', 'Cloud', 'CloudFog', 'CloudDrizzle', 'CloudRain', 'CloudRainWind', 'CloudSnow', 'CloudLightning']);
  const eksik = WMO.filter((kd) => hava.kodMetni(kd, true) === 'Belirsiz' || !IKONLAR.has(hava.kodIkonu(kd, true)) || !IKONLAR.has(hava.kodIkonu(kd, false)));
  kontrol('tum WMO kodlari icin metin ve izinli ikon', eksik.length === 0, eksik);
  kontrol('kod metinleri: 0 Açık, 3 Kapalı, 45 Sisli, 63 Yağmurlu, 95 Gök gürültülü fırtına', hava.kodMetni(0) === 'Açık' && hava.kodMetni(3) === 'Kapalı' && hava.kodMetni(45) === 'Sisli' && hava.kodMetni(63) === 'Yağmurlu' && hava.kodMetni(95) === 'Gök gürültülü fırtına');
  kontrol('gece ikonlari: 0 Moon, 2 CloudMoon; gunduz Sun, CloudSun', hava.kodIkonu(0, false) === 'Moon' && hava.kodIkonu(2, false) === 'CloudMoon' && hava.kodIkonu(0, true) === 'Sun' && hava.kodIkonu(2, true) === 'CloudSun');
  kontrol('bilinmeyen kod: Belirsiz / Cloud', hava.kodMetni(1234) === 'Belirsiz' && hava.kodIkonu(1234) === 'Cloud' && hava.kodMetni('x') === 'Belirsiz' && hava.kodIkonu(null) === 'Cloud');
}

// ---------------------------------------------------------------------------------------------------
function rafTesti() {
  basla('raf');
  const raf = gerek('raf.cjs');
  const dz = path.join(GECICI, 'raf-dosyalar');
  fs.mkdirSync(path.join(dz, 'klasor'), { recursive: true });
  const yaz = (ad, icerik = 'x') => {
    const y = path.join(dz, ad);
    fs.writeFileSync(y, icerik);
    return y;
  };
  const metin = yaz('not.txt', 'merhaba');
  const resim = yaz('resim.png', 'png-gibi');
  const buyuk = yaz('buyuk.jpg', 'jpg');
  const patlak = yaz('patlak.gif', 'gif');
  const dosya = path.join(GECICI, 'raf', 'raf.json');
  let saat = T0;
  const yayinlar = [];
  const onizlemeCagri = [];
  const onizleme = (y) => {
    onizlemeCagri.push(path.basename(y));
    if (y.endsWith('.png')) return 'data:image/png;base64,QUJD';
    if (y.endsWith('.jpg')) return 'data:image/jpeg;base64,' + 'A'.repeat(70 * 1024);
    throw new Error('bozuk resim');
  };
  const ac = () => raf.kur({ dosya, yayin: (l) => yayinlar.push(l), onizleme, simdi: () => saat });
  let r = ac();
  kontrol('bos raf', r.liste().length === 0);
  const n = r.ekle([metin, resim, path.join(dz, 'klasor'), buyuk, patlak]);
  kontrol('ekle: 5 yol kabul', n === 5 && r.liste().length === 5, n);
  const l = r.liste();
  const bul = (ad) => l.find((x) => x.ad === ad);
  kontrol('tur: dosya / klasor, boyut', bul('not.txt').tur === 'dosya' && bul('not.txt').boyut === 7 && bul('klasor').tur === 'klasor' && bul('klasor').boyut === null);
  kontrol('onizleme: png data URL saklandi', bul('resim.png').onizleme === 'data:image/png;base64,QUJD');
  kontrol('onizleme: 60 KB ustu saklanmaz, hata null', bul('buyuk.jpg').onizleme === null && bul('patlak.gif').onizleme === null);
  kontrol('onizleme yalniz goruntu uzantisinda cagrilir', !onizlemeCagri.includes('not.txt') && !onizlemeCagri.includes('klasor'), onizlemeCagri);
  kontrol('id: sha1(yol) ilk 12 hex', /^[0-9a-f]{12}$/.test(bul('not.txt').id) && bul('not.txt').id === require('crypto').createHash('sha1').update(path.resolve(metin)).digest('hex').slice(0, 12));
  kontrol('liste() ciktisinda yol alani YOK', l.every((x) => !('yol' in x)) && !JSON.stringify(l).includes(JSON.stringify(dz).slice(1, -1)), Object.keys(l[0]));
  kontrol('liste() RafOgesi alanlari', l.every((x) => typeof x.id === 'string' && typeof x.ad === 'string' && typeof x.t === 'number' && x.var === true && 'onizleme' in x && 'boyut' in x));
  kontrol('yayin cagrildi', yayinlar.length === 1 && yayinlar[0].length === 5);
  saat += 1000;
  const metinId = bul('not.txt').id;
  kontrol('yinelenen: eklenmez, zaman tazelenir, en uste', r.ekle([metin]) === 1 && r.liste().length === 5 && r.liste()[0].id === metinId && r.liste()[0].t === saat);
  kontrol('ekle: goreli yol reddedilir', r.ekle(['goreli/yol.txt']) === 0);
  kontrol('ekle: olmayan yol reddedilir', r.ekle([path.join(dz, 'yok.txt')]) === 0);
  kontrol('ekle: bozuk girdi reddedilir', r.ekle([null, 5, {}, '', 'C:\\a\u0001b']) === 0 && r.ekle(null) === 0 && r.ekle(undefined) === 0);
  kontrol('yol(id): var olan dosya', r.yol(metinId) === path.resolve(metin));
  kontrol('oge(id): ham kayit yol dahil', r.oge(metinId).yol === path.resolve(metin));
  kontrol('yol/oge: bilinmeyen id null', r.yol('yok') === null && r.oge('yok') === null);
  fs.rmSync(metin);
  kontrol('silinen dosya: var false', r.liste().find((x) => x.id === metinId).var === false);
  kontrol('silinen dosya: yol null', r.yol(metinId) === null);

  // Baglanti
  kontrol('baglanti: https kabul', r.baglantiEkle('https://www.example.com/docs/a/b?q=1') === true);
  const b = r.liste()[0];
  kontrol('baglanti: tur, ad (host + yol), adres', b.tur === 'baglanti' && b.ad === 'example.com/docs/a/b' && b.adres === 'https://www.example.com/docs/a/b?q=1' && b.var === true && b.boyut === null, b);
  kontrol('baglanti: yol(id) null, oge adresli', r.yol(b.id) === null && r.oge(b.id).adres === b.adres);
  kontrol('baglanti: http kabul', r.baglantiEkle('http://example.org') === true && r.liste()[0].ad === 'example.org');
  for (const kotu of ['javascript:alert(1)', 'file:///C:/Windows/win.ini', 'ftp://example.com/x', 'data:text/html,hi', '', '   ', 'example.com', 'https://', 'https://kullanici:parola@example.com/', 'https://ex ample.com', 'https://example.com/' + 'a'.repeat(2000), null, 42]) {
    kontrol('baglanti reddedilir: ' + JSON.stringify(String(kotu).slice(0, 40)), r.baglantiEkle(kotu) === false);
  }
  const uzun = 'https://example.com/' + 'x'.repeat(100);
  r.baglantiEkle(uzun);
  kontrol('baglanti: uzun yol kisaltilir', r.liste()[0].ad.length <= 80 && r.liste()[0].ad.includes('…'), r.liste()[0].ad);

  // Sil
  const say = r.liste().length;
  kontrol('sil: kimlikle', r.sil([b.id, 'yok']) === 1 && r.liste().length === say - 1);
  kontrol('sil: bozuk girdi', r.sil('bozuk') === 0 && r.sil(null) === 0);

  // 24 siniri
  const yollar = [];
  for (let i = 0; i < 30; i++) yollar.push(yaz('d' + i + '.txt'));
  for (const y of yollar) {
    saat += 1000;
    r.ekle([y]);
  }
  const l24 = r.liste();
  kontrol('24 sinir: en eski duser', l24.length === 24 && l24[0].ad === 'd29.txt' && !l24.some((x) => x.ad === 'd0.txt' || x.ad === 'resim.png'), l24.map((x) => x.ad).slice(-3));
  // Kalicilik
  r.kapat();
  const yy = yayinlar.length;
  r.ekle([yollar[0]]);
  kontrol('kapali raf degismez, yayin yok', yayinlar.length === yy);
  r = ac();
  kontrol('kalicilik: ayni 24 oge ayni sirada', JSON.stringify(r.liste().map((x) => x.id)) === JSON.stringify(l24.map((x) => x.id)));
  kontrol('dosya gecerli JSON, surum 1', JSON.parse(fs.readFileSync(dosya, 'utf8')).surum === 1);
  kontrol('sil hepsi', r.sil('hepsi') === 24 && r.liste().length === 0);
  r.kapat();
  // Bozuk dosya ve bozuk kayitlar
  fs.writeFileSync(dosya, '{bozuk');
  r = ac();
  kontrol('bozuk dosya: bos raf + .bozuk yedegi', r.liste().length === 0 && fs.existsSync(dosya + '.bozuk'));
  r.kapat();
  fs.writeFileSync(dosya, JSON.stringify({ surum: 1, ogeler: [{ tur: 'baglanti', adres: 'javascript:alert(1)', t: 1 }, { tur: 'dosya', yol: 'goreli', t: 1 }, { tur: 'uydurma', t: 1 }, null, { tur: 'baglanti', adres: 'https://example.com', t: 2 }] }));
  r = ac();
  kontrol('diskteki bozuk/tehlikeli kayitlar suzulur', r.liste().length === 1 && r.liste()[0].adres === 'https://example.com/', r.liste());
  r.kapat();
}

// ---------------------------------------------------------------------------------------------------
function sesSayfaTesti() {
  basla('ses-sayfa');
  const { coz, sayiCoz } = gerek('ses-sayfa.cjs');
  const es = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const M = (istek) => ({ tur: 'medya', komut: istek === 'sonraki' || istek === 'onceki' ? istek : 'oynat-duraklat', istek });
  const O = (komut) => ({ tur: 'odak', komut });
  const OLUMLU = [
    ['müziği durdur', M('durdur')],
    ['Müziği durdur.', M('durdur')],
    ['Ada, müziği durdur.', M('durdur')],
    ['şarkıyı duraklat', M('durdur')],
    ['müziği kapat', M('durdur')],
    ['müziği devam ettir', M('devam')],
    ['Müziği başlat', M('devam')],
    ['çal', M('devam')],
    ['Çal.', M('devam')],
    ['sonraki şarkı', M('sonraki')],
    ['Şarkıyı geç.', M('sonraki')],
    ['sonrakine geç', M('sonraki')],
    ['önceki şarkı', M('onceki')],
    ['odak başlat', O({ tur: 'baslat', asama: 'odak' })],
    ['Odaklanma başlat', O({ tur: 'baslat', asama: 'odak' })],
    ['pomodoro başlat', O({ tur: 'baslat', asama: 'odak' })],
    ['25 dakika odak', O({ tur: 'baslat', asama: 'odak', dakika: 25 })],
    ['kırk dakika odaklan', O({ tur: 'baslat', asama: 'odak', dakika: 40 })],
    ['Kırk beş dakika odak.', O({ tur: 'baslat', asama: 'odak', dakika: 45 })],
    ['doksan dakika odaklan', O({ tur: 'baslat', asama: 'odak', dakika: 90 })],
    ['odak başlat 50 dakika', O({ tur: 'baslat', asama: 'odak', dakika: 50 })],
    ['mola ver', O({ tur: 'baslat', asama: 'kisa' })],
    ['beş dakika mola', O({ tur: 'baslat', asama: 'kisa', dakika: 5 })],
    ['uzun mola ver', O({ tur: 'baslat', asama: 'uzun' })],
    ['odağı durdur', O({ tur: 'duraklat' })],
    ['Odağı duraklat.', O({ tur: 'duraklat' })],
    ['odağı bitir', O({ tur: 'sifirla' })],
    ['odağı sıfırla', O({ tur: 'sifirla' })],
    ['molayı atla', O({ tur: 'atla' })],
    ['odak ne durumda', { tur: 'odak-durum' }],
    ['Kaç dakika kaldı?', { tur: 'odak-durum' }],
    ['listeye ekle: süt al', { tur: 'liste-ekle', metin: 'Süt al', tarih: null }],
    ['listeye ekle süt al', { tur: 'liste-ekle', metin: 'Süt al', tarih: null }],
    ['Listeye ekle, Proje-A raporunu gönder.', { tur: 'liste-ekle', metin: 'Proje-A raporunu gönder', tarih: null }],
    ['yapılacaklara ekle yarın rapor', { tur: 'liste-ekle', metin: 'Rapor', tarih: '2026-11-12' }],
    ['listede ne var', { tur: 'liste-oku' }],
    ['Yapılacakları oku.', { tur: 'liste-oku' }],
    ['bugün ne yapacağım', { tur: 'liste-oku' }],
    ['hava nasıl', { tur: 'hava' }],
    ['Hava durumu.', { tur: 'hava' }],
    ['bugün hava nasıl', { tur: 'hava' }],
    ['Yağmur yağacak mı?', { tur: 'hava' }],
    ['sistem ne durumda', { tur: 'sistem' }],
    ['İşlemci ne kadar?', { tur: 'sistem' }],
  ];
  for (const [g, b] of OLUMLU) {
    const r = coz(g, T0);
    kontrol('olumlu ' + JSON.stringify(g), es(r, b), r);
  }
  const OLUMSUZ = [
    "Matbaa'ya yaz, müziği durduran kodu sil",
    'listeye ekleme butonu bozuk, düzelt',
    'listeye ekle butonu çalışmıyor',
    'listeye ekle düğmesini sağa al',
    'odak sayfasındaki sayaç yanlış gösteriyor',
    "Kokpit'e yaz hava durumu ikonları renkli olmasın",
    'müzik çalarken Ada kasıyor',
    'müziği durdur dediğimde çalışmıyor',
    'hava nasıl diye sorunca hata veriyor',
    'not al: yarın süt al',
    'odak modunu baştan yaz',
    'pomodoro süresini ayarlardan değiştirilebilir yap',
    'sistem sayfasında GPU görünmüyor',
    'listede ne var diye sorunca boş dönüyor',
    'şarkı sözleri kaymış, düzelt',
    'sonraki şarkı düğmesine tooltip ekle',
    'mola bitince ses çalsın',
    'Matbaa ne durumda',
    'durum',
    'günaydın',
    'yapılacaklar listesini Takvim sayfasında da göster',
    "hava durumu API'sini değiştir",
    'işlemci grafiği titriyor',
    'kaç dakika kaldı yazısını büyüt',
    'odak başlat butonunu sağa al',
    'müziği durdur ve odak başlat',
    'Matbaa\'ya yaz listeye ekle süt al',
    'listeye ekle',
    'listeye ekle kodunu yeniden düzenle',
    'iki yüz dakika odak',
    '500 dakika odak',
    'devam et',
    'sonraki',
    '',
  ];
  for (const g of OLUMSUZ) {
    const r = coz(g, T0);
    kontrol('olumsuz ' + JSON.stringify(g) + ' -> null', r === null, r);
  }
  kontrol('bozuk girdi: null/sayi/nesne -> null', coz(null) === null && coz(42) === null && coz({}) === null && coz(undefined) === null);
  kontrol('cok uzun cumle -> null', coz('müziği durdur ' + 'a'.repeat(500)) === null);
  kontrol('sayiCoz: yirmi beş 25, doksan dokuz 99, 12 -> 12, sacma null', sayiCoz('yirmi beş') === 25 && sayiCoz('doksan dokuz') === 99 && sayiCoz('12') === 12 && sayiCoz('beş yirmi') === null);
  kontrol('listeye ekle: metnin buyuk harfi korunur, tarih ayiklanir', es(coz('Listeye ekle: cuma günü: Proje-A teslimi', T0), { tur: 'liste-ekle', metin: 'Proje-A teslimi', tarih: '2026-11-13' }), coz('Listeye ekle: cuma günü: Proje-A teslimi', T0));
}

(async () => {
  try {
    odakTesti();
    yapilacakTesti();
    await sistemTesti();
    await havaTesti();
    rafTesti();
    sesSayfaTesti();
  } catch (e) {
    bolum = bolum || 'kosucu';
    kontrol('kosucu', false, e.stack);
  }
  try {
    fs.rmSync(GECICI, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    /* temp'te kalir */
  }
  console.log('\nbolum basina: ' + Object.entries(sayac).map(([k, v]) => k + ' ' + v).join(', '));
  console.log(gecen + ' gecti, ' + kalan + ' kaldi');
  if (kalan === 0) console.log('TUMU GECTI');
  process.exit(kalan === 0 ? 0 : 1);
})();
