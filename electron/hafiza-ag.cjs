// v3.4, Aria'nin agi: vault'un not grafigi (Obsidian'in grafik gorunumunun Kokpit karsiligi). SALT OKUNUR, yeni toplayici
// yok: dugumler vault'un kendi .md dosyalari, kenarlar onlarin kendi baglari. Uc tur bag:
//   link     govdedeki [[wikilink]]            (yol ya da dosya adi; "|" ve "#" sonrasi atilir)
//   baglanti knowledge/connections/*.md        frontmatter `connects: [a, b]` (derleyicinin iliski makalesi)
//   kaynak   knowledge/concepts/*.md           frontmatter `sources: [2026-10-27.md]` -> daily/2026-10-27 (makale hangi gunden)
// Iki sanal dugum: `aria` (merkez; hafiza dosyalarina bagli) ve `kokpit` (Kokpit araclari; Kokpit proje notuna bagli).
// agKur SAF (test-ada fiksturle sinar); agOku diski okur, 60 sn onbellek.

const fs = require('fs');
const path = require('path');

const KLASORLER = [
  ['🔮 850-Companion', 'kimlik'],
  ['🏰 300-Projects', 'proje'],
  ['🧠 500-Knowledge', 'bilgi'],
  ['knowledge/concepts', 'kavram'],
  ['daily', 'gunluk'],
  ['📦 900-Archive', 'arsiv'],
];
const AZAMI_OKU = 200 * 1024;

function baslikBul(metin, yedek) {
  const fm = /^---\r?\n[\s\S]*?^title:\s*(.+)$/m.exec(metin);
  if (fm) return fm[1].trim().replace(/^["']|["']$/g, '');
  const h = /^#\s+(.+)$/m.exec(metin);
  return h ? h[1].trim() : yedek;
}

/** Frontmatter'daki `anahtar: [a, b]` listesi. SAF. */
function fmListe(metin, anahtar) {
  const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(metin);
  if (!fm) return [];
  const m = new RegExp('^' + anahtar + ':\\s*\\[([^\\]]*)\\]', 'm').exec(fm[1]);
  if (!m) return [];
  return m[1]
    .split(',')
    .map((s) => s.trim().replace(/^["']|["']$/g, ''))
    .filter(Boolean);
}

/**
 * Ag kurulumu. SAF: dosyalar [{ yol: 'klasor/ad.md', metin, t? }] -> { dugumler, kenarlar }.
 * Dugum kimligi uzantisiz goreli yol; `yol` hafiza panelinin actigi .md yolu.
 */
function agKur(dosyalar) {
  const dugumler = [
    { id: 'aria', baslik: 'Aria', grup: 'aria', yol: null, t: 0 },
    { id: 'kokpit', baslik: 'Kokpit araçları', grup: 'kokpit', yol: null, t: 0 },
  ];
  const kimlikler = new Set(['aria', 'kokpit']);
  const adla = new Map(); // dosya adi (kucuk harf) -> kimlik; ayni ad iki klasorde ise ilk gelen (klasor sirasi)
  const iliskiler = [];
  for (const d of dosyalar) {
    const yol = d.yol.split('\\').join('/');
    const klasor = KLASORLER.find(([k]) => yol.startsWith(k + '/'));
    if (!klasor || !yol.endsWith('.md')) continue;
    const id = yol.slice(0, -3);
    const ad = id.slice(klasor[0].length + 1);
    kimlikler.add(id);
    dugumler.push({ id, baslik: baslikBul(d.metin, ad), grup: klasor[1], yol, t: d.t ?? 0 });
    if (!adla.has(ad.toLowerCase())) adla.set(ad.toLowerCase(), id);
  }
  // Cozum sirasi: tam yol, kaynak notun kendi klasoru (kavramdaki [[otomat]] kavramdir, proje notu degil), dosya adi.
  const coz = (hedef, klasor) => {
    const h = String(hedef).split('|')[0].split('#')[0].trim().replace(/\.md$/, '');
    if (!h) return null;
    if (kimlikler.has(h)) return h;
    if (klasor && kimlikler.has(klasor + '/' + h)) return klasor + '/' + h;
    return adla.get(h.split('/').pop().toLowerCase()) ?? null;
  };
  const kenarlar = new Map();
  const ekle = (a, b, tur) => {
    if (!a || !b || a === b) return;
    const k = a < b ? a + '\n' + b : b + '\n' + a;
    if (!kenarlar.has(k)) kenarlar.set(k, { a, b, tur });
  };
  for (const d of dosyalar) {
    const yol = d.yol.split('\\').join('/');
    if (yol.startsWith('knowledge/connections/')) {
      const [a, b] = fmListe(d.metin, 'connects');
      if (a && b) iliskiler.push([coz(a, 'knowledge/concepts'), coz(b, 'knowledge/concepts')]);
      continue;
    }
    const id = yol.replace(/\.md$/, '');
    if (!kimlikler.has(id)) continue;
    const klasor = id.slice(0, id.lastIndexOf('/'));
    for (const m of d.metin.matchAll(/\[\[([^\]\n]+)\]\]/g)) ekle(id, coz(m[1], klasor), 'link');
    if (yol.startsWith('knowledge/concepts/')) for (const s of fmListe(d.metin, 'sources')) ekle(id, coz('daily/' + s), 'kaynak');
  }
  for (const [a, b] of iliskiler) ekle(a, b, 'baglanti');
  // Ayni adli kavram ve proje notu ayni konudur (derleyicinin `otomat` makalesi <-> `🏰 300-Projects/Otomat`).
  for (const d of dugumler) {
    if (d.grup !== 'proje') continue;
    const k = 'knowledge/concepts/' + d.id.split('/').pop().toLowerCase();
    if (kimlikler.has(k)) ekle(d.id, k, 'konu');
  }
  // Sanal dugumler: Aria hafiza dosyalarinin (kimlik) merkezinde; Kokpit araclari Kokpit proje notuna bagli.
  for (const d of dugumler) if (d.grup === 'kimlik') ekle('aria', d.id, 'aria');
  ekle('aria', 'kokpit', 'aria');
  if (kimlikler.has('🏰 300-Projects/Kokpit')) ekle('kokpit', '🏰 300-Projects/Kokpit', 'aria');
  return { dugumler, kenarlar: [...kenarlar.values()] };
}

function okuGuvenli(dosya) {
  try {
    const b = fs.readFileSync(dosya);
    return String(b.length > AZAMI_OKU ? b.subarray(0, AZAMI_OKU) : b);
  } catch {
    return '';
  }
}

let onbellek = { t: 0, vault: null, ag: null };
/** Vault'u okuyup agi kurar (60 sn onbellek; `taze` onbellegi atlar: Aria yeni not yazinca). */
function agOku(vault, { taze = false } = {}) {
  if (!taze && onbellek.ag && onbellek.vault === vault && Date.now() - onbellek.t < 60_000) return onbellek.ag;
  const dosyalar = [];
  for (const [klasor] of [...KLASORLER, ['knowledge/connections']]) {
    let adlar = [];
    try {
      adlar = fs.readdirSync(path.join(vault, klasor));
    } catch {
      continue;
    }
    for (const ad of adlar) {
      if (!ad.endsWith('.md')) continue;
      const tam = path.join(vault, klasor, ad);
      let t = 0;
      try {
        t = fs.statSync(tam).mtimeMs;
      } catch {
        continue;
      }
      dosyalar.push({ yol: klasor + '/' + ad, metin: okuGuvenli(tam), t });
    }
  }
  const ag = agKur(dosyalar);
  onbellek = { t: Date.now(), vault, ag };
  return ag;
}

module.exports = { agKur, agOku, fmListe };
