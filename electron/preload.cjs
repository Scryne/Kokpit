const { contextBridge, ipcRenderer } = require('electron');

// Dar yuzey: renderer'a Node verilmez, sadece bu uc sey gecer.
contextBridge.exposeInMainWorld('kokpit', {
  durumGetir: () => ipcRenderer.invoke('durum:getir'),
  logYolu: () => ipcRenderer.invoke('log:yol'),
  klasorAc: (yol) => ipcRenderer.invoke('klasor:ac', yol),
  // PTY sunucusunun portu ve token'i. Token olmadan sunucu surec baslatmaz.
  ptyBilgi: () => ipcRenderer.invoke('pty:bilgi'),
});
