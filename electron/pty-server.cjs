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
const crypto = require('crypto');
const { spawnSync, execFile } = require('child_process');
const { adresBul } = require('./adres.cjs');
const GOREV = require('./gorev.cjs');

const TOKEN = process.env.KOKPIT_PTY_TOKEN || '';
// Kokpit'in veri dizini (config.cjs; testlerde KOKPIT_DIZIN ile ayrilir, ortamdan miras).
const LOG_DOSYA = path.join(require('./config.cjs').KOKPIT_DIZIN, 'pty-server.log');

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

/**
 * Ebeveyn Claude oturumunun izlerini temizle.
 *
 * Kokpit bir BASLATICI, ic ice bir ajan degil. Eger Kokpit'in kendisi bir claude
 * oturumunun icinden acildiysa (`npm start` bir `claude` kabugundan calistirildiysa),
 * bu isaretler tum zincir boyunca miras kaliyor: kabuk -> npm -> node -> electron ->
 * pty-server -> pwsh -> claude. Sonuc olculdu ve goruldu:
 *
 *   "Transcript saving is off - inherited CLAUDE_CODE_CHILD_SESSION marker"
 *
 * Transcript yazilmazsa IKINCI BEYIN o oturumu GORMEZ: durum.py'nin butce kalemi
 * transcript'leri okuyor, SessionEnd hook'lari konusmayi oradan aliyor.
 *
 * Bu yuzden Kokpit'in actigi her terminal, Kokpit nasil baslatilmis olursa olsun,
 * tepe seviye bir oturum gibi davranir.
 */
const TEMIZLENECEK = [
  'CLAUDECODE',
  'CLAUDE_CODE_CHILD_SESSION',
  'CLAUDE_CODE_SESSION_ID',
  'CLAUDE_CODE_BRIDGE_SESSION_ID',
  'CLAUDE_CODE_MESSAGING_SOCKET',
  'CLAUDE_CODE_MESSAGING_TOKEN',
  'CLAUDE_CODE_ENTRYPOINT',
  'CLAUDE_PID',
  'CLAUDE_EFFORT',
];

function temizOrtam() {
  const ortam = { ...process.env };
  const silinen = [];
  for (const anahtar of TEMIZLENECEK) {
    if (anahtar in ortam) {
      delete ortam[anahtar];
      silinen.push(anahtar);
    }
  }
  if (silinen.length > 0) {
    log('ebeveyn oturum isaretleri temizlendi: ' + silinen.join(', '));
  }
  return ortam;
}

const ORTAM = temizOrtam();

/** Sabit zamanli karsilastirma: token icerigi zamanlamadan sizmasin. */
function tokenGecerli(gelen) {
  const a = Buffer.from(String(gelen));
  const b = Buffer.from(TOKEN);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const uyu = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Kabugun dogrudan cocuklarinin adlari. Sorgu basarisiz olursa `null` ("bilinmiyor") doner,
 * ASLA bos liste degil: bos liste "calisan bir sey yok" demek ve kapatma onayini atlatir.
 * 2026-09-29'a kadar hata -> [] idi (fail-open): soguk pwsh + CIM zaman asimini gecince
 * claude sorusuz kapatilabiliyordu.
 */
function cocukAdlari(pid) {
  return new Promise((coz) => {
    execFile(
      POWERSHELL,
      ['-NoProfile', '-NonInteractive', '-Command',
       '(Get-CimInstance Win32_Process -Filter "ParentProcessId=' + pid + '").Name'],
      { timeout: 6000, windowsHide: true },
      (hata, stdout) => {
        if (hata) {
          log('cocuk sorgusu basarisiz pid=' + pid + ': ' + String(hata.message).split(/\r?\n/)[0]);
          coz(null);
          return;
        }
        coz(String(stdout).split(/\r?\n/).map((x) => x.trim()).filter(Boolean));
      }
    );
  });
}

/**
 * Guvenli cikis: Esc (claude calisiyorsa turu keser, bossa etkisiz), sonra Ctrl+C iki kez
 * (ilki girdi satirini temizler, ikincisi cikar). claude kendi yoluyla cikinca SessionEnd
 * hook'lari calisir ve oturum beyne duser. PTY'yi oldurmek bunu YAPMAZ. Olculdu (2026-09-29,
 * gercek claude 2.1.284): p.kill() -> SessionEnd yok; bu dizi -> bos, yarim yazili ve mesgul
 * claude'da SessionEnd tamamlandi, cikis 3-10 sn.
 *
 * Dizi BIR KEZ gonderilir. Proje SessionEnd hook'u senkron `claude -p` calistiriyor (60 sn'ye
 * kadar); claude o sirada hala cocuk olarak gorunur. Tekrar Ctrl+C gondermek hook'u keserdi.
 */
const CIKIS_BEKLEME_MS = 90_000;

/**
 * Servis bolmeleri (Calistir: npm run dev, uvicorn...) kapaninca SUREC AGACI oldurulur.
 * p.kill() yalniz kabugu kapatir; npm -> node -> vite ya da uvicorn --reload isci surecleri
 * yetim kalip portu tutabiliyordu (hafiza: hayalet port tuzagi, TenderIQ 2026-09-26).
 * taskkill /T kabugun torunlarini da alir. Senkron: cikis yolunda da calisabilsin.
 */
const servisler = new Set(); // canli servis kabuklarinin pid'leri
/** true: agac olduruldu. Basarisizsa cagiran p.kill()'e duser. */
function agaciOldur(pid) {
  try {
    const r = spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true, timeout: 8000, encoding: 'utf8' });
    log('servis agaci olduruldu pid=' + pid + ' kod=' + r.status);
    return r.status === 0;
  } catch (e) {
    log('servis agaci oldurulemedi pid=' + pid + ': ' + e.message);
    return false;
  }
}
/**
 * Bolme kapanisi icin ASENKRON surum: taskkill ~1 sn surer ve senkron hali sunucunun olay
 * dongusunu durdurup o arada TUM terminallerin ciktisini donduruyordu. Basarisizsa `yedek`
 * (p.kill) calisir. Cikis yolunda senkron olan kalir: surec cikmadan bitmeli.
 */
function agaciOldurAsenkron(pid, yedek) {
  execFile('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true, timeout: 8000 }, (hata) => {
    servisler.delete(pid);
    log('servis agaci olduruldu pid=' + pid + ' kod=' + (hata ? hata.code ?? 'hata' : 0));
    if (hata) yedek();
  });
}
function servisleriOldur() {
  for (const pid of servisler) agaciOldur(pid);
  servisler.clear();
}

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

  if (!tokenGecerli(gelenToken)) {
    log('reddedildi: token uyusmadi');
    ws.close(4401, 'yetkisiz');
    return;
  }

  let p = null;
  let servis = false;

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
      // TEST SEAM: UI testi (scripts/test-ui.cjs) gercek claude acmamali — her acilis
      // transcript ve hook tetikler. Bu degisken yalniz test kosucusundan gelir.
      const testKabugu = process.env.KOKPIT_TEST_KABUK === '1';
      // 'claude-devam': onceki calismadan geri yukleme, o klasordeki son konusmayi surdurur.
      const claudeIle = (m.komut === 'claude' || m.komut === 'claude-devam') && !testKabugu;
      // Kanca koprusu (Kokpit main, kanca.cjs): claude kendi ayar dosyasiyla acilir; hook'lar
      // projeninkilerle birlesir (olculdu 2026-10-03). Dosya yoksa duz claude.
      const kancaAyari = process.env.KOKPIT_KANCA_AYAR;
      const ayarArgumani =
        kancaAyari && fs.existsSync(kancaAyari) && !kancaAyari.includes("'")
          ? " --settings '" + kancaAyari + "'"
          : '';
      // Oturum kimligi Kokpit'te dogar (v2.3): yeni oturum `--session-id <uuid>`, geri yukleme /
      // surdurme `--resume <uuid>` — tam o konusma. Kimlik yoksa (eski defter kaydi) eskisi gibi
      // `--continue`: o klasordeki EN SON konusma, Kokpit disinda acilan baska bir oturum olabilir.
      const claudeId = typeof m.claude === 'string' && GOREV.UUID.test(m.claude) ? m.claude : '';
      // Ada'dan gorev (v2.6): metin claude'un ilk mesaji olur; ortam degiskeniyle gecer, komut
      // satirina yazilmaz (bkz. gorev.cjs). Yalniz yeni oturumda: devamda ilk mesaj yok.
      const gorevMetni = m.komut === 'claude' ? GOREV.gorevMetni(m.gorev) : '';
      if (gorevMetni) log('gorev alindi: ' + gorevMetni.length + ' karakter' + (claudeIle ? '' : ' (test kabugu: kullanilmadi)'));
      const claudeKomutu = GOREV.claudeKomutu({
        devam: m.komut === 'claude-devam',
        claudeId,
        ayarArgumani,
        gorev: gorevMetni,
      });
      // Hook basligi bu degiskeni tasir: olayin hangi sekmeye ait oldugu buradan bilinir.
      const oturumId = typeof m.oturum === 'string' && /^[\w.-]{1,160}$/.test(m.oturum) ? m.oturum : '';
      // Servis bolmesi (Calistir): projenin kendi komutu, claude degil. -NoExit: sunucu cokerse
      // hata ciktisi ekranda kalir. Komut tek satir ve sinirli (calistir.cjs ayni kurali uygular);
      // renderer zaten token'li bir kabuk acabildigi icin bu yeni bir yetki degil.
      const servisKomutu =
        m.komut === 'servis' && typeof m.calistir === 'string' && m.calistir.length <= 500 && !/[\r\n]/.test(m.calistir)
          ? m.calistir.trim()
          : '';
      if (m.komut === 'servis' && !servisKomutu) {
        gonder({ t: 'hata', mesaj: 'Geçersiz çalıştırma komutu' });
        return;
      }
      const dosya = claudeIle || testKabugu || servisKomutu ? POWERSHELL : KABUK;
      const argumanlar = servisKomutu
        ? ['-NoLogo', ...(testKabugu ? ['-NoProfile'] : []), '-NoExit', '-Command', servisKomutu]
        : claudeIle
          ? ['-NoLogo', '-NoExit', '-Command', claudeKomutu]
          : testKabugu
            ? ['-NoLogo', '-NoProfile']
            : [];

      try {
        p = pty.spawn(dosya, argumanlar, {
          name: 'xterm-256color',
          cols: Number(m.cols) || 100,
          rows: Number(m.rows) || 30,
          cwd,
          env: {
            ...ORTAM,
            ...(oturumId ? { KOKPIT_OTURUM: oturumId } : {}),
            ...(gorevMetni && claudeIle ? { KOKPIT_GOREV: gorevMetni } : {}),
          },
        });
      } catch (e) {
        log('FAIL pty acilamadi: ' + e.message);
        gonder({ t: 'hata', mesaj: 'Terminal açılamadı: ' + e.message });
        return;
      }

      // pid'i burada sabitliyoruz: onExit'e kadar p null'lanmis olabiliyor
      // (ws.close handler'i once kosuyor) ve log kor kaliyordu.
      const pid = p.pid;
      servis = Boolean(servisKomutu);
      if (servis) servisler.add(pid);
      log(`pty acildi pid=${pid} cwd=${cwd} komut=${servis ? 'servis: ' + servisKomutu : claudeIle ? claudeKomutu : 'kabuk'} kabuk=${path.basename(dosya)}`);
      gonder({ t: 'hazir', pid });

      // Servis ciktisindan yerel adres (Vite/Next/uvicorn): degistikce bir kez bildirilir.
      // Kuyruk tutulur: adres satiri iki veri parcasina bolunebiliyor.
      let kuyruk = '';
      let sonAdres = null;
      p.onData((d) => {
        gonder({ t: 'veri', d });
        if (!servis) return;
        kuyruk = (kuyruk + d).slice(-2048);
        const adres = adresBul(kuyruk);
        if (adres && adres !== sonAdres) {
          sonAdres = adres;
          log('servis adresi pid=' + pid + ' ' + adres);
          gonder({ t: 'adres', adres });
        }
      });
      p.onExit(({ exitCode }) => {
        servisler.delete(pid);
        log(`pty kapandi pid=${pid} kod=${exitCode}`);
        gonder({ t: 'bitti', kod: exitCode });
        p = null;
        try { ws.close(); } catch { /* zaten kapali */ }
      });
      return;
    }

    if (!p) return;
    if (m.t === 'veri' && typeof m.d === 'string') p.write(m.d);
    else if (m.t === 'cocuk') {
      // "Kabugun altinda hala bir sey calisiyor mu?" — kapatma onayi icin. Yalnizca
      // istek geldiginde sorulur (CIM sorgusu ~0.8 sn), asla surekli yoklanmaz.
      // `n` istek kimligi: ust uste iki soru gelirse cevaplar karismaz.
      const n = m.n;
      void cocukAdlari(p.pid).then((adlar) => gonder({ t: 'cocuklar', n, adlar }));
    }
    else if (m.t === 'cik') {
      const n = m.n;
      const hedef = p;
      const pid = hedef.pid;
      log('guvenli cikis basladi pid=' + pid);
      void (async () => {
        const t0 = Date.now();
        hedef.write('\x1b');
        await uyu(800);
        if (p === hedef) hedef.write('\x03');
        await uyu(250);
        if (p === hedef) hedef.write('\x03');
        while (Date.now() - t0 < CIKIS_BEKLEME_MS) {
          await uyu(1000);
          // Kabugun kendisi bittiyse cocuk da yoktur.
          const adlar = p === hedef ? await cocukAdlari(pid) : [];
          if (adlar && adlar.length === 0) {
            log('guvenli cikis tamam pid=' + pid + ' (' + (Date.now() - t0) + ' ms)');
            gonder({ t: 'cikis', n, temiz: true });
            return;
          }
        }
        log('guvenli cikis zaman asimi pid=' + pid);
        gonder({ t: 'cikis', n, temiz: false });
      })();
    }
    else if (m.t === 'boyut') {
      const cols = Math.max(2, Number(m.cols) || 80);
      const rows = Math.max(2, Number(m.rows) || 24);
      try { p.resize(cols, rows); } catch (e) { log('resize hatasi: ' + e.message); }
    }
  });

  ws.on('close', () => {
    if (p) {
      log('ws kapandi -> pty oldurulyor pid=' + p.pid);
      // Servis: agac taskkill ile olunce kabuk da olmus olur. Ardindan p.kill() olu kabugun
      // konsolunu listelemeye calisiyor ve node-pty'nin yardimci sureci "AttachConsole failed"
      // ile cokuyordu (zararsiz ama gurultu; test:pty'de goruldu). Yalniz taskkill tutmazsa.
      // Kabuk kendiliginden cikmissa da (Guvenli kapat, claude'dan cikis) ayni cokme oluyordu:
      // 10-04'te logda 129 yigin izi. Once surec yasiyor mu bakilir.
      const hedef = p;
      const oldur = () => {
        try { process.kill(hedef.pid, 0); } catch { return; /* zaten olmus */ }
        try { hedef.kill(); } catch { /* zaten olmus */ }
      };
      if (servis) {
        // Kume'den taskkill bitince cikar: o arada sunucu kapanirsa cikis yolu da oldursun.
        agaciOldurAsenkron(hedef.pid, oldur);
      } else {
        oldur();
      }
      p = null;
    }
  });
});

// Yetim birakmama: ebeveyn stdin'i kapatinca bu surec de kapanir. Servis agaclari once
// oldurulur: ConPTY kapaninca dev sunucusunun torunlari yasamaya devam edebiliyor.
process.stdin.on('end', () => { log('ebeveynin stdin"i kapandi -> cikiliyor'); servisleriOldur(); process.exit(0); });
process.stdin.on('close', () => { servisleriOldur(); process.exit(0); });
process.stdin.resume();

process.on('uncaughtException', (e) => { log('uncaughtException: ' + (e && e.stack)); });
