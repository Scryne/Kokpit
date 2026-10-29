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
//
// v2.7, saklanma (Scryne 2026-10-06: "YouTube izlerken orada kaliyor; kalsin ama gizleyebileyim"):
// - Saklan (`adaSakli`): Ada ekranin ust kenarinin arkasina cekilir, yalniz gumus cenesi ve
//   gozlerinin alt yarisi gorunur. Imlec ustunde durunca kenardan sarkar. Kart dugmesi, tepsi ya da
//   Ctrl+Alt+Shift+G. Kalici: yeniden acilista da sakli.
// - Sinema (`adaTamEkran`): on plandaki pencere Ada'nin ekranini tamamen kapliyorsa (tam ekran
//   video, oyun, sunum) Ada pencereyi tamamen gizler; seni bekleyen bir sey varsa yalniz cenesi gorunur.
// - Yer (`adaKonum`): hap ust kenar boyunca suruklenir, ortaya yaklasinca ortaya oturur.
//   Calisma alani genisliginin orani olarak saklanir (cozunurluk degisince de ayni yerde).
//
// v2.8, ust katman bekcisi (Scryne 2026-10-06: "sadece masaustunde gorunuyor"): Windows Ada'yi
// topmost bayragi acikken normal pencerelerin altina dusurebiliyor (olculdu). Yoklama her turda
// z-sirasini okur, dusmusse odak calmadan geri koyar (ust-katman.cjs).

const { BrowserWindow, ipcMain, screen } = require('electron');
const { log } = require('./log.cjs');
const disOturumlar = require('./dis-oturumlar.cjs');
const tamEkran = require('./tam-ekran.cjs');
const ustKatman = require('./ust-katman.cjs');
const yer = require('./ada-yer.cjs');

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
let ekGonderDinleyici = (_istek) => {};
let ekSilDinleyici = (_kimlikler) => {};
let birakDinleyici = (_yollar) => 0;
let sonEkler = []; // v3.0: yakala.cjs listesi (yolsuz)
let sesli = true; // v3.1: ayarlar.adaSesli (sesli bildirim)
let uyanma = false; // v3.2: ayarlar.adaUyanma (eller serbest: "Ada, ...")
let uyanmaCozDinleyici = async (_wav, _liste) => ({ uyandi: false });
let sesHazirlaDinleyici = () => {};
let sesCozDinleyici = async (_wav, _liste) => ({ hata: 'ses kurulu değil' });
let konusDinleyici = async (_metin, _bildirim) => null;
let sesDurumu = () => ({ stt: false, tts: false });
let sonNobet = null; // v3.0: nobet.cjs son olcumu
let sonVadeler = []; // v3.0: durum.py vadeleri
let sonProjeler = []; // { ad, yol } — gorev hedefi yalniz bu listeden olabilir
let sonDis = [];
let disZamanlayici = null;
const DIS_ARALIK_MS = 4000;
/** @type {() => import('electron').BrowserWindow | null} */
let anaPencere = () => null;

let sakli = false; // ayarlar.adaSakli: kenara cekilmis (yalniz cene)
let tamEkranAyar = true; // ayarlar.adaTamEkran: tam ekran uygulamada cekil
let tamEkranda = false; // son okuma: on plan pencere Ada'nin ekranini kapliyor
// Sinema girisi gecikmeli (tam-ekran.cjs sinemaAdimi): Alt+Tab gibi gecici katmanlar Ada'yi titretmez.
let sinemaDurumu = { sinema: false, aday: null };
let oran = 0.5; // ayarlar.adaKonum: hapin merkezi, calisma alani genisliginin orani
let ayarDinleyici = (_yama) => {};
let yoklamaZamanlayici = null;
const YOKLAMA_MS = 600; // tam ekran + ust katman; ikisi de birkac user32 cagrisi (~10 µs)
let dusus = { sayi: 0, sonLog: 0 }; // ust katman dususleri: ilk her zaman, sonra dakikada en fazla bir log
let surukleme = null; // { x0, imlec0 }
// v3.0, Ada'ya birakma. Ada fareyi alttaki pencereye gecirirken (setIgnoreMouseEvents forward) Windows'un
// surukle-birak dongusu ona fare olayi yollamaz: imlec hapa gelse de renderer haberdar olmaz, birakma
// alttaki pencereye gider. Yoklama sol tus basiliyken imlec hapin bolgesindeyse yakalamayi acar;
// renderer dragenter ile kartini acar. Tus birakilinca (renderer imleci icinde saymiyorsa) kapanir.
let fareIcinde = false;
let birakmaAcik = false;
let tusOku = null;
let ekranDinleniyor = false;

function konum() {
  const alan = screen.getPrimaryDisplay().workArea;
  return {
    x: yer.yatayKonum(alan, GENISLIK, oran),
    y: alan.y,
    width: GENISLIK,
    height: YUKSEKLIK,
  };
}

/** normal | sakli (kullanici cekti) | sinema (tam ekran uygulama onde). */
function kip() {
  if (tamEkranAyar && tamEkranda) return 'sinema';
  return sakli ? 'sakli' : 'normal';
}

/** Renderer'a giden ayar: gorunurluk kipi + v3.1 ses (kurulu mu, sesli bildirim acik mi). */
function ayarYuku() {
  return { hep, kip: kip(), sesli, uyanma: uyanma && sesDurumu().stt, ses: sesDurumu() };
}

/** Sinemada yalniz "seni bekliyor" gosterilir: Kokpit oturumu ya da disaridaki oturum. */
function bekleyenVar() {
  const o = sonAnlik?.oturumlar ?? {};
  return sonListe.some((x) => o[x.id]?.durum === 'bekliyor') || sonDis.some((d) => d.durum === 'bekliyor');
}

let sonKip = null;
function gorunurlukGuncelle() {
  if (!ada || ada.isDestroyed()) return;
  const k = kip();
  if (k !== sonKip) {
    sonKip = k;
    gonder('ada:ayar', ayarYuku());
  }
  const goster = acik && (hep || (!anaOdakta && oturumSayisi > 0)) && (k !== 'sinema' || bekleyenVar());
  if (goster && !ada.isVisible()) {
    ada.setBounds(konum());
    ada.showInactive();
    ustteTut();
  } else if (!goster && ada.isVisible()) {
    ada.hide();
  }
  // Sinemada gizliyken dis oturumlar yine okunur: disaridaki "seni bekliyor" cenesini gostermeli.
  disYoklamaAyarla(goster || (acik && k === 'sinema'));
  yoklamaAyarla();
}

/**
 * Yoklama: Ada acik oldugu surece (gizliyken de, sinemadan cikisi gormek icin). Her tur: tam ekran
 * (ayar aciksa) ve gorunurken ust katman.
 */
function yoklamaAyarla() {
  const gerek = !!ada && acik && (hep || oturumSayisi > 0);
  if (gerek && !yoklamaZamanlayici) {
    yoklamaZamanlayici = setInterval(yokla, YOKLAMA_MS);
  } else if (!gerek && yoklamaZamanlayici) {
    clearInterval(yoklamaZamanlayici);
    yoklamaZamanlayici = null;
    sinemaDurumu = { sinema: false, aday: null };
    if (tamEkranda) {
      tamEkranda = false;
      gorunurlukGuncelle();
    }
  }
}

function yokla() {
  if (!ada || ada.isDestroyed()) return;
  if (tamEkranAyar) tamEkranOku();
  if (ada.isVisible()) {
    ustteTut();
    birakmaYokla();
  }
}

function solTusBasili() {
  if (tusOku === null) {
    tusOku = false;
    if (process.platform === 'win32') {
      try {
        const koffi = require('koffi');
        tusOku = koffi.load('user32.dll').func('int16 __stdcall GetAsyncKeyState(int vKey)');
      } catch (e) {
        log('ada: tus durumu okunamiyor, birakma yalniz imlec onceden hapin ustundeyse calisir: ' + e.message);
      }
    }
  }
  if (!tusOku) return false;
  try {
    return (tusOku(0x01) & 0x8000) !== 0;
  } catch {
    return false;
  }
}

function birakmaYokla() {
  if (fareIcinde && !birakmaAcik) return;
  const basili = solTusBasili();
  if (!birakmaAcik && basili && yer.hapBolgesinde(screen.getCursorScreenPoint(), ada.getBounds())) {
    birakmaAcik = true;
    ada.setIgnoreMouseEvents(false);
  } else if (birakmaAcik && !basili) {
    birakmaAcik = false;
    if (!fareIcinde) ada.setIgnoreMouseEvents(true, { forward: true });
  }
}

/** Ada dusmusse topmost bandinin tepesine geri; ustteki pencerenin sinifi teshis icin loglanir. */
function ustteTut() {
  if (!ada || ada.isDestroyed()) return;
  const s = ustKatman.kontrolEt(ada.getNativeWindowHandle());
  if (!s || !s.dustu) return;
  dusus.sayi++;
  const simdi = Date.now();
  if (dusus.sayi === 1 || simdi - dusus.sonLog > 60000) {
    log('ada: ust katmandan dusmus, ustundeki ' + s.ustteki + (s.duzeldi ? ', geri alindi' : ', GERI ALINAMADI') + ' (toplam ' + dusus.sayi + ')');
    dusus.sonLog = simdi;
  }
}

function tamEkranOku() {
  const okuma = tamEkran.oku(ada.getNativeWindowHandle());
  sinemaDurumu = tamEkran.sinemaAdimi(sinemaDurumu, okuma.tam, Date.now());
  const t = sinemaDurumu.sinema;
  if (t === tamEkranda) return;
  tamEkranda = t;
  log('ada: ' + (t ? 'tam ekran uygulama onde (' + (okuma.sinif || '?') + '), sinema' : 'tam ekran bitti'));
  gorunurlukGuncelle();
}

function sakla(istek) {
  const yeni = istek === true;
  if (yeni === sakli) return;
  sakli = yeni;
  log('ada: ' + (sakli ? 'kenara cekildi' : 'geri geldi'));
  ayarDinleyici({ adaSakli: sakli });
  gorunurlukGuncelle();
}

/** Dis oturumlar yalniz ada gorunurken okunur (4 sn; birkac kucuk JSON). Degisince gonderilir. */
function disYoklamaAyarla(gorunur) {
  if (gorunur && !disZamanlayici) {
    disZamanlayici = setInterval(disOku, DIS_ARALIK_MS);
    disOku();
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
  if (tamEkranda) gorunurlukGuncelle();
}

function gonder(kanal, veri) {
  if (ada && !ada.isDestroyed()) ada.webContents.send(kanal, veri);
}

/**
 * @param {{ url: string, preload: string, onGit: (id: string) => void, onGordum: (id: string) => void,
 *   onGorev: (g: { ad: string, yol: string, metin: string }) => void, onLimitTazele: () => void,
 *   ana: () => import('electron').BrowserWindow | null, acik: boolean, hep: boolean,
 *   sakli?: boolean, tamEkran?: boolean, konum?: number | null, onAyar?: (yama: object) => void }} s
 */
function kur(s) {
  if (ada) return;
  acik = s.acik !== false;
  hep = s.hep !== false;
  gitDinleyici = s.onGit;
  gordumDinleyici = s.onGordum;
  gorevDinleyici = s.onGorev;
  limitTazeleDinleyici = s.onLimitTazele;
  ekGonderDinleyici = s.onEkGonder ?? (() => {});
  ekSilDinleyici = s.onEkSil ?? (() => {});
  birakDinleyici = s.onBirak ?? (() => 0);
  sesHazirlaDinleyici = s.onSesHazirla ?? (() => {});
  sesCozDinleyici = s.onSesCoz ?? sesCozDinleyici;
  konusDinleyici = s.onKonus ?? konusDinleyici;
  sesDurumu = s.sesDurumu ?? sesDurumu;
  sesli = s.sesli !== false;
  uyanma = s.uyanma === true;
  uyanmaCozDinleyici = s.onUyanmaCoz ?? uyanmaCozDinleyici;
  ayarDinleyici = s.onAyar ?? (() => {});
  anaPencere = s.ana;
  sakli = s.sakli === true;
  tamEkranAyar = s.tamEkran !== false;
  oran = typeof s.konum === 'number' && s.konum >= 0 && s.konum <= 1 ? s.konum : 0.5;
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
    gonder('ada:ayar', ayarYuku());
    gonder('ada:ekler', { ekler: sonEkler, neden: 'yukleme', acil: false });
    if (sonNobet) gonder('ada:nobet', sonNobet);
    gonder('ada:vadeler', sonVadeler);
  });
  ada.webContents.on('render-process-gone', (_e, d) => log('FAIL ada renderer coktu: ' + JSON.stringify(d)));
  ada.on('closed', () => {
    ada = null;
    yoklamaAyarla();
  });
  ada.loadURL(s.url).catch((e) => log('FAIL ada yuklenemedi: ' + e.message));
  // Cozunurluk / olcek degisince, ekran takilip cikinca Ada eski koordinatlarda kaliyordu (konum
  // yalniz gorunur olurken hesaplaniyor): ust kenardan kayik ya da ekran disinda. Oran kalici, yer
  // yeniden hesaplanir. Surukleme surerken dokunulmaz.
  if (!ekranDinleniyor) {
    ekranDinleniyor = true;
    const yerlestir = () => {
      if (!ada || ada.isDestroyed() || surukleme) return;
      const yeni = konum();
      const eski = ada.getBounds();
      if (eski.x === yeni.x && eski.y === yeni.y && eski.width === yeni.width && eski.height === yeni.height) return;
      ada.setBounds(yeni);
      log('ada: ekran degisti, yeniden yerlestirildi (' + eski.x + ',' + eski.y + ' -> ' + yeni.x + ',' + yeni.y + ')');
    };
    for (const olay of ['display-metrics-changed', 'display-added', 'display-removed']) screen.on(olay, yerlestir);
  }
  log('ada kuruldu' + (hep ? ' (hep gorunur)' : '') + (sakli ? ' (sakli)' : ''));
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
        ustteTut();
        gorunurlukGuncelle();
      }, 60);
    }
    if (anaKilit) setTimeout(() => !ana.isDestroyed() && ana.setFocusable(true), 150);
  }
}

ipcMain.on('ada:fare', (e, icinde) => {
  if (!ada || e.sender !== ada.webContents) return;
  fareIcinde = icinde === true;
  if (birakmaAcik && !fareIcinde) return; // surukleme suruyor: tus birakilinca yoklama kapatir
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
  // v3.2: kip (simdi | paralel | gece); bilinmeyen deger "simdi".
  const kip = ham.kip === 'paralel' || ham.kip === 'gece' ? ham.kip : 'simdi';
  gorevDinleyici({ ad: p.ad, yol: p.yol, metin, kip });
});
ipcMain.on('ada:sakla', (e, istek) => {
  if (!ada || e.sender !== ada.webContents) return;
  sakla(istek === true);
});
// Surukleme: renderer yalniz asamayi soyler; yer imlecin ekran konumundan (DIP) okunur. Pencere
// imlecin altinda kaydigi icin renderer'in kendi koordinatlari burada ise yaramaz.
// setPosition DEGIL setBounds: %125 olcekte her setPosition pencereyi 1 DIP genisletiyor (olculdu
// 2026-10-06: 200 adimda 460 -> 660). Genisleyen pencerede hap ortada kaldigi icin sola gidemiyordu.
ipcMain.on('ada:tasi', (e, asama) => {
  if (!ada || ada.isDestroyed() || e.sender !== ada.webContents) return;
  const alan = screen.getPrimaryDisplay().workArea;
  const imlec = screen.getCursorScreenPoint().x;
  if (asama === 'basla') {
    surukleme = { x0: ada.getBounds().x, imlec0: imlec };
  } else if (asama === 'surukle' && surukleme) {
    const x = yer.surukluKonum(alan, GENISLIK, surukleme.x0, imlec - surukleme.imlec0);
    ada.setBounds({ x, y: alan.y, width: GENISLIK, height: YUKSEKLIK });
  } else if (asama === 'bit' && surukleme) {
    surukleme = null;
    oran = yer.oranBul(alan, GENISLIK, ada.getBounds().x);
    ayarDinleyici({ adaKonum: oran === 0.5 ? null : oran });
    log('ada tasindi: ' + (oran === 0.5 ? 'orta' : 'oran ' + oran));
  }
});
ipcMain.on('ada:limit-tazele', (e) => {
  if (!ada || e.sender !== ada.webContents) return;
  limitTazeleDinleyici();
});
// v3.0: ekleri oturuma gonder. Renderer'dan YOL gelmez: ek kimlikleri (yakala.cjs kaydi) + oturum
// kimligi + tek satir not. Bicim burada, yol cozumu main'de.
ipcMain.on('ada:ek-gonder', (e, ham) => {
  if (!ada || e.sender !== ada.webContents || !ham || typeof ham !== 'object') return;
  if (typeof ham.id !== 'string' || !/^[\w.-]{1,160}$/.test(ham.id)) return;
  const kimlikler = Array.isArray(ham.ekler) ? ham.ekler.filter((k) => typeof k === 'string' && /^[0-9a-f]{12}$/.test(k)).slice(0, 8) : [];
  const metin = typeof ham.metin === 'string' ? ham.metin.replace(/\s*[\r\n]+\s*/g, ' ').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 2000) : '';
  if (kimlikler.length === 0 && !metin) return;
  ekGonderDinleyici({ id: ham.id, ekler: kimlikler, metin, gonder: ham.gonder !== false });
});
ipcMain.on('ada:ek-sil', (e, ham) => {
  if (!ada || e.sender !== ada.webContents) return;
  if (ham === 'hepsi') ekSilDinleyici('hepsi');
  else if (Array.isArray(ham)) ekSilDinleyici(ham.filter((k) => typeof k === 'string').slice(0, 8));
});
// v3.1: Ada'nin sesi. Kayit renderer'da (16 kHz mono WAV); cozum ve eylem main'de (ses.cjs + ses-komut.cjs).
ipcMain.on('ada:ses-hazirla', (e) => {
  if (!ada || e.sender !== ada.webContents) return;
  sesHazirlaDinleyici();
});
ipcMain.handle('ada:ses-coz', async (e, ham) => {
  if (!ada || e.sender !== ada.webContents) return { hata: 'yetkisiz' };
  if (!(ham instanceof Uint8Array) && !(ham instanceof ArrayBuffer)) return { hata: 'ses kaydı geçersiz' };
  const wav = Buffer.from(ham instanceof ArrayBuffer ? new Uint8Array(ham) : ham);
  const liste = sonListe.map((o) => ({ id: String(o.id), ad: String(o.ad ?? '') })).filter((o) => o.ad);
  return sesCozDinleyici(wav, liste);
});
// v3.2: eller serbest. Kisa konusma parcasi -> "Ada" ile basliyor mu (main) -> eylem. Metin baska yere gitmez.
ipcMain.handle('ada:uyanma-coz', async (e, ham) => {
  if (!ada || e.sender !== ada.webContents || !uyanma) return { uyandi: false };
  if (!(ham instanceof Uint8Array) && !(ham instanceof ArrayBuffer)) return { uyandi: false };
  const wav = Buffer.from(ham instanceof ArrayBuffer ? new Uint8Array(ham) : ham);
  const liste = sonListe.map((o) => ({ id: String(o.id), ad: String(o.ad ?? '') })).filter((o) => o.ad);
  return uyanmaCozDinleyici(wav, liste);
});
ipcMain.handle('ada:konus', async (e, metin, bildirim) => {
  if (!ada || e.sender !== ada.webContents || typeof metin !== 'string') return null;
  if (bildirim === true && !sesli) return null;
  const b = await konusDinleyici(metin.slice(0, 700), bildirim === true);
  return b ? new Uint8Array(b) : null;
});
// Ada'ya birakilan dosyalar: yollar yakala.cjs'te denetlenir (var mi, dosya mi, boyut).
ipcMain.on('ada:birak', (e, yollar) => {
  if (!ada || e.sender !== ada.webContents || !Array.isArray(yollar)) return;
  birakDinleyici(yollar.filter((y) => typeof y === 'string').slice(0, 8));
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
    gonder('ada:ayar', ayarYuku());
    gorunurlukGuncelle();
  },
  /** Kenara cekil / geri gel (kart dugmesi, tepsi, Ctrl+Alt+Shift+G). */
  sakla,
  saklaDegistir: () => sakla(!sakli),
  tamEkranAyarla(acikMi) {
    tamEkranAyar = acikMi !== false;
    if (!tamEkranAyar) {
      tamEkranda = false;
      sinemaDurumu = { sinema: false, aday: null };
    }
    gorunurlukGuncelle();
  },
  /** Ust ortaya geri (tepsi "Ada'yı ortala"). */
  ortala() {
    oran = 0.5;
    ayarDinleyici({ adaKonum: null });
    if (ada && !ada.isDestroyed()) ada.setBounds(konum());
  },
  durum: () => ({ acik, hep, sakli, tamEkran: tamEkranAyar, ortada: oran === 0.5, sesli, uyanma }),
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
    // Sinemada "seni bekliyor" gelince cene gorunur, gidince pencere yine gizlenir.
    if (tamEkranda) gorunurlukGuncelle();
  },
  sinyal(id, sinyal) {
    gonder('etkinlik:sinyal', { id, sinyal });
  },
  /** v3.0: bot nobetinin son olcumu (Ada kartinda dusen isler). */
  nobet(n) {
    sonNobet = n;
    gonder('ada:nobet', n);
  },
  /** v3.0: proje notlarinin vadeleri (durum.py). */
  vadeler(v) {
    sonVadeler = Array.isArray(v) ? v : [];
    gonder('ada:vadeler', sonVadeler);
  },
  /** v3.0: nobet gecisi (yeni dusen is, yeni siparis): Ada bir an bakar, goz endise / para. */
  nobetOlay(o) {
    gonder('ada:nobet-olay', o);
  },
  /** v3.2: Ada'daki oturumlar (sesli ozet, brifing, gece vardiyasi). */
  oturumListesi: () => sonListe.map((o) => ({ id: String(o.id), ad: String(o.ad ?? '') })).filter((o) => o.ad),
  /**
   * v3.2: gunun brifingi. Ada gorunur olur (sinemada da: acik istek ya da gunun ilk ani) ve karti acar;
   * `konus` ise kisa cumleyi soyler. Saklida kart sarkmaz, cene bakar (v2.7 kurali: saklida araya girme),
   * ama acik istekte (ses, palet) Scryne istedi: kart acilir.
   */
  brifing(b, { konus, neden } = {}) {
    if (!ada || ada.isDestroyed() || !acik) return;
    if (neden !== 'gun' && !ada.isVisible()) {
      ada.setBounds(konum());
      ada.showInactive();
      ustteTut();
    }
    gonder('ada:brifing', { brifing: b, konus: konus === true, acil: neden !== 'gun' });
  },
  /** v3.2: kisa bilgi notu hapta (secim bulunamadi, vardiya basladi ...). */
  not(metin) {
    if (!ada || ada.isDestroyed() || !acik) return;
    gonder('ada:not', String(metin || '').slice(0, 200));
  },
  /**
   * v3.0: ek tepsisi degisti. `acil` (Ctrl+Alt+Shift+S ile istendi): Ada klavyeyle acilir, hedef secilip
   * Enter'la gider. Degilse yalniz liste gider; renderer yeni goruntude bir an bakar (saklida bakmaz).
   */
  ekler(liste, { neden, acil, anaOdakta: anaOnde } = {}) {
    sonEkler = Array.isArray(liste) ? liste : [];
    if (acil && !anaOnde && ada && !ada.isDestroyed() && acik) {
      gorunurlukGuncelle();
      if (!ada.isVisible()) {
        ada.setBounds(konum());
        ada.showInactive();
        ustteTut();
      }
      odakla(true);
    }
    gonder('ada:ekler', { ekler: sonEkler, neden: neden ?? 'pano', acil: acil === true && !anaOnde });
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
      // Sinemada pencere gizli olabilir; kisayol acik bir istek, Ada gelir. Odak Ada'ya gecince
      // on plan artik tam ekran degildir, birakinca yoklama sinemaya geri dondurur.
      if (!ada.isVisible()) {
        ada.setBounds(konum());
        ada.showInactive();
        ustteTut();
      }
      odakla(true);
    }
    gonder('ada:klavye', { anaOdakta: anaOdakta === true });
    return true;
  },
  /**
   * v3.1: bas-konus (Ctrl+Alt+Shift+Space). Ada gorunur olur (odak almaz: konusurken yazdigin yer
   * yerinde kalir) ve renderer dinlemeyi acar ya da kapatir.
   * @returns {boolean}
   */
  dinle() {
    if (!ada || ada.isDestroyed() || !acik) return false;
    if (!ada.isVisible()) {
      ada.setBounds(konum());
      ada.showInactive();
      ustteTut();
    }
    gonder('ada:dinle', true);
    return true;
  },
  /** v3.2: eller serbest acik/kapali (tepsi menusu). */
  uyanmaAyarla(acikMi) {
    uyanma = acikMi === true;
    gonder('ada:ayar', ayarYuku());
  },
  /** v3.1: sesli bildirim acik/kapali (tepsi menusu). */
  sesliAyarla(acikMi) {
    sesli = acikMi !== false;
    gonder('ada:ayar', ayarYuku());
  },
  kapat() {
    disYoklamaAyarla(false);
    if (yoklamaZamanlayici) clearInterval(yoklamaZamanlayici);
    yoklamaZamanlayici = null;
    if (ada && !ada.isDestroyed()) ada.destroy();
    ada = null;
  },
};
