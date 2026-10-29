// v3.1, Ada'nin kulagi: konusmadan cikan metni Kokpit eylemine cevirir. SAF (test-ada dogrudan sinar).
// Karar kurallarla verilir, model yok: hedef oturum adi bastadir ve listede vardir (bulanik eslesme),
// ya da cumle bir kontrol sozudur (gonder, vazgec, durum). Gerisi hedefsiz nottur; tepsi siradaki oturumu
// onerir. Hicbir eylem kendiliginden Enter'a basmaz: "gonder" ya Scryne'in ayri sozu ya da cumlenin sonudur.
//
// Duzeltme sozlugu olcumden (2026-10-29, whisper large-v3-turbo, Turkce + Ingilizce terim): "commit" ->
// "komit", "push" -> "paş", "Kokpit'e" -> "Hoppite". Sozluk yalniz kod terimlerini duzeltir; adlar bulanik
// eslesmeyle bulunur.

// JS'deki kelime siniri yalniz ASCII harf tanir ("paş"in sonundaki ş sinir sayilmazdi): sinir Unicode harfle cizilir.
const S = String.raw`(?<![\p{L}\p{N}])`;
const B = String.raw`(?![\p{L}\p{N}])`;
const k = (govde) => new RegExp(S + govde + B, 'giu');
const DUZELTME = [
  // Ekten sonra da sinir: "komitesi" (kurulu) commit olmaz. "pas" (pas gec) push degil; whisper push'u paş/puş/pus yazar.
  [new RegExp(S + String.raw`ko+m+it(?=(?:le|ler|i|e|in|ten)?(?![\p{L}\p{N}]))`, 'giu'), 'commit'],
  [k('(?:p[au]ş|pus)la'), "push'la"],
  [k('(?:p[au]ş|pus)'), 'push'],
  [k(String.raw`pul\s*rik[uü]est`), 'pull request'],
  [k('bild'), 'build'],
  [k(String.raw`tayp\s*[cç]ek`), 'type check'],
];

/** Konusmadan gelen metnin kod terimlerini duzeltir, bosluklari toplar. */
function duzelt(metin) {
  // NFC: whisper ve kabuk "ş"yi s + birlesen cengel olarak verebiliyor; o zaman sinir kurali sasirir.
  let m = String(metin || '').normalize('NFC').replace(/\s+/g, ' ').trim();
  for (const [kalip, yerine] of DUZELTME) m = m.replace(kalip, yerine);
  return m;
}

/** Turkce kucuk harf + aksansiz: eslestirme anahtari. */
function anahtar(s) {
  return String(s || '')
    .normalize('NFC')
    .toLocaleLowerCase('tr-TR')
    .replace(/[ıi̇]/g, 'i')
    .replace(/ş/g, 's')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/â/g, 'a')
    .replace(/[^a-z0-9]+/g, '');
}

function mesafe(a, b) {
  if (a === b) return 0;
  const d = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let onceki = d[0];
    d[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const t = d[j];
      d[j] = Math.min(d[j] + 1, d[j - 1] + 1, onceki + (a[i - 1] === b[j - 1] ? 0 : 1));
      onceki = t;
    }
  }
  return d[b.length];
}

// Ada yonelme ekleri ve "oturumu" sozu: "Kokpit'e", "Matbaa'ya", "Yanki oturumuna", "Citefield'da".
const EKLER = ['oturumuna', 'oturumunda', 'oturumu', 'projesine', 'projesinde', 'ye', 'ya', 'yi', 'yı', 'e', 'a', 'de', 'da', 'te', 'ta', 'nin', 'nın', 'in', 'ın'];
// Hedef adindan sonra gelen baglaclar: "Kokpit'e YAZ: ...", "Matbaa'ya SÖYLE ...".
const BAGLAC = /^\s*(?:oturumuna|oturumunda|projesine|projesinde)?\s*[,:;.]?\s*(?:yaz|söyle|soyle|de|ilet|sor|gönder|gonder)?\s*[,:;.]?\s+/iu;
// Baglac GERCEKTEN var mi (BAGLAC'in her parcasi istege bagli, bos eslesmeyi de kabul eder): bulanik adda sart.
const BAGLAC_VAR = /^\s*(?:(?:oturumuna|oturumunda|projesine|projesinde)(?=[\s,:;.]|$)|[,:;]|(?:yaz|söyle|soyle|de|ilet|sor)(?=[\s,:;.]|$))/iu;

const KONTROL = [
  [/^(?:gönder|gonder|yolla|evet gönder|gönder bunu)$/iu, 'gonder'],
  [/^(?:yapıştır|yapistir|sadece yapıştır|yalnız yapıştır)$/iu, 'yapistir'],
  [/^(?:vazgeç|vazgec|iptal|boş ver|boşver|sil)$/iu, 'vazgec'],
  [/^(?:durum|durum ne|ne durumdayız|ne durumdayiz|neredeyiz|özet|özetle|ne var)$/iu, 'durum'],
  // v3.3: Aria'nin onerisine sesli karar (en son bekleyen oneri).
  [/^(?:onayla|onaylıyorum|onayliyorum|evet onayla|evet yap|uygula|tamam yap|yap bunu)$/iu, 'onayla'],
  [/^(?:reddet|yapma|onaylama|hayır yapma|hayir yapma)$/iu, 'reddet'],
  // v3.2: gunun brifingi (vadeler, dusen botlar, push bekleyen, limit). Ada'nin adiyla da: "Günaydın Ada".
  [/^(?:günaydın|gunaydin|brifing|brifing ver|bugün ne var|bugun ne var|bugün neler var|güne başlayalım)(?:\s+ada)?$/iu, 'brifing'],
];

// v3.2, sesli cevap: sira sayisi -> secenek (0'dan). "ikinci", "iki", "2", "ikinciyi", "ikinci seçenek".
// Yalniz sozcugun TAMAMI sira sayisiysa: "ikinci seçeneği uygula, sonra testleri koş" bir nottur.
const SIRA_SOZ = [
  [/^(?:birinci|ilk|bir|1)/iu, 0],
  [/^(?:ikinci|iki|2)/iu, 1],
  [/^(?:üçüncü|ucuncu|üç|uc|3)/iu, 2],
  [/^(?:dördüncü|dorduncu|dört|dort|4)/iu, 3],
];
const SIRA_EK = String.raw`(?:si|sı|sini|sını|yi|yı|i|ı|u|ü|nü|nu)?`;
const SECENEK = String.raw`(?:\s+(?:seçene(?:k|ği|gi)|secene(?:k|gi)|şık(?:kı)?|sik(?:ki)?|cevap|cevabı|cevabi))?`;
const SEC_FIIL = String.raw`(?:\s+(?:seç|sec|olsun|gönder|gonder|de|diyorum|tamam))?`;
// Whisper siralari rakamla da yazar (olculdu 2026-10-29: "ikinci seçenek" -> "2. Seçenek"): "2.", "2'nci", "2.si".
const RAKAM_EK = String.raw`(?:\.|'?(?:nci|ncı|nçı|inci|ıncı|uncu|üncü|ncü))?`;
const SIRA_TEK = new RegExp(String.raw`^(birinci|ilk|bir|ikinci|iki|üçüncü|ucuncu|üç|uc|dördüncü|dorduncu|dört|dort|[1-4]` + RAKAM_EK + ')' + SIRA_EK + SECENEK + '$', 'iu');
// "Önerileni seç", "tavsiye ettiğin": claude'un (Recommended) isaretledigi secenek. Whisper "önerileni"yi
// "Önerilerini" yazabiliyor (olculdu): o da kabul.
const ONERILEN = /^(?:önerilen|onerilen|önerileni|onerileni|önerilerini|önerilerin|önerini|tavsiye ettiğin|tavsiye ettigin|senin önerin|senin önerdiğin|önerdiğin|önerdiğini)(?:\s+(?:seçenek|seçeneği|secenegi))?(?:\s+(?:seç|sec|olsun|gönder|tamam))?$/iu;

// v3.3: Aria'ya giden konusma. Acik onek, hatirlatma, soru bicimi (soru sozcugu, soru eki ya da whisper'in "?" isareti).
const ARIA_ONEK = /^(?:aria(?:['’]?ya)?(?:\s+sor)?|sor|soru)\s*[,:;]?\s+/iu;
const HATIRLA = /^(?:hatırla|hatirla|aklında tut|aklinda tut|not al|unutma)(?=[\s,:;.]|$)/iu;
const SORU_SOZU = /(?:^|\s)(?:ne|neden|niye|niçin|nicin|nasıl|nasil|kaç|kac|kaçta|hangi|hangisi|nerede|nereye|nereden|kim|kimin|kime)(?=[\s,.?!]|$)/iu;
const SORU_EKI = /\s(?:mı|mi|mu|mü)(?:[sy]?ın|[sy]?in|[sy]?un|[sy]?ün|yım|yim|yum|yüm|ydı|ydi|ydu|ydü|dır|dir|dur|dür)?(?=[\s,.?!]|$)/iu;
// Bir oturuma yazma niyeti: hedefin hemen ardindan "yaz / söyle / ilet" (ilk dort sozcuk icinde).
const YAZMA_NIYETI = /^(?:\S+\s+){0,3}?(?:oturumuna\s+|projesine\s+)?(?:yaz|söyle|soyle|ilet)(?=[\s,:;.]|$)/iu;

/** Soru bicimli mi (Turkce kucuk harfle). SAF. */
function soruMu(kucuk) {
  return /\?\s*$/.test(kucuk) || SORU_SOZU.test(kucuk) || SORU_EKI.test(kucuk);
}

/** "ikinci seçenek", "birinci, üçüncü" -> [1] / [0, 2]; sira sayisi degilse null. */
function siraCoz(metin) {
  const govde = metin
    .replace(/[.!?…]+$/u, '')
    .replace(new RegExp(SEC_FIIL + '$', 'iu'), '')
    .trim();
  if (!govde) return null;
  const parcalar = govde.split(/\s*(?:,|;|\bve\b|\bsonra\b)\s*/iu).filter(Boolean);
  if (parcalar.length === 0 || parcalar.length > 4) return null;
  const secimler = [];
  for (const p of parcalar) {
    if (!SIRA_TEK.test(p.trim())) return null;
    const bas = p.trim();
    const s = SIRA_SOZ.find(([k]) => k.test(bas));
    if (!s) return null;
    secimler.push(s[1]);
  }
  return secimler;
}

// v3.2, sesli ozet: "Matbaa ne yaptı?", "ne oldu", "ne diyor", "son mesajı oku". Hedef bastadir ya da yoktur.
const OZET = /^(?:ne\s+(?:yaptı|yapti|yapıyor|yapiyor|oldu|diyor|dedi|soruyor|durumda)|neler\s+(?:yaptı|yapti|oldu)|durumu\s+ne|durum\s+ne|ne\s+alemde|bitti\s+mi|ne\s+yapmış|ne\s+yapmis|özetle|ozetle|özet\s+geç|özet)$/iu;
const OKU = /^(?:son\s+(?:mesajı|mesaji|sözünü|sozunu|cevabı|cevabi)\s+oku|mesajı\s+oku|mesaji\s+oku|oku|ne\s+yazdı|ne\s+yazdi|ne\s+yazmış|ne\s+yazmis)$/iu;
// v3.2: "Matbaa'yı aç", "Kokpit'e geç": Kokpit o sekmeyle one gelir.
const GIT = /^(?:aç|ac|göster|goster|geç|gec|git|getir|öne getir)$/iu;

/**
 * Bastaki birkac sozcukten hedef oturumu bulur. Eslesme ekler sokulerek, aksansiz ve bulanik yapilir;
 * adin uzunluguna gore en fazla 1-2 harf farki. Ayni ada sahip iki oturumdan ilki (siralama cagirandan).
 * @param {string} metin
 * @param {{ id: string, ad: string }[]} oturumlar
 * @returns {{ id: string, ad: string, kalan: string } | null}
 */
function hedefBul(metin, oturumlar) {
  const sozcukler = metin.split(/\s+/);
  // Kisa bas once: "Yanki oturumunda ..." tek sozcukte bulunur; cok sozcuklu ad yalniz tek sozcuk tutmazsa.
  for (let n = 1; n <= Math.min(3, sozcukler.length); n++) {
    // Ad "Kokpit'e" gibi kesme isaretiyle gelebilir; kesmeden sonrasi ektir.
    const basHam = sozcukler.slice(0, n).join(' ');
    const bas = basHam.replace(/[,:;.!?]+$/, '');
    const govde = bas.split(/['’]/)[0];
    const adaylar = new Set([anahtar(govde), anahtar(bas)]);
    for (const ek of EKLER) {
      const a = anahtar(bas);
      const e = anahtar(ek);
      if (a.length > e.length + 2 && a.endsWith(e)) adaylar.add(a.slice(0, -e.length));
    }
    let en = null;
    for (const o of oturumlar) {
      const k = anahtar(o.ad);
      if (!k) continue;
      const sinir = k.length >= 6 ? 2 : k.length >= 4 ? 1 : 0;
      for (const a of adaylar) {
        const d = mesafe(a, k);
        if (d <= sinir && (!en || d < en.d)) en = { o, d };
      }
    }
    if (en) {
      const kalan = sozcukler.slice(n).join(' ');
      // Bulanik (d > 0) eslesmede ardindan bir baglac ya da iki nokta gelmeli: "Hoppite yaz ..." evet,
      // "Hopi dedi ki ..." hayir. Tam eslesmede ad tek basina yeter.
      const baglacli = BAGLAC_VAR.test(kalan) || /[:,;]$/.test(basHam) || /['’]/.test(bas);
      if (en.d > 0 && !baglacli) continue;
      return { id: en.o.id, ad: en.o.ad, kalan: (' ' + kalan + ' ').replace(BAGLAC, '').trim() };
    }
  }
  return null;
}

/**
 * Konusmayi eyleme cevirir.
 * @param {string} ham whisper metni
 * @param {{ id: string, ad: string }[]} oturumlar Ada'daki oturumlar (siralama: oncelikli once)
 * @returns {{ tur: 'gonder' | 'yapistir' | 'vazgec' | 'durum' | 'brifing' | 'bos' }
 *   | { tur: 'not', metin: string, hedef: { id: string, ad: string } | null, gonder: boolean }
 *   | { tur: 'ozet', hedef: { id: string, ad: string } | null, tam: boolean }
 *   | { tur: 'git', hedef: { id: string, ad: string } }
 *   | { tur: 'cevap', hedef: { id: string, ad: string } | null, secimler: number[] | null, onerilen: boolean }}
 */
function komutCoz(ham, oturumlar) {
  const metin = duzelt(ham);
  // Basta Ada'ya hitap ("Ada, ...") eylemi degistirmez: uyandirma sozu de buradan gecer.
  const sade = metin.replace(/[.!?…]+$/u, '').replace(/^ada\s*[,:;.!]?\s+/iu, '').trim();
  if (!sade) return { tur: 'bos' };
  // "İptal" (buyuk İ) /i ile "iptal"e eslesmiyordu (v3.1'de kacmisti): kontrol sozu Turkce kucuk harfle.
  const kucuk = sade.toLocaleLowerCase('tr-TR');
  for (const [kalip, tur] of KONTROL) if (kalip.test(kucuk)) return { tur };
  const h = hedefBul(sade, oturumlar || []);
  const hedef = h ? { id: h.id, ad: h.ad } : null;
  // v3.2: ozet / okuma / sekmeye git / soruya cevap. Yalniz cumlenin TAMAMI o kalipsa: aksi halde nottur.
  // Hedefin ardindan gelen "-da/-de/-nin" ekleri hedefBul'da ayrildi; kalan yalniz eylem sozudur.
  // Turkce kucuk harf: /i bayragi "İkinci"deki İ'yi i saymaz (U+0130 basit katlamada esi yok).
  const kalan = (h ? h.kalan : sade).replace(/[.!?…]+$/u, '').trim().toLocaleLowerCase('tr-TR');
  if (OZET.test(kalan)) return { tur: 'ozet', hedef, tam: false };
  if (OKU.test(kalan)) return { tur: 'ozet', hedef, tam: true };
  if (h && GIT.test(kalan)) return { tur: 'git', hedef };
  if (ONERILEN.test(kalan)) return { tur: 'cevap', hedef, secimler: null, onerilen: true };
  const secimler = siraCoz(kalan);
  if (secimler) return { tur: 'cevap', hedef, secimler, onerilen: false };
  // v3.3: Ada Aria'nin yuzu. Acik hitap ("Aria, ...", "sor: ...") ve hatirlatma Aria'ya; soru bicimli cumle de, eger bir
  // oturuma yazma niyeti ("Matbaa'ya yaz/söyle ...") yoksa. "Matbaa ne yaptı?" gibi ozetler yukarida yakalandi.
  const onek = ARIA_ONEK.exec(sade);
  if (onek) return { tur: 'aria', metin: sade.slice(onek[0].length).trim() || sade };
  if (HATIRLA.test(kucuk)) return { tur: 'aria', metin: sade };
  if (soruMu(kucuk) && !(h && YAZMA_NIYETI.test(sade))) return { tur: 'aria', metin: sade };
  let govde = h ? h.kalan : sade;
  // Sondaki "gönder" cumleyi hemen yollar: "Matbaa'ya yaz testleri koş, gönder".
  let gonder = false;
  const son = govde.match(/^(.*?)[,;.]?\s+(?:ve\s+)?(?:gönder|gonder|yolla)$/iu);
  if (son && son[1].trim()) {
    govde = son[1].trim();
    gonder = true;
  }
  govde = govde.replace(/^[,:;.\s]+/, '').trim();
  if (!govde) return h ? { tur: 'not', metin: '', hedef: { id: h.id, ad: h.ad }, gonder: false } : { tur: 'bos' };
  // Bas harf buyuk: whisper cumle ortasindan baslatabilir.
  govde = govde.charAt(0).toLocaleUpperCase('tr-TR') + govde.slice(1);
  return { tur: 'not', metin: govde, hedef: h ? { id: h.id, ad: h.ad } : null, gonder };
}

/**
 * v3.2, eller serbest: parca "Ada" ile basliyor mu? Basliyorsa geri kalani (komut; bos olabilir). Kelime siniri
 * zorunlu: "Adana", "adam", "Ada'ya yaz" (Ada'dan soz eden cumle) uyandirmaz. "Hey Ada" de olur.
 * @returns {{ uyandi: boolean, kalan: string }}
 */
function uyanmaAyikla(ham) {
  const m = String(ham || '').normalize('NFC').replace(/^[\s"'“”.,!?…-]+/u, '');
  const k = /^(?:hey[\s,]+)?ada(?=$|[\s,.!?:;…])[\s,.!?:;…-]*/iu.exec(m.toLocaleLowerCase('tr-TR'));
  if (!k) return { uyandi: false, kalan: '' };
  return { uyandi: true, kalan: m.slice(k[0].length).replace(/["”']+$/u, '').trim() };
}

/** whisper'a verilen ipucu: proje adlari + sik terimler (yazimi dogru gelsin). */
function ipucu(adlar) {
  const terimler = ['commit', 'push', 'pull request', 'build', 'lint', 'test', 'Claude', 'GitHub', 'RunPod', 'Vercel', 'npm'];
  return [...new Set([...(adlar || []).filter(Boolean), ...terimler])].join(', ');
}

module.exports = { duzelt, anahtar, mesafe, hedefBul, komutCoz, ipucu, siraCoz, uyanmaAyikla, soruMu };
