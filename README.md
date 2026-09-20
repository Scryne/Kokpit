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
kokpit          # üretim modu (günlük kullanım)
kokpit -dev     # dev sunucusu + HMR
```

`kokpit` PowerShell profilinde tanımlı, her dizinden çalışır. Proje kökünden doğrudan:
`npm run kokpit` (üretim) veya `npm start` (dev).

**Başlat menüsü kısayolu:** `npm run kisayol` (masaüstüne de: `npm run kisayol -- -Masaustu`).
Kısayol `scripts/kokpit-sessiz.vbs`'i hedefler; `node` konsol uygulaması olduğu için `.lnk`
doğrudan onu hedefleseydi Electron'un yanında boş bir siyah pencere kalırdı. Bu yoldan
açılınca derleme çıktısı görünmez — bir şey açılmıyorsa terminalden `kokpit` çalıştır.

**Klavye:** Ctrl+1 Pano, Ctrl+2 Terminaller, Ctrl+B kenar çubuğu, Ctrl+Shift+W bölmeyi
kapat; sekme şeridinde ← → , bölme ayırıcısında ← → (%5). Terminal odaktayken **Ctrl+B
claude'a gider** (Claude Code'un "arka plana at" kısayolu), kenar çubuğunu başlık
çubuğundaki düğme açar. Diğer üç kısayol terminale hiç ulaşmaz.

Üretimde arayüz `app://kokpit/` özel şemasından servis edilir — gerçek bir origin olduğu
için CSP uygulanabiliyor. `file://` kullanılmaz: `onHeadersReceived` o istekler için
tetiklenmiyor ve politika sessizce uygulanmamış oluyordu.

## Test

```bash
npm run test:pty     # PTY sunucusunun uçtan uca testi (11 kontrol)
npm run typecheck
npm run build
npm run design:lint  # DESIGN.md spec denetimi
```

`design:lint` bilerek `npx -p @google/design.md designmd` der: paket adı `npx @google/design.md`
diye çağrılınca bin adındaki nokta yüzünden **sessizce hiçbir şey yapmıyor** (çıkış 0, çıktı
yok). Bin adı açık verilince çalışıyor.

`test:pty` elle doğrulanamayan şeyi doğrular: token reddi, cwd, yazma/okuma, resize'in
kabuğa geçmesi, temiz kapanış ve **yetim süreç bırakmama**.

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

## İkinci beyinle ilişki

Kokpit **tek yönlü bir aynadır**: beyinden okur, beyne yazmaz.

- **Okuma:** gösterdiği her şey `durum.py --json` çıktısından gelir, o da vault'taki
  dosyaları okur. Kokpit'in kendi veritabanı yoktur.
- **Yazma:** Kokpit hiçbir dosyaya yazmaz. Beyni güncelleyen şey Kokpit değil, **Claude
  Code'un kendi hook'larıdır** — transcript, SessionEnd flush, derleyici. Bunlar oturum
  hangi terminalde açılırsa açılsın çalışır, dolayısıyla Kokpit'in içindeki bir oturum da
  beyni normal şekilde günceller.
- **Kritik koşul:** Kokpit'in açtığı terminaller **tepe seviye** oturum olmalı. Kokpit bir
  claude oturumunun içinden başlatılırsa `CLAUDE_CODE_CHILD_SESSION` gibi işaretler tüm
  zincir boyunca miras kalıyor ve Claude Code transcript yazmayı kapatıyor
  ("Transcript saving is off"). Transcript yoksa bütçe kalemi ve flush hook'ları o oturumu
  görmez. Bu yüzden `pty-server.cjs` ebeveyn oturumun işaretlerini **temizliyor**
  (`TEMIZLENECEK` listesi). Bu kural kaldırılırsa beyin sessizce eksik kayıt tutar.

## Kurallar (bozulursa proje bozulur)

1. **İkinci toplayıcı yazılmaz.** Veri kaynağı `durum.py`; alan gerekiyorsa orada eklenir.
2. **`data:` URL kullanılmaz.** Opaque origin inline script ve WebSocket'i sessizce engeller.
3. **Windows yolları `path.resolve()` / `path.join()` ile üretilir**, string literal yazılmaz.
4. **PTY ayrı düz Node sürecinde kalır.** Electron'un içine alınırsa `electron-rebuild`
   cehennemi başlar; ayrıca sunucu çökünce pencere de gider.
5. **Vault'a tek yazma: Inbox notu.** v1 hiç yazmazdı; v2 (2026-09-21) yalnız
   `📥 000-Inbox/Dump/YYYY-MM-DD.md`'ye **sona ekler** (`electron/not.cjs`). Başka dosya yok,
   üstüne yazma yok. Hook'lar zaten yazıyor; ikinci yazar yarış koşulu demek.
6. **Açılan terminallerden ebeveyn oturum işaretleri temizlenir.** Yoksa transcript
   yazılmaz ve ikinci beyin o oturumu kaydetmez.
