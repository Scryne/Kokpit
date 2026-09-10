const { app, BrowserWindow, Menu, ipcMain, session, shell } = require('electron');
const path = require('path');
const { DEV_URL, DEV_PORT } = require('./config.cjs');
const { log, logHata, LOG_DOSYA } = require('./log.cjs');
const { durumOku } = require('./durum.cjs');
const ptyKopru = require('./pty-kopru.cjs');
const uretim = require('./uretim-protokolu.cjs');

const DEV = !app.isPackaged && process.env.KOKPIT_DEV !== '0';

// Sema kaydi app hazir olmadan ONCE yapilmali.
if (!DEV) uretim.semaKaydet();
let pencere = null;

function pencereKur() {
  pencere = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    show: false,
    // Pencere OPAK. Akrilik/seffaflik 2026-09-10'da denendi ve geri alindi:
    // duvar kagidi acik oldugunda tum arayuz gri corbaya donuyordu ve cam yuzeyler
    // kendi kontrastini garanti edemiyordu. Cam artik uygulamanin KENDI zemini uzerinde.
    backgroundColor: '#090a0c',
    title: 'Kokpit',
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
  pencere.once('ready-to-show', () => pencere.show());

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
  const hata = await shell.openPath(yol);
  if (hata) log(`klasor acilamadi (${yol}): ${hata}`);
  return !hata;
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

app.on('before-quit', () => ptyKopru.durdur());
app.on('window-all-closed', () => { log('tum pencereler kapandi, cikiliyor'); app.quit(); });
process.on('uncaughtException', (e) => logHata('uncaughtException', e));
process.on('unhandledRejection', (e) => logHata('unhandledRejection', e));
