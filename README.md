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

**Sayfalar:** Pano (Ctrl+1) · Terminaller (Ctrl+2) · Sağlık (Ctrl+3: beyin boru zinciri,
beyne düşmemiş oturumlar + satır başına **Geri doldur**, sağlık nöbeti (CI, Dependabot, AI
modelleri), 7 günlük bütçe, thread'ler, "Aria ile konuş") · Envanter (Ctrl+4: CLAUDE.md drift,
skill/MCP, transcript hijyeni).

**Proje grupları** (kenar çubuğu, Pano, seçiciler): Aktif · Kullanımda · Arşiv. Grup
`Proje-Envanteri.md` durumundan gelir (`durum.py` `envanter` alanı): 🟢 aktif, ✅ kullanımda,
geri kalanı (⏸️ ⛔ 🛑) arşiv; envanterde olmayan proje state.json aşamasına göre. Arşiv
varsayılan kapalı, açık/kapalı hali kalıcı. Sağlık nöbeti alarmı varsa Pano'nun üstünde şerit.

**Bağlam göstergesi:** terminal başlığında "bağlam 354k" = claude'un son turda modele giden
girdisi (input + cache yazma + cache okuma), transcript'in son 512 KB'ından 20 sn'de bir.

**Geri doldur:** beyne düşmemiş TEK oturumu vault'un kendi zinciriyle özetler
(`flush_kapsama.py --oturum`, ~20–60 sn, model çağrısı). Betik son 30 dk'da yazılmış transcript'i
reddeder; Kokpit'te o klasörde açık oturum varken düğme kapalı. `--doldur` bilerek kullanılmaz:
o, dizindeki açık oturumları da erken doldururdu.

**Klavye:** Ctrl+Shift+P komut paleti (sayfa, proje aç/git, klasör, eylemler) · Ctrl+B kenar
çubuğu · Ctrl+Tab / Ctrl+Shift+Tab sekme döngüsü · Ctrl+Shift+W bölmeyi kapat · Ctrl+Shift+N
Inbox'a not · **Ctrl+Alt+Shift+N her yerden Inbox notu** (Kokpit arka plandayken de; Ctrl+Alt
Türkçe klavyede AltGr olduğu için üç değiştirici) · sekme şeridinde ← →, bölme ayırıcısında ← →
(%5). **Terminalde:** Ctrl+Shift+F ara (Enter / Shift+Enter / Esc) · Ctrl+C seçim varken
kopyalar, yokken `^C` · Ctrl+Shift+C/V · sağ tık yapıştır · Ctrl+= / Ctrl+- / Ctrl+0 yazı
boyutu (kalıcı) · dosyayı sürükleyip bırakınca yolu yazılır. Terminal odaktayken **Ctrl+B
claude'a gider** (Claude Code'un "arka plana at" kısayolu; Ctrl+V de `^V` olarak gider,
resim yapıştırma). Uygulamanın öbür kısayolları terminale hiç ulaşmaz.

**Zil:** claude bitince/soru sorunca sekme, bölme, kenar ve Pano noktası amber olur;
pencere odakta değilse Windows bildirimi gelir, tıklayınca o sekmeye gidilir. Bakınca düşer.

**Kapatma koruması:** kabuğun altında süreç varken (claude çalışıyorken) sekme/bölme/uygulama
kapatılırsa üç seçenekli yerel diyalog çıkar: **Güvenli kapat** (varsayılan) · Zorla kapat ·
Vazgeç. Sebep: PTY öldürülünce claude'un SessionEnd hook'u çalışmaz, oturum beyne düşmez
(ölçüldü 2026-09-29). Güvenli kapat claude'a çıkış tuşlarını gönderir (Esc, Ctrl+C ×2;
boşta, yarım yazılmışken ve meşgulken denendi) ve kendi kapanmasını 90 sn'ye kadar bekler;
bölmede "Güvenli kapatılıyor" şeridi görünür. Dizi bir kez gönderilir: proje SessionEnd
hook'u senkron `claude -p` çalıştırır, ikinci bir Ctrl+C onu keserdi. Süreç sorgusu cevap
vermezse "süreç yok" değil "bilinmiyor" sayılır ve yine sorulur. Uygulama kapanışında güvenli
kapatılan oturumlar yerinde kalır; bir sonraki açılışta geri yükleme teklif edilir.

**Süreklilik:** pencere konumu, kenar çubuğu ve yazı boyutu `~/.kokpit/ayarlar.json`'da;
açılan her oturum `~/.kokpit/oturumlar.jsonl` defterinde. Uygulama açık oturumlarla
kapatılırsa bir sonraki açılışta "N oturum açıktı — Geri yükle" (her klasörde
`claude --continue`). Pano satırında "son oturum: dün · 42 dk · beyne düştü ✓".

Üretimde arayüz `app://kokpit/` özel şemasından servis edilir — gerçek bir origin olduğu
için CSP uygulanabiliyor. `file://` kullanılmaz: `onHeadersReceived` o istekler için
tetiklenmiyor ve politika sessizce uygulanmamış oluyordu.

## Test

```bash
npm run test:pty     # PTY sunucusunun uçtan uca testi (13 kontrol)
npm run test:ui      # gerçek Electron + CDP ile arayüz testi (37 kontrol, önce build)
npm run typecheck
npm run build
npm run design:lint  # DESIGN.md spec denetimi
npm run ikon         # public/kokpit.svg -> kokpit.ico + kokpit.png
```

`test:ui` uygulamayı `--remote-debugging-port` ile açar, CDP üzerinden gerçek tuş/tıklama
gönderir, DOM'dan okur; iki çalışma yapar (geri yükleme için). Claude AÇMAZ:
`KOKPIT_TEST_KABUK=1` ile PTY sunucusu düz pwsh açar — her gerçek claude açılışı transcript +
hook tetiklerdi. `KOKPIT_TEST_KEEP=1` ayar/defter dosyalarını geri almaz, defteri basar.
Yerel diyalog CDP'den tıklanamadığı için test `KOKPIT_TEST_SECIM=0` verir: kapatma diyaloğu
"Güvenli kapat" seçilmiş sayılır (yalnız `KOKPIT_TEST_KABUK=1` ile birlikte okunur). Test
kabuğunda claude yerine `ping` çalıştırılır; güvenli kapatma onu Ctrl+C ile durdurur. Gerçek
claude ile dizi ayrıca elle ölçüldü (SessionEnd hook'u tamamlandı, çıkış 3–10 sn).
Test koşucuları tek örnek kilidine takılmaz: gerçek Kokpit açıkken de çalışır.

`design:lint` bilerek `npx -p @google/design.md designmd` der: paket adı `npx @google/design.md`
diye çağrılınca bin adındaki nokta yüzünden **sessizce hiçbir şey yapmıyor** (çıkış 0, çıktı
yok). Bin adı açık verilince çalışıyor.

`test:pty` elle doğrulanamayan şeyi doğrular: token reddi, cwd, yazma/okuma, resize'in
kabuğa geçmesi, çocuk süreç sorgusu, güvenli çıkış, temiz kapanış ve **yetim süreç
bırakmama**.

`npm run ekran [pano|saglik|envanter] [çıktı.png]` uygulamayı açıp sayfanın PNG'sini alır;
`test:ui` gibi `~/.kokpit/ayarlar.json` ve oturum defterini sonra geri koyar (kapanış bekleyen
"geri yükle" teklifini tüketmesin diye).

**CI** (`windows-latest`): typecheck + build + `test:pty`. `test:ui` CI'da koşmaz — vault ve
`durum.py` ister; yerelde çalıştırılır.

## Kurulum (temiz makinede)

```bash
npm install
npm install-scripts approve node-pty electron   # (1)
ELECTRON_MIRROR=https://registry.npmmirror.com/-/binary/electron/ node node_modules/electron/install.js  # (2)
```

**(1) npm 11.19+ install script'lerini varsayılan olarak bloklar.** `node-pty` ve `electron`
sessizce yarım kurulur — hata vermez, sadece çalışmaz. Onay verilmezse `node-pty`'nin native
modülü ve Electron binary'si hiç inmez. `package.json` `allowScripts` onayı **sürüme bağlıdır**
(`electron@44.4.5`): Electron yükseltilince bu satır da değişmeli, binary yine (2) ile iner.
Son yükseltme 2026-09-29: 44.3.0 → 44.4.5, `test:ui` 37/37.

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
renderer çökmesi, preload hatası, `durum.py` çalışma süresi ve hataları, kapatma kararları
(güvenli/zorla). PTY sunucusu `~/.kokpit/pty-server.log`'a yazar (güvenli çıkışın süresi
dahil). İki dosya da açılışta 2 MB'ı geçerse `.1`'e devredilir.

**Tek örnek:** ikinci `kokpit` yeni pencere açmaz, açık olanı öne getirir (iki örnek aynı
oturum defterini paylaşıp birbirinin açık oturumlarına geri yükleme teklif ediyordu).

Bu kablolar bilerek bırakıldı — bu projede iki kez *sessiz* hata sınıfıyla karşılaşıldı
(`data:` URL'in WebSocket'i sessizce engellemesi; Windows yol kaçışlarının `CreateProcess`
"error 267" vermesi). Detay: `docs/Spike-Bulgulari.md`.

## İkinci beyinle ilişki

Kokpit **tek yönlü bir aynadır**: beyinden okur, beyne (Inbox notu dışında) yazmaz.

**Proje oturumları beyne nasıl düşer (2026-09-21):** her projenin `session-end.ps1` hook'u
vault'taki `.claude/hooks/proje-flush.ps1`'i çağırır, o da `flush.py --proje <ad>`'ı ayrık
süreç olarak başlatır; özet `daily/`'ye `### Oturum (HH:MM) — <ad>` başlığıyla düşer.
Bundan önce proje oturumları beyne hiç girmiyordu. Kokpit bunu **ölçer**: `durum.py`
`beyin.kapsama` (son 8 gün, düşmemiş oturumlar) Sağlık sayfasında; kapanan her oturum için
`electron/beyin.cjs` transcript + flush durumuna bakıp "beyne düştü / düşüyor / düşmedi"
der. Geri doldurma vault'ta: `python .claude/scripts/flush_kapsama.py --proje <ad> --doldur`.

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
   **Geri doldur** bu kuralı çiğnemez: yazan vault'un kendi flush zinciridir (oturum başına
   kilitli `flush.py`), Kokpit yalnız tetikler — tıpkı SessionEnd hook'u gibi (2026-09-29).
6. **Açılan terminallerden ebeveyn oturum işaretleri temizlenir.** Yoksa transcript
   yazılmaz ve ikinci beyin o oturumu kaydetmez.
