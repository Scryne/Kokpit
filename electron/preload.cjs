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
  ayarGetir: () => ipcRenderer.invoke('ayar:getir'),
  ayarKaydet: (yama) => ipcRenderer.invoke('ayar:kaydet', yama),
  // Main "kapatiliyor, acik oturum var mi bak" der; renderer onay verince kapanir.
  kapanisSorulunca: (cb) => {
    const dinleyici = () => cb();
    ipcRenderer.on('kapanis:sor', dinleyici);
    return () => ipcRenderer.removeListener('kapanis:sor', dinleyici);
  },
  kapanisOnayla: () => ipcRenderer.send('kapanis:onay'),
  // Oturum defteri: acilis/kapanis olaylari main'e, main diske (tek yazar).
  defterOlay: (olay) => ipcRenderer.send('defter:olay', olay),
  defterOncekiler: () => ipcRenderer.invoke('defter:oncekiler'),
  defterSonlar: () => ipcRenderer.invoke('defter:sonlar'),
});
