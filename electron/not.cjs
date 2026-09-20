// Inbox notu: Kokpit'in vault'a yaptigi TEK yazma (2026-09-21, Faz 8).
//
// Kural: v1 hicbir vault dosyasina yazmazdi (hook'lar yaziyor, ikinci yazar yaris demek).
// Bu istisna dar tutuldu: yalniz `📥 000-Inbox/Dump/YYYY-MM-DD.md`, yalniz SONA EKLEME,
// asla ustune yazma, baska hicbir dosya. Hook'lar Inbox'a dokunmaz, yaris yok.
// Dosya yoksa vault'un Note sablonuyla ayni frontmatter'la acilir.
const fs = require('fs');
const path = require('path');
const { VAULT } = require('./config.cjs');
const { log } = require('./log.cjs');

const DUMP = path.join(VAULT, '\u{1F4E5} 000-Inbox', 'Dump');
const EN_COK = 2000;

function tarih(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function ekle(metin, kaynak) {
  if (typeof metin !== 'string') return { hata: 'metin yok' };
  const temiz = metin.replace(/\r\n?/g, '\n').trim();
  if (!temiz) return { hata: 'boş not' };
  if (temiz.length > EN_COK) return { hata: 'not ' + EN_COK + ' karakteri geçemez' };
  if (!fs.existsSync(VAULT)) return { hata: 'vault bulunamadı: ' + VAULT };

  const simdi = new Date();
  const gun = tarih(simdi);
  const dosya = path.join(DUMP, gun + '.md');
  const saat = `${String(simdi.getHours()).padStart(2, '0')}:${String(simdi.getMinutes()).padStart(2, '0')}`;
  // Cok satirli not liste ogesi olarak girintilenir; ilk satir madde, gerisi devam.
  const govde = temiz.split('\n').map((s, i) => (i === 0 ? s : '  ' + s)).join('\n');
  const etiket = kaynak ? ` _(${kaynak})_` : '';
  const satir = `- **${saat}**${etiket} — ${govde}\n`;
  try {
    fs.mkdirSync(DUMP, { recursive: true });
    if (!fs.existsSync(dosya)) {
      fs.writeFileSync(
        dosya,
        `---\ntitle: Inbox ${gun}\ncreated: ${gun}\nmodified: ${gun}\ntype: note\nstatus: active\ntags: [inbox, kokpit]\n---\n# Inbox ${gun}\n\nKokpit'ten düşülen hızlı notlar (Ctrl+Shift+N). İşlenince ilgili yere taşınır.\n\n`,
        'utf8'
      );
    }
    fs.appendFileSync(dosya, satir, 'utf8');
    log('inbox notu eklendi: ' + dosya);
    return { dosya };
  } catch (e) {
    log('inbox notu yazilamadi: ' + e.message);
    return { hata: e.message };
  }
}

module.exports = { ekle, DUMP };
