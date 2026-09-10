# Kokpit

Scryne'ın projelerini tek ekranda gösteren ve karttan tek tıkla o klasörde `claude` oturumu
açan yerel masaüstü uygulaması.

**Kendi verisi yok.** Gösterdiği her şey `ScryneOS/.claude/scripts/durum.py --json`
çıktısından, yani git'in zaten takip ettiği dosyalardan türetilir. v1 hiçbir yere yazmaz.
Uygulama silinirse hiçbir şey kaybolmaz — bu bir lens, depo değil.

Kalıcı plan: `ScryneOS/🧠 500-Knowledge/Kokpit-Plani.md` (Katman 2).
Kararlar: `docs/Final-Dokuman.md` · Yol haritası: `docs/Roadmap.md`

## Çalıştırma

```bash
npm start
```

Vite dev sunucusunu açar, hazır olunca Electron penceresini başlatır. Pencere kapanınca
Vite de durur.

## Kurulum (temiz makinede)

```bash
npm install
npm install-scripts approve node-pty electron   # (1)
ELECTRON_MIRROR=https://registry.npmmirror.com/-/binary/electron/ node node_modules/electron/install.js  # (2)
```

**(1) npm 11.19+ install script'lerini varsayılan olarak bloklar.** `node-pty` ve `electron`
sessizce yarım kurulur — hata vermez, sadece çalışmaz. Onay verilmezse `node-pty`'nin native
modülü ve Electron binary'si hiç inmez.

**(2) Electron binary'si `github.com`'dan inmiyor** (bu makinede Node'un `fetch`'i
`UND_ERR_CONNECT_TIMEOUT` veriyor, `curl` aynı adrese 200 dönüyor). Mirror üzerinden iniyor.
`node_modules/electron/dist/electron.exe` varsa bu adım gerekmez.

## Ortam değişkenleri

| Değişken | Varsayılan | Ne işe yarar |
| --- | --- | --- |
| `KOKPIT_VAULT` | `~/Documents/ScryneOS` | Vault kökü — `durum.py` buradan bulunur |
| `KOKPIT_PYTHON` | `python` | Python yorumlayıcısı |
| `KOKPIT_DEV` | — | `0` yapılırsa dev sunucusu yerine `dist/` yüklenir |

## Teşhis

Main süreç `~/.kokpit/kokpit.log` dosyasına yazar: renderer konsolu, sayfa yükleme hataları,
renderer çökmesi, preload hatası, `durum.py` çalışma süresi ve hataları.

Bu kablolar bilerek bırakıldı — bu projede iki kez *sessiz* hata sınıfıyla karşılaşıldı
(`data:` URL'in WebSocket'i sessizce engellemesi; Windows yol kaçışlarının `CreateProcess`
"error 267" vermesi). Detay: `docs/Spike-Bulgulari.md`.

## Kurallar (bozulursa proje bozulur)

1. **İkinci toplayıcı yazılmaz.** Veri kaynağı `durum.py`; alan gerekiyorsa orada eklenir.
2. **`data:` URL kullanılmaz.** Opaque origin inline script ve WebSocket'i sessizce engeller.
3. **Windows yolları `path.resolve()` / `path.join()` ile üretilir**, string literal yazılmaz.
4. **PTY ayrı düz Node sürecinde kalır.** Electron'un içine alınırsa `electron-rebuild`
   cehennemi başlar; ayrıca sunucu çökünce pencere de gider.
5. **v1 hiçbir dosyaya yazmaz.** Hook'lar zaten yazıyor; ikinci yazar yarış koşulu demek.
