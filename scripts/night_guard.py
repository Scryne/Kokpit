r"""Night guard: shuts the computer down once Kokpit's night tabs are finished (Kaan's rule: a night job
ends with a shutdown, checked or not; the job itself is never cut).

Started detached by Kokpit (pythonw, its own process: a Kokpit crash cannot stop the shutdown).
Contract, written by Kokpit (atomic, tmp + rename):

  <dir>/night.json  {"version": 1, "heartbeat": ms, "started": ms, "done": bool,
                     "tabs": [{"id", "name", "claude": uuid|null, "transcript": path|null,
                               "state": "working"|"asked"|"confirmed"|"closed"}]}
  <dir>/night-cancel  exists -> Kaan cancelled: no shutdown, a pending one is aborted, the guard exits.
  night.json removed after the guard has read it -> same as cancel (Kokpit ended the night; a cached copy
  must never shut down a machine in use). A torn file still falls back to the previous good copy.

The guard writes <dir>/night-guard.json {"heartbeat": ms, "pid", "phase"} so Kokpit can restart it, and
logs to <dir>/night-guard.log.

Finished when: night.json says done, or every tab is closed. If Kokpit's heartbeat is older than
KOKPIT_STALE_MIN (Kokpit crashed), a tab also counts as finished when its transcript has no event for
IDLE_MIN minutes. Event time comes from the "timestamp" fields inside the jsonl, never file mtime:
Claude Code touches transcripts without adding events (5 Oct 2026 night, the idle rule never fired).

After the shutdown call the guard keeps checking: still alive after RETRY_MIN -> forced shutdown, again
every RETRY_MIN, until the machine is down or night-cancel appears. night.json is still read: if the
verdict flips back (Kaan started a new night after done, or Kokpit's heartbeat came back) the pending
shutdown is aborted and the watch goes on.

  pythonw night_guard.py --dir C:\Users\kaan\.kokpit [--dry-run] [--once]
"""
import argparse
import ctypes
import json
import os
import re
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

FAST = os.environ.get("NIGHT_GUARD_FAST") == "1"  # tests: seconds instead of minutes
POLL_S = 0.2 if FAST else 30
KOKPIT_STALE_MIN = 15
IDLE_MIN = 60
SHUTDOWN_DELAY_S = 300
RETRY_MIN = 2 / 60 if FAST else 10
BEAT_LOG_MIN = 30
PROJECTS = Path.home() / ".claude" / "projects"
TS = re.compile(rb'"timestamp":"(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d)')


class Guard:
    def __init__(self, folder, dry):
        self.dir, self.dry = Path(folder), dry
        self.state_file = self.dir / "night.json"
        self.cancel_file = self.dir / "night-cancel"
        self.own_file = self.dir / "night-guard.json"
        self.log_file = self.dir / "night-guard.log"
        self.last_good = None
        self.phase = "watching"

    def log(self, msg):
        try:
            with self.log_file.open("a", encoding="utf-8") as f:
                f.write(f"{datetime.now():%Y-%m-%d %H:%M:%S} {msg}\n")
        except OSError:
            pass

    def beat(self):
        try:
            tmp = self.own_file.with_suffix(".tmp")
            tmp.write_text(json.dumps({"heartbeat": int(time.time() * 1000), "pid": os.getpid(),
                                       "phase": self.phase}), encoding="utf-8")
            os.replace(tmp, self.own_file)
        except OSError as e:
            self.log(f"own heartbeat not written: {e!r}")

    def read_state(self):
        """Last readable night.json; a torn or missing file falls back to the previous good copy."""
        try:
            self.last_good = json.loads(self.state_file.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            pass
        return self.last_good

    def cancelled(self):
        return self.cancel_file.exists()

    @staticmethod
    def transcript_of(tab):
        if tab.get("transcript"):
            return Path(tab["transcript"])
        if tab.get("claude"):
            hits = list(PROJECTS.glob(f"*/{tab['claude']}.jsonl"))
            return hits[0] if hits else None
        return None

    @staticmethod
    def last_event(path):
        """Newest event time (epoch s) in the transcript tail; 0 when unreadable."""
        try:
            with path.open("rb") as f:
                f.seek(max(0, path.stat().st_size - 262144))
                stamps = TS.findall(f.read())
            return max(datetime.fromisoformat(s.decode()).replace(tzinfo=timezone.utc).timestamp()
                       for s in stamps) if stamps else 0.0
        except (OSError, ValueError):
            return 0.0

    def verdict(self, state, now):
        """(finished, reason, per-tab notes)."""
        if not state:
            return False, "no night.json yet", []
        tabs = state.get("tabs") or []
        if state.get("done"):
            return True, "Kokpit marked done", []
        if tabs and all(t.get("state") == "closed" for t in tabs):
            return True, "all tabs closed", []
        kokpit_age = (now - state.get("heartbeat", 0) / 1000) / 60
        notes, finished = [], 0
        for t in tabs:
            if t.get("state") == "closed":
                finished += 1
                notes.append(f"{t.get('name')} closed")
                continue
            path = self.transcript_of(t)
            idle = (now - self.last_event(path)) / 60 if path else float("inf")
            notes.append(f"{t.get('name')} {t.get('state')} idle {idle:.0f} min")
            if kokpit_age >= KOKPIT_STALE_MIN and idle >= IDLE_MIN:
                finished += 1
        if kokpit_age >= KOKPIT_STALE_MIN and tabs and finished == len(tabs):
            return True, f"Kokpit silent {kokpit_age:.0f} min, every tab idle >= {IDLE_MIN} min", notes
        return False, f"Kokpit heartbeat {kokpit_age:.0f} min ago", notes

    def shutdown(self, forced):
        cmd = (["shutdown", "/s", "/f", "/t", "0"] if forced else
               ["shutdown", "/s", "/t", str(SHUTDOWN_DELAY_S), "/c",
                "Kokpit gece isi bitti. Iptal: shutdown /a ve Kokpit'te gece modunu kapat"])
        if self.dry:
            self.log(f"[dry-run] would run: {' '.join(cmd)}")
            return
        r = subprocess.run(cmd, capture_output=True, text=True)
        self.log(f"{' '.join(cmd[:3])} -> exit {r.returncode} {(r.stderr or r.stdout).strip()}")

    def abort(self, why="night-cancel found", exits=True):
        if self.dry:
            self.log("[dry-run] would run: shutdown /a")
        else:
            subprocess.run(["shutdown", "/a"], capture_output=True)
        self.log(f"{why}: shutdown aborted{', guard exits' if exits else ''}")

    def run(self, once):
        self.log(f"start pid {os.getpid()}{' (dry-run)' if self.dry else ''}")
        if not self.dry:
            ctypes.windll.kernel32.SetThreadExecutionState(0x80000000 | 0x00000001)
        last_beat_log, shutdown_at = 0.0, None
        while True:
            try:
                now = time.time()
                self.beat()
                if self.cancelled():
                    self.abort()
                    return "cancelled"
                if self.last_good is not None and not self.state_file.exists():
                    self.abort("night.json removed")
                    return "cancelled"
                finished, reason, notes = self.verdict(self.read_state(), now)
                if shutdown_at is not None and not finished:
                    self.abort(f"night active again ({reason})", exits=False)
                    self.phase, shutdown_at = "watching", None
                if shutdown_at is None:
                    if once or now - last_beat_log >= BEAT_LOG_MIN * 60:
                        self.log(f"heartbeat: {reason}; {', '.join(notes) or '-'}")
                        last_beat_log = now
                    if finished:
                        self.log(f"finished: {reason}")
                        self.phase = "shutting-down"
                        self.shutdown(forced=False)
                        shutdown_at = now
                        if once:
                            return "shutdown"
                    elif once:
                        return "waiting"
                elif now - shutdown_at >= RETRY_MIN * 60:
                    self.log(f"still running {RETRY_MIN} min after the shutdown call: forcing")
                    self.shutdown(forced=True)
                    shutdown_at = now
            except Exception as e:  # one bad pass never ends the watch (and never shuts down by itself)
                self.log(f"pass failed: {e!r}")
                if once:
                    return "error"
            time.sleep(POLL_S)


def single_instance(folder):
    """Lock file held open for the guard's lifetime; a second guard exits."""
    import msvcrt
    f = open(Path(folder) / "night-guard.lock", "a+")
    try:
        msvcrt.locking(f.fileno(), msvcrt.LK_NBLCK, 1)
        return f
    except OSError:
        f.close()
        return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", required=True)
    ap.add_argument("--dry-run", action="store_true", help="no shutdown, no keep-awake (only logged)")
    ap.add_argument("--once", action="store_true", help="one pass, print the outcome (tests)")
    a = ap.parse_args()
    Path(a.dir).mkdir(parents=True, exist_ok=True)
    lock = single_instance(a.dir)
    if not lock:
        print("already running")
        return
    outcome = Guard(a.dir, a.dry_run).run(a.once)
    print(outcome)


if __name__ == "__main__":
    main()
