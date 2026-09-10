// PTY sunucusu — AYRI, DUZ NODE SURECI.
//
// Neden ayri: node-pty native modul. Electron'un icinde calissa her Electron surumunde
// ABI uyusmazligi ve electron-rebuild derdi cikardi. Burada duz Node'a karsi bir kez
// derlenir ve Electron'un ABI'sini hic gormez. Ikinci fayda: bu surec cokerse pencere
// hayatta kalir. (Faz 0 spike'inda dogrulandi.)
//
// Ebeveyn (Electron main) bu dosyayi `spawn('node', [...])` ile baslatir, portu
// stdout'tan okur, kapanirken stdin'i kapatir -> bu surec temiz oler, yetim kalmaz.

const { WebSocketServer } = require('ws');
const pty = require('node-pty');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawnSync } = require('child_process');

const TOKEN = process.env.KOKPIT_PTY_TOKEN || '';
const LOG_DOSYA = path.join(os.homedir(), '.kokpit', 'pty-server.log');

fs.mkdirSync(path.dirname(LOG_DOSYA), { recursive: true });
function log(mesaj) {
  try {
    fs.appendFileSync(LOG_DOSYA, `[${new Date().toISOString()}] [pty ${process.pid}] ${mesaj}\n`);
  } catch { /* log yazamamak sunucuyu durdurmaz */ }
}

if (!TOKEN) {
  log('FAIL token yok, cikiliyor');
  process.exit(2);
}

// KURAL: Windows yollari path.resolve ile uretilir, string literal yazilmaz.
const KABUK = path.resolve(process.env.ComSpec || 'C:/WINDOWS/system32/cmd.exe');
const POWERSHELL_5 = path.resolve(
  path.join(process.env.SystemRoot || 'C:/WINDOWS', 'System32/WindowsPowerShell/v1.0/powershell.exe')
);

/**
 * pwsh 7 varsa ONCELIKLI. Sebep: Scryne'in PowerShell profili
 * `Documents/PowerShell/profile.ps1` yolunda ve orayi yalnizca pwsh 7 okuyor.
 * powershell.exe 5.1 `Documents/WindowsPowerShell/` bakiyor -> Kokpit'in kendi
 * terminallerinde `durum` ve `kokpit` komutlari tanimsiz kaliyordu.
 *
 * Tespit PATH uzerinden yapilir, dosya varligiyla DEGIL: WindowsApps altindaki
 * pwsh.exe bir uygulama-yurutme takma adi (sifir baytlik reparse point) ve
 * fs.existsSync onun icin yanlis negatif donuyor.
 */
function pwshBul() {
  try {
    const r = spawnSync('where', ['pwsh.exe'], { encoding: 'utf8', windowsHide: true });
    if (r.status !== 0) return null;
    // Not: satir ayirici kacis dizisi yerine kod noktasiyla yaziliyor.
    const SATIR_SONU = String.fromCharCode(10);
    const ilk = String(r.stdout || '')
      .split(SATIR_SONU)
      .map((x) => x.trim())
      .filter(Boolean)[0];
    return ilk ? path.resolve(ilk) : null;
  } catch {
    return null;
  }
}

const POWERSHELL = pwshBul() ?? POWERSHELL_5;

const wss = new WebSocketServer({ host: '127.0.0.1', port: 0 });

wss.on('listening', () => {
  const port = wss.address().port;
  log('dinliyor port=' + port);
  // Ebeveyn bu satiri bekliyor.
  process.stdout.write(JSON.stringify({ hazir: true, port }) + '\n');
});

wss.on('error', (e) => {
  log('FAIL sunucu hatasi: ' + e.message);
  process.stdout.write(JSON.stringify({ hazir: false, hata: e.message }) + '\n');
  process.exit(1);
});

wss.on('connection', (ws, istek) => {
  // Yerel bir WS portu, tarayicidaki herhangi bir sayfanin da ulasabilecegi bir yuzeydir.
  // Token olmadan surec baslatilamaz.
  let gelenToken = '';
  try {
    gelenToken = new URL(istek.url, 'http://127.0.0.1').searchParams.get('token') || '';
  } catch { /* bozuk url -> bos token */ }

  if (gelenToken !== TOKEN) {
    log('reddedildi: token uyusmadi');
    ws.close(4401, 'yetkisiz');
    return;
  }

  let p = null;

  const gonder = (nesne) => {
    if (ws.readyState === ws.OPEN) {
      try { ws.send(JSON.stringify(nesne)); } catch { /* kapaniyor */ }
    }
  };

  ws.on('message', (ham) => {
    let m;
    try { m = JSON.parse(ham.toString()); } catch { return; }

    if (m.t === 'ac' && !p) {
      const cwd = typeof m.cwd === 'string' ? path.resolve(m.cwd) : os.homedir();
      if (!fs.existsSync(cwd)) {
        log('FAIL cwd yok: ' + cwd);
        gonder({ t: 'hata', mesaj: 'Klasör bulunamadı: ' + cwd });
        return;
      }

      // Karttan "Baslat": o klasorde dogrudan claude. Kabuk sarmalayici olarak kaliyor ki
      // claude cikinca terminal olmesin, kullanici ayni yerde calismaya devam edebilsin.
      const claudeIle = m.komut === 'claude';
      const dosya = claudeIle ? POWERSHELL : KABUK;
      const argumanlar = claudeIle ? ['-NoLogo', '-NoExit', '-Command', 'claude'] : [];

      try {
        p = pty.spawn(dosya, argumanlar, {
          name: 'xterm-256color',
          cols: Number(m.cols) || 100,
          rows: Number(m.rows) || 30,
          cwd,
          env: process.env,
        });
      } catch (e) {
        log('FAIL pty acilamadi: ' + e.message);
        gonder({ t: 'hata', mesaj: 'Terminal açılamadı: ' + e.message });
        return;
      }

      // pid'i burada sabitliyoruz: onExit'e kadar p null'lanmis olabiliyor
      // (ws.close handler'i once kosuyor) ve log kor kaliyordu.
      const pid = p.pid;
      log(`pty acildi pid=${pid} cwd=${cwd} komut=${claudeIle ? 'claude' : 'kabuk'} kabuk=${path.basename(dosya)}`);
      gonder({ t: 'hazir', pid });

      p.onData((d) => gonder({ t: 'veri', d }));
      p.onExit(({ exitCode }) => {
        log(`pty kapandi pid=${pid} kod=${exitCode}`);
        gonder({ t: 'bitti', kod: exitCode });
        p = null;
        try { ws.close(); } catch { /* zaten kapali */ }
      });
      return;
    }

    if (!p) return;
    if (m.t === 'veri' && typeof m.d === 'string') p.write(m.d);
    else if (m.t === 'boyut') {
      const cols = Math.max(2, Number(m.cols) || 80);
      const rows = Math.max(2, Number(m.rows) || 24);
      try { p.resize(cols, rows); } catch (e) { log('resize hatasi: ' + e.message); }
    }
  });

  ws.on('close', () => {
    if (p) {
      log('ws kapandi -> pty oldurulyor pid=' + p.pid);
      try { p.kill(); } catch { /* zaten olmus */ }
      p = null;
    }
  });
});

// Yetim birakmama: ebeveyn stdin'i kapatinca bu surec de kapanir.
process.stdin.on('end', () => { log('ebeveynin stdin"i kapandi -> cikiliyor'); process.exit(0); });
process.stdin.on('close', () => process.exit(0));
process.stdin.resume();

process.on('uncaughtException', (e) => { log('uncaughtException: ' + (e && e.stack)); });
