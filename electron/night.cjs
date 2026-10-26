// Gece gorevi (night mode) durum makinesi. SAF: Electron, disk, zamanlayici yok.
// Girdi (state, event, now), cikti { state, actions }. Ana surec (night-host.cjs) eylemleri yurutur;
// scripts/test-night.cjs sahte saatle dogrudan sinar.
//
// Sekme basina: working -> (tur bitti, alt ajan yok, 60 sn sessiz, son sorudan 10 dk) ask -> asked
//   asked + Stop: son "GECE: BITTI" satiri -> confirmed + close; DEVAM / isaret yok -> working
//   BITTI ama arka planda alt ajan suruyor -> confirmed, close alt ajanlar bitince
//   working/asked, alt ajan yok, hic olay yok: tur bittiyse 60 dk, 'calisiyor' gorunuyorsa 180 dk
//     -> confirmed + close (ajan cevap vermiyor ya da limitte takildi). Olay ureten ajana dokunulmaz.
//   soru / devam mesaji teslim edilmediyse (ardindan hic olay yok) 2 dk'da bir yeniden
//   bekliyor + 20 dk hic olay yok + alt ajan yok -> nudge (Esc + metin; 20 dk'da en fazla bir).
//     Durum tek basina yetmez: izin onaylaninca etkinlik tur boyu 'bekliyor' kalir (denetim B1).
//   confirmed + SessionEnd, ya da herhangi bir durumda pty cikisi / elle kapatma -> closed
// Butun sekmeler closed -> done (bekci bilgisayari kapatir). Kaan'in karari, 2026-10-05.

const QUIET_MS = 60 * 1000;
const ASK_INTERVAL_MS = 10 * 60 * 1000;
const IDLE_CLOSE_MS = 60 * 60 * 1000;
const STUCK_CLOSE_MS = 180 * 60 * 1000;
const DELIVERY_MS = 2 * 60 * 1000;
const MAX_RESUME_TRIES = 15;
// Alt ajan sayisi yalniz hook olayiyla tazelenir; SubagentStop kacarsa sayi takili kalir. etkinlik.cjs'in
// ALT_AJAN_ZAMAN_ASIMI'yla ayni: bu kadar hic olay yoksa sayilmaz (yoksa gece hic bitmezdi, gate F1).
const SUBAGENT_STALE_MS = 15 * 60 * 1000;
const WAITING_MS = 20 * 60 * 1000;
const RESUME_WAIT_MS = 30 * 1000;
const MAX_NIGHT_MS = 12 * 60 * 60 * 1000;

const TEXT = {
  question:
    'Gece kontrolü (Kokpit): Gece görevin bitti mi? Bittiyse önce Last-Session ve devir notlarını yaz, sonra son satıra yalnız GECE: BITTI yaz. Sürüyorsa devam et ve son satıra GECE: DEVAM yaz.',
  nudge:
    'Gece kontrolü (Kokpit): Kaan uyuyor, cevap gelmeyecek. Soruyu kendin karara bağla ya da işi güvenli bir yerde bırak; bitince son satıra GECE: BITTI yaz.',
  resume:
    'Kokpit: bilgisayar yeniden başladı. Gece görevine kaldığın yerden devam et; bittiğinde son satıra GECE: BITTI yaz.',
};

// Turkce klavyede BİTTİ de yazilabilir; /i noktali I'yi kapsamaz.
const MARKER = /GECE:\s*(B[Iİıi]TT[Iİıi]|DEVAM)/i;

/** Son isaretli satirin karari: 'BITTI' | 'DEVAM' | null. */
function parseMarker(text) {
  if (typeof text !== 'string') return null;
  const lines = text.split(/\r?\n/);
  for (let i = lines.length - 1; i >= 0; i--) {
    const m = MARKER.exec(lines[i]);
    if (m) return /^d/i.test(m[1]) ? 'DEVAM' : 'BITTI';
  }
  return null;
}

function initial() {
  return { started: null, done: false, tabs: {} };
}

function newTab(ev, now) {
  return {
    id: ev.id,
    name: ev.name || ev.id,
    claude: ev.claude || null,
    transcript: null,
    state: 'working',
    status: null, // etkinlik durumu: bosta | calisiyor | bekliyor | bitti | kapandi
    subagents: 0,
    lastEvent: now,
    askedAt: null,
    nudgedAt: null,
    closePending: false,
    resumeAt: ev.resume ? now + RESUME_WAIT_MS : null,
    resumeSentAt: null,
    resumeTries: 0,
  };
}

const live = (s) => Object.values(s.tabs).some((t) => t.state !== 'closed');

// Arka planda alt ajan suruyorsa kapatma bekler (Esc + Ctrl+C onlari da oldururdu).
function close(t, actions) {
  t.state = 'confirmed';
  t.closePending = t.subagents > 0;
  if (!t.closePending) actions.push({ type: 'close', id: t.id });
}

function sendResume(t, now, actions) {
  t.resumeAt = null;
  t.resumeSentAt = now;
  t.resumeTries += 1;
  actions.push({ type: 'resume', id: t.id, text: TEXT.resume });
}

function closeTab(s, t, actions) {
  t.state = 'closed';
  if (!s.done && !live(s)) {
    s.done = true;
    actions.push({ type: 'done' });
  }
}

function step(prev, ev, now) {
  const s = structuredClone(prev || initial());
  const actions = [];
  const t = ev && ev.id ? s.tabs[ev.id] : null;
  switch (ev && ev.type) {
    case 'mark': {
      if (t && t.state !== 'closed') break;
      if (s.done) Object.assign(s, initial());
      if (Object.keys(s.tabs).length === 0) actions.push({ type: 'start' });
      if (!s.started) s.started = now;
      s.tabs[ev.id] = newTab(ev, now);
      break;
    }
    case 'unmark': // Kaan isareti kaldirdi: sekme listeden cikar. Gecenin canli sekmesi kalmadiysa iptal.
      if (!t) break;
      delete s.tabs[ev.id];
      if (!live(s)) return { state: initial(), actions: [{ type: 'cancel' }] };
      break;
    case 'cancel':
      if (!s.started) break;
      return { state: initial(), actions: [{ type: 'cancel' }] };
    case 'identity':
      if (t && ev.claude) t.claude = ev.claude;
      break;
    case 'hook': {
      if (!t || t.state === 'closed') break;
      t.lastEvent = now;
      if (typeof ev.transcript === 'string' && ev.transcript) t.transcript = ev.transcript;
      t.status = ev.status;
      t.subagents = ev.subagents || 0;
      t.resumeSentAt = null; // devam mesajindan sonra olay geldi: teslim edildi
      if (t.resumeAt !== null) sendResume(t, now, actions);
      if (ev.stop && t.state === 'asked') {
        if (parseMarker(ev.message) === 'BITTI') close(t, actions);
        else t.state = 'working';
      } else if (ev.status === 'kapandi' && t.state === 'confirmed') {
        closeTab(s, t, actions);
      } else if (t.closePending && t.subagents === 0) {
        t.closePending = false;
        actions.push({ type: 'close', id: t.id });
      }
      break;
    }
    case 'closed': // pty cikti ya da sekme kapandi (elle dahil)
      if (t && t.state !== 'closed') closeTab(s, t, actions);
      break;
    case 'tick':
      for (const x of Object.values(s.tabs)) {
        if (x.state === 'closed') continue;
        const silent = now - x.lastEvent;
        const subagents = silent >= SUBAGENT_STALE_MS ? 0 : x.subagents;
        if (x.state === 'confirmed') {
          if (x.closePending && subagents === 0) {
            x.closePending = false;
            actions.push({ type: 'close', id: x.id });
          }
          continue;
        }
        if (x.resumeAt !== null && now >= x.resumeAt) {
          sendResume(x, now, actions);
          continue;
        }
        if (x.resumeSentAt !== null && now - x.resumeSentAt >= DELIVERY_MS) {
          // Devam mesaji teslim edilmedi (sekme hazir degildi): tekrar; acilamayan sekme geceyi kilitlemez.
          if (x.resumeTries >= MAX_RESUME_TRIES) closeTab(s, x, actions);
          else sendResume(x, now, actions);
          continue;
        }
        if (x.state === 'asked' && x.lastEvent <= x.askedAt && now - x.askedAt >= DELIVERY_MS) {
          x.state = 'working'; // soru teslim edilmedi: bir sonraki turda yeniden sorulur
          x.askedAt = null;
        }
        if (
          x.state === 'working' && x.status === 'bitti' && subagents === 0 &&
          now - x.lastEvent >= QUIET_MS && (x.askedAt === null || now - x.askedAt >= ASK_INTERVAL_MS)
        ) {
          x.state = 'asked';
          x.askedAt = now;
          actions.push({ type: 'ask', id: x.id, text: TEXT.question });
        } else if (subagents === 0 && silent >= (x.status === 'calisiyor' ? STUCK_CLOSE_MS : IDLE_CLOSE_MS)) {
          close(x, actions);
        } else if (
          x.status === 'bekliyor' && subagents === 0 && silent >= WAITING_MS &&
          (x.nudgedAt === null || now - x.nudgedAt >= WAITING_MS)
        ) {
          x.nudgedAt = now;
          actions.push({ type: 'nudge', id: x.id, text: TEXT.nudge });
        }
      }
      break;
    default:
      break;
  }
  return { state: s, actions };
}

/** night.json icerigi (scripts/night_guard.py sozlesmesi). */
function toFile(s, now) {
  return {
    version: 1,
    heartbeat: now,
    started: s.started,
    done: s.done,
    tabs: Object.values(s.tabs).map((t) => ({
      id: t.id, name: t.name, claude: t.claude, transcript: t.transcript, state: t.state,
    })),
  };
}

/**
 * Acilista okunan night.json: { resume: tabs } | { finish: true, started } | { clear: true }.
 * Onay vermis (confirmed) sekme devam ettirilmez; sekmeler vardi ve hepsi onayli/kapali ise gece
 * bitmistir (yeniden baslatma kapanisi kesmis): finish -> done, bekci kapatir.
 */
function resumePlan(file, now) {
  if (!file || typeof file !== 'object' || file.done || !Number.isFinite(file.started)) return { clear: true };
  if (now - file.started >= MAX_NIGHT_MS) return { clear: true };
  const all = (Array.isArray(file.tabs) ? file.tabs : []).filter((t) => t && typeof t.id === 'string');
  const tabs = all.filter((t) => t.state !== 'closed' && t.state !== 'confirmed');
  if (tabs.length > 0) return { resume: tabs, started: file.started };
  return all.length > 0 ? { finish: true, started: file.started } : { clear: true };
}

module.exports = {
  QUIET_MS, ASK_INTERVAL_MS, IDLE_CLOSE_MS, STUCK_CLOSE_MS, DELIVERY_MS, MAX_RESUME_TRIES, SUBAGENT_STALE_MS, WAITING_MS, RESUME_WAIT_MS, MAX_NIGHT_MS, TEXT,
  parseMarker, initial, step, toFile, resumePlan,
};
