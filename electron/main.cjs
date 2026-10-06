const { app, BrowserWindow, Menu, Tray, dialog, globalShortcut, ipcMain, nativeImage, nativeTheme, powerMonitor, screen, session, shell } = require('electron');
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
let ptyBeklendi = false;
// Tepsi (v2.6): pencerenin X'i Kokpit'i KAPATMAZ, tepsiye indirir; Ada ve oturumlar yasamaya devam
// eder. Gercek cikis tepsi menusunden ("Kokpit'ten cik"), paletten ya da Windows kapanirken.
// Test kosuculari tepsi kurmaz: onlar pencere kapaninca cikisi bekliyor.
let tepsi = null;
let cikisIstendi = false;
const tepsiAktif = () => tepsi !== null && ayarlar.oku().tepsi !== false;

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
    if (ARKA) {
      log('arka planda basladi (--arka): pencere gizli, Ada ve tepsi acik');
      // Pencere hic gosterilmedi, `blur` gelmeyecek: Ada "Kokpit onde" sanmasin.
      ada.anaOdak(false);
      return;
    }
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
      log('ada gorevi: ' + g.ad + ' (' + g.metin.length + ' karakter)');
      if (pencere) pencere.webContents.send('gorev:ac', g);
    },
    onLimitTazele: () => void limit.tazele(),
    // "Gordum": bitti rozeti Kokpit'e gecmeden duser (yalniz dikkat; oturuma bir sey gitmez).
    onGordum: (id) => {
      if (pencere) pencere.webContents.send('oturum:gordum', id);
    },
    // Ada odagi birakirken ana pencere bir an etkinlestirilemez olur (bkz. ada.cjs odakla).
    ana: () => pencere,
  });
}

ipcMain.handle('durum:getir', async () => durumOku());
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
  cikisIstendi = false;
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
});
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
  return { kenarAcik: a.kenarAcik, yaziBoyutu: a.yaziBoyutu, arsivAcik: a.arsivAcik, ada: a.ada !== false };
});
// Paletten "Kokpit'ten cik": tepsiye inmeden gercek cikis (acik oturum sorusu yine calisir).
ipcMain.on('uygulama:cik', () => cik());

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
  return 'Kokpit' + (l ? ' · 5 saat ' + p(l.besSaat) + ' · hafta ' + p(l.hafta) : '');
}

function tepsiMenusu() {
  if (!tepsi) return;
  const a = ada.durum();
  const sablon = [
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
    { label: 'Limitleri tazele', click: () => void limit.tazele() },
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
  return { kenarAcik: a.kenarAcik, yaziBoyutu: a.yaziBoyutu, arsivAcik: a.arsivAcik, ada: a.ada !== false };
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
      },
    })
    .catch((e) => logHata('kanca baslatilamadi', e));
  // Oturumsuz limitler (v2.6): sonuc kanca koprusunun limitleriyle birlesir, ayni yoldan yayinlanir.
  limit.baslat((l, d) => kanca.disLimit(l, d));
  powerMonitor.on('resume', () => limit.uyandi());
  pencereKur();
  adaKur();
  tepsiKur();
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
  kanca.durdur();
  limit.durdur();
  ada.kapat();
  if (tepsi) {
    tepsi.destroy();
    tepsi = null;
  }
});
app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', () => { log('tum pencereler kapandi, cikiliyor'); app.quit(); });
process.on('uncaughtException', (e) => logHata('uncaughtException', e));
process.on('unhandledRejection', (e) => logHata('unhandledRejection', e));
