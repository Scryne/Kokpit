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
skill/MCP, transcript hijyeni) · Botlar (Ctrl+5: kendiliğinden çalışan işlerin nöbeti, v3.0).

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

**Ada:** ekranın üst ortasında küçük şerit: seni bekleyen ya da çalışan oturum, limitler. Üstüne
gelince oturum listesi açılır; bir oturum bitince ya da soru sorunca 5 sn kendiliğinden açılır.
Tıklayınca Kokpit o sekmeyle öne gelir. Komut paletinden "Ada'yı kapat".

**v3.3, Aria (ikinci beyin):**
- **Aria sayfası (Ctrl+7).** Vault'taki ikinci beyinle sohbet: sor, anlat, iş ver. Arkada vault'ta kalıcı bir claude oturumu
  (hafıza hook'larıyla); ekranda sohbet, ortada Aria'nın yüzü (sinyal halkası: dinliyor / düşünüyor / yazıyor / konuşuyor).
  Gün içinde aynı konuşma, yeni gün yeni sohbet (dünkü "Geçmiş"te); 20 dk boşta kalınca kapanır ve hafızaya düşer.
- **Ada, Aria'nın yüzü.** Ada'ya sesle sorulan bilgi soruları ("Ada, Matbaa'nın ölçüm günü ne zaman?", "Aria, …", "sor: …",
  "hatırla: …") Aria'ya gider; Ada düşünürken gözü çalışır, cevabı sesli okur, kartta "Aria'da aç".
- **Hafıza paneli.** Kimlik, açık konular, kurallar, son oturumlar, Journal ve bilgi tabanında arama; bir dosyayı okuyup "Aria'ya
  sor". Aria hafızaya bir şey yazdıysa mesajın altında "Hafızaya yazdı: …" (tıklanınca dosya açılır).
- **Öneri kartları.** Aria Kokpit'i okuyabilir (oturumlar, brifing, nöbet, Teslim, gece, limit) ama kendi başına hiçbir şey
  yapmaz: "şu projede oturum aç", "gece vardiyasına ekle", "şu oturuma yaz" birer karttır; **Onayla** (ya da Ada'ya sesle
  "onayla") dersen uygulanır.
- **Fark ettiklerim.** Aria'nın günlük notu: Kokpit'i ve hafızayı okuyup gözden kaçanları kaynaklı maddelerle yazar. "Şimdi
  düşün" ile elle, "her gün" açıksa günün ilk brifingiyle birlikte (limit harcar, varsayılan kapalı).

**v3.2, atölye (vibe coding):**
- **Sesli cevap ve özet.** "Matbaa ne yaptı?" → Ada son turu söyler (dosya/satır, commit, push bekleyen, son söz; soru varsa
  seçenekleri sırayla okur). "İkinci seçenek", "birinci ve üçüncü", "önerileni seç" → soru cevaplanır. "Kokpit'i aç" → o
  sekme. "Son mesajı oku" → claude'un son sözü.
- **Günün brifingi.** "Günaydın Ada", paletten "Günün brifingi", tepsiden ya da günün ilk etkinliğinde (açılış, kilit açma,
  uykudan dönüş; günde bir kez, tepsiden kapanır): gecikmiş/bugünkü vadeler, düşen botlar, seni bekleyen oturumlar, push
  bekleyen commit'ler, limit zamanlaması, beyne düşmeyen oturumlar, gece vardiyasının sonucu ve önerilen ilk iş.
- **Seçili metni gönder: Ctrl+Alt+Shift+C.** Herhangi bir uygulamadaki seçim (hata, log, paragraf) Ada'nın tepsisine düşer,
  kaynağıyla (pencere başlığı) oturuma yapıştırılır. Kopyalama Ctrl+Insert ile: terminalde çalışan işi kesmez. Panon değişmez
  (her türüyle yedeklenip geri yazılır). Kokpit öndeyken aktif terminalin seçimi alınır.
- **Teslim sayfası (Ctrl+6).** Push bekleyen commit'ler, commit edilmemiş dosyalar, her birinin diff'i. **Push et** her zaman
  onay ister; public depoda önce yayın kapısı (`yayin_tara.py --gecmis`) koşar, bulgu varsa diyalog listeler. Noreply olmayan
  commit e-postası amber uyarı. "Claude commit etsin": projede claude açılır, değişiklikleri inceleyip commit eder (push etmez).
- **Canlı önizleme + işaretle-söyle.** ▷ Çalıştır'ın bölmesi adres gelince uygulamanın kendisini gösterir (yalnız yerel adres;
  "Çıktı" ile sunucu çıktısına dönülür). **İşaretle** → sayfada öğeye tıkla → kırpık + seçici + React/Vue bileşeni + notun
  (yaz ya da mikrofon) yandaki claude oturumuna gider. Konsol hataları sayılır, tek tıkla oturuma gider.
- **Paralel oturum.** Sekme çubuğundaki çatal düğmesi (ya da Ada'da "Görev ver → Paralel"): projede ayrı bir git çalışma
  ağacı (`.claude/worktrees/<ad>`, dal `kokpit/<ad>`), claude orada çalışır, ana ağaç etkilenmez. Teslim'de "Paralel dallar":
  diff, **Birleştir** (`--no-ff`; kirli ağaçta ve çakışmada güvenli geri alır), **At** (onaylı). `node_modules`/`.venv`
  ana ağaca bağlanır, `.env` kopyalanır.
- **Gece vardiyası.** Palet ya da Teslim → "Gece vardiyası" (ya da Ada'da "Görev ver → Geceye"): görev sırası + başlangıç
  saati. Görevler sırayla, her biri kendi paralel dalında çalışır. Soru gelirse önerilen seçenek seçilir; takılan (25 dk
  sessiz, izin istemi) ve süresi dolan (150 dk) görev atlanır; 5 saatlik limit doluysa sıfırlanma beklenir. Push, silme,
  dışarı mesaj yasak (istemde). Vardiya sürerken makine uyumaz. Sabah brifingi özetler, sonuçlar Teslim'de.
- **Eller serbest ("Ada, …").** Tepsi → "Eller serbest". Mikrofon açık kalır ama yalnız kısa konuşma parçaları yerel
  whisper'a gider; "Ada" ile başlamayan metin hiçbir yere yazılmaz (log dahil). Uzun ses (video, müzik) süzgeçte düşer,
  tam ekranda kapalı. "Ada" deyip susarsan bas-konuş açılır.
- **Telefondan erişim.** Etkinlik şeridindeki telefon düğmesi oturumda Remote Control'u açar (`/rc`); bağlantı yakalanınca
  düğme o oturumu claude.ai'de açar, Claude mobil uygulamasında da aynı oturum görünür. Paletten "Telefondan erişimi aç":
  yeni oturumlar baştan `--remote-control` ile açılır.

**v3.1, Ada'nın sesi:**
- **Bas-konuş: Ctrl+Alt+Shift+Space** (ya da Ada'nın açık kartındaki mikrofon). Ada dinler, sen susunca kendiliğinden
  bırakır. Konuşma bu makinede metne döner (whisper.cpp, GPU, ~0,2 sn); ses dışarı gitmez.
- **Ne dersen:** "Matbaa'ya yaz, testleri koş" → not Ada'nın tepsisine düşer, Matbaa seçili, Enter'a basılmaz. Sonra
  "gönder" (ya da düğme) → oturuma gider. Cümle "…, gönder" ile biterse hemen gider. "Yalnız yapıştır", "vazgeç",
  "durum ne?" (Ada sesli özetler). Ad yoksa tepsi sıradaki oturumu önerir. Bekleyen ekran görüntüsü varsa notla
  birlikte gider. Kod terimleri düzeltilir ("komit" → commit, "paş" → push).
- **Sesli bildirim:** bir oturum seni beklemeye geçince ya da bitince Ada adını söyler ("Kokpit seni bekliyor").
  Kokpit öndeyken susar; tepsi menüsünden kapatılır. Ses Edge'in Türkçe sesi (edge-tts, ağ ister).
- Claude Code'un kendi dikte özelliği (`/voice`, Türkçe) terminalin içinde ayrıca çalışır; Ada'nınki her yerden ve
  oturum seçerek.
- Kurulum bir kez: `npm run ses:kur` (~2 GB, `~/.kokpit/ses`). Dosyalar yoksa Kokpit sessiz çalışır, kısayol kaydedilmez.

**v3.0, yakala + nöbet + Ada'nın dikkati:**
- **Ekran yakalama → oturum.** Panoya bir görüntü düşünce (Win+Shift+S, ya da Ctrl+Alt+Shift+S: Windows'un anlık
  görüntü aracını açar) Ada önizlemeyi gösterir: hedef oturumu seç, istersen not yaz, **Gönder** (yol yapıştırılır,
  claude `[Image #N]` yapar, Enter) ya da **Yalnız yapıştır** (Enter'sız, Kokpit o sekmeyle öne gelir). Görüntü
  `~/.kokpit/goruntu/`'ya yazılır, 7 günde silinir; senin panon değişmez.
- **Ada'ya bırak.** Dosya, görüntü ya da metin Ada'nın hapına sürüklenir (sol tuş basılıyken hapın üstünde bir an
  tut): aynı tepsiye girer.
- **Botlar sayfası + Pano şeridi.** Her projenin `.claude/nobet.json`'unda bildirdiği işler (Windows görevi, GitHub
  Actions, durum dosyası, engel dosyası) 5 dakikada bir `durum.py --nobet` ile okunur: sağlıklı / gecikti / düştü.
  Düşen ya da geciken iş Pano'nun üstünde şerit, kenar çubuğunda rozet. Yeni düşüşte Ada endişelenir, yeni siparişte
  (Matbaa sayacı) sevinir.
- **Vade şeridi.** Proje notlarının `vadeler:` alanı Pano'nun üstünde (bugün, yarın, bu hafta, gecikmiş); bugün ve
  yarın Ada'nın kartında da.
- **Ada'da oturumun hedefi** (ilk anlamlı istek; sekme ipucunda da), **takılma uyarısı** (3 araç üst üste hata,
  API hatasıyla duran tur, 10 dk sessizlik, 20 dk bitmeyen araç), **bitti satırında sonuç** (bu turun dosya/satır
  sayısı, oturumda atılan commit, push bekleyen, kirli dosya). Gözün yeni halleri: endişe, yorgun (5 saat ≥ %90),
  para.

**v2.9, denetim + süreklilik:**
- **Biten bölme yerinde açılır.** claude'dan çıkınca ya da terminal bağlantısı kopunca bölme artık yalnız "kapandı"
  demez: konuşma diskteyse **Sürdür** (aynı bölmede `claude --resume`, tam o konuşma), değilse **Yeniden aç** (aynı
  klasörde yeni oturum). Sekme ve bölme düzeni yerinde kalır.
- **Ctrl+Shift+T:** son kapatılan oturum geri açılır (konuşması diskteyse kaldığı yerden). Paletten de.
- **Push durumu Pano'da.** Git sütununda `↑3` (push edilmemiş commit), `↓1` (geride), uzak dalı olmayan depoda
  "yerel"; ölçüm şeridinde "N commit push bekliyor". Sayılar yerel izleme dalına göre, ağa çıkılmaz.
- **Okuma hatasında Pano boşalmaz.** `durum.py` bir kez düşerse son ölçüm ekranda kalır, üstte "Durum tazelenemedi ·
  gösterilen HH:MM ölçümü". `durum.py` 60 sn'de bitmezse zaman aşımı (eskiden "Okunuyor"da sonsuza dek kalabiliyordu).
- **Daha hızlı tazeleme:** `durum.py` 23 deponun git durumunu paralel okuyor: 2,1 sn → 0,8 sn (çıktı birebir aynı).
- **Ada artık Alt+Tab'da titremiyor.** Tam ekranda çekilme, tam ekran 2 sn kesintisiz sürerse devreye girer; Alt+Tab,
  Görev görünümü, Başlat/Arama gibi kabuk katmanları hiç sayılmaz (gerçek logda "sinema"ların %62'si 2,5 sn'den kısaydı).
  Çözünürlük ya da ekran değişince Ada yeniden yerleşir.
- **Terminal araması sonuç sayar:** `3/12`, eşleşme yoksa `yok`.
- Windows açılışında (`--arka`) başlayan Kokpit ilk açılışta kayıtlı büyütülmüş haliyle açılır.

**v2.8, her yerde üstte + yeni sürüm:**
- **Ada her uygulamanın üstünde.** Windows bazen Ada'yı, "her zaman üstte" bayrağı açıkken normal pencerelerin altına
  düşürüyordu (ölçüldü: yalnız masaüstünde görünüyordu). Ada artık 0,6 sn'de bir z-sırasını okur, düşmüşse odak
  çalmadan geri çıkar ve logda üstüne çıkan pencerenin sınıfını yazar (`ada: ust katmandan dusmus`).
- **Yeni sürüm hazır.** Kokpit açıldığı commit'i hatırlar; depoya yeni commit gelince tepside "Yeni sürüm hazır:
  yeniden başlat" ve bir bildirim çıkar. Tıklayınca (ya da paletten "Kokpit'i yeniden başlat") normal çıkış akışı
  çalışır (açık oturum sorusu dahil), sonra Kokpit derlenip yeniden açılır; oturumlar geri yükleme teklifiyle döner.
- **Sekme kapanınca süreç ağacı ölür.** claude'un arka planda başlattığı bir dev sunucusu sekmeyle birlikte kapanır,
  portu tutan yetim kalmaz (eskiden yalnız Çalıştır bölmelerinde böyleydi).

**Ada v2.7, saklanma:**
- **Kenara sakla:** açık kartın sağ üstündeki ⤒ (ya da tepsi menüsü, ya da **Ctrl+Alt+Shift+G**). Ada ekranın üst
  kenarının arkasına çekilir, yalnız gümüş çenesi ve gözlerinin alt yarısı görünür. İmleci çenenin üstünde bir an
  tutunca kart kenardan sarkar; geçip gidersen açılmaz. Seni bekleyen bir şey olunca çene amber yanar, kart
  kendiliğinden açılmaz. Geri getirmek: sarkan karttaki ⤓ ya da aynı kısayol. Kapatıp açınca da saklı kalır.
- **Tam ekranda çekilir:** YouTube tam ekran, oyun, sunum gibi Ada'nın ekranını tamamen kaplayan bir pencere öndeyken
  Ada tamamen kaybolur (seni bekleyen varsa yalnız çenesi görünür), tam ekran bitince geri gelir. Büyütülmüş pencere
  ve ikinci ekrandaki tam ekran sayılmaz. Tepsiden kapatılır: "Tam ekranda çekil".
- **Yer:** hapı üst kenar boyunca sürükle; ortaya yaklaşınca ortaya oturur. Tepside "Ada'yı ortala".

**Ada v2.6, masaüstü ajanı:**
- **Hep açık.** Oturum yokken, Kokpit öndeyken ve ana pencere tepsideyken de görünür (eskiden yalnız
  Kokpit arka plandayken ve bir oturum varken). Tepsi menüsü: "Ada'yı göster", "Kokpit öndeyken de göster".
- **Limitler oturumsuz.** Hapta `5s %15  hafta %92`, açık kartta sıfırlanma saatleri ve "ölçüldü 14:05".
  Kaynak, Claude Code'un `/usage` ekranının okuduğu uç (`api.anthropic.com/api/oauth/usage`), 5 dakikada
  bir; token `~/.claude/.credentials.json`'dan her yoklamada okunur, yalnız main süreçte kalır, diske/loga
  yazılmaz. Kokpit token **yenilemez**: claude ~8 saattir açılmadıysa son ölçüm kalır ve "claude açılınca
  tazelenir" yazar. Oturum açıkken statusline'ın her turdaki değeri de gelir, yeni olan kazanır. Son ölçüm
  `~/.kokpit/limit.json`.
- **Kokpit dışındaki oturumlar.** Terminalden ya da VS Code'dan açtığın claude oturumları "Kokpit dışında"
  bölümünde (çalışıyor / seni bekliyor / hazır + süre). Kaynak Claude Code'un kendi kaydı
  `~/.claude/sessions/<pid>.json`; salt okunur. Seni beklemeye geçen dış oturum Ada'yı 5 sn açar.
- **Görev ver.** Açık kartta proje seç + yaz + Enter: Kokpit o projede arka planda yeni bir claude oturumu
  açar, metin ilk mesaj olur; oturum Ada'da satır olarak belirir, Kokpit öne gelmez. Metin kabuğa komut
  satırı olarak değil ortam değişkeniyle gider (`electron/gorev.cjs`; tırnak, `$`, `;`, `&` gerçek pwsh'ta
  birebir ölçüldü). Ctrl+Alt+Shift+A oturum yokken de Ada'ya odak verir.
- **Tepsi.** Pencerenin X'i Kokpit'i kapatmaz, tepsiye indirir: oturumlar çalışmaya devam eder. Çıkış: tepsi
  simgesi → "Kokpit'ten çık" ya da palet "Kokpit'ten çık" (açık oturum sorusu yine çalışır). Tepsi
  ipucunda limitler.
- **Windows açılışında başlar** (ilk çalışmada açılır, tepsi menüsünden kapatılır): `HKCU\...\Run`'a
  `wscript kokpit-sessiz.vbs --arka`. `--arka` ana pencereyi gizli açar, yalnız Ada ve tepsi görünür.

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

**Ada v2.5, Ada'nın gözü:** hapın solunda gümüş bir gövde, iki göz. Ne yaptığını gösterir: çalışırken araca
göre bakar (Read satır okur, Edit aşağı odaklanır, Bash kısılır, Web yukarı bakar, araçlar arası düşünür),
soru sorunca amber halkayla sana bakar, bitince gülüp bir kez zıplar, 30 dk sessizlikte uyur, Ada'dan cevap
verince baş sallar, imleci izler. Yanındaki noktalar çalışan alt ajanlar (`SubagentStart/Stop`). Hapın
kenarı 5 saatlik limitle dolar (%80 amber). Kokpit arka plandayken ana penceredeki nabız durur. Maliyet
ölçüldü: göz canlıyken fark gürültü düzeyinde (DESIGN.md "Ada v2.5"). `npm run ekran:goz` her hali çeker.

**Ada v2.4:**
- **Çok sorulu sorular** (2–4 soru, tekli seçim) Ada'da cevaplanır: her soruya seçenek ya da "Kendi cevabın…",
  sonra "Cevapları gönder". Tek soru eskisi gibi tek tıkla gider. Son 30 günde claude'un sorularının %37'si
  çok soruluydu ve terminale yönlendiriliyordu. Çoklu seçim (toggle) hâlâ terminalde.
- **Son söz:** biten oturumun altında claude'un son mesajı (Stop hook'unun `last_assistant_message`'ı;
  bakılmamışsa 4 satır, "Tamamı" hepsini açar). Windows bildiriminin gövdesinde de başı var. Yalnız bellekte.
- **Gördüm:** bitti işaretini Kokpit'e geçmeden düşürür; oturuma bir şey gönderilmez.
- **Bekleme süresi:** sıra sende olan oturumun satırında ve hapta "ne zamandır bekliyor".
- **Klavye: Ctrl+Alt+Shift+A** Ada'ya odak verir ve ilk eylemi seçer: **1–4** odaktaki sorunun seçeneği,
  **Tab** gezinir, **Enter** gönderir, **Esc** bırakır. Gönderince ya da Esc'te odak bırakılır; Kokpit'in
  ana penceresi öne gelmez. Kokpit zaten öndeyse kısayol sırası gelen oturuma gider.

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
çubuğu · Ctrl+Tab / Ctrl+Shift+Tab sekme döngüsü · Ctrl+Shift+W bölmeyi kapat · **Ctrl+Shift+T son kapatılan
oturumu geri aç** · Ctrl+Shift+N
Inbox'a not · **Ctrl+Alt+Shift+Space Ada'ya konuş (v3.1)** · **Ctrl+Alt+Shift+K her yerden Kokpit'i çağır / küçült** · **Ctrl+Alt+Shift+A klavyeyle Ada** · **Ctrl+Alt+Shift+G Ada'yı kenara sakla / geri getir** · **Ctrl+Alt+Shift+N her yerden Inbox notu** (Kokpit arka plandayken de; Ctrl+Alt
Türkçe klavyede AltGr olduğu için üç değiştirici) · sekme şeridinde ← →, bölme ayırıcısında ← →
(%5). **Terminalde:** Ctrl+Shift+F ara (Enter / Shift+Enter / Esc) · Ctrl+C seçim varken
kopyalar, yokken `^C` · Ctrl+Shift+C/V · sağ tık yapıştır (fareyi izleyen uygulamada, ör. claude, tık uygulamaya gider ve yapıştırmayı o yapar) · Ctrl+= / Ctrl+- / Ctrl+0 yazı
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
kapatılırsa bir sonraki açılışta "N oturum açıktı — Geri yükle" (her oturum kendi konuşmasından,
`claude --resume <kimlik>`; kimliği olmayan eski kayıtta `--continue`). Pano satırında "son oturum: dün · 42 dk ·
beyne düştü ✓".

Üretimde arayüz `app://kokpit/` özel şemasından servis edilir — gerçek bir origin olduğu
için CSP uygulanabiliyor. `file://` kullanılmaz: `onHeadersReceived` o istekler için
tetiklenmiyor ve politika sessizce uygulanmamış oluyordu.

## Test

```bash
npm run test:pty     # PTY sunucusunun uçtan uca testi, servis ve oturum ağacı dahil (21 kontrol)
npm run test:kanca   # kanca köprüsü, soru/son söz/istek/komut/tarif/adres/kimlik (101 kontrol)
npm run test:ui      # gerçek Electron + CDP ile arayüz testi, Ada, gerçek z-sırası, tepsi, sürüm bekçisi, ses (sahte mikrofon) dahil (210 kontrol, önce build)
npm run test:ada     # limit (sahte uç), dış oturumlar, görev geçişi, tam ekran/yer, üst katman, sürüm imzası, sinema giriş gecikmesi, sesli komut (110 kontrol)
npm run test:ses     # v3.1, elle: GERÇEK whisper (GPU) + edge-tts uçtan uca, Türkçe + İngilizce terimli 8 cümle (12 kontrol)
npm run ses:kur      # v3.1: whisper.cpp CUDA + large-v3-turbo modeli + edge-tts -> ~/.kokpit/ses
npm run e2e:kanca    # GERÇEK claude ile hook zinciri + --session-id (11 kontrol; elle, plan kullanır)
npm run ekran:ada    # v2.3–v2.4 yüzeylerinin ekran görüntüsü (ada, ada-klavye, ada-bitti, terminal, Pano)
npm run ekran:ajan   # v2.6: oturumsuz hap, dış oturum, açık kart, proje listesi
npm run ekran:goz    # Ada gözünün her hali, hap 4x (boşta, düşün, oku, yaz, komut, web, ajan, soru, kenar, sevinç, bitti, uyku)
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
gönderir, DOM'dan okur; iki çalışma yapar (geri yükleme için). v2.4'ten beri **Ada penceresini de kurar**
(`KOKPIT_TEST_ADA=1`) ve onu ayrı bir CDP hedefi olarak sürer. Kurmadığı sürece bir hata görünmez
kalmıştı: ana pencere kapanınca Ada yaşadığı için uygulama çıkmıyordu (v2.2–v2.3; sonraki `kokpit`
tek örnek kilidine takılıp hiçbir şey açmıyordu). Test sırasında ekranın üst ortasında Ada belirebilir. Claude AÇMAZ:
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

**CI** (`windows-latest`): typecheck + build + `test:pty` + `test:kanca` + `test:ada`. `test:ui` CI'da koşmaz — vault ve
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
(`electron@44.9.3`, `koffi@3.3.3`): Electron ya da koffi yükseltilince bu satır da değişmeli, binary yine (2) ile iner.
Son yükseltme 2026-10-21: 44.4.5 → 44.9.3 (koffi 3.3.3; koffi için `npm rebuild koffi`), `test:ui` 174/174.
Yükseltme Kokpit kapalıyken yapılır: açıkken `electron.exe` ve koffi'nin yerel modülü kilitli.

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
| `KOKPIT_LIMIT_URL` | Anthropic usage ucu | Test: limit yoklaması bu adrese gider (test kabuğunda verilmezse hiç gitmez) |
| `KOKPIT_KIMLIK` | `~/.claude/.credentials.json` | Test: limit tokeninin okunduğu dosya |
| `KOKPIT_CLAUDE_OTURUMLAR` | `~/.claude/sessions` | Test: dış oturum kaydının okunduğu dizin |
| `KOKPIT_TEST_TEPSI` | — | Test koşucusunda tepsiyi de kur (X tepsiye indirir) |
| `KOKPIT_DURUM_SCRIPT` | vault'taki `durum.py` | Test: `durum.py`'yi saran betik (okuma hatası, push bekleyen commit taklidi) |
| `KOKPIT_CLAUDE_PROJELER` | `~/.claude/projects` | Test: transcript'lerin okunduğu dizin (sürdürülebilir mi, beyin durumu, bağlam) |
| `KOKPIT_TEST_NOBET` | — | Test koşucusunda bot nöbetini de başlat (`durum.py --nobet`; testte sarmalayıcının fikstürü) |
| `KOKPIT_TEST_PANO` | — | Test koşucusunda pano bekçisini de başlat (gerçek panoyu izler) |
| `KOKPIT_SES_DIZIN` | `~/.kokpit/ses` | v3.1: whisper sunucusu, model ve edge-tts'in yeri |
| `KOKPIT_TEST_MIKROFON` | — | Test: mikrofon yerine bu WAV (Chromium sahte aygıtı; yalnız test kabuğunda) |
| `KOKPIT_TEST_SES_DOSYA` / `KOKPIT_TEST_SES_METIN` | — | Test: konuşma tanıma taklidi (her çözümde dosya okunur / sabit metin); gerçek model açılmaz |
| `KOKPIT_TEST_SES_KONUS` | — | Test kabuğunda Ada'nın konuşmasını aç (varsayılan sessiz: hoparlör ve ağ yok) |

`~/.kokpit/ayarlar.json`: `seffaf: false` pencereyi opak yapar, `ada: false` adayı kapatır, `adaHep: false`
eski davranış (yalnız Kokpit arka plandayken), `tepsi: false` X'i yine kapatma yapar, `adaSesli: false` sesli
bildirimi kapatır (v3.1).

## Teşhis

Main süreç `~/.kokpit/kokpit.log` dosyasına yazar: renderer konsolu, sayfa yükleme hataları,
renderer çökmesi, preload hatası, `durum.py` çalışma süresi ve hataları, kapatma kararları
(güvenli/zorla). PTY sunucusu `~/.kokpit/pty-server.log`'a yazar (güvenli çıkışın süresi
dahil). İki dosya da 2 MB'ı geçerse `.1`'e devredilir: açılışta ve çalışırken her 500 satırda bir bakılır
(Kokpit Windows açılışında başlayıp günlerce açık kalıyor). Derleme düşerse (`kokpit`, Windows açılışı, yeniden
başlat) Kokpit önceki paketle açılır ve derleme hatası `kokpit.log`'a `FAIL derleme basarisiz` olarak düşer.

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
11. **Ekler yolla, kimlikle gider (v3.0).** Ada renderer'ı oturuma yol göndermez: ek kimliği seçer, yolu main
    (`yakala.cjs`) kendi kaydından çözer; bırakılan yol orada denetlenir (mutlak, var olan normal dosya, satır sonu
    yok). Scryne'ın panosuna yazılmaz. Bot nöbeti yalnız okur: hiçbir işi tetiklemez, `nobet.json`'u Kokpit yazmaz.
12. **Ses yerelde çözülür, Enter'ı Scryne söyler (v3.1).** Mikrofon yalnız kısayol/düğmeyle açılır, kayıt bellekte
    kalır, whisper'a 127.0.0.1'den gider. Sesli not tepsiye düşer; oturuma yalnız "gönder" sözüyle, düğmeyle ya da
    "…, gönder" ile biten cümleyle gider. Hedef adı bulanık eşleşirse ardında bağlaç (yaz, söyle, `:`) şart: sıradan
    cümle oturuma yönelmez. Komut kararı kurallarla (`ses-komut.cjs`), model yok.
