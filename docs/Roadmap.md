---
proje: Kokpit
created: 2026-09-10
modified: 2026-10-29
type: roadmap
status: aktif
---
# Kokpit — Roadmap

Durum sütunu session-start hook'u tarafından otomatik okunur — format bozulmasın:
⏳ Bekliyor / 🔄 Devam Ediyor / ✅ Tamamlandı.

**Sıralama ilkesi:** her faz sonunda elde *çalışan bir şey* olur. Faz 1'de pencere açılıp
gerçek veri gösterir; Faz 2'de içinde gerçek terminal çalışır. Vitrin fazı yok.

| Faz | Adı | Durum | Bitti Kriteri |
| --- | --- | --- | --- |
| 0 | Spike: PTY + Electron + veri şeması | ✅ Tamamlandı | A-01…A-04 kapandı, `docs/Spike-Bulgulari.md` |
| 1 | Yürüyen iskelet: pencere + gerçek veri | ✅ Tamamlandı | `npm start` ile pencere açılıyor, `durum.py --json` çıktısı ham da olsa ekranda |
| 2 | PTY sunucusu + tek terminal | ✅ Tamamlandı | Pencere içinde `claude` çalışıyor, yazılıp okunuyor, resize doğru, kapanışta yetim süreç yok |
| 3 | DESIGN.md + Pano'nun gerçek hali | ✅ Tamamlandı | Kartlar tasarım kimliğine uygun; aşama/roadmap/git/"nerede kaldın" okunaklı |
| 4 | Sekmeler, bölmeler + canlı oturum farkındalığı | ✅ Tamamlandı | Birden fazla oturum sekmesi, "hangi proje / ne kadar süredir açık" doğru |
| 5 | Sertleştirme + günlük kullanıma alma | ✅ Tamamlandı | Erişilebilirlik/animasyon pasları geçti, `kokpit` komutu çalışıyor, bir hafta gerçekten kullanıldı |
| 6 | Terminal: profesyonel taban | ✅ Tamamlandı | WebGL/unicode11/link/arama/pano/yazı boyutu; zil → rozet + bildirim; canlı oturumu kapatırken onay |
| 7 | Süreklilik: Kokpit'in kendi hafızası | ✅ Tamamlandı | Pencere/ayarlar hatırlanır; oturum defteri; açılışta geri yükleme `claude --continue` ile çalışır |
| 8 | Beyin senkronu + Sağlık sayfası | ✅ Tamamlandı | Proje oturumları `daily/`'ye düşüyor; `durum.py` düşmemişleri sayıyor; Sağlık sayfası boru zincirini gösteriyor; Inbox'a not |
| 9 | Envanter sayfası | ✅ Tamamlandı | Skill/MCP/drift ve bütçe dağılımı Kokpit'te okunuyor |
| 10 | Kimlik ve cila | ✅ Tamamlandı | Özel ikon, a11y/motion pasları yeni yüzeylerde geçti, README/DESIGN.md güncel |
| 11 | Gümüş cam + akrilik pencere | ✅ Tamamlandı | Tema değişti, pencere akrilik; arkada beyaz pencereyle ölçülen en soluk metin ≥ 4.5:1 |
| 12 | Kanca köprüsü | ✅ Tamamlandı | Kokpit'ten açılan claude'un HTTP hook'ları doğru sekmeye düşüyor; proje hook'ları bozulmuyor (gerçek claude ile `e2e:kanca` 10/10) |
| 13 | Etkinlik şeridi + zil ayrımı | ✅ Tamamlandı | Bölmede "ne yapıyor" satırı ve son araçlar akışı; "bitti" ile "seni bekliyor" ayrı; bildirim metni neyin olduğunu söylüyor |
| 14 | Limit ve kesin bağlam | ✅ Tamamlandı | 5 saat / haftalık limit kenarda; bağlam statusline'dan; Scryne'ın kendi durum satırı aynen kalıyor |
| 15 | Ada | ✅ Tamamlandı | Kokpit arka plandayken üst ortada şerit; bekleyen/çalışan oturum, limit; tıklayınca o sekme; gerçek ekranda görüldü |
| 16 | Oturuma yazma + hızlı komutlar | ✅ Tamamlandı | Etkinlik şeridindeki menüden ve paletten seçilen mesaj o oturuma yazılıp gönderiliyor (kabukta yan etkisiyle kanıtlı); liste `~/.kokpit/komutlar.json` |
| 17 | Ada'dan cevap | ✅ Tamamlandı | Ada'da soru seçenekleri (rakam tuşu, gerçek claude ile ölçüldü), serbest cevap, hızlı komut çipleri, yanıt kutusu; bayat cevap damga ile reddediliyor; Kokpit'i çağır kısayolu |
| 18 | Çalıştır (servis bölmesi) | ✅ Tamamlandı | Projenin uygulaması claude'un yanında ayrı bölmede; adres ANSI'li çıktıdan yakalanıyor; kapatınca süreç ağacı ölüyor ve port boşalıyor (konsoldan kopuk torun dahil) |
| 19 | Oturum kimliği + Sürdür | ✅ Tamamlandı | Kokpit `--session-id` veriyor; geri yükleme ve Sürdür `--resume <kimlik>` ile tam o konuşmayı açıyor (gerçek claude ile ölçüldü) |
| 20 | Ada: çok sorulu cevap | ✅ Tamamlandı | 2–4 soruluk AskUserQuestion Ada'dan cevaplanıyor (tuş dizisi gerçek claude ile ölçüldü); dizi kabuğa doğru sırayla gidiyor; her tuştan önce soru yeniden denetleniyor |
| 21 | Ada: son söz, Gördüm, bekleme süresi | ✅ Tamamlandı | Bitti satırında claude'un son mesajı (Stop `last_assistant_message`); "Gördüm" Kokpit'teki rozeti düşürüyor; sıra sende olan oturumda bekleme süresi |
| 22 | Ada: klavye | ✅ Tamamlandı | Ctrl+Alt+Shift+A gerçek tuşla Ada'ya odak veriyor (ölçüldü ~110 ms); 1–4 / Tab / Enter / Esc; bırakınca Kokpit ana penceresi öne gelmiyor |
| 23 | Ada'nın gözü | ✅ Tamamlandı | Hapta gümüş göz; hal ve bakış kanca durumundan (araç, soru, bitti, uyku), alt ajan noktaları, limit kenarı; her hal `ekran:goz` ile görüldü, `test:ui`'da DOM'dan doğrulandı |
| 24 | Hareket bütçesi | ✅ Tamamlandı | Ada görünürken süreç başına CPU/GPU ölçüldü; göz canlı/durgun farkı gürültü düzeyinde (üç dönüşümlü tur); arka plandaki ana pencerede animasyon yok |
| 25 | Oturumsuz limitler | ✅ Tamamlandı | 5 saat + haftalık limit hiç claude oturumu yokken Ada'da ve kenarda; kaynak Claude Code'un `/usage` ucu (gerçek yanıtla ölçüldü); token yalnız main'de, diske/loga yazılmıyor; token eskiyince son ölçüm "eski" olarak kalıyor |
| 26 | Ada hep açık + tepsi | ✅ Tamamlandı | Ada oturum yokken ve Kokpit öndeyken görünür; X tepsiye indirir, oturumlar yaşar; gerçek çıkış tepsi/paletten; Windows açılışında `--arka` ile gizli başlar |
| 27 | Kokpit dışındaki oturumlar | ✅ Tamamlandı | Terminal/VS Code'da açılan claude oturumları `~/.claude/sessions`'tan Ada'da (durum + süre); Kokpit'in kendi oturumları kimlikten ayrılıyor |
| 28 | Ada'dan görev | ✅ Tamamlandı | Ada'da proje + metin → arka planda yeni oturum, metin claude'un ilk mesajı; metin kabuğa ortam değişkeniyle gidiyor (tırnak/`$`/`;` gerçek pwsh'ta birebir) |
| 29 | Ada: kenara sakla | ✅ Tamamlandı | Karttan / tepsiden / Ctrl+Alt+Shift+G ile Ada üst kenara çekilir, yalnız çenesi görünür; imleç durunca sarkar, geçince açılmaz; saklıyken kendiliğinden açılmaz; kalıcı |
| 30 | Ada: sinema (tam ekran) | ✅ Tamamlandı | Gerçek tam ekran pencere öndeyken Ada OS'ta gizli; bekleyen varsa yalnız çene; tam ekran bitince önceki hal; büyütülmüş pencere ve ikinci ekran sayılmaz |
| 31 | Ada: yer | ✅ Tamamlandı | Hap üst kenar boyunca sürüklenir, ortaya yakınsa ortaya oturur, oran olarak kalıcı; sürüklemeden sonra tık Kokpit'i açmaz |
| 32 | Ada: üst katman bekçisi | ✅ Tamamlandı | Dışarıdan normal pencerelerin altına düşürülen Ada (gerçek Win32 z-sırası) ≤ 0,6 sn'de odak çalmadan geri üstte; düşüş loglanıyor |
| 33 | Sekme ağacı | ✅ Tamamlandı | claude sekmesi kapanınca konsoldan kopuk torun da ölüyor; node-pty "AttachConsole failed" yığın izi yok (`test:pty`) |
| 34 | Sürüm bekçisi | ✅ Tamamlandı | Yeni commit fark ediliyor; "yeniden başlat" gerçek çıkış yolundan geçip çıkış bitince başlatıcıyı çağırıyor; yeni örnek kilidi bekleyebiliyor |
| 35 | Denetim 2026-10-21: dayanıklılık | ✅ Tamamlandı | Sinema geçici tam ekranda titremiyor (giriş gecikmesi + kabuk katmanları); `durum.py` hatasında son ölçüm kalıyor, zaman aşımı var; derleme düşerse eski paketle açılıyor; açık bağımlılık 0 |
| 36 | Biten bölme yerinde + Ctrl+Shift+T | ✅ Tamamlandı | Biten claude bölmesi aynı yerde Sürdür (`--resume`, aynı kimlik) / Yeniden aç (yeni kimlik); Ctrl+Shift+T son kapatılanı geri açıyor; kimlik zinciri defterde doğrulandı |
| 37 | Push durumu + hızlı tazeleme | ✅ Tamamlandı | Pano'da ↑N/↓N/"yerel" ve "N commit push bekliyor"; `durum.py` git'i paralel okuyor (2,1 → 0,8 sn, çıktı birebir aynı) |
| 38 | Ekran yakalama → oturum | ✅ Tamamlandı | Panoya düşen görüntü (Win+Shift+S ya da Ctrl+Alt+Shift+S) Ada'da önizleme + hedef oturum; seçilen oturumda `[Image #N]` olarak yapışıyor ve model görüyor (gerçek claude); Scryne'ın panosu değişmiyor; dosyalar `~/.kokpit/goruntu`'da, 7 günde temizleniyor |
| 39 | Ada'ya bırak | ✅ Tamamlandı | Ada'ya sürüklenen dosya/görüntü/metin hedef seçimiyle o oturuma yol ya da metin olarak gidiyor; Kokpit öne gelmiyor |
| 40 | Bot nöbeti | ✅ Tamamlandı | Kendiliğinden çalışan her işin son koşusu, beklenen sıklığı ve hali (sağlıklı / gecikti / düştü) Nöbet sayfasında; veri `durum.py`'den, ağ çağrıları önbellekli; bilerek bozulan örnek "düştü" görünüyor |
| 41 | Vade şeridi | ✅ Tamamlandı | Proje notlarının `vadeler` alanı Pano'nun üstünde (gecikmiş, bugün, bu hafta); bugünkü/yarınki Ada'da; mevcut tarihli işler alana taşındı |
| 42 | Ada: nöbet sesi + yeni ifadeler | ✅ Tamamlandı | Bot düşünce / vade bugünse Ada bakar, göz "endişe"; 5 saat ≥ %90'da "yorgun"; her hal `ekran:goz`'da görüldü, `test:ui`'da DOM'dan |
| 43 | Ada: takılma uyarısı | ✅ Tamamlandı | Üst üste hata veren araç (`PostToolUseFailure`), API hatasıyla duran tur (`StopFailure`) ve uzun sessiz "çalışıyor" satırda amber "takılmış olabilir" + neden; gerçek claude hata gövdesiyle sınandı |
| 44 | Ada: oturumun hedefi | ✅ Tamamlandı | Oturumun ilk isteği (UserPromptSubmit `prompt`) satırın altında tek satır; Kokpit sekme ipucunda da |
| 45 | Ada: bitti kartında sonuç | ✅ Tamamlandı | Biten turun dosya / +− sayısı, oturumda commit atıldı mı, push bekleyen ve kirli dosya var mı Ada'nın bitti satırında |
| 46 | Ada'nın sesi: bas-konuş | ✅ Tamamlandı | Ctrl+Alt+Shift+Space / kart düğmesi; 16 kHz WAV renderer'da, sessizlikte kendiliğinden biter; yerel whisper.cpp (GPU) metne çevirir; gerçek mikrofon Electron'da açıldı |
| 47 | Ada'nın sesi: sesli komut | ✅ Tamamlandı | "X'e yaz …" hedefli not tepsiye, "gönder / yalnız yapıştır / vazgeç / durum ne"; terim düzeltmesi; bulanık adda bağlaç şartı; gerçek whisper ile 8 cümle uçtan uca doğru |
| 48 | Ada'nın sesi: sesli bildirim | ✅ Tamamlandı | Oturum seni bekleyince / bitince Ada adını söyler (edge-tts Türkçe, iki ses yedekli); Kokpit öndeyken susar; tepsiden kapanır |
| 49 | Sesli cevap + sesli özet | ✅ Tamamlandı | "Matbaa ne yaptı?" kanca halinden cümle (soru varsa seçenekleri okur); "ikinci seçenek" / "önerileni seç" soruyu cevaplar (damga denetimi ana pencerede); "Kokpit'i aç"; gerçek whisper ile doğrulandı |
| 50 | Günün brifingi | ✅ Tamamlandı | "Günaydın Ada", palet, tepsi ya da günün ilk etkinliği: vadeler, düşen botlar, bekleyen oturumlar, push bekleyen, limit zamanlaması, beyin; Ada kartında maddeler + sesli cümle + önerilen ilk iş |
| 51 | Seçili metni gönder | ✅ Tamamlandı | Ctrl+Alt+Shift+C: herhangi bir uygulamanın seçimi (Ctrl+Insert, SIGINT yok) Ada tepsisine, oturuma bracketed paste; Scryne'ın panosu her türüyle geri yazılıyor (gerçek Notepad + pano, `test:secim`) |
| 52 | Teslim sayfası | ✅ Tamamlandı | Ctrl+6: push bekleyen commit'ler, kirli dosyalar, diff; onaylı push, public depoda yayın kapısı (`yayin_tara.py --gecmis`), noreply olmayan e-posta uyarısı; "Claude commit etsin" |
| 53 | Canlı önizleme + işaretle-söyle | ✅ Tamamlandı | Servis bölmesi adres gelince uygulamayı gösterir (webview, yalnız yerel, Node'suz); öğe işaretlenir → kırpık + seçici + bileşen + not (yazı/ses) claude'a; konsol hataları sayılır ve gönderilir (gerçek fare olayıyla `test:ui`) |
| 54 | Paralel oturumlar | ✅ Tamamlandı | Ayrı git çalışma ağacında oturum (`.claude/worktrees/<ad>`, dal `kokpit/<ad>`); Teslim'de diff / Birleştir (--no-ff, kirli ve çakışmada güvenli) / At (onaylı); gerçek git ile sınandı |
| 55 | Gece vardiyası | ✅ Tamamlandı | Görev sırası + başlangıç saati; her görev kendi dalında sırayla; soru → önerilen seçenek, takılma / süre / limit kuralları (saf karar, 20 senaryo); makine uyumaz; sabah brifingi özetler; nöbete bildirildi |
| 56 | Eller serbest ("Ada, …") | ✅ Tamamlandı | İsteğe bağlı sürekli dinleme: yalnız kısa konuşma parçası whisper'a, "Ada" ile başlamayan metin hiçbir yere yazılmaz; video/müzik uzunluk süzgecinde düşer; sinemada kapalı |
| 57 | Telefondan erişim | ✅ Tamamlandı | Oturumda telefon düğmesi `/rc` (Remote Control) açar, bağlantı yakalanır; isteğe bağlı yeni oturumlar `--remote-control` ile (gerçek claude 2.1.312'de bypass ile çalıştı) |
| 58 | Aria: sohbet çekirdeği | ✅ Tamamlandı | Vault'ta kalıcı claude oturumu (stream-json): günlük kimlik, `--resume`, kesme, `--strict-mcp-config` (açılış 15 → 1,8 sn); gerçek claude ile hook'lar hafızayı yükledi, süreç kapanıp açılınca konuşma sürdü |
| 59 | Aria: sayfa ve yüz | ✅ Tamamlandı | Ctrl+7: sinyal halkası (dinliyor / düşünüyor / yazıyor / konuşuyor), akan sohbet, markdown, araç izi, "hafızaya yazdı", kesme, geçmiş günler, sesli cevap |
| 60 | Aria: ses (Ada onun yüzü) | ✅ Tamamlandı | Soru biçimli cümle ve "Aria, …" / "sor:" / "hatırla" Aria'ya; Ada düşünürken göz çalışıyor, cevabı sesli okuyor, "Aria'da aç"; yazma niyeti ve özet/cevap komutları önceliğini koruyor |
| 61 | Aria: hafıza paneli | ✅ Tamamlandı | Kimlik, açık konular, kurallar, son oturumlar, Journal (vault salt okunur); 274 makalede arama (57 ms); dosya okuyucu + "Aria'ya sor" |
| 62 | Aria: Kokpit araçları + öneri kartı | ✅ Tamamlandı | Yerel MCP (stdio → 127.0.0.1 + token): okuma araçları; yazma yalnız öneri kartı, Scryne onaylar (tık / sesli "onayla"), ana pencere uygular; gerçek claude ile uçtan uca |
| 63 | Aria: günlük not | ✅ Tamamlandı | "Fark ettiklerim": ayrı, kalıcı olmayan claude -p; günde bir brifingle (ayar) ya da elle; gerçek koşuda kaynaklı 5 madde (47 sn) |
| 64 | Aria'nın ağı: veri | ✅ Tamamlandı | `hafiza-ag.cjs`: vault'tan not grafiği (358 düğüm, 1.450 bağ, 49 ms); bağ çözümü önce kaynak notun klasörü; salt okunur, 60 sn önbellek |
| 65 | Aria'nın ağı: tuval | ✅ Tamamlandı | `AriaAgi.tsx`: d3-force yerleşimi (kaydedilir, coğrafya sabit), pan/zoom, üzerine gel, arama, tıkla → hafıza çekmecesi, çakışmasız etiket |
| 66 | Aria'nın ağı: ateşleme | ✅ Tamamlandı | Araç olayı → düğüm (okuma/yazma/arama/Kokpit), Aria'dan BFS yolunda sinyal, yayılan aktivasyon, çağrışım, düşünürken kıvılcım, bekleyen öneri amber |
| 67 | Aria'nın ağı: sayfa | ✅ Tamamlandı | Sohbet solda, ağ sağda, hafıza paneli çekmece; dar ekranda kapalı; hareket bütçesi (boştayken döngü durur) testte |
| 68 | Denetim: gözetimsiz iş ve veri kaybı | ✅ Tamamlandı | Gece oturumları `permissions.deny` ile (push/silme/gh teknik olarak kapalı, spike'ta doğrulandı); limit bilinmiyorsa görev başlamaz; 10 sa vardiya sınırı; paralel ağaç atılırken .gitignore'daki dosyalar uyarılır; öneri kartı çift onaylanamaz |
| 69 | Denetim: yayın ve süreç güvenliği | ✅ Tamamlandı | Teslim: görünürlük push anında taze, kapı çalışmazsa varsayılan Vazgeç, onaydan sonra gelen commit itilmez, çapalı GitHub adresi; PTY jetonu alt süreçte yok, çıkışta bütün oturum ağaçları ölür; önizleme yönlendirmesi; bütün pencerelerde gezinme koruması |
| 70 | Denetim: Aria ve ses dayanıklılığı | ✅ Tamamlandı | Aria süreci: eski çıktı yeni tura karışmaz, başlatma hatası/çıkış kurtarılır, kuyruk cevapsız kalmaz; whisper asılınca yeniden başlar; ses sırası; mikrofon hataları ayrışır |
| 71 | Denetim: arayüz | ✅ Tamamlandı | ~60 arayüz bulgusu: terminal boyutu, Teslim yarışı, durum hatası her sayfada, markdown tablo/alıntı, ağın klavye erişimi, öneri metninin tamamı, sessiz hataların görünür olması |
| 72 | Bildirim geçmişi | ✅ Tamamlandı | Başlıkta zil: son 50 bildirim (hatalar dahil, gece notları), okunmamış sayısı, Esc; kısa satır 4 sn |

**v1.1 → v2 kararı (2026-09-21):** Scryne 10 günlük günlük kullanımdan sonra "sınırsız yetki,
en profesyonel seviyeye çıkar" dedi. Sıra ihtiyaca göre: en çok dokunulan yüzey (terminal) →
kapanınca unutma → beyinle gerçek senkron → planın v1.1 sayfaları → kimlik. Değişmeyen
kurallar: veri kaynağı `durum.py` (Kokpit'in **kendi** çalışma verisi — oturum defteri,
ayarlar — `~/.kokpit/` altında, bu toplayıcı değil); vault'a yalnızca **dar ve açıkça
listelenmiş** yazmalar; cam yalnız nav ve şerit.

## Faz Detayları

### Faz 0: Spike — PTY + Electron + veri şeması ✅
- **İşler:** `node-pty` ConPTY doğrulaması, `claude` TUI'sinin PTY üzerinden çalışması,
  Electron + ayrı düz Node süreci mimarisi, yetim süreç testi, `durum.py --json` şema
  denetimi, tazeleme maliyeti ölçümü.
- **Bitti Kriteri:** A-01…A-04 kapandı. ✅ (2026-09-10)
- **Notlar:** İki sessiz hata sınıfı çıktı ve ikisi de mimariye kural olarak gömüldü:
  `data:` URL opaque origin'i WS'i sessizce engelliyor; Windows yolları string literal
  yazılınca `CreateProcess` yanıltıcı "error 267" veriyor. Ayrıca npm 11.19'un install-script
  bloğu ve Electron binary'sinin mirror'dan inmesi kurulum adımına yazıldı.

### Faz 1: Yürüyen iskelet — pencere + gerçek veri
- **İşler:** Vite + React + TS + Tailwind v4 iskeleti; Electron main (pencere, teşhis
  kabloları, güvenli `webPreferences`); preload'da dar `contextBridge`; main'de
  `durum.py --json` çalıştırıp IPC ile renderer'a verme; tazeleme (açılış + odak + buton);
  `npm start` tek komutu (dev sunucusu + Electron birlikte).
- **Bitti Kriteri:** `npm start` pencereyi açıyor, içinde beş projenin gerçek verisi
  görünüyor (biçimlendirilmemiş olabilir), tazele butonu çalışıyor, main log dosyası yazıyor.
  ✅ (2026-09-10)
- **Notlar:** Üç şey ölçümle çıktı, üçü de düzeltildi:
  1. **`npm.cmd` spawn edilemiyor.** Node 20+ Windows'ta `shell:false` ile `.cmd`/`.bat`'a
     `EINVAL` atıyor (güvenlik düzeltmesi). Çözüm: Vite doğrudan `process.execPath` ile
     çalıştırılıyor, kabuk araya girmiyor. Kural: bu projede `.cmd` spawn edilmez.
  2. **Vite'in hazır satırı ANSI kodlu.** `localhost:` ile port arasına renk escape'i giriyor,
     düz string eşleşmesi *sessizce* tutmuyor — uygulama hiç açılmıyor, hata da vermiyor.
     Çözüm: escape'leri soyup regex. **Bu projede üçüncü sessiz hata sınıfı.**
  3. **Tazeleme fırtınası.** Açılışta 4, sonra 34 saniyede 8 `durum.py` çalışması. Sebep:
     StrictMode'un çift effect'i + her `focus` olayının tetiklemesi. Her çalışma ~500 ms'lik
     bir Python süreci. Çözüm: uçuşta-tek-istek kilidi + odak için 30 sn asgari aralık.
     **Ders:** dosya izleyiciyi "ikinci yarış kaynağı" diye reddettim, aynı şeyi odak
     olayıyla geri getirmişim. Tazeleme *her* tetikleyicide sınırlanır.

  Ayrıca CSP eklendi (dev'de Vite HMR'a izinli, üretimde sıkı) — Electron'un güvenlik uyarısı
  gerçek bir açıktı, Faz 2'de ws portu `connect-src`'ye eklenecek.

### Faz 2: PTY sunucusu + tek terminal
- **İşler:** `pty-server.cjs` (ws + node-pty, ephemeral port, stdout'tan port bildirimi,
  bağlantı başına bir PTY); main'in çocuk süreç yaşam döngüsü ve `before-quit` temizliği;
  renderer'da `xterm.js` + `addon-fit`; resize'ın PTY'ye geçmesi; kopyala/yapıştır.
- **Bitti Kriteri:** Pano'daki bir karttan Başlat → o klasörde `claude` açılıyor, TUI doğru
  çiziliyor, pencere yeniden boyutlandırılınca kabuk da uyuyor, uygulama kapanınca
  `Get-Process node` sayısı artmıyor. ✅ (2026-09-10) — TUI çizimi ve resize Scryne
  tarafından doğrulandı; yetim testi ölçüldü, kapanıştan sonra ayakta kalan iki `node`
  süreci de shadcn MCP'ye ait, PTY sunucusundan iz yok.
- **Notlar:**
  1. **Token zorunlu kılındı (planda yoktu).** Yerel bir WS portu, tarayıcıdaki herhangi bir
     sayfanın da ulaşabileceği bir yüzeydir; tokensiz olsaydı açık bir web sayfası bu makinede
     süreç başlatabilirdi. Main her açılışta 32 baytlık rastgele token üretip preload üzerinden
     renderer'a veriyor; sunucu eşleşmeyen bağlantıyı 4401 ile kapatıyor. CSP'ye
     `ws://127.0.0.1:*` eklendi.
  2. **Kapanışta iki emniyet kemeri var, ikincisi gerçek kullanımda kanıtlandı.** Nazik yol
     `before-quit` → `stdin.end()`. Ama ilk gerçek kapanış süreç ağacının toptan öldürülmesiyle
     oldu (`before-quit` hiç koşmadı) ve çocuk yine de stdin'de EOF görüp temiz kapandı.
     Yani sert yol test edildi ve tuttu; nazik yol hâlâ günlük kullanımda gözlenecek.
  3. **Teşhis kablosunun kendisi kördü.** `pty kapandi pid=?` yazıyordu: `ws.close` handler'ı
     `onExit`'ten önce koşup pid'i taşıyan referansı null'lıyordu. pid artık spawn anında
     sabitleniyor. Ders: teşhis kodu da test edilir, "log var" ile "log doğru" aynı şey değil.
  4. **CSP uyarısı dev'de kalıcı.** Electron `unsafe-eval` varlığında da uyarıyor, Vite HMR
     onu zorunlu kılıyor. Üretim politikasında yok.

### Faz 3: DESIGN.md + Pano'nun gerçek hali
- **İşler:** Kökteki `DESIGN.md`'yi doldur (`create-design-md` + `ui-ux-pro-max`; taban dark
  glassmorphism sabit, karakter katmanı bu projeye özel); `design-taste` ile yön; `shadcn` ile
  kart/rozet/progress; aşama rozeti, roadmap ilerleme çubuğu, git durumu, "nerede kaldın"
  (`roadmap.sirada.ad` + `git.son_commit`); sistem dışı proje rozeti; `ux-writing` ile metinler.
- **Bitti Kriteri:** Pano 10 saniyede "bugün ne var" sorusunu cevaplıyor; `DESIGN.md` lint'ten
  geçiyor; hiçbir kart şablon gibi durmuyor. ✅ (2026-09-10) — lint hariç:
  `npx @google/design.md lint` bu ortamda çalışmadı (`--help` dahil yanıtsız takılıyor),
  dosya spec'e göre elle yazıldı, doğrulama borç.
- **Notlar:** Tasarım üç turda oturdu, ikisi geri alınan karar:
  1. **Şeffaflık (akrilik) denendi ve geri alındı.** Windows 11 native akriliği çalıştı, ama
     Scryne'ın duvar kâğıdı açık gri olduğu için tüm arayüz gri çorbaya döndü ve
     `metin-soluk` seviyesindeki her şey okunmaz oldu. **Ders:** yarı saydam bir yüzey,
     arkasında ne olduğunu bilmediği sürece kendi kontrastını garanti edemez. Pencere opak
     oldu, cam uygulamanın kendi zemini üzerinde kaldı.
  2. **Gümüş palet denendi ve OsintLab sistemine geçildi.** Scryne'ın kararı: aynı görsel
     dil. Global "reskin olmasın" kuralı bilerek esnetildi, gerekçe DESIGN.md'de yazılı.
     Kokpit'in kendi ayırt edici kuralı korundu: **mono = ölçülmüş değer**.
  3. **Kart ızgarası → hero+liste → dashboard tablosu.** İlk hâli beş özdeş karttı; slop
     tablosundaki "eşit ağırlıklı kart üçlüsü, odak yok" kusurunun birebir karşılığıydı.
  4. **`cam` sınıfı her yüzeye sürülmüştü**, OsintLab'ın kuralı tam tersi. Cam artık yalnız
     nav ve sekme şeridinde; ölçüm kutusu, tablo, beyin ve terminal yarı saydam opak yüzey.

### Faz 4: Sekmeler + canlı oturum farkındalığı
- **İşler:** Birden fazla PTY sekmesi; sekme başlığı = proje adı; açık kalma süresi sayacı;
  Pano kartında "şu an açık" göstergesi; sekme kapatınca PTY'nin temiz ölmesi.
- **Bitti Kriteri:** İki proje aynı anda açık, hangisi ne kadar süredir açık doğru görünüyor,
  sekmeler kapanınca süreç sızıntısı yok. ✅ (2026-09-10)
- **Notlar:** Kapsam planın ötesine geçti (Scryne'ın isteği): sekme = grup, grup içinde
  **yan yana bölmeler**, sürüklenebilir ayırıcı. Kenar çubuğu terminale geçince daralıyor.
  Klavye: Ctrl+B / Ctrl+1 / Ctrl+2 / Ctrl+Shift+W.
  **Mimari zorunluluk olarak çıkan ders:** oturumlar App seviyesinde yaşamak ve görünüm
  değişince unmount olmamak zorunda. Önceki halde Pano'ya her bakış WS'i kapatıp PTY'yi
  öldürüyordu — yani çalışan bir oturum, ona bakmak için bile kayboluyordu.
  Bu eşzamanlı çalışma özelliği DEĞİL — süreklilik göstergesi.

### Faz 5: Sertleştirme + günlük kullanıma alma
- **İşler:** `fixing-accessibility` (klavye, focus, kontrast — glassmorphism kontrastı
  düşürür), `fixing-motion-performance` (`backdrop-filter` maliyeti — global kural gereği
  zorunlu geçiş), `frontend-ui-engineering` pası; PowerShell profiline `kokpit` fonksiyonu;
  README'ye kurulum tuzakları.
- **Bitti Kriteri:** Denetim pasları geçti; bir hafta boyunca gerçekten günlük kullanıldı.
- **Durum (2026-09-10):** Günlük kullanımı mümkün kılan dilim bitti.
  - ✅ Üretim modu çalışıyor ve doğrulandı (`npm run kokpit`). İlk çalıştırmada **iki sessiz
    hata** çıktı, ikisi de yalnızca üretimde görünüyordu: CSP `file://` üzerinde hiç
    uygulanmıyordu (→ `app://` şeması), ve gömülü font `font-src 'self'`e takılıyordu
    (→ `assetsInlineLimit: 0`). **Ders: dev'de çalışması üretimde çalıştığı anlamına gelmez;
    üretim yolu ayrıca test edilir.**
  - ✅ `kokpit` komutu PowerShell profilinde (`kokpit` üretim, `kokpit -dev` geliştirme).
  - ✅ Uygulamanın kendi terminalleri pwsh 7 açıyor, yani içeride `durum` ve `kokpit` var.
  - ✅ Son denetim geçildi (2026-09-10): durum güncelleyicisinin saflığı düzeltildi (gerçek
    doğruluk hatasıydı), sekme/panel `aria` ilişkisi kuruldu, daraltılmış kenarda proje baş
    harfi, dev portu tek kaynağa çekildi, üretim betiği sinyalde Electron'u yetim bırakmıyor.
  - ✅ Bir hafta günlük kullanım (2026-09-20, Scryne: "projelerimi artık kokpit üzerinden
    geliştiriyorum, her gün kullanıyorum"; `dist/` yazım zamanı 09-19 bunu doğruluyor).
- **Durum (2026-09-20):** Denetim pasları yapıldı, Scryne uygulamada elle doğruladı
  ("hiçbir sorun yok"). **Faz 5 kapandı.** ✅
  - ✅ `fixing-accessibility`: ayırıcı klavyeyle çalışır (`tabIndex`, ok tuşları %5,
    `aria-valuenow`); proje seçici menüsü portal'da olduğu için Tab'la ulaşılamıyordu —
    açılınca odak ilk öğeye, ↑↓/Home/End, Escape odağı düğmeye geri verir, Tab kapatır;
    sekme şeridinde ←→/Home/End; hata bloğu `role="alert"`, "oturum kapandı" `role="status"`;
    daraltılmış kenar çubuğundaki ikon düğmelere `aria-label`; bölmeye klavyeyle
    odaklanınca da aktif bölme değişir (`onFocus`, önce yalnız `onMouseDown`).
  - ✅ `fixing-motion-performance`: **kenar çubuğunun `transition-[width]`'i kaldırıldı** —
    blur'lu yüzeyin boyutu 180 ms anime olurken her kare yeniden blur + ana alanda layout +
    xterm `fit()` + PTY'ye resize gidiyordu (claude TUI ~11 kez yeniden çiziliyordu).
    Ayırıcı sürüklenirken PTY'ye boyut artık yalnız satır/sütun **değişince** gider ve
    ölçüm kare başına bir kez (rAF). Menüdeki `backdrop-blur-xl` kaldırıldı (DESIGN.md: cam
    yalnız nav ve şerit).
  - ✅ Doğruluk (`frontend-ui-engineering`): **kısayollar terminale sızıyordu.** xterm
    keydown'ı `stopPropagation` yapmıyor (kaynaktan doğrulandı): Ctrl+B hem claude'a
    `` gidiyor hem kenar çubuğunu açıyordu. Karar: Ctrl+1/2/Shift+W xterm'de
    `attachCustomKeyEventHandler` ile kesilir; **Ctrl+B terminal odaktayken claude'undur**
    (Claude Code "arka plana at"), uygulama o zaman tepki vermez.
  - ✅ Başlat menüsü kısayolu: `npm run kisayol` → `scripts/kokpit-sessiz.vbs` (konsol
    penceresi yok). Özel ikon yok, Electron'un ikonu.
  - ✅ `DESIGN.md` lint borcu kapandı: `npx @google/design.md` bin adındaki nokta yüzünden
    sessizce hiçbir şey yapmıyormuş; `npx -p @google/design.md designmd lint` çalışıyor
    (`npm run design:lint`). 0 hata; iki uyarı giderildi (`primary` referansla eklendi,
    `motion` spec'te olmadığı için gövdeye taşındı).
  - ✅ Scryne'ın elle doğrulaması: klavye ayırıcı, menü oku, Ctrl+1/2 terminalden, kısayol.
  - ✅ **Kullanımdan gelen ilk istek:** dosyayı (resmi) terminale sürükleyip bırakmak
    çalışmıyordu, yol elle kopyalanıyordu. Artık bırakılan dosyanın yolu terminale
    yazılıyor (boşluk varsa tırnaklı, Windows Terminal gibi). `File.path` Electron 32'de
    kalktığı için yol preload'daki `webUtils.getPathForFile` ile alınıyor; pencereye
    dosya bırakınca Chromium'un `file://`'a gezinmesi `will-navigate` ile kapatıldı.
- **Notlar:** Kullanılmazsa v1.1'e (Sağlık/Envanter sayfaları) **geçilmez** — Katman 1'in
  dersi. Aracın değil ihtiyacın yanlış okunduğu anlaşılır. **2026-09-20: kullanım koşulu
  sağlandı**, v1.1 artık açılabilir; kapsamı `🧠 500-Knowledge/Kokpit-Plani.md`'de, ama
  hangi sayfanın önce geleceği gerçek kullanımdaki eksikten çıkmalı, plandan değil.

### Faz 6: Terminal — profesyonel taban
- **İşler:**
  1. `@xterm/addon-webgl` (yüklenemezse canvas'a düş), `@xterm/addon-unicode11` (emoji ve
     kutu çizimi genişlikleri — claude TUI ikisini de kullanır), `@xterm/addon-web-links`
     (tıklama → main'de `shell.openExternal`, yalnız `http(s)`), `@xterm/addon-search`
     (Ctrl+Shift+F arama çubuğu, Enter/Shift+Enter, Escape kapatır).
  2. Pano: Ctrl+Shift+C kopyala (seçim varsa), Ctrl+Shift+V yapıştır, sağ tık yapıştır.
  3. Yazı boyutu: Ctrl+= / Ctrl+- / Ctrl+0 (yalnız terminal odaktayken; uygulama zoom'u
     kilitli kalır), tüm terminallere uygulanır, kalıcı (Faz 7 ayar dosyası).
  4. **Zil:** `term.onBell` → sekme/bölme "dikkat" rozeti (aktif olmayan sekmede); pencere
     odakta değilse Windows bildirimi (proje adı), tıklayınca o sekmeye gidilir. Claude Code
     bitince/soru sorunca zil çalar (`terminal_bell`); çoklu oturumun asıl değeri bu.
  5. Ctrl+Tab / Ctrl+Shift+Tab sekme döngüsü.
  6. **Kapatma koruması:** kabuk hâlâ canlıyken sekme/bölme kapatılırsa yerel onay
     diyaloğu; uygulama kapatılırken açık oturum varsa aynı. Gerekçe: PTY öldürülünce claude
     SIGHUP alır ve **SessionEnd hook'u çalışmaz** → oturum beyne düşmez. Metin bunu söyler.
- **Bitti Kriteri:** claude TUI'si WebGL'de çiziliyor (log'da hangi renderer yazıyor);
  link tıklanınca tarayıcı açılıyor; arka plandaki sekmede claude bitince rozet + bildirim
  geliyor; canlı oturum kapatılırken onay soruluyor; yazı boyutu değişip kalıyor.
  ✅ (2026-09-21) — `npm run test:ui` 13/13: webgl aktif, zil → rozet → bakınca düşüyor,
  Ctrl+Shift+F, Ctrl+=/0 diske yazıyor, Ctrl+1/2 terminalden, sekme kapanışı, temiz çıkış.
- **Notlar:**
  1. **UI test koşucusu doğdu** (`scripts/test-ui.cjs`): Electron `--remote-debugging-port`
     + CDP, bağımlılık yok. Gerçek tuş/tıklama gönderir, DOM'dan okur. PTY sunucusunda
     tek test seam'i: `KOKPIT_TEST_KABUK=1` → claude yerine düz pwsh (her gerçek claude
     açılışı transcript + hook tetiklerdi). 09-10'dan beri açık olan "arayüz testi
     otomatize değil" borcu kapandı.
  2. Kısayol kararı: Ctrl+V xterm'de `^V` olarak claude'a gider (Claude Code'un resim
     yapıştırması) — dokunulmadı. Ctrl+C **seçim varken** kopyalar, yokken `^C` (Windows
     Terminal davranışı). Ctrl+Shift+C/V, sağ tık yapıştır.
  3. Kapatma onayı yerel diyalog (`dialog.showMessageBox`), `window.confirm` değil. Çocuk
     süreç sorgusu yalnız kapatma anında (CIM, ~300 ms), asla yoklama yok. Uygulama
     kapanışı: main renderer'a sorar, 3 sn cevap gelmezse yine de kapanır.
  4. Windows toast için `app.setAppUserModelId` şart; verilmezse bildirim sessizce
     hiç görünmez. Tuzak README'ye yazıldı.
  5. Test koşucusunun ilk tuzağı: `Browser.close`'un cevabı beklenirse tarayıcı cevap
     veremeden kapanır, bekleyen promise olay döngüsünü boşaltır ve Node "TUMU GECTI"
     yazmadan 0 ile çıkar. Sessiz hata sınıfı #7.

### Faz 7: Süreklilik — Kokpit'in kendi hafızası
- **İşler:**
  1. `~/.kokpit/ayarlar.json`: pencere konumu/boyutu/maksimize, kenar çubuğu, yazı boyutu.
     Main yazar (renderer dosyaya dokunmaz), atomik yazım.
  2. `~/.kokpit/oturumlar.jsonl`: Kokpit'in açtığı her oturum — id, proje, yol, başlangıç,
     bitiş, çıkış kodu. PTY sunucusu değil main yazar (tek yazar).
  3. Açılışta: önceki çalışmada açık kalmış oturumlar (bitişsiz kayıtlar) varsa Terminaller
     boş durumunda "N oturum açıktı — geri yükle" → her klasörde `claude --continue`.
  4. Pano proje satırına "son oturum" (defterden: ne zaman, ne kadar sürdü).
- **Bitti Kriteri:** Kokpit kapatılıp açılınca pencere aynı yerde; iki açık oturumla
  kapatılıp açılınca geri yükleme teklif ediyor ve `--continue` konuşmayı geri getiriyor.
  ✅ (2026-09-21) — `test:ui` 19/19: oturum açıkken kapat → ikinci açılışta şerit "1 oturum
  açıktı" → Geri yükle sekmeyi açıyor → şerit kayboluyor; kapanan oturum Pano'da "son oturum".
  `--continue`'nun konuşmayı gerçekten getirmesi Scryne'ın gerçek kullanımında doğrulanacak
  (test kabuğu claude açmaz).
- **Notlar:**
  1. Defter (`electron/defter.cjs`) append-only JSONL, tek yazar main, son 2000 satır
     okunur. Çalışma kimliği (`calisma`) sayesinde "önceki çalışmada açık kalanlar"
     bulunur; teklif bir kez verilir, aynı anda `uygulama-kapandi` ile kapatılır.
  2. **Bulunan tuzak:** `app.quit` yolunda (`Browser.close`, Windows oturum kapatma)
     `before-quit` pencereden **önce** çalışıyor → PTY sunucusu ölüyor → renderer hâlâ
     hayattayken her kabuk için "bitti" görüp defteri `kabuk` ile kapatıyordu → geri
     yükleme teklifi kayboluyordu. X ile kapatmada sıra ters (pencere önce). Main artık
     kapanış sırasında gelen `kabuk` kapanışlarını yok sayıyor.
  3. Pencere konumu ekran dışında kaldıysa (monitör söküldü) yok sayılır; maksimize ayrı.

### Faz 8: Beyin senkronu + Sağlık sayfası
- **Bulgu (2026-09-20):** `~/.claude/projects/` altında 10 günde 20 ScryneQuant oturumu var,
  `daily/`'de vault dışı hiç oturum yok. Proje `session-end.ps1` yalnız `state.json` +
  Roadmap'i güncelliyor, vault `flush.py`'ını çağırmıyor. **Kokpit'ten açılsa da açılmasa da
  proje oturumları beyne girmiyor.** Bilgi tabanının ScryneQuant'ı "Faz 2'de" sanmasının
  kaynağı bu.
- **İşler:**
  1. Vault: `flush.py --proje <ad>` → günlük başlığı `### Oturum (HH:MM) — <ad>`.
     Proje `session-end.ps1`'leri (4 proje + `proje-baslat` şablonu) vault `lib.ps1`'deki
     `Start-BeyinFlush`'ı ayrık süreç olarak tetikler. Geriye dönük: düşmemiş son oturumlar
     bir kez toplu flush edilir.
  2. `durum.py`: `beyin.kapsama` — proje transcript'leri (son 8 gün) × flush durumu →
     düşmemiş oturum listesi; `beyin.son_vault_oturumu_gun`.
  3. **Sağlık sayfası** (Kokpit): boru zinciri (log → flush → derleyici → bilgi tabanı) tek
     satır durumla; düşmemiş oturumlar (proje etiketli); hook hatası; 7 günlük bütçe çubuğu
     (yeni girdi / çıktı / cache ayrı — `dataviz` kurallarıyla); açık thread'ler (Status +
     İzle satırı); **"Aria ile konuş"** (vault'ta claude aç; "son vault oturumu N gün önce").
  4. Kapanan sekmede "beyne düştü ✓ / bekliyor / düşmedi": oturum defterindeki başlangıç →
     `~/.claude/projects/<slug>/` altında o andan sonra doğan transcript → flush state.
  5. **İlk dar yazma:** Ctrl+Shift+N → küçük not kutusu → `📥 000-Inbox/Dump/` altına tarihli
     ekleme. Plan bunu "okuma penceresi oturduktan sonra" diye öngörmüştü; oturdu.
- **Bitti Kriteri:** Kokpit'ten açılıp `/exit` ile kapatılan bir ScryneQuant oturumu 3 dk
  içinde `daily/`'de proje etiketiyle görünüyor ve sekmede ✓ çıkıyor; Sağlık sayfası
  düşmemiş oturum sayısını `flush_kapsama.py` ile aynı veriyor.
  ✅ (2026-09-21) — Boru gerçek bir ScryneQuant transcript'iyle uçtan uca çalıştı:
  `proje-flush.ps1` → `flush.py --proje` → `daily/2026-09-21.md` `### Oturum (01:33) —
  ScryneQuant` (beyin projenin R2 turuna geçtiğini ilk kez buradan öğrendi). `durum.py`
  `beyin.kapsama` son 8 günde 11 oturumun 10'unu düşmemiş saydı (hepsi ScryneQuant);
  `flush_kapsama.py --proje ScryneQuant --doldur` ile 17 oturum geriye dönük dolduruldu.
  `test:ui` 27/27: Ctrl+3 Sağlık, 4 halkalı zincir, bütçe grafiği, Aria düğmesi, Pano'da
  beyin kaydı, Ctrl+Shift+N notu Inbox dosyasına **sona** ekleniyor. Sekmede ✓'nin gerçek
  claude oturumuyla görünmesi Scryne'ın kullanımında doğrulanacak (test kabuğu claude açmaz).
- **Notlar:**
  1. Vault tarafı: `.claude/hooks/proje-flush.ps1` (lib.ps1 dot-source edilmez — yüklenirken
     proje klasörüne `.state` açıyor), 4 proje + `proje-baslat` şablonu hook'una 6 satır.
     `flush.py --proje` başlığa ` — <ad>` ekler ve istemde projeyi söyler.
  2. Kokpit `electron/beyin.cjs`: defterdeki başlangıç → o andan sonra doğan transcript →
     `flush-<sha256>.json`. Durumlar: düştü / düşüyor… / düşmedi / kısa / hata / transcript
     yok. "Düşüyor…" varken 30 sn'de bir yeniden bakılır, yoksa yoklama yok.
  3. **Vault'a ilk ve tek yazma:** `not.cjs` yalnız `📥 000-Inbox/Dump/YYYY-MM-DD.md`, yalnız
     sona ekleme. README kuralı "v1 yazmaz" → "v2 yalnız Inbox'a ekler".
  4. Bütçe grafiği paleti `dataviz` doğrulayıcısıyla koyu yüzeyde test edildi: aksan
     `#8b5cf6` + teal `#0d9488` (ilk denenen üç açık teal/mavi lightness bandını geçemedi).
  5. Test tuzağı: `toISOString()` UTC günü verir, Inbox dosyası yerel günle açılır — gece
     yarısından sonra test yanlış dosyaya baktı. Yerel tarih kullanılıyor.

### Faz 9: Envanter sayfası
- **İşler:** global/vault/proje skill'leri, MCP'ler, drift (kayıtsız/hayalet), bütçe tipi
  (oturum vs hook artığı), öksüz transcript dizinleri. Veri `durum.py --json`'da hazır.
- **Bitti Kriteri:** `/durum` skill'inin envanter tablosuyla aynı sayılar Kokpit'te.
  ✅ (2026-09-21) — Ctrl+4. Drift en üstte (tek "müdahale" bilgisi; yoksa sakin), skill/MCP
  çipleri, transcript hijyeni (oturum vs hook artığı yeni girdi, hook payı ≥%20 uyarı,
  öksüz dizinler). `Durum` tipleri artık `envanter`/`butce` için gerçek şema (`unknown`
  değil). `test:ui` 29/29.

### Faz 10: Kimlik ve cila
- **İşler:** özel uygulama ikonu (SVG → çok boyutlu PNG → `.ico`; pencere, görev çubuğu,
  kısayol); pencere başlığı "Kokpit — <aktif proje>"; `fixing-accessibility` +
  `fixing-motion-performance` yeni yüzeylerde; `ux-writing` ile diyalog/bildirim metinleri;
  README ve DESIGN.md.
- **Bitti Kriteri:** görev çubuğunda Electron atomu değil Kokpit ikonu; pasların bulgu listesi
  boş; README yeni kısayolları ve dosyaları anlatıyor.
  ✅ (2026-09-21) — `public/kokpit.svg` (ölçek yayı + ibre) → `npm run ikon` → `.ico`
  (16–256) + `.png`; pencere ve başlat menüsü kısayolu ikonu kullanıyor. Pencere başlığı
  "Kokpit — <proje>", dikkat bekleyen varsa "(N)". Yeni yüzeylerde a11y pası: grafiğe
  `sr-only` veri tablosu, dialog yerel, alert/status rolleri; motion: yeni animasyon yok,
  dikkat halkası statik. README (sayfalar, kısayollar, süreklilik, beyin borusu, test:ui)
  ve DESIGN.md (Sayfalar bölümü) güncel; `design:lint` 0/0; `test:ui` 29/29.
- **Notlar:** İkon üretiminde ilk yol (`offscreen` + `transparent` + `capturePage`) bu
  makinede hiç dönmedi (90 sn); renderer'da `<canvas>` + `toDataURL` anında çalıştı.

---

**v2 kapanışı (2026-09-21):** Faz 6–10 tek oturumda kapandı; 8 commit. Kalan doğrulamalar
Scryne'ın gerçek kullanımına bağlı (test kabuğu claude açmaz): geri yüklemede `--continue`
konuşmayı getiriyor mu, canlı claude'u kapatırken diyalog çıkıyor mu, bir gerçek oturumdan
sonra sekmede "beyne düştü ✓" görünüyor mu. Bunlar görülünce v2.1 listesi ondan çıkar.


---

### Bakım: denetim 2026-09-29 (v2.1)

v2 kapanışında "gerçek kullanımla doğrulanacak" denen üç maddeden ikisi bu denetimde
**kusurlu** çıktı. Kanıt gerçek kullanımdan: 09-29 vault oturumu `01baf5c3` Kokpit'te sekme
kapatılırken claude çalışır hâldeydi (transcript'in son yazımı PTY öldürülmesinden 27 ms
sonra), SessionEnd çalışmadı, oturum beyne düşmedi (Sağlık sayfası "flush yok").

- **Güvenli kapatma** (✅): PTY'yi öldürmek SessionEnd'i çalıştırmıyor (gerçek claude 2.1.284
  ile ölçüldü). Yeni varsayılan: Esc + Ctrl+C ×2, kendi kapanmasını 90 sn'ye kadar bekle.
  Boşta / yarım yazılmış / meşgul claude'da SessionEnd tamamlandı. Diyalog: Güvenli kapat ·
  Zorla kapat · Vazgeç.
- **Uygulama kapanışı** (✅): main'in 3 sn bekçisi cevabı değil soruyu bekliyordu — kullanıcı
  3 sn içinde karar vermezse ya da "Vazgeç" derse pencere yine kapanıp claude'u öldürüyordu.
  Artık renderer soruyu aldığını bildirir, main kararı bekler. `before-quit` pencereden önce
  gelirse (CDP, Windows oturum kapatma) PTY sunucusu öldürülmez, pencerenin korumasına döner.
- **Süreç sorgusu fail-open** (✅): sorgu hatası/zaman aşımı "süreç yok" sayılıp onaysız
  kapatıyordu → artık "bilinmiyor", yine sorulur. İstekler kimlikli (üst üste soru karışmıyor).
- **"Beyne düştü" satırı** (✅): `bitti` mesajından sonra soket kapanınca ikinci 'bitti'
  mesaj satırını siliyordu; rozet hiç görünmüyordu.
- **Defter süresi** (✅): uygulama kapanışıyla biten oturumun bitişi bir sonraki açılış anı
  yazılıyordu ("152 sa"). Artık çalışmanın `calisma-bitti` anı; bilinmiyorsa süre gösterilmez.
- Diğer (✅): tek örnek kilidi; `setWindowOpenHandler` deny; `klasor:ac` yalnız klasör;
  PTY token sabit zamanlı; zaman aşımına düşen PTY sunucusu öldürülüyor; log devri (2 MB);
  `donduruldu` aşaması (ikon, "aktif" sayılmıyor); proje sırası (çalışılanlar üstte, tablo da
  sıralı); roadmap başlığında `**`; Sağlık'ta bozuk geri doldurma komutu ve "undefined dosya";
  "son oturum" takvim günüyle ve oturum yokken de tazeleniyor; async kapatma akışı bayat
  listeyle state ezmiyor.
- Testler: `test:pty` 13/13 (çocuk sorgusu + güvenli çıkış eklendi, CI'da koşar), `test:ui`
  31/31 (sekmede ve uygulama kapanışında güvenli kapatma; `KOKPIT_TEST_SECIM` dikişi).

### v2.1 özellikleri (2026-09-29, Scryne: "iyi olacağını düşündüğün her şeyi ekle")

Denetimde önerilen altı madde, her biri ölçülerek eklendi:

- **Sağlık nöbeti görünür** (✅): `durum.py` `saglik` alanını (CI, Dependabot, AI modelleri,
  alarmlar) zaten veriyordu, Kokpit okumuyordu. Sağlık'ta tablo + alarm listesi; nöbet 8
  günden eskiyse uyarı. Pano'da alarm varken tek şerit; kenar rozeti düşmemiş + alarm.
- **Proje grupları** (✅): Aktif / Kullanımda / Arşiv, `Proje-Envanteri.md` durumundan
  (`durum.py` `envanter`). Arşiv varsayılan kapalı ve kalıcı (`ayarlar.json` `arsivAcik`).
  15 satırın 12'si arşivde; günlük görünüm 3 proje.
- **Geri doldur** (✅): Sağlık'taki her düşmemiş satırda düğme. Vault'a yeni
  `flush_kapsama.py --oturum <id>`: yalnız o oturum, son 30 dk'daki transcript reddedilir
  (açık oturum), Kokpit'te o klasörde açık oturum varken düğme kapalı, main'de tek sıralı
  kuyruk. `--doldur` bilerek kullanılmadı: dizindeki açık oturumları da doldururdu. Gerçek
  kanıt: 09-29 kaybolan `01baf5c3` bu düğmeyle `ok:appended`, 23 sn.
- **Bağlam göstergesi** (✅): terminal başlığında "bağlam 369k" (son tur input + cache yazma +
  cache okuma), transcript'in son 512 KB'ı, 20 sn'de bir, ~3 ms.
- **Komut paleti** (✅): Ctrl+Shift+P (Ctrl+K claude'da satır siler). Sayfa, proje aç/git,
  vault, geri yükle, not, tazele, kenar, arşiv, klasör. Combobox + listbox, çok kelimeli arama.
- **Her yerden Inbox notu** (✅): genel kısayol Ctrl+Alt+Shift+N (Türkçe klavyede Ctrl+Alt =
  AltGr). Kayıt başarısızsa loglanır, Kokpit çalışmaya devam eder.
- **Bağımlılık yamaları** (✅): Electron 44.3.0 → 44.4.5 (Chromium güvenlik yamaları), vite,
  ws, lucide-react, @types/ws. `allowScripts` onayı sürüme bağlı, güncellendi; binary mirror'dan.
- **Görsel düzeltme:** palet ve not kutusu yarı saydam yüzeydeydi, arkadaki tablo metni
  içinden okunuyordu → opak taban.
- Testler: `test:pty` 13/13, `test:ui` 37/37 (arşiv aç/kapa, palet, kısayol kaydı eklendi).

### v2.2 (2026-10-03): Gümüş cam, kanca köprüsü, Ada

**Neden:** Scryne Coucou'yu (Louis-CFM/coucou, notch'ta yaşayan ajan izleyici) sordu,
"entegre mi edelim, kendimiz mi yapalım" dedi ve sonra işi tamamen bıraktı ("profesyonel ve
eşsiz bir iş çıkar"). Coucou doğrudan alınmadı: Windows sürümü Tauri/Rust ve kurulum dosyası
Defender yüzünden geri çekilmiş; hook'larını global `settings.json`'a yazıyor (Scryne'ın
flush zincirine ikinci yazar); asıl özelliği izin onayı, Scryne `bypassPermissions` modunda.
Alınan üç fikir: oturumun o an ne yaptığı, arka planda küçük bir yüzey, limit göstergesi.

- **Faz 11, Gümüş cam** (✅): bkz. DESIGN.md "Şeffaflık". Dört yön önizleme sayfasında sunuldu,
  Scryne gümüş camı ve "ekstra şeffaf"ı seçti. 09-10'da geri alınan akrilik, zemin tonunun
  alfası ölçülerek geri geldi (0.45'te soluk metin 3.26:1 kalıyordu, 0.65'te 4.74:1).
- **Faz 12, Kanca köprüsü** (✅): önce spike (gerçek etkileşimli claude, node-pty):
  `--settings` ile verilen hook'lar projeninkilerle **birleşiyor** (proje SessionStart ve
  SessionEnd yine çalıştı), HTTP hook başlığındaki `$KOKPIT_OTURUM` `allowedEnvVars` ile
  doğru açılıyor, **SessionStart HTTP hook'u gelmiyor** (ilk olay UserPromptSubmit),
  statusline girdisinde `rate_limits` var. Uygulama: `electron/kanca.cjs` (127.0.0.1 rastgele
  port, token, Kokpit süreci başına `~/.kokpit/kanca/ayar-<pid>.json`), `electron/etkinlik.cjs`
  (saf durum makinesi), PTY her oturuma `KOKPIT_OTURUM` verir, claude `--settings` ile açılır.
  Kokpit kapalıyken hook bağlanamaz, claude bunu bloklamayan hata sayar.
- **Faz 13, Etkinlik şeridi** (✅): bölme başına tek satır (durum, son araç + dosya + `+N −M`,
  tur süresi, oturum özeti); tıklayınca son 30 araç. Zil artık sebebini biliyor: Stop =
  "bitti", AskUserQuestion / izin / elicitation = "seni bekliyor" (cevaplanana kadar amber;
  bakmak soruyu cevaplamaz). Kanca o oturumu görüyorsa xterm zili yok sayılır (çift rozet
  olmasın). Kapanan oturumun özeti defterde kalır, Pano'da "son oturum … · 6 dosya +210 −40".
- **Faz 14, Limit ve bağlam** (✅): Kokpit oturumlarında statusline `electron/durum-satiri.cjs`;
  girdiyi Kokpit'e iletir (300 ms sınırı) ve Scryne'ın kendi statusline komutunu aynı girdiyle
  çalıştırıp çıktısını aynen basar. Kenarda 5 saat / hafta ölçerleri (≥ %80 amber, ≥ %95
  kırmızı). Bağlam göstergesi statusline'dan (her tur, yüzdeyle); yoksa eski transcript yoklaması.
- **Faz 15, Ada** (✅): `electron/ada.cjs`, saydam, hep üstte, odak çalmayan pencere; yalnız
  Kokpit odakta değilken ve oturum varken görünür. Kapalıyken tek satır (en önemli tek şey),
  üstüne gelince ya da bir oturum "bitti/seni bekliyor" deyince 5 sn açılır. Tıklama Kokpit'i
  o sekmeyle öne getirir. Komut paletinden kapatılır (`ayarlar.json` `ada`).
- **Testler:** `test:kanca` 39 kontrol (durum makinesi gerçek payload şekilleriyle, alıcı,
  statusline köprüsü, Kokpit kapalıyken takılmama; CI'da). Mutasyon sınaması 8/8 bozuk
  sürümü yakaladı; ilk turda fark sayımı mutasyonu kaçtı (test verisinde bağlam ve ekleme
  satırı sayısı eşitti), veri asimetrik yapıldı. `e2e:kanca` gerçek claude ile 10/10 (elle;
  plan kullanır). `test:ui` 43 kontrol (oturumun içinden hook taklidiyle şerit, rozet, akış,
  defter özeti). Test koşucuları `--disable-backgrounding-occluded-windows` ile açılıyor:
  pencerenin üstü kapalıyken Chromium kare üretmiyor, ölçüm isteyen bütçe grafiği hiç
  çizilmiyordu (ölçüldü: `visibilityState hidden`, rAF tetiklenmiyor).

### v2.3 (2026-10-04): Vibe kokpit — cevap, çalıştır, sürdür

**Neden:** Scryne "bilgisayarımı vibe coding sistemine çevirmek; tüm yetki sende" dedi. İşe kanıtla
başlandı: son 30 günün 727 insan prompt'u (`~/.claude/history.jsonl`, keşif ajanı) tarandı. Üç sürtünme
öne çıktı: **"kaldığımız yerden devam / neredeyiz / ne kaldı" ~70** · **tek kelimelik cevaplar
("devam et" 10 kez birebir, "tamam/onaylıyorum" ~90)** · **"nasıl çalıştırırım" 29** (Kokpit'in
kendisi 7 kez elle `! cd … && npm start` ile açılmış). Fazlar bunlara karşılık; aynı gün iki global
skill de yazıldı (`devam`, `calistir`, bkz. vault `Calisma-Sistemleri.md`).

- **Faz 16, Oturuma yazma + hızlı komutlar** (✅): `OturumApi.yaz` (klavyeden yazılmış gibi PTY'ye),
  etkinlik şeridinin sağ ucunda ⚡ menüsü (menü deseni: oklar, Esc odağı geri verir), palette
  "Gönder" grubu. Komutlar `~/.kokpit/komutlar.json` (yoksa varsayılanla oluşur, Scryne düzenler):
  Devam et · Neredeyiz? · Sen karar ver · Doğrula · Commit · Özetle. Mesaj ve Enter ayrı gider
  (~350 ms): aynı pakette Enter yapıştırmanın parçası sayılıyor (e2e'de de böyle).
- **Faz 17, Ada'dan cevap** (✅): sıra sende olan oturumun altında (bitti / seni bekliyor) seçenekler,
  çipler ve yanıt kutusu. **Spike (gerçek claude 2.1.289, docs yazmıyor):** AskUserQuestion'da
  seçenek rakamı seçip GÖNDERİR (Enter yok); serbest cevap N+1 ("Type something") rakamı + metin +
  Enter; N+2 "Chat about this". Çok soru / çoklu seçim sekmeli bir akış: oradan cevap verilmez,
  terminale yönlendirilir. Cevap `damga` (sorunun `degisti` anı) taşır; soru o arada değiştiyse rakam
  gönderilmez (başka ekranda başka şey seçerdi). Ada `focusable: false`; yanıt kutusuna tıklanınca
  geçici odak alır. **Ctrl+Alt+Shift+K** Kokpit'i çağırır / küçültür.
- **Faz 18, Çalıştır** (✅): `electron/calistir.cjs` tarif (önce `~/.kokpit/calistir.json`, sonra
  package.json `dev` > `start`; Python'da tahmin yok, bir kez sorulur). Servis bölmesi claude'un
  yanında (o projede açık sekme varsa içine bölme). `electron/adres.cjs` ANSI'yi soyup yerel adresi
  yakalar (Vite port rakamını renk kodları arasına koyuyor). Kapatınca **süreç ağacı** `taskkill /T`
  ile ölür. Servis deftere, ada'ya ve kapatma onayına girmez.
- **Faz 19, Oturum kimliği + Sürdür** (✅): kimlik Kokpit'te doğar (`crypto.randomUUID`, `claude
  --session-id`), defterde kalır; geri yükleme ve Pano'daki "Sürdür" `claude --resume <kimlik>`.
  Spike: `--resume` aynı transcript dosyasına devam ediyor ve konuşmayı hatırlıyor. `beyin.cjs`
  kimlik varsa tahmin yerine o dosyaya bakar (sürdürülen konuşmanın dosyası eskiden doğduğu için
  doğum zamanı sezgisi onu hiç bulamıyordu).
- **Bulgular (her biri ölçülerek düzeltildi):**
  1. **Test koşucusu gerçek veriyi bozuyordu.** Scryne'ın açık Kokpit'i varken test örneği aynı
     `~/.kokpit`'i kullanıyor, onun açık oturumunu "önceki çalışmadan kalan" sanıp deftere sahte
     "kapandı" yazıyordu (bir satır, elle geri alındı); koşucunun sondaki yedekten geri yazması da o
     arada yazılanı ezebilirdi. Artık `KOKPIT_DIZIN` (config.cjs) ile her koşu geçici dizinde;
     Chromium profili de ayrı. Gerçek defter/ayar hash'i test öncesi ve sonrası aynı.
  2. **Electron çıkarken PTY sunucusunu da götürüyordu**, sunucunun çıkışta yaptığı ağaç öldürme
     yarıda kalıyordu (log "çıkılıyor"da kesik). `before-quit` artık sunucunun kendi çıkmasını bekliyor
     (`durdurBekle`, en fazla 6 sn).
  3. **Senkron taskkill (~1 sn) sunucunun olay döngüsünü durduruyordu**: o arada tüm terminallerin
     çıktısı donuyordu. Bölme kapanışında asenkron; çıkışta senkron kalıyor.
  4. **Mutasyon testi** (15 bozuk sürüm, 15'i yakalandı): ilk turda "yalnız kabuğu öldür" mutasyonu
     kaçtı — ConPTY kapanınca konsola bağlı süreçler zaten ölüyor; hayalet port konsoldan **kopuk**
     süreçtir. Test torunu `detached` yapıldı, mutasyon yakalandı. UI mutasyonlarının ilk turu
     "kaçtı" çıktı çünkü derleme bir tip hatasıyla düşmüş, `dist` eski kalmıştı: `test:ui` artık
     kaynak `dist`'ten yeniyse koşmayı reddediyor.
- **Testler:** `test:kanca` 71 (39'dan; soru ayrıntısı, komut şeması, adres, tarif, kimlik),
  `test:pty` 18 (13'ten; servis, ANSI'li adres, kopuk torunla ağaç ölümü, port boşalması, çok satırlı
  komut reddi), `test:ui` 65 (43'ten; hızlı komut kabukta yan etkisiyle, ada yolu rakamı kabuğa,
  bayat damga reddi, servis bölmesi/yeniden başlat/durdur, kimlik zinciri), `e2e:kanca` 11 (gerçek
  claude `--session-id`). `npm run ekran:ada` (scripts/ekran-ada.cjs) ada + terminal + Pano görüntüsü.

### v2.4 (2026-10-04): Ada — tam cevap

**Neden:** Scryne "Ada'yı daha çok geliştir, tamamen sana bırakıyorum" dedi. Kanıtla başlandı: son 30 günün
transcript'lerinde claude 60 soru sormuş, **22'si (%37) çok sorulu** (20'si tamamen tekli seçim), 2'si çoklu
seçim — v2.3 Ada'sı çok soruluyu terminale yolluyordu. Ada "bitti" deyince claude'un ne dediğini göstermiyordu;
cevap vermek için yine Kokpit'e geçmek gerekiyordu. Tek monitör (1536×864): çoklu ekran kapsam dışı.

- **Spike (gerçek claude 2.1.289, PTY + headless xterm, Haiku):** Stop hook'unda `last_assistant_message`
  var (ayrıca `background_tasks`, `session_crons`). Çok sorulu form: rakam seçer ve **sonraki soruya geçer**;
  N+1 + metin + Enter serbest cevabı yazıp geçer; son sorudan sonra "Review your answers" ekranı, orada
  **1 = Submit answers**. Dizi PreToolUse + 800 ms'den sonra 250 ms aralıkla doğru gitti (`Köpek` + serbest
  metin); formdan önce giden tuşlar girdi kutusuna düşüyor (spike'ta kendi hatamla görüldü).
- **Faz 20, çok sorulu cevap** (✅): `soruAyrintisi` artık `sorular[]` (en fazla 4); çoklu seçim ya da
  seçeneksiz soru varsa terminale. İstek biçimi `tur: 'cevap', cevaplar: (sıra | metin)[]`, bayat damga
  reddi aynen; tuşlar 350 ms aralıkla ve **her tuştan önce** soru hâlâ aynı mı bakılır. Aynı oturuma üst üste
  iki dizi binemez. Biçim denetimi `electron/gonder-istegi.cjs`'e taşındı (test edilebilir).
- **Faz 21, son söz / Gördüm / bekleme** (✅): `sonSoz` bellekte (yeni turda silinir, alt ajanın Stop'u
  yazmaz, 4000 sınırı, `__init__` gibi adlar bozulmaz). Bildirim gövdesinde başı. "Gördüm" yalnız dikkat
  rozetini düşürür ("seni bekliyor" düşmez). Soru düğmelerinin hazır olma zamanı saniyelik saate bağlıydı
  (800 ms yerine 1,8 sn'ye kadar kapalı kalabiliyordu; test kararsızlığı olarak göründü) → kendi zamanlayıcısı.
- **Faz 22, klavye** (✅): Ctrl+Alt+Shift+A. **Ölçüm** (gerçek tuş olayı `keybd_event` + Win32 ön plan
  okuması, izole Kokpit örneği): kısayoldan ~110 ms sonra ön planda "Kokpit Ada", ilk eylem odakta.
  Kısayolsuz `focus()` Windows ön plan kilidine takılıyor (Ada odakta sanıyor, tuşlar önceki pencereye
  gidiyor) — klavye yolu bu yüzden yalnız genel kısayoldan açılır. Bırakma: `blur()` → **Kokpit'in ana
  penceresi öne geliyordu**; ana pencere geçici `setFocusable(false)` + `blur()`/`hide()` → hiçbir pencere etkin
  değil; `minimize()` (saydam) + `showInactive()` → Windows'un son kullanıcı girdisiyle etkinleşen penceresi.
  Sonuncusu seçildi. Sayfa başlığı pencere başlığını eziyordu ("Kokpit"); Ada artık "Kokpit Ada".
- **Bakım, kapanış hatası (v2.2'den beri):** ana pencere kapanınca Ada penceresi yaşadığı için
  `window-all-closed` hiç gelmiyordu; süreç (PTY sunucusu, servisler, genel kısayollar) arka planda kalıyor,
  sonraki `kokpit` tek örnek kilidine takılıp boş pencereyi öne getirmeye çalışıyordu. Gerçek logda Ada'lı
  hiçbir çalışmada "tüm pencereler kapandı" satırı yok. Test koşucuları Ada'yı kurmadığı için görülmedi;
  `test:ui` artık Ada'yı kurup ayrı CDP hedefi olarak sürüyor ve iki kapanış kontrolü bunu yakaladı.
- **Testler:** `test:kanca` 89 (71'den; çok soru, son söz, istek biçimi), `test:ui` 81 (65'ten; Ada penceresi
  ayrı CDP hedefi: iki soruluk form → kabuğa "23" + Review "1", son söz, Gördüm → rozet, rakam tuşu, odak
  bırakma), `test:pty` 18. İki kez üst üste yeşil. **Mutasyon 7/7 yakalandı** (yeni tur son sözü silmiyor,
  çoklu seçim cevaplanabilir, boş metin kabul, Review "1"i yok, serbest metin rakamı N, ana pencere kapanınca
  çıkmıyor, Gördüm etkisiz). Gerçek `~/.kokpit` (ayarlar, defter, komutlar) tüm koşular boyunca değişmedi
  (`parmakizi.py`). `ekran:ada` → `kokpit-v24-ada{,-klavye,-bitti}.png`.
- **Kontrol edilemeyen:** Kokpit'in kendisinden gerçek claude'a çok sorulu cevap (tuşlar ve aralık gerçek
  claude ile spike'ta ölçüldü, Kokpit yolu test kabuğunda); Esc sonrası odağın Scryne'ın kısayola bastığı
  pencereye dönmesi (ölçümde Windows "son gerçek girdiyle etkinleşen" pencereyi seçti; sentetik girdiyle
  o pencere test penceresi olamadı) — canlı kullanımda görülecek.

### v2.5 (2026-10-04): Ada'nın gözü

**Neden:** Scryne "görsel olarak daha çok eklenebilir mi, pet tarzında" dedi. Araştırma (Sonnet, birincil
kaynaklar): Coucou, Clawd on Desk, Notch Pilot, Notch-Agent, Notchi, Codex pets, RunCat, PILLAR. Ortak kalıp
hook → durum → küçük üstte pencerede animasyon; asıl risk performans (Electron'da sürekli atan tek nokta
%14–17 renderer CPU, Kiro #13729). Clawd Anthropic markası, kullanılmaz. Dört yön canlı önizlemede sunuldu
(claude.ai artifact), Scryne **gümüş göz**ü seçti ve "her şeyi ekle" dedi.

- **Spike (gerçek claude 2.1.289, Haiku):** `SubagentStart`/`SubagentStop` geliyor, `agent_id` + `agent_type`
  taşıyor; alt ajanın araçları da `agent_id` taşıyor; ana tur `Stop` dedikten **sonra** alt ajan arka planda
  sürüyor (sonra ana tur bir kez daha `Stop` diyor).
- **Bulgu ve düzeltme — soru damgası:** ada'dan cevabın damgası `degisti` idi; soru açıkken arka plan alt
  ajanının her aracı ve 60 sn sonraki `idle_prompt` bu alanı değiştiriyordu → yarım seçilen cevaplar
  sıfırlanıyor, cevap "soru değişti" diye reddediliyordu. Artık `soruZamani` (yalnız yeni bekleyişte doğar)
  ve `durumZamani` ("ne zamandır bekliyor"). `altlar` (15 dk sessizlikte düşer), köprüye iki olay eklendi.
- **Faz 23, göz** (✅): `AdaGoz.tsx`. Hal: boşta, çalışıyor (bakış araca göre: düşün/oku/yaz/komut/web/ajan),
  bekliyor (amber halka, büyüyen gözler), mutlu (bitince 8 sn, tek zıplama), bitti (sakin), uyku (30 dk).
  Alt ajan noktaları, cevapta baş sallama, imleç takibi, kırpma. Hapın kenarı 5 saatlik limit (%80 amber).
  Ekran koşucusu `npm run ekran:goz` her hali çekti; "düşünüyor"da metin boş çıktı: hap metninin anahtarı
  sayan süreyi içerdiği için metin her saniye yeniden doğuyordu (sayılar anahtar dışı).
- **Faz 24, hareket bütçesi** (✅): izole örnek, Ada gerçekten görünür (önde başka pencere), süreç başına CPU
  + `GPU Engine` sayacı, 30–45 sn pencereler. Tek çekirdek yüzdesi:

  | Sürüm | Boşta | Çalışıyor/Read |
  | --- | --- | --- |
  | İlk (akıcı sonsuz CSS + 60 fps nabız) | 1,7 | 36,3 |
  | `steps()` | 1,8 | 11,7 |
  | + ana pencere arka planda duruyor | 1,5–2,5 | 6,5–9,5 (göz payı ~5) |
  | Sonsuz animasyon yok, 480 ms zamanlayıcı | 2,1–2,5 (göz durgun) | 2,3–2,9 (göz canlı) |

  Öğrenilen: maliyet adım sayısından değil, **çalışan bir sonsuz animasyonun varlığından** geliyor (compositor
  60 fps'te kalıyor, saydam/akrilik pencere her karede birleşiyor). `steps()` yetmedi; 70 ms'lik geçiş bile
  ölçülebilirdi. `document.hasFocus()` CDP'nin sürdüğü sayfada OS odağını yansıtmadı; arka plan bilgisi main
  süreçteki pencere `blur`'undan geliyor (Ada'nın görünürlüğüyle aynı kaynak).
- **Testler:** `test:kanca` 101 (89'dan; alt ajanlar, damga kararlılığı, köprü olayları), `test:ui` 84 (81'den;
  gözün hali, bakışı ve alt ajan noktası DOM'dan), `test:pty` 18.

### v2.6 (2026-10-04): Ada, masaüstü ajanı

**Neden:** Scryne: "5 saatlik ve haftalık limit sürekli gözüksün, terminal başlatmadan da; Ada sürekli açık olsun,
Kokpit'ten oturum açmadan da gözüksün; benim masaüstü ajanım olsun, bilgisayarımı vibe coding sistemine çevirme
isteğimi daha iyi benimsesin. Ekstra şeyler de ekleyebilirsin."

- **Spike (gerçek uç, 2026-10-04):** `GET api.anthropic.com/api/oauth/usage` + `anthropic-beta: oauth-2025-04-20`,
  token `~/.claude/.credentials.json` → 200, `five_hour`/`seven_day` (`utilization`, `resets_at`); Claude Code'un
  `/usage` ekranının kaynağı. Erişim tokeni ~8 saat yaşıyor. Claude Code her etkileşimli oturumu
  `~/.claude/sessions/<pid>.json`'a yazıyor (cwd, sessionId, status, statusUpdatedAt, kind); `status` şeması ikili
  dosyada `busy | shell | idle | waiting`. pwsh 7.6, `PSNativeCommandArgumentPassing = Windows`; claude yerel exe.
- **Faz 25, oturumsuz limitler** (✅): `electron/limit.cjs`, 5 dk yoklama (hata/429'da 30 dk'ya kadar ikiye katlanır,
  uykudan dönünce bir kez), elle tazele (30 sn sınırlı). Token her yoklamada okunur, yalnız main'de; **yenilenmez**
  (refresh token döndürmek Claude Code'un kopyasını geçersiz kılabilir) → süresi dolunca istek yok, son ölçüm
  "claude açılınca tazelenir". Kanca köprüsünün limitleriyle birleşir: yeni olan kazanır, eksik alan eskiden kalır.
- **Faz 26, hep açık + tepsi** (✅): `adaHep` (varsayılan açık): Ada oturum yokken ve Kokpit öndeyken de görünür.
  Tepsi: X tepsiye indirir (ilk seferde balon), çıkış tepsi/palet; Windows oturum kapanırken (`session-end`) normal
  çıkış. `HKCU\...\Run` → `wscript kokpit-sessiz.vbs --arka` (vbs ve `uretim.cjs` argümanı geçirir); ilk çalışmada
  açılır, tepsiden kapatılır. `--arka`'da pencere hiç gösterilmez; Ada'ya "arka planda" bilgisi elle verilir.
- **Faz 27, Kokpit dışındaki oturumlar** (✅): `electron/dis-oturumlar.cjs`; Ada görünürken 4 sn'de bir, değişince
  yayın. Kokpit'in kendi oturumları `--session-id` kimliğinden, `claude -p` (hook özetleyicileri) `kind`'dan, ölü
  pid'ler `process.kill(pid, 0)`'dan ayıklanır. Dış oturum beklemeye geçince Ada 5 sn açılır, göz amber.
- **Faz 28, Ada'dan görev** (✅): proje çipi + metin → main (hedef yalnız ana pencerenin verdiği listeden, adla) →
  ana pencere `sekmeAc(..., { gorev, arkaPlan: true })` (görünüm/aktif sekme değişmez) → pty-server
  `electron/gorev.cjs`: metin `KOKPIT_GOREV` ortam değişkeniyle, `$g = $env:KOKPIT_GOREV; Remove-Item
  Env:KOKPIT_GOREV; claude ... $g`. Komut satırına hiç yazılmaz; `-` ile başlarsa önüne boşluk.
- **Bulgular:** (1) renderer'dan `window.close()` BrowserWindow'un `close` olayını atlıyor — X'i test etmek için Win32
  `WM_CLOSE`; (2) hiç gösterilmemiş pencerede `visibilityState` "visible" — görünürlük testi `IsWindowVisible` ile
  (mutasyonla yakalandı); (3) `test:pty` gerçek `~/.kokpit/pty-server.log`'a yazıyordu (parmakizi) → geçici dizin.
- **Testler:** yeni `test:ada` 35 (limit ayrıştırma + sahte uçla yoklama: 401/500/süresi dolmuş/yok token, diske
  tokensiz yazım; birleştirme; dış oturum süzgeci; görev metni gerçek pwsh → yerel exe dört zor örnekle birebir,
  ortam değişkeni sızmıyor), `test:ui` 110 (84'ten; oturumsuz Ada + limit + dış oturum + görev + tepsi), kanca 101,
  pty 18. **Mutasyon 14/14:** `test:ada` 10/10 (biri ilk koşuda kaçtı: 500 boş gövdeyle zaten "hata" çıkıyordu →
  500 artık geçerli görünen gövde taşıyor), UI 4/4 (Ada görünürlüğü, oturumsuz kart, arka plan görev, tepsi).
  Gerçek `~/.kokpit`, `~/.claude/.credentials.json`, `~/.claude/sessions` koşular boyunca değişmedi (parmakizi).
  `npm run ekran:ajan` → `kokpit-v26-{hap,hap-dis,kart,kart-proje}.png`.
- **Canlı:** `wscript kokpit-sessiz.vbs --arka` (açılış kaydının aynısı) → pencere gizli, Ada üstte; gerçek uç 5s %41 ·
  hafta %96; bu konuşmanın terminal oturumu "ScryneOS çalışıyor · Kokpit dışında" olarak göründü; Run kaydı yazıldı.
- **Kontrol edilemeyen:** gerçek claude'a Ada'dan görev (haftalık limit %96'da, tur harcanmadı; argüman geçişi
  gerçek pwsh + yerel exe ile ölçüldü); bilgisayar yeniden başlayınca kaydın gerçekten çalışması (kayıt + aynı
  komut elle ölçüldü); tepsi balonunun görünmesi (ayar yazıldı, balon gözle görülmedi).

### v2.7 — Ada: saklanma (Faz 29–31, 2026-10-06)

**Neden:** Scryne: "Ada sürekli ekranda duruyor, YouTube izlerken orada kalıyor. Kalsın ama gizlemek için bir şey
ekle; en profesyonel ve eşsiz tasarımı yap, iyileştireceğin şeyler varsa onları da yap."

- **Spike (gerçek Win32, 2026-10-06):** Electron başka uygulamaların penceresini göremiyor; `user32` koffi ile
  (N-API, ön derlenmiş `@koromix/koffi-win32-x64`, derleyici yok). Çerçevesiz WinForms penceresi birincil ekranı
  kaplayınca `GetForegroundWindow` + `GetWindowRect` = `rcMonitor` → true, kapanınca false. Çağrı başına 7,6 µs
  (600 ms aralıkla ~%0,001 çekirdek). `SHQueryUserNotificationState` alınmadı: sistem geneli, ikinci ekrandaki
  tam ekranda da birincildeki Ada'yı gizlerdi.
- **Faz 29, kenara sakla** (✅): Ada üst kenarın arkasına çekilir, yalnız gümüş çenesi + gözlerin alt yarısı (30×8,
  tutma alanı kenara yapışık ve geniş). İmleç 380 ms durunca kart kenardan sarkar (üst köşeler düz), geçerse açılmaz;
  tık beklemeden açar. Saklıyken "bitti/seni bekliyor" kartı kendiliğinden açmaz, çene amber yanar. Kartta ⤒/⤓,
  tepside "Kenara sakla", Ctrl+Alt+Shift+G. `adaSakli` kalıcı.
- **Faz 30, sinema** (✅): `electron/tam-ekran.cjs` (karar saf `tamEkranMi`, Win32 okuması ayrı). Tam ekran = ön plan
  dikdörtgeni ekranı tam kaplar; büyütülmüş (`IsZoomed`; çerçevesiz uygulama otomatik gizli görev çubuğunda ekranı
  tam kaplar), kenarı taşan çerçeve, masaüstü (`Progman`/`WorkerW`), başka ekran sayılmaz. Sinemada pencere OS'ta
  gizli; bekleyen varsa (Kokpit ya da dış oturum) yalnız çene. Dış oturumlar sinemada da okunur (gizliyken de
  bekleyeni görmek için). Ctrl+Alt+Shift+A sinemada da Ada'yı getirir. Tepside "Tam ekranda çekil" (`adaTamEkran`).
- **Faz 31, yer** (✅): `electron/ada-yer.cjs` (saf). Hap başlıktan sürüklenir (5 px eşik), main pencereyi OS imleciyle
  taşır (pencere imlecin altında kaydığı için renderer koordinatı işe yaramaz), merkeze 28 px'te mıknatıs, oran olarak
  kalıcı (`adaKonum`, orta = null). Bırakmanın ürettiği tık yutulur. Tepside ortada değilse "Ada'yı ortala".
- **Bulgular:** (1) ilk "saklıyken kendiliğinden açılmaz" testi dış oturumu doğrudan "bekliyor" doğuruyordu;
  otomatik bakış yalnız *geçişte* tetiklendiği için bozuk kodu da geçirirdi → çalışıyor→bekliyor geçişi, kart geçiş
  boyunca izleniyor. (2) Windows odak kilidi, Scryne başka pencerede çalışırken test formunun öne geçmesini
  engelleyebiliyor → form kendini `AttachThreadInput` ile öne alır ve başardığını yazar; test bunu ve Kokpit'in
  "sinema" log satırını ön koşul sayar. (3) Form erken kapanınca `exit` beklemesi sonsuza kalıyordu → dinleyici spawn
  anında. (4) Sürükleme testi imlecin o anki yerinden 500 px sola gidiyordu; imleç soldayken 0'a kırpılıp düşüyordu →
  sabit noktalar + "imleç gerçekten orada mı" denetimi. (5) IsZoomed'i silen mutasyon kaçtı: test örneği zaten taşma
  kuralına takılıyordu → çerçevesiz büyütülmüş pencere örneği. (6) Mutasyon koşucusu: TaskStop arkadaki node'u
  öldürmedi, iki koşucu aynı dosyaları bozdu; zaman aşımı npm'i öldürüp `test-ui`'yi yetim bırakıyordu → kilit, çıkışta
  geri yükleme, süreç ağacı ölümü (sonuçlar bu düzeltmeden sonraki temiz koşulardan).
- **Testler:** `test:ada` 53 (35'ten; tam ekran kararı 8, yer 10), `test:ui` tümü geçti (v2.7 bölümü: sakla, sarkma,
  kalıcılık, saklıyken açılmama, gerçek tam ekranda sinema ± bekleyen, geri getir, normal kipte sinema, gerçek imleçle
  sürükleme + mıknatıs, sürükleme sonrası tık yutma + pozitif kontrol), kanca 101. **Mutasyon 8/8:** saklıyken bakış,
  sarkma gecikmesi, sinemada bekleyen, sinema yok, kalıcılık, tık yutma (UI); IsZoomed, mıknatıs (`test:ada`).
  Gerçek `~/.kokpit` koşular boyunca değişmedi. `npm run ekran:sakli` → `kokpit-v27-*.png` (çene açık/koyu zemin,
  bekleyen çene, sarkan kart, kartta sakla düğmesi).
- **Kontrol edilemeyen:** gerçek YouTube tam ekranı (aynı Win32 yolu WinForms tam ekranıyla ölçüldü; Chrome tam ekranı
  da ekranı kaplayan, büyütülmemiş pencere); gerçek fareyle sürüklemenin elde hissi; ikinci ekran (makinede tek ekran).
  Çalışan Kokpit eski sürüm: yeni main kodu Kokpit yeniden başlayınca gelir.

### v2.8 — Ada her yerde üstte, sekme ağacı, sürüm bekçisi (Faz 32–34, 2026-10-06)

Scryne: "Ada sürekli en üstte olsun, her uygulamada görünsün; şu an yalnız masaüstünde görünüyor. Sonra Kokpit ve
Ada'da iyileştirmek istediğin şeyleri profesyonelce yap."

- **Teşhis (Faz 32):** çalışan Kokpit'te Ada'nın `WS_EX_TOPMOST` bayrağı açık ama Windows z-sırasında Kokpit'in ana
  penceresi dahil normal pencerelerin altındaydı (EnumWindows sırası + ekran görüntüsü). `SetWindowPos(HWND_TOPMOST)`
  elle basılınca hemen üstte. Electron'un kendi işlemleri (gizle/göster, küçült/geri, odak aç/kapa, `setBounds`,
  başka pencerenin büyümesi) izole deneyde tek tek denendi, hiçbiri düşürmedi: düşüş dışarıdan. Sebep tahmin
  edilmedi; sonuç yoklanıp düzeltiliyor, ilk düşüş ve sonrası dakikada bir loglanıyor (üstteki pencerenin sınıfı).
- **Faz 32, üst katman bekçisi** (✅): `electron/ust-katman.cjs` (karar saf `dustuMu`, Win32 ayrı). Kural: topmost
  pencerenin üstünde topmost olmayan görünür pencere olamaz; varsa Ada düşmüştür →
  `SetWindowPos(HWND_TOPMOST, NOMOVE|NOSIZE|NOACTIVATE|NOOWNERZORDER)`. Başka bir topmost pencere (Görev Yöneticisi
  "her zaman üstte") Ada'nın üstündeyse meşru, yarışılmaz. Yoklama tam ekran yoklamasıyla birleşti (600 ms, tek
  zamanlayıcı); "Tam ekranda çekil" kapalıyken de çalışır. Gösterme anlarında (sinemadan çıkış, odak bırakma,
  kısayol) hemen bir kez.
- **Faz 33, sekme ağacı** (✅): her sekme kapanışı `taskkill /T` (eskiden yalnız Çalıştır bölmeleri). claude'un arka
  plan Bash'i dev sunucusu başlatıp konsoldan kopabiliyor, yalnız kabuğu öldürmek onu yetim bırakıyordu. Canlı kabuğa
  `p.kill()` node-pty'nin konsol listesi yardımcısını kabuğun ölümüyle yarıştırıyor, "AttachConsole failed" yığın izi
  düşüyordu (10-06'da d9bcc3b'den sonra da). Vault'un ayrık `flush.py`'si etkilenmez: atası (hook süreci) ölü, ağaçta yok.
- **Faz 34, sürüm bekçisi** (✅): `electron/surum.cjs`. İmza = git HEAD (dosyadan, süreç açmadan; gevşek ref,
  packed-refs, ayrık HEAD), dakikada bir. Değişince tepside "Yeni sürüm hazır: yeniden başlat" + bildirim + ipucu;
  paletten "Kokpit'i yeniden başlat" her zaman. Akış: gerçek çıkış (açık oturum sorusu, defter) → `will-quit`'te
  `kokpit-sessiz.vbs --yeniden` (önce derler; `app.relaunch()` derlemeyi atlayıp eski dist'i açardı). Yeni örnek kilidi
  alamazsa `--yeniden` ile 20 sn'ye kadar bekler (Electron'da yeniden denemenin işlediği izole ölçüldü: 2 sn'de aldı);
  bekleme denemeleri eski örnekte `second-instance` tetiklediği için kapanırken yok sayılır. Vazgeçilirse istek düşer.
- **Testler:** `test:ada` 63 (üst katman kararı 5, imza 5), `test:pty` 21 (oturum ağacı + yığın izi; düzeltmeden önce 2
  kırmızı), `test:ui` 155 (gerçek Win32: Ada `HWND_BOTTOM`'a itilir, iki turda geri üstte + log; geçici depoda yeni
  commit → algı → yeniden başlat → çıkış → başlatıcı), kanca 101. **Mutasyon:** bekçi kapalıyken `test:ui` 3 kırmızı.
- **Kontrol edilemeyen:** gerçek düşüşün kaynağı (log ilk düşüşte söyleyecek); başlatıcının gerçek yeniden açılışı
  (Scryne'ın açık oturumları kesilmesin diye çalışan Kokpit'te denenmedi; parçaları ayrı ölçüldü).

### v2.9 — Denetim, yerinde sürdürme, push durumu (Faz 35–37, 2026-10-21)

Scryne: "Projeyi en baştan en sona incele, denetle; eksik ve hataların tamamını çöz, gerekli yerleri iyileştir, en
üst hale çıkarmak için yeni şeyler ekle. İş tamamen sende." Denetim kodun tamamı + gerçek kullanım logu (6 hafta,
`~/.kokpit/kokpit.log` 8.900 satır) üzerinden yapıldı; bulgular ölçümden.

- **Faz 35, dayanıklılık** (✅):
  - **Sinema titremesi (gerçek hata).** Logdaki 149 "sinema"nın 93'ü 2,5 sn'den kısaydı, 46'sı tek yoklama (0,6 sn):
    Alt+Tab, Görev görünümü, Başlat/Arama gibi kabuk katmanları ekranı bir an kaplıyor, Ada kaybolup geri geliyordu.
    `tam-ekran.cjs`: kabuk sınıfları (`XamlExplorerHostIslandWindow`, `MultitaskingViewFrame`,
    `Windows.UI.Core.CoreWindow`, `ForegroundStaging`) sayılmaz; sinemaya giriş 2 sn kesintisiz tam ekran ister
    (`sinemaAdimi`, saf, test:ada), çıkış gecikmesiz. Log artık ön plan sınıfını yazar. Baseline `test:ui` bu yüzden
    düştü (test sırasında öndeki pencere sinemayı tetikledi); test başına ön koşul kontrolü eklendi.
  - **`durum.py` dayanıklılığı.** Okuma hatası Pano'yu, Sağlık'ı, Envanter'i ve kenar listesini boşaltıyordu
    (`setDurum(null)`): son ölçüm artık kalır, şerit "Durum tazelenemedi · gösterilen HH:MM ölçümü" der. Çağrıda zaman
    aşımı yoktu (takılan git Pano'yu sonsuza dek "Okunuyor"da bırakırdı): 60 sn. Eşzamanlı çağrılar tek sürece iner;
    hata yolunda `PYTHONIOENCODING=utf-8`.
  - **Derleme düşerse açılış.** `uretim.cjs` derleme hatasında hiçbir şey açmıyor, sebebi de yazmıyordu (Windows
    açılışı ve yeniden başlatma gizli pencerede). Vite çıktıyı yalnız grafik kurulduktan sonra boşalttığı için
    (`renderStart`) önceki `dist` yerinde kalıyor: onunla açılır, hata `kokpit.log`'a `FAIL derleme basarisiz`.
    Kaynağa sözdizimi hatası konup denendi: eski paketle açıldı, log satırı düştü.
  - **Küçükler:** PTY köprüsünde eski sürecin `exit`'i yenisinin kaydını silebiliyordu (koruma); log devri artık
    çalışırken de (her 500 satır; Kokpit günlerce açık kalıyor); Ada çözünürlük/ekran değişince yeniden yerleşir;
    `--arka` açılışta ilk gösterim kayıtlı büyütülmüş hali uygular; üst katman düşüş logu süreç adını da yazar
    (v2.8'in açık sorusu: 68 düşüş `WinUIDesktopWin32WindowClass`, hangi uygulama olduğu artık görülecek); bayat
    `claude --continue` metinleri; Vite 8.3.1 → 8.3.5 (high: launch-editor, 3 advisory), React 19.3.1, lucide 1.61,
    plugin-react 6.1.2, `npm audit` 0. CI'a `test:ada` eklendi.
- **Faz 36, biten bölme yerinde + Ctrl+Shift+T** (✅): claude'dan çıkınca ya da bağlantı kopunca bölme "kapandı"
  yazıp kalıyordu. Artık mesaj satırında **Sürdür** (transcript diskteyse; aynı bölmede `--resume`, aynı kimlik) ya da
  **Yeniden aç** (yeni kimlikle aynı klasörde). Ctrl+Shift+T ve palet: son kapatılan claude oturumu (bellekte son 10)
  aynı kuralla geri açılır; o konuşma zaten açıksa atlanır. "Diskte mi" sorusu dar bir IPC'den (`oturum:surdurulebilir`,
  yalnız stat). Terminal araması sonuç sayar (`3/12`, `yok`).
- **Faz 37, push durumu + hızlı tazeleme** (✅): `durum.py` ahead/behind/upstream veriyordu, Pano göstermiyordu.
  Git sütununda `↑N` (push edilmemiş), `↓N` (geride), uzak dalı yoksa "yerel"; ölçüm şeridinde "N commit push
  bekliyor". `durum.py` 22 depoyu sırayla okuyordu (Kokpit logunda p50 4,5 sn, en kötü 12,7 sn; cProfile: sürenin %85'i
  113 git süreci): git durumları paralel (8 iş parçacığı), 2,1 → 0,8 sn, JSON çıktısı eskisiyle birebir aynı (karşılaştırıldı).
- **Testler:** `test:ada` 70 (+7: kabuk katmanları, giriş gecikmesi, sayaç sıfırlama, gecikmesiz çıkış), `test:ui` 174
  (+19: push işareti, hata şeridi + korunan tablo, sinema ön koşulu, arama sayacı, Sürdür/Yeniden aç kimlik zinciri,
  Ctrl+Shift+T iki yol, servis kapanınca PTY sunucusu canlı), üst üste iki koşu yeşil — test sahte transcript'i ve `durum.py` sarmalayıcısını geçici dizinde tutar
  (`KOKPIT_CLAUDE_PROJELER`, `KOKPIT_DURUM_SCRIPT`), gerçek `~/.claude`'a dokunmaz. kanca 101, pty 21. **Mutasyon:** hata anında veriyi silen eski
  davranış 3, kimliği yenileyen "Sürdür" 1 kontrolü kırmızı yaktı. Biten bölme testte kabuk PID'iyle sonlandırılır
  (yazılan `exit` üç koşunun ikisinde kabuğa ulaşmadı; yalıtılmış 18 turluk denemede PTY sunucusu hiç donmadı).
- **Olay:** denetim sırasında test penceresini kapatmak için kullanılan başlık filtreli `taskkill` Scryne'ın çalışan
  Kokpit'ini de kapattı; açık oturum yoktu (son oturum 09:47'de güvenli kapanmış), `kokpit-sessiz.vbs --arka` ile
  geri açıldı. Ders hafızada: test süreci yalnız PID ile öldürülür.
- **Electron yaması (aynı gün, Scryne Kokpit'i kapattıktan sonra):** Electron 44.4.5 → 44.9.3, koffi 3.3.2 → 3.3.3.
  Açıkken yapılamıyordu (çalışan Kokpit `electron.exe` ve koffi'nin yerel modülünü kilitli tutuyor). npm yeni sürümlerin
  kurulum betiklerini çalıştırmadı (`allowScripts` sürüme bağlı): satırlar güncellendi, koffi `npm rebuild`, Electron
  binary mirror'dan. koffi düz Node'da ve Electron 44.9.3 içinde yüklendi; typecheck, build, kanca 101, ada 70, pty 21,
  `test:ui` 174/174 yeni Electron'la. Electron 45 ana sürüm: ayrı iş.
- **Kontrol edilemeyen:** Test kabuğuna
  yazılan `exit`'in ara sıra ulaşmamasının sebebi bulunmadı (teşhis noktası PTY sunucusunu canlı gösterdi); ürün
  tarafında karşılığı görülmedi.

### v3.0 — Yakala, nöbet, Ada'nın dikkati (Faz 38–45, 2026-10-29)

Scryne: "Kokpit'i daha çok geliştirmek istiyorum, sana bırakıyorum." Öneriler kullanım verisinden çıktı
(10-04 → 10-28: Kokpit'te 146 oturum, medyan 2,4 sa, çoğunlukla 2–3 eşzamanlı, en çok 5; 1.184 prompt'un
197'si ekran görüntüsü taşıyor, Matbaa 82, ScryneOS 61). Scryne seçti: ekran yakalama, bot nöbeti + vade,
Ada için de bas-konuş dışındakiler (Ada'ya bırak, nöbet sesi, ifadeler, takılma, hedef, bitti sonucu).
Diff/inceleme ekranı, worktree'li paralel ajan, zamanlanmış görev, telefon önerildi, alınmadı.

- **Spike (gerçek claude 2.1.312, 2026-10-29):** (1) PTY'ye görüntü **yolu** yapıştırmak (bracketed
  paste) girdide `[Image #1]` doğuruyor ve model görüyor (beyaz zeminde "ZEYTIN 47" → son mesaj
  "ZEYTIN 47"); panoya yazmak gerekmiyor. (2) `PostToolUseFailure` gövdesi: `tool_name`, `tool_input`,
  `error` ("Exit code 2\nls: cannot access …"), `is_interrupt`, `duration_ms`. `StopFailure` ikili dosyada
  var, yalnız API hatasında tetiklendiği için ölçülemedi: savunmacı işlenir. (3) `UserPromptSubmit`
  `prompt` taşıyor (görüntü `[Image #1]` metniyle). (4) v2.8'den açık soru kapandı: Ada'yı üstten düşüren
  `WinUIDesktopWin32WindowClass` = `Photos.exe` (7) ve `WhatsApp.Root.exe` (1); bekçi geri alıyor.
- **Faz 43, takılma** (✅): `etkinlik.cjs` `PostToolUseFailure` (ana turda üst üste hata sayısı; alt ajanın hatası ve
  Esc ile kesilen araç sayılmaz; başarılı ana tur aracı seriyi siler) ve `StopFailure` (tur API hatasıyla durdu,
  gövde ölçülemediği için bilinen alanlardan ilk dolu metin). Eşik 3: son 25 günün 1.675 transcript'inde 3'lük seri 8
  kez, 5'lik hiç. Zaman tabanlı iki hal renderer'da (`takilmaDurumu`): 10 dk hiç olay yok (alt ajan da yok), tek araç
  20 dk bitmiyor. Etkinlik şeridi ve Ada satırı amber "Takılmış olabilir" + neden; yeni takılmada Ada bir kez bakar,
  göz 8 sn "endişe". Kanca ayarına iki olay eklendi.
- **Faz 44, hedef** (✅): `UserPromptSubmit.prompt` → `istekMetni` (yapıştırma işaretleri, tırnaklı yol, baştaki
  selam atılır); ≥ 20 karakter ve `/` ile başlamayan ilk istek `hedef`, sonuncusu `sonIstek`. Son 40 oturumun ~4'te 1'i
  "ne durumdayız?" ile açılıyordu: ilk istek değil ilk *anlamlı* istek. Ada satırında ikinci satır, sekme ipucunda.
- **Faz 45, bitti sonucu** (✅): `tur` özeti her istekte sıfırlanır (bitti cümlesi artık oturumun değil turun
  sayılarını söyler). Tur bitince main `git-ozet.cjs` ile oturum klasörünü okur (`status --porcelain=v2 --branch` +
  `rev-list --count --since=<açılış>`): commit, ↑ push bekleyen, uzak dalsız, kirli. Yalnız Stop anında, yoklama yok.
- **Faz 38–39, yakala + bırak** (✅): `yakala.cjs` panoyu `GetClipboardSequenceNumber` ile 600 ms'de yoklar (yalnız
  sayı; değişince biçim, görüntüyse PNG + sha1 ile tekrar ayıklama). Ek kaydı main'de; Ada kimlik seçer, yol main'de
  çözülür (README kural 11). Gönderim: her yol ayrı bracketed paste, not, 350 ms sonra Enter; "Yalnız yapıştır" Enter'a
  basmaz, Kokpit o sekmeyle öne gelir. Ctrl+Alt+Shift+S `ms-screenclip:` açar; gelen görüntü Ada'yı klavyeyle açar.
  Bırakma: Ada fareyi geçirirken Windows'un sürükleme döngüsü ona olay yollamaz; 600 ms'lik yoklama sol tuş basılı +
  imleç hap bölgesindeyse (`hapBolgesinde`, üst 48 px, merkez ±220) yakalamayı açar, tuş bırakılınca kapatır.
  **Gerçek hata, ölçümle yakalandı:** Electron 44.9.3'te `clipboard.availableFormats`/`readImage` yok; API W3C
  biçimli ve asenkron (`has('image/png')`, `read()` → `ClipboardItem.getType()` → `Blob`). İlk sürüm her yoklamada
  sessizce hata verip hiçbir şey yakalamayacaktı; `test:ui` bekçiyi kapalı koştuğu için görmedi, canlı pano denemesi
  gördü. Yeni yol: yazılan PNG 1 ms'de okunuyor; uçtan uca 313 ms. `npm run test:pano` (elle, gerçek panoya yazar,
  önceki içeriği her türüyle yedekleyip geri yazar).
- **Faz 40–42, nöbet + vade + Ada** (✅): vault'ta `nobet.py` (`durum.py --nobet`; kural 1 korunur, Kokpit yine yalnız
  `durum.py` çağırır). Projeler işlerini `.claude/nobet.json`'da bildirir: Otomat, GridGrade (Actions), Matbaa (görev
  + `son.json` alarm/sipariş sayacı), Yanki (3 görev + üretim engeli), OsintLab (servis), ScryneOS (yedek, sağlık).
  `gh run list` çağrı başına 12,9 sn sürüyordu (AAAA'sız DNS tuzağı): REST + IPv4 0,9 sn; ilk ölçüm 28 → 5,4 sn,
  önbellekle anlık. `nobet.cjs` 5 dk'da bir okur, geçişleri bulur (`olaylariBul`, saf): yeni düşüş → Ada endişe, yeni
  koşuda sipariş > 0 → Ada "para"; ilk okuma ve aynı koşu tekrar olay üretmez (`~/.kokpit/nobet-son.json`). Vadeler
  `durum.py --json`'da (`vadeleri_oku`, frontmatter `vadeler:`), mevcut 10 tarihli iş dört nota taşındı; kural global
  CLAUDE.md'ye yazıldı. İlk gerçek ölçümde: Yanki üretimi düştü (RunPod bakiyesi 0,80 $), Otomat 24 saatte 2 başarısız
  koşu (429), gerisi sağlıklı.
- **Testler:** `test:kanca` 124 (101'den: hedef, takılma serisi, alt ajan/Esc istisnası, tur özeti, StopFailure),
  `test:ada` 88 (70'ten: nöbet geçişleri, bırakma bölgesi, git ayrıştırma, ek yolu denetimi), `test:pty` geçti,
  `test:ui` 202 (174'ten; v3.0 bölümü: hedef satırı + sekme ipucu, takılma Ada/şerit/göz, tur sonucu + git ölçümü,
  Ada'ya bırak → PTY'ye giden baytlar birebir `ESC[200~yol ESC[201~ not CR`, nöbet endişe/para/tekrarsız sevinç,
  Botlar sayfası + rozet, vade şeridi + Ada "Bugün"), iki koşu üst üste yeşil. Vault `sistem_test.py` 16/16 (+ bot
  nöbeti, vadeler fikstürü). `test:pano` (elle, gerçek pano) geçti. **Mutasyon:** `test:kanca` 2/2 (eşik 2, alt ajan
  hatası sayılır), `test:ada` 2/2 (ilk okuma olay üretir, klasör kabul — bu ilk turda kaçtı: Windows'ta klasör boyutu 0,
  "boş dosya" kuralı örtüyordu; isFile'sız girdiyle güçlendirildi), vault 2/2 (gecikme yok, eski vade süzülmüyor).
  `npm run ekran:v3` → `kokpit-v3-*.png` (Pano şeritleri, vadeler, Botlar, Ada takılma/tepsi/bugün, hap endişe/para/yorgun).
- **Bulgular:** (1) Electron 44 pano API'si (yukarıda). (2) `test:ui`'nin v2.4 "odak alınca klavye ipucu" kontrolü
  v3.0 bölümü eklenince düştü; sebep v3.0 değil: Ada'nın odak bırak/al döngüsü sentetik girdiyle ~yarı yarıya tutmuyor,
  v3.0'dan önceki derlemede de aynı (yan yana ölçüldü: tekrar 1 ve 3 false). Gerçekte kısayol gerçek tuş, Windows izin
  veriyor; test odağı artık ön koşul olarak dener + doğrular. (3) Botlar sayfası her zaman bağlı (gizli) bir tablo
  taşıdığı için "tablo doldu" artık Pano'nun yüklendiğini söylemiyor; ekran koşucusu Pano'ya özgü öğe bekliyor.
  (4) Push testi gerçek depolardaki push bekleyen commit'i (Tezgah, bilerek) saymıyordu: taban + 3. (5) Makine
  kullanılırken (son girdi 0 sn) Ada'nın hover testleri gerçek fare hareketiyle bozuluyor; test boşta koşuldu.
- **Kontrol edilemeyen:** gerçek Win+Shift+S anlık görüntüsünün panoda `image/png` olarak görünmesi (Chromium CF_DIB'i
  png'ye çeviriyor, yazılan PNG ölçüldü; gerçek kesme aracı ekranı açacağı için denenmedi), `ms-screenclip:` kısayolu,
  Gezgin'den gerçek fareyle Ada'ya sürükle-bırak (yoklama + bırakma yolu ayrı ölçüldü), gerçek `StopFailure` gövdesi.
  Çalışan Kokpit eski kodla açık: yeni sürüm yeniden başlatınca gelir (tepside "Yeni sürüm hazır").

### v3.1 — Ada'nın sesi (Faz 46–48, 2026-10-29)

Scryne: "sesli asistan ekleyebilir miyiz? amacım bilgisayarımı tamamen vibe coding sistemine döndürmek." v3.0'da
bas-konuş ertelenmişti; bu kez istendi. Araştırma (2026-10-29): Claude Code 2.1.312'nin kendi `/voice` diktesi var ve
Türkçe destekliyor (ikili dosyadan ve dokümandan doğrulandı; ses Anthropic'e gider, yalnız o terminalin istemine
yazar). Ada'nın sesi onun yapamadığını yapar: her yerden, oturum seçerek, tepsi ve eklerle birlikte, sesli bildirim.
Global ayarda `/voice` da açıldı (`voice.mode: tap`, `language: turkish`).

- **Spike (RTX 4060 Laptop 8 GB):** whisper.cpp b5454 CUDA 12.4 + large-v3-turbo q8_0: Türkçe + İngilizce terimli
  cümle ısınmış sunucuda 110–330 ms (ort. ~170), soğuk açılış ~1,1 sn, VRAM ~1,2 GB. 7 cümleden 5'i birebir; hatalar
  "commit" → "komit", "push" → "paş", "Kokpit'e" → "Hoppite". Parakeet/Canary Türkçe desteklemiyor (araştırma).
  edge-tts `tr-TR-EmelNeural` ~1,6–2,7 sn; `tr-TR-AhmetNeural` aynı gece iki kez boş döndü (bilinen sorun, edge-tts
  #512): iki ses sırayla denenir. Windows'ta Türkçe SAPI sesi kurulu değil (yalnız Zira).
- **Faz 46** (✅): `src/renderer/sesKayit.ts` (getUserMedia → AudioContext 16 kHz → ScriptProcessor → WAV; ilk 300 ms
  gürültü tabanı, eşik ×3, 1,4 sn sessizlikte biter, 7 sn hiç konuşma yoksa vazgeçer, 30 sn tavan). `electron/ses.cjs`
  whisper sunucusunu ilk dinlemede açar (model konuşma sürerken yüklenir), 15 dk boşta kapatır (GPU belleği boşalsın).
  CSP'ye `media-src blob:` (Ada'nın sesi). Gözün yeni hali: dinliyor; hapta seviye çubukları.
- **Faz 47** (✅): `electron/ses-komut.cjs` (saf): düzeltme sözlüğü (Unicode harf sınırıyla: JS'nin kelime sınırı "ş"yi
  tanımıyordu; NFC: ayrışık "ş" geliyordu), hedef bulma (ekler, aksansız, uzunluğa göre 1–2 harf), kontrol sözleri,
  sondaki "gönder". Tepsi hedefi Ada'da tutulur (EkTepsisi kontrollü).
- **Faz 48** (✅): durum geçişinde (bekliyor / bitti + dikkat) Ada adı söyler; oturum başına 20 sn ara, dinlerken susar,
  Kokpit öndeyse main susturur. Ayar `adaSesli`, tepsi menüsünde "Sesli bildirim".
- **Testler:** `test:ada` 110 (88'den; sesli komut 22), `test:ui` 210 (202'den; sahte mikrofon WAV'ı + tanıma taklidi:
  Konuş düğmesi, "Dinliyorum…" + göz, sessizlikte kendiliğinden bitiş, tepside düzeltilmiş not + hedef, sesli
  "Gönder" → PTY'ye giden bayt birebir `not CR`, boş tanımada "Duyamadım"), `test:ses` 12/12 (gerçek GPU + edge-tts,
  8 cümle). Gerçek mikrofon Electron'da 16 kHz açıldı (Realtek dizi, ortam RMS 0,0125). **Mutasyon:** bağlaç şartı
  ilk turda KAÇTI: kural hiç çalışmıyordu (her parçası isteğe bağlı regex boş eşleşmeyi de kabul ediyordu), "Hoppit
  dedi ki…" Kokpit'e yöneliyordu; `BAGLAC_VAR` ile düzeltildi, test güçlendirildi. NFC, kısa ad sınırı, sondaki
  gönder: yakalandı.
- **Kontrol edilemeyen:** gerçek insan sesiyle tanıma (test sesi edge-tts'in sesi; gece, Scryne uyurken), gerçek
  kısayolla Ada'nın dinlemesi (test düğmeyle), hoparlörden çıkan bildirim sesi (test kabuğu sessiz). Çalışan Kokpit
  yeniden başlatılınca gelir.

### v3.2 — Atölye: vibe coding (Faz 49–57, 2026-10-29)

Scryne (v3.1'i denerken): "başka neler eklenebilir? bilgisayarımı yaşayan bir vibe coding sistemine çeviriyorum." Dokuz öneri
sunuldu (v3.0'da reddedilen dördü dahil: diff/inceleme, worktree'li paralel ajan, zamanlanmış görev, telefon; bas-konuş da v3.0'da
reddedilip v3.1'de istenmişti). Cevap: "her şeyi sana bırakıyorum, sınır tanımıyorum, hepsini yap, ekstra da ekle." 09-06'daki
"gözetimsiz ajan yok" çizgisi gece vardiyasında sınırlarla gevşedi: push, silme, dışarı mesaj yok; ana dal yok; limit beklenir.

- **Faz 49, sesli cevap + özet** (✅): `sesli-ozet.cjs` (saf): kanca halinden kulak için cümle (sembolsüz, markdown ve tam yol
  atılır, cümle sınırında kesilir; soru varsa "bir, X; iki, Y" diye okur). `cevapCoz`: sıra sayısı ya da "(Recommended)" →
  `cevap` isteği; hedefsizse soru soran ilk oturum; çoklu seçim / soru sayısı uyuşmazlığı / olmayan seçenek konuşulur, gitmez.
  Damga denetimi yine ana pencerede. **Gerçek ses bulguları (test:ses):** whisper "ikinci seçenek"i "2. Seçenek",
  "önerileni"yi "Önerilerini" yazıyor; ikisi de kabul. **v3.1 hatası:** "İptal" (büyük İ) kontrol sözüne eşleşmiyordu
  (JS `/i` U+0130'u i saymıyor); Türkçe küçük harfle karşılaştırılıyor.
- **Faz 50, brifing** (✅): `brifing.cjs` (saf; Katman 3'ün ilk gerçek adımı): vadeler (gecikmiş/bugün/yarın), düşen/geciken
  botlar, bekleyen oturumlar, push bekleyen + kirli (arşiv projeleri dışarıda), limit zamanlaması (haftalık ≥ %70, sıfırlanma
  günü), beyne düşmeyen, derleyici gerisi, sağlık alarmları, gece vardiyası; önerilen ilk iş. Gün 05:00 sınırlı. Tetik: "Günaydın
  Ada", palet, tepsi, açılış (45 sn), kilit açma, uykudan dönüş, gece açık kalan Kokpit'te 10 dk'da bir (Scryne masadaysa).
- **Faz 51, seçili metin** (✅): `secim.cjs`. **Karar: Ctrl+Insert, Ctrl+C değil** (terminalde seçim yokken Ctrl+C çalışan işi
  keser). Kısayolun tuşları bırakılmadan gönderilmez (Alt+Shift basılıyken Ctrl+Insert başka bir şeydir). Pano her türüyle
  yedeklenir ve geri yazılır; pano bekçisi o arada susar. Metin eki tepside kaynak + ilk satırlarla; oturuma bracketed paste,
  satır sonları korunur. Kokpit öndeyse aktif terminalin seçimi. `test:secim` (elle; gerçek Notepad + pano, görüntülü pano dahil)
  11/11, 96 ms. **Olay:** ilk spike panoyu yalnız metin olarak yedekledi; panoda metin dışı bir şey vardıysa kayboldu
  (14:50'den beri panoya görüntü düşmemişti). Test o yüzden Scryne'ın panosunu her türüyle yedekliyor; Windows 11 Notepad tek
  süreç olduğundan test yalnız kendi penceresine WM_CLOSE yolluyor (başlık denetimiyle).
- **Faz 52, Teslim** (✅): `teslim.cjs`: `status --porcelain=v2/-z`, `log @{u}..HEAD`, numstat, diff (400 KB sınır, satır
  sınırında), izlenmeyen dosya tamamı eklenen; depo dışı yol ve geçersiz commit reddedilir. Görünürlük GitHub REST + IPv4
  (0,9 sn, 6 sa önbellek). Push: onay diyaloğu; public/bilinmeyen depoda `yayin_tara.py --gecmis --json` (Kokpit'te 1,9 sn);
  `--force` hiç yok. Gerçek git testi: geçici depo + yerel bare uzak.
- **Faz 53, önizleme + işaretle** (✅): spike: `<webview>` Kokpit'in CSP'siyle (`frame-src 'none'`) çalıştı, `capturePage`
  öğeyi 1,25 ölçekte verdi. `will-attach-webview` preload/Node'u siler, sandbox, `persist:onizleme` bölümü, yalnız yerel adres;
  yeni pencere ve yerel dışı gezinme varsayılan tarayıcıya. İşaretçi sayfaya enjekte, Promise döner; tıklama yakalama evresinde
  yutulur; React fiber / Vue bileşen adı. **Bulgu:** CDP'nin ölçekli ekranda `<webview>` görüntüsü kayık birleşiyor (yalnız
  CDP çekimi; işletim sistemi görüntüsünde doğru); `ekran:v32` bu yüzden `EKRAN_OS=1` ile ekranı da çeker.
- **Faz 54, paralel** (✅): `paralel.cjs`: `git worktree add -b kokpit/<ad>`, `.git/info/exclude`, junction + `.env` kopyası;
  Birleştir: paralel ve ana ağaç temiz, ana ağaç taban dalda, `--no-ff`, çakışmada `--abort`; At: junction önce sökülür (ana
  `node_modules` silinmesin), birleştirilmemiş dal zorlamasız silinmez. Teslim'de tablo; açık oturumu olan ağaç atılamaz.
- **Faz 55, gece vardiyası** (✅): `gece.cjs` kayıt + saf `karar`; koşucu ana pencerede (`Gece.tsx`), 15 sn'de bir. Tek görev
  aynı anda. Soru → önerilen seçenek ya da "Sen karar ver…" (aynı soruya ikinci kez gitmez, görev başı 6), izin istemi → takıldı,
  25 dk sessizlik → Esc + takıldı, 150 dk → Esc + süre, oturum kapandı → hata, 5 saat ≥ %92 → bekle, hafta ≥ %97 → bitir.
  `powerSaveBlocker` (uygulama askıya alınmasın). Nöbete bildirildi (`.claude/nobet.json`, `~/.kokpit/gece.json`; `nobet.py`
  artık `~` yolunu açıyor).
- **Faz 56, eller serbest** (✅): `sesKayit.uyanmaBaslat`: kayan gürültü tabanı, 0,35–6,5 sn arası parça whisper'a ("Ada, "
  ipucuyla); uzun ses (video, müzik) GPU'ya gitmez. `uyanmaAyikla` (saf): kelime sınırı zorunlu ("Adana", "Ada'ya yaz" uyandırmaz).
  Uyanmayan metin hiçbir yere yazılmaz. Ada konuşurken ve bas-konuş dinlerken duraklar; sinemada kapalı; varsayılan kapalı.
- **Faz 57, telefon** (✅): spike (gerçek claude 2.1.312, bypass): `--remote-control <ad>` çalışıyor, durum satırı
  `https://claude.ai/code/session_…` yazıyor; açık oturumda `/rc`. pty-server bağlantıyı yakalar (≥ 20 karakter kimlik: dar
  terminalde kırpılan bağlantı kabul edilmez). Ad pwsh tek tırnağı için süzülür (gerçek pwsh'ta tek argüman).
- **Ekstra:** Ada "Görev ver" kipi (Şimdi / Paralel / Geceye); Teslim'de "Claude commit etsin"; "Kokpit'i aç" sesli.
- **Testler:** `test:ada` 222 (110'dan), `test:ses` 18/18 (gerçek GPU + edge-tts; v3.2 6 cümle), `test:secim` 11/11 (elle),
  `test:ui` yeni 32 kontrol yeşil (231 geçti; v2.4'ün iki odak ön koşulu düştü: önde Gezgin. Aynı makinede v3.1 (`322b912`) de aynı ikisini düşürdü (208 + 2): ortam, v3.2 değil; gerçek parmak izi: `~/.kokpit` dokunulmadı), `test:pty` ve `test:kanca` 124 yeşil, vault
  `sistem_test.py` 16/16. **Mutasyon 9/9 yakalandı:** büyük İ, uyanma kelime sınırı, gece çift cevap, gece limit, paralel ana
  ağaç kirli, Teslim yol kaçışı, brifing arşiv süzgeci, cevap seçenek sınırı, kırpık uzak bağlantı.
- **Kontrol edilemeyen:** gerçek insan sesiyle eller serbest (VAD gerçek mikrofonla), gerçek bir gece vardiyası (gerçek claude,
  saatlerce), gerçek `/rc` düğmesi (oturumu dışarı açar; spike'ta bayrak ölçüldü), public depoya gerçek push (onaysız yapılmadı).
  Çalışan Kokpit eski kodla açık: yeni sürüm yeniden başlatınca gelir.

### v3.3 — Aria: Kokpit'teki ikinci beyin (Faz 58–63, 2026-10-29)

Scryne: "sen kendine bir arayüz oluştur; sen benim 2. beynimsin; Jarvis gibi düşünebilirsin; kodlamadan önce ne yapacağını
yaz." Plan yazıldı, üç karar soruldu: yüz **sinyal halkası**, **Ada Aria'nın yüzü** (tek varlık: Ada beden ve ses, Aria akıl ve
hafıza), Aria'nın eli **öneri kartı + onay** (Kokpit'in v2.3 kuralı korunur: oturuma yalnız Scryne'ın açık eylemiyle yazılır).

- **Spike (gerçek claude 2.1.312):** (S1) `claude -p --input-format/--output-format stream-json` vault'ta aynı süreçte çok tur,
  tur başına ~2 sn; SessionStart hook'u hafızayı yükledi (Aria son oturum başlığını bildi); süreç kapanıp `--resume` ile açılınca
  ilk soruyu hatırladı. (S2) bağımlılıksız stdio MCP aracı oturumda göründü ve çağrıldı (gizli kelime okundu); kullanıcı MCP'leri
  yüklenince açılış 15 sn, `--strict-mcp-config` ile 1,8 sn. (S4) `control_request interrupt` turu keser, süreç yaşar;
  `--include-partial-messages` metni parça parça verir.
- **Faz 58, çekirdek** (✅): `aria.cjs`. Gün 05:00 sınırlı; günün ilk mesajı yeni kimlik (taze hafıza), gün içinde aynı konuşma;
  20 dk boşta stdin kapanır (SessionEnd günlüğe düşürür), sonraki mesaj `--resume`. `basladi` yalnız ilk tur bitince yazılır
  (mesajsız ısınan kimliğe `--resume` "konuşma yok" derdi). Ortam temizliği `ortam.cjs`'e alındı (pty-server ile ortak).
  **Bulgu:** ısınma kilitlenmesi: "açılıyor" sürerken gelen mesaj kuyruğa giriyor, kuyruk yalnız tur bitince boşaldığı için
  hiç gitmiyordu; meşgul = aktif tur, açılış meşgul sayılmaz.
- **Faz 59, sayfa** (✅): Ctrl+7, `AriaSayfasi.tsx` + `SinyalHalkasi.tsx` (canvas; boştayken durağan, kare döngüsü yalnız hal
  hareketliyken ve pencere odaktayken: DESIGN.md hareket bütçesi), `md.tsx` (HTML enjeksiyonsuz markdown).
- **Faz 60, ses** (✅): `komutCoz` yeni eylem `aria`; öncelik: kontrol sözü > özet/oku/aç/cevap > açık önek / hatırla > soru
  biçimi (yazma niyeti yoksa) > not. Ada'dan giden soru `[ses]` önekli (1-3 cümle, sembolsüz).
- **Faz 61, hafıza paneli** (✅): `hafiza.cjs` (salt okuma): Threads/Kurallar/Last-Session/Journal ayrıştırıcıları, arama
  (başlık 5 + gövde geçişi, bütün sözcükler zorunlu, Türkçe duyarsız). **Bulgu:** CRLF'li dosyada `/^# .*\n/` tutmuyordu
  (JS'te `.` `\r`'yi de satır sonu sayar).
- **Faz 62, araçlar + öneri** (✅): `aria-mcp.cjs` (stdio JSON-RPC) → `aria-arac.cjs` (127.0.0.1, 48 hex token, kapanınca
  yapılandırma silinir). Yazan araç yok; `oneri_*` kart doğurur, karar bir kez. Gerçek claude: araç bulundu, okundu, kart doğru
  mesaja bağlandı, Aria "sen onaylamadan açılmaz" dedi (8,3 sn). **Bulgu:** ekran betiği durumu beklemeden öneri yolladı (gizli
  Botlar tablosu "tablo doldu" diyordu, v3.0 tuzağı); `projeBul` artık main'in durum ölçümünü yedek kullanıyor.
- **Faz 63, günlük not** (✅): ayrı `claude -p --no-session-persistence` (sohbete ve transcript'e girmez), günde bir. Gerçek
  koşuda Aria kaynaklı beş madde buldu; biri gerçek bir kör nokta: GP2 öneri dosyasının son günü `vadeler:` alanında yoktu.
- **Gerileme (v3.2'den):** toplu tarih düzeltmesi (`sed 2026-10-30 → 29`) brifing testinin beklenen gününü de değiştirmişti
  (`ade08eb`); test-ada'yı yeniden koşmadan commit'lemiştim. Geri alındı.
- **Testler:** `test:ada` 266 (v3.3 hafıza, araç ucu, Aria oturumu: ısınma, art arda sıra, kesme, günlük not), `test:ui` 244
  (v3.3 bölümü: Ada'dan sesli soru, Aria sayfası, kesme, öneri kartı → onay → oturum; v2.4'ün iki odak ön koşulu yine ortam:
  önde Gezgin; `~/.kokpit` dokunulmadı). Mutasyon 9/9. **Bulgu:** öneri testinin açıp kapattığı oturum, sonraki "Sürdür"
  senaryosunu iki yerden bozdu: defterin son `acildi` kaydı ve PTY log'unun son kabuğu artık kapanmış oturumundu. İkisi de
  "kapanmamış son" diye seçiliyor; kimlik zinciri kontrolü onay oturumunu ayrı sayıyor (gevşetilmedi).

### v3.4 — Aria'nın ağı (Faz 64–67, 2026-10-29)

Scryne: "Aria arayüzünü daha iyi yapabilirsin; Obsidian gibi, 2. beynimsin ya, sinir ağları tarzında; yapılan işlemlerde sinir
ağları çalışıyormuş gibi. Sana bırakıyorum." Karar: süs için üretilmiş bir nöron animasyonu değil, vault'un **kendi** not
grafiği; her düğüm gerçek bir not, her ışık Aria'nın gerçek bir aracı. Aria sayfasının sağ yarısı.

- **Faz 64, veri** (✅): `hafiza-ag.cjs` (salt okunur). Düğümler Companion, projeler, 500-Knowledge, kavramlar, günlükler,
  arşiv; bağlar `[[wikilink]]`, derleyicinin ilişki makaleleri (`connects:`), makalenin kaynağı olan gün (`sources:`), aynı
  adlı kavram ↔ proje notu. Gerçek vault: 358 düğüm, 1.450 bağ, 49 ms. **Bulgu:** çıplak `[[otomat]]` önce proje notuna
  çözülüyordu (klasör sırası); kaynak notun kendi klasörü önce aranıyor (kavram bağları 1.029 → 933, doğru hedefe).
- **Faz 65, tuval** (✅): `AriaAgi.tsx`, d3-force (bağımlılık: `d3-force` 3, ISC). Yerleşim bir kez hesaplanıp saklanır,
  yeni not komşusunun yanında doğar. Sığdırma %2–%98 dilimle (birkaç yalnız not ağı küçültüyordu). Etiketler öncelik sırasıyla,
  çakışan atlanır. Arama, Enter ile not çekmecede açılır.
- **Faz 66, ateşleme** (✅): araç olayı ham hedefi taşıyor (`dosya`, `desen`, `proje`); vault notu → okuma/yazma, proje
  dosyası → o projenin notu, Grep → eşleşen notlar, Kokpit aracı → Kokpit düğümü + proje. Sinyal Aria'dan BFS yolunda gider,
  varınca yayılan aktivasyon. Soru → `hafiza:ara` eşleşmeleri soluk (çağrışım; Aria'nın okuduğundan ayrı).
- **Faz 67, sayfa** (✅): sohbet solda, ağ sağda, hafıza paneli çekmece; 1100 px altında ağ kapalı.
  **Bulgu (ekran betiğinde yakalandı):** tuval hiç çizilmiyordu: ağ verisi gelmeden zamanlanan ilk kare boş varsayılan çizimi
  çağırıyor, "döngü çalışıyor" bayrağı inmiyor, sonraki bütün istekler yutuluyordu. Varsayılan bayrağı indiriyor; test:ui'da
  "tuval gerçekten çizildi" (piksel) kontrolü, mutasyonla (hata geri konunca) yalnız o düştü.
- **Testler:** `test:ada` 277 (ağ kurulumu 11; ad çakışması mutasyonu iki testte yakalandı), `test:ui` 253 (v3.4 bölümü 9:
  gerçek vault salt okunur, okuma/arama/yazma/Kokpit ateşi, çağrışım, çekmece, boştayken döngü durur; iki odak ön koşulu yine
  ortam). Ekran: `npm run ekran:ag`.
- **Yayın kapısı:** v3.3 testindeki örnek cümlede gerçek bir kişi adı vardı; push edilmemiş commit'lerde nötrleştirildi.

### v3.5 — Denetim ve bildirim geçmişi (Faz 68–72, 2026-10-29)

Scryne: "Kokpit'i baştan sona incele, denetle; eksiklik ve hataların tamamını çöz; iyileştirmeleri profesyonelce yap; en üst
hale çıkaracak yeni şeyler ekle; frontend dahil." Yöntem: beş salt okuma denetimi paralel (main çekirdek, süreç modülleri,
Ada/ses/Aria, arayüz ×2), ~130 bulgu; her biri kodda doğrulanıp düzeltildi ya da gerekçeyle bırakıldı. Görsel tur
(`npm run ekran:tur`: yedi sayfa × 1440/1024) konsol hatası ve yatay taşma vermedi.

- **En önemli bulgular:** (1) gece vardiyasının "push yok, silme yok" kuralı yalnız istem metniydi; gözetimsiz claude
  kullanıcının varsayılan izin moduyla açılıyordu. Artık ayrı ayarla `permissions.deny` (spike: izinleri atlayan modda bile
  `git push` reddedildi). (2) Limit ölçülemezse gece görevi yine başlıyordu (fail-open). (3) Paralel ağaç "At"ı `.gitignore`'daki
  üretilmiş dosyaları uyarısız siliyordu. (4) Öneri kartı aynı anda iki yoldan onaylanınca iş iki kez yapılıyordu. (5) Teslim:
  "private" görünürlüğü 6 saat önbellekte kalıyordu (depo public yapılırsa kapı atlanırdı); kapı çalışmazsa varsayılan düğme
  "Push et"ti. (6) Aria: kapatılan sürecin geç gelen satırları yeni turun cevabını eziyordu (mutasyonla gösterildi).
- **Yanlış çıkan bulgu:** PTY sunucusunun logu döndürülmüyor denmişti; 500 yazımda bir döndürülüyordu.
- **Bırakılanlar (gerekçeli):** Electron 44.10 / koffi 3.3.5 yaması (çalışan Kokpit dosyaları kilitliyor; bir sonraki
  yeniden başlatmada), App genelinde `memo` (ölçülmüş bir yavaşlık yok), sekme şeridinde roving tabindex, renk sabitlerinin
  tek yerden okunması, `node_modules` junction'ı (gece istemine kural olarak eklendi; ağaçta bağımlılık değişirse bağ kaldırılır).
  `test:secim` koşulmadı: gerçek panoya dokunuyor, Scryne aktifti; değişiklik yalnız erken bir çıkış (dosya listesi panodayken).
- **Yeni:** bildirim geçmişi (zil), markdown tablo/alıntı/iç içe liste, ağda klavye ile eşleşme listesi, öneri metninin tamamı,
  Esc'li hafıza çekmecesi, dar kenar çubuğunda uyarı noktası, `ekran:tur` görsel tur betiği; kırık `ekran-ada` betiği onarıldı
  ("tabloda satır var" koşulunu önce Botlar tablosu sağlıyordu).
- **Testler:** `test:ada` 291 (277'den; gece limit/süre/yasak, öneri başla-sonuç, paralel ad çakışması ve yok sayılan dosya,
  Teslim HEAD ve çapalı adres, ses yanlış eşleşmeleri, hafıza junction kaçışı, Aria yeni sohbet çakışması), `test:kanca` 125
  (gece ayar dosyası), `test:pty` (jeton sızmaz), `test:ui` 260 (+2 bilinen odak ön koşulu; bildirim, tablo, çekmece Esc,
  klavye listesi). Mutasyon: jeton, Aria eski çıktı, ad çakışması, tuval çizimi testleri hata geri konunca düştü.
