// UI testi: uretim paketini gercek Electron'da acar, CDP (Chrome DevTools Protocol)
// uzerinden gercek tiklama/tus gonderir ve sonucu DOM'dan okur.
//
// Neden CDP, neden Playwright degil: bagimlilik sifir (ws zaten var), Electron'un kendi
// --remote-debugging-port'u yetiyor. Test claude ACMAZ: KOKPIT_TEST_KABUK=1 ile PTY
// sunucusu duz pwsh acar (her gercek claude acilisi transcript + hook tetikler).
//
// Kullanim: npm run build && npm run test:ui
const { spawn, spawnSync } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');
const os = require('os');
const WebSocket = require('ws');

const KOK = path.join(__dirname, '..');
const PORT = 9333;
const electronBin = require('electron');
// Kokpit'in veri dizini testte GECICI (KOKPIT_DIZIN, config.cjs). 2026-10-04'e kadar gercek
// ~/.kokpit kullaniliyor, sonda yedekten geri yaziliyordu: gercek Kokpit aciksa test ornegi
// onun acik oturumunu "onceki calismadan kalan" sanip deftere sahte "kapandi" yaziyor, geri
// yazma da gercek ornegin o arada yazdigini ezebiliyordu. Artik iki ornek hic dosya paylasmaz.
const TEST_DIZIN = fs.mkdtempSync(path.join(os.tmpdir(), 'kokpit-ui-'));
const AYARLAR = path.join(TEST_DIZIN, 'ayarlar.json');
const DEFTER = path.join(TEST_DIZIN, 'oturumlar.jsonl');
const KOMUTLAR = path.join(TEST_DIZIN, 'komutlar.json');
const CALISTIR = path.join(TEST_DIZIN, 'calistir.json');
const LOG = (ad) => path.join(TEST_DIZIN, ad);
const { VAULT } = require('../electron/config.cjs');
// v2.6: oturumsuz limit ucu sahte (yerel sunucu), kimlik dosyasi ve ~/.claude/sessions gecici.
const KIMLIK = path.join(TEST_DIZIN, 'test-credentials.json');
const DIS_DIZIN = path.join(TEST_DIZIN, 'claude-sessions');
fs.mkdirSync(DIS_DIZIN, { recursive: true });
fs.writeFileSync(KIMLIK, JSON.stringify({ claudeAiOauth: { accessToken: 'ui-test-token', expiresAt: Date.now() + 6 * 3600_000 } }));
const limitIstekleri = [];
const limitSunucusu = http.createServer((req, res) => {
  limitIstekleri.push(req.headers.authorization);
  res.writeHead(200, { 'Content-Type': 'application/json' }).end(
    JSON.stringify({
      five_hour: { utilization: 15, resets_at: new Date(Date.now() + 2 * 3600_000).toISOString() },
      seven_day: { utilization: 92, resets_at: new Date(Date.now() + 50 * 3600_000).toISOString() },
    })
  );
});
const INBOX = path.join(VAULT, '\u{1F4E5} 000-Inbox', 'Dump');

let basarisiz = 0;
function kontrol(ad, kosul, detay) {
  console.log((kosul ? '  ok   ' : '  FAIL ') + ad + (kosul || detay === undefined ? '' : '  -> ' + detay));
  if (!kosul) basarisiz++;
}
const uyu = (ms) => new Promise((r) => setTimeout(r, ms));

async function jsonGetir(url) {
  return new Promise((coz, red) => {
    http.get(url, (res) => {
      let veri = '';
      res.on('data', (d) => (veri += d));
      res.on('end', () => {
        try { coz(JSON.parse(veri)); } catch (e) { red(e); }
      });
    }).on('error', red);
  });
}

class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.sira = 0;
    this.bekleyen = new Map();
    this.konsol = [];
    ws.on('message', (ham) => {
      const m = JSON.parse(ham.toString());
      if (m.id && this.bekleyen.has(m.id)) {
        const { coz, red } = this.bekleyen.get(m.id);
        this.bekleyen.delete(m.id);
        if (m.error) red(new Error(m.error.message));
        else coz(m.result);
      } else if (m.method === 'Runtime.consoleAPICalled') {
        this.konsol.push(m.params.args.map((a) => a.value ?? a.description ?? '').join(' '));
      }
    });
    // Uygulama beklenmedik cikarsa bekleyen cagri asili kalmasin, kontrol olarak dussun.
    ws.on('close', () => {
      for (const { red } of this.bekleyen.values()) red(new Error('CDP baglantisi kapandi (uygulama cikti?)'));
      this.bekleyen.clear();
    });
  }
  gonder(method, params = {}) {
    if (this.ws.readyState !== WebSocket.OPEN) return Promise.reject(new Error('CDP baglantisi kapali'));
    const id = ++this.sira;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((coz, red) => this.bekleyen.set(id, { coz, red }));
  }
  /** Sayfada ifade calistirir; Promise donerse bekler. */
  async js(ifade) {
    const r = await this.gonder('Runtime.evaluate', {
      expression: ifade,
      awaitPromise: true,
      returnByValue: true,
    });
    if (r.exceptionDetails) throw new Error('sayfa hatasi: ' + (r.exceptionDetails.exception?.description ?? r.exceptionDetails.text));
    return r.result.value;
  }
  async bekle(ifade, ms = 15000, ad = ifade) {
    const son = Date.now() + ms;
    while (Date.now() < son) {
      if (await this.js(ifade)) return true;
      await uyu(150);
    }
    throw new Error('zaman asimi: ' + ad);
  }
  async tus(key, mods = 0, code) {
    // mods: 2 = Ctrl, 8 = Shift (CDP modifier bitleri)
    const ortak = { key, modifiers: mods, code, windowsVirtualKeyCode: KODLAR[key] };
    await this.gonder('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...ortak });
    if (key.length === 1 && mods === 0) {
      await this.gonder('Input.dispatchKeyEvent', { type: 'char', text: key, ...ortak });
    }
    await this.gonder('Input.dispatchKeyEvent', { type: 'keyUp', ...ortak });
  }
  async yaz(metin) {
    await this.gonder('Input.insertText', { text: metin });
  }
}
const KODLAR = { Enter: 13, Escape: 27, Tab: 9, F: 70, f: 70, N: 78, n: 78, P: 80, p: 80, '1': 49, '2': 50, '3': 51, '4': 52, '=': 187, '-': 189, '0': 48 };

/** Uygulamayi acar, CDP'ye baglanir. */
async function baslat(ekOrtam = {}) {
  // Ustu kapali pencerede Chromium kare uretmeyi durdurur (visibilityState hidden, rAF ve
  // ResizeObserver durur): Scryne makineyi kullanirken test penceresi arkada kalinca
  // olcum gerektiren cizimler (butce grafigi) hic olusmuyordu. Olculdu 2026-10-03.
  const app = spawn(electronBin, [KOK, '--remote-debugging-port=' + PORT, '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding'], {
    cwd: KOK,
    stdio: ['ignore', 'pipe', 'pipe'],
    // KOKPIT_TEST_SECIM=0: kapatma diyalogunda "Guvenli kapat" secilmis sayilir (yerel
    // diyalog CDP'den tiklanamaz).
    // KOKPIT_TEST_ADA=1: ada penceresi de kurulur (v2.4 ada bolumu onu ayri CDP hedefi olarak surer).
    env: {
      ...process.env,
      KOKPIT_DEV: '0',
      KOKPIT_TEST_KABUK: '1',
      KOKPIT_TEST_SECIM: '0',
      KOKPIT_TEST_ADA: '1',
      KOKPIT_DIZIN: TEST_DIZIN,
      KOKPIT_LIMIT_URL: 'http://127.0.0.1:' + limitSunucusu.address().port + '/api/oauth/usage',
      KOKPIT_KIMLIK: KIMLIK,
      KOKPIT_CLAUDE_OTURUMLAR: DIS_DIZIN,
      ...ekOrtam,
    },
  });
  app.stderr.on('data', () => {});
  app.stdout.on('data', () => {});

  let hedefler = null;
  for (let i = 0; i < 40 && !hedefler; i++) {
    await uyu(250);
    try {
      const liste = await jsonGetir(`http://127.0.0.1:${PORT}/json`);
      hedefler = liste.filter((t) => t.type === 'page' && !t.url.startsWith('devtools'));
      // Iki pencere: ana ve ada (#ada). Ikisi de gelene kadar beklenir.
      if (!hedefler.some((t) => t.url.endsWith('#ada')) || !hedefler.some((t) => !t.url.endsWith('#ada'))) hedefler = null;
    } catch { /* henuz dinlemiyor */ }
  }
  if (!hedefler) throw new Error('CDP hedefi bulunamadi');
  const baglan = async (hedef) => {
    const ws = new WebSocket(hedef.webSocketDebuggerUrl);
    await new Promise((r) => ws.once('open', r));
    const c = new Cdp(ws);
    await c.gonder('Runtime.enable');
    return c;
  };
  const cdp = await baglan(hedefler.find((t) => !t.url.endsWith('#ada')));
  const adaCdp = await baglan(hedefler.find((t) => t.url.endsWith('#ada')));
  return { app, cdp, adaCdp };
}

/**
 * Kapanis. Browser.close'un cevabi beklenmez — tarayici cevap veremeden kapanir ve
 * bekleyen promise olay dongusunu bosaltip sureci sessizce bitirir (ilk kosuda oldu).
 */
async function kapat(app, cdp, ad, ms = 8000) {
  const cikisSozu = new Promise((r) => {
    const t = setTimeout(() => r('zaman-asimi'), ms);
    app.on('exit', (k) => { clearTimeout(t); r(k); });
  });
  void cdp.gonder('Browser.close').catch(() => {});
  const cikis = await cikisSozu;
  kontrol(ad, cikis !== 'zaman-asimi', cikis);
  if (cikis === 'zaman-asimi') try { app.kill(); } catch { /* */ }
}

/**
 * Gercek X: pencereye Win32 WM_CLOSE. Renderer'dan window.close() BrowserWindow'un `close`
 * olayini atlayip pencereyi dogrudan yok ediyor (olculdu 2026-10-04) — X'i temsil etmez.
 * Hedef: surecin "Kokpit — <sayfa>" baslikli ust penceresi (Ada'ninki "Kokpit Ada").
 */
const PENCERE_CS = `
Add-Type @'
using System; using System.Runtime.InteropServices; using System.Text;
public static class Pencere {
  public delegate bool Gez(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] public static extern bool EnumWindows(Gez g, IntPtr l);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint p);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr h, uint m, IntPtr w, IntPtr l);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  public static int Kapat(uint hedef) {
    int n = 0;
    EnumWindows((h, l) => { uint p; GetWindowThreadProcessId(h, out p); if (p != hedef) return true;
      var s = new StringBuilder(64); GetWindowText(h, s, 64);
      var t = s.ToString(); if (t.StartsWith("Kokpit") && t != "Kokpit Ada") { PostMessage(h, 0x0010, IntPtr.Zero, IntPtr.Zero); n++; } return true; }, IntPtr.Zero);
    return n;
  }
  public static string Liste(uint hedef) {
    var sb = new StringBuilder();
    EnumWindows((h, l) => { uint p; GetWindowThreadProcessId(h, out p); if (p != hedef) return true;
      var s = new StringBuilder(64); GetWindowText(h, s, 64);
      if (s.ToString().StartsWith("Kokpit")) sb.Append(s.ToString() + "|" + (IsWindowVisible(h) ? "1" : "0") + ";"); return true; }, IntPtr.Zero);
    return sb.ToString();
  }
}
'@`;
function pwshPencere(cagri) {
  const r = spawnSync('pwsh', ['-NoProfile', '-NonInteractive', '-Command', PENCERE_CS + '\n' + cagri], { encoding: 'utf8', windowsHide: true, timeout: 30000 });
  return (r.stdout || '').trim();
}
function xBas(pid) {
  return Number(pwshPencere(`[Pencere]::Kapat(${pid})`)) || 0;
}
/**
 * Surecin "Kokpit..." baslikli ust pencerelerinin OS gorunurlugu (IsWindowVisible). Renderer'daki
 * visibilityState hic gosterilmemis pencerede de "visible" donuyor (olculdu 2026-10-04, mutasyonla).
 */
function osGorunur(pid, ana) {
  const satirlar = pwshPencere(`[Pencere]::Liste(${pid})`).split(';').filter(Boolean);
  return satirlar.some((s) => {
    const [t, v] = s.split('|');
    return v === '1' && (ana ? t !== 'Kokpit Ada' : t === 'Kokpit Ada');
  });
}

/**
 * v2.7 saklanma: kenara sakla -> cene, niyetli bakista sarkma, kalicilik, saklanmisken bakis yok,
 * gercek tam ekran pencerede sinema, surukleme. Tam ekran ve surukleme GERCEK Win32 ile: tam ekran
 * icin cercevesiz bir WinForms penceresi birincil ekrani kaplar (birkac saniye); surukleme icin imlec
 * gercekten kaydirilir (main imleci OS'tan okur, CDP fare olayi imleci oynatmaz) ve sonra geri konur.
 */
async function adaSaklanmaTesti(app, adaCdp, disYaz, disSil) {
  console.log('Ada v2.7: kenara sakla, sarkma, sinema (gercek tam ekran), surukleme');
  const ayarOku = () => {
    try {
      return JSON.parse(fs.readFileSync(path.join(TEST_DIZIN, 'ayarlar.json'), 'utf8'));
    } catch {
      return {};
    }
  };
  const fareyiCek = () => adaCdp.gonder('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 5, y: 510 });
  const adaDugmesi = (etiket) =>
    `(() => { const b = document.querySelector('.ada-kart button[aria-label=${JSON.stringify(etiket)}]'); if (!b) return false; b.click(); return true; })()`;

  await adaCdp.gonder('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 230, y: 18 });
  await adaCdp.bekle(`!!document.querySelector('.ada-kart button[aria-label="Kenara sakla"]')`, 5000, 'Kenara sakla dugmesi');
  kontrol('saklan: acik kartta "Kenara sakla" dugmesi, kapali hapta yok', true);
  kontrol('saklan: tiklandi', await adaCdp.js(adaDugmesi('Kenara sakla')));
  await adaCdp.bekle(`!!document.querySelector('.ada-cene') && !document.querySelector('.ada-kart')`, 5000, 'cene');
  kontrol('saklan: kart gitti, yalniz cene var', true);
  kontrol('saklan: pencere OS\'ta gorunur kaldi (cene icin)', osGorunur(app.pid, false));
  for (let i = 0; i < 20 && ayarOku().adaSakli !== true; i++) await uyu(100);
  kontrol('saklan: kalici (ayarlar.json adaSakli: true)', ayarOku().adaSakli === true, ayarOku());

  // Niyetli bakis: imlec cenenin ustunden gecerken acilmaz, durunca sarkar.
  await adaCdp.gonder('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 230, y: 4 });
  await uyu(120);
  kontrol('sarkma: imlec gecerken (120 ms) kart acilmadi', await adaCdp.js(`!document.querySelector('.ada-kart')`));
  await adaCdp.bekle(`!!document.querySelector('.ada-kart.ada-sarkan')`, 3000, 'sarkan kart');
  kontrol('sarkma: imlec durunca kart kenardan sarkti (ust koseler duz)', true);
  kontrol('sarkma: kartta "Geri getir" var', await adaCdp.js(`!!document.querySelector('.ada-kart button[aria-label="Geri getir"]')`));
  await fareyiCek();
  await adaCdp.bekle(`!!document.querySelector('.ada-cene')`, 3000, 'cene geri');
  kontrol('sarkma: imlec ayrilinca yine cene', true);

  // Saklanmisken "seni bekliyor": cene amber, kart kendiliginden acilmaz. Otomatik bakis yalniz bir
  // GECISTE tetiklenir (calisiyor -> bekliyor); dogrudan bekliyor doganla sinanirsa bozuk kod da gecer.
  disYaz('102', { sessionId: 'dis-2', cwd: 'C:\\x\\SakliProje', status: 'busy' });
  await adaCdp.bekle(`document.querySelector('.ada-cene-alan')?.getAttribute('aria-label')?.includes('SakliProje çalışıyor')`, 10000, 'calisan dis oturum');
  disYaz('102', { sessionId: 'dis-2', cwd: 'C:\\x\\SakliProje', status: 'waiting' });
  // Gecis boyunca izlenir: bakis 5 sn acip kapanacagi icin sonda bakmak bozuk kodu da gecirir (mutasyonla goruldu).
  let kartAcildi = false;
  let amber = false;
  for (let son = Date.now() + 10000; Date.now() < son && !amber; ) {
    const d = await adaCdp.js(`({ kart: !!document.querySelector('.ada-kart'), amber: document.querySelector('.ada-cene')?.dataset.hal === 'bekliyor' })`);
    kartAcildi ||= d.kart;
    amber = d.amber;
    if (!amber) await uyu(100);
  }
  await uyu(1500);
  kartAcildi ||= await adaCdp.js(`!!document.querySelector('.ada-kart')`);
  kontrol('saklanmisken calisiyor -> bekliyor: cene amber', amber);
  kontrol('saklanmisken calisiyor -> bekliyor: kart hic kendiliginden acilmadi', !kartAcildi);

  // Sinema: gercek tam ekran pencere. Windows'un odak kilidi, Scryne o an baska pencerede yaziyorsa yeni
  // pencerenin one gecmesini engelleyebiliyor (2026-10-06: mutasyon kosularinda form one gecmedi, sinema
  // kontrolleri yaniltici dustu ya da yaniltici gecti). Form kendini AttachThreadInput ile one alir ve
  // basardi mi yazar; test bunu ve Kokpit'in "sinema" log satirini on kosul sayar. Form test kapatana kadar
  // acik kalir (dur dosyasi; en fazla 40 sn).
  const formBetik = path.join(TEST_DIZIN, 'tam-ekran.ps1');
  fs.writeFileSync(formBetik, [
    'param([string]$durum, [string]$dur)',
    'Add-Type -AssemblyName System.Windows.Forms',
    "Add-Type -Namespace K -Name W -MemberDefinition '",
    '[DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();',
    '[DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);',
    '[DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr h);',
    '[DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, IntPtr p);',
    '[DllImport("user32.dll")] public static extern bool AttachThreadInput(uint a, uint b, bool c);',
    '[DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();',
    "'",
    '$f = New-Object System.Windows.Forms.Form',
    "$f.FormBorderStyle = 'None'; $f.StartPosition = 'Manual'; $f.BackColor = 'Black'; $f.ShowInTaskbar = $false",
    '$f.Bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds',
    '$f.Add_Shown({',
    '  $on = [K.W]::GetForegroundWindow(); $a = [K.W]::GetWindowThreadProcessId($on, [IntPtr]::Zero); $b = [K.W]::GetCurrentThreadId()',
    '  [void][K.W]::AttachThreadInput($a, $b, $true); [void][K.W]::BringWindowToTop($f.Handle); [void][K.W]::SetForegroundWindow($f.Handle); [void][K.W]::AttachThreadInput($a, $b, $false)',
    '  $f.Activate()',
    '})',
    '$basla = Get-Date',
    '$t = New-Object System.Windows.Forms.Timer; $t.Interval = 100',
    '$t.Add_Tick({ Set-Content -Path $durum -Value ([int]([K.W]::GetForegroundWindow() -eq $f.Handle)); if ((Test-Path $dur) -or ((Get-Date) - $basla).TotalSeconds -gt 40) { $f.Close() } })',
    '$t.Start()',
    '[void]$f.ShowDialog()',
  ].join('\r\n'));
  const logSinema = () => {
    try {
      return fs.readFileSync(LOG('kokpit.log'), 'utf8').split('\n').filter((s) => s.includes('ada: tam ekran') || s.includes('ada: tam ekran bitti')).pop() ?? '';
    } catch {
      return '';
    }
  };
  /** Tam ekran pencere acar; on plana gecip Kokpit'in sinemaya girdigini bekler. */
  const tamEkranAc = async () => {
    const durum = path.join(TEST_DIZIN, 'tam-ekran.durum');
    const dur = path.join(TEST_DIZIN, 'tam-ekran.dur');
    for (const f of [durum, dur]) fs.rmSync(f, { force: true });
    const p = spawn('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', formBetik, durum, dur], { stdio: 'ignore', windowsHide: false });
    const cikti = new Promise((r) => p.on('exit', r)); // spawn aninda: form erken kapanirsa beklemek takilmasin
    let onde = false;
    let sinema = false;
    for (let son = Date.now() + 10000; Date.now() < son && !(onde && sinema); ) {
      try { onde = fs.readFileSync(durum, 'utf8').trim() === '1'; } catch { /* henuz yok */ }
      sinema = logSinema().includes('sinema');
      if (!(onde && sinema)) await uyu(150);
    }
    const kapat = async () => {
      fs.writeFileSync(dur, '1');
      await Promise.race([cikti, uyu(5000)]);
      try { p.kill(); } catch { /* */ }
    };
    return { onde, sinema, kapat };
  };
  const osBekle = async (gorunur, ms) => {
    const son = Date.now() + ms;
    while (Date.now() < son) {
      if (osGorunur(app.pid, false) === gorunur) return true;
      await uyu(200);
    }
    return false;
  };
  let form = await tamEkranAc();
  kontrol('on kosul: tam ekran pencere one gecti ve Kokpit sinemaya girdi (log)', form.onde && form.sinema, { onde: form.onde, log: logSinema() });
  if (form.onde && form.sinema) {
    // Bekleyen var: tam ekranda bile cene gorunur kalmali.
    kontrol('sinema + bekleyen: pencere gorunur, yalniz cene', osGorunur(app.pid, false) && (await adaCdp.js(`!!document.querySelector('.ada-cene') && !document.querySelector('.ada-kart')`)));
    disSil();
    kontrol('sinema: bekleyen gidince Ada tamamen gizlendi (IsWindowVisible)', await osBekle(false, 8000));
  } else {
    disSil();
  }
  await form.kapat();
  kontrol('sinema: tam ekran kapaninca Ada geri geldi', await osBekle(true, 4000));
  await adaCdp.bekle(`!!document.querySelector('.ada-cene')`, 3000, 'sinemadan sonra sakli');
  kontrol('sinema bitti: onceki kip (sakli) korundu', true);

  // Geri getir.
  await adaCdp.gonder('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 230, y: 4 });
  await adaCdp.bekle(`!!document.querySelector('.ada-kart button[aria-label="Geri getir"]')`, 3000, 'geri getir');
  kontrol('geri getir: tiklandi', await adaCdp.js(adaDugmesi('Geri getir')));
  await adaCdp.bekle(`!document.querySelector('.ada-cene') && !!document.querySelector('.ada-kart.rounded-full')`, 3000, 'hap');
  kontrol('geri getir: hap geri geldi', true);
  await fareyiCek();
  for (let i = 0; i < 20 && ayarOku().adaSakli !== false; i++) await uyu(100);
  kontrol('geri getir: kalici (adaSakli: false)', ayarOku().adaSakli === false, ayarOku());

  // Sakli degilken de sinema: bekleyen yok -> tamamen gizli.
  form = await tamEkranAc();
  kontrol('on kosul (normal kipte): tam ekran one gecti, sinema', form.onde && form.sinema, { onde: form.onde, log: logSinema() });
  if (form.onde && form.sinema) kontrol('sinema (normal kipte): Ada gizlendi', await osBekle(false, 3000));
  await form.kapat();
  kontrol('sinema (normal kipte): tam ekran bitince Ada geri (OS)', await osBekle(true, 4000));
  kontrol('sinema (normal kipte): geri gelen hap (cene degil)', await adaCdp.js(`!document.querySelector('.ada-cene') && !!document.querySelector('.ada-kart')`), await adaCdp.js(`document.querySelector('.ada-kart')?.className ?? 'kart yok'`));

  // Surukleme: main imleci OS'tan okur. Imlec gercekten kaydirilir, sonra yerine konur.
  let koffi = null;
  try {
    koffi = require('koffi');
  } catch {
    /* yoksa surukleme atlanir */
  }
  if (!koffi) {
    kontrol('surukleme: koffi yok, atlandi', false);
    return;
  }
  const u = koffi.load('user32.dll');
  const NOKTA = koffi.struct('TEST_NOKTA', { x: 'long', y: 'long' });
  const imlecAl = u.func('bool __stdcall GetCursorPos(_Out_ TEST_NOKTA* p)');
  const imlecKoy = u.func('bool __stdcall SetCursorPos(int x, int y)');
  const ekranOlcu = u.func('int __stdcall GetSystemMetrics(int i)');
  const eski = {};
  imlecAl(eski);
  // Sabit noktalar: ekranin ortasi ve 500 px solu. Imlecin o anki yerinden sayilirsa (ilk surum) imlec
  // soldayken sifira kirpiliyor, surukleme yolu kisaliyordu (2026-10-06, her kosuda dustu).
  const orta = { x: Math.round(ekranOlcu(0) / 2), y: Math.round(ekranOlcu(1) / 2) };
  /** Imleci koyar, gercekten orada mi bakar, IPC'yi gonderir, hala orada mi bakar (Scryne fareyi oynatirsa tekrar). */
  const imlecleTasi = async (x, asamalar) => {
    for (let deneme = 0; deneme < 4; deneme++) {
      imlecKoy(x, orta.y);
      await uyu(60);
      const once = {};
      imlecAl(once);
      await adaCdp.js(`(() => { for (const a of ${JSON.stringify(asamalar)}) window.kokpit.adaTasi(a); return true; })()`);
      const sonra = {};
      imlecAl(sonra);
      if (once.x === x && sonra.x === x) return true;
      await uyu(300);
    }
    return false;
  };
  const x0 = await adaCdp.js('window.screenX');
  try {
    const t1 = (await imlecleTasi(orta.x, ['basla'])) && (await imlecleTasi(orta.x - 500, ['surukle', 'bit']));
    await uyu(300);
    const x1 = await adaCdp.js('window.screenX');
    kontrol('surukle: pencere sola tasindi', t1 && x1 < x0 - 100, JSON.stringify({ imlecTuttu: t1, x0, x1, orta }));
    for (let i = 0; i < 20 && typeof ayarOku().adaKonum !== 'number'; i++) await uyu(100);
    const k = ayarOku().adaKonum;
    kontrol('surukle: yer kalici, oran olarak (adaKonum < 0.5)', typeof k === 'number' && k < 0.5, k);
    // Geri: ortaya yakin birakilinca miknatis tam ortaya oturtur, kayit silinir (null = orta).
    const t2 = (await imlecleTasi(orta.x - 500, ['basla'])) && (await imlecleTasi(orta.x + 3, ['surukle', 'bit']));
    await uyu(300);
    const x2 = await adaCdp.js('window.screenX');
    kontrol('surukle: ortaya yakin birakinca tam orta (miknatis)', t2 && x2 === x0, JSON.stringify({ imlecTuttu: t2, x0, x2 }));
    for (let i = 0; i < 20 && ayarOku().adaKonum !== null; i++) await uyu(100);
    kontrol('surukle: ortadayken kayit null', ayarOku().adaKonum === null, ayarOku().adaKonum);
  } finally {
    imlecKoy(eski.x, eski.y);
  }

  // Surukledikten sonra birakmanin urettigi tik Kokpit'i acmamali; duz tik acmali (pozitif kontrol).
  // Gercek renderer yolu: CDP fare olaylari pointerdown/move/up + click uretir.
  const tikSayisi = () => {
    try {
      return fs.readFileSync(LOG('kokpit.log'), 'utf8').split('\n').filter((s) => s.includes('ada tiklamasi')).length;
    } catch {
      return 0;
    }
  };
  await adaCdp.gonder('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 230, y: 18 });
  await adaCdp.bekle(`!!document.querySelector('.ada-kart button[data-ada-ana]')`, 3000, 'ana dugme');
  const b = await adaCdp.js(`(() => { const r = document.querySelector('.ada-kart button[data-ada-ana]').getBoundingClientRect(); return { x: r.left + 60, y: r.top + r.height / 2 }; })()`);
  const fareOlayi = (type, x, extra = {}) => adaCdp.gonder('Input.dispatchMouseEvent', { type, x, y: b.y, button: 'left', clickCount: 1, ...extra });
  const once = tikSayisi();
  await fareOlayi('mousePressed', b.x, { buttons: 1 });
  for (const dx of [8, 20, 40]) await fareOlayi('mouseMoved', b.x + dx, { buttons: 1 });
  kontrol('surukleme sirasinda imlec "tutma eli" (ada-surukleniyor)', await adaCdp.js(`!!document.querySelector('.ada-surukleniyor')`));
  await fareOlayi('mouseReleased', b.x + 40, { buttons: 0 });
  await uyu(600);
  kontrol('surukledikten sonraki tik Kokpit\'i acmadi', tikSayisi() === once, { once, simdi: tikSayisi() });
  await fareOlayi('mousePressed', b.x, { buttons: 1 });
  await fareOlayi('mouseReleased', b.x, { buttons: 0 });
  for (let i = 0; i < 20 && tikSayisi() === once; i++) await uyu(100);
  kontrol('duz tik Kokpit\'i acti (pozitif kontrol)', tikSayisi() === once + 1, { once, simdi: tikSayisi() });
  await fareyiCek();
}

const AC_DUGMESI =`(() => { const b = [...document.querySelectorAll('table tbody tr button')].find(x => x.textContent.trim() === 'Aç'); b.click(); return true; })()`;

/** Acik terminalde uzun bir surec baslatir: kapatma korumasinin "cocuk var" dali. */
async function cocukBaslat(cdp) {
  await uyu(1500); // pwsh istemi
  await cdp.js(`(() => { document.querySelector('.xterm-helper-textarea')?.focus(); return true; })()`);
  await cdp.yaz('ping -n 60 127.0.0.1');
  await cdp.tus('Enter');
  await uyu(1500);
}

async function main() {
  if (!fs.existsSync(path.join(KOK, 'dist', 'index.html'))) {
    console.error('dist yok: once npm run build');
    process.exit(2);
  }
  // Bayat paket: kaynak, son derlemeden yeniyse test ESKI arayuzu sinar ve yesil yanar.
  // 2026-10-04'te oldu: derleme bir tip hatasiyla dusmustu, dist eski kaldi, mutasyon testinin
  // uc bozuk surumu de "gecti". Derleme basarisizsa dist'e dokunulmaz, bu kontrol onu yakalar.
  const enYeni = (dizin) =>
    fs.readdirSync(dizin, { withFileTypes: true }).reduce((m, d) => {
      const y = path.join(dizin, d.name);
      return Math.max(m, d.isDirectory() ? enYeni(y) : fs.statSync(y).mtimeMs);
    }, 0);
  const kaynak = Math.max(enYeni(path.join(KOK, 'src')), fs.statSync(path.join(KOK, 'index.html')).mtimeMs);
  const paket = fs.statSync(path.join(KOK, 'dist', 'index.html')).mtimeMs;
  if (kaynak > paket) {
    console.error('dist bayat: kaynak son derlemeden yeni (' + new Date(kaynak).toLocaleTimeString('tr-TR') + ' > ' + new Date(paket).toLocaleTimeString('tr-TR') + '). Once npm run build; derleme hatasi varsa onu duzelt.');
    process.exit(2);
  }

  await new Promise((r) => limitSunucusu.listen(0, '127.0.0.1', r));
  let { app, cdp, adaCdp } = await baslat();
  // Dis oturum kaydi icin yasayan bir pid (test sureci kendisi Kokpit'in ebeveyni, onu kullanma).
  const bekleyenCocuk = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 600000)'], { stdio: 'ignore' });
  const disYaz = (ad, k) => fs.writeFileSync(path.join(DIS_DIZIN, ad + '.json'), JSON.stringify({ pid: bekleyenCocuk.pid, kind: 'interactive', startedAt: Date.now(), statusUpdatedAt: Date.now(), ...k }));
  const disSil = () => { for (const f of fs.readdirSync(DIS_DIZIN)) fs.unlinkSync(path.join(DIS_DIZIN, f)); };
  try {
    console.log('Pano');
    await cdp.bekle(`document.querySelectorAll('table tbody tr').length > 0`, 20000, 'proje tablosu');
    const satir = await cdp.js(`document.querySelectorAll('table tbody tr').length`);
    kontrol('proje tablosu dolu', satir > 0, satir);

    console.log('Ada v2.6: oturum yokken de gorunur, oturumsuz limitler, Kokpit disindaki oturumlar');
    await adaCdp.bekle(`!!document.querySelector('.ada-kart')`, 10000, 'ada karti');
    kontrol('ada: hic oturum yokken kart cizildi ("Hazır")', await adaCdp.js(`document.querySelector('.ada-kart').innerText.includes('Hazır')`));
    kontrol('ada: pencere OS\'ta gorunur (Kokpit onde, oturum yok)', osGorunur(app.pid, false));
    await adaCdp.bekle(`document.querySelector('.ada-kart').innerText.includes('hafta %92')`, 10000, 'hapta limitler');
    kontrol('ada: hapta "5s %15" ve "hafta %92" (oturumsuz yoklama)', await adaCdp.js(`document.querySelector('.ada-kart').innerText.includes('5s %15')`));
    kontrol('limit ucu kimlik dosyasindaki tokenla soruldu', limitIstekleri[0] === 'Bearer ui-test-token', limitIstekleri);
    kontrol('ana pencerenin kenarinda da ayni limit (oturum acmadan)', await cdp.js(`!!document.querySelector('[role="meter"][aria-label="Hafta limiti"][aria-valuenow="92"]')`));
    kontrol('son olcum test dizinine yazildi', fs.existsSync(path.join(TEST_DIZIN, 'limit.json')));
    disYaz('101', { sessionId: 'dis-1', cwd: 'C:\\x\\DisProje', status: 'waiting' });
    await adaCdp.bekle(`document.querySelector('.ada-kart').innerText.includes('DisProje seni bekliyor')`, 10000, 'dis oturum hapta');
    kontrol('ada: Kokpit disindaki bekleyen oturum hapta ("DisProje seni bekliyor · Kokpit dışında")', true);
    kontrol('goz: dis oturum beklerken "bekliyor"', await adaCdp.js(`document.querySelector('.ada-goz')?.dataset.hal === 'bekliyor'`));
    await adaCdp.gonder('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 230, y: 18 });
    await adaCdp.bekle(`!!document.querySelector('section[aria-label="Kokpit dışındaki claude oturumları"]')`, 5000, 'dis oturum bolumu');
    kontrol('ada acik: "Kokpit dışında" bolumu + limit sifirlanma saati', await adaCdp.js(`document.body.innerText.includes('Kokpit dışında') && document.body.innerText.includes('sıfırlanma')`));
    kontrol('ada acik: gorev kutusu var', await adaCdp.js(`!!document.querySelector('section[aria-label="Görev ver"] input')`));
    await adaCdp.gonder('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 5, y: 510 });
    disSil();
    await adaCdp.bekle(`!document.querySelector('.ada-kart').innerText.includes('DisProje')`, 10000, 'dis oturum dustu');
    kontrol('dis oturum kaydi silinince Ada\'dan dustu', true);

    await adaSaklanmaTesti(app, adaCdp, disYaz, disSil);

    console.log('Terminal ac');
    await cdp.js(AC_DUGMESI);
    await cdp.bekle(`!!document.querySelector('.xterm')`, 10000, 'xterm');
    await cdp.bekle(`!!document.querySelector('[role="tab"] .bg-aksan')`, 20000, 'oturum acik');
    kontrol('oturum acildi (sekme noktasi aksan)', true);
    await uyu(800);
    kontrol('webgl renderer aktif', cdp.konsol.some((k) => k.includes('webgl renderer aktif')), cdp.konsol.slice(-3).join(' | '));

    console.log('Zil -> rozet');
    await cdp.js(`(() => { document.querySelector('.xterm-helper-textarea')?.focus(); return true; })()`);
    // Pencere odakta sayilmasin ki rozet dussun: bakmiyor senaryosu.
    await cdp.js(`(() => { document.hasFocus = () => false; return true; })()`);
    await cdp.yaz('[char]7');
    await cdp.tus('Enter');
    await cdp.bekle(`!!document.querySelector('[role="tab"][title*="dikkat bekliyor"]')`, 8000, 'dikkat rozeti');
    kontrol('zil sekmeye dikkat rozeti koydu', true);
    await cdp.js(`(() => { document.hasFocus = () => true; window.dispatchEvent(new Event('focus')); return true; })()`);
    await uyu(300);
    const rozetKalkti = await cdp.js(`!document.querySelector('[role="tab"][title*="dikkat bekliyor"]')`);
    kontrol('bakinca rozet dustu', rozetKalkti);

    console.log('Kanca koprusu (oturumun icinden hook taklidi)');
    // Test kabugu claude acmaz; hook'u, claude'un yapacagi gibi oturumun KENDI ortamindan
    // (KOKPIT_KANCA_PORT/TOKEN, KOKPIT_OTURUM) gonderiyoruz. Bu, PTY'ye gecen ortami,
    // alicinin token/oturum dogrulamasini ve arayuzu birlikte sinar.
    await cdp.js(`(() => { document.querySelector('.xterm-helper-textarea')?.focus(); return true; })()`);
    await cdp.yaz(
      "$h=@{Authorization=\"Bearer $env:KOKPIT_KANCA_TOKEN\";'X-Kokpit-Oturum'=$env:KOKPIT_OTURUM};" +
        "$u=\"http://127.0.0.1:$env:KOKPIT_KANCA_PORT/kanca\";" +
        "function k($b){Invoke-RestMethod -Method Post -Uri $u -Headers $h -ContentType 'application/json' -Body $b|Out-Null};" +
        "k '{\"hook_event_name\":\"UserPromptSubmit\",\"session_id\":\"t\"}';" +
        "k '{\"hook_event_name\":\"PreToolUse\",\"session_id\":\"t\",\"tool_name\":\"Edit\",\"tool_input\":{\"file_path\":\"C:/x/Sorular.tsx\"}}'"
    );
    await cdp.tus('Enter');
    await cdp.bekle(`document.body.innerText.includes('Sorular.tsx') && document.body.innerText.includes('Çalışıyor')`, 15000, 'etkinlik seridi calisiyor');
    kontrol('etkinlik seridi: Calisiyor + Edit Sorular.tsx', true);
    kontrol('sekmede calisma isareti', await cdp.js(`!!document.querySelector('[role="tab"] .calisma-isareti')`));
    await cdp.js(`(() => { document.hasFocus = () => false; return true; })()`);
    await cdp.yaz(
      "k '{\"hook_event_name\":\"PostToolUse\",\"session_id\":\"t\",\"tool_name\":\"Edit\",\"tool_input\":{\"file_path\":\"C:/x/Sorular.tsx\"},\"tool_response\":{\"structuredPatch\":[{\"lines\":[\"+a\",\"+b\",\"-c\"]}]}}';" +
        "k '{\"hook_event_name\":\"Stop\",\"session_id\":\"t\"}'"
    );
    await cdp.tus('Enter');
    await cdp.bekle(`[...document.querySelectorAll('button[aria-expanded]')].some(b => b.textContent.includes('Bitti') && b.textContent.includes('1 dosya'))`, 15000, 'serit bitti + ozet');
    kontrol('serit: Bitti + "1 dosya +2 −1"', await cdp.js(`document.body.innerText.includes('+2') && document.body.innerText.includes('−1')`));
    await cdp.bekle(`!!document.querySelector('[role="tab"][title*="dikkat bekliyor"]')`, 5000, 'Stop -> dikkat');
    kontrol('Stop sinyali sekmeye dikkat rozeti koydu (zil yok, hook var)', true);
    await cdp.js(`(() => { document.hasFocus = () => true; window.dispatchEvent(new Event('focus')); return true; })()`);
    await cdp.js(`(() => { [...document.querySelectorAll('button[aria-expanded]')].find(b => b.textContent.includes('Bitti')).click(); return true; })()`);
    await cdp.bekle(`!!document.querySelector('ol[aria-label^="Son araçlar"] li')`, 3000, 'etkinlik akisi');
    kontrol('seride tiklayinca son araclar akisi acildi', await cdp.js(`document.querySelector('ol[aria-label^="Son araçlar"]').textContent.includes('Sorular.tsx')`));
    await cdp.tus('Escape');
    await uyu(200);
    kontrol('Escape akisi kapatti', await cdp.js(`!document.querySelector('ol[aria-label^="Son araçlar"]')`));

    console.log('Hizli komut (v2.3): menu -> oturuma yazilir ve gonderilir');
    // Test veri dizinindeki komut dosyasina gecici bir komut yazilir: pwsh'ta yan
    // etkisi olan bir satir, "yazildi + Enter'a basildi"nin tek kaniti olarak bir dosya yazar.
    const gonderDosyasi = path.join(os.tmpdir(), 'kokpit-gonder-' + Date.now().toString(36) + '.txt');
    fs.writeFileSync(KOMUTLAR, JSON.stringify({ surum: 1, komutlar: [{ ad: 'Test komutu', metin: "Set-Content -Path '" + gonderDosyasi + "' -Value hizli" }] }));
    await cdp.js(`(() => { window.dispatchEvent(new Event('focus')); return true; })()`); // komutlar odakta yeniden okunur
    await cdp.bekle(`!!document.querySelector('button[aria-label$="hızlı komut gönder"]')`, 5000, 'hizli komut dugmesi');
    await cdp.js(`(() => { document.querySelector('button[aria-label$="hızlı komut gönder"]').click(); return true; })()`);
    await cdp.bekle(`!!document.querySelector('[role="menu"] [role="menuitem"]')`, 3000, 'komut menusu');
    kontrol('menu acildi, odak ilk komutta', await cdp.bekle(`document.activeElement?.getAttribute('role') === 'menuitem' && document.activeElement.textContent.includes('Test komutu')`, 2000, 'menu odagi').catch(() => false));
    await cdp.tus('Escape');
    await uyu(200);
    kontrol('Escape menuyu kapatti, odak dugmeye dondu', await cdp.js(`!document.querySelector('[role="menu"]') && document.activeElement?.getAttribute('aria-haspopup') === 'menu'`));
    await cdp.js(`(() => { document.querySelector('button[aria-label$="hızlı komut gönder"]').click(); return true; })()`);
    await cdp.bekle(`!!document.querySelector('[role="menu"] [role="menuitem"]')`, 3000, 'komut menusu 2');
    await cdp.js(`(() => { [...document.querySelectorAll('[role="menuitem"]')].find(b => b.textContent.includes('Test komutu')).click(); return true; })()`);
    const yazildi = await (async () => { for (let i = 0; i < 40; i++) { if (fs.existsSync(gonderDosyasi)) return true; await uyu(250); } return false; })();
    kontrol('komut kabuga yazildi ve Enter ile calisti (dosya olustu)', yazildi, gonderDosyasi);

    console.log('Sag tik yapistir: duz kabukta bir kez, fareyi izleyen uygulamada hic');
    // 2026-10-05: claude fareyi izliyor (?1000h) ve sag tik olayini alinca panoyu kendisi
    // yapistiriyor; Kokpit de yapistirinca metin iki kez gidiyordu. Pano kullanicinin, geri konur.
    // Pano API'si odakli belge ister; test penceresi arkada kalabiliyor.
    await cdp.gonder('Emulation.setFocusEmulationEnabled', { enabled: true });
    const eskiPano = await cdp.js(`navigator.clipboard.readText().catch(() => '')`);
    const panoYaz = (m) => cdp.js(`navigator.clipboard.writeText(${JSON.stringify(m)}).then(() => true)`);
    const sagTikla = async () => {
      const { x, y } = await cdp.js(`(() => { const r = document.querySelector('.xterm-screen').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
      await cdp.gonder('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'right', buttons: 2, clickCount: 1 });
      await cdp.gonder('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'right', buttons: 0, clickCount: 1 });
    };
    const sagDosya = path.join(TEST_DIZIN, 'sagtik.txt');
    await panoYaz("Add-Content -Path '" + sagDosya + "' -Value q;");
    await cdp.js(`(() => { document.querySelector('.xterm-helper-textarea')?.focus(); return true; })()`);
    await sagTikla();
    await uyu(600);
    await cdp.tus('Enter');
    const sagSatir = await (async () => { for (let i = 0; i < 40; i++) { if (fs.existsSync(sagDosya)) { await uyu(300); return fs.readFileSync(sagDosya, 'utf8').trim().split(/\r?\n/).length; } await uyu(250); } return 0; })();
    kontrol('duz kabukta sag tik bir kez yapistirdi', sagSatir === 1, sagSatir + ' satir');

    // Fareyi izleyen uygulama taklidi: ?1000h + ?1006h acar, stdin'i ham okur, gordugunu yazar.
    const fareBetik = path.join(TEST_DIZIN, 'fare.cjs');
    const fareCikti = path.join(TEST_DIZIN, 'fare.json');
    const fareHazir = path.join(TEST_DIZIN, 'fare.hazir');
    fs.writeFileSync(fareBetik, [
      "const fs = require('fs');",
      "let gelen = '';",
      "process.stdin.setRawMode(true); process.stdin.setEncoding('utf8'); process.stdin.on('data', (d) => { gelen += d; });",
      "process.stdout.write('\\x1b[?1000h\\x1b[?1006h');",
      'setTimeout(() => fs.writeFileSync(process.argv[3], \'1\'), 300);',
      "setTimeout(() => { process.stdout.write('\\x1b[?1000l\\x1b[?1006l'); fs.writeFileSync(process.argv[2], JSON.stringify(gelen)); process.exit(0); }, 3500);",
    ].join('\n'));
    await panoYaz('KOKPIT-SAGTIK-KOPYA');
    await cdp.yaz("node '" + fareBetik + "' '" + fareCikti + "' '" + fareHazir + "'");
    await cdp.tus('Enter');
    for (let i = 0; i < 40 && !fs.existsSync(fareHazir); i++) await uyu(150);
    await sagTikla();
    for (let i = 0; i < 40 && !fs.existsSync(fareCikti); i++) await uyu(250);
    const fareGelen = fs.existsSync(fareCikti) ? JSON.parse(fs.readFileSync(fareCikti, 'utf8')) : null;
    kontrol('fareyi izleyen uygulamaya sag tik fare olayi olarak gitti', !!fareGelen && fareGelen.includes('\x1b[<2;'), JSON.stringify(fareGelen));
    kontrol('fareyi izleyen uygulamada Kokpit yapistirmadi', !!fareGelen && !fareGelen.includes('KOKPIT-SAGTIK-KOPYA'), JSON.stringify(fareGelen));
    await panoYaz(eskiPano);
    await cdp.gonder('Emulation.setFocusEmulationEnabled', { enabled: false });

    console.log('Soruya cevap (v2.3): ada yolu, damga denetimi');
    await cdp.js(`(() => { document.querySelector('.xterm-helper-textarea')?.focus(); return true; })()`);
    await cdp.yaz(
      "k '{\"hook_event_name\":\"UserPromptSubmit\",\"session_id\":\"t\"}';" +
        "k '{\"hook_event_name\":\"PreToolUse\",\"session_id\":\"t\",\"tool_name\":\"AskUserQuestion\",\"tool_input\":{\"questions\":[{\"question\":\"Hangi renk?\",\"header\":\"Renk\",\"multiSelect\":false,\"options\":[{\"label\":\"Kirmizi\"},{\"label\":\"Mavi\"},{\"label\":\"Yesil\"}]}]}}'; cls"
    );
    await cdp.tus('Enter');
    await cdp.bekle(`document.body.innerText.includes('Seni bekliyor') && document.body.innerText.includes('Hangi renk?')`, 15000, 'serit seni bekliyor');
    kontrol('serit: Seni bekliyor + soru metni', true);
    const soru = await cdp.js(`window.kokpit.etkinlikAnlik().then(a => { const [id, e] = Object.entries(a.oturumlar).find(([, e]) => e.durum === 'bekliyor') ?? []; return id ? { id, damga: e.soruZamani, ayrinti: e.soruAyrinti } : null; })`);
    kontrol('kanca durumunda secenekler ve cevaplanabilir', !!soru && soru.ayrinti?.cevaplanabilir === true && soru.ayrinti.sorular[0].secenekler.length === 3, JSON.stringify(soru));
    // Bayat damga: soru degistiyse rakam gonderilmez.
    await cdp.js(`(() => { window.kokpit.adaGonder({ id: ${JSON.stringify(soru?.id)}, tur: 'cevap', cevaplar: [1], damga: ${(soru?.damga ?? 0) - 5} }); return true; })()`);
    kontrol('bayat damgali cevap reddedildi', await cdp.bekle(`true`, 100).then(async () => { for (let i = 0; i < 20; i++) { if (cdp.konsol.some((k) => k.includes('[gonder] soru değişti'))) return true; await uyu(150); } return false; }));
    // Dogru damga: "2" (Mavi) kabuga gider. Test kabugu pwsh: arkasina " | Out-File" yazilinca
    // gelen rakam dosyaya duser — rakamin gercekten PTY'ye ulastiginin kaniti.
    const secimDosyasi = path.join(os.tmpdir(), 'kokpit-secim-' + Date.now().toString(36) + '.txt');
    await cdp.js(`(() => { window.kokpit.adaGonder({ id: ${JSON.stringify(soru?.id)}, tur: 'cevap', cevaplar: [1], damga: ${soru?.damga ?? 0} }); return true; })()`);
    await uyu(600);
    await cdp.js(`(() => { document.querySelector('.xterm-helper-textarea')?.focus(); return true; })()`);
    await cdp.yaz(" | Out-File -FilePath '" + secimDosyasi + "'");
    await cdp.tus('Enter');
    const secim = await (async () => { for (let i = 0; i < 40; i++) { if (fs.existsSync(secimDosyasi)) return fs.readFileSync(secimDosyasi, 'utf8').replace(/\0|﻿/g, '').trim(); await uyu(250); } return null; })();
    kontrol('ada yolu: 2. secenek rakam olarak kabuga gitti', secim === '2', secim);
    for (const f of [gonderDosyasi, secimDosyasi]) try { fs.unlinkSync(f); } catch { /* yok */ }

    console.log('Ada (v2.4): cok sorulu form, son soz, Gördüm, rakam tusu — ada penceresinin kendisi');
    // Ada ayri bir pencere (KOKPIT_TEST_ADA=1); ayni kanca durumunu dinler. Cevap ada'dan main'e,
    // oradan ana penceredeki PTY'ye gider. Kanit yine kabuk: tus dizisi pwsh satirina duser.
    const kabugaYaz = async (satir) => {
      await cdp.js(`(() => { document.querySelector('.xterm-helper-textarea')?.focus(); return true; })()`);
      await cdp.yaz(satir);
      await cdp.tus('Enter');
    };
    const dosyaBekle = async (f) => {
      for (let i = 0; i < 40; i++) {
        if (fs.existsSync(f)) return fs.readFileSync(f, 'utf8').replace(/\0|﻿/g, '').trim();
        await uyu(250);
      }
      return null;
    };
    const adaDugme = (metin) =>
      `(() => { const b = [...document.querySelectorAll('.ada-kart button')].find(x => x.textContent.trim() === ${JSON.stringify(metin)}); if (!b) return false; b.click(); return true; })()`;
    // Imlec adanin ustune: kart acilir (onMouseEnter). Sonda disari cikarilir; yoksa ada penceresi
    // fareyi yakalar halde kalir ve ekranin ust ortasi tiklanmaz olur.
    await adaCdp.gonder('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 230, y: 18 });
    const cokDosya = path.join(os.tmpdir(), 'kokpit-cok-' + Date.now().toString(36) + '.txt');
    const submitDosya = path.join(os.tmpdir(), 'kokpit-submit-' + Date.now().toString(36) + '.txt');
    await kabugaYaz(
      "k '{\"hook_event_name\":\"UserPromptSubmit\",\"session_id\":\"t\"}';" +
        "k '{\"hook_event_name\":\"PreToolUse\",\"session_id\":\"t\",\"tool_name\":\"AskUserQuestion\",\"tool_input\":{\"questions\":[" +
        "{\"question\":\"Hangi renk?\",\"header\":\"Renk\",\"multiSelect\":false,\"options\":[{\"label\":\"Kirmizi\"},{\"label\":\"Mavi\"},{\"label\":\"Yesil\"}]}," +
        "{\"question\":\"Hangi boyut?\",\"header\":\"Boyut\",\"multiSelect\":false,\"options\":[{\"label\":\"Kucuk\"},{\"label\":\"Buyuk\"}]}]}}'; cls"
    );
    await adaCdp.bekle(`!!document.querySelector('[role="group"][aria-label*="soru 2: Hangi boyut?"]')`, 15000, 'ada: iki soru');
    kontrol('ada: iki soru ayni anda, sayac 0/2', await adaCdp.js(`document.body.innerText.includes('0/2') && document.body.innerText.includes('2 soru')`));
    kontrol('ada: cevaplar tamamlanmadan "Cevapları gönder" kapali', await adaCdp.js(`[...document.querySelectorAll('.ada-kart button')].find(b => b.textContent.includes('Cevapları gönder'))?.disabled === true`));
    await uyu(1100); // SORU_HAZIR_MS: soru ekrani cizilmeden rakam gitmesin
    kontrol('ada: 1. soruda Mavi secildi', await adaCdp.js(adaDugme('2Mavi')));
    await adaCdp.bekle(`!!document.querySelector('[data-soru="0"] button[aria-pressed="true"]')`, 3000, 'secili isaret');
    // Her sorunun kendi "Kendi cevabın…" satiri var; 2. sorununki.
    kontrol('ada: 2. soruda "Kendi cevabın…" kutuyu acti', await adaCdp.js(`(() => { const b = [...document.querySelectorAll('[data-soru="1"] button')].find(x => x.textContent.trim() === 'Kendi cevabın…'); if (!b) return false; b.click(); return true; })()`));
    await adaCdp.bekle(`!!document.querySelector('input[aria-label$="soru 2: kendi cevabın"]')`, 3000, 'serbest cevap kutusu');
    // Serbest metin: kabukta "23" + bu metin tek satir olur -> rakamlar dosyaya yazilir.
    await adaCdp.js(`(() => {
      const i = document.querySelector('input[aria-label$="soru 2: kendi cevabın"]');
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, ${JSON.stringify("| Out-File -FilePath '" + cokDosya + "'")});
      i.dispatchEvent(new Event('input', { bubbles: true }));
      i.form.requestSubmit();
      return true; })()`);
    await adaCdp.bekle(`document.body.innerText.includes('2/2')`, 3000, 'sayac 2/2');
    kontrol('ada: "Cevapları gönder" tikladi', await adaCdp.js(`(() => { const b = [...document.querySelectorAll('.ada-kart button')].find(x => x.textContent.includes('Cevapları gönder')); if (!b || b.disabled) return false; b.click(); return true; })()`));
    // Dizi: "2" (Mavi), "3" (N+1 = Type something), metin, Enter, ardindan "1" (Review: Submit).
    const cok = await dosyaBekle(cokDosya);
    kontrol('ada: cok soru dizisi kabuga dogru sirayla gitti ("2","3",metin,Enter)', cok === '23', cok);
    await uyu(800); // son "1" (Submit) 350 ms sonra gelir
    await kabugaYaz(" | Out-File -FilePath '" + submitDosya + "'");
    const submit = await dosyaBekle(submitDosya);
    kontrol('ada: Review ekrani icin sonda "1" (Submit) gitti', submit === '1', submit);
    kontrol('ada: gonderilince "Gönderildi" yazdi', await adaCdp.js(`document.body.innerText.includes('Gönderildi')`));

    // Bitti + son soz + Gördüm. Ana pencere "bakmiyor" sayilir ki dikkat rozeti dussun.
    await cdp.js(`(() => { document.hasFocus = () => false; return true; })()`);
    await kabugaYaz("k '{\"hook_event_name\":\"Stop\",\"session_id\":\"t\",\"last_assistant_message\":\"**Faz 5** bitti; testler yesil.\"}'; cls");
    await adaCdp.bekle(`document.body.innerText.includes('Faz 5 bitti; testler yesil.')`, 15000, 'ada: son soz');
    kontrol('ada: bitti satirinda claude\'un son sozu (** temizlenmis)', true);
    await adaCdp.bekle(`[...document.querySelectorAll('.ada-kart button')].some(b => b.textContent.trim() === 'Gördüm')`, 5000, 'Gördüm dugmesi');
    kontrol('ada: bakilmamis bitti icin "Gördüm" var', true);
    await adaCdp.js(adaDugme('Gördüm'));
    await cdp.bekle(`!document.querySelector('[role="tab"][title*="dikkat bekliyor"]')`, 5000, 'Gördüm -> rozet dustu');
    kontrol('ada: Gördüm Kokpit\'teki dikkat rozetini dusurdu (oturuma bir sey gitmeden)', true);
    await adaCdp.bekle(`![...document.querySelectorAll('.ada-kart button')].some(b => b.textContent.trim() === 'Gördüm')`, 3000, 'Gördüm kalkti');
    kontrol('ada: Gördüm sonrasi dugme kalkti, son soz durdu', await adaCdp.js(`document.body.innerText.includes('Faz 5 bitti')`));
    await cdp.js(`(() => { document.hasFocus = () => true; return true; })()`);

    // Goz (v2.5): hal, bakis ve alt ajan noktalari kanca durumundan.
    const gozHali = `(() => { const g = document.querySelector('.ada-goz'); return g ? g.dataset.hal + '/' + (g.dataset.poz ?? '') + '/' + document.querySelectorAll('.ada-goz-altlar i').length : null; })()`;
    await kabugaYaz(
      "k '{\"hook_event_name\":\"UserPromptSubmit\",\"session_id\":\"t\"}';" +
        "k '{\"hook_event_name\":\"PreToolUse\",\"session_id\":\"t\",\"tool_name\":\"Read\",\"tool_input\":{\"file_path\":\"C:/x/a.md\"}}';" +
        "k '{\"hook_event_name\":\"SubagentStart\",\"session_id\":\"t\",\"agent_id\":\"a1\",\"agent_type\":\"kasif\"}'; cls"
    );
    kontrol('goz: Read -> okuyor, 1 alt ajan noktasi', await adaCdp.bekle(`${gozHali} === 'calisiyor/oku/1'`, 8000, 'goz oku').catch(async () => false), await adaCdp.js(gozHali));
    await kabugaYaz(
      "k '{\"hook_event_name\":\"SubagentStop\",\"session_id\":\"t\",\"agent_id\":\"a1\",\"agent_type\":\"kasif\"}';" +
        "k '{\"hook_event_name\":\"PreToolUse\",\"session_id\":\"t\",\"tool_name\":\"Bash\",\"tool_input\":{\"command\":\"npm test\"}}'; cls"
    );
    kontrol('goz: SubagentStop noktayi dusurdu, Bash -> komut', await adaCdp.bekle(`${gozHali} === 'calisiyor/komut/0'`, 8000, 'goz komut').catch(async () => false), await adaCdp.js(gozHali));
    await kabugaYaz("k '{\"hook_event_name\":\"Stop\",\"session_id\":\"t\",\"last_assistant_message\":\"ok\"}'; cls");
    kontrol('goz: Stop -> kisa sevinc (mutlu)', await adaCdp.bekle(`${gozHali} === 'mutlu//0'`, 8000, 'goz mutlu').catch(async () => false), await adaCdp.js(gozHali));

    // Tek soru + rakam tusu (klavye yolu): odak ilk secenekte, "3" basilir -> kabuga "3".
    const rakamDosya = path.join(os.tmpdir(), 'kokpit-rakam-' + Date.now().toString(36) + '.txt');
    await kabugaYaz(
      "k '{\"hook_event_name\":\"UserPromptSubmit\",\"session_id\":\"t\"}';" +
        "k '{\"hook_event_name\":\"PreToolUse\",\"session_id\":\"t\",\"tool_name\":\"AskUserQuestion\",\"tool_input\":{\"questions\":[{\"question\":\"Tek soru?\",\"header\":\"Tek\",\"multiSelect\":false,\"options\":[{\"label\":\"A\"},{\"label\":\"B\"},{\"label\":\"C\"}]}]}}'; cls"
    );
    await adaCdp.bekle(`!!document.querySelector('[role="group"][aria-label*="sorusu: Tek soru?"]')`, 15000, 'ada: tek soru');
    kontrol('ada: yeni soru eski cevap durumunu tasimiyor (Gönderildi yok)', await adaCdp.js(`!document.body.innerText.includes('Gönderildi')`));
    await uyu(1100);
    // Kisayolun yaptigi gibi ada pencereye odak alir (ada.klavye -> odakla); tus olaylari ancak
    // odakli pencereye gider. Sonra ilk secenek odaklanir ve "3" basilir.
    await adaCdp.js(`(() => { window.kokpit.adaOdak(true); return true; })()`);
    await uyu(300);
    await adaCdp.js(`(() => { document.querySelector('[role="group"][aria-label*="Tek soru?"] button[data-eylem]').focus(); return true; })()`);
    kontrol('ada: odak alinca klavye ipucu gorundu', await adaCdp.bekle(`document.body.innerText.includes('seçer') && document.body.innerText.includes('bırakır')`, 2000, 'ipucu').catch(() => false));
    await adaCdp.tus('3');
    await uyu(600);
    await kabugaYaz(" | Out-File -FilePath '" + rakamDosya + "'");
    const rakam = await dosyaBekle(rakamDosya);
    kontrol('ada: rakam tusu (3) secenegi secti ve kabuga "3" gitti', rakam === '3', rakam);
    kontrol('ada: gonderince odak birakildi (ipucu kalkti)', await adaCdp.bekle(`!document.body.innerText.includes('bırakır')`, 2000, 'odak birakildi').catch(() => false));
    await adaCdp.gonder('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 5, y: 510 });
    for (const f of [cokDosya, submitDosya, rakamDosya]) try { fs.unlinkSync(f); } catch { /* yok */ }

    await cdp.js(`(() => { document.querySelector('.xterm-helper-textarea')?.focus(); return true; })()`);
    await cdp.yaz("k '{\"hook_event_name\":\"Stop\",\"session_id\":\"t\"}'; cls");
    await cdp.tus('Enter');

    console.log('Calistir (v2.3): servis bolmesi claude sekmesinin yaninda, adres, yeniden baslat, durdur');
    const projeAdi = await cdp.js(`document.querySelector('[role="tab"] .enstruman')?.textContent ?? ''`);
    const projeYolu = await cdp.js(`window.kokpit.durumGetir().then(d => d.veri.projeler.find(p => p.ad === ${JSON.stringify(projeAdi)})?.yol ?? null)`);
    const defterSatirOnce = fs.existsSync(DEFTER) ? fs.readFileSync(DEFTER, 'utf8').trim().split(/\r?\n/).length : 0;
    // Sahte "dev sunucusu": adresi yazar ve calismaya devam eder. Komut test veri dizinindeki
    // calistir.json'a yazilir.
    const servisKomutu = `node -e "console.log('  Local:   http://localhost:51999/'); setInterval(() => {}, 1000)"`;
    kontrol('tarif kaydedildi', !!projeYolu && (await cdp.js(`window.kokpit.calistirKaydet(${JSON.stringify(projeYolu)}, ${JSON.stringify(servisKomutu)})`)) === true, projeAdi + ' ' + projeYolu);
    await cdp.tus('1', 2, 'Digit1');
    await cdp.bekle(`!!document.querySelector('button[aria-label=${JSON.stringify(projeAdi + ' uygulamasını çalıştır')}]')`, 5000, 'calistir dugmesi');
    await cdp.js(`(() => { document.querySelector('button[aria-label=${JSON.stringify(projeAdi + ' uygulamasını çalıştır')}]').click(); return true; })()`);
    await cdp.bekle(`[...document.querySelectorAll('[role="tab"]')].some(t => t.textContent.includes(${JSON.stringify(projeAdi + ' +1')}))`, 8000, 'servis ayni sekmede');
    kontrol('servis bolmesi acik claude sekmesinin icine acildi ("' + projeAdi + ' +1")', true);
    await cdp.bekle(`[...document.querySelectorAll('button')].some(b => b.textContent.includes('localhost:51999'))`, 20000, 'servis adresi');
    kontrol('servis basliginda adres dugmesi (localhost:51999)', true);
    kontrol('Pano satirinda calisiyor isareti (adres)', await cdp.bekle(`(() => { const b = document.querySelector('button[aria-label=${JSON.stringify(projeAdi + ' çalışıyor, bölmesine git')}]'); return !!b && b.textContent.includes(':51999'); })()`, 5000, 'pano isareti').catch(() => false), await cdp.js(`[...document.querySelectorAll('table button[aria-label]')].map(b => b.getAttribute('aria-label') + '=' + b.textContent).filter(x => x.includes(${JSON.stringify(projeAdi)})).join(' | ')`));
    const servisSayisi = () => (fs.readFileSync(LOG('pty-server.log'), 'utf8').match(/komut=servis: /g) || []).length;
    const servisOnce = servisSayisi();
    await cdp.js(`(() => { document.querySelector('button[aria-label=${JSON.stringify(projeAdi + ' uygulamasını yeniden başlat')}]').click(); return true; })()`);
    // Kanit log'dan: eski agac olur, YENI bir servis sureci acilir. (Yalniz "adres gorunuyor"a
    // bakmak yetmez: bolme degismeseydi eski adres de gorunurdu.)
    let yeniAcildi = false;
    for (let i = 0; i < 60 && !yeniAcildi; i++) { yeniAcildi = servisSayisi() > servisOnce; if (!yeniAcildi) await uyu(250); }
    kontrol('yeniden baslat: yeni servis sureci acildi', yeniAcildi, cdp.konsol.slice(-6).join(' | '));
    await cdp.bekle(`[...document.querySelectorAll('button')].some(b => b.textContent.includes('localhost:51999'))`, 20000, 'yeniden baslatilan servis adresi');
    kontrol('yeniden baslat: bolme yerinde, adres yeniden geldi', await cdp.js(`[...document.querySelectorAll('[role="tab"]')].some(t => t.textContent.includes(${JSON.stringify(projeAdi + ' +1')}))`));
    const konsolOnce = cdp.konsol.length;
    await cdp.js(`(() => { document.querySelector('button[aria-label=${JSON.stringify(projeAdi + ' uygulamasını durdur')}]').click(); return true; })()`);
    await cdp.bekle(`![...document.querySelectorAll('[role="tab"]')].some(t => t.textContent.includes('+1'))`, 8000, 'servis kapandi');
    kontrol('durdur: servis sorusuz kapandi (kapatma diyalogu yok)', !cdp.konsol.slice(konsolOnce).some((k) => k.includes('[kapatma]')), cdp.konsol.slice(konsolOnce).join(' | '));
    const yeniSatirlar = fs.existsSync(DEFTER) ? fs.readFileSync(DEFTER, 'utf8').trim().split(/\r?\n/).slice(defterSatirOnce) : [];
    kontrol('servis oturum defterine girmedi (geri yukleme claude acmasin)', yeniSatirlar.length === 0, yeniSatirlar);
    // taskkill ~1 sn surer: log satiri bolme kapandiktan sonra gelir, beklenir.
    let servisLogu = '';
    for (let i = 0; i < 30; i++) {
      servisLogu = fs.readFileSync(LOG('pty-server.log'), 'utf8');
      if ((servisLogu.match(/servis agaci olduruldu pid=\d+ kod=0/g) || []).length >= 2) break;
      await uyu(250);
    }
    kontrol('yeniden baslat + durdur: iki servis agaci da olduruldu (pty-server.log)', (servisLogu.match(/servis agaci olduruldu pid=\d+ kod=0/g) || []).length >= 2, servisLogu.slice(-300));
    // Komut sorusu: "komutu degistir" kutuyu mevcut komutla acar; Esc kapatir.
    await cdp.tus('P', 2 | 8, 'KeyP');
    await cdp.bekle(`!!document.querySelector('dialog[open] [role="combobox"]')`, 3000, 'palet');
    await cdp.yaz(projeAdi + ' komutu');
    await uyu(150);
    await cdp.tus('Enter');
    await cdp.bekle(`!!document.querySelector('dialog[open] input[aria-label="Çalıştırma komutu"]')`, 3000, 'calistir kutusu');
    kontrol('komut kutusu mevcut komutla acildi', (await cdp.js(`document.querySelector('dialog[open] input[aria-label="Çalıştırma komutu"]').value`)) === servisKomutu);
    await cdp.tus('Escape');
    await uyu(200);
    kontrol('Esc komut kutusunu kapatti', await cdp.js(`!document.querySelector('dialog[open]')`));
    kontrol('tarif test dizinine yazildi, gercek ~/.kokpit\'e degil', fs.existsSync(CALISTIR) && fs.readFileSync(CALISTIR, 'utf8').includes('51999'));
    await cdp.tus('2', 2, 'Digit2');

    console.log('Arama');
    await cdp.js(`(() => { document.querySelector('.xterm-helper-textarea')?.focus(); return true; })()`);
    await cdp.tus('F', 2 | 8, 'KeyF');
    await cdp.bekle(`!!document.querySelector('[role="search"] input')`, 3000, 'arama kutusu');
    kontrol('Ctrl+Shift+F arama cubugunu acti', true);
    // Escape odak inputa gectikten sonra gonderilir; once gonderilirse xterm'e gider (yuk
    // altinda ara sira oluyordu). Sonuc ayni sekilde istenir, yalniz sabit uyku yerine beklenir.
    await cdp.bekle(`document.activeElement?.closest('[role="search"]') != null`, 3000, 'arama odagi');
    await cdp.tus('Escape');
    kontrol('Escape aramayi kapatti', await cdp.bekle(`!document.querySelector('[role="search"]')`, 3000, 'arama kapandi').catch(() => false));

    console.log('Yazi boyutu');
    await cdp.js(`(() => { document.querySelector('.xterm-helper-textarea')?.focus(); return true; })()`);
    await cdp.tus('=', 2, 'Equal');
    await uyu(500);
    const ayar = JSON.parse(fs.readFileSync(AYARLAR, 'utf8'));
    kontrol('Ctrl+= yazi boyutunu 14 yapip diske yazdi', ayar.yaziBoyutu === 14, JSON.stringify(ayar));
    await cdp.tus('0', 2, 'Digit0');
    await uyu(500);
    kontrol('Ctrl+0 varsayilana dondurdu', JSON.parse(fs.readFileSync(AYARLAR, 'utf8')).yaziBoyutu === 13);

    console.log('Kisayollar terminale sizmiyor');
    await cdp.tus('1', 2, 'Digit1');
    await uyu(200);
    kontrol('Ctrl+1 Pano\'ya gecti', await cdp.js(`document.querySelector('h1')?.textContent === 'Pano'`));
    await cdp.tus('2', 2, 'Digit2');
    await uyu(200);
    kontrol('Ctrl+2 Terminaller\'e dondu', await cdp.js(`document.querySelector('h1')?.textContent !== 'Pano'`));

    console.log('Sekmeyi kapat (cocuk surec yok -> diyalog yok)');
    await cdp.js(`(() => { document.querySelector('[aria-label$="sekmesini kapat"]').click(); return true; })()`);
    await cdp.bekle(`document.querySelectorAll('[role="tab"]').length === 0`, 5000, 'sekme kapandi');
    kontrol('sekme kapandi, Pano\'ya donuldu', await cdp.js(`document.querySelector('h1')?.textContent === 'Pano'`));
    await uyu(300);
    const ozetSatiri = fs.readFileSync(DEFTER, 'utf8').trim().split(/\r?\n/).map((x) => JSON.parse(x)).filter((x) => x.olay === 'kapandi' && x.ozet).pop();
    kontrol('kapanan oturumun ozeti deftere yazildi (1 dosya +2 -1)', !!ozetSatiri && ozetSatiri.ozet.dosya === 1 && ozetSatiri.ozet.arti === 2 && ozetSatiri.ozet.eksi === 1, ozetSatiri && ozetSatiri.ozet);

    console.log('Guvenli kapat (cocuk surec var -> cikis tuslari, kendi kapanmasi beklenir)');
    await cdp.js(AC_DUGMESI);
    await cdp.bekle(`!!document.querySelector('[role="tab"] .bg-aksan')`, 20000, 'oturum acik');
    await cocukBaslat(cdp);
    await cdp.js(`(() => { document.querySelector('[aria-label$="sekmesini kapat"]').click(); return true; })()`);
    await cdp.bekle(`[...document.querySelectorAll('[role="status"]')].some(p => p.textContent.includes('Güvenli kapatılıyor'))`, 10000, 'kapaniyor seridi');
    kontrol('bolmede "Guvenli kapatiliyor" seridi', true);
    await cdp.bekle(`document.querySelectorAll('[role="tab"]').length === 0`, 30000, 'guvenli cikis sonrasi sekme');
    kontrol('surec kendi yoluyla bitti, sekme kendiliginden kapandi', true);

    console.log('Defter: son oturum Pano\'da');
    await cdp.bekle(`[...document.querySelectorAll('table tbody th')].some(th => th.textContent.includes('son oturum'))`, 5000, 'son oturum satiri');
    kontrol('kapanan oturum Pano satirinda "son oturum" olarak goruluyor', true);
    const beyinMetni = await cdp.js(`[...document.querySelectorAll('table tbody th')].map(th => th.textContent).find(t => t.includes('son oturum')) ?? ''`);
    kontrol('son oturumun yaninda beyin kaydi var (test kabugu claude acmaz -> "transcript yok")', beyinMetni.includes('transcript yok'), beyinMetni.slice(0, 80));

    console.log('Saglik sayfasi');
    await cdp.tus('3', 2, 'Digit3');
    await cdp.bekle(`document.querySelector('h1')?.textContent === 'Sağlık'`, 3000, 'saglik basligi');
    kontrol('Ctrl+3 Saglik sayfasini acti', true);
    kontrol('boru zinciri cizildi (4 halka)', (await cdp.js(`document.querySelectorAll('[aria-label="Beyin boru zinciri"] p.etiket').length`)) === 4);
    const grafik = await cdp.bekle(`!!document.querySelector('figure svg[role="img"]')`, 5000, 'butce grafigi').catch(() => false);
    kontrol('butce grafigi var', grafik, grafik ? undefined : JSON.stringify(await cdp.js(`(() => { const f = document.querySelector('figure'); const s = [...document.querySelectorAll('section')].find(x => x.textContent.includes('Bütçe')); return new Promise(c => { let raf = false; requestAnimationFrame(() => { raf = true; }); setTimeout(() => c({ figure: !!f, divGenislik: f?.firstElementChild?.clientWidth, gorunurluk: document.visibilityState, rafTetiklendi: raf }), 500); }); })()`)));
    kontrol('Aria ile konus dugmesi var', await cdp.js(`[...document.querySelectorAll('button')].some(b => b.textContent.includes('Aria ile konuş'))`));
    console.log('Envanter sayfasi');
    await cdp.tus('4', 2, 'Digit4');
    await cdp.bekle(`document.querySelector('h1')?.textContent === 'Envanter'`, 3000, 'envanter basligi');
    kontrol('Ctrl+4 Envanter sayfasini acti', true);
    kontrol('drift blogu + skill listesi cizildi', (await cdp.js(`document.querySelectorAll('[aria-label="Envanter"] section').length`)) >= 5);
    await cdp.tus('1', 2, 'Digit1');

    console.log('Arsiv grubu');
    const satirSay = `document.querySelectorAll('table tbody tr:not(:first-child)').length`;
    const arsivOnce = await cdp.js(`document.querySelector('table [aria-expanded]')?.getAttribute('aria-expanded')`);
    const satirOnce = await cdp.js(satirSay);
    await cdp.js(`(() => { document.querySelector('table [aria-expanded]').click(); return true; })()`);
    await uyu(300);
    const satirSonra = await cdp.js(satirSay);
    kontrol('arsiv dugmesi arsiv satirlarini ac/kapa yapiyor', satirSonra !== satirOnce, satirOnce + ' -> ' + satirSonra);
    await cdp.js(`(() => { document.querySelector('table [aria-expanded]').click(); return true; })()`);
    await uyu(300);
    kontrol('arsiv durumu geri alindi', (await cdp.js(`document.querySelector('table [aria-expanded]')?.getAttribute('aria-expanded')`)) === arsivOnce);

    console.log('Komut paleti (Ctrl+Shift+P)');
    await cdp.tus('P', 2 | 8, 'KeyP');
    await cdp.bekle(`!!document.querySelector('dialog[open] [role="combobox"]')`, 3000, 'palet');
    kontrol('palet acildi, odak arama kutusunda', await cdp.js(`document.activeElement?.getAttribute('role') === 'combobox'`));
    await cdp.yaz('envanter');
    await uyu(150);
    kontrol('arama suzuyor (tek sayfa sonucu ustte)', await cdp.js(`document.querySelector('[role="option"][aria-selected="true"]')?.textContent.includes('Envanter')`));
    await cdp.tus('Enter');
    await cdp.bekle(`document.querySelector('h1')?.textContent === 'Envanter'`, 3000, 'paletten envanter');
    kontrol('Enter komutu calistirdi, palet kapandi', await cdp.js(`!document.querySelector('dialog[open]')`));
    await cdp.tus('1', 2, 'Digit1');
    const kisayolLogu = fs.readFileSync(LOG('kokpit.log'), 'utf8').split('\n').filter((s) => s.includes('genel kisayol')).pop() ?? '';
    // Gercek Kokpit aciksa kisayol onda: test orneginde "KAYDEDILEMEDI" beklenen durum.
    kontrol('genel kisayol kaydi denendi ve loglandi', /genel kisayol Control\+Alt\+Shift\+[NAG] (kayitli|KAYDEDILEMEDI)/.test(kisayolLogu), kisayolLogu);

    console.log('Inbox notu (Ctrl+Shift+N)');
    const d = new Date();
    const gun = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); // yerel gun, UTC degil
    const inboxDosya = path.join(INBOX, gun + '.md');
    const inboxOnce = fs.existsSync(inboxDosya) ? fs.readFileSync(inboxDosya, 'utf8') : null;
    await cdp.tus('N', 2 | 8, 'KeyN');
    await cdp.bekle(`!!document.querySelector('dialog[open] textarea')`, 3000, 'not kutusu');
    kontrol('not kutusu acildi ve odak textarea\'da', await cdp.js(`document.activeElement?.tagName === 'TEXTAREA'`));
    const isaret = 'kokpit-test-notu-' + Date.now().toString(36);
    await cdp.yaz(isaret);
    await cdp.tus('Enter');
    await cdp.bekle(`!document.querySelector('dialog[open]')`, 5000, 'not kutusu kapandi');
    const inboxSonra = fs.existsSync(inboxDosya) ? fs.readFileSync(inboxDosya, 'utf8') : '';
    kontrol('not Inbox/Dump/' + gun + '.md dosyasina SONA eklendi', inboxSonra.includes(isaret) && (inboxOnce === null || inboxSonra.startsWith(inboxOnce)), inboxSonra.slice(-120));
    kontrol('baslikta "Not Inbox\'a düştü" bildirimi', await cdp.js(`!!document.querySelector('header [role="status"]')`));
    // Test notunu geri al: dosya yoksa sil, varsa eklenen satiri cikar.
    if (inboxOnce === null) fs.unlinkSync(inboxDosya);
    else fs.writeFileSync(inboxDosya, inboxSonra.split('\n').filter((l) => !l.includes(isaret)).join('\n'));

    console.log('Ada v2.6: gorev ver -> arka planda yeni oturum, gorunum degismez');
    await cdp.tus('1', 2, 'Digit1');
    await cdp.bekle(`document.querySelector('h1')?.textContent === 'Pano'`, 3000, 'pano');
    await adaCdp.gonder('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 230, y: 18 });
    await adaCdp.bekle(`!!document.querySelector('section[aria-label="Görev ver"] button[aria-expanded]')`, 5000, 'gorev kutusu');
    await adaCdp.js(`(() => { document.querySelector('section[aria-label="Görev ver"] button[aria-expanded]').click(); return true; })()`);
    await adaCdp.bekle(`document.querySelectorAll('ul[aria-label="Proje seç"] button').length > 1`, 3000, 'proje listesi');
    const gorevProjesi = await adaCdp.js(`(() => { const b = document.querySelectorAll('ul[aria-label="Proje seç"] button')[1]; b.click(); return b.querySelector('.enstruman').textContent; })()`);
    kontrol('gorev: proje secildi (' + gorevProjesi + '), liste kapandi', await adaCdp.js(`!document.querySelector('ul[aria-label="Proje seç"]') && document.querySelector('section[aria-label="Görev ver"]').innerText.includes(${JSON.stringify(gorevProjesi)})`));
    const gorevMetni = 'Testleri koş, "kırmızı" olanları düzelt; $env:X & bitti';
    await adaCdp.js(`(() => {
      const i = document.querySelector('section[aria-label="Görev ver"] input');
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, ${JSON.stringify(gorevMetni)});
      i.dispatchEvent(new Event('input', { bubbles: true }));
      i.form.requestSubmit();
      return true; })()`);
    await cdp.bekle(`[...document.querySelectorAll('[role="tab"]')].some(t => t.textContent.includes(${JSON.stringify(gorevProjesi)}))`, 10000, 'gorev sekmesi');
    kontrol('gorev: ' + gorevProjesi + ' icin yeni sekme acildi', true);
    kontrol('gorev: ana pencere Pano\'da kaldi (arka plan)', await cdp.js(`document.querySelector('h1')?.textContent === 'Pano'`));
    kontrol('gorev: Ada "oturumu açılıyor" dedi', await adaCdp.js(`document.body.innerText.includes('oturumu açılıyor')`));
    await adaCdp.bekle(`[...document.querySelectorAll('ul[aria-label="Kokpit oturumları"] li')].some(li => li.textContent.includes(${JSON.stringify(gorevProjesi)}))`, 10000, 'ada oturum satiri');
    kontrol('gorev: yeni oturum Ada listesinde', true);
    let gorevLogu = '';
    for (let i = 0; i < 30 && !/gorev alindi: \d+ karakter/.test(gorevLogu); i++) { await uyu(200); gorevLogu = fs.readFileSync(LOG('pty-server.log'), 'utf8'); }
    kontrol('gorev metni PTY sunucusuna ulasti (' + gorevMetni.length + ' karakter)', gorevLogu.includes('gorev alindi: ' + gorevMetni.length + ' karakter'), gorevLogu.slice(-200));
    // Kokpit'in kendi oturumu dis listede gorunmez: ayni claude kimligiyle bir kayit yazilir.
    const gorevKimligi = fs.readFileSync(DEFTER, 'utf8').trim().split(/\r?\n/).map((x) => JSON.parse(x)).filter((x) => x.olay === 'acildi').pop()?.claude;
    disYaz('201', { sessionId: gorevKimligi, cwd: 'C:\\x\\KendiOturumu', status: 'busy' });
    disYaz('202', { sessionId: 'yabanci-1', cwd: 'C:\\x\\Yabanci', status: 'busy' });
    await adaCdp.bekle(`document.body.innerText.includes('Yabanci')`, 10000, 'yabanci dis oturum');
    kontrol('dis liste: Kokpit\'in kendi oturumu (ayni kimlik) gorunmez, yabanci gorunur', await adaCdp.js(`!document.body.innerText.includes('KendiOturumu')`));
    disSil();
    // Listede olmayan proje: main reddeder, sekme acilmaz.
    const sekmeOnce = await cdp.js(`document.querySelectorAll('[role="tab"]').length`);
    await adaCdp.js(`(() => { window.kokpit.adaGorev({ ad: 'YokBoyleProje', metin: 'x' }); return true; })()`);
    await uyu(800);
    kontrol('gorev: listede olmayan proje reddedildi', (await cdp.js(`document.querySelectorAll('[role="tab"]').length`)) === sekmeOnce && fs.readFileSync(LOG('kokpit.log'), 'utf8').includes('ada gorevi reddedildi (proje)'));
    await adaCdp.gonder('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 5, y: 510 });
    await cdp.js(`(() => { document.querySelector('[aria-label$="sekmesini kapat"]').click(); return true; })()`);
    await cdp.bekle(`document.querySelectorAll('[role="tab"]').length === 0`, 8000, 'gorev sekmesi kapandi');

    console.log('Surec calisirken uygulamayi kapat (guvenli kapat + geri yukleme)');
    await cdp.js(AC_DUGMESI);
    await cdp.bekle(`!!document.querySelector('[role="tab"] .bg-aksan')`, 20000, 'oturum acik');
    await cocukBaslat(cdp);
  } catch (e) {
    kontrol('senaryo', false, e.message);
  }
  // Main'in eski 3 sn bekcisi burada pencereyi, guvenli cikis bitmeden kapatirdi.
  await kapat(app, cdp, 'uygulama guvenli cikisi bekleyip kapandi', 30000);
  const kapanisLogu = fs.readFileSync(LOG('pty-server.log'), 'utf8').split('\n').slice(-15).join('\n');
  kontrol('kapanista guvenli cikis tamamlandi (pty-server.log)', /guvenli cikis tamam/.test(kapanisLogu), kapanisLogu.slice(-300));

  console.log('Ikinci acilis: geri yukleme teklifi');
  ({ app, cdp, adaCdp } = await baslat());
  try {
    await cdp.bekle(`!!document.querySelector('[role="status"] button')`, 20000, 'geri yukleme seridi');
    const metin = await cdp.js(`document.querySelector('[role="status"]')?.textContent ?? ''`);
    kontrol('serit 1 oturumu teklif ediyor', metin.includes('1 oturum açıktı'), metin.slice(0, 80));
    await cdp.js(`(() => { [...document.querySelectorAll('[role="status"] button')].find(b => b.textContent.trim() === 'Geri yükle').click(); return true; })()`);
    await cdp.bekle(`!!document.querySelector('[role="tab"] .bg-aksan')`, 20000, 'geri yuklenen oturum acik');
    kontrol('Geri yukle sekmeyi acti (test kabugu; gercekte claude --resume <kimlik>)', true);
    // Kimlik zinciri: kapanista acik kalan oturumun claude kimligi, geri yuklenen oturuma aynen
    // gecmeli (yoksa --continue o klasordeki BASKA bir konusmayi acabilirdi).
    const acilislar = fs.readFileSync(DEFTER, 'utf8').trim().split(/\r?\n/).map((x) => JSON.parse(x)).filter((x) => x.olay === 'acildi');
    const sonIki = acilislar.slice(-2);
    kontrol(
      'geri yuklenen oturum ayni claude kimligiyle acildi (--resume)',
      sonIki.length === 2 && /^[0-9a-f-]{36}$/.test(sonIki[0].claude ?? '') && sonIki[0].claude === sonIki[1].claude && sonIki[0].id !== sonIki[1].id,
      sonIki
    );
    kontrol('her yeni oturum kendi kimligini aldi (tekrar yok)', new Set(acilislar.slice(0, -1).map((x) => x.claude)).size === acilislar.length - 1, acilislar.map((x) => x.claude));
    kontrol('serit kayboldu', await cdp.js(`!document.querySelector('[role="status"] button')`));
    await cdp.js(`(() => { document.querySelector('[aria-label$="sekmesini kapat"]').click(); return true; })()`);
    await cdp.bekle(`document.querySelectorAll('[role="tab"]').length === 0`, 5000, 'sekme kapandi');
  } catch (e) {
    kontrol('geri yukleme senaryosu', false, e.message);
  }
  await kapat(app, cdp, 'ikinci calisma temiz kapandi');

  console.log('Tepsi (v2.6): X tepsiye indirir, "Kokpit\'ten cik" gercekten cikar');
  ({ app, cdp, adaCdp } = await baslat({ KOKPIT_TEST_TEPSI: '1' }));
  try {
    await cdp.bekle(`document.querySelectorAll('table tbody tr').length > 0`, 20000, 'proje tablosu');
    let cikti = false;
    app.once('exit', () => { cikti = true; });
    kontrol('X: WM_CLOSE ana pencereye gitti', xBas(app.pid) === 1);
    await uyu(2500);
    kontrol('X: uygulama cikmadi', !cikti);
    kontrol('X: ana pencere gizlendi (OS)', !osGorunur(app.pid, true));
    kontrol('X: Ada yasiyor ve OS\'ta gorunur', osGorunur(app.pid, false) && (await adaCdp.js(`!!document.querySelector('.ada-kart')`)));
    kontrol('tepsi kuruldu, ilk kapanista bir kez bildirildi', JSON.parse(fs.readFileSync(AYARLAR, 'utf8')).tepsiBildirildi === true);
    // Ada'ya tikla: oturum yok -> Kokpit one gelir.
    await adaCdp.js(`(() => { document.querySelector('.ada-kart button[data-ada-ana]').click(); return true; })()`);
    await cdp.bekle(`document.visibilityState === 'visible'`, 5000, 'ada tiklamasi pencereyi acti').catch(() => {});
    kontrol('Ada tiklamasi (oturum yok) Kokpit\'i one getirdi', osGorunur(app.pid, true));
    const cikis = new Promise((r) => { const t = setTimeout(() => r('zaman-asimi'), 10000); app.on('exit', (k) => { clearTimeout(t); r(k); }); });
    await cdp.js(`(() => { window.kokpit.uygulamaCik(); return true; })()`);
    kontrol('"Kokpit\'ten çık" uygulamayi kapatti (acik oturum yok -> soru yok)', (await cikis) !== 'zaman-asimi');
  } catch (e) {
    kontrol('tepsi senaryosu', false, e.message);
    try { app.kill(); } catch { /* */ }
  }
  try { bekleyenCocuk.kill(); } catch { /* */ }
  limitSunucusu.close();

  // Gecici veri dizini silinir. Gercek ~/.kokpit'e test boyunca hic dokunulmadi.
  if (process.env.KOKPIT_TEST_KEEP === '1') {
    console.log('--- test dizini (silinmedi): ' + TEST_DIZIN + ' ---');
    console.log(fs.existsSync(DEFTER) ? fs.readFileSync(DEFTER, 'utf8') : '(defter yok)');
  } else {
    try { fs.rmSync(TEST_DIZIN, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 }); } catch { /* bir surec hala tutuyorsa temp'te kalir */ }
  }

  console.log(basarisiz === 0 ? '\nTUMU GECTI' : `\n${basarisiz} KONTROL BASARISIZ`);
  process.exit(basarisiz === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('test kosucusu hatasi: ' + e.stack);
  process.exit(1);
});
