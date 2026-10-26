/**
 * Okuma sayfasi testleri icin sahte vault (v2.9). Gercek vault'a dokunmadan izinli kokler,
 * alan disi dosyalar, wikilink, tablo, frontmatter ve proje oturum basliklari kurulur.
 * Kullanim: const vault = okumaVaultKur(dizin); sonra KOKPIT_VAULT=vault.
 */
const fs = require('fs');
const path = require('path');

const COMPANION = '\u{1F52E} 850-Companion';
const PROJELER = '\u{1F3F0} 300-Projects';

function yaz(kok, goreli, metin, mtime) {
  const tam = path.join(kok, ...goreli.split('/'));
  fs.mkdirSync(path.dirname(tam), { recursive: true });
  fs.writeFileSync(tam, metin, 'utf8');
  if (mtime) fs.utimesSync(tam, mtime / 1000, mtime / 1000);
  return tam;
}

function okumaVaultKur(dizin) {
  const kok = path.join(dizin, 'vault');
  const simdi = Date.now();
  const gun = 86400000;
  const bugun = new Date(simdi);
  const t = (d) => d.toISOString().slice(0, 10);
  const dun = new Date(simdi - gun);

  yaz(
    kok,
    COMPANION + '/Last-Session.md',
    '---\ntitle: Last-Session\ntype: memory\ntags: [companion, sureklilik]\nupdated: ' +
      t(bugun) +
      '\n---\n\n# Son Oturum\n\n## Session: test\n**Yapılan:** okuyucu denendi. Bak [[kanit-standardi]] ve [[Yok-Boyle-Not]].\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n\n<script>window.__xss = 1</script>\n\n`[[kod-icinde]]`\n'
  );
  yaz(kok, COMPANION + '/Threads.md', '# Threads\n\n- açık iş\n', simdi - 10 * gun);
  yaz(kok, COMPANION + '/Arsiv-Last-Session.md', '# Arşiv\n', simdi - 20 * gun);
  yaz(
    kok,
    'daily/' + t(bugun) + '.md',
    '# Günlük Log: ' +
      t(bugun) +
      '\n\n## Oturumlar\n\n### Oturum (09:10) — Ornek-Proje\n\n## Bağlam\n- Bağlam maddesi\n\n## Alınan Kararlar\n- **Karar bir** alındı\n- Karar iki\n\n## Yapılacaklar\n- [ ] İş bir\n\n### Oturum (10:20) — Diger\n\n## Alınan Kararlar\n- başka\n'
  );
  yaz(kok, 'daily/' + t(dun) + '.md', '# Günlük Log\n\n### Oturum (08:00) — Ornek-Proje\n\n## Alınan Kararlar\n- eski karar\n', simdi - gun);
  yaz(kok, 'knowledge/index.md', '# Bilgi Tabanı İndeksi\n\n| Makale |\n| --- |\n| [Kanıt](concepts/kanit-standardi.md) |\n');
  yaz(kok, 'knowledge/concepts/kanit-standardi.md', '---\ntitle: Kanıt Standardı\n---\n\n# Kanıt Standardı\n\n## Ayrıntı\n\nGeri dön: [[index]].\n');
  yaz(kok, PROJELER + '/Ornek-Proje/notes/rapor.md', '# Örnek Rapor\n\nmetin\n');
  yaz(kok, PROJELER + '/Ornek-Proje/.gizli/sir.md', '# gizli\n');
  // Alan disi: kokte ve .claude altinda; okuyucu bunlari asla dondurmemeli.
  yaz(kok, 'CLAUDE.md', '# kok dosyasi\n');
  yaz(kok, '.claude/scripts/kokpit-projeler.json', JSON.stringify({ projeler: [{ ad: 'Ornek-Proje', yol: '~/x' }, { ad: 'Bos-Proje', yol: '~/y' }] }));
  yaz(kok, '\u{1F510} 400-Vault/sifre.md', '# gizli\n');
  return kok;
}

module.exports = { okumaVaultKur, COMPANION, PROJELER };
