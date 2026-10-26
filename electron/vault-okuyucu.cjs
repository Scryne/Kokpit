// Okuma sayfasi (v2.9): vault'un dar bir kesimini SALT OKUR. Hicbir vault dosyasina yazmaz.
//
// Neden durum.py'den gecmiyor (README kural 1): durum.py proje DURUMUNU toplar; bu modul durum
// toplamaz, belge gosterir. Yazdigi tek yer Kokpit'in kendi dizinindeki okuma.json (hangi notu
// ne zaman okudun). Dosya izleyici yok (Spike A-04): sayfa acilinca, odakta ve elle okunur.
//
// Guvenlik: renderer yalniz vault'a goreli yol verir. Her yol izinli bir kokun icinde mi, .md mi,
// gercek yolu (junction/symlink cozulmus) da iceride mi diye bakilir; degilse reddedilir.
const fs = require('fs');
const path = require('path');
const { VAULT, KOKPIT_DIZIN } = require('./config.cjs');
const { log } = require('./log.cjs');

const BOLUMLER = Object.freeze({
  companion: { kok: '\u{1F52E} 850-Companion', derin: false },
  gunluk: { kok: 'daily', derin: false },
  bilgi: { kok: 'knowledge', derin: true },
  projeler: { kok: '\u{1F3F0} 300-Projects', derin: true },
});
const KOKLER = Object.values(BOLUMLER).map((b) => path.join(VAULT, b.kok));
const PROJE_LISTESI = path.join(VAULT, '.claude', 'scripts', 'kokpit-projeler.json');
const OKUMA_DOSYA = path.join(KOKPIT_DIZIN, 'okuma.json');

const EN_BUYUK = 1024 * 1024; // 1 MB ustu not okunmaz
const EN_DERIN = 5; // proje klasorlerinde inilecek en fazla seviye
const EN_COK_DOSYA = 4000; // tek taramada en fazla dosya (kacak klasore karsi)
const ILK_OKUMA_GUN = 2; // okuma.json yokken son 2 gunun notlari okunmamis sayilir
const GUNLUK_TARAMA = 30; // proje ozeti icin geriye bakilan daily sayisi

/** Vault'a goreli, ileri egik cizgili yol (renderer ve okuma.json bunu tasir). */
function goreliYol(tam) {
  return path.relative(VAULT, tam).split(path.sep).join('/');
}

function icinde(kok, tam) {
  const r = path.relative(kok, tam);
  return r !== '' && !r.startsWith('..') && !path.isAbsolute(r);
}

/**
 * Renderer'dan gelen goreli yolu dogrular; gecerliyse mutlak yolu, degilse null dondurur.
 * Kok disi, nokta ile baslayan klasor (.claude, .obsidian), .md olmayan, symlink ile disari
 * cikan ve 1 MB'tan buyuk dosya reddedilir.
 */
function guvenliYol(goreli) {
  if (typeof goreli !== 'string' || !goreli || goreli.length > 1024 || goreli.includes('\0')) return null;
  if (path.isAbsolute(goreli) || /^[a-zA-Z]:/.test(goreli)) return null;
  const tam = path.resolve(VAULT, goreli);
  if (!/\.md$/i.test(tam)) return null;
  const kok = KOKLER.find((k) => icinde(k, tam));
  if (!kok) return null;
  if (path.relative(kok, tam).split(path.sep).some((p) => p.startsWith('.'))) return null;
  try {
    const st = fs.lstatSync(tam);
    if (!st.isFile() || st.size > EN_BUYUK) return null;
    if (!icinde(fs.realpathSync(kok), fs.realpathSync(tam))) return null;
  } catch {
    return null;
  }
  return tam;
}

/** Bir kokun altindaki .md dosyalari: { tam, yol, mtime, boyut }. Nokta klasorleri atlanir. */
function taraTek(kok, derin) {
  const sonuc = [];
  const yigin = [[kok, 0]];
  while (yigin.length && sonuc.length < EN_COK_DOSYA) {
    const [dizin, seviye] = yigin.pop();
    let girdiler;
    try {
      girdiler = fs.readdirSync(dizin, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const g of girdiler) {
      if (g.name.startsWith('.') || g.name === 'node_modules') continue;
      const tam = path.join(dizin, g.name);
      if (g.isDirectory()) {
        if (derin && seviye < EN_DERIN) yigin.push([tam, seviye + 1]);
      } else if (g.isFile() && /\.md$/i.test(g.name)) {
        try {
          const st = fs.statSync(tam);
          if (st.size <= EN_BUYUK) sonuc.push({ tam, yol: goreliYol(tam), mtime: st.mtimeMs, boyut: st.size });
        } catch {
          /* tarama sirasinda silinmis */
        }
      }
    }
  }
  return sonuc;
}

/** Baslik: frontmatter `title`, yoksa ilk `# ` satiri, yoksa dosya adi. Yalniz ilk 2 KB okunur. */
function baslikCikar(tam) {
  let bas = '';
  try {
    const fd = fs.openSync(tam, 'r');
    try {
      const tampon = Buffer.alloc(2048);
      const n = fs.readSync(fd, tampon, 0, tampon.length, 0);
      bas = tampon.subarray(0, n).toString('utf8');
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    /* okunamadi: dosya adi */
  }
  return baslikMetinden(bas) || path.basename(tam, path.extname(tam));
}

function baslikMetinden(metin) {
  const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(metin);
  if (fm) {
    const t = /^title:\s*(.+?)\s*$/m.exec(fm[1]);
    if (t) {
      const v = t[1].replace(/^(["'])(.*)\1$/, '$2').trim();
      if (v) return v;
    }
  }
  const govde = fm ? metin.slice(fm[0].length) : metin;
  const h = /^#\s+(.+?)\s*#*\s*$/m.exec(govde);
  return h ? h[1].trim() : null;
}

// ---- Okundu durumu (Kokpit'in kendi dizini; vault'a yazilmaz) ----

let okumaBellek = null;

function okumaOku() {
  if (okumaBellek) return okumaBellek;
  try {
    const ham = JSON.parse(fs.readFileSync(OKUMA_DOSYA, 'utf8'));
    okumaBellek = {
      esik: Number.isFinite(ham.esik) ? ham.esik : 0,
      okunan: ham.okunan && typeof ham.okunan === 'object' ? ham.okunan : {},
    };
  } catch (e) {
    if (e.code !== 'ENOENT') log('okuma.json okunamadi, sifirdan: ' + e.message);
    // Ilk acilis: yuzlerce eski not "okunmamis" gorunmesin; yalniz son iki gun.
    okumaBellek = { esik: Date.now() - ILK_OKUMA_GUN * 86400000, okunan: {} };
    okumaYaz();
  }
  return okumaBellek;
}

function okumaYaz() {
  try {
    fs.mkdirSync(path.dirname(OKUMA_DOSYA), { recursive: true });
    const gecici = OKUMA_DOSYA + '.' + process.pid + '.tmp';
    fs.writeFileSync(gecici, JSON.stringify(okumaBellek) + '\n', 'utf8');
    fs.renameSync(gecici, OKUMA_DOSYA);
  } catch (e) {
    log('okuma.json yazilamadi: ' + e.message);
  }
}

function okunmamis(yol, mtime) {
  const d = okumaOku();
  return mtime > d.esik && !(d.okunan[yol] >= mtime);
}

function okundu(goreli, mtime) {
  if (!guvenliYol(goreli) || !Number.isFinite(mtime)) return false;
  const d = okumaOku();
  d.okunan[goreli] = mtime;
  okumaYaz();
  return true;
}

/** "Hepsini okudum": esik simdiye cekilir, tek tek kayitlar silinir (dosya buyumesin). */
function hepsiOkundu() {
  okumaBellek = { esik: Date.now(), okunan: {} };
  okumaYaz();
  return true;
}

// ---- Listeler ----

function kalem(d, grup) {
  return { yol: d.yol, baslik: baslikCikar(d.tam), mtime: d.mtime, boyut: d.boyut, grup, okunmamis: okunmamis(d.yol, d.mtime) };
}

// Defter (2026-10-24): makinenin her oturum sonunda yazdigi kayit, Last-Session'in yerini aldi.
// Aylik dosyalar Companion/Defter/ altinda; en yeni ay en ustte. Last-Session artik arsiv.
const COMPANION_SIRA = ['Threads', 'Journal', 'Kurallar', 'Core', 'Ikiz'];
const DEFTER_ALT = 'Defter';

function tara(kok, derin) {
  const dosyalar = taraTek(kok, derin);
  // Companion duz taranir; yalniz Defter alt klasoru eklenir.
  if (kok === path.join(VAULT, BOLUMLER.companion.kok)) dosyalar.push(...taraTek(path.join(kok, DEFTER_ALT), false));
  return dosyalar;
}

function defterMi(d) {
  return d.yol.startsWith(`${BOLUMLER.companion.kok}/${DEFTER_ALT}/`);
}

function liste(bolum) {
  const b = BOLUMLER[bolum];
  if (!b || bolum === 'projeler') return [];
  const dosyalar = tara(path.join(VAULT, b.kok), b.derin);
  if (bolum === 'companion') {
    const arsiv = (d) => {
      const ad = path.basename(d.tam, '.md');
      return ad.startsWith('Arsiv-') || ad === 'Last-Session';
    };
    const sira = (d) => {
      if (defterMi(d)) return -1;
      const i = COMPANION_SIRA.indexOf(path.basename(d.tam, '.md'));
      return arsiv(d) ? 1000 : i === -1 ? 500 : i;
    };
    return dosyalar
      .sort((a, c) => sira(a) - sira(c) || c.yol.localeCompare(a.yol))
      .map((d) => kalem(d, defterMi(d) ? 'Defter' : arsiv(d) ? 'Arşiv' : 'Companion'));
  }
  if (bolum === 'gunluk') {
    return dosyalar.sort((a, c) => c.yol.localeCompare(a.yol)).map((d) => kalem(d, 'Günlük'));
  }
  // bilgi: giris dosyalari ustte, sonra kavramlar ve baglantilar en yeni once
  const grupAdi = (d) =>
    d.yol.startsWith('knowledge/concepts/') ? 'Kavramlar' : d.yol.startsWith('knowledge/connections/') ? 'Bağlantılar' : 'Giriş';
  const grupSira = { Giriş: 0, Kavramlar: 1, Bağlantılar: 2 };
  return dosyalar
    .map((d) => ({ d, g: grupAdi(d) }))
    .sort((a, c) => grupSira[a.g] - grupSira[c.g] || c.d.mtime - a.d.mtime)
    .map(({ d, g }) => kalem(d, g));
}

const BOLUM_ADI = { companion: 'Companion', gunluk: 'Günlük', bilgi: 'Bilgi', projeler: 'Projeler' };

function bolumBul(yol) {
  for (const [ad, b] of Object.entries(BOLUMLER)) if (yol.startsWith(b.kok + '/')) return ad;
  return null;
}

function tumDosyalar() {
  return Object.values(BOLUMLER).flatMap((b) => tara(path.join(VAULT, b.kok), b.derin));
}

/** Akis: butun koklerden en son degisen n not, en yeni once. Baslik yalniz bu n not icin okunur. */
function akis(n = 40) {
  const sinir = Math.max(1, Math.min(200, Number(n) || 40));
  return tumDosyalar()
    .sort((a, c) => c.mtime - a.mtime)
    .slice(0, sinir)
    .map((d) => kalem(d, BOLUM_ADI[bolumBul(d.yol)] || ''));
}

/** Pano satiri icin: kac okunmamis not var (baslik okumadan, yalniz stat). */
function okunmamisSayisi() {
  return tumDosyalar().filter((d) => okunmamis(d.yol, d.mtime)).length;
}

function oku(goreli) {
  const tam = guvenliYol(goreli);
  if (!tam) return { hata: 'Bu not okuma alanının dışında ya da bulunamadı.' };
  try {
    const ham = fs.readFileSync(tam, 'utf8');
    const st = fs.statSync(tam);
    return { yol: goreliYol(tam), ham, mtime: st.mtimeMs, baslik: baslikMetinden(ham) || path.basename(tam, '.md'), okunmamis: okunmamis(goreliYol(tam), st.mtimeMs) };
  } catch (e) {
    return { hata: 'Not okunamadı: ' + e.message };
  }
}

// ---- Baglanti cozumu (wikilink ve goreli .md linki) ----

let adIndeksi = null;

function indeks() {
  if (adIndeksi) return adIndeksi;
  adIndeksi = new Map();
  // Ayni ad birden cok yerde varsa en yeni kazanir (Obsidian da en yakini secer; burada basit tutuldu).
  for (const d of tumDosyalar().sort((a, c) => a.mtime - c.mtime)) {
    adIndeksi.set(path.basename(d.tam, '.md').toLowerCase(), d.yol);
  }
  return adIndeksi;
}

/** Hedefi okuma alanindaki bir nota cevirir: { yol, cipa } ya da null (alan disi / yok). */
function cozumle(hedef, kaynak) {
  if (typeof hedef !== 'string' || !hedef.trim()) return null;
  let h = hedef.trim();
  try {
    h = decodeURIComponent(h);
  } catch {
    /* zaten cozulmus */
  }
  const kare = h.indexOf('#');
  const cipa = kare >= 0 ? h.slice(kare + 1).trim() || null : null;
  if (kare >= 0) h = h.slice(0, kare).trim();
  if (!h) return typeof kaynak === 'string' && guvenliYol(kaynak) ? { yol: kaynak, cipa } : null;

  if (h.includes('/') || /\.md$/i.test(h)) {
    const aday = /\.md$/i.test(h) ? h : h + '.md';
    const temel = typeof kaynak === 'string' && guvenliYol(kaynak) ? path.dirname(path.resolve(VAULT, kaynak)) : VAULT;
    for (const tam of [path.resolve(temel, aday), path.resolve(VAULT, aday)]) {
      const goreli = goreliYol(tam);
      if (guvenliYol(goreli)) return { yol: goreli, cipa };
    }
  }
  const yol = indeks().get(path.basename(h, '.md').toLowerCase());
  return yol && guvenliYol(yol) ? { yol, cipa } : null;
}

/** Ad indeksini birakir (sayfa tazelenince yeni notlar da cozulsun). */
function tazele() {
  adIndeksi = null;
}

// ---- Proje ozetleri: "en son ne yapildi" ----

const OTURUM_BASLIGI = /^### Oturum \((\d{1,2}:\d{2})\)[^\n]*?\s—\s(.+?)\s*$/;

function maddeler(blok, baslik, enCok) {
  const satirlar = blok.split(/\r?\n/);
  const bas = satirlar.findIndex((s) => new RegExp('^#{2,4}\\s+' + baslik + '\\s*$', 'i').test(s));
  if (bas < 0) return [];
  const sonuc = [];
  for (let i = bas + 1; i < satirlar.length && sonuc.length < enCok; i++) {
    const s = satirlar[i];
    if (/^#{1,4}\s/.test(s)) break;
    const m = /^\s*[-*]\s+(?:\[[ x]\]\s+)?(.+)$/.exec(s);
    if (m) sonuc.push(m[1].replace(/\*\*/g, '').replace(/`/g, '').trim().slice(0, 220));
  }
  return sonuc;
}

/** Bir daily dosyasindaki oturum bloklari: { saat, ad, baslik, metin }. */
function oturumBloklari(metin) {
  const satirlar = metin.split(/\r?\n/);
  const bloklar = [];
  let simdiki = null;
  for (const s of satirlar) {
    const m = OTURUM_BASLIGI.exec(s);
    if (m) {
      simdiki = { saat: m[1], ad: m[2].trim(), baslik: s.replace(/^###\s+/, '').trim(), satirlar: [] };
      bloklar.push(simdiki);
    } else if (/^### /.test(s) || /^# /.test(s)) {
      simdiki = null;
    } else if (simdiki) {
      simdiki.satirlar.push(s);
    }
  }
  return bloklar.map((b) => ({ saat: b.saat, ad: b.ad, baslik: b.baslik, metin: b.satirlar.join('\n') }));
}

function projeListesi() {
  try {
    const ham = JSON.parse(fs.readFileSync(PROJE_LISTESI, 'utf8'));
    return Array.isArray(ham.projeler) ? ham.projeler.filter((p) => p && typeof p.ad === 'string') : [];
  } catch (e) {
    if (e.code !== 'ENOENT') log('kokpit-projeler.json okunamadi: ' + e.message);
    return [];
  }
}

function projeOzetleri() {
  const projeler = projeListesi();
  const projeKok = path.join(VAULT, BOLUMLER.projeler.kok);
  const gunlukler = tara(path.join(VAULT, BOLUMLER.gunluk.kok), false)
    .filter((d) => /^\d{4}-\d{2}-\d{2}\.md$/.test(path.basename(d.tam)))
    .sort((a, c) => c.yol.localeCompare(a.yol))
    .slice(0, GUNLUK_TARAMA);

  // En yeni daily'den geriye: her projenin ilk gorulen (dosya icinde en son) oturumu.
  const son = new Map();
  for (const g of gunlukler) {
    let metin;
    try {
      metin = fs.readFileSync(g.tam, 'utf8');
    } catch {
      continue;
    }
    const tarih = path.basename(g.tam, '.md');
    for (const b of oturumBloklari(metin).reverse()) {
      const anahtar = b.ad.toLowerCase();
      if (son.has(anahtar)) continue;
      son.set(anahtar, {
        tarih,
        saat: b.saat,
        yol: g.yol,
        baslik: b.baslik,
        baglam: maddeler(b.metin, 'Bağlam', 2),
        kararlar: maddeler(b.metin, 'Alınan Kararlar', 4),
        yapilacaklar: maddeler(b.metin, 'Yapılacaklar', 4),
      });
    }
  }

  return projeler.map((p) => {
    const adaylar = [p.vault, p.ad].filter((x) => typeof x === 'string' && x && !/[\\/]|^\./.test(x));
    const klasor = adaylar.map((a) => path.join(projeKok, a)).find((k) => fs.existsSync(k)) || null;
    const notlar = klasor
      ? tara(klasor, true)
          .sort((a, c) => c.mtime - a.mtime)
          .slice(0, 5)
          .map((d) => kalem(d, 'Proje'))
      : [];
    return {
      ad: p.ad,
      envanter: typeof p.envanter === 'string' ? p.envanter : null,
      klasor: klasor ? goreliYol(klasor) : null,
      sonOturum: son.get(p.ad.toLowerCase()) || null,
      notlar,
    };
  });
}

module.exports = {
  liste,
  akis,
  oku,
  cozumle,
  okundu,
  hepsiOkundu,
  okunmamisSayisi,
  projeOzetleri,
  tazele,
  // testler icin
  guvenliYol,
  baslikMetinden,
  oturumBloklari,
  maddeler,
  OKUMA_DOSYA,
};
