const { app, BrowserWindow, Menu, dialog, ipcMain, screen, session, shell } = require('electron');
const fs = require('fs');
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

// Windows bildirimleri (toast) bir AppUserModelID ister; paketlenmemis uygulamada bu
// verilmezse bildirim sessizce hic gorunmez.
app.setAppUserModelId('com.scryne.kokpit');

const DEV = !app.isPackaged && process.env.KOKPIT_DEV !== '0';

// Tek ornek. Ikinci Kokpit ayni oturum defterini paylasir: birincinin acik oturumlarini
// "onceki calismadan kalan" sanip geri yukleme teklif eder (ayni klasorde ikinci
// `claude --continue`), ayarlar da yarisir. Ikinci acilis mevcut pencereyi one getirir.
// Test/ekran kosuculari (KOKPIT_TEST_KABUK=1) gercek Kokpit acikken de calisabilmeli.
if (process.env.KOKPIT_TEST_KABUK !== '1' && !app.requestSingleInstanceLock()) {
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

function pencereKur() {
  const konum = pencereKonumu();
  pencere = new BrowserWindow({
    width: 1280,
    height: 860,
    ...konum,
    minWidth: 900,
    minHeight: 600,
    show: false,
    // Pencere OPAK. Akrilik/seffaflik 2026-09-10'da denendi ve geri alindi:
    // duvar kagidi acik oldugunda tum arayuz gri corbaya donuyordu ve cam yuzeyler
    // kendi kontrastini garanti edemiyordu. Cam artik uygulamanin KENDI zemini uzerinde.
    backgroundColor: '#090a0c',
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
    },
  });

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

  pencere.on('closed', () => { pencere = null; });
}

ipcMain.handle('durum:getir', async () => durumOku());
ipcMain.handle('log:yol', () => LOG_DOSYA);
ipcMain.handle('pty:bilgi', async () => {
  try {
    return { bilgi: await ptyKopru.baslat() };
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
  pencere.show();
  pencere.focus();
}
ipcMain.handle('pencere:odakla', pencereyiOneGetir);
// Ikinci `kokpit` calistirildi (tek ornek kilidi): mevcut pencere one gelir.
app.on('second-instance', pencereyiOneGetir);
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
    defter.ekle({ olay: 'acildi', id: o.id, ad: o.ad, yol: o.yol });
  } else if (o.olay === 'kapandi') {
    if (uygulamaKapaniyor && o.sebep === 'kabuk') return;
    defter.ekle({
      olay: 'kapandi',
      id: o.id,
      kod: Number.isInteger(o.kod) ? o.kod : null,
      sebep: DEFTER_SEBEP.has(o.sebep) ? o.sebep : 'kullanici',
    });
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
      k.beyin = beyin.oturumBeyinDurumu(yol, k.baslangic);
    } catch (e) {
      log('beyin durumu okunamadi (' + yol + '): ' + e.message);
      k.beyin = 'yok';
    }
  }
  return sonlar;
});
// Vault'a TEK yazma: Inbox notu (bkz. not.cjs). Sona ekleme, ustune yazma yok.
ipcMain.handle('not:ekle', (_e, metin, kaynak) =>
  inboxNotu.ekle(metin, typeof kaynak === 'string' ? kaynak.slice(0, 60) : null)
);
ipcMain.handle('ayar:getir', () => {
  const a = ayarlar.oku();
  return { kenarAcik: a.kenarAcik, yaziBoyutu: a.yaziBoyutu };
});
ipcMain.handle('ayar:kaydet', (_e, yama) => {
  const a = ayarlar.yaz(ayarlar.rendererYamasi(yama));
  return { kenarAcik: a.kenarAcik, yaziBoyutu: a.yaziBoyutu };
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
    "worker-src 'self' blob:; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-src 'none'"
  : "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; " +
    "font-src 'self'; connect-src 'self' ws://127.0.0.1:*; img-src 'self' data:; " +
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
  pencereKur();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) pencereKur(); });
});

app.on('before-quit', (olay) => {
  // app.quit() pencereden ONCE gelebilir (CDP Browser.close, Windows oturum kapatma;
  // olculdu). PTY sunucusu burada olurse acik claude'lar sorusuz kesilir. Pencere hala
  // onaysizsa cikis durdurulur ve pencerenin kapatma korumasi calisir; onay gelince pencere
  // kapanir, window-all-closed yeniden app.quit() der ve bu sefer buradan gecilir.
  if (pencere && !kapanisOnaylandi) {
    olay.preventDefault();
    pencere.close();
    return;
  }
  if (!uygulamaKapaniyor) defter.calismaBitti();
  uygulamaKapaniyor = true;
  ptyKopru.durdur();
});
app.on('window-all-closed', () => { log('tum pencereler kapandi, cikiliyor'); app.quit(); });
process.on('uncaughtException', (e) => logHata('uncaughtException', e));
process.on('unhandledRejection', (e) => logHata('unhandledRejection', e));
