// Ada: Kokpit arka plandayken ekranin ust ortasinda duran kucuk cam serit.
// Coucou'nun (Louis-CFM/coucou) "notch" fikrinin Kokpit'teki karsiligi; karakter ve onay
// dugmeleri yok (Scryne bypass modunda, izin sorusu gelmez). Gosterdigi: hangi oturum ne
// yapiyor, hangisi seni bekliyor, limit ne durumda. Tiklayinca Kokpit o sekmeyle one gelir.
//
// Pencere: cercevesiz, SAYDAM (sekil icin), hep ustte, odak calmaz, gorev cubugunda yok.
// Saydam pencere akrilik alamaz; ada kendi koyu tonunu tasir (kontrast garanti, DESIGN.md).
// Pencere hep ayni boyutta; bos alanlar fare olaylarini alttaki pencereye gecirir
// (setIgnoreMouseEvents forward). Renderer imlec adanin uzerine gelince yakalamayi acar.
// Boyut degistirmek yerine bu yol secildi: saydam pencereyi her acilista yeniden boyutlamak
// Windows'ta titriyor.

const { BrowserWindow, ipcMain, screen } = require('electron');
const { log } = require('./log.cjs');

const GENISLIK = 460;
const YUKSEKLIK = 340;

let ada = null;
let anaOdakta = true;
let acik = true; // ayarlar.ada
let oturumSayisi = 0;
let sonAnlik = null;
let sonListe = [];
let gitDinleyici = () => {};

function konum() {
  const alan = screen.getPrimaryDisplay().workArea;
  return {
    x: Math.round(alan.x + (alan.width - GENISLIK) / 2),
    y: alan.y,
    width: GENISLIK,
    height: YUKSEKLIK,
  };
}

function gorunurlukGuncelle() {
  if (!ada || ada.isDestroyed()) return;
  const goster = acik && !anaOdakta && oturumSayisi > 0;
  if (goster && !ada.isVisible()) {
    ada.setBounds(konum());
    ada.showInactive();
  } else if (!goster && ada.isVisible()) {
    ada.hide();
  }
}

function gonder(kanal, veri) {
  if (ada && !ada.isDestroyed()) ada.webContents.send(kanal, veri);
}

/**
 * @param {{ url: string, preload: string, onGit: (id: string) => void, acik: boolean }} s
 */
function kur(s) {
  if (ada) return;
  acik = s.acik !== false;
  gitDinleyici = s.onGit;
  ada = new BrowserWindow({
    ...konum(),
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    focusable: false,
    hasShadow: false,
    alwaysOnTop: true,
    title: 'Kokpit Ada',
    webPreferences: {
      preload: s.preload,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  // 'screen-saver' seviyesi tam ekran uygulamalarin da ustunde kalir; ada bunu istemez.
  ada.setAlwaysOnTop(true, 'floating');
  ada.setIgnoreMouseEvents(true, { forward: true });
  ada.webContents.on('did-finish-load', () => {
    if (sonAnlik) gonder('etkinlik:anlik', sonAnlik);
    gonder('ada:liste', sonListe);
  });
  ada.webContents.on('render-process-gone', (_e, d) => log('FAIL ada renderer coktu: ' + JSON.stringify(d)));
  ada.on('closed', () => {
    ada = null;
  });
  ada.loadURL(s.url).catch((e) => log('FAIL ada yuklenemedi: ' + e.message));
  log('ada kuruldu');
}

ipcMain.on('ada:fare', (e, icinde) => {
  if (!ada || e.sender !== ada.webContents) return;
  ada.setIgnoreMouseEvents(!icinde, { forward: true });
});
ipcMain.on('ada:git', (e, id) => {
  if (!ada || e.sender !== ada.webContents || typeof id !== 'string') return;
  gitDinleyici(id);
});

module.exports = {
  kur,
  /** Ana pencerenin odagi: odaktayken ada gizlenir, Kokpit zaten her seyi gosteriyor. */
  anaOdak(odakta) {
    anaOdakta = odakta;
    gorunurlukGuncelle();
  },
  ayar(yeniAcik) {
    acik = yeniAcik !== false;
    gorunurlukGuncelle();
  },
  /** Renderer'in oturum listesi (id, ad, grup): adlar Kokpit'te, ada onlari bilmez. */
  liste(liste) {
    sonListe = Array.isArray(liste) ? liste : [];
    oturumSayisi = sonListe.length;
    gonder('ada:liste', sonListe);
    gorunurlukGuncelle();
  },
  anlik(a) {
    sonAnlik = a;
    gonder('etkinlik:anlik', a);
  },
  sinyal(id, sinyal) {
    gonder('etkinlik:sinyal', { id, sinyal });
  },
  kapat() {
    if (ada && !ada.isDestroyed()) ada.destroy();
    ada = null;
  },
};
