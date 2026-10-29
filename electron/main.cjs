const { app, BrowserWindow, Menu, Tray, dialog, globalShortcut, ipcMain, nativeImage, nativeTheme, powerMonitor, powerSaveBlocker, screen, session, shell } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { DEV_URL, DEV_PORT } = require('./config.cjs');
const { log, logHata, LOG_DOSYA } = require('./log.cjs');
const { durumOku } = require('./durum.cjs');
const ptyKopru = require('./pty-kopru.cjs');
const uretim = require('./uretim-protokolu.cjs');
const ayarlar = require('./ayarlar.cjs');
const defter = require('./defter.cjs');
const beyin = require('./beyin.cjs');
const inboxNotu = require('./not.cjs');
const geriDoldurma = require('./doldur.cjs');
const kanca = require('./kanca.cjs');
const ada = require('./ada.cjs');
const komutlar = require('./komutlar.cjs');
const calistir = require('./calistir.cjs');
const limit = require('./limit.cjs');
const { gonderIstegi } = require('./gonder-istegi.cjs');
const { gitOzeti } = require('./git-ozet.cjs');
const yakala = require('./yakala.cjs');
const nobet = require('./nobet.cjs');
const ses = require('./ses.cjs');
const sesKomut = require('./ses-komut.cjs');
const sesliOzet = require('./sesli-ozet.cjs');
const brifing = require('./brifing.cjs');
const secim = require('./secim.cjs');
const teslim = require('./teslim.cjs');
const onizleme = require('./onizleme.cjs');
const paralel = require('./paralel.cjs');
const aria = require('./aria.cjs');
const hafiza = require('./hafiza.cjs');
const ariaArac = require('./aria-arac.cjs');
const geceVardiyasi = require('./gece.cjs');
const surum = require('./surum.cjs');

// Windows bildirimleri (toast) bir AppUserModelID ister; paketlenmemis uygulamada bu
// verilmezse bildirim sessizce hic gorunmez.
app.setAppUserModelId('com.scryne.kokpit');

const DEV = !app.isPackaged && process.env.KOKPIT_DEV !== '0';
const TEST = process.env.KOKPIT_TEST_KABUK === '1';
// Windows acilisinda (oturum acma kaydi) `--arka` ile baslar: ana pencere yuklenir ama gosterilmez,
// yalniz Ada ve tepsi simgesi gorunur. Kokpit'i acmak: tepsi, Ada'ya tikla ya da Ctrl+Alt+Shift+K.
const ARKA = process.argv.includes('--arka');

// Ayri veri dizini (test/ekran kosuculari, config.cjs KOKPIT_DIZIN): Chromium profili de
// ayrilir, gercek Kokpit'in profiliyle (izinler, onbellek) ayni anda kilitlenmesin.
if (process.env.KOKPIT_DIZIN) app.setPath('userData', path.join(require('./config.cjs').KOKPIT_DIZIN, 'electron'));
// v3.1 test: mikrofon yerine bir WAV dosyasi (Chromium'un sahte aygiti). Yalniz test kabugunda; gercek
// Kokpit her zaman gercek mikrofonu kullanir.
if (TEST && process.env.KOKPIT_TEST_MIKROFON) {
  app.commandLine.appendSwitch('use-fake-device-for-media-stream');
  app.commandLine.appendSwitch('use-fake-ui-for-media-stream');
  app.commandLine.appendSwitch('use-file-for-fake-audio-capture', path.resolve(process.env.KOKPIT_TEST_MIKROFON));
}

// Tek ornek. Ikinci Kokpit ayni oturum defterini paylasir: birincinin acik oturumlarini
// "onceki calismadan kalan" sanip geri yukleme teklif eder (ayni klasorde ikinci
// `claude --continue`), ayarlar da yarisir. Ikinci acilis mevcut pencereyi one getirir.
// Test/ekran kosuculari (KOKPIT_TEST_KABUK=1) gercek Kokpit acikken de calisabilmeli.
// `--yeniden` (surum bekcisi, v2.8): onceki Kokpit cikisini bitirirken (PTY sunucusu servisleri
// oldururken, en fazla ~6 sn) kilit hala onda olabilir; yeni ornek vazgecmeden bir sure bekler.
function kilitAl() {
  if (app.requestSingleInstanceLock()) return true;
  if (!process.argv.includes('--yeniden')) return false;
  const bekleme = new Int32Array(new SharedArrayBuffer(4));
  for (let i = 0; i < 40; i++) {
    Atomics.wait(bekleme, 0, 0, 500);
    if (app.requestSingleInstanceLock()) return true;
  }
  return false;
}
if (process.env.KOKPIT_TEST_KABUK !== '1' && !kilitAl()) {
  app.quit();
  process.exit(0);
}

// Sema kaydi app hazir olmadan ONCE yapilmali.
if (!DEV) uretim.semaKaydet();
let pencere = null;
// Kapatma korumasi: renderer "acik oturum var mi" diye bakip onay verene kadar pencere
// kapanmaz. Renderer soruyu 3 sn icinde ALDIGINI bildirmezse (asili) yine de kapanir;
// aldiysa kullanicinin kararini bekler — diyalog ve guvenli cikis zaman alir.
// (2026-09-29'a kadar zamanlayici cevabi degil soruyu bekliyordu: kullanici 3 sn icinde
// karar vermezse ya da "Vazgec" derse pencere yine kapanip claude'u olduruyordu.)
let kapanisOnaylandi = false;
let kapanisSoruluyor = false;
let kapanisZamanlayici = null;
// Uygulama kapanirken PTY sunucusu olur ve renderer hala hayattaysa her kabuk icin
// "bitti" gorur. Bu gercek bir kapanis degil: defterde 'kabuk' olarak kaydedilirse geri
// yukleme teklifi kaybolur (Browser.close / oturum kapatma yolunda before-quit pencereden
// once calisir; olculdu).
let uygulamaKapaniyor = false;
let ptyBeklendi = false;
// Tepsi (v2.6): pencerenin X'i Kokpit'i KAPATMAZ, tepsiye indirir; Ada ve oturumlar yasamaya devam
// eder. Gercek cikis tepsi menusunden ("Kokpit'ten cik"), paletten ya da Windows kapanirken.
// Test kosuculari tepsi kurmaz: onlar pencere kapaninca cikisi bekliyor.
let tepsi = null;
let cikisIstendi = false;
const tepsiAktif = () => tepsi !== null && ayarlar.oku().tepsi !== false;
// Surum bekcisi (v2.8): yeni commit gelince tepside "yeniden baslat". Yalniz uretimde: dev'de Vite
// zaten sicak yukluyor, test kosuculari yeniden baslamamali.
const KOK = path.join(__dirname, '..');
let yeniSurum = null; // yeni commit'in kisa hali
let yenidenBaslatIstendi = null; // { arka } — cikis tamamlaninca baslatici calisir
let ilkGosterimYapildi = false; // pencere bir kez gosterildi mi (`--arka` acilista hayir)

/** Onceki calismadan kalan pencere konumu; ekran disinda kaldiysa yok sayilir. */
function pencereKonumu() {
  const p = ayarlar.oku().pencere;
  if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.width)) return {};
  const ekranda = screen.getAllDisplays().some((d) => {
    const a = d.workArea;
    return p.x + 100 < a.x + a.width && p.x + p.width - 100 > a.x &&
      p.y + 50 < a.y + a.height && p.y + 50 > a.y;
  });
  if (!ekranda) return {};
  return { x: p.x, y: p.y, width: p.width, height: p.height };
}

// Akrilik yalniz Windows 11 22H2+ (build 22621) DWM'inde var; eskisinde istek sessizce
// yok sayilir ve saydam arka plan duz siyaha duser. O yuzden surum burada sorulur.
function seffafPencere() {
  if (process.platform !== 'win32' || ayarlar.oku().seffaf === false) return false;
  const build = Number(os.release().split('.')[2]);
  return Number.isFinite(build) && build >= 22621;
}

function pencereKur() {
  // Akrilik sistem temasini izler; acik temada beyaz tonlu cikar. Kokpit hep koyu.
  nativeTheme.themeSource = 'dark';
  const konum = pencereKonumu();
  pencere = new BrowserWindow({
    width: 1280,
    height: 860,
    ...konum,
    minWidth: 900,
    minHeight: 600,
    show: false,
    // Pencere AKRILIK (2026-10-03, Gumus cam). 2026-09-10'daki ilk denemede acik duvar
    // kagidi arayuzu gri corbaya ceviriyordu; fark artik zeminin kendisi: body her zaman
    // %82 opak koyu bir ton katmani tasir (index.css `zemin`). Arkada BEMBEYAZ bir pencere
    // olsa bile en soluk metin 4.5:1'i gecer — kontrast arkadaki seye degil bize bagli.
    // Destek yoksa ya da ayarlarda `seffaf: false` ise pencere opak ve gorunum ayni kalir.
    ...(seffafPencere()
      ? { backgroundColor: '#00000000', backgroundMaterial: 'acrylic' }
      : { backgroundColor: '#0b0c0f' }),
    title: 'Kokpit',
    // Ozel ikon (public/kokpit.svg -> npm run ikon). Paketlenmemis uygulamada Electron
    // varsayilan atomu gosterir; gorev cubugu ve Alt+Tab bunu kullanir.
    icon: path.join(__dirname, '..', 'public', 'kokpit.ico'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // v3.2: servis bolmesinin onizlemesi (<webview>). Konuk sayfa yalniz yerel gelistirme sunucusu olabilir
      // ve Node/preload almaz (will-attach-webview asagida).
      webviewTag: true,
    },
  });

  // v3.2 onizleme: konuk sayfanin ayarlari burada zorlanir (renderer ne isterse istesin): preload yok, Node
  // yok, sandbox, ayri oturum bolumu (gelistirme sitesinin cerezleri Kokpit'inkilerle karismaz). Kaynak
  // yalniz yerel adres: claude'un dev sunucusu, internet degil.
  pencere.webContents.on('will-attach-webview', (olay, prefs, params) => {
    delete prefs.preload;
    prefs.nodeIntegration = false;
    prefs.nodeIntegrationInSubFrames = false;
    prefs.contextIsolation = true;
    prefs.sandbox = true;
    prefs.webSecurity = true;
    params.partition = 'persist:onizleme';
    if (!onizleme.yerelAdres(params.src)) {
      log('onizleme reddedildi (yerel degil): ' + String(params.src).slice(0, 80));
      olay.preventDefault();
    }
  });
  pencere.webContents.on('did-attach-webview', (_e, konuk) => onizleme.konukKur(konuk, (url) => void shell.openExternal(url)));

  // --- Teshis kablolari (Faz 0 karari: v1'de kalir) ---
  pencere.webContents.on('console-message', (e) => {
    // Electron 44: tek event nesnesi. Eski uc-argumanli imza deprecated.
    log(`renderer[${e.level}] ${e.message}`);
  });
  pencere.webContents.on('did-fail-load', (_e, kod, aciklama, url) => {
    log(`FAIL sayfa yuklenmedi: ${kod} ${aciklama} (${url})`);
  });
  pencere.webContents.on('render-process-gone', (_e, detay) => {
    log(`FAIL renderer coktu: ${JSON.stringify(detay)}`);
  });
  pencere.webContents.on('preload-error', (_e, dosya, err) => {
    logHata(`preload ${dosya}`, err);
  });
  pencere.once('ready-to-show', () => {
    if (ARKA) {
      log('arka planda basladi (--arka): pencere gizli, Ada ve tepsi acik');
      // Pencere hic gosterilmedi, `blur` gelmeyecek: Ada "Kokpit onde" sanmasin.
      ada.anaOdak(false);
      return;
    }
    ilkGosterimYapildi = true;
    if (ayarlar.oku().pencere?.maksimize) pencere.maximize();
    pencere.show();
  });

  // Pencere konumu her kapanista kaydedilir (maksimize ise normal sinirlar saklanir).
  pencere.on('close', (olay) => {
    try {
      const maksimize = pencere.isMaximized();
      const b = pencere.getNormalBounds();
      ayarlar.yaz({ pencere: { x: b.x, y: b.y, width: b.width, height: b.height, maksimize } });
    } catch (e) {
      log('pencere konumu kaydedilemedi: ' + e.message);
    }
    if (kapanisOnaylandi) return;
    olay.preventDefault();
    // X: tepsiye in. Oturumlar ve Ada calismaya devam eder, soru sorulmaz.
    if (tepsiAktif() && !cikisIstendi) {
      pencere.hide();
      tepsiBildir();
      return;
    }
    // Soru zaten renderer'da (diyalog acik ya da guvenli cikis suruyor): ikinci X yok sayilir.
    if (kapanisSoruluyor) return;
    kapanisSoruluyor = true;
    pencere.webContents.send('kapanis:sor');
    kapanisZamanlayici = setTimeout(() => {
      if (!kapanisOnaylandi && pencere) {
        log('kapanis: renderer soruyu almadi, kapatiliyor');
        kapanisOnaylandi = true;
        pencere.close();
      }
    }, 3000);
  });

  // Yeni pencere acilmaz (target=_blank, window.open). Dis linkler `link:ac` yolundan gider.
  pencere.webContents.setWindowOpenHandler(({ url }) => {
    // v3.0: Botlar sayfasindaki "son kosuyu GitHub'da ac" baglantisi. Yalniz https://github.com/,
    // Kokpit penceresi acilmaz, varsayilan tarayici acar.
    if (/^https:\/\/github\.com\//.test(String(url))) {
      void shell.openExternal(url);
      return { action: 'deny' };
    }
    log('pencere acma engellendi: ' + String(url).slice(0, 80));
    return { action: 'deny' };
  });

  // Pencereye dosya birakilinca Chromium o dosyaya GITMEYE calisir (file:// gezinme) ve
  // uygulama kaybolur. Birakma isi renderer'da (terminale yol yazar); gezinme kapali.
  pencere.webContents.on('will-navigate', (olay, url) => {
    log(`gezinme engellendi: ${url}`);
    olay.preventDefault();
  });

  // Yakinlastirma KILITLI. Electron'un varsayilan menusu Ctrl+= / Ctrl+- / Ctrl+0
  // hizlandiricilarini tasiyor; kazara basilinca tum arayuz olcekleniyordu.
  // Bu bir masaustu uygulamasi, tarayici degil.
  pencere.webContents.setZoomFactor(1);
  pencere.webContents.setVisualZoomLevelLimits(1, 1).catch(() => {});
  pencere.webContents.on('zoom-changed', () => pencere.webContents.setZoomFactor(1));

  // Menu kaldirilinca F12 de gidiyor; gelistirici araclarini elle geri baglayalim.
  pencere.webContents.on('before-input-event', (olay, girdi) => {
    if (girdi.type !== 'keyDown') return;
    if (girdi.key === 'F12' || (girdi.control && girdi.shift && girdi.key.toLowerCase() === 'i')) {
      olay.preventDefault();
      pencere.webContents.toggleDevTools();
    }
  });



  // KURAL: data: URL kullanilmaz. Opaque origin inline script ve WebSocket'i
  // sessizce engelliyor (Faz 0 spike'inda yakalandi).
  if (DEV) {
    log(`dev modu: ${DEV_URL} yukleniyor`);
    pencere.loadURL(DEV_URL).catch((e) => logHata('loadURL', e));
  } else {
    log('uretim modu: ' + uretim.BASLANGIC_URL + ' yukleniyor');
    pencere.loadURL(uretim.BASLANGIC_URL).catch((e) => logHata('loadURL', e));
  }

  // Ana pencere kapandiysa uygulama biter. Ada da bir pencere: o yasarken `window-all-closed`
  // hic gelmiyordu ve surec arka planda kaliyordu (PTY sunucusu, servisler, genel kisayollar);
  // sonraki `kokpit` tek ornek kilidine takilip bos pencereyi one getirmeye calisiyor, hicbir
  // sey acilmiyordu. v2.2'den 2026-10-04'e kadar; test kosuculari adayi kurmadigi icin gorulmedi.
  pencere.on('closed', () => {
    pencere = null;
    ada.kapat();
    app.quit();
  });
  // Ada yalniz Kokpit arka plandayken gorunur.
  pencere.on('focus', () => {
    ada.anaOdak(true);
    pencere.webContents.send('pencere:odak', true);
  });
  // Windows oturumu kapanirken pencere tepsiye inmemeli: cikis yolu calissin.
  pencere.on('session-end', () => {
    cikisIstendi = true;
  });
  pencere.on('hide', () => {
    ada.anaOdak(false);
    if (pencere) pencere.webContents.send('pencere:odak', false);
  });
  pencere.on('blur', () => {
    ada.anaOdak(false);
    // Renderer arka plandayken surekli animasyonlarini durdurur (main.tsx). document.hasFocus()
    // buna yetmiyor: Ada'nin gorunurlugunu belirleyen kaynakla ayni olay kullanilir.
    if (pencere) pencere.webContents.send('pencere:odak', false);
  });
}

/** Ada penceresi: ayni arayuz paketi, #ada adresiyle. Test kosucularinda kurulmaz. */
function adaKur() {
  if (TEST && process.env.KOKPIT_TEST_ADA !== '1') return;
  ada.kur({
    url: (DEV ? DEV_URL : uretim.BASLANGIC_URL) + '#ada',
    preload: path.join(__dirname, 'preload.cjs'),
    acik: ayarlar.oku().ada !== false,
    hep: ayarlar.oku().adaHep !== false,
    sakli: ayarlar.oku().adaSakli === true,
    tamEkran: ayarlar.oku().adaTamEkran !== false,
    konum: ayarlar.oku().adaKonum,
    // Ada'nin kendi degistirdigi ayarlar (saklan, yer): diske ve tepsi menusune.
    onAyar: (yama) => {
      ayarlar.yaz(yama);
      tepsiMenusu();
    },
    // Bos kimlik: oturum yok, Ada'ya tiklandi -> yalniz Kokpit one gelir.
    onGit: (id) => {
      log('ada tiklamasi: ' + (id || 'kokpit'));
      pencereyiOneGetir();
      if (pencere && id) pencere.webContents.send('oturuma:git', id);
    },
    // Gorev: ana pencere yeni oturumu arka planda acar ve metni claude'un ilk mesaji yapar.
    onGorev: (g) => {
      log('ada gorevi: ' + g.ad + ' (' + g.metin.length + ' karakter, ' + (g.kip ?? 'simdi') + ')');
      if (pencere) pencere.webContents.send('gorev:ac', g);
    },
    onLimitTazele: () => void limit.tazele(),
    // "Gordum": bitti rozeti Kokpit'e gecmeden duser (yalniz dikkat; oturuma bir sey gitmez).
    onGordum: (id) => {
      if (pencere) pencere.webContents.send('oturum:gordum', id);
    },
    // Ada odagi birakirken ana pencere bir an etkinlestirilemez olur (bkz. ada.cjs odakla).
    ana: () => pencere,
    // v3.0: ekler (yakalanan goruntu, birakilan dosya). Ada kimlik secer, yol burada cozulur.
    onEkGonder: (istek) => {
      const yollar = yakala.yollar(istek.ekler);
      // v3.2: secili metin ekleri (kaynak + metin); yol degil, bracketed paste blogu olarak gider.
      const metinler = yakala.metinler(istek.ekler);
      if (yollar.length === 0 && metinler.length === 0 && !istek.metin) return;
      log('ada: ' + (yollar.length + metinler.length) + ' ek oturuma gonderiliyor ' + istek.id + (istek.gonder ? '' : ' (yalniz yapistir)'));
      if (pencere) pencere.webContents.send('oturuma:gonder', { id: istek.id, tur: 'ek', yollar, metinler, metin: istek.metin, gonder: istek.gonder });
      yakala.sil(istek.ekler);
      if (!istek.gonder) {
        // Yalniz yapistir: Scryne metni terminalde tamamlayacak; o sekmeyle Kokpit one gelir.
        pencereyiOneGetir();
        if (pencere) pencere.webContents.send('oturuma:git', istek.id);
      }
    },
    onEkSil: (kimlikler) => yakala.sil(kimlikler),
    onBirak: (yollar) => yakala.birak(yollar),
    // v3.1: Ada'nin sesi. Dinleme baslarken sunucu isinir; konusma bitince metin -> eylem burada cozulur.
    sesli: ayarlar.oku().adaSesli !== false,
    sesDurumu: () => ses.durum(),
    onSesHazirla: () => void ses.hazirla(),
    onSesCoz: async (wav, liste) => {
      const r = await ses.coz(wav, sesKomut.ipucu(liste.map((o) => o.ad)));
      if ('hata' in r) return r;
      const eylem = sesliEylem(sesKomut.komutCoz(r.metin, liste), liste);
      log('ada sesi: ' + eylem.tur + (eylem.hedef ? ' @' + eylem.hedef.ad : eylem.tur === 'not' ? ' hedefsiz' : '') + (eylem.gonder ? ' +gonder' : '') + (eylem.hata ? ' (' + eylem.hata + ')' : '') + ' (' + r.ms + ' ms)');
      return { metin: r.metin, eylem, ms: r.ms };
    },
    // v3.2 eller serbest: parca "Ada" ile baslamiyorsa metin burada biter (loga da yazilmaz).
    uyanma: ayarlar.oku().adaUyanma === true,
    onUyanmaCoz: async (wav, liste) => {
      const r = await ses.coz(wav, 'Ada, ' + sesKomut.ipucu(liste.map((o) => o.ad)));
      if ('hata' in r) return { uyandi: false };
      const u = sesKomut.uyanmaAyikla(r.metin);
      if (!u.uyandi) return { uyandi: false };
      const eylem = u.kalan ? sesliEylem(sesKomut.komutCoz(u.kalan, liste), liste) : null;
      log('ada uyandi' + (eylem ? ': ' + eylem.tur + (eylem.hedef ? ' @' + eylem.hedef.ad : '') : ' (komut bekleniyor)') + ' (' + r.ms + ' ms)');
      return { uyandi: true, metin: u.kalan, eylem };
    },
    // Bildirim (oturum bekliyor/bitti): Kokpit ondeyse sus, ekran zaten gosteriyor.
    onKonus: async (metin, bildirim) => {
      if (bildirim && pencere && pencere.isFocused()) return null;
      return ses.konus(metin);
    },
  });
  yakala.dinle((ekler, neden) => {
    // v3.2: secili metin acik bir istek (kisayol): Ada klavyeyle acilir, not kutusu odaklanir.
    const acil = neden === 'secim' || (neden === 'pano' && Date.now() - yakalaIstendi < YAKALA_BEKLE_MS);
    if (acil && neden === 'pano') yakalaIstendi = 0;
    ada.ekler(ekler, { neden, acil, anaOdakta: !!pencere && pencere.isFocused() });
  });
  // Pano bekcisi: test kosucularinda yalniz istenirse (gercek Kokpit de ayni panoyu izliyor).
  if (!TEST || process.env.KOKPIT_TEST_PANO === '1') yakala.baslat();
}

/**
 * v3.2: sesli ozet / cevap / brifing burada cumleye ya da istege cevrilir (sesli-ozet.cjs saf). Kanca
 * koprusunun anlik hali main'de: renderer'in gecikmeli kopyasina bakilmaz. Cevap istegi yine ana pencerenin
 * damga denetiminden gecer.
 */
function sesliEylem(eylem, liste) {
  if (eylem.tur !== 'ozet' && eylem.tur !== 'cevap') return eylem;
  const a = kanca.anlik();
  const oturumlar = a.oturumlar || {};
  if (eylem.tur === 'cevap') {
    const c = sesliOzet.cevapCoz(eylem, liste, oturumlar);
    return 'hata' in c ? { tur: 'cevap', hedef: eylem.hedef, hata: c.hata } : { tur: 'cevap', hedef: { id: c.istek.id, ad: c.ad }, istek: c.istek, cumle: c.cumle };
  }
  const h = sesliOzet.hedefSec(eylem.hedef, liste, oturumlar, 'ozet');
  if (!h) return { tur: 'ozet', hedef: null, cumle: 'Açık claude oturumu yok.' };
  const cumle = sesliOzet.ozetCumlesi({ ad: h.ad, e: h.e, git: a.gitler?.[h.id] ?? null, simdi: Date.now(), tam: eylem.tam === true });
  return { tur: 'ozet', hedef: { id: h.id, ad: h.ad }, cumle };
}

/**
 * v3.2: Ctrl+Alt+Shift+C. Kokpit ondeyse tus gonderilmez (xterm'de Ctrl+Insert bir kacis dizisi olurdu):
 * aktif terminalin ya da sayfanin secimi renderer'dan alinir. Degilse secim.cjs on plandaki uygulamaya
 * Ctrl+Insert gonderir.
 */
let secimSuruyor = false;
async function secimiAl() {
  if (secimSuruyor) return;
  secimSuruyor = true;
  try {
    let r;
    if (pencere && pencere.isFocused()) {
      const ic = await pencere.webContents.executeJavaScript('window.__kokpitSecim ? window.__kokpitSecim() : ""', true).catch(() => '');
      const m = secim.metniHazirla(ic);
      r = m ? { metin: m, kaynak: 'Kokpit terminali' } : { hata: 'Seçili metin bulunamadı' };
    } else {
      r = await secim.kopyala({ sessiz: (ms) => yakala.sessiz(ms) });
    }
    if ('hata' in r) {
      log('secim: ' + r.hata);
      ada.not(r.hata);
      return;
    }
    yakala.metinEkle(r.metin, r.kaynak);
  } catch (e) {
    logHata('secim', e);
  } finally {
    secimSuruyor = false;
  }
}

/** v3.0: Ctrl+Alt+Shift+S anlik goruntuyu actiysa, gelen goruntu Ada'yi klavyeyle acar (hedef sec, Enter). */
let yakalaIstendi = 0;
const YAKALA_BEKLE_MS = 90_000;

ipcMain.handle('durum:getir', async () => {
  const r = await durumOku();
  // v3.0: vadeler Ada'ya da (bugun/yarin/gecikmis kartta). Durum yalniz ana pencerenin istegiyle okunur.
  if (r && r.veri) {
    ada.vadeler(r.veri.vadeler ?? []);
    sonDurum = { veri: r.veri, t: Date.now() };
  }
  return r;
});

// --- v3.2: gunun brifingi (brifing.cjs saf) ---
/** Son iyi durum.py olcumu: brifing her seferinde ikinci bir okuma yapmasin (10 dk taze sayilir). */
let sonDurum = null;
const DURUM_TAZE_MS = 10 * 60 * 1000;
async function brifingHazirla() {
  if (!sonDurum || Date.now() - sonDurum.t > DURUM_TAZE_MS) {
    try {
      const r = await durumOku();
      if (r && r.veri) sonDurum = { veri: r.veri, t: Date.now() };
    } catch (e) {
      log('brifing: durum okunamadi: ' + e.message);
    }
  }
  const a = kanca.anlik();
  return brifing.brifingKur({
    durum: sonDurum?.veri ?? null,
    nobet: nobet.anlik(),
    limitler: a.limitler,
    oturumlar: a.oturumlar || {},
    liste: ada.oturumListesi(),
    simdi: Date.now(),
    gece: geceVardiyasi.sabahOzeti(),
  });
}
/** Brifingi Ada'da gosterir; `konus` acik istekte (ses, palet) her zaman, gunun ilkinde sesli ayara bagli. */
async function brifingVer(neden) {
  const b = await brifingHazirla();
  ayarlar.yaz({ sonBrifing: b.gun });
  log('brifing (' + neden + '): ' + b.maddeler.length + ' madde');
  ada.brifing(b, { konus: neden !== 'gun' || ayarlar.oku().adaSesli !== false, neden });
  // v3.3 Faz 63: gunun ilk brifingi Aria'nin notunu da tetikler (ayar acikken; gunde bir, limit harcar).
  if (neden === 'gun' && ayarlar.oku().ariaNotlar === true) void aria.gunlukNot().catch((e) => logHata('aria notu', e));
  return b;
}
/**
 * Gunun ilk etkinligi: acilis, ekran kilidi acilmasi, uykudan donus ya da (gece acik kalan Kokpit'te)
 * gun degistikten sonra ilk kullanici girdisi. Gunde bir kez; tepsiden kapatilir (`adaBrifing`).
 */
let brifingZamanlayici = null;
function brifingKontrol(neden, gecikmeMs = 0) {
  if (TEST && process.env.KOKPIT_TEST_BRIFING !== '1') return;
  if (ayarlar.oku().adaBrifing === false) return;
  if (brifingZamanlayici) return;
  brifingZamanlayici = setTimeout(() => {
    brifingZamanlayici = null;
    const gun = brifing.brifingGunu(Date.now());
    if (ayarlar.oku().sonBrifing === gun) return;
    // Makine bosta (gece acik kalan Kokpit, ekran kilitli): Scryne'in girdisi gelince.
    if (powerMonitor.getSystemIdleTime() > 120) return;
    void brifingVer('gun').catch((e) => logHata('brifing', e));
  }, gecikmeMs);
}
ipcMain.handle('ada:brifing', async () => brifingHazirla());

// --- v3.2: paralel oturumlar (paralel.cjs) ---
ipcMain.handle('paralel:ac', async (_e, yol, ad) => {
  const y = bilinenYol(yol);
  if (!y) return { hata: 'bilinmeyen proje yolu' };
  const p = sonDurum?.veri?.projeler?.find((x) => path.resolve(x.yol).toLowerCase() === path.resolve(y).toLowerCase());
  return paralel.olustur(y, p?.ad ?? path.basename(y), typeof ad === 'string' ? ad : '');
});
ipcMain.handle('paralel:liste', async () => paralel.liste());
ipcMain.handle('paralel:fark', async (_e, yol) => paralel.fark(yol));
/** Paralel agacta acik oturum var mi (ada listesinin yollari): varken birlestirme/atma yapilmaz. */
function agactaOturum(yol) {
  const n = path.resolve(String(yol)).toLowerCase();
  return [...oturumYerleri.values()].some((o) => path.resolve(o.yol).toLowerCase() === n);
}
ipcMain.handle('paralel:birlestir', async (_e, yol) => {
  const k = paralel.bul(yol);
  if (!k || !pencere) return { tamam: false, cikti: 'paralel ağaç bulunamadı' };
  const durum = (await paralel.liste()).find((x) => x.yol === k.yol);
  const ayrinti = (durum ? durum.ileride + ' commit, ' + durum.dosya + ' dosya (+' + durum.arti + ' −' + durum.eksi + ')' : '') + '\n' + k.dal + ' → ' + k.taban + ' (--no-ff merge, ana ağaçta)\nPush yapılmaz; ağaç ve dal yerinde kalır.';
  const secilen =
    TEST_SECIM !== null
      ? TEST_SECIM
      : (await dialog.showMessageBox(pencere, { type: 'question', title: 'Birleştir: ' + k.ad, message: k.proje + ' / ' + k.ad + ' ana dala birleştirilsin mi?', detail: ayrinti, buttons: ['Birleştir', 'Vazgeç'], defaultId: 0, cancelId: 1, noLink: true })).response;
  if (secilen !== 0) return { tamam: false, iptal: true, cikti: 'Vazgeçildi' };
  return paralel.birlestir(k.yol);
});
ipcMain.handle('paralel:at', async (_e, yol) => {
  const k = paralel.bul(yol);
  if (!k || !pencere) return { tamam: false, cikti: 'paralel ağaç bulunamadı' };
  if (agactaOturum(k.yol)) return { tamam: false, cikti: 'Bu ağaçta açık bir oturum var; önce onu kapat.' };
  const durum = (await paralel.liste()).find((x) => x.yol === k.yol);
  const kayip = [
    durum && durum.kirli > 0 ? durum.kirli + ' commit edilmemiş dosya' : '',
    durum && durum.ileride > 0 ? durum.ileride + ' birleştirilmemiş commit' : '',
  ].filter(Boolean);
  const secilen =
    TEST_SECIM !== null
      ? TEST_SECIM
      : (await dialog.showMessageBox(pencere, {
          type: kayip.length ? 'warning' : 'question',
          title: 'At: ' + k.ad,
          message: k.proje + ' / ' + k.ad + ' ağacı ve ' + k.dal + ' dalı silinsin mi?',
          detail: kayip.length ? 'Geri alınamaz, kaybolacak: ' + kayip.join(', ') + '.' : 'Dal birleştirilmiş ya da boş; kaybolan iş yok.',
          buttons: [kayip.length ? 'Sil (kaybolanlarla)' : 'Sil', 'Vazgeç'],
          defaultId: 1,
          cancelId: 1,
          noLink: true,
        })).response;
  if (secilen !== 0) return { tamam: false, iptal: true, cikti: 'Vazgeçildi' };
  return paralel.at(k.yol, kayip.length > 0);
});

// --- v3.3: Aria (aria.cjs): vault'ta kalici sohbet; ana pencere (Aria sayfasi) ve Ada (ses) dinler ---
function ariaYayin(o) {
  if (pencere) pencere.webContents.send('aria:olay', o);
  ada.ariaOlay(o);
}
async function ariaKur() {
  aria.kur({ vault: require('./config.cjs').VAULT, yayin: ariaYayin });
  // Faz 62: Kokpit araclari (MCP). Sunucu kurulamazsa Aria araclarsiz konusur.
  try {
    const a = await ariaArac.baslat({
      isleyiciler: ariaIsleyicileri(),
      onOneri: (kart) => ariaYayin({ tur: 'oneri', oneri: kart }),
      aktifMesaj: () => aria.aktifMesajId(),
    });
    aria.kur({ mcpConfig: a.mcpConfig });
  } catch (e) {
    logHata('aria araclari kurulamadi', e);
  }
}

/** Oturum adi -> Ada listesindeki oturum (Turkce duyarsiz). */
function oturumBul(ad) {
  const a = sesKomut.anahtar(ad);
  return ada.oturumListesi().find((o) => sesKomut.anahtar(o.ad) === a) ?? null;
}
/** Ana pencere henuz listeyi yollamadiysa (acilisin ilk saniyeleri) main'in kendi durum olcumu yedektir. */
function projeBul(ad) {
  const a = sesKomut.anahtar(ad);
  const liste = ada.projeListesi().length
    ? ada.projeListesi()
    : (sonDurum?.veri?.projeler ?? []).map((p) => ({ ad: p.ad, yol: p.yol, grup: p.envanter && !/^(🟢|✅)/.test(p.envanter) ? 'arsiv' : '' }));
  return liste.find((p) => sesKomut.anahtar(p.ad) === a) ?? null;
}

/** Aria'nin Kokpit araclari: okuma metne cevirir, oneri karti dogurur (uygulama Scryne onaylayinca ana pencerede). */
function ariaIsleyicileri() {
  const simdi = () => Date.now();
  return {
    kokpit_oturumlar: () => {
      const a = kanca.anlik();
      const ic = ada.oturumListesi().map((o) => '- ' + sesliOzet.ozetCumlesi({ ad: o.ad, e: a.oturumlar?.[o.id] ?? null, git: a.gitler?.[o.id] ?? null, simdi: simdi(), tam: false }));
      const dis = ada.disListesi().map((d) => '- ' + d.ad + ' (Kokpit disinda): ' + (d.durum === 'bekliyor' ? 'seni bekliyor' : d.durum === 'calisiyor' ? 'calisiyor' : 'hazir'));
      return [ic.length ? 'Kokpit oturumlari:\n' + ic.join('\n') : 'Kokpit\'te acik oturum yok.', ...(dis.length ? ['Kokpit disinda:\n' + dis.join('\n')] : [])].join('\n\n');
    },
    kokpit_oturum_ozeti: ({ oturum }) => {
      const o = oturumBul(String(oturum || ''));
      if (!o) return 'Acik oturum bulunamadi: ' + oturum + '. Acik olanlar: ' + (ada.oturumListesi().map((x) => x.ad).join(', ') || 'yok');
      const a = kanca.anlik();
      return sesliOzet.ozetCumlesi({ ad: o.ad, e: a.oturumlar?.[o.id] ?? null, git: a.gitler?.[o.id] ?? null, simdi: simdi(), tam: true });
    },
    kokpit_brifing: async () => {
      const b = await brifingHazirla();
      return b.maddeler.length ? b.maddeler.map((m) => '- [' + m.tur + (m.onem === 'dikkat' ? ', dikkat' : '') + '] ' + m.metin).join('\n') + (b.oneri ? '\nOnerilen ilk is: ' + b.oneri : '') : 'Bekleyen bir sey yok.';
    },
    kokpit_nobet: () => {
      const n = nobet.anlik();
      if (!n || !n.isler) return 'Nobet henuz okunmadi.';
      return n.isler.map((x) => '- ' + x.proje + ' / ' + x.ad + ': ' + x.hal + (x.ayrinti ? ' (' + x.ayrinti + ')' : '') + (x.son ? ', son ' + x.son : '')).join('\n');
    },
    kokpit_teslim: async () => {
      const projeler = (sonDurum?.veri?.projeler ?? []).filter((p) => p.git && ((p.git.ahead ?? 0) > 0 || p.git.kirli > 0));
      const agaclar = await paralel.liste();
      const p = projeler.map((x) => '- ' + x.ad + ': ' + (x.git.ahead ? x.git.ahead + ' commit push bekliyor' : '') + (x.git.ahead && x.git.kirli ? ', ' : '') + (x.git.kirli ? x.git.kirli + ' dosya commit edilmedi' : ''));
      const g = agaclar.map((a) => '- ' + a.proje + '/' + a.ad + ' (' + a.dal + ' <- ' + a.taban + '): ' + a.ileride + ' commit' + (a.kirli ? ', ' + a.kirli + ' kirli' : ''));
      return (p.length ? 'Push / commit bekleyen:\n' + p.join('\n') : 'Push ya da commit bekleyen proje yok.') + (g.length ? '\n\nParalel dallar:\n' + g.join('\n') : '');
    },
    kokpit_gece: () => {
      const v = geceVardiyasi.oku();
      if (!v.gorevler.length) return 'Gece vardiyasinda gorev yok.';
      return (v.aktif ? 'Vardiya ACIK' + (v.baslangic ? ' (baslangic ' + v.baslangic + ')' : '') : 'Vardiya kapali') + '\n' + v.gorevler.map((g) => '- ' + g.proje + ': ' + g.durum + (g.neden ? ' (' + g.neden + ')' : '') + ' | ' + g.metin.slice(0, 120) + (g.ozet ? '\n  ozet: ' + g.ozet.slice(0, 300) : '')).join('\n');
    },
    kokpit_limit: () => {
      const l = kanca.anlik().limitler;
      if (!l) return 'Limit olcumu yok.';
      const f = (x) => (x ? '%' + Math.round(x.yuzde) + (x.sifirlanma ? ', sifirlanma ' + new Date(x.sifirlanma).toLocaleString('tr-TR') : '') : 'bilinmiyor');
      return '5 saatlik: ' + f(l.besSaat) + '\nHaftalik: ' + f(l.hafta);
    },
    kokpit_oneriler: () => ariaArac.onerilerMetni(ariaArac.oneriler()),
    oneri_gorev: ({ proje, metin, kip }) => {
      const p = projeBul(String(proje || ''));
      if (!p) return 'Proje bulunamadi: ' + proje + '. Projeler: ' + ada.projeListesi().map((x) => x.ad).join(', ');
      const k = ariaArac.oneriEkle({ tur: 'gorev', proje: p.ad, metin, kip: kip === 'paralel' && p.grup !== 'vault' ? 'paralel' : 'simdi' });
      return 'Oneri #' + k.id + " Scryne'in onayina sunuldu (Kokpit'te kart). Onaylanmadan hicbir sey yapilmaz; durumu kokpit_oneriler ile gorebilirsin.";
    },
    oneri_gece: ({ proje, metin }) => {
      const p = projeBul(String(proje || ''));
      if (!p || p.grup === 'vault') return 'Gece vardiyasina eklenebilecek proje bulunamadi: ' + proje;
      const k = ariaArac.oneriEkle({ tur: 'gece', proje: p.ad, metin });
      return 'Oneri #' + k.id + " Scryne'in onayina sunuldu: gece vardiyasina eklenecek.";
    },
    oneri_mesaj: ({ oturum, metin }) => {
      const o = oturumBul(String(oturum || ''));
      if (!o) return 'Acik oturum bulunamadi: ' + oturum + '. Acik olanlar: ' + (ada.oturumListesi().map((x) => x.ad).join(', ') || 'yok');
      const k = ariaArac.oneriEkle({ tur: 'mesaj', oturum: o.ad, oturumId: o.id, metin });
      return 'Oneri #' + k.id + " Scryne'in onayina sunuldu: " + o.ad + ' oturumuna mesaj.';
    },
  };
}
ipcMain.handle('aria:oneriler', () => ariaArac.oneriler());
// v3.3 Faz 63: gunluk not. Ayar acikken gunun brifingiyle birlikte (gunde bir), ya da Aria sayfasindan elle.
ipcMain.handle('aria:not', () => aria.notOku());
ipcMain.handle('aria:not-yaz', () => aria.gunlukNot({ zorla: true }));
ipcMain.handle('aria:not-ayar', (_e, acik) => {
  if (typeof acik === 'boolean') ayarlar.yaz({ ariaNotlar: acik });
  return ayarlar.oku().ariaNotlar === true;
});
/** Scryne'in karari (Aria sayfasi, Ada karti ya da sesli "onayla"). Onayda ana pencere uygular, sonucu bildirir. */
ipcMain.handle('aria:oneri-karar', (_e, id, onay) => {
  const liste = ariaArac.oneriler().filter((k) => k.durum === 'bekliyor');
  const k = id === 'son' ? liste[liste.length - 1] : liste.find((x) => x.id === id);
  if (!k) return { hata: 'Onay bekleyen öneri yok' };
  if (!onay) {
    ariaArac.oneriSonuc(k.id, 'reddedildi');
    return { tamam: true, id: k.id };
  }
  if (!pencere) return { hata: 'Kokpit penceresi yok' };
  pencere.webContents.send('aria:oneri-uygula', k);
  return { tamam: true, id: k.id };
});
ipcMain.on('aria:oneri-sonuc', (e, id, basarili, sonuc) => {
  if (!pencere || e.sender !== pencere.webContents || typeof id !== 'string') return;
  ariaArac.oneriSonuc(id, basarili === true ? 'onaylandi' : 'hata', typeof sonuc === 'string' ? sonuc : '');
});
const ARIA_KAYNAK = new Set(['yazi', 'ses', 'ada']);
ipcMain.handle('aria:gonder', (_e, metin, kaynak) => aria.gonder(typeof metin === 'string' ? metin : '', { kaynak: ARIA_KAYNAK.has(kaynak) ? kaynak : 'yazi' }));
ipcMain.handle('aria:kes', () => aria.kes());
ipcMain.handle('aria:gecmis', (_e, id) => aria.gecmis(typeof id === 'string' ? id : undefined));
ipcMain.handle('aria:oturumlar', () => aria.oturumlar());
ipcMain.handle('aria:durum', () => aria.durum());
ipcMain.on('aria:yeni', () => aria.yeniSohbet());
ipcMain.on('aria:isit', () => aria.isit());
// v3.3 Faz 61: hafiza paneli (vault salt okunur).
const vaultYolu = () => require('./config.cjs').VAULT;
ipcMain.handle('hafiza:ozet', () => hafiza.ozet(vaultYolu()));
ipcMain.handle('hafiza:ara', (_e, sorgu) => (typeof sorgu === 'string' ? hafiza.ara(sorgu.slice(0, 200), hafiza.aranabilir(vaultYolu())) : []));
ipcMain.handle('hafiza:oku', (_e, yol) => hafiza.dosyaOku(vaultYolu(), yol));
ipcMain.on('ada:aria-ac', () => {
  pencereyiOneGetir();
  if (pencere) pencere.webContents.send('sayfa:ac', 'aria');
});
/** Aria sayfasinin sesli cevabi (Ada'ninki ada:konus). Metin sesli okunabilir oldugu kadar: markdown atilir. */
ipcMain.handle('aria:konus', async (e, metin) => {
  if (!pencere || e.sender !== pencere.webContents || typeof metin !== 'string') return null;
  const b = await ses.konus(sesliOzet.sozSadelestir(metin, 600));
  return b ? new Uint8Array(b) : null;
});

// --- v3.2: gece vardiyasi (gece.cjs kayit; kosucu ana pencerede) ---
ipcMain.handle('gece:oku', () => geceVardiyasi.oku());
ipcMain.handle('gece:yaz', (e, ham) => {
  if (!pencere || e.sender !== pencere.webContents) return geceVardiyasi.oku();
  return geceVardiyasi.yaz(ham);
});
ipcMain.handle('gece:istem', (_e, metin, dal) => geceVardiyasi.gorevIstemi(String(metin ?? ''), String(dal ?? '')));
/** Kosucunun adimi: karar saf (gece.cjs); kanca hali ve limitler main'in anligindan, oturumlar ana pencereden. */
ipcMain.handle('gece:karar', (_e, oturumlar) => {
  const a = kanca.anlik();
  return geceVardiyasi.karar({
    v: geceVardiyasi.oku(),
    oturumlar: Array.isArray(oturumlar) ? oturumlar.filter((o) => o && typeof o.id === 'string').map((o) => ({ id: o.id, durumu: String(o.durumu) })) : [],
    etkinlik: a.oturumlar || {},
    simdi: Date.now(),
    limitler: a.limitler,
  });
});
/**
 * Vardiya surerken makine uyumasin: Windows'un uyku zamanlayicisi gece calisan oturumu dondurur. Ekran
 * kapanabilir ('prevent-app-suspension'); yalniz sistem uykusu engellenir. Vardiya bitince kalkar.
 */
let uyanikKilit = null;
ipcMain.on('gece:uyanik', (e, istek) => {
  if (!pencere || e.sender !== pencere.webContents) return;
  if (istek === true && uyanikKilit === null) {
    uyanikKilit = powerSaveBlocker.start('prevent-app-suspension');
    log('gece: vardiya basladi, sistem uykusu engellendi');
  } else if (istek !== true && uyanikKilit !== null) {
    powerSaveBlocker.stop(uyanikKilit);
    uyanikKilit = null;
    log('gece: vardiya bitti, uyku serbest');
  }
});
ipcMain.on('gece:not', (e, metin) => {
  if (!pencere || e.sender !== pencere.webContents || typeof metin !== 'string') return;
  log('gece: ' + metin.slice(0, 200));
  ada.not(metin.slice(0, 200));
});

// --- v3.2: onizleme (isaretle-soyle) ve ana pencerede dikte ---
/** Isaretlenen ogenin kirpigi: konuk ana pencerenin webview'i olmali; PNG ~/.kokpit/goruntu'ya. */
ipcMain.handle('onizleme:yakala', async (e, wcId, alan) => {
  if (!pencere || e.sender !== pencere.webContents) return { hata: 'yetkisiz' };
  return onizleme.yakala(pencere.webContents, wcId, alan);
});
/** Ana pencerenin mikrofon dugmesi (onizleme notu): yalniz metin doner, eylem yok. */
ipcMain.handle('ses:metin', async (e, ham) => {
  if (!pencere || e.sender !== pencere.webContents) return { hata: 'yetkisiz' };
  if (!(ham instanceof Uint8Array) && !(ham instanceof ArrayBuffer)) return { hata: 'ses kaydı geçersiz' };
  const r = await ses.coz(Buffer.from(ham instanceof ArrayBuffer ? new Uint8Array(ham) : ham), sesKomut.ipucu([]));
  return 'hata' in r ? r : { metin: sesKomut.duzelt(r.metin) };
});
ipcMain.on('ses:hazirla', (e) => {
  if (pencere && e.sender === pencere.webContents) void ses.hazirla();
});

// --- v3.2: Teslim sayfasi (teslim.cjs) ---
/** Renderer'dan gelen yol yalniz bilinen bir proje (durum.py), vault ya da Kokpit'in actigi bir calisma agaci olabilir. */
function bilinenYol(yol) {
  if (typeof yol !== 'string' || !path.isAbsolute(yol)) return null;
  const n = path.resolve(yol).toLowerCase();
  const v = sonDurum?.veri;
  const adaylar = [...(v?.projeler ?? []).map((p) => p.yol), ...(v?.vault ? [v.vault] : []), ...paralel.yollar()];
  return adaylar.find((a) => path.resolve(a).toLowerCase() === n) ?? null;
}
ipcMain.handle('teslim:detay', async (_e, yol) => {
  const y = bilinenYol(yol);
  if (!y) return { hata: 'bilinmeyen proje yolu' };
  const d = await teslim.detay(y);
  if ('hata' in d) return d;
  return { ...d, gorunurluk: d.github ? await teslim.gorunurluk(d.remote) : null };
});
ipcMain.handle('teslim:fark', async (_e, yol, istek) => {
  const y = bilinenYol(yol);
  return y ? teslim.fark(y, istek) : { hata: 'bilinmeyen proje yolu' };
});
/**
 * Push: her zaman onayli. Public (ya da gorunurlugu bilinmeyen) depoda once yayin kapisi (`yayin_tara.py
 * --gecmis`); bulgu varsa onay diyalogu bulgulari listeler ve "Yine de push et" ister. Zorlama (--force) yok.
 */
ipcMain.handle('teslim:push', async (_e, yol) => {
  const y = bilinenYol(yol);
  if (!y || !pencere) return { tamam: false, cikti: 'bilinmeyen proje yolu' };
  const d = await teslim.detay(y);
  if ('hata' in d) return { tamam: false, cikti: d.hata };
  const gor = d.github ? await teslim.gorunurluk(d.remote) : 'bilinmiyor';
  const disari = gor !== 'private';
  let kapiSonucu = null;
  if (disari) kapiSonucu = await teslim.kapi(y);
  const bulgu = kapiSonucu?.bulgular?.length ?? 0;
  const hedef = d.uzak ?? 'origin/' + d.dal + ' (yeni uzak dal)';
  const ayrinti = [
    d.commitler.length + ' commit → ' + hedef + (d.github ? ' · ' + d.github.sahip + '/' + d.github.depo + ' (' + gor + ')' : ''),
    ...d.commitler.slice(0, 8).map((c) => '  ' + c.kisa + ' ' + c.konu.slice(0, 70)),
    ...(d.commitler.length > 8 ? ['  … +' + (d.commitler.length - 8)] : []),
    '',
    disari
      ? kapiSonucu === null
        ? 'Yayın kapısı betiği bulunamadı: tarama YAPILMADI.'
        : kapiSonucu.hata
          ? 'Yayın kapısı çalışmadı: ' + kapiSonucu.hata
          : bulgu === 0
            ? 'Yayın kapısı temiz (tüm geçmiş + çalışma ağacı tarandı).'
            : 'Yayın kapısı ' + bulgu + ' bulgu verdi:\n' +
              kapiSonucu.bulgular.slice(0, 6).map((b) => '  • ' + [b.ciddiyet, b.tur, b.yer, b.ayrinti].filter(Boolean).join(' · ').slice(0, 140)).join('\n')
      : 'Depo private: yayın kapısı gerekmiyor.',
  ].join('\n');
  const dugmeler = bulgu > 0 ? ['Yine de push et', 'Vazgeç'] : ['Push et', 'Vazgeç'];
  let secilen;
  if (TEST_SECIM !== null) secilen = TEST_SECIM;
  else {
    const { response } = await dialog.showMessageBox(pencere, {
      type: bulgu > 0 || (disari && !kapiSonucu) ? 'warning' : 'question',
      title: 'Push: ' + path.basename(y),
      message: bulgu > 0 ? 'Yayın kapısı bulgu verdi. Yine de push edilsin mi?' : path.basename(y) + ' push edilsin mi?',
      detail: ayrinti,
      buttons: dugmeler,
      defaultId: bulgu > 0 ? 1 : 0,
      cancelId: 1,
      noLink: true,
    });
    secilen = response;
  }
  if (secilen !== 0) return { tamam: false, iptal: true, cikti: 'Vazgeçildi' };
  return teslim.push(y);
});
ipcMain.on('brifing:ver', () => void brifingVer('palet').catch((e) => logHata('brifing', e)));
// v3.0 bot nobeti (Botlar sayfasi + Ada). Ilk okuma acilistan 15 sn sonra; sayfa acilinca bos kalmasin.
ipcMain.handle('nobet:getir', async () => nobet.anlik() ?? (await nobet.tazele()));
ipcMain.handle('nobet:tazele', async () => nobet.tazele());
ipcMain.handle('log:yol', () => LOG_DOSYA);
ipcMain.handle('pty:bilgi', async () => {
  try {
    // Kanca koprusu once hazir olmali: PTY sunucusu claude'u onun ayar dosyasiyla acar.
    // Kopru kurulamazsa oturumlar eskisi gibi (hook'suz) acilir.
    await kanca.baslat().catch((e) => logHata('kanca baslatilamadi', e));
    return { bilgi: await ptyKopru.baslat(kanca.ptyOrtami()) };
  } catch (e) {
    logHata('pty sunucusu baslatilamadi', e);
    return { hata: e.message };
  }
});
ipcMain.handle('klasor:ac', async (_e, yol) => {
  if (typeof yol !== 'string' || !yol) return false;
  // Yalniz klasor: shell.openPath bir .exe/.bat yolunu CALISTIRIR. Renderer'dan gelen yol
  // bu kapidan bir dosya olarak gecmez.
  try {
    if (!fs.statSync(yol).isDirectory()) throw new Error('klasor degil');
  } catch (e) {
    log(`klasor acma reddedildi (${yol}): ${e.message}`);
    return false;
  }
  const hata = await shell.openPath(yol);
  if (hata) log(`klasor acilamadi (${yol}): ${hata}`);
  return !hata;
});
// Terminaldeki link: yalniz http(s). Baska sema (file:, javascript:) tarayiciya gitmez.
ipcMain.handle('link:ac', async (_e, url) => {
  if (typeof url !== 'string') return false;
  let u;
  try { u = new URL(url); } catch { return false; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    log('link reddedildi: ' + url.slice(0, 80));
    return false;
  }
  await shell.openExternal(u.toString());
  return true;
});
function pencereyiOneGetir() {
  if (!pencere) return;
  if (pencere.isMinimized()) pencere.restore();
  // `--arka` acilista pencere hic gosterilmedi: ilk gosterimde kayitli "buyutulmus" hali uygulanir
  // (yoksa Windows acilisindan sonra Kokpit her gun kucuk pencerede aciliyordu).
  if (!ilkGosterimYapildi) {
    ilkGosterimYapildi = true;
    if (ayarlar.oku().pencere?.maksimize) pencere.maximize();
  }
  pencere.show();
  pencere.focus();
}
ipcMain.handle('pencere:odakla', pencereyiOneGetir);
// Ikinci `kokpit` calistirildi (tek ornek kilidi): mevcut pencere one gelir.
// Kapanirken gelen istek yeniden baslayan ornegin kilit denemesidir (`--yeniden`): yok sayilir.
app.on('second-instance', () => {
  if (!uygulamaKapaniyor && !yenidenBaslatIstendi) pencereyiOneGetir();
});
// Yerel onay diyalogu. Renderer window.confirm kullanmaz: Electron'da odak ve
// erisilebilirlik acisindan sistem diyalogu daha dogru.
ipcMain.handle('onay:sor', async (_e, secenek) => {
  if (!pencere || !secenek || typeof secenek !== 'object') return false;
  const { response } = await dialog.showMessageBox(pencere, {
    type: 'warning',
    title: String(secenek.baslik || 'Kokpit'),
    message: String(secenek.mesaj || ''),
    detail: secenek.ayrinti ? String(secenek.ayrinti) : undefined,
    buttons: [String(secenek.onayla || 'Devam'), 'Vazgeç'],
    defaultId: 1,
    cancelId: 1,
    noLink: true,
  });
  return response === 0;
});
// Cok secenekli diyalog (guvenli kapat / zorla kapat / vazgec). Son dugme her zaman iptal;
// secilen dugmenin sirasini doner.
// TEST SEAM: yerel diyalog CDP'den tiklanamaz. Yalniz test kosucusu (KOKPIT_TEST_KABUK=1)
// KOKPIT_TEST_SECIM ile cevabi onceden verebilir; normal calismada hic okunmaz.
const TEST_SECIM =
  process.env.KOKPIT_TEST_KABUK === '1' && process.env.KOKPIT_TEST_SECIM !== undefined
    ? Number(process.env.KOKPIT_TEST_SECIM)
    : null;
ipcMain.handle('secim:sor', async (_e, secenek) => {
  if (!pencere || !secenek || typeof secenek !== 'object') return -1;
  const dugmeler = Array.isArray(secenek.dugmeler)
    ? secenek.dugmeler.slice(0, 4).map((d) => String(d))
    : [];
  if (dugmeler.length < 2) return -1;
  if (TEST_SECIM !== null) {
    log('test: secim diyalogu atlandi -> ' + dugmeler[TEST_SECIM]);
    return TEST_SECIM;
  }
  const { response } = await dialog.showMessageBox(pencere, {
    type: 'warning',
    title: String(secenek.baslik || 'Kokpit'),
    message: String(secenek.mesaj || ''),
    detail: secenek.ayrinti ? String(secenek.ayrinti) : undefined,
    buttons: dugmeler,
    defaultId: 0,
    cancelId: dugmeler.length - 1,
    noLink: true,
  });
  return response;
});
ipcMain.on('kapanis:alindi', () => {
  clearTimeout(kapanisZamanlayici);
  kapanisZamanlayici = null;
});
ipcMain.on('kapanis:iptal', () => {
  log('kapanis: kullanici vazgecti');
  kapanisSoruluyor = false;
  cikisIstendi = false;
  yenidenBaslatIstendi = null;
});
ipcMain.on('kapanis:onay', () => {
  kapanisOnaylandi = true;
  if (pencere) pencere.close();
});
// Oturum defteri (Kokpit'in kendi verisi; bkz. defter.cjs).
const DEFTER_SEBEP = new Set(['kullanici', 'kabuk']);
ipcMain.on('defter:olay', (_e, o) => {
  if (!o || typeof o !== 'object' || typeof o.id !== 'string') return;
  if (o.olay === 'acildi' && typeof o.ad === 'string' && typeof o.yol === 'string') {
    // claude oturum kimligi (uuid): geri yukleme / surdurme tam o konusmayi acar.
    const claude = typeof o.claude === 'string' && /^[0-9a-f-]{36}$/i.test(o.claude) ? o.claude : undefined;
    defter.ekle({ olay: 'acildi', id: o.id, ad: o.ad, yol: o.yol, ...(claude ? { claude } : {}) });
  } else if (o.olay === 'kapandi') {
    if (uygulamaKapaniyor && o.sebep === 'kabuk') return;
    // Kanca koprusunun tuttugu oturum ozeti (tur, arac, dosya, +/-) defterde kalir.
    const ozet = kanca.ozet(o.id);
    defter.ekle({
      olay: 'kapandi',
      id: o.id,
      kod: Number.isInteger(o.kod) ? o.kod : null,
      sebep: DEFTER_SEBEP.has(o.sebep) ? o.sebep : 'kullanici',
      ...(ozet ? { ozet } : {}),
    });
    kanca.unut(o.id);
  }
});
let oncekilerVerildi = false;
ipcMain.handle('defter:oncekiler', () => {
  // Bir kez: ayni calismada ikinci sorgu bos doner (StrictMode cift effect'i dahil).
  if (oncekilerVerildi) return [];
  oncekilerVerildi = true;
  const liste = defter.oncekiAcikOturumlar();
  if (liste.length > 0) log('onceki calismadan acik kalan oturum: ' + liste.map((o) => o.ad).join(', '));
  return liste;
});
ipcMain.handle('defter:sonlar', () => {
  // Her son oturuma "beyne dustu mu" eklenir (transcript + flush durumu, salt okuma).
  const sonlar = defter.sonOturumlar();
  for (const [yol, k] of Object.entries(sonlar)) {
    try {
      k.beyin = beyin.oturumBeyinDurumu(yol, k.baslangic, k.claude);
      // "Surdur" yalniz konusma diskte varsa: claude ilk mesajdan once kapandiysa yoktur.
      k.surdurulebilir = beyin.transcriptVar(yol, k.claude);
    } catch (e) {
      log('beyin durumu okunamadi (' + yol + '): ' + e.message);
      k.beyin = 'yok';
      k.surdurulebilir = false;
    }
  }
  return sonlar;
});
// Biten bolmeyi yerinde surdurme (v2.9): o kimligin transcript'i diskte mi. Yalniz stat; yol ve kimlik
// beyin.cjs'te bicim denetiminden gecer (uuid degilse false).
ipcMain.handle('oturum:surdurulebilir', (_e, yol, claude) => {
  if (typeof yol !== 'string' || typeof claude !== 'string') return false;
  try {
    return beyin.transcriptVar(yol, claude);
  } catch {
    return false;
  }
});
// Kanca koprusu: oturum etkinligi, limitler, statusline baglami. Ilk yukleme icin anlik.
ipcMain.handle('etkinlik:anlik', async () => {
  await kanca.baslat().catch(() => {});
  return kanca.anlik();
});
// Renderer'in acik oturum listesi: ada adlari ve sirayi buradan bilir.
ipcMain.on('ada:liste', (_e, liste) => {
  if (!Array.isArray(liste)) return;
  ada.liste(
    liste
      .filter((x) => x && typeof x.id === 'string' && typeof x.ad === 'string')
      .slice(0, 24)
      .map((x) => ({
        id: x.id,
        ad: x.ad,
        baslangic: Number(x.baslangic) || null,
        dikkat: x.dikkat === true,
        // claude kimligi: dis oturum listesinde Kokpit'in kendi oturumlarini ayirmak icin.
        ...(typeof x.claude === 'string' && /^[0-9a-f-]{36}$/i.test(x.claude) ? { claude: x.claude } : {}),
      }))
  );
  // v3.0: tur bitince git hali icin oturumun klasoru ve acilis ani (yalniz mutlak yol).
  oturumYerleri.clear();
  for (const x of liste.slice(0, 24)) {
    if (x && typeof x.id === 'string' && typeof x.yol === 'string' && path.isAbsolute(x.yol)) {
      oturumYerleri.set(x.id, { yol: x.yol, baslangic: Number(x.baslangic) || 0 });
    }
  }
});

/** v3.0: oturum id -> { yol, baslangic } (ada listesinden). Bitti kartinin git satiri icin. */
const oturumYerleri = new Map();
async function gitOlc(id) {
  const yer = oturumYerleri.get(id);
  if (!yer) return;
  try {
    kanca.gitYaz(id, await gitOzeti(yer.yol, yer.baslangic));
  } catch (e) {
    log('git ozeti olculemedi: ' + e.message);
  }
}
// Gorev hedefleri: ana pencerenin sirali proje listesi. Ada yalniz bu adlardan birini secebilir.
ipcMain.on('ada:projeler', (_e, liste) => {
  if (!Array.isArray(liste)) return;
  ada.projeler(
    liste
      .filter((x) => x && typeof x.ad === 'string' && typeof x.yol === 'string' && path.isAbsolute(x.yol))
      .slice(0, 60)
      .map((x) => ({ ad: x.ad.slice(0, 80), yol: x.yol, grup: typeof x.grup === 'string' ? x.grup.slice(0, 20) : '' }))
  );
});
ipcMain.on('ada:ayar', (_e, acik) => {
  ayarlar.yaz({ ada: acik !== false });
  ada.ayar(acik !== false);
  tepsiMenusu();
});
// Calistir tarifi (~/.kokpit/calistir.json + package.json; bkz. calistir.cjs).
ipcMain.handle('calistir:tarif', (_e, yol) => calistir.tarif(yol));
ipcMain.handle('calistir:kaydet', (_e, yol, komut) => calistir.kaydet(yol, komut));
// Hizli komutlar (~/.kokpit/komutlar.json, Kokpit'in kendi verisi). Duzenleme dosyayi
// varsayilan uygulamada acar; yol sabit, renderer'dan yol alinmaz.
ipcMain.handle('komutlar:getir', () => komutlar.oku());
ipcMain.handle('komutlar:duzenle', async () => {
  komutlar.oku(); // yoksa varsayilanlarla olusur
  const hata = await shell.openPath(komutlar.DOSYA);
  if (hata) log('komutlar.json acilamadi: ' + hata);
  return !hata;
});
/**
 * Oturuma gonderme istegi (ada ya da ana pencere). Yazmanin kendisi ana pencerede: PTY
 * baglantisi orada yasar. Burada yalniz sekil denetlenir (gonder-istegi.cjs); "o soru hala
 * acik mi" karari App'te, kanca durumuyla (damga) verilir.
 */
ipcMain.on('ada:gonder', (e, ham) => {
  const istek = gonderIstegi(ham);
  if (!istek) return;
  log('ada: oturuma gonderiliyor ' + istek.id + ' (' + istek.tur + ')');
  if (pencere) pencere.webContents.send('oturuma:gonder', istek);
});
// Ada'da yazi kutusu: ada normalde odak almaz (oyun/yazi ortasinda odak calmasin); kutuya
// tiklaninca gecici olarak odaklanabilir olur, gonderince ya da kutudan cikinca geri doner.
ipcMain.on('ada:odak', (_e, istek) => ada.odak(istek === true));
// Acik oturumlarin bağlam buyuklugu (transcript'in sonu, salt okuma).
ipcMain.handle('oturum:baglam', (_e, liste) => {
  const sonuc = {};
  if (!Array.isArray(liste)) return sonuc;
  for (const o of liste.slice(0, 24)) {
    if (!o || typeof o.id !== 'string' || typeof o.yol !== 'string' || !Number.isFinite(o.baslangic)) continue;
    try {
      sonuc[o.id] = beyin.oturumBaglami(o.yol, o.baslangic, typeof o.claude === 'string' ? o.claude : undefined);
    } catch (e) {
      log('bağlam okunamadi (' + o.yol + '): ' + e.message);
      sonuc[o.id] = null;
    }
  }
  return sonuc;
});
// Beyne dusmemis tek oturumu vault'un kendi betigiyle doldurur (bkz. doldur.cjs).
ipcMain.handle('beyin:doldur', (_e, session, proje) => geriDoldurma.doldur(session, proje));
// Vault'a TEK yazma: Inbox notu (bkz. not.cjs). Sona ekleme, ustune yazma yok.
ipcMain.handle('not:ekle', (_e, metin, kaynak) =>
  inboxNotu.ekle(metin, typeof kaynak === 'string' ? kaynak.slice(0, 60) : null)
);
ipcMain.handle('ayar:getir', () => {
  const a = ayarlar.oku();
  return { kenarAcik: a.kenarAcik, yaziBoyutu: a.yaziBoyutu, arsivAcik: a.arsivAcik, ada: a.ada !== false, telefon: a.telefon === true };
});
// Paletten "Kokpit'ten cik": tepsiye inmeden gercek cikis (acik oturum sorusu yine calisir).
ipcMain.on('uygulama:cik', () => cik());
ipcMain.on('uygulama:yeniden', () => yenidenBaslat());

/** Gercek cikis: pencere gorunur olmali, kapatma korumasinin diyalogu ona bagli. */
function cik() {
  cikisIstendi = true;
  if (!pencere) {
    app.quit();
    return;
  }
  pencereyiOneGetir();
  pencere.close();
}

/**
 * Yeni surume gec: gercek cikis (acik oturum sorusu, guvenli kapat, defter) + cikis bitince baslatici.
 * Oturumlar yeni ornekte geri yukleme teklifiyle doner (defter, `--resume`). Pencere gizliyse yeni
 * ornek de gizli (`--arka`) acilir.
 */
function yenidenBaslat() {
  yenidenBaslatIstendi = { arka: !pencere || !pencere.isVisible() };
  log('yeniden baslatma istendi (' + (yeniSurum ?? '?') + ')');
  cik();
}

// --- Tepsi ve Windows acilisi (v2.6) ---

/** Oturum acma kaydi yalniz uretimde: dev sunucusuyla acilis anlamsiz. */
const ACILIS_DESTEKLI = !DEV && !TEST && process.platform === 'win32';
function acilisSecenekleri() {
  return {
    path: path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'wscript.exe'),
    args: [path.join(__dirname, '..', 'scripts', 'kokpit-sessiz.vbs'), '--arka'],
  };
}
function acilistaMi() {
  try {
    return app.getLoginItemSettings(acilisSecenekleri()).openAtLogin;
  } catch {
    return false;
  }
}
function acilisAyarla(acik) {
  if (!ACILIS_DESTEKLI) return;
  try {
    app.setLoginItemSettings({ ...acilisSecenekleri(), openAtLogin: acik, name: 'Kokpit' });
    ayarlar.yaz({ acilistaBaslat: acik });
    log('windows acilisinda baslat: ' + (acik ? 'acik' : 'kapali'));
  } catch (e) {
    logHata('acilis kaydi', e);
  }
}

function tepsiBildir() {
  if (!tepsi || ayarlar.oku().tepsiBildirildi) return;
  ayarlar.yaz({ tepsiBildirildi: true });
  try {
    tepsi.displayBalloon({
      iconType: 'info',
      title: 'Kokpit tepside çalışıyor',
      content: "Oturumlar ve Ada açık kalır. Çıkmak için tepsi simgesinde \"Kokpit'ten çık\".",
    });
  } catch {
    /* balon desteklenmiyor */
  }
}

function limitIpucu() {
  const l = kanca.anlik().limitler;
  const p = (x) => (x ? '%' + Math.round(x.yuzde) : '—');
  return 'Kokpit' + (l ? ' · 5 saat ' + p(l.besSaat) + ' · hafta ' + p(l.hafta) : '') + (yeniSurum ? ' · yeni sürüm hazır' : '');
}

function surumBekcisiKur() {
  if (DEV || (TEST && process.env.KOKPIT_TEST_SURUM !== '1')) return;
  const aralik = Number(process.env.KOKPIT_TEST_SURUM_MS) || undefined;
  surum.izle({
    // Test kosucusu gercek depoya commit atmaz: gecici bir depo verir.
    kok: (TEST && process.env.KOKPIT_TEST_SURUM_KOK) || KOK,
    aralikMs: TEST ? aralik : undefined,
    degisti: (imza) => {
      yeniSurum = imza.slice(0, 7);
      tepsiMenusu();
      if (tepsi) {
        tepsi.setToolTip(limitIpucu());
        try {
          tepsi.displayBalloon({
            iconType: 'info',
            title: 'Kokpit güncellendi',
            content: 'Yeni sürüm hazır. Tepsi menüsünden "yeniden başlat"; açık oturumlar geri yüklenir.',
          });
        } catch {
          /* balon desteklenmiyor */
        }
      }
    },
  });
}

function tepsiMenusu() {
  if (!tepsi) return;
  const a = ada.durum();
  const sablon = [
    ...(yeniSurum ? [{ label: 'Yeni sürüm hazır: yeniden başlat', click: yenidenBaslat }, { type: 'separator' }] : []),
    { label: "Kokpit'i aç", click: pencereyiOneGetir },
    { type: 'separator' },
    {
      label: "Ada'yı göster",
      type: 'checkbox',
      checked: a.acik,
      click: (m) => {
        ayarlar.yaz({ ada: m.checked });
        ada.ayar(m.checked);
        if (pencere) pencere.webContents.send('ada:ayar-degisti', m.checked);
      },
    },
    {
      label: 'Kokpit öndeyken de göster',
      type: 'checkbox',
      checked: a.hep,
      enabled: a.acik,
      click: (m) => {
        ayarlar.yaz({ adaHep: m.checked });
        ada.ayar(a.acik, m.checked);
      },
    },
    {
      label: 'Kenara sakla',
      type: 'checkbox',
      checked: a.sakli,
      enabled: a.acik,
      accelerator: 'Control+Alt+Shift+G',
      registerAccelerator: false,
      // ada.sakla ayari onAyar ile yazar ve menuyu yeniden kurar.
      click: (m) => ada.sakla(m.checked),
    },
    {
      label: 'Tam ekranda çekil',
      type: 'checkbox',
      checked: a.tamEkran,
      enabled: a.acik,
      click: (m) => {
        ayarlar.yaz({ adaTamEkran: m.checked });
        ada.tamEkranAyarla(m.checked);
      },
    },
    ...(a.ortada ? [] : [{ label: "Ada'yı ortala", enabled: a.acik, click: () => ada.ortala() }]),
    // v3.1: Ada oturum seni bekleyince / bitince sesli soyler (Kokpit ondeyken susar).
    {
      label: 'Sesli bildirim',
      type: 'checkbox',
      checked: a.sesli,
      enabled: a.acik && ses.durum().tts,
      click: (m) => {
        ayarlar.yaz({ adaSesli: m.checked });
        ada.sesliAyarla(m.checked);
      },
    },
    // v3.2: eller serbest. Mikrofon surekli acik, yalniz "Ada, ..." ile baslayan kisa konusma islenir (yerel).
    {
      label: 'Eller serbest ("Ada, …")',
      type: 'checkbox',
      checked: a.uyanma,
      enabled: a.acik && ses.durum().stt,
      click: (m) => {
        ayarlar.yaz({ adaUyanma: m.checked });
        ada.uyanmaAyarla(m.checked);
        if (m.checked) void ses.hazirla();
      },
    },
    { label: 'Limitleri tazele', click: () => void limit.tazele() },
    { type: 'separator' },
    // v3.2: gunun brifingi. Simdi ver + her gun ilk etkinlikte kendiliginden (varsayilan acik).
    { label: 'Günün brifingi', enabled: a.acik, click: () => void brifingVer('palet').catch((e) => logHata('brifing', e)) },
    {
      label: 'Her gün ilk açılışta brifing',
      type: 'checkbox',
      checked: ayarlar.oku().adaBrifing !== false,
      click: (m) => ayarlar.yaz({ adaBrifing: m.checked }),
    },
  ];
  if (ACILIS_DESTEKLI) {
    sablon.push({
      label: 'Windows açılışında başlat',
      type: 'checkbox',
      checked: acilistaMi(),
      click: (m) => acilisAyarla(m.checked),
    });
  }
  sablon.push({ type: 'separator' }, { label: "Kokpit'ten çık", click: cik });
  tepsi.setContextMenu(Menu.buildFromTemplate(sablon));
}

function tepsiKur() {
  if (TEST && process.env.KOKPIT_TEST_TEPSI !== '1') return;
  try {
    const ikon = nativeImage.createFromPath(path.join(__dirname, '..', 'public', 'kokpit.ico'));
    tepsi = new Tray(ikon.isEmpty() ? nativeImage.createEmpty() : ikon);
  } catch (e) {
    logHata('tepsi kurulamadi', e);
    tepsi = null;
    return;
  }
  tepsi.setToolTip(limitIpucu());
  tepsi.on('click', pencereyiOneGetir);
  tepsiMenusu();
  // Ilk calisma: kayit yoksa bir kez acilir (Scryne 2026-10-04: "surekli ada acik olsun").
  // Sonra tepsi menusundeki secim gecerli; ayar dosyasi kararin kendisini tutar.
  if (ACILIS_DESTEKLI && ayarlar.oku().acilistaBaslat === undefined) acilisAyarla(true);
  else if (ACILIS_DESTEKLI && ayarlar.oku().acilistaBaslat === true && !acilistaMi()) acilisAyarla(true);
}
ipcMain.handle('ayar:kaydet', (_e, yama) => {
  const a = ayarlar.yaz(ayarlar.rendererYamasi(yama));
  return { kenarAcik: a.kenarAcik, yaziBoyutu: a.yaziBoyutu, arsivAcik: a.arsivAcik, ada: a.ada !== false, telefon: a.telefon === true };
});

// Content-Security-Policy tek kaynaktan. Dev'de Vite'in HMR'i inline script ve ws
// istiyor; uretimde hicbiri gerekmiyor.
//
// DIKKAT: uretimde basligi `onHeadersReceived` DEGIL, app:// protokol handler'i
// iliştirir -- file:// istekleri icin onHeadersReceived hic tetiklenmiyor ve politika
// sessizce uygulanmamis oluyordu.
const CSP = DEV
  ? "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; " +
    "style-src 'self' 'unsafe-inline'; font-src 'self' data:; " +
    `connect-src 'self' http://localhost:${DEV_PORT} ws://localhost:${DEV_PORT} ws://127.0.0.1:*; ` +
    // Dev'de bir sey blob: URL'den Worker acmaya calisiyor (uretim paketinde Worker YOK,
    // olculdu). Uretim politikasini gevsetmeden dev gurultusu susturuluyor.
    "worker-src 'self' blob:; img-src 'self' data:; media-src 'self' blob:; object-src 'none'; base-uri 'none'; frame-src 'none'"
  : "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; " +
    "font-src 'self'; connect-src 'self' ws://127.0.0.1:*; img-src 'self' data:; media-src 'self' blob:; " +
    "object-src 'none'; base-uri 'none'; frame-src 'none'";

function cspKur() {
  if (!DEV) return; // uretimde protokol handler'i hallediyor
  session.defaultSession.webRequest.onHeadersReceived((detay, geri) => {
    geri({
      responseHeaders: { ...detay.responseHeaders, 'Content-Security-Policy': [CSP] },
    });
  });
}

app.whenReady().then(() => {
  log('--- Kokpit basladi ---');
  Menu.setApplicationMenu(null);
  cspKur();
  if (!DEV) uretim.protokolKur(path.join(__dirname, '..', 'dist'), CSP);
  // Kanca koprusu erken: olaylar hem ana pencereye hem adaya yayinlanir.
  kanca
    .baslat({
      yayin: (a) => {
        if (pencere) pencere.webContents.send('etkinlik:anlik', a);
        ada.anlik(a);
        if (tepsi) tepsi.setToolTip(limitIpucu());
      },
      sinyal: (id, sinyal, durum) => {
        // Durum sinyalle birlikte gider: yayin 80 ms kisiliyor, bildirim metni bayat olmasin.
        if (pencere) pencere.webContents.send('etkinlik:sinyal', { id, sinyal, durum });
        ada.sinyal(id, sinyal);
        if (sinyal === 'bitti') void gitOlc(id);
      },
    })
    .catch((e) => logHata('kanca baslatilamadi', e));
  // v3.0 bot nobeti: 5 dk'da bir durum.py --nobet. Test kosucularinda yalniz istenirse (gercek pwsh +
  // GitHub API cagirir).
  if (!TEST || process.env.KOKPIT_TEST_NOBET === '1') {
    nobet.baslat({
      yayin: (n) => {
        if (pencere) pencere.webContents.send('nobet:anlik', n);
        ada.nobet(n);
      },
      olay: (o) => ada.nobetOlay(o),
    });
  }
  // Oturumsuz limitler (v2.6): sonuc kanca koprusunun limitleriyle birlesir, ayni yoldan yayinlanir.
  limit.baslat((l, d) => kanca.disLimit(l, d));
  powerMonitor.on('resume', () => {
    limit.uyandi();
    brifingKontrol('uyanma', 30_000);
  });
  // v3.2: gunun brifingi. Acilista (durum.py ve nobet ilk olcumu otursun), kilit acilinca, ve gece acik kalan
  // Kokpit icin 10 dk'da bir "gun degisti mi + Scryne masada mi".
  powerMonitor.on('unlock-screen', () => brifingKontrol('kilit', 8000));
  brifingKontrol('acilis', 45_000);
  // v3.2: gece vardiyasi kaydi nobete bildirildi (.claude/nobet.json); hic kullanilmadiysa "dosya yok" dusmesin.
  if (!TEST && !fs.existsSync(geceVardiyasi.DOSYA)) geceVardiyasi.yaz({});
  setInterval(() => brifingKontrol('saat'), 10 * 60 * 1000).unref?.();
  void ariaKur();
  pencereKur();
  adaKur();
  tepsiKur();
  surumBekcisiKur();
  // Genel kisayol: Kokpit arka plandayken de Inbox notu. Ctrl+Alt+Shift+N secildi:
  // Turkce klavyede Ctrl+Alt = AltGr, AltGr+harf karakter yazar; uc degistirici cakismaz.
  // Baska bir uygulama aldiysa kayit basarisiz olur, Kokpit yine calisir.
  const notKisayolu = 'Control+Alt+Shift+N';
  const kayitli = globalShortcut.register(notKisayolu, () => {
    pencereyiOneGetir();
    if (pencere) pencere.webContents.send('not:ac');
  });
  log('genel kisayol ' + notKisayolu + (kayitli ? ' kayitli' : ' KAYDEDILEMEDI (baska uygulamada)'));
  // Kokpit'i cagir / gizle: arka plandayken one getirir, ondeyken simge durumuna kucultur.
  // Ayni uc degistirici kurali (AltGr cakismasi). Test kosucularinda kaydedilmez: gercek
  // Kokpit'in kisayolunu calmasin.
  if (process.env.KOKPIT_TEST_KABUK !== '1') {
    const cagirKisayolu = 'Control+Alt+Shift+K';
    const cagir = globalShortcut.register(cagirKisayolu, () => {
      if (!pencere) return;
      if (pencere.isFocused() && !pencere.isMinimized()) pencere.minimize();
      else pencereyiOneGetir();
    });
    log('genel kisayol ' + cagirKisayolu + (cagir ? ' kayitli' : ' KAYDEDILEMEDI (baska uygulamada)'));
  }
  // Klavyeyle ada (v2.4): sirasi gelen oturuma cevap, Kokpit'e gecmeden. Ada kuruluysa kaydedilir
  // (test kosucularinda yalniz KOKPIT_TEST_ADA ile; o zaman gercek Kokpit'inkiyle cakisabilir,
  // kayit dusmesi loglanir ve test bunu bilir).
  if (process.env.KOKPIT_TEST_KABUK !== '1' || process.env.KOKPIT_TEST_ADA === '1') {
    const adaKisayolu = 'Control+Alt+Shift+A';
    const adaKayit = globalShortcut.register(adaKisayolu, () => {
      if (!ada.klavye(!!pencere && pencere.isFocused())) log('ada kisayolu: ada kapali ya da oturum yok');
    });
    log('genel kisayol ' + adaKisayolu + (adaKayit ? ' kayitli' : ' KAYDEDILEMEDI (baska uygulamada)'));
    // v2.7: Ada'yi kenara sakla / geri getir. Ayni uc degistirici kurali.
    const saklaKisayolu = 'Control+Alt+Shift+G';
    const saklaKayit = globalShortcut.register(saklaKisayolu, () => ada.saklaDegistir());
    log('genel kisayol ' + saklaKisayolu + (saklaKayit ? ' kayitli' : ' KAYDEDILEMEDI (baska uygulamada)'));
  }
  // v3.0: ekran yakala -> Ada. Windows'un kendi anlik goruntu aracini acar (ms-screenclip); secilen bolge
  // panoya duser, pano bekcisi alir, Ada hedef oturumu sorar. Win+Shift+S de ayni yoldan gelir (yalniz
  // Ada klavyeyle acilmaz, kart bir an bakar).
  if (process.env.KOKPIT_TEST_KABUK !== '1') {
    const yakalaKisayolu = 'Control+Alt+Shift+S';
    const yakalaKayit = globalShortcut.register(yakalaKisayolu, () => {
      yakalaIstendi = Date.now();
      shell.openExternal('ms-screenclip:').catch((e) => log('ms-screenclip acilamadi: ' + e.message));
    });
    log('genel kisayol ' + yakalaKisayolu + (yakalaKayit ? ' kayitli' : ' KAYDEDILEMEDI (baska uygulamada)'));
  }
  // v3.2: secili metni gonder. On plandaki uygulamanin secimi (Ctrl+Insert ile, pano geri yazilir) ya da
  // Kokpit ondeyse aktif terminalin secimi Ada'nin tepsisine duser; hedef secilip Enter.
  if (process.env.KOKPIT_TEST_KABUK !== '1' || process.env.KOKPIT_TEST_SECIM_KISAYOL === '1') {
    const secimKisayolu = 'Control+Alt+Shift+C';
    const secimKayit = globalShortcut.register(secimKisayolu, () => void secimiAl());
    log('genel kisayol ' + secimKisayolu + (secimKayit ? ' kayitli' : ' KAYDEDILEMEDI (baska uygulamada)'));
  }
  // v3.1: bas-konus. Ada dinler (odak calmaz), konusma bitince metin Ada'nin tepsisine duser ya da
  // "..., gönder" ile biterse dogrudan gider. Ses dosyalari yoksa (npm run ses:kur) kaydedilmez.
  if (!TEST && ses.durum().stt) {
    const sesKisayolu = 'Control+Alt+Shift+Space';
    const sesKayit = globalShortcut.register(sesKisayolu, () => {
      if (!ada.dinle()) log('ses kisayolu: ada kapali');
    });
    log('genel kisayol ' + sesKisayolu + (sesKayit ? ' kayitli' : ' KAYDEDILEMEDI (baska uygulamada)'));
  }
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) pencereKur(); });
});

app.on('before-quit', (olay) => {
  // app.quit() pencereden ONCE gelebilir (CDP Browser.close, Windows oturum kapatma;
  // olculdu). PTY sunucusu burada olurse acik claude'lar sorusuz kesilir. Pencere hala
  // onaysizsa cikis durdurulur ve pencerenin kapatma korumasi calisir; onay gelince pencere
  // kapanir, window-all-closed yeniden app.quit() der ve bu sefer buradan gecilir.
  if (pencere && !kapanisOnaylandi) {
    olay.preventDefault();
    cikisIstendi = true;
    pencere.close();
    return;
  }
  if (!uygulamaKapaniyor) defter.calismaBitti();
  uygulamaKapaniyor = true;
  // PTY sunucusu servis agaclarini oldurup kendisi ciksin; Electron onu beklemeden cikarsa
  // sunucu da olur ve dev sunuculari yetim kalir (bkz. pty-kopru durdurBekle). Bir kez beklenir,
  // sonra cikis yeniden istenir ve bu sefer buradan dogrudan gecilir.
  if (!ptyBeklendi && ptyKopru.calisiyor()) {
    ptyBeklendi = true;
    olay.preventDefault();
    void ptyKopru.durdurBekle(6000).finally(() => app.quit());
    return;
  }
  ptyKopru.durdur();
  aria.kapat();
  ariaArac.durdur();
  ses.durdur();
  kanca.durdur();
  limit.durdur();
  ada.kapat();
  if (tepsi) {
    tepsi.destroy();
    tepsi = null;
  }
});
app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  // Cikis buraya kadar geldiyse iptal edilmedi; PTY sunucusu da beklendi. Baslatici once derler
  // (birkac sn), yeni ornek kilidi alamazsa `--yeniden` ile bekler.
  if (yenidenBaslatIstendi) {
    const testBaslatici = TEST ? process.env.KOKPIT_TEST_BASLATICI : null;
    if (testBaslatici) fs.writeFileSync(testBaslatici, JSON.stringify(yenidenBaslatIstendi));
    else surum.yenidenBaslat(KOK, yenidenBaslatIstendi.arka, ['--yeniden']);
  }
});
app.on('window-all-closed', () => { log('tum pencereler kapandi, cikiliyor'); app.quit(); });
process.on('uncaughtException', (e) => logHata('uncaughtException', e));
process.on('unhandledRejection', (e) => logHata('unhandledRejection', e));
