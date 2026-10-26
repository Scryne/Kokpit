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
  // Okuma sayfasi (v2.9): vault'un dar kesimini salt okur; yollar vault'a goreli.
  vaultListe: (bolum) => ipcRenderer.invoke('vault:liste', bolum),
  vaultAkis: (n) => ipcRenderer.invoke('vault:akis', n),
  vaultOku: (yol) => ipcRenderer.invoke('vault:oku', yol),
  vaultCozumle: (hedef, kaynak) => ipcRenderer.invoke('vault:cozumle', hedef, kaynak),
  vaultProjeler: () => ipcRenderer.invoke('vault:projeler'),
  vaultOkundu: (yol, mtime) => ipcRenderer.invoke('vault:okundu', yol, mtime),
  vaultHepsiOkundu: () => ipcRenderer.invoke('vault:hepsi-okundu'),
  vaultOkunmamis: () => ipcRenderer.invoke('vault:okunmamis'),
  vaultTazele: () => ipcRenderer.invoke('vault:tazele'),
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
  // Sekmenin claude kimligi degisti (/clear): Surdur ve baglam yeni konusmaya baksin.
  kimlikDinle: (cb) => {
    const d = (_e, k) => cb(k);
    ipcRenderer.on('oturum:kimlik', d);
    return () => ipcRenderer.removeListener('oturum:kimlik', d);
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
  // v2.6: surukle-birak (asama: basla / tasi / bitir; x, y ekran koordinati) ve klavye yedegi.
  // v2.8: bitir'de hap = hapin pencere icindeki dikdortgeni; ada oraya birakilir.
  adaSurukle: (asama, x, y, hap) => ipcRenderer.send('ada:surukle', { asama, x, y, hap }),
  adaYerlesimDinle: (cb) => {
    const d = (_e, y) => cb(y);
    ipcRenderer.on('ada:yerlesim', d);
    return () => ipcRenderer.removeListener('ada:yerlesim', d);
  },
  adaSonrakiEkran: () => ipcRenderer.invoke('ada:sonraki-ekran'),
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
  // Gece gorevi: isaret, iptal, yeniden baslatma sonrasi geri acilacaklar; main durum ve eylem yollar.
  nightToggle: (x) => ipcRenderer.send('night:toggle', x),
  nightCancel: () => ipcRenderer.send('night:cancel'),
  nightResume: () => ipcRenderer.invoke('night:resume'),
  nightStateListen: (cb) => {
    const d = (_e, s) => cb(s);
    ipcRenderer.on('night:state', d);
    return () => ipcRenderer.removeListener('night:state', d);
  },
  nightActionListen: (cb) => {
    const d = (_e, a) => cb(a);
    ipcRenderer.on('night:action', d);
    return () => ipcRenderer.removeListener('night:action', d);
  },
  adaKlavyeDinle: (cb) => {
    const d = (_e, k) => cb(k);
    ipcRenderer.on('ada:klavye', d);
    return () => ipcRenderer.removeListener('ada:klavye', d);
  },
});
