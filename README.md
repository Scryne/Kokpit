# Kokpit

Scryne'ın projelerini tek ekranda gösteren ve karttan tek tıkla o klasörde `claude` oturumu
açan yerel masaüstü uygulaması.

**Kendi verisi yok.** Gösterdiği her şey `ScryneOS/.claude/scripts/durum.py --json`
çıktısından, yani git'in zaten takip ettiği dosyalardan türetilir. v1 hiçbir yere yazmaz. Kokpit'in
kendi çalışma verisi (ayarlar, oturum defteri, hızlı komutlar, çalıştırma tarifleri) `~/.kokpit/`
altındadır; projelerin bilgisi değil, Kokpit'in nasıl kullanıldığıdır. Vault'a tek yazma Inbox notu.
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

**Bağlam göstergesi:** terminal başlığında "bağlam 354k · %21" = claude'un son turda modele
giden girdisi (input + cache yazma + cache okuma). Kokpit oturumlarında statusline'dan, her
turda; yoksa transcript'in son 512 KB'ından 20 sn'de bir.

**Kanca köprüsü (v2.2):** Kokpit claude'u `--settings ~/.kokpit/kanca/ayar-<pid>.json` ile
açar. O dosyadaki HTTP hook'lar Kokpit'e "ne yapıyor" bilgisini verir; projenin kendi
hook'larıyla **birleşir**, global `~/.claude/settings.json`'a dokunulmaz, Kokpit dışında
açılan claude etkilenmez. Bölmenin üstündeki **etkinlik şeridi**: durum (çalışıyor / seni
bekliyor / bitti), son araç ve dosyası, `+N −M`, tur süresi, oturum özeti; tıklayınca son 30
araç. Kenarın altında **limit** (5 saat, hafta). Statusline Kokpit oturumlarında
`electron/durum-satiri.cjs` üzerinden geçer ve senin statusline komutunu aynen çalıştırır.

**Ada:** Kokpit arka plandayken ekranın üst ortasında küçük şerit: seni bekleyen ya da
çalışan oturum, 5 saatlik limit. Üstüne gelince oturum listesi açılır; bir oturum bitince
ya da soru sorunca 5 sn kendiliğinden açılır. Tıklayınca Kokpit o sekmeyle öne gelir.
Komut paletinden "Ada'yı kapat".

**Hızlı komutlar (v2.3):** etkinlik şeridinin sağındaki ⚡ menüsü ya da paletteki "Gönder" grubu, seçilen
mesajı o oturuma yazıp gönderir (klavyeden yazılmış gibi). Varsayılanlar son 30 günün prompt'larından:
Devam et · Neredeyiz? · Sen karar ver · Doğrula · Commit · Özetle. Liste `~/.kokpit/komutlar.json`
(ilk açılışta oluşur; "Komutları düzenle" dosyayı açar, değişiklik pencere odağa gelince okunur).

**Ada'dan cevap (v2.3):** sıra sende olan oturum (bitti / seni bekliyor) Ada'da kendi satırının altında
eylem taşır. claude soru sorduysa (AskUserQuestion, tek soru) seçenekler düğme olur, tıklayınca o
seçeneğin rakamı oturuma gider; "Kendi cevabın" kutusu serbest cevap verir. Soru yoksa ilk üç hızlı
komut ve bir yanıt kutusu. Kokpit öne gelmez. Çok sorulu / çoklu seçimli sorular terminalde cevaplanır.
Cevap gidene kadar soru değiştiyse gönderilmez. **Ctrl+Alt+Shift+K** Kokpit'i her yerden çağırır
(öndeyse küçültür).

**Çalıştır (v2.3):** Pano satırındaki ▷ projenin uygulamasını claude'un yanında ayrı bir **servis
bölmesinde** açar (o projede açık sekme varsa içine). Komut önce `~/.kokpit/calistir.json`'dan, yoksa
`package.json`'dan (`dev` > `start`); bulunamazsa bir kez sorulur ve kaydedilir (`calistir` skill'i de
aynı dosyaya yazar). Bölme başlığında komut, yakalanan adres (tıklayınca tarayıcıda), yeniden başlat ve
durdur. Durdurunca **süreç ağacı** ölür (`taskkill /T`): dev sunucusunun torunları portu tutup kalmaz.
Ölçüldü: konsoldan kopuk torun da ölüyor, port boşalıyor (`test:pty`).

**Sürdür ve oturum kimliği (v2.3):** her claude oturumunun kimliğini Kokpit verir (`--session-id`) ve
defterde tutar. Geri yükleme ve Pano'daki "Sürdür" `claude --resume <kimlik>` ile **tam o konuşmayı**
açar (eskiden `--continue`: o klasördeki en son konuşma, Kokpit dışında açılmış başka bir oturum
olabilirdi). Sağlık/Pano'daki "beyne düştü" ve bağlam göstergesi de tahmin yerine bu kimliğe bakar.

**Geri doldur:** beyne düşmemiş TEK oturumu vault'un kendi zinciriyle özetler
(`flush_kapsama.py --oturum`, ~20–60 sn, model çağrısı). Betik son 30 dk'da yazılmış transcript'i
reddeder; Kokpit'te o klasörde açık oturum varken düğme kapalı. `--doldur` bilerek kullanılmaz:
o, dizindeki açık oturumları da erken doldururdu.

**Klavye:** Ctrl+Shift+P komut paleti (sayfa, proje aç/git, klasör, eylemler) · Ctrl+B kenar
çubuğu · Ctrl+Tab / Ctrl+Shift+Tab sekme döngüsü · Ctrl+Shift+W bölmeyi kapat · Ctrl+Shift+N
Inbox'a not · **Ctrl+Alt+Shift+K her yerden Kokpit'i çağır / küçült** · **Ctrl+Alt+Shift+N her yerden Inbox notu** (Kokpit arka plandayken de; Ctrl+Alt
Türkçe klavyede AltGr olduğu için üç değiştirici) · sekme şeridinde ← →, bölme ayırıcısında ← →
(%5). **Terminalde:** Ctrl+Shift+F ara (Enter / Shift+Enter / Esc) · Ctrl+C seçim varken
kopyalar, yokken `^C` · Ctrl+Shift+C/V · sağ tık yapıştır · Ctrl+= / Ctrl+- / Ctrl+0 yazı
boyutu (kalıcı) · dosyayı sürükleyip bırakınca yolu yazılır. Terminal odaktayken **Ctrl+B
claude'a gider** (Claude Code'un "arka plana at" kısayolu; Ctrl+V de `^V` olarak gider,
resim yapıştırma). Uygulamanın öbür kısayolları terminale hiç ulaşmaz.

**Zil:** claude bitince/soru sorunca sekme, bölme, kenar ve Pano noktası amber olur;
pencere odakta değilse Windows bildirimi gelir ("Otomat bitti · 3 dk · 2 dosya +40 −6" ya da
"Otomat seni bekliyor"), tıklayınca o sekmeye gidilir. "Bitti" rozeti bakınca düşer;
"seni bekliyor" cevaplanana kadar kalır.

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
npm run test:pty     # PTY sunucusunun uçtan uca testi, servis ağacı dahil (18 kontrol)
npm run test:kanca   # kanca köprüsü, soru/komut/tarif/adres/kimlik (71 kontrol)
npm run test:ui      # gerçek Electron + CDP ile arayüz testi (65 kontrol, önce build)
npm run e2e:kanca    # GERÇEK claude ile hook zinciri + --session-id (11 kontrol; elle, plan kullanır)
npm run ekran:ada    # v2.3 yüzeylerinin ekran görüntüsü (ada, terminal, Pano)
npm run typecheck
npm run build
npm run design:lint  # DESIGN.md spec denetimi
npm run ikon         # public/kokpit.svg -> kokpit.ico + kokpit.png
```

**Test koşucuları gerçek `~/.kokpit`'e dokunmaz** (v2.3): `test:ui`, `ekran`, `ekran:ada` uygulamayı
`KOKPIT_DIZIN=<geçici dizin>` ile açar (ayar, defter, komutlar, tarifler, kanca, log, Chromium profili
orada), sonda dizini siler. Eskiden gerçek dizinde koşup yedekten geri yazıyorlardı: açık bir gerçek
Kokpit varken test örneği onun oturumunu "önceki çalışmadan kalan" sanıp deftere sahte "kapandı"
yazıyordu (2026-10-04). `test:ui` kaynak `dist`'ten yeniyse koşmayı reddeder (derleme düşmüşse eski
arayüzü test edip yeşil yanıyordu).

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

**CI** (`windows-latest`): typecheck + build + `test:pty` + `test:kanca`. `test:ui` CI'da koşmaz — vault ve
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
| `KOKPIT_TEST_ADA` | — | Test koşucusunda (`KOKPIT_TEST_KABUK=1`) adayı da kur |
| `KOKPIT_DIZIN` | `~/.kokpit` | Kokpit'in kendi veri dizini; test/ekran koşucuları geçici dizin verir |

`~/.kokpit/ayarlar.json`: `seffaf: false` pencereyi opak yapar, `ada: false` adayı kapatır.

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
7. **Kanca köprüsü global ayara yazmaz ve toplayıcı değildir.** Hook'lar yalnız Kokpit'in
   açtığı oturumlara `--settings` ile verilir; veri bellekte, Kokpit'in kendi oturumları
   hakkında (kapanınca yalnız özet deftere). Token dosyaya yazılmaz, ortamla gider. Kokpit
   kapalıyken hook claude'u bekletmez (2 sn zaman aşımı, bağlantı hatası bloklamaz).
8. **Kokpit bir oturuma yalnız Scryne'ın açık eylemiyle yazar** (hızlı komut, Ada'dan cevap). Kendiliğinden
   gönderim, sıraya alınmış otomatik "devam", koşullu cevap yok: oturumun sahibi kullanıcıdır. Soru cevabı
   damgasız ya da bayat damgayla gitmez.
9. **Servis bölmesi ağacıyla ölür.** Bölme kapanınca `taskkill /T` (asenkron), uygulama kapanırken sunucunun
   kendi çıkışı beklenir (senkron ağaç öldürme). `p.kill()` tek başına konsoldan kopuk torunları bırakır.
10. **Test ve ekran koşucuları `KOKPIT_DIZIN` ile ayrı dizinde çalışır.** Gerçek `~/.kokpit`'e yazmaz, geri
    yazma yapmaz.
