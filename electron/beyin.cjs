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

/**
 * Acik oturumun bağlam buyuklugu: transcript'in sonundaki ana ajan (sidechain degil) asistan
 * mesajinin girdi toplami (input + cache yazma + cache okuma) = modele o turda giden bağlam.
 * Yalniz dosyanin son 512 KB'i okunur; 3 MB'lik transcript'te her yoklama tum dosyayi okumaz.
 */
const KUYRUK_BAYT = 512 * 1024;

function oturumBaglami(yol, baslangicMs) {
  const t = transcriptBul(yol, baslangicMs);
  if (!t) return null;
  const dosya = path.join(PROJELER, slug(yol), t.id + '.jsonl');
  let metin;
  try {
    const fd = fs.openSync(dosya, 'r');
    try {
      const boy = fs.fstatSync(fd).size;
      const bas = Math.max(0, boy - KUYRUK_BAYT);
      const tampon = Buffer.alloc(boy - bas);
      fs.readSync(fd, tampon, 0, tampon.length, bas);
      metin = tampon.toString('utf8');
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return null;
  }
  const satirlar = metin.split('\n');
  for (let i = satirlar.length - 1; i >= 0; i--) {
    const s = satirlar[i];
    if (!s.includes('"assistant"') || !s.includes('"usage"')) continue;
    let k;
    try {
      k = JSON.parse(s);
    } catch {
      continue; // ilk satir yarim kesilmis olabilir
    }
    if (k.type !== 'assistant' || k.isSidechain) continue;
    const u = k.message && k.message.usage;
    if (!u) continue;
    const token =
      (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0);
    return { token, model: String(k.message.model || '') };
  }
  return null;
}

module.exports = { oturumBeyinDurumu, oturumBaglami, slug };
