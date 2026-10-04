// Ada: Kokpit arka plandayken ekranin ust ortasinda duran kucuk cam serit.
// Coucou'nun (Louis-CFM/coucou) "notch" fikrinin Kokpit'teki karsiligi; onay dugmeleri yok
// (Scryne bypass modunda, izin sorusu gelmez). v2.5'ten beri bir karakteri var: Ada'nin gozu
// (renderer AdaGoz.tsx; Scryne 2026-10-04'te dort yon arasindan secti). Gosterdigi: hangi oturum
// ne yapiyor, hangisi seni bekliyor, limit ne durumda. Tiklayinca Kokpit o sekmeyle one gelir.
//
// Pencere: cercevesiz, SAYDAM (sekil icin), hep ustte, odak calmaz, gorev cubugunda yok.
// Saydam pencere akrilik alamaz; ada kendi koyu tonunu tasir (kontrast garanti, DESIGN.md).
// Pencere hep ayni boyutta; bos alanlar fare olaylarini alttaki pencereye gecirir
// (setIgnoreMouseEvents forward). Renderer imlec adanin uzerine gelince yakalamayi acar.
// Boyut degistirmek yerine bu yol secildi: saydam pencereyi her acilista yeniden boyutlamak
// Windows'ta titriyor.
//
// v2.6, masaustu ajani: Ada HEP gorunur (ayar `adaHep`, varsayilan acik) — oturum yokken de,
// Kokpit ondeyken de, ana pencere tepsideyken de. Oturumsuz limitler (limit.cjs), Kokpit disindaki
// claude oturumlari (dis-oturumlar.cjs) ve "gorev ver" (proje + metin -> arka planda yeni oturum).
//
// v2.4: Ctrl+Alt+Shift+A ada'ya klavye odagi verir (genel kisayol surece on plan hakki verir,
// olculdu: ~110 ms). Birakinca odak onceki uygulamaya doner; bkz. odakla(false).

const { BrowserWindow, ipcMain, screen } = require('electron');
const { log } = require('./log.cjs');
const disOturumlar = require('./dis-oturumlar.cjs');

const GENISLIK = 460;
// Acik kart + soru secenekleri + yazi kutusu sigsin (v2.3). Bos alan fareyi gecirdigi icin
// buyuk pencere alttakini kapatmaz.
const YUKSEKLIK = 520;

let ada = null;
let anaOdakta = true;
let acik = true; // ayarlar.ada
let hep = true; // ayarlar.adaHep: Kokpit ondeyken ve oturum yokken de gorunur
let oturumSayisi = 0;
let sonAnlik = null;
let sonListe = [];
let gitDinleyici = () => {};
let gordumDinleyici = () => {};
let gorevDinleyici = () => {};
let limitTazeleDinleyici = () => {};
let sonProjeler = []; // { ad, yol } — gorev hedefi yalniz bu listeden olabilir
let sonDis = [];
let disZamanlayici = null;
const DIS_ARALIK_MS = 4000;
/** @type {() => import('electron').BrowserWindow | null} */
let anaPencere = () => null;

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
  const goster = acik && (hep || (!anaOdakta && oturumSayisi > 0));
  if (goster && !ada.isVisible()) {
    ada.setBounds(konum());
    ada.showInactive();
  } else if (!goster && ada.isVisible()) {
    ada.hide();
  }
  disYoklamaAyarla(goster);
}

/** Dis oturumlar yalniz ada gorunurken okunur (4 sn; birkac kucuk JSON). Degisince gonderilir. */
function disYoklamaAyarla(gorunur) {
  if (gorunur && !disZamanlayici) {
    disOku();
    disZamanlayici = setInterval(disOku, DIS_ARALIK_MS);
  } else if (!gorunur && disZamanlayici) {
    clearInterval(disZamanlayici);
    disZamanlayici = null;
  }
}

function disOku() {
  let liste;
  try {
    liste = disOturumlar.oku(new Set(sonListe.map((o) => o.claude).filter(Boolean)));
  } catch (e) {
    log('dis oturumlar okunamadi: ' + e.message);
    return;
  }
  if (JSON.stringify(liste) === JSON.stringify(sonDis)) return;
  sonDis = liste;
  gonder('ada:dis', sonDis);
}

function gonder(kanal, veri) {
  if (ada && !ada.isDestroyed()) ada.webContents.send(kanal, veri);
}

/**
 * @param {{ url: string, preload: string, onGit: (id: string) => void, onGordum: (id: string) => void,
 *   onGorev: (g: { ad: string, yol: string, metin: string }) => void, onLimitTazele: () => void,
 *   ana: () => import('electron').BrowserWindow | null, acik: boolean, hep: boolean }} s
 */
function kur(s) {
  if (ada) return;
  acik = s.acik !== false;
  hep = s.hep !== false;
  gitDinleyici = s.onGit;
  gordumDinleyici = s.onGordum;
  gorevDinleyici = s.onGorev;
  limitTazeleDinleyici = s.onLimitTazele;
  anaPencere = s.ana;
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
    gonder('ada:projeler', sonProjeler);
    gonder('ada:dis', sonDis);
    gonder('ada:ayar', { hep });
  });
  ada.webContents.on('render-process-gone', (_e, d) => log('FAIL ada renderer coktu: ' + JSON.stringify(d)));
  ada.on('closed', () => {
    ada = null;
  });
  ada.loadURL(s.url).catch((e) => log('FAIL ada yuklenemedi: ' + e.message));
  log('ada kuruldu' + (hep ? ' (hep gorunur)' : ''));
  // Oturumsuz da gorunur: yuklenir yuklenmez.
  ada.once('ready-to-show', gorunurlukGuncelle);
}

/**
 * Gecici odak. Ada `focusable: false` kurulur (oyun/yazi ortasinda odak calmasin); yazi kutusu
 * ya da klavye kisayolu icin acilir, birakilinca kapanir. Odaktayken fare olaylari da yakalanir
 * (imlec kartin disina kaysa bile kutu yazilabilir kalsin).
 */
function odakla(istek) {
  if (!ada || ada.isDestroyed()) return;
  if (istek) {
    ada.setFocusable(true);
    ada.setIgnoreMouseEvents(false);
    ada.focus();
  } else {
    const odaktaydi = ada.isFocused();
    // Odak ONCEKI uygulamaya donmeli (Scryne kisayola orada basti). Olculdu 2026-10-04, gercek
    // kisayol + Win32 on plan okumasi: blur() -> Kokpit'in ana penceresi one geliyor; ana pencere
    // etkinlestirilemez yapilip blur()/hide() -> hicbir pencere etkin degil; minimize() + ana kilit
    // -> Windows'un "son kullanici girdisiyle etkinlesen" penceresi. Ada sonra odaksiz geri gelir;
    // kucultme animasyonu gorunmesin diye o an saydamdir.
    const ana = anaPencere();
    const anaKilit = odaktaydi && ana && !ana.isDestroyed() && ana.isVisible() && !ana.isMinimized();
    if (anaKilit) ana.setFocusable(false);
    ada.setFocusable(false);
    ada.setIgnoreMouseEvents(true, { forward: true });
    if (odaktaydi) {
      ada.setOpacity(0);
      ada.minimize();
      setTimeout(() => {
        if (!ada || ada.isDestroyed()) return;
        ada.showInactive();
        ada.setBounds(konum());
        ada.setOpacity(1);
        gorunurlukGuncelle();
      }, 60);
    }
    if (anaKilit) setTimeout(() => !ana.isDestroyed() && ana.setFocusable(true), 150);
  }
}

ipcMain.on('ada:fare', (e, icinde) => {
  if (!ada || e.sender !== ada.webContents) return;
  ada.setIgnoreMouseEvents(!icinde, { forward: true });
});
ipcMain.on('ada:git', (e, id) => {
  if (!ada || e.sender !== ada.webContents || typeof id !== 'string') return;
  gitDinleyici(id);
});
ipcMain.on('ada:gordum', (e, id) => {
  if (!ada || e.sender !== ada.webContents || typeof id !== 'string') return;
  gordumDinleyici(id);
});
// Gorev: hedef klasor renderer'dan YOL olarak gelmez, ana pencerenin verdigi proje listesinden
// adla secilir. Metin tek parca, sinirli; kabuga gecisi pty-server'da ortam degiskeniyle (bkz. orada).
ipcMain.on('ada:gorev', (e, ham) => {
  if (!ada || e.sender !== ada.webContents || !ham || typeof ham !== 'object') return;
  const p = sonProjeler.find((x) => x.ad === ham.ad);
  const metin = typeof ham.metin === 'string' ? ham.metin.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').trim() : '';
  if (!p || !metin || metin.length > 4000) {
    log('ada gorevi reddedildi (' + (p ? 'metin' : 'proje') + ')');
    return;
  }
  gorevDinleyici({ ad: p.ad, yol: p.yol, metin });
});
ipcMain.on('ada:limit-tazele', (e) => {
  if (!ada || e.sender !== ada.webContents) return;
  limitTazeleDinleyici();
});

module.exports = {
  kur,
  /** Ana pencerenin odagi: odaktayken ada gizlenir, Kokpit zaten her seyi gosteriyor. */
  anaOdak(odakta) {
    anaOdakta = odakta;
    gorunurlukGuncelle();
  },
  ayar(yeniAcik, yeniHep) {
    acik = yeniAcik !== false;
    if (typeof yeniHep === 'boolean') hep = yeniHep;
    gonder('ada:ayar', { hep });
    gorunurlukGuncelle();
  },
  durum: () => ({ acik, hep }),
  /** Gorev hedefleri: ana pencerenin sirali proje listesi (ad + yol). */
  projeler(liste) {
    sonProjeler = Array.isArray(liste) ? liste : [];
    gonder('ada:projeler', sonProjeler);
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
  /** Renderer'in istegi: yazi kutusuna tiklandi (true) ya da odak karttan cikti (false). */
  odak(istek) {
    odakla(istek);
  },
  /**
   * Genel kisayol (Ctrl+Alt+Shift+A): klavyeyle ada. Kokpit ondeyse ada gizlidir; renderer
   * o zaman sirasi gelen oturuma Kokpit'in icinde gider. Arka plandaysa ada odak alir ve
   * renderer ilk eylemi (secenek ya da yanit kutusu) odaklar; Esc birakir.
   * @returns {boolean} bir sey yapildi mi (ada kapali / oturum yok -> false)
   */
  klavye(anaOdakta) {
    if (!ada || ada.isDestroyed() || !acik || (oturumSayisi === 0 && !hep)) return false;
    if (!anaOdakta) {
      gorunurlukGuncelle();
      odakla(true);
    }
    gonder('ada:klavye', { anaOdakta: anaOdakta === true });
    return true;
  },
  kapat() {
    disYoklamaAyarla(false);
    if (ada && !ada.isDestroyed()) ada.destroy();
    ada = null;
  },
};
