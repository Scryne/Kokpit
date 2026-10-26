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
// v2.4: Ctrl+Alt+Shift+A ada'ya klavye odagi verir (genel kisayol surece on plan hakki verir,
// olculdu: ~110 ms). Birakinca odak onceki uygulamaya doner; bkz. odakla(false).
//
// v2.6: ada surukle-birakla baska ekrana tasinir (Scryne 2026-10-04). Birakilan ekranin ust
// ortasina oturur, ekran ayarlar.json'da hatirlanir. Suruklemeyi renderer surer (hap
// dugmesinde 4 px esigi, ekran koordinatlari IPC ile); Electron'un `app-region: drag`'i
// KULLANILMAZ: tiklamayi yutar (hap tiklayinca Kokpit one gelir) ve Windows surukleneni
// etkinlestirir (ada odak calardi).
//
// v2.8: ada birakildigi yerde kalir (Scryne 2026-10-13: "istedigim yere"). Kayit hapin ekrana
// gore yerini tutar; pencere ona gore kurulur. Hap ekranin alt kismindaysa kart YUKARI acilir
// (asagi sigmaz), ekran kenarina dayaninca hap o kenara yaslanir (pencere ekrandan tasmaz).
// Bu iki karari main verir, renderer'a 'ada:yerlesim' ile gider. Komut paletindeki "sonraki
// ekran" ada'yi o ekranin ust ortasina koyar; tek ekranda bu, varsayilan yere donmek demek.

const { BrowserWindow, ipcMain, screen } = require('electron');
const { log } = require('./log.cjs');

const GENISLIK = 460;
// Acik kart + soru secenekleri + yazi kutusu sigsin (v2.3). Bos alan fareyi gecirdigi icin
// buyuk pencere alttakini kapatmaz.
const YUKSEKLIK = 520;
/** Kart ile pencere kenari arasi (renderer'daki p-1.5). */
const KENAR = 6;

let ada = null;
/**
 * Kayitli ekran: { id, x, y, hap? } (x/y ekranin sol ustu; kimlik degisirse yedek esleme).
 * hap: { cx, ust, alt } hapin ekranin calisma alanina gore yeri (px); yoksa ust orta.
 */
let ekranKaydi = null;
/** Renderer'a son giden yerlesim: hap pencerenin neresinde, kart ne yone acilir. */
let yerlesim = { yatay: 'orta', dikey: 'asagi' };
let ekranDinleyici = () => {};
/** Surukleme surerken imlecin pencereye gore yeri; null = suruklenmiyor. */
let surukleme = null;
let anaOdakta = true;
let acik = true; // ayarlar.ada
let oturumSayisi = 0;
let sonAnlik = null;
let sonListe = [];
let gitDinleyici = () => {};
let gordumDinleyici = () => {};
/** @type {() => import('electron').BrowserWindow | null} */
let anaPencere = () => null;

/** Ada'nin ekrani: kayitli ekran hala bagliysa o, yoksa birincil. */
function hedefEkran() {
  const ekranlar = screen.getAllDisplays();
  const k = ekranKaydi;
  return (
    (k && (ekranlar.find((d) => d.id === k.id) ?? ekranlar.find((d) => d.bounds.x === k.x && d.bounds.y === k.y))) ||
    screen.getPrimaryDisplay()
  );
}

function ekraniSec(ekran, hap = null) {
  ekranKaydi = { id: ekran.id, x: ekran.bounds.x, y: ekran.bounds.y, ...(hap ? { hap } : {}) };
  ekranDinleyici(ekranKaydi);
  log(`ada ekrani: ${ekran.id} (${ekran.bounds.x},${ekran.bounds.y} ${ekran.bounds.width}x${ekran.bounds.height})`);
}

/** Pencereyi kayitli yere koyar (suruklenirken dokunulmaz). */
function yerlestir() {
  if (!ada || ada.isDestroyed() || surukleme) return;
  const k = konum();
  // Once yerlesim: pencere kayarken hap eski yerlesimle bir kare yanlis yerde gorunmesin.
  if (k.yatay !== yerlesim.yatay || k.dikey !== yerlesim.dikey) {
    yerlesim = { yatay: k.yatay, dikey: k.dikey };
    gonder('ada:yerlesim', yerlesim);
  }
  ada.setBounds({ x: k.x, y: k.y, width: k.width, height: k.height });
}

/**
 * Yarim kalan suruklemeyi keser: `bitir` yalniz renderer'dan gelir; renderer coker, yeniden
 * yuklenir ya da pencere gizlenirse bayrak kalirdi ve ada bir daha yerine oturmaz, saydam
 * pencere alttakinin tiklamalarini yerdi. Fare yeniden gecirgen olur, ada yerine doner.
 */
function suruklemeyiKes() {
  if (!surukleme) return;
  surukleme = null;
  if (!ada || ada.isDestroyed()) return;
  ada.setIgnoreMouseEvents(true, { forward: true });
  yerlestir();
}

const sinirla = (v, alt, ust) => Math.max(alt, Math.min(ust, v));

/**
 * Pencere sinirlari + yerlesim, kayitli hap yerinden. Hap calisma alaninin icinde tutulur
 * (cozunurluk degisti, ekran kuculdu). Pencere ekrandan tasacaksa yaslanir ve hap o kenara
 * gecer; asagi sigmiyorsa kart yukari acilir.
 */
function konum() {
  const alan = hedefEkran().workArea;
  const h = ekranKaydi?.hap;
  if (!h) {
    return { x: Math.round(alan.x + (alan.width - GENISLIK) / 2), y: alan.y, width: GENISLIK, height: YUKSEKLIK, yatay: 'orta', dikey: 'asagi' };
  }
  const yuk = Math.max(1, h.alt - h.ust);
  const cx = sinirla(h.cx, 0, alan.width);
  const ust = sinirla(h.ust, 0, Math.max(0, alan.height - yuk));
  let x = alan.x + cx - GENISLIK / 2;
  let yatay = 'orta';
  if (x < alan.x) {
    x = alan.x;
    yatay = 'sol';
  } else if (x + GENISLIK > alan.x + alan.width) {
    x = alan.x + alan.width - GENISLIK;
    yatay = 'sag';
  }
  let y;
  let dikey;
  if (ust - KENAR + YUKSEKLIK <= alan.height) {
    y = alan.y + ust - KENAR;
    dikey = 'asagi';
  } else {
    y = alan.y + ust + yuk + KENAR - YUKSEKLIK;
    dikey = 'yukari';
  }
  y = Math.max(alan.y, y);
  return { x: Math.round(x), y: Math.round(y), width: GENISLIK, height: YUKSEKLIK, yatay, dikey };
}

function gorunurlukGuncelle() {
  if (!ada || ada.isDestroyed()) return;
  const goster = acik && !anaOdakta && oturumSayisi > 0;
  if (goster && !ada.isVisible()) {
    yerlestir();
    ada.showInactive();
  } else if (!goster && ada.isVisible()) {
    suruklemeyiKes();
    ada.hide();
  }
}

function gonder(kanal, veri) {
  if (ada && !ada.isDestroyed()) ada.webContents.send(kanal, veri);
}

/**
 * @param {{ url: string, preload: string, onGit: (id: string) => void, onGordum: (id: string) => void, ana: () => import('electron').BrowserWindow | null, acik: boolean, ekran?: { id: number, x: number, y: number } | null, onEkran?: (kayit: { id: number, x: number, y: number }) => void }} s
 */
function kur(s) {
  if (ada) return;
  acik = s.acik !== false;
  gitDinleyici = s.onGit;
  gordumDinleyici = s.onGordum;
  anaPencere = s.ana;
  ekranKaydi = s.ekran && typeof s.ekran === 'object' && Number.isFinite(s.ekran.id) ? s.ekran : null;
  ekranDinleyici = s.onEkran ?? (() => {});
  const k = konum();
  yerlesim = { yatay: k.yatay, dikey: k.dikey };
  ada = new BrowserWindow({
    x: k.x,
    y: k.y,
    width: k.width,
    height: k.height,
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
    suruklemeyiKes();
    gonder('ada:yerlesim', yerlesim);
    if (sonAnlik) gonder('etkinlik:anlik', sonAnlik);
    gonder('ada:liste', sonListe);
  });
  ada.webContents.on('render-process-gone', (_e, d) => {
    log('FAIL ada renderer coktu: ' + JSON.stringify(d));
    suruklemeyiKes();
  });
  ada.on('closed', () => {
    ada = null;
  });
  ada.loadURL(s.url).catch((e) => log('FAIL ada yuklenemedi: ' + e.message));
  // Ekran cikarilinca / eklenince / cozunurluk degisince ada yerine doner; kayitli ekran
  // gittiyse birincile duser (kayit silinmez: ekran geri takilinca ada oraya doner).
  for (const olay of ['display-added', 'display-removed', 'display-metrics-changed']) screen.on(olay, yerlestir);
  log('ada kuruldu');
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
        yerlestir();
        ada.setOpacity(1);
        gorunurlukGuncelle();
      }, 60);
    }
    if (anaKilit) setTimeout(() => !ana.isDestroyed() && ana.setFocusable(true), 150);
  }
}

ipcMain.on('ada:fare', (e, icinde) => {
  if (!ada || e.sender !== ada.webContents) return;
  // Suruklerken fare yakalanir kalir; hizli cekiste imlec bir an karttan tasabilir.
  if (surukleme && !icinde) return;
  ada.setIgnoreMouseEvents(!icinde, { forward: true });
});
// Surukle-birak (v2.6). x/y ekran koordinati (DIP, renderer'in screenX/Y'si). `bitir`de
// renderer hapin pencere icindeki dikdortgenini de yollar (v2.8): ada oraya birakilir.
ipcMain.on('ada:surukle', (e, m) => {
  if (!ada || ada.isDestroyed() || e.sender !== ada.webContents || !m || typeof m !== 'object') return;
  if (!Number.isFinite(m.x) || !Number.isFinite(m.y)) return;
  const x = Math.round(m.x);
  const y = Math.round(m.y);
  if (m.asama === 'basla') {
    const b = ada.getBounds();
    surukleme = { dx: x - b.x, dy: y - b.y };
    ada.setIgnoreMouseEvents(false);
  } else if (m.asama === 'tasi' && surukleme) {
    // setBounds, setPosition degil: boyut her adimda yeniden verilir (saydam pencere ekran
    // sinirinda boyut kaydirmasin).
    ada.setBounds({ x: x - surukleme.dx, y: y - surukleme.dy, width: GENISLIK, height: YUKSEKLIK });
  } else if (m.asama === 'bitir' && surukleme) {
    surukleme = null;
    const r = m.hap;
    const gecerli = r && typeof r === 'object' && ['sol', 'ust', 'sag', 'alt'].every((a) => Number.isFinite(r[a]));
    if (!gecerli) {
      ekraniSec(screen.getDisplayNearestPoint({ x, y }));
    } else {
      // Hap ekranda nerede: pencere konumu + pencere icindeki yeri. Ekran, hapin ortasina gore.
      const b = ada.getBounds();
      const cx = b.x + (r.sol + r.sag) / 2;
      const ust = b.y + r.ust;
      const alt = b.y + r.alt;
      const ekran = screen.getDisplayNearestPoint({ x: Math.round(cx), y: Math.round((ust + alt) / 2) });
      const alan = ekran.workArea;
      ekraniSec(ekran, { cx: Math.round(cx - alan.x), ust: Math.round(ust - alan.y), alt: Math.round(alt - alan.y) });
    }
    yerlestir();
  }
});
ipcMain.on('ada:git', (e, id) => {
  if (!ada || e.sender !== ada.webContents || typeof id !== 'string') return;
  gitDinleyici(id);
});
ipcMain.on('ada:gordum', (e, id) => {
  if (!ada || e.sender !== ada.webContents || typeof id !== 'string') return;
  gordumDinleyici(id);
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
    if (!ada || ada.isDestroyed() || !acik || oturumSayisi === 0) return false;
    if (!anaOdakta) {
      gorunurlukGuncelle();
      odakla(true);
    }
    gonder('ada:klavye', { anaOdakta: anaOdakta === true });
    return true;
  },
  /**
   * Komut paleti: ada'yi siradaki ekranin ust ortasina tasir (soldan saga, sonda basa doner).
   * Tek ekranda ada ust ortaya doner: surukleyip kaybedilen ada'nin klavye yolu.
   * @returns {{ toplam: number, sira: number, alan: Electron.Rectangle }}
   */
  sonrakiEkran() {
    const ekranlar = screen.getAllDisplays().sort((a, b) => a.bounds.x - b.bounds.x || a.bounds.y - b.bounds.y);
    const simdiki = hedefEkran();
    const i = ekranlar.findIndex((d) => d.id === simdiki.id);
    const yeni = ekranlar[(i + 1) % ekranlar.length];
    ekraniSec(yeni);
    yerlestir();
    return { toplam: ekranlar.length, sira: ekranlar.indexOf(yeni) + 1, alan: yeni.workArea };
  },
  kapat() {
    if (ada && !ada.isDestroyed()) ada.destroy();
    ada = null;
  },
};
