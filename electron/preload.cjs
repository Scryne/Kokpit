const { contextBridge, ipcRenderer, webUtils } = require('electron');

// Dar yuzey: renderer'a Node verilmez, sadece bu uc sey gecer.
contextBridge.exposeInMainWorld('kokpit', {
  durumGetir: () => ipcRenderer.invoke('durum:getir'),
  logYolu: () => ipcRenderer.invoke('log:yol'),
  klasorAc: (yol) => ipcRenderer.invoke('klasor:ac', yol),
  // PTY sunucusunun portu ve token'i. Token olmadan sunucu surec baslatmaz.
  ptyBilgi: () => ipcRenderer.invoke('pty:bilgi'),
  // Terminale birakilan dosyanin diskteki yolu. `File.path` Electron 32'de kaldirildi;
  // yol yalniz preload'daki webUtils ile alinabiliyor, renderer'a Node acilmadan.
  dosyaYolu: (dosya) => webUtils.getPathForFile(dosya),
  linkAc: (url) => ipcRenderer.invoke('link:ac', url),
  pencereOdakla: () => ipcRenderer.invoke('pencere:odakla'),
  onayla: (secenek) => ipcRenderer.invoke('onay:sor', secenek),
  sec: (secenek) => ipcRenderer.invoke('secim:sor', secenek),
  ayarGetir: () => ipcRenderer.invoke('ayar:getir'),
  ayarKaydet: (yama) => ipcRenderer.invoke('ayar:kaydet', yama),
  // Main "kapatiliyor, acik oturum var mi bak" der; renderer onay verince kapanir.
  kapanisSorulunca: (cb) => {
    const dinleyici = () => cb();
    ipcRenderer.on('kapanis:sor', dinleyici);
    return () => ipcRenderer.removeListener('kapanis:sor', dinleyici);
  },
  // Renderer soruyu aldigini hemen bildirir; main o andan sonra kullaniciyi bekler.
  kapanisAlindi: () => ipcRenderer.send('kapanis:alindi'),
  kapanisIptal: () => ipcRenderer.send('kapanis:iptal'),
  kapanisOnayla: () => ipcRenderer.send('kapanis:onay'),
  // Oturum defteri: acilis/kapanis olaylari main'e, main diske (tek yazar).
  defterOlay: (olay) => ipcRenderer.send('defter:olay', olay),
  defterOncekiler: () => ipcRenderer.invoke('defter:oncekiler'),
  defterSonlar: () => ipcRenderer.invoke('defter:sonlar'),
  // Vault'a tek yazma: Inbox notu.
  notEkle: (metin, kaynak) => ipcRenderer.invoke('not:ekle', metin, kaynak),
  // Genel kisayol (Ctrl+Alt+Shift+N) basilinca main "notu ac" der.
  notAcSorulunca: (cb) => {
    const dinleyici = () => cb();
    ipcRenderer.on('not:ac', dinleyici);
    return () => ipcRenderer.removeListener('not:ac', dinleyici);
  },
  oturumBaglami: (liste) => ipcRenderer.invoke('oturum:baglam', liste),
  // Beyne dusmemis tek oturumu vault'un betigiyle doldurur (yazan vault'tur, Kokpit degil).
  beyinDoldur: (session, proje) => ipcRenderer.invoke('beyin:doldur', session, proje),
  // Kanca koprusu: oturum etkinligi + limitler (main yayinlar, ana pencere ve ada dinler).
  etkinlikAnlik: () => ipcRenderer.invoke('etkinlik:anlik'),
  etkinlikDinle: (cb) => {
    const d = (_e, a) => cb(a);
    ipcRenderer.on('etkinlik:anlik', d);
    return () => ipcRenderer.removeListener('etkinlik:anlik', d);
  },
  sinyalDinle: (cb) => {
    const d = (_e, s) => cb(s);
    ipcRenderer.on('etkinlik:sinyal', d);
    return () => ipcRenderer.removeListener('etkinlik:sinyal', d);
  },
  // Ada: oturum listesi ana pencereden gider; adadan tiklama ana pencereye "oturuma git" doner.
  adaListe: (liste) => ipcRenderer.send('ada:liste', liste),
  adaAyar: (acik) => ipcRenderer.send('ada:ayar', acik),
  adaListeDinle: (cb) => {
    const d = (_e, l) => cb(l);
    ipcRenderer.on('ada:liste', d);
    return () => ipcRenderer.removeListener('ada:liste', d);
  },
  adaFare: (icinde) => ipcRenderer.send('ada:fare', icinde),
  adaGit: (id) => ipcRenderer.send('ada:git', id),
  oturumaGitDinle: (cb) => {
    const d = (_e, id) => cb(id);
    ipcRenderer.on('oturuma:git', d);
    return () => ipcRenderer.removeListener('oturuma:git', d);
  },
  // Calistir: projenin uygulamasini servis bolmesinde acma tarifi.
  calistirTarif: (yol) => ipcRenderer.invoke('calistir:tarif', yol),
  calistirKaydet: (yol, komut) => ipcRenderer.invoke('calistir:kaydet', yol, komut),
  // Hizli komutlar ve oturuma gonderme (ada -> main -> ana pencere; PTY ana pencerede).
  komutlarGetir: () => ipcRenderer.invoke('komutlar:getir'),
  komutlarDuzenle: () => ipcRenderer.invoke('komutlar:duzenle'),
  adaGonder: (istek) => ipcRenderer.send('ada:gonder', istek),
  adaOdak: (istek) => ipcRenderer.send('ada:odak', istek),
  oturumaGonderDinle: (cb) => {
    const d = (_e, istek) => cb(istek);
    ipcRenderer.on('oturuma:gonder', d);
    return () => ipcRenderer.removeListener('oturuma:gonder', d);
  },
  // v2.4: "gordum" (bitti rozeti ada'dan duser) ve klavyeyle ada (Ctrl+Alt+Shift+A).
  adaGordum: (id) => ipcRenderer.send('ada:gordum', id),
  oturumGordumDinle: (cb) => {
    const d = (_e, id) => cb(id);
    ipcRenderer.on('oturum:gordum', d);
    return () => ipcRenderer.removeListener('oturum:gordum', d);
  },
  pencereOdakDinle: (cb) => {
    const d = (_e, odakta) => cb(odakta === true);
    ipcRenderer.on('pencere:odak', d);
    return () => ipcRenderer.removeListener('pencere:odak', d);
  },
  adaKlavyeDinle: (cb) => {
    const d = (_e, k) => cb(k);
    ipcRenderer.on('ada:klavye', d);
    return () => ipcRenderer.removeListener('ada:klavye', d);
  },
  // v2.6 masaustu ajani: gorev hedefleri, dis oturumlar, gorev, limit tazeleme, tepsi.
  adaProjeler: (liste) => ipcRenderer.send('ada:projeler', liste),
  adaProjelerDinle: (cb) => {
    const d = (_e, l) => cb(l);
    ipcRenderer.on('ada:projeler', d);
    return () => ipcRenderer.removeListener('ada:projeler', d);
  },
  adaDisDinle: (cb) => {
    const d = (_e, l) => cb(l);
    ipcRenderer.on('ada:dis', d);
    return () => ipcRenderer.removeListener('ada:dis', d);
  },
  adaAyarDinle: (cb) => {
    const d = (_e, a) => cb(a);
    ipcRenderer.on('ada:ayar', d);
    return () => ipcRenderer.removeListener('ada:ayar', d);
  },
  adaGorev: (gorev) => ipcRenderer.send('ada:gorev', gorev),
  adaLimitTazele: () => ipcRenderer.send('ada:limit-tazele'),
  // v2.7: kenara cekil / geri gel; hapi ust kenar boyunca tasi (asama: basla | surukle | bit).
  adaSakla: (istek) => ipcRenderer.send('ada:sakla', istek === true),
  adaTasi: (asama) => ipcRenderer.send('ada:tasi', asama),
  gorevAcDinle: (cb) => {
    const d = (_e, g) => cb(g);
    ipcRenderer.on('gorev:ac', d);
    return () => ipcRenderer.removeListener('gorev:ac', d);
  },
  adaAyarDegistiDinle: (cb) => {
    const d = (_e, acik) => cb(acik === true);
    ipcRenderer.on('ada:ayar-degisti', d);
    return () => ipcRenderer.removeListener('ada:ayar-degisti', d);
  },
  uygulamaCik: () => ipcRenderer.send('uygulama:cik'),
  uygulamaYenidenBaslat: () => ipcRenderer.send('uygulama:yeniden'),
});
