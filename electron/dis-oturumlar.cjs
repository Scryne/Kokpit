// Kokpit disinda acilan claude oturumlari (v2.6). Claude Code calisan her etkilesimli oturumu
// ~/.claude/sessions/<pid>.json'a yazar (olculdu 2026-10-04, 2.1.289): cwd, sessionId, name,
// status (busy | shell | idle | waiting — ikili dosyadaki sema), statusUpdatedAt. Ada bu kaydi
// salt okur; terminalden ya da VS Code'dan acilan oturumlar da gorunur.
//
// Kokpit'in kendi oturumlari da bu kayitta: onlari `--session-id` kimliginden tanir ve atlar
// (renderer'in oturum listesi kimligi tasir). Olu surecin dosyasi kalabilir: pid yasamiyorsa atlanir.
// Dosyaya yazilmaz, silinmez — kayit Claude Code'un.

const fs = require('fs');
const os = require('os');
const path = require('path');

const DIZIN = process.env.KOKPIT_CLAUDE_OTURUMLAR || path.join(os.homedir(), '.claude', 'sessions');
const DURUMLAR = { busy: 'calisiyor', shell: 'calisiyor', waiting: 'bekliyor', idle: 'hazir' };

function yasiyor(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    // EPERM: surec var ama sinyal izni yok (baska kullanici) — yine de yasiyor.
    return e.code === 'EPERM';
  }
}

/**
 * @param {Set<string>} haric Kokpit'in kendi claude oturum kimlikleri
 * @returns {{ pid: number, ad: string, yol: string, durum: string, degisti: number | null, baslangic: number | null }[]}
 */
function oku(haric) {
  let adlar;
  try {
    adlar = fs.readdirSync(DIZIN);
  } catch {
    return [];
  }
  const sonuc = [];
  for (const ad of adlar) {
    if (!/^\d+\.json$/.test(ad)) continue;
    let k;
    try {
      k = JSON.parse(fs.readFileSync(path.join(DIZIN, ad), 'utf8'));
    } catch {
      continue; // yazilirken okundu; sonraki turda
    }
    if (!k || !Number.isInteger(k.pid) || typeof k.cwd !== 'string') continue;
    if (k.kind && k.kind !== 'interactive') continue; // claude -p (hook'larin ozetleyicisi) sayilmaz
    if (typeof k.sessionId === 'string' && haric.has(k.sessionId)) continue;
    if (k.pid === process.pid || !yasiyor(k.pid)) continue;
    sonuc.push({
      pid: k.pid,
      ad: path.basename(k.cwd) || k.cwd,
      yol: k.cwd,
      durum: DURUMLAR[k.status] || 'hazir',
      degisti: Number(k.statusUpdatedAt) || Number(k.updatedAt) || null,
      baslangic: Number(k.startedAt) || null,
    });
  }
  return sonuc.sort((a, b) => (a.baslangic ?? 0) - (b.baslangic ?? 0)).slice(0, 12);
}

module.exports = { oku, DIZIN };
