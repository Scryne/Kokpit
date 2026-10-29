// v3.3, Aria'nin hafiza paneli: "Aria ne biliyor" (Faz 61). Vault'un kendi dosyalari SALT OKUNUR: Core (kimlik), Threads
// (acik konular), Kurallar, Last-Session, Journal ve derlenmis bilgi tabani (knowledge/). Yeni toplayici yok; dosyalar
// oldugu gibi okunur, bolumlenir. Yazma yalniz Aria'nin kendisinden (claude oturumu, vault'un hafiza protokolu).
// Saf ayristiricilar (bolumle, threadler, kurallar, ara) test-ada'da fikstürle sinanir.

const fs = require('fs');
const path = require('path');

const COMPANION = '🔮 850-Companion';
const AZAMI_OKU = 200 * 1024;

function okuGuvenli(dosya) {
  try {
    const st = fs.statSync(dosya);
    if (!st.isFile()) return '';
    const b = fs.readFileSync(dosya);
    return String(b.length > AZAMI_OKU ? b.subarray(0, AZAMI_OKU) : b);
  } catch {
    return '';
  }
}

/** "## Baslik\ngovde" bolumleri (verilen duzeyde). SAF. */
function bolumle(metin, duzey = 2) {
  const isaret = '#'.repeat(duzey) + ' ';
  const bolumler = [];
  let su = null;
  for (const satir of String(metin).split(/\r?\n/)) {
    if (satir.startsWith(isaret)) {
      if (su) bolumler.push(su);
      su = { baslik: satir.slice(isaret.length).trim(), govde: '' };
    } else if (su) su.govde += satir + '\n';
  }
  if (su) bolumler.push(su);
  return bolumler.map((b) => ({ ...b, govde: b.govde.trim() }));
}

/** Threads.md: "### Thread: X" + "**Status:** 🟢 Active: ...". SAF. */
function threadler(metin) {
  return bolumle(metin, 3)
    .filter((b) => b.baslik.startsWith('Thread:'))
    .map((b) => {
      const durum = /\*\*Status:\*\*\s*(\S+)\s*([^:—\n]*)/.exec(b.govde);
      const izle = /\*\*İzle:\*\*\s*([^\n]+)/.exec(b.govde);
      return {
        baslik: b.baslik.replace(/^Thread:\s*/, ''),
        isaret: durum ? durum[1] : '',
        durum: durum ? durum[2].trim() : '',
        ozet: (izle ? izle[1] : b.govde.split('\n').find((s) => s.trim() && !s.startsWith('**Status')) || '').trim().slice(0, 240),
        govde: b.govde,
      };
    });
}

/** Kurallar.md: "- **kural:** ..." maddeleri; ilk cumle + "neden" ayri. SAF. */
function kurallar(metin) {
  const sonuc = [];
  const satirlar = String(metin).split(/\r?\n/);
  let su = null;
  for (const s of satirlar) {
    const m = /^- \*\*kural:\*\*\s*(.*)$/.exec(s);
    if (m) {
      if (su) sonuc.push(su);
      su = { metin: m[1].trim() };
    } else if (su && /^\s{2,}\S/.test(s)) su.metin += ' ' + s.trim();
    else if (su && !s.trim()) {
      sonuc.push(su);
      su = null;
    }
  }
  if (su) sonuc.push(su);
  return sonuc.map((k) => {
    const [kural, neden] = k.metin.split(/\*\*neden:\*\*/);
    return { kural: kural.trim(), neden: neden ? neden.trim() : '' };
  });
}

/** Turkce duyarsiz arama anahtari. SAF. */
function anahtar(s) {
  return String(s || '')
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i')
    .replace(/ş/g, 's')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c');
}

/**
 * Bilgi tabani ve hafiza dosyalarinda arama. Basit ve aciklanabilir: baslikta gecen sozcuk 5, govdede her gecis 1 (en
 * fazla 5); butun sozcukler gecmeli. SAF: dosyalar [{ yol, baslik, metin }] verilir.
 */
function ara(sorgu, dosyalar, sinir = 20) {
  const sozcukler = anahtar(sorgu).split(/\s+/).filter((s) => s.length >= 2);
  if (!sozcukler.length) return [];
  const sonuc = [];
  for (const d of dosyalar) {
    const b = anahtar(d.baslik);
    const m = anahtar(d.metin);
    let puan = 0;
    let hepsi = true;
    for (const s of sozcukler) {
      const bt = b.includes(s);
      let gecis = 0;
      for (let i = m.indexOf(s); i >= 0 && gecis < 5; i = m.indexOf(s, i + s.length)) gecis++;
      if (!bt && !gecis) {
        hepsi = false;
        break;
      }
      puan += (bt ? 5 : 0) + gecis;
    }
    if (!hepsi) continue;
    const i = m.indexOf(sozcukler[0]);
    const bas = Math.max(0, i - 80);
    const parca = d.metin.slice(bas, bas + 220).replace(/\s+/g, ' ').trim();
    sonuc.push({ yol: d.yol, baslik: d.baslik, puan, parca: (bas > 0 ? '…' : '') + parca + '…' });
  }
  return sonuc.sort((x, y) => y.puan - x.puan).slice(0, sinir);
}

function frontmatterSiz(metin) {
  return String(metin).replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '');
}
function baslikBul(metin, yedek) {
  const fm = /^---\r?\n[\s\S]*?^title:\s*(.+)$/m.exec(metin);
  if (fm) return fm[1].trim().replace(/^["']|["']$/g, '');
  const h = /^#\s+(.+)$/m.exec(metin);
  return h ? h[1].trim() : yedek;
}

/** Aranabilir dosyalar: bilgi tabani makaleleri + 500-Knowledge + hafiza dosyalari. Kisa onbellek (dosya mtime). */
let onbellek = { t: 0, dosyalar: [] };
function aranabilir(vault) {
  if (Date.now() - onbellek.t < 60_000 && onbellek.vault === vault) return onbellek.dosyalar;
  const dosyalar = [];
  const ekle = (dizin, onek) => {
    let adlar = [];
    try {
      adlar = fs.readdirSync(path.join(vault, dizin));
    } catch {
      return;
    }
    for (const ad of adlar) {
      if (!ad.endsWith('.md')) continue;
      const yol = (onek ? onek + '/' : '') + ad;
      const metin = okuGuvenli(path.join(vault, dizin, ad));
      dosyalar.push({ yol, baslik: baslikBul(metin, ad.replace(/\.md$/, '')), metin: frontmatterSiz(metin) });
    }
  };
  ekle(path.join('knowledge', 'concepts'), 'knowledge/concepts');
  ekle(path.join('knowledge', 'connections'), 'knowledge/connections');
  ekle('🧠 500-Knowledge', '🧠 500-Knowledge');
  ekle(COMPANION, COMPANION);
  ekle('🏰 300-Projects', '🏰 300-Projects');
  onbellek = { t: Date.now(), vault, dosyalar };
  return dosyalar;
}

/** Hafiza panelinin ozeti. */
function ozet(vault) {
  const c = (ad) => okuGuvenli(path.join(vault, COMPANION, ad));
  const core = frontmatterSiz(c('Core.md'));
  const ls = bolumle(c('Last-Session.md'), 2).map((b) => ({ baslik: b.baslik.replace(/^Session:\s*/, ''), govde: b.govde }));
  const journal = bolumle(c('Journal.md'), 2).slice(0, 5);
  let makale = 0;
  try {
    makale = fs.readdirSync(path.join(vault, 'knowledge', 'concepts')).filter((f) => f.endsWith('.md')).length;
  } catch {
    makale = 0;
  }
  return {
    core,
    threadler: threadler(c('Threads.md')).map(({ govde, ...t }) => ({ ...t, govde: govde.slice(0, 4000) })),
    kurallar: kurallar(c('Kurallar.md')),
    sonOturumlar: ls,
    journal,
    makale,
  };
}

/** Panelde tek dosya okuma: yalniz vault icindeki .md (goreli yol), 200 KB. */
function dosyaOku(vault, goreli) {
  if (typeof goreli !== 'string' || !goreli.endsWith('.md')) return { hata: 'geçersiz yol' };
  const tam = path.resolve(vault, goreli);
  if (!tam.toLowerCase().startsWith(path.resolve(vault).toLowerCase() + path.sep)) return { hata: 'geçersiz yol' };
  const metin = okuGuvenli(tam);
  if (!metin) return { hata: 'okunamadı' };
  return { yol: goreli, baslik: baslikBul(metin, path.basename(goreli, '.md')), metin: frontmatterSiz(metin) };
}

module.exports = { bolumle, threadler, kurallar, anahtar, ara, ozet, dosyaOku, aranabilir, COMPANION };
