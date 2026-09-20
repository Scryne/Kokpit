// "Bu oturum beyne dustu mu?" — Kokpit'in defteri (ne zaman, hangi klasor) ile
// Claude Code'un transcript'i ve vault'un flush durumu birlestirilir.
//
// Zincir: oturum kapandi -> ~/.claude/projects/<slug>/<session>.jsonl (baslangictan sonra
// dogan dosya) -> vault .claude/scripts/.state/flush-<sha256(session)>.json
//   yok + transcript taze  -> 'bekliyor'   (hook henuz calismadi ya da claude -p suruyor)
//   yok + transcript eski  -> 'dusmedi'    (flush hic tetiklenmedi: sessiz kayip)
//   inflight               -> 'bekliyor'
//   ok:appended            -> 'dustu'
//   ok:flush-bos / kisa    -> 'bos'        (kalici deger yok, normal)
//   error                  -> 'hata'
// Okuma-yalniz: hicbir dosyaya yazmaz.
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { VAULT } = require('./config.cjs');

const PROJELER = path.join(os.homedir(), '.claude', 'projects');
const FLUSH_STATE = path.join(VAULT, '.claude', 'scripts', '.state');
const TAZE_MS = 4 * 60 * 1000;

/** durum.py / flush_kapsama.py ile ayni: alfasayisal olmayan her karakter '-'. */
function slug(yol) {
  return String(yol).replace(/[^A-Za-z0-9]/g, '-');
}

function flushDurumu(sessionId) {
  const key = crypto.createHash('sha256').update(sessionId, 'utf8').digest('hex');
  try {
    const v = JSON.parse(fs.readFileSync(path.join(FLUSH_STATE, `flush-${key}.json`), 'utf8'));
    return { status: String(v.status || '?'), detail: String(v.detail || '') };
  } catch {
    return null;
  }
}

/**
 * Baslangictan sonra dogmus en yakin transcript. Ayni klasorde iki bolme acikken ikisi de
 * ayni dizine yazar; "baslangica en yakin ve ondan sonra dogan" en iyi tahmindir.
 */
function transcriptBul(yol, baslangicMs) {
  const dizin = path.join(PROJELER, slug(yol));
  let aday = null;
  let dosyalar;
  try {
    dosyalar = fs.readdirSync(dizin);
  } catch {
    return null;
  }
  for (const ad of dosyalar) {
    if (!ad.endsWith('.jsonl')) continue;
    let st;
    try {
      st = fs.statSync(path.join(dizin, ad));
    } catch {
      continue;
    }
    // Dosya oturumla dogar; birthtime yoksa mtime ile idare edilir.
    const dogum = st.birthtimeMs || st.mtimeMs;
    if (dogum < baslangicMs - 60_000) continue;
    if (!aday || dogum < aday.dogum) aday = { id: ad.slice(0, -6), dogum, mtime: st.mtimeMs };
  }
  return aday;
}

function oturumBeyinDurumu(yol, baslangicMs) {
  const t = transcriptBul(yol, baslangicMs);
  if (!t) return 'yok';
  const f = flushDurumu(t.id);
  if (!f) return Date.now() - t.mtime < TAZE_MS ? 'bekliyor' : 'dusmedi';
  if (f.status === 'inflight') return 'bekliyor';
  if (f.status === 'ok') return f.detail === 'appended' ? 'dustu' : 'bos';
  return 'hata';
}

module.exports = { oturumBeyinDurumu, slug };
