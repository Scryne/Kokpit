---
proje: Kokpit
created: 2026-09-10
modified: 2026-09-21
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
