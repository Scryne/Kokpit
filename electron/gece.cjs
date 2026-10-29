// v3.2, gece vardiyasi (Faz 55): Scryne uyurken siradaki isler. Her gorev kendi paralel calisma agacinda
// (paralel.cjs) claude'a verilir; sirayla, biri bitince digeri. Sabah brifingi ozeti soyler, sonuclar Teslim
// sayfasinin "Paralel dallar"inda birlestirilmeyi ya da atilmayi bekler. Ana dal gece boyu dokunulmaz.
//
// Neden: Scryne gece oturumlarini "aralıksız çalış, tüm yetki sende" diye aciyor (10-29 gecesi, 10-24
// GridGrade); bunlar tek uzun oturumdu ve sabah ne yapildigi sohbetten okunuyordu. 09-06'daki "gozetimsiz
// ajan yok" cizgisini Scryne 10-29'da acti ("hepsini yapabilirsin"); cizgi su sinirlarla gevser: push yok,
// dis mesaj/yayin yok, silme yok, ana dal yok, limit doluysa beklenir. Kararlar sabah Scryne'da.
//
// Bu modul yalniz KAYIT (~/.kokpit/gece.json) ve sabah ozeti: tek yazar main. Kosucu ana pencerede
// (App, useGeceVardiyasi): oturumlari orada acar, kanca durumunu orada gorur. Saf yardimcilar test-ada'da.

const fs = require('fs');
const path = require('path');
const { KOKPIT_DIZIN } = require('./config.cjs');
const { log } = require('./log.cjs');

const DOSYA = path.join(KOKPIT_DIZIN, 'gece.json');
const AZAMI_GOREV = 12;
const DURUMLAR = new Set(['bekliyor', 'calisiyor', 'bitti', 'takildi', 'sure', 'hata', 'iptal']);

/** Gece gorevinin claude'a giden ilk mesaji: sinirlar + gorev. SAF. */
function gorevIstemi(metin, dal) {
  return [
    'GECE VARDİYASI görevi. Scryne uyuyor: soru sorma; belirsizlikte makul bir varsayım yap ve özette belirt.',
    'Bu ayrı bir git çalışma ağacı (dal ' + dal + '). İşi burada yap, anlamlı ve küçük commit\'ler at; testleri koş.',
    'YASAK: push, dışarı mesaj/yayın/PR, dosya ya da dal silme, git geçmişini yeniden yazma, para harcayan işlem, gizli bilgiye dokunma. Gerekirse yapma, özette yaz.',
    'Bitince 3-6 satırlık özet yaz: ne yaptın, neyi doğruladın, ne kaldı, sabah Scryne\'ın karar vermesi gereken ne var.',
    '',
    'Görev: ' + String(metin).trim(),
  ].join('\n');
}

function bos() {
  return { surum: 1, baslangic: null, baslaZamani: null, aktif: false, gorevler: [], son: null, alarmlar: [] };
}

function oku() {
  try {
    const j = JSON.parse(fs.readFileSync(DOSYA, 'utf8'));
    if (!j || !Array.isArray(j.gorevler)) return bos();
    return { ...bos(), ...j };
  } catch {
    return bos();
  }
}

/** Renderer'dan gelen durumu dar semayla suzer; rastgele alan diske inmez. SAF. */
function suz(ham) {
  const v = bos();
  if (!ham || typeof ham !== 'object') return v;
  v.aktif = ham.aktif === true;
  v.baslangic = typeof ham.baslangic === 'string' && /^\d{2}:\d{2}$/.test(ham.baslangic) ? ham.baslangic : null;
  v.son = Number.isFinite(ham.son) ? ham.son : null;
  // Baslangic ani (ms): "Başlat" basildiginda `baslangic` saatinin ilk gelecek hali; null = hemen.
  v.baslaZamani = Number.isFinite(ham.baslaZamani) ? ham.baslaZamani : null;
  v.gorevler = (Array.isArray(ham.gorevler) ? ham.gorevler : [])
    .filter((g) => g && typeof g.id === 'string' && typeof g.proje === 'string' && typeof g.metin === 'string')
    .slice(0, AZAMI_GOREV)
    .map((g) => ({
      id: g.id.slice(0, 40),
      proje: g.proje.slice(0, 80),
      projeYol: typeof g.projeYol === 'string' ? g.projeYol : '',
      metin: g.metin.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').slice(0, 4000),
      durum: DURUMLAR.has(g.durum) ? g.durum : 'bekliyor',
      ...(typeof g.agacYol === 'string' ? { agacYol: g.agacYol } : {}),
      ...(typeof g.agacAd === 'string' ? { agacAd: g.agacAd.slice(0, 40) } : {}),
      ...(typeof g.oturumId === 'string' ? { oturumId: g.oturumId.slice(0, 160) } : {}),
      ...(Number.isFinite(g.basladi) ? { basladi: g.basladi } : {}),
      ...(Number.isFinite(g.bitti) ? { bitti: g.bitti } : {}),
      ...(typeof g.neden === 'string' ? { neden: g.neden.slice(0, 300) } : {}),
      ...(typeof g.ozet === 'string' ? { ozet: g.ozet.slice(0, 2000) } : {}),
      ...(Number.isFinite(g.cevaplanan) ? { cevaplanan: g.cevaplanan } : {}),
      ...(Number.isFinite(g.cevapDamga) ? { cevapDamga: g.cevapDamga } : {}),
    }));
  // Nobet (durum.py --nobet, `dosya` isi): takilan / hata veren gorevler alarm sayilir.
  v.alarmlar = v.gorevler.filter((g) => g.durum === 'takildi' || g.durum === 'hata').map((g) => g.proje + ': ' + (g.neden || g.durum));
  return v;
}

function yaz(ham) {
  const v = suz(ham);
  try {
    fs.mkdirSync(path.dirname(DOSYA), { recursive: true });
    const gecici = DOSYA + '.' + process.pid + '.tmp';
    fs.writeFileSync(gecici, JSON.stringify(v, null, 2) + '\n', 'utf8');
    fs.renameSync(gecici, DOSYA);
  } catch (e) {
    log('gece: yazilamadi: ' + e.message);
  }
  return v;
}

/**
 * Brifingin ilk maddesi: son vardiyanin sonucu (son 18 saatte biten gorevler). SAF cekirdek `ozetKur`.
 * @returns {{ ozet: string, sayi: number } | null}
 */
function ozetKur(v, simdi = Date.now()) {
  const pencere = 18 * 3600_000;
  const ilgili = v.gorevler.filter((g) => g.basladi && simdi - (g.bitti ?? g.basladi) < pencere);
  if (ilgili.length === 0) return null;
  const say = (d) => ilgili.filter((g) => g.durum === d).length;
  const bitti = say('bitti');
  const parca = [];
  if (bitti) parca.push(bitti + ' bitti');
  if (say('takildi')) parca.push(say('takildi') + ' takıldı');
  if (say('sure')) parca.push(say('sure') + ' süre doldu');
  if (say('hata')) parca.push(say('hata') + ' açılamadı');
  if (say('calisiyor')) parca.push(say('calisiyor') + ' hâlâ çalışıyor');
  const bekleyen = v.gorevler.filter((g) => g.durum === 'bekliyor').length;
  if (bekleyen) parca.push(bekleyen + ' sırada');
  return {
    ozet: 'Gece vardiyası: ' + ilgili.length + ' görevden ' + parca.join(', ') + '. Sonuçlar Teslim sayfasında, paralel dallarda.',
    sayi: ilgili.length,
  };
}

/** Kosucunun esikleri (dakika / yuzde). */
const SINIR = {
  sessizDk: 25, // calisiyor ama bu kadar olay yok: takildi sayilir, tur kesilir (Esc)
  gorevDk: 150, // bir gorev en fazla bu kadar
  cevap: 6, // bir gorevde Ada'nin kendiliginden cevapladigi soru siniri
  besSaat: 92, // 5 saatlik limit bunun ustundeyse yeni gorev baslamaz (sifirlanma beklenir)
  hafta: 97, // haftalik limit bunun ustundeyse vardiya durur
};
const ONERILEN = /\((?:recommended|önerilen|onerilen|tavsiye)\)/i;
const SERBEST_CEVAP = 'Sen karar ver: en mantıklı seçeneği uygula, gerekçeni özette yaz.';

function etkinYuzde(l, simdi) {
  if (!l) return null;
  return l.sifirlanma && l.sifirlanma <= simdi ? 0 : l.yuzde;
}

/**
 * Kosucunun bir adimi. SAF: vardiya + acik oturumlar + kanca hali -> yapilacaklar. Kosucu (App) bunlari sirayla
 * uygular ve kaydi yazar. Ayni anda tek gorev calisir (limit ve dikkat icin; paralellik gunduz isi).
 * @param {{ v: object, oturumlar: { id: string, durumu: string }[], etkinlik: Record<string, any>, simdi: number,
 *   limitler: any }} g
 * @returns {{ tur: 'isaretle', id: string, durum: string, neden?: string, ozet?: string }
 *   | { tur: 'cevapla', id: string, istek: object } | { tur: 'kes', id: string, oturumId: string }
 *   | { tur: 'baslat', id: string } | { tur: 'bekle', neden: string } | { tur: 'bitir', neden: string }}[]
 */
function karar({ v, oturumlar, etkinlik, simdi, limitler }) {
  const eylem = [];
  if (!v.aktif) return eylem;
  let suruyor = false;
  for (const g of v.gorevler.filter((x) => x.durum === 'calisiyor')) {
    const o = oturumlar.find((x) => x.id === g.oturumId);
    const e = g.oturumId ? etkinlik[g.oturumId] : null;
    const bittiMi = e && e.durum === 'bitti' && (e.durumZamani ?? e.degisti) > (g.basladi ?? 0) + 3000;
    if (bittiMi) {
      const api = e.takilma && e.takilma.tur === 'api';
      eylem.push({ tur: 'isaretle', id: g.id, durum: api ? 'takildi' : 'bitti', ...(api ? { neden: 'API hatası: ' + (e.takilma.ayrinti || e.takilma.metin || '') } : {}), ozet: e.sonSoz ?? '' });
      continue;
    }
    if (!o || o.durumu === 'bitti' || o.durumu === 'hata') {
      // Oturum acilis asamasinda ('baglaniyor') degil, gercekten kapandi.
      eylem.push({ tur: 'isaretle', id: g.id, durum: 'hata', neden: 'oturum kapandı' });
      continue;
    }
    if (simdi - (g.basladi ?? simdi) > SINIR.gorevDk * 60_000) {
      eylem.push({ tur: 'kes', id: g.id, oturumId: g.oturumId }, { tur: 'isaretle', id: g.id, durum: 'sure', neden: SINIR.gorevDk + ' dakikayı aştı' });
      continue;
    }
    if (e && e.durum === 'bekliyor') {
      const s = e.soruAyrinti;
      // Ayni soruya ikinci kez cevap gitmez: cevap tuslari bir an sonra islenir, sonraki adim onu gorur.
      if (g.cevapDamga !== undefined && g.cevapDamga === (e.soruZamani ?? e.degisti)) {
        suruyor = true;
        continue;
      }
      if (s && s.cevaplanabilir && (g.cevaplanan ?? 0) < SINIR.cevap) {
        const cevaplar = s.sorular.map((q) => {
          const i = (q.secenekler || []).findIndex((x) => ONERILEN.test(x.etiket || ''));
          return i >= 0 ? i : SERBEST_CEVAP;
        });
        eylem.push({ tur: 'cevapla', id: g.id, istek: { id: g.oturumId, tur: 'cevap', cevaplar, damga: e.soruZamani ?? e.degisti } });
        suruyor = true;
        continue;
      }
      eylem.push({ tur: 'isaretle', id: g.id, durum: 'takildi', neden: !s ? 'izin ya da seçeneksiz soru bekliyor' : !s.cevaplanabilir ? 'çoklu seçimli soru' : 'çok fazla soru sordu' });
      continue;
    }
    if (e && e.durum === 'calisiyor' && simdi - e.degisti > SINIR.sessizDk * 60_000) {
      eylem.push({ tur: 'kes', id: g.id, oturumId: g.oturumId }, { tur: 'isaretle', id: g.id, durum: 'takildi', neden: SINIR.sessizDk + ' dakika hiç olay yok' });
      continue;
    }
    suruyor = true;
  }
  if (suruyor) return eylem;
  if (v.baslaZamani && simdi < v.baslaZamani) {
    eylem.push({ tur: 'bekle', neden: 'başlangıç saati' });
    return eylem;
  }
  const bitenler = new Set(eylem.filter((x) => x.tur === 'isaretle').map((x) => x.id));
  const sira = v.gorevler.find((x) => x.durum === 'bekliyor' && !bitenler.has(x.id));
  if (!sira) {
    eylem.push({ tur: 'bitir', neden: 'sıra boş' });
    return eylem;
  }
  const haf = etkinYuzde(limitler?.hafta, simdi);
  if (haf !== null && haf >= SINIR.hafta) {
    eylem.push({ tur: 'bitir', neden: 'haftalık limit %' + Math.round(haf) });
    return eylem;
  }
  const bes = etkinYuzde(limitler?.besSaat, simdi);
  if (bes !== null && bes >= SINIR.besSaat) {
    eylem.push({ tur: 'bekle', neden: '5 saatlik limit %' + Math.round(bes) + ', sıfırlanma bekleniyor' });
    return eylem;
  }
  eylem.push({ tur: 'baslat', id: sira.id });
  return eylem;
}

module.exports = {
  DOSYA,
  gorevIstemi,
  suz,
  oku,
  yaz,
  ozetKur,
  karar,
  SINIR,
  /** Brifing icin (main). */
  sabahOzeti: () => ozetKur(oku()),
};
