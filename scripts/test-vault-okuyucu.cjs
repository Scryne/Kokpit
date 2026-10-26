/**
 * Okuma sayfasinin ana surec modulu (electron/vault-okuyucu.cjs), sahte vault ile: yol kacisi
 * reddi, baslik cikarma, okundu durumu, proje oturum bloklari, baglanti cozumu.
 * Calistir: npm run test:okuyucu
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { okumaVaultKur, COMPANION, PROJELER } = require('./okuma-fixture.cjs');

const GECICI = fs.mkdtempSync(path.join(os.tmpdir(), 'kokpit-okuyucu-'));
const VAULT = okumaVaultKur(GECICI);
// Defter (2026-10-24): makinenin yazdigi aylik kayit; Companion'da en ustte.
fs.mkdirSync(path.join(VAULT, COMPANION, 'Defter'));
fs.writeFileSync(path.join(VAULT, COMPANION, 'Defter', '2026-10.md'), '# Defter 2026-10\n\n### kayit\n');
process.env.KOKPIT_VAULT = VAULT;
process.env.KOKPIT_DIZIN = path.join(GECICI, 'kokpit');

const v = require(path.join(__dirname, '..', 'electron', 'vault-okuyucu.cjs'));

let gecen = 0;
let kalan = 0;
function kontrol(ad, kosul, ayrinti) {
  if (kosul) {
    gecen++;
    console.log('PASS ' + ad);
  } else {
    kalan++;
    console.log('FAIL ' + ad + (ayrinti !== undefined ? '  -> ' + JSON.stringify(ayrinti) : ''));
  }
}

// --- Yol guvenligi ---
const LS = COMPANION + '/Last-Session.md';
kontrol('izinli not kabul', !!v.guvenliYol(LS));
for (const kotu of [
  'CLAUDE.md',
  '.claude/scripts/kokpit-projeler.json',
  '\u{1F510} 400-Vault/sifre.md',
  'daily/../CLAUDE.md',
  '../' + path.basename(VAULT) + '/CLAUDE.md',
  PROJELER + '/Ornek-Proje/.gizli/sir.md',
  path.join(VAULT, LS),
  'C:/Windows/win.ini',
  'daily/yok.md',
  'knowledge',
  '',
  null,
]) {
  kontrol('reddedildi: ' + String(kotu), v.guvenliYol(kotu) === null);
  kontrol('oku reddetti: ' + String(kotu), !!v.oku(kotu).hata);
}

// Junction ile disari cikis (Windows'ta yetki istemeyen symlink turu)
try {
  const dis = path.join(GECICI, 'dis');
  fs.mkdirSync(dis);
  fs.writeFileSync(path.join(dis, 'kacak.md'), '# kacak\n');
  fs.symlinkSync(dis, path.join(VAULT, 'knowledge', 'baglanti'), 'junction');
  kontrol('junction ile disari cikan not reddedildi', v.guvenliYol('knowledge/baglanti/kacak.md') === null);
  kontrol('junction icerigi listeye girmez', !v.liste('bilgi').some((n) => n.yol.includes('kacak')));
} catch (e) {
  console.log('SKIP junction: ' + e.message);
}

// --- Listeler ve basliklar ---
const comp = v.liste('companion');
const lsKalem = (liste) => liste.find((n) => n.yol === LS);
kontrol(
  'companion sirasi: Defter once, Last-Session arsivde',
  comp[0].yol === COMPANION + '/Defter/2026-10.md' && comp[0].grup === 'Defter' && lsKalem(comp).grup === 'Arşiv' && comp[comp.length - 1].grup === 'Arşiv',
  comp.map((n) => n.yol),
);
kontrol('baslik frontmatter title', lsKalem(comp).baslik === 'Last-Session');
kontrol('baslik ilk # satiri', comp.find((n) => n.yol.endsWith('Threads.md')).baslik === 'Threads');
const bilgi = v.liste('bilgi');
kontrol('bilgi: giris once, sonra kavramlar', bilgi[0].grup === 'Giriş' && bilgi.some((n) => n.grup === 'Kavramlar'));
const gunluk = v.liste('gunluk');
kontrol('gunluk en yeni once', gunluk.length === 2 && gunluk[0].yol > gunluk[1].yol);
kontrol('projeler bolumu liste vermez (ozet ayri)', v.liste('projeler').length === 0);
kontrol('bilinmeyen bolum bos', v.liste('../x').length === 0);
const akis = v.akis(50);
kontrol('akis mtime sirali', akis.every((n, i) => i === 0 || akis[i - 1].mtime >= n.mtime));
kontrol('akis alan disini icermez', !akis.some((n) => /CLAUDE|sifre|\.gizli/.test(n.yol)), akis.map((n) => n.yol));
kontrol('akis proje notunu icerir', akis.some((n) => n.yol.endsWith('rapor.md') && n.grup === 'Projeler'));

// --- Okundu durumu: ilk acilista yalniz son 2 gun okunmamis ---
const threads = comp.find((n) => n.yol.endsWith('Threads.md'));
kontrol('10 gunluk not okunmamis sayilmaz', threads.okunmamis === false);
kontrol('bugunku not okunmamis', comp[0].okunmamis === true && lsKalem(comp).okunmamis === true);
const once = v.okunmamisSayisi();
const r = v.oku(LS);
kontrol('oku: ham ve mtime', typeof r.ham === 'string' && r.ham.includes('Son Oturum') && r.mtime > 0);
kontrol('okundu kaydedildi', v.okundu(LS, r.mtime) === true && v.okunmamisSayisi() === once - 1);
kontrol('okuma.json Kokpit dizininde', fs.existsSync(v.OKUMA_DOSYA) && v.OKUMA_DOSYA.startsWith(process.env.KOKPIT_DIZIN));
kontrol('okundu alan disi yolu reddeder', v.okundu('CLAUDE.md', 1) === false);
// Not degisince yeniden okunmamis olur
const ileri = (Date.now() + 5000) / 1000;
fs.utimesSync(path.join(VAULT, ...LS.split('/')), ileri, ileri);
kontrol('degisen not yeniden okunmamis', lsKalem(v.liste('companion')).okunmamis === true);
v.hepsiOkundu();
kontrol('hepsini okundu say', v.okunmamisSayisi() <= 1); // ileri tarihli Last-Session esikten yeni
kontrol('vault dosyalarina yazilmadi', !fs.readdirSync(VAULT).includes('okuma.json'));

// --- Baglanti cozumu ---
kontrol('wikilink ada gore', v.cozumle('kanit-standardi', LS)?.yol === 'knowledge/concepts/kanit-standardi.md');
kontrol('wikilink cipali', v.cozumle('kanit-standardi#Ayrıntı', LS)?.cipa === 'Ayrıntı');
kontrol('goreli .md linki', v.cozumle('concepts/kanit-standardi.md', 'knowledge/index.md')?.yol === 'knowledge/concepts/kanit-standardi.md');
kontrol('olmayan not null', v.cozumle('Yok-Boyle-Not', LS) === null);
kontrol('alan disi hedef null', v.cozumle('CLAUDE', LS) === null && v.cozumle('../CLAUDE.md', 'knowledge/index.md') === null);
kontrol('kodlanmis yol cozulur', v.cozumle('concepts/kanit%2Dstandardi.md', 'knowledge/index.md')?.yol === 'knowledge/concepts/kanit-standardi.md');

// --- Proje ozetleri ---
const oz = v.projeOzetleri();
const ornek = oz.find((p) => p.ad === 'Ornek-Proje');
kontrol('proje sirasi json sirasi', oz.map((p) => p.ad).join() === 'Ornek-Proje,Bos-Proje');
kontrol('son oturum en yeni daily, en yeni blok', ornek.sonOturum && ornek.sonOturum.saat === '09:10', ornek.sonOturum);
kontrol('kararlar bicimsiz', ornek.sonOturum.kararlar.join('|') === 'Karar bir alındı|Karar iki', ornek.sonOturum.kararlar);
kontrol('yapilacaklar kutusuz', ornek.sonOturum.yapilacaklar[0] === 'İş bir', ornek.sonOturum.yapilacaklar);
kontrol('baglam', ornek.sonOturum.baglam[0] === 'Bağlam maddesi');
kontrol('baslik daily cipasi', ornek.sonOturum.baslik === 'Oturum (09:10) — Ornek-Proje');
kontrol('proje notlari, gizli klasor haric', ornek.notlar.length === 1 && ornek.notlar[0].baslik === 'Örnek Rapor', ornek.notlar);
const bos = oz.find((p) => p.ad === 'Bos-Proje');
kontrol('kaydi olmayan proje bos', bos.sonOturum === null && bos.notlar.length === 0 && bos.klasor === null);
const bloklar = v.oturumBloklari('### Oturum (1:05), compaction öncesi — X\nmetin\n### Başka\nyok\n');
kontrol('oturum basligi varyanti', bloklar.length === 1 && bloklar[0].ad === 'X' && !bloklar[0].metin.includes('yok'), bloklar);

fs.rmSync(GECICI, { recursive: true, force: true });
console.log(`\n${gecen} gecti, ${kalan} kaldi`);
process.exit(kalan ? 1 : 0);
