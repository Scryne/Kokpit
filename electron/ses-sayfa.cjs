// v4.0, Ada'nin yeni sayfalarinin sesli komutlari: medya, odak, liste, hava, sistem. SAF.
//
// Bu cozucu oturumlara not yazdiran ses-komut.cjs'ten ONCE calisir; bu yuzden tek kural: cumlenin TAMAMI bir
// komutsa eslesir. Her kalip bastan sona capalidir. "Matbaa'ya yaz, müziği durduran kodu sil" ya da "listeye
// ekleme butonu bozuk" bir nottur ve buradan null donmelidir. Supheli her durumda null: yanlis yakalanan bir
// not kaybolur (Scryne'in oturuma soyledigi is muzigi durdurur), kacirilan bir komut ise yalniz tekrar edilir.

const { duzelt } = require('./ses-komut.cjs');
const { tarihAyikla } = require('./yapilacak.cjs');

/** Turkce kucuk harf, UZUNLUK KORUNARAK (eslesme konumu ozgun metinde ayni yere duser). */
function kucukHarf(s) {
  let out = '';
  for (const c of s) {
    const l = c.toLocaleLowerCase('tr-TR');
    out += l.length === c.length ? l : c;
  }
  return out;
}

// --- sayilar (whisper bazen rakam, bazen yazi verir) ---
const BIRLER = { bir: 1, iki: 2, üç: 3, uc: 3, dört: 4, dort: 4, beş: 5, bes: 5, altı: 6, alti: 6, yedi: 7, sekiz: 8, dokuz: 9 };
const ONLAR = { on: 10, yirmi: 20, otuz: 30, kırk: 40, kirk: 40, elli: 50, altmış: 60, altmis: 60, yetmiş: 70, yetmis: 70, seksen: 80, doksan: 90 };
const SAYI = String.raw`(\d{1,3}|(?:` + Object.keys(ONLAR).join('|') + String.raw`)(?:\s+(?:` + Object.keys(BIRLER).join('|') + '))?|(?:' + Object.keys(BIRLER).join('|') + '))';

/** "kırk beş" -> 45, "25" -> 25; taninmazsa null. */
function sayiCoz(s) {
  if (!s) return null;
  if (/^\d+$/.test(s)) return Number(s);
  const p = s.split(/\s+/);
  if (p.length === 1) return ONLAR[p[0]] ?? BIRLER[p[0]] ?? null;
  if (p.length === 2 && ONLAR[p[0]] !== undefined && BIRLER[p[1]] !== undefined) return ONLAR[p[0]] + BIRLER[p[1]];
  return null;
}

const DAKIKA = String.raw`(?:dakika|dakikalık|dk)`;
const SAYAC = String.raw`(?:odağı|odagi|odak|odaklanmayı|odaklanmayi|odak modunu|pomodoroyu|pomodoro|sayacı|sayaci|odak sayacını|zamanlayıcıyı)`;

const MEDYA = [
  [/^(?:müziği|muzigi|müzik|şarkıyı|sarkiyi|şarkı|parçayı|parcayi)\s+(?:durdur|duraklat|kapat|sustur|dur)$/u, 'durdur'],
  [/^(?:müziği|muzigi|şarkıyı|sarkiyi|parçayı|parcayi)\s+(?:devam ettir|sürdür|surdur|başlat|baslat|çal|cal|aç|ac|oynat)$/u, 'devam'],
  [/^(?:çal|müzik çal|müziği çal|şarkı çal|müziğe devam|müziğe devam et)$/u, 'devam'],
  [/^(?:(?:bir\s+)?sonraki\s+(?:şarkı|şarkıya geç|parça|parçaya geç)|sonrakine\s+geç|sonraki\s+şarkıya\s+geç|şarkıyı\s+(?:geç|atla|değiştir)|parçayı\s+(?:geç|atla|değiştir))$/u, 'sonraki'],
  [/^(?:(?:bir\s+)?önceki\s+(?:şarkı|şarkıya dön|şarkıya geç|parça|parçaya dön|parçaya geç)|öncekine\s+(?:dön|geç))$/u, 'onceki'],
];
const MEDYA_KOMUT = { durdur: 'oynat-duraklat', devam: 'oynat-duraklat', sonraki: 'sonraki', onceki: 'onceki' };

const ODAK_BASLAT = [
  new RegExp(String.raw`^(?:odak|odağı|odagi|odaklanma|odaklanmayı|odak modu|odak modunu|pomodoro|pomodoroyu|odak sayacını|odak sayacı)\s+(?:başlat|baslat|başlasın|kur|aç)$`, 'u'),
  /^(?:odaklan|odaklanalım|odaklanmaya başla|odaklanmaya başlayalım|pomodoro başlasın)$/u,
];
// "25 dakika odak", "kırk dakika odaklan", "45 dakikalık pomodoro başlat"
const ODAK_SURELI = new RegExp('^' + SAYI + String.raw`\s+` + DAKIKA + String.raw`\s+(?:odak|odaklan|odaklanma|pomodoro)(?:\s+(?:başlat|baslat|kur|aç))?$`, 'u');
// "odak başlat 40 dakika", "pomodoro 50 dakika"
const ODAK_SURELI2 = new RegExp(String.raw`^(?:odak|pomodoro)(?:\s+(?:başlat|baslat|kur))?\s+` + SAYI + String.raw`\s+` + DAKIKA + '$', 'u');
// "mola ver", "beş dakika mola", "uzun mola", "kısa mola başlat", "10 dakikalık mola ver"
const MOLA = new RegExp('^(?:' + SAYI + String.raw`\s+` + DAKIKA + String.raw`\s+)?(?:(kısa|kisa|uzun)\s+)?mola(?:\s+(?:ver|başlat|baslat|al|verelim|alalım))?$`, 'u');
const ODAK_DURAKLAT = new RegExp('^(?:' + SAYAC + String.raw`|molayı|molayi)\s+(?:durdur|duraklat|beklet)$`, 'u');
const ODAK_SIFIRLA = new RegExp('^(?:' + SAYAC + String.raw`)\s+(?:bitir|sıfırla|sifirla|iptal et|kapat)$`, 'u');
const ODAK_ATLA = /^(?:molayı|molayi|odağı|odagi)\s+(?:atla|geç|gec|bitir)$/u;
const ODAK_DURUM = /^(?:odak ne durumda|odak durumu|pomodoro ne durumda|sayaç ne durumda|kaç dakika kaldı|kaç dakikam kaldı|ne kadar kaldı|ne kadar süre kaldı|molaya ne kadar var|molaya kaç dakika var|mola ne zaman|kaç tur yaptım|bugün kaç tur yaptım|kaç pomodoro yaptım)$/u;

// Liste: "listeye ekle: süt al", "yapılacaklara ekle yarın rapor". Yakalanan grup ozgun metinden alinir.
const LISTE_EKLE = /^(?:listeye|listeme|yapılacaklara|yapilacaklara|yapılacaklar listesine|yapılacak listesine|yapilacaklar listesine)\s+(?:ekle|yaz|kaydet)(?:\s*[:,;]\s*|\s+)(\S.*)$/u;
// "listeye ekle butonu bozuk": eklenen sey bir arayuz/kod parcasiysa bu bir nottur, liste ogesi degil.
const LISTE_YASAK_ILK = /^(?:buton|düğme|dugme|tuş|tus|özellik|ozellik|fonksiyon|kısm|kism|sayfa|ekran|menü|menu|komut|işlev|islev|kod|akış|akis|mantığ|mantig|bileşen|bilesen|ikon|simge|çalışmıyor|bozuk|hata)/u;
const LISTE_OKU = /^(?:listede ne var|listemde ne var|listede neler var|yapılacaklarda ne var|listeyi oku|listemi oku|yapılacakları oku|yapılacaklar listesini oku|yapılacaklar ne|yapılacaklar neler|bugün ne yapacağım|bugün ne yapacaktım|bugün neler yapacağım|ne yapacaktım)$/u;

const HAVA = /^(?:(?:bugün|yarın|şu an|şimdi|dışarıda)\s+)?(?:hava nasıl|hava ne durumda|hava durumu(?: nasıl| ne)?|havalar nasıl|kaç derece|hava kaç derece|yağmur yağacak mı|yağmur var mı|kar yağacak mı|şemsiye almalı mıyım|dışarısı soğuk mu|dışarısı sıcak mı)$/u;
const SISTEM = /^(?:sistem ne durumda|sistem durumu|sistem nasıl|bilgisayar ne durumda|bilgisayar nasıl|işlemci ne kadar|işlemci ne durumda|işlemci kullanımı|cpu ne kadar|cpu ne durumda|bellek ne durumda|bellek ne kadar|ram ne kadar|ram ne durumda|ekran kartı ne durumda|ekran kartı ne kadar|gpu ne durumda|gpu ne kadar)$/u;

/**
 * Konusmayi yeni sayfa komutuna cevirir; cumlenin tamami bir komut degilse null.
 * @param {string} metin whisper ciktisi
 * @param {number} simdi epoch ms (liste tarihi icin)
 */
function coz(metin, simdi = Date.now()) {
  if (typeof metin !== 'string') return null;
  // Hitap ("Ada, ..."), sondaki noktalama ve nezaket sozu ("lütfen") eylemi degistirmez.
  const sade = duzelt(metin)
    .replace(/^ada\s*[,:;.!]?\s+/iu, '')
    .replace(/[.!?…]+$/u, '')
    .replace(/^lütfen\s+/iu, '')
    .replace(/[,\s]+lütfen$/iu, '')
    .trim();
  if (!sade || sade.length > 400) return null;
  const k = kucukHarf(sade);

  // Liste once: govdesi serbest metin; diger kaliplarla karismasin. Ozgun yazim (buyuk harf) korunur.
  const le = LISTE_EKLE.exec(k);
  if (le) {
    const ham = sade.slice(le.index + le[0].length - le[1].length).trim();
    if (!ham || LISTE_YASAK_ILK.test(le[1])) return null;
    const a = tarihAyikla(ham, simdi);
    if (!a.metin) return null;
    const govde = a.metin.charAt(0).toLocaleUpperCase('tr-TR') + a.metin.slice(1);
    return { tur: 'liste-ekle', metin: govde, tarih: a.tarih };
  }
  // Komut sozlerinin ic noktalamasi ("Odak, başlat") sadelesir; liste govdesi bu adimdan once ayrildi.
  const s = k.replace(/[,;:]/g, ' ').replace(/\s+/g, ' ').trim();

  for (const [kalip, istek] of MEDYA) if (kalip.test(s)) return { tur: 'medya', komut: MEDYA_KOMUT[istek], istek };

  if (ODAK_BASLAT.some((r) => r.test(s))) return { tur: 'odak', komut: { tur: 'baslat', asama: 'odak' } };
  const sureli = ODAK_SURELI.exec(s) || ODAK_SURELI2.exec(s);
  if (sureli) {
    const n = sayiCoz(sureli[1]);
    return n !== null && n >= 1 && n <= 180 ? { tur: 'odak', komut: { tur: 'baslat', asama: 'odak', dakika: n } } : null;
  }
  const mola = MOLA.exec(s);
  if (mola) {
    const asama = mola[2] === 'uzun' ? 'uzun' : 'kisa';
    if (!mola[1]) return { tur: 'odak', komut: { tur: 'baslat', asama } };
    const n = sayiCoz(mola[1]);
    return n !== null && n >= 1 && n <= 180 ? { tur: 'odak', komut: { tur: 'baslat', asama, dakika: n } } : null;
  }
  if (ODAK_DURAKLAT.test(s)) return { tur: 'odak', komut: { tur: 'duraklat' } };
  if (ODAK_SIFIRLA.test(s)) return { tur: 'odak', komut: { tur: 'sifirla' } };
  if (ODAK_ATLA.test(s)) return { tur: 'odak', komut: { tur: 'atla' } };
  if (ODAK_DURUM.test(s)) return { tur: 'odak-durum' };
  if (LISTE_OKU.test(s)) return { tur: 'liste-oku' };
  if (HAVA.test(s)) return { tur: 'hava' };
  if (SISTEM.test(s)) return { tur: 'sistem' };
  return null;
}

module.exports = { coz, sayiCoz };
