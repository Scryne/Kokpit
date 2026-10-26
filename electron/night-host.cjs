// Gece gorevi, ana surec tarafi: night.cjs'in eylemlerini yurutur. Oturuma yazma ve guvenli
// kapatma renderer'da (PTY baglantisi orada): burasi yalniz `night:action` gonderir. Diskte tek
// dosya night.json (bekci sozlesmesi, scripts/night_guard.py), iptalde night-cancel.
// Electron burada require edilmez: main `app` ve `powerSaveBlocker`i verir, test vermez.

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const night = require('./night.cjs');
const { gonderIstegi } = require('./gonder-istegi.cjs');

const TICK_MS = 15 * 1000;
const BEAT_MS = 60 * 1000;
const GUARD_CHECK_MS = 5 * 60 * 1000;
const GUARD_STALE_MS = 3 * 60 * 1000;
const GUARD_SCRIPT = path.join(__dirname, '..', 'scripts', 'night_guard.py');
// DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP
const LAUNCHER = 'import subprocess,sys; subprocess.Popen(sys.argv[1:], close_fds=True, creationflags=0x208)';

/** Atomik: tmp + rename (bekci yarim dosya okumasin). */
function writeNightFile(dir, file) {
  fs.mkdirSync(dir, { recursive: true });
  const tmp = path.join(dir, 'night.json.tmp');
  fs.writeFileSync(tmp, JSON.stringify(file));
  fs.renameSync(tmp, path.join(dir, 'night.json'));
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function remove(file) {
  try {
    fs.unlinkSync(file);
  } catch {
    /* zaten yok */
  }
}

/** PATH'teki pythonw (Store takma adi degil), yoksa C:\Python313. */
function pythonw() {
  for (const d of (process.env.PATH || '').split(path.delimiter)) {
    if (!d || /WindowsApps/i.test(d)) continue;
    const p = path.join(d, 'pythonw.exe');
    if (fs.existsSync(p)) return p;
  }
  return path.join('C:\\', 'Python313', 'pythonw.exe');
}

/**
 * @param o.dir      KOKPIT_DIZIN
 * @param o.send     (kanal, veri) => renderer'a
 * @param o.log
 * @param o.app, o.powerSaveBlocker  Electron (yoksa uyku engeli ve oturum acilisi atlanir)
 * @param o.test     test kabugu: bekci --dry-run, oturum acilisi ayarina dokunulmaz
 */
function createNightHost(o) {
  const nightFile = path.join(o.dir, 'night.json');
  const cancelFile = path.join(o.dir, 'night-cancel');

  // night.json her silinisinde night-cancel da yazilir: hala yasayan bekci onbellekteki kopyaya
  // bakip "Kokpit sustu" diye kullanilan makineyi kapatmasin (gate F2). Yeni gece 'start'ta siler.
  function endNightFile() {
    try {
      fs.writeFileSync(cancelFile, String(Date.now()));
    } catch (e) {
      o.log('gece: night-cancel yazilamadi: ' + e.message);
    }
    remove(nightFile);
  }
  let state = night.initial();
  let resumeList = [];
  let resumeIds = new Set(); // acilista geri acilacak eski sekme kimlikleri (geri yukleme seridinden dusulur)
  let timers = [];
  let blocker = null;
  let lastWrite = { body: '', at: 0 };
  let lastView = '';

  function loginItem(on) {
    if (!o.app || o.test) return;
    try {
      const vbs = path.join(__dirname, '..', 'scripts', 'kokpit-sessiz.vbs');
      o.app.setLoginItemSettings({
        openAtLogin: on,
        path: path.join(process.env.SystemRoot || path.join('C:\\', 'Windows'), 'System32', 'wscript.exe'),
        args: ['"' + vbs + '"', '--night-resume'],
      });
    } catch (e) {
      o.log('gece: oturum acilisi ayari yazilamadi: ' + e.message);
    }
  }

  function keepAwake(on) {
    if (!o.powerSaveBlocker) return;
    if (on && blocker === null) blocker = o.powerSaveBlocker.start('prevent-app-suspension');
    if (!on && blocker !== null) {
      o.powerSaveBlocker.stop(blocker);
      blocker = null;
    }
  }

  function spawnGuard() {
    try {
      // libuv her zaman bInheritHandles=TRUE ile acar: bekci Electron'un miras alinabilir tutamaclarini
      // (soketler, PTY sunucusunun borulari) gece boyu tutardi. Kisa omurlu bir pythonw, bekciyi
      // Popen ile tutamac mirasi olmadan (close_fds) acar ve hemen cikar.
      const py = pythonw();
      const args = [py, GUARD_SCRIPT, '--dir', o.dir, ...(o.test ? ['--dry-run'] : [])];
      const c = spawn(py, ['-c', LAUNCHER, ...args], { detached: true, stdio: 'ignore', windowsHide: true });
      c.on('error', (e) => o.log('gece: bekci baslatilamadi: ' + e.message));
      c.unref();
      o.log('gece: bekci baslatildi');
    } catch (e) {
      o.log('gece: bekci baslatilamadi: ' + e.message);
    }
  }

  function checkGuard() {
    const g = readJson(path.join(o.dir, 'night-guard.json'));
    if (!g || !(Date.now() - g.heartbeat < GUARD_STALE_MS)) {
      o.log('gece: bekci kalbi bayat, yeniden baslatiliyor');
      spawnGuard();
    }
  }

  function persist() {
    if (!state.started) return;
    const now = Date.now();
    const file = night.toFile(state, now);
    const body = JSON.stringify({ ...file, heartbeat: 0 });
    if (body === lastWrite.body && now - lastWrite.at < BEAT_MS) return;
    try {
      writeNightFile(o.dir, file);
      lastWrite = { body, at: now };
    } catch (e) {
      o.log('gece: night.json yazilamadi: ' + e.message);
    }
  }

  function view() {
    return {
      active: state.started !== null,
      done: state.done,
      tabs: Object.fromEntries(Object.values(state.tabs).map((t) => [t.id, t.state])),
    };
  }

  function push() {
    const v = view();
    const s = JSON.stringify(v);
    if (s === lastView) return;
    lastView = s;
    o.send('night:state', v);
  }

  function stopTimers() {
    for (const t of timers) clearInterval(t);
    timers = [];
  }

  function run(a) {
    if (a.type === 'start') {
      remove(cancelFile);
      spawnGuard();
      keepAwake(true);
      loginItem(true);
      stopTimers();
      timers = [
        setInterval(() => apply({ type: 'tick' }), TICK_MS),
        setInterval(checkGuard, GUARD_CHECK_MS),
      ];
      o.log('gece: basladi');
    } else if (a.type === 'done') {
      // Bekci kapatmayi yapar; Kokpit kalbi ve bekci nobeti makine kapanana kadar surer.
      keepAwake(false);
      loginItem(false);
      o.log('gece: butun sekmeler kapandi, bekciye done');
    } else if (a.type === 'cancel') {
      stopTimers();
      endNightFile();
      keepAwake(false);
      loginItem(false);
      o.log('gece: iptal');
    } else {
      // ask / nudge / resume: tek satir, gonder-istegi denetiminden gecer; close: guvenli kapat.
      if (a.type !== 'close' && !gonderIstegi({ id: a.id, tur: 'metin', metin: a.text })) return;
      o.log('gece: ' + a.type + ' -> ' + a.id);
      o.send('night:action', a);
      if (a.type === 'resume') spawnGuard();
    }
  }

  function apply(ev) {
    const r = night.step(state, ev, Date.now());
    state = r.state;
    persist();
    for (const a of r.actions) run(a);
    push();
  }

  /** Acilis: gecenin yarim kalmis sekmeleri (12 sa icinde, done degil) ya da temizlik. */
  function boot(argv) {
    const plan = night.resumePlan(readJson(nightFile), Date.now());
    if (plan.clear) {
      endNightFile();
      loginItem(false);
      return;
    }
    if (plan.finish) {
      // Butun sekmeler onay vermisti; yeniden baslatma kapanisi kesti. Gece bitti: bekci kapatir.
      state = { ...night.initial(), started: plan.started, done: true };
      persist();
      loginItem(false);
      spawnGuard();
      o.log('gece: yeniden baslatmadan once butun sekmeler onaylamisti, bekciye done');
      return;
    }
    state = { ...night.initial(), started: plan.started };
    resumeList = plan.resume;
    resumeIds = new Set(resumeList.map((t) => t.id));
    o.log('gece: yarim kalan gece (' + resumeList.length + ' sekme)' + (argv.includes('--night-resume') ? ', oturum acilisindan' : ''));
  }

  /** Bir kez: geri acilacak sekmeler, yol defterden. Acilamayan kalmadiysa gece temizlenir. */
  function takeResume(lookup) {
    if (resumeList.length === 0) return [];
    const list = resumeList
      .map((t) => {
        const k = lookup(t.id);
        return k && k.yol ? { ad: k.ad || t.name, yol: k.yol, claude: t.claude || k.claude || null } : null;
      })
      .filter(Boolean);
    resumeList = [];
    if (list.length === 0 && Object.keys(state.tabs).length === 0) {
      state = night.initial();
      endNightFile();
      loginItem(false);
    }
    return list;
  }

  return {
    boot,
    takeResume,
    resumeIds: () => resumeIds,
    toggle: (id, on, meta) => apply(on ? { type: 'mark', id, ...meta } : { type: 'unmark', id }),
    cancel: () => apply({ type: 'cancel' }),
    closed: (id) => state.tabs[id] && apply({ type: 'closed', id }),
    identity: (id, claude) => state.tabs[id] && apply({ type: 'identity', id, claude }),
    hook: (id, durum, govde, sinyal) => {
      if (!state.tabs[id]) return;
      apply({
        type: 'hook',
        id,
        status: durum.durum,
        subagents: Object.keys(durum.altlar || {}).length,
        stop: sinyal === 'bitti',
        message: govde.last_assistant_message,
        transcript: govde.transcript_path,
      });
    },
    view,
  };
}

module.exports = { createNightHost, writeNightFile };
