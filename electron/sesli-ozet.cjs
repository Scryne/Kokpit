// v3.2, Ada'nin sesli cevabi: "Matbaa ne yaptı?" -> konusulacak cumle; "ikinci seçenek" -> soru cevabi.
// SAF (test-ada dogrudan sinar). Girdi kanca koprusunun anlik hali (etkinlik.cjs oturum nesnesi) ve Ada'nin
// oturum listesi; cikti ya konusulacak metin ya da ana pencerenin zaten bildigi `cevap` istegi
// (App.oturumaGonder her tustan once sorunun hala ayni oldugunu damgayla yeniden denetler).
//
// Cumleler kulak icin yazilir: sembol yok (`·`, `+`, `−` okunmaz), sayilar yaziyla degil rakamla (edge-tts
// Turkce rakami dogru okuyor, olculdu 2026-10-29), markdown isaretleri atilir.

const SIRA_ADI = ['bir', 'iki', 'üç', 'dört'];

/** claude'un son sozunu kulaga hazirlar: kod blogu, baslik, liste isareti, link, yol sadelesir. */
function sozSadelestir(metin, sinir = 260) {
  let m = String(metin || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s*[-*•]\s+/gm, '')
    .replace(/^\s*\d+[.)]\s+/gm, '')
    .replace(/\*\*|__|\*|~~/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\|/g, ' ')
    .replace(/[A-Za-z]:\\[^\s,;)]+/g, (y) => y.split('\\').pop())
    .replace(/(?:^|\s)\/?(?:[\w.-]+\/)+([\w.-]+)/g, ' $1')
    .replace(/\s+/g, ' ')
    .trim();
  if (m.length <= sinir) return m;
  // Cumle sinirinda kes: yarim cumle okunmasin.
  const kesik = m.slice(0, sinir);
  const son = Math.max(kesik.lastIndexOf('. '), kesik.lastIndexOf('! '), kesik.lastIndexOf('? '), kesik.lastIndexOf(': '));
  m = son > sinir * 0.4 ? kesik.slice(0, son + 1) : kesik.replace(/\s+\S*$/, '') + '…';
  return m;
}

function dakika(ms) {
  const d = Math.round(ms / 60000);
  if (d < 1) return 'bir dakikadan az';
  if (d < 60) return d + ' dakika';
  const s = Math.floor(d / 60);
  const k = d % 60;
  return s + ' saat' + (k ? ' ' + k + ' dakika' : '');
}

/** Ada'nin "X ne yaptı?" cevabi. `e` kanca koprusunun oturum nesnesi (yoksa null). */
function ozetCumlesi({ ad, e, git, simdi, tam }) {
  if (!e) return ad + ' henüz bir şey yapmadı.';
  if (e.durum === 'bekliyor') {
    const s = e.soruAyrinti;
    if (s && s.sorular && s.sorular.length > 0) {
      const ilk = s.sorular[0];
      const sec = (ilk.secenekler || []).slice(0, 4).map((x, i) => SIRA_ADI[i] + ', ' + sozSadelestir(x.etiket, 60)).join('; ');
      const bas = s.sorular.length > 1 ? ad + ' ' + s.sorular.length + ' soru soruyor. İlki: ' : ad + ' soruyor: ';
      const sonu = s.cevaplanabilir ? ' Seçeneği söyle, örneğin "ikinci".' : ' Bunu terminalden cevaplaman gerek.';
      return bas + sozSadelestir(ilk.soru, 160) + (sec ? '. Seçenekler: ' + sec + '.' : '.') + sonu;
    }
    return ad + ' seni bekliyor' + (e.soru ? ': ' + sozSadelestir(e.soru, 160) : '') + '.';
  }
  if (e.durum === 'calisiyor') {
    // Sure eksiz yazilir ("5 dakikadır"/"1 saattir" ek uyumu hata kaynagi): "bu tur 5 dakika".
    const sure = e.turBasladi ? ' Bu tur ' + dakika(simdi - e.turBasladi) + '.' : '';
    const arac = e.arac ? (e.arac.alt ? 'bir alt ajan ' : '') + aracCumlesi(e.arac) : 'düşünüyor';
    const hedef = e.sonIstek || e.hedef;
    return ad + ' çalışıyor, şu an ' + arac + '.' + sure + (hedef ? ' İstek: ' + sozSadelestir(hedef, 120) + '.' : '');
  }
  if (e.durum === 'bitti') {
    const parca = [];
    const t = e.tur || e.ozet;
    if (t && t.dosyalar && t.dosyalar.length > 0) parca.push(t.dosyalar.length + ' dosyaya dokundu, ' + t.arti + ' satır ekledi, ' + t.eksi + ' satır sildi');
    const g = git && git.olculdu >= (e.durumZamani || e.degisti) ? git : null;
    if (g) {
      if (g.commit > 0) parca.push(g.commit + ' commit attı');
      if (g.ileride > 0) parca.push(g.ileride + ' commit push bekliyor');
      if (g.kirli > 0) parca.push(g.kirli + ' dosya commit edilmedi');
    }
    const soz = e.sonSoz ? sozSadelestir(e.sonSoz, tam ? 600 : 260) : '';
    if (tam && soz) return ad + ' şöyle dedi: ' + soz;
    const hata = e.takilma && e.takilma.tur === 'api';
    return (
      ad + (hata ? ' hatayla durdu' : ' bitti') + (parca.length ? '; ' + parca.join(', ') : '') + '.' + (soz ? ' Son sözü: ' + soz : '')
    );
  }
  return ad + ' boşta.';
}

function aracCumlesi(arac) {
  const h = arac.hedef ? ' ' + sozSadelestir(arac.hedef, 50) : '';
  switch (arac.ad) {
    case 'Read':
      return h ? h.trim() + ' dosyasını okuyor' : 'dosya okuyor';
    case 'Edit':
    case 'MultiEdit':
    case 'Write':
      return h ? h.trim() + ' dosyasını düzenliyor' : 'dosya düzenliyor';
    case 'Bash':
    case 'PowerShell':
      return 'komut çalıştırıyor' + (h ? ':' + h : '');
    case 'Grep':
    case 'Glob':
      return 'kodda arıyor';
    case 'WebSearch':
    case 'WebFetch':
      return 'webde araştırıyor';
    case 'Agent':
    case 'Task':
      return 'alt ajana iş veriyor';
    default:
      return arac.ad + ' kullanıyor';
  }
}

/** Siralama: seni bekleyen > calisan > biten > bosta (Ada kartindaki sira). */
const ONCELIK = { bekliyor: 0, calisiyor: 1, bitti: 2, bosta: 3, kapandi: 4 };

/**
 * Sesli ozet/cevap icin hedef oturum. Ad soylendiyse o; degilse amaca gore: cevapta soru soran ilk
 * oturum, ozette sira sende olan ya da calisan ilk oturum.
 * @param {{ id: string, ad: string }[]} liste Ada'daki oturumlar
 * @param {Record<string, any>} oturumlar kanca anlik halinin oturumlari
 */
function hedefSec(hedef, liste, oturumlar, amac) {
  if (hedef) {
    const o = liste.find((x) => x.id === hedef.id);
    return o ? { ...o, e: oturumlar[o.id] || null } : null;
  }
  const sirali = liste
    .map((o) => ({ ...o, e: oturumlar[o.id] || null }))
    .sort((a, b) => (ONCELIK[a.e?.durum ?? 'bosta'] ?? 5) - (ONCELIK[b.e?.durum ?? 'bosta'] ?? 5));
  if (amac === 'cevap') return sirali.find((x) => x.e?.durum === 'bekliyor' && x.e.soruAyrinti) || null;
  return sirali.find((x) => x.e && x.e.durum !== 'bosta') || sirali[0] || null;
}

/** Secenek etiketi claude'un onerdigi mi: "(Recommended)" / "(Önerilen)". */
const ONERILEN = /\((?:recommended|önerilen|onerilen|tavsiye)\)/i;

/**
 * Sesli cevabi (siralar ya da "önerileni") soruya cevirir. Hata metni konusulur.
 * @returns {{ istek: { id: string, tur: 'cevap', cevaplar: number[], damga: number }, cumle: string } | { hata: string }}
 */
function cevapCoz(eylem, liste, oturumlar) {
  const h = hedefSec(eylem.hedef, liste, oturumlar, 'cevap');
  if (!h) return { hata: eylem.hedef ? eylem.hedef.ad + ' oturumu açık değil.' : 'Cevap bekleyen soru yok.' };
  const e = h.e;
  if (!e || e.durum !== 'bekliyor' || !e.soruAyrinti) return { hata: h.ad + ' şu an soru sormuyor.' };
  const s = e.soruAyrinti;
  if (!s.cevaplanabilir) return { hata: h.ad + ' sorusu çoklu seçimli; terminalden cevapla.' };
  const n = s.sorular.length;
  let secimler;
  if (eylem.onerilen) {
    secimler = s.sorular.map((q) => {
      const i = (q.secenekler || []).findIndex((x) => ONERILEN.test(x.etiket || ''));
      return i >= 0 ? i : -1;
    });
    if (secimler.some((i) => i < 0)) return { hata: 'Önerilen bir seçenek işaretli değil; sırasını söyle.' };
  } else {
    secimler = eylem.secimler || [];
    // Tek sira + cok soru: soru sayisi kadar ayri cevap gerek.
    if (secimler.length !== n) {
      return { hata: n > 1 ? n + ' soru var; ' + n + ' cevabı sırayla söyle, örneğin "birinci, ikinci".' : 'Tek soru var; bir seçenek söyle.' };
    }
  }
  for (let i = 0; i < n; i++) {
    const adet = (s.sorular[i].secenekler || []).length;
    if (secimler[i] >= adet) return { hata: (n > 1 ? i + 1 + '. soruda ' : '') + adet + ' seçenek var.' };
  }
  const etiketler = secimler.map((c, i) => sozSadelestir(s.sorular[i].secenekler[c].etiket, 50));
  return {
    istek: { id: h.id, tur: 'cevap', cevaplar: secimler, damga: e.soruZamani ?? e.degisti },
    ad: h.ad,
    cumle: h.ad + ': ' + etiketler.join(', '),
  };
}

module.exports = { sozSadelestir, ozetCumlesi, hedefSec, cevapCoz, aracCumlesi };
