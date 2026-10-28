// v3.0, bot nobeti (Faz 40, 42): kendiliginden calisan islerin hali. Veri `durum.py --nobet`'ten (kural:
// ikinci toplayici yazilmaz); her proje islerini kendi `.claude/nobet.json`'unda bildirir, toplayici
// vault'ta (`.claude/scripts/nobet.py`). Burada yalniz 5 dakikada bir okunur ve GECISLER bulunur:
//   - dustu: bir is saglikli/gecikti/bilinmiyor iken dustu (ilk okuma sayilmaz: her acilista eski
//     dususu yeniden haber vermek gurultu olurdu; sayfa ve Ada'nin karti zaten gosterir).
//   - sevinc: `sayac.sevinc` olan bir isin (Matbaa yeni siparis) son kosusu degisti ve sayac > 0.
// Son gorulen haller `~/.kokpit/nobet-son.json`'da: Kokpit yeniden acilinca ayni sevinc tekrarlanmaz.

const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const { DURUM_SCRIPT, PYTHON, VAULT, KOKPIT_DIZIN } = require('./config.cjs');
const { log } = require('./log.cjs');

const ARALIK_MS = 5 * 60 * 1000;
const ILK_GECIKME_MS = 15_000; // acilisi yavaslatmasin (gorev sorgusu ~2.5 sn, API ~1 sn)
const ZAMAN_ASIMI_MS = 90_000;
const SON_DOSYA = path.join(KOKPIT_DIZIN, 'nobet-son.json');

let son = null; // { olculdu, isler } ya da { hata }
let zamanlayici = null;
let ucusta = null;
let dinleyiciler = { yayin: (_n) => {}, olay: (_o) => {} };

function anahtar(is) {
  return is.proje + '|' + is.ad;
}

/**
 * SAF: onceki gorulenler + yeni liste -> { olaylar, gorulen }. test-ada dogrudan sinar.
 * @param {Record<string, { hal: string, son: string | null }> | null} onceki null: ilk okuma (olay yok)
 * @param {{ proje: string, ad: string, hal: string, son: string | null, ayrinti?: string,
 *   sayac?: { ad: string, deger: number, sevinc: boolean } }[]} isler
 */
function olaylariBul(onceki, isler) {
  const olaylar = [];
  const gorulen = {};
  for (const is of isler) {
    const k = anahtar(is);
    gorulen[k] = { hal: is.hal, son: is.son ?? null };
    const o = onceki ? onceki[k] : undefined;
    if (!onceki || !o) continue;
    if (is.hal === 'dustu' && o.hal !== 'dustu') olaylar.push({ tur: 'dustu', proje: is.proje, ad: is.ad, ayrinti: is.ayrinti || '' });
    if (is.sayac && is.sayac.sevinc && is.sayac.deger > 0 && is.son && is.son !== o.son) {
      olaylar.push({ tur: 'sevinc', proje: is.proje, ad: is.sayac.ad || is.ad, deger: is.sayac.deger });
    }
  }
  return { olaylar, gorulen };
}

function gorulenOku() {
  try {
    return JSON.parse(fs.readFileSync(SON_DOSYA, 'utf8'));
  } catch {
    return null;
  }
}

function gorulenYaz(g) {
  try {
    fs.mkdirSync(KOKPIT_DIZIN, { recursive: true });
    fs.writeFileSync(SON_DOSYA, JSON.stringify(g));
  } catch (e) {
    log('nobet: son hal yazilamadi: ' + e.message);
  }
}

function calistir(taze) {
  return new Promise((coz) => {
    const t0 = Date.now();
    execFile(
      PYTHON,
      [DURUM_SCRIPT, '--nobet', ...(taze ? ['--taze'] : [])],
      { cwd: VAULT, encoding: 'utf8', windowsHide: true, timeout: ZAMAN_ASIMI_MS, maxBuffer: 8 * 1024 * 1024, env: { ...process.env, PYTHONIOENCODING: 'utf-8' } },
      (hata, stdout, stderr) => {
        if (hata) {
          log('nobet: durum.py --nobet basarisiz (' + (Date.now() - t0) + ' ms): ' + hata.message + (stderr ? ' | ' + String(stderr).slice(0, 400) : ''));
          return coz({ hata: hata.killed ? 'zaman aşımı' : 'durum.py --nobet okunamadı' });
        }
        try {
          const veri = JSON.parse(stdout);
          if (!Array.isArray(veri.isler)) throw new Error('isler yok');
          log('nobet okundu (' + (Date.now() - t0) + ' ms, ' + veri.isler.length + ' is, ' + veri.isler.filter((x) => x.hal === 'dustu').length + ' dustu)');
          coz(veri);
        } catch (e) {
          log('nobet: JSON cozulemedi: ' + e.message);
          coz({ hata: 'çıktı çözülemedi' });
        }
      }
    );
  });
}

async function oku(taze = false) {
  if (ucusta) return ucusta;
  ucusta = (async () => {
    const n = await calistir(taze);
    if (n.hata) {
      // Son olcum kalir (durum.py dayanikliligi ile ayni ilke, v2.9): bos sayfa yerine eski veri + hata.
      son = son && !son.hata ? { ...son, hata: n.hata } : n;
    } else {
      const { olaylar, gorulen } = olaylariBul(gorulenOku(), n.isler);
      gorulenYaz(gorulen);
      son = n;
      for (const o of olaylar) {
        log('nobet olayi: ' + o.tur + ' ' + o.proje + ' / ' + o.ad);
        dinleyiciler.olay(o);
      }
    }
    dinleyiciler.yayin(son);
    return son;
  })().finally(() => {
    ucusta = null;
  });
  return ucusta;
}

module.exports = {
  olaylariBul,
  /** @param {{ yayin: (n: object) => void, olay: (o: object) => void }} d */
  baslat(d) {
    dinleyiciler = d;
    if (zamanlayici) return;
    setTimeout(() => void oku(false), ILK_GECIKME_MS);
    zamanlayici = setInterval(() => void oku(false), ARALIK_MS);
  },
  durdur() {
    if (zamanlayici) clearInterval(zamanlayici);
    zamanlayici = null;
  },
  anlik: () => son,
  /** Sayfadaki "Tazele": onbellegi atlar (gh + gorevler yeniden). */
  tazele: () => oku(true),
};
