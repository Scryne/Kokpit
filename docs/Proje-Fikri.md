---
proje: Kokpit
created: 2026-09-10
type: proje-fikri
status: denetime-hazir
kaynak: "ScryneOS/🧠 500-Knowledge/Kokpit-Plani.md (2026-09-06)"
---
# Kokpit — Proje Fikri

Bu doküman sıfırdan yazılmadı. Fikrin tohumu 2026-09-06'da ScryneOS vault'unda
`🧠 500-Knowledge/Kokpit-Plani.md` olarak yazıldı ve o dosya **kalıcı plan** olarak orada
kalıyor. Burası o planın Katman 2'sinin proje dokümanı: plandaki kararlar + 2026-09-10'da
verilen üç yeni karar.

## Problem

Scryne'ın dört aktif projesi var (ConsumerGuardian, OsintLab, ScryneQuant, sorudepo), her
biri kendi klasöründe, kendi git durumunda, kendi roadmap fazında. Acı **geliştirirken**
değil, **oturum başlarken**: bilgisayarı açtığında hangi projede nerede kalındığı, hangisinin
git'i kirli, beynin logu taze mi, haftalık token bütçesinin neresinde olduğu tek yerde
görünmüyor. Bu bilginin tamamı diskte zaten var — dağınık.

Katman 1 (`durum` script'i, 2026-09-06) bunu tek tabloda çözdü ama terminalde çalışıyor:
bakmak için zaten bir terminal açmış olman gerekiyor, ve baktıktan sonra projeye girmek için
ayrı bir pencere açıyorsun. Kokpit bu iki adımı tek yüzeye indirir.

**Neden şimdi:** Katman 1'in "bir hafta kullan, istatistikten karar ver" ön koşulu
karşılanmadı — 2026-09-06'da kuruldu, 2026-09-10'a kadar iki çağrı görüldü. Katman 2'ye
geçiş kararı bu yüzden *veriyle* değil *Scryne'ın açık tercihiyle* verildi (2026-09-10).
Sebep "Katman 1 yetersiz" değil, **"tek yüzey istiyorum"**. Bu ayrımın kayda geçmesi önemli:
ileride "N+1 kuralı neden delindi" diye bakıldığında cevap burada.

## Hedef Kullanıcı

Scryne. Tek kişi, tek makine (Windows 11), yerel. Dağıtım, çok kullanıcı, kimlik doğrulama,
uzaktan erişim — hiçbiri yok.

## Temel Özellikler (v1)

**Pano.** Her proje bir kart: aşama rozeti (`fikir`→`tamamlandi`), roadmap ilerleme çubuğu
(✅/🔄/⏳ sayımından), sıradaki fazın adı, git durumu (branch, kirli dosya sayısı, ahead/behind,
son commit ne zaman), "nerede kaldın" satırı. Kartta tek aksiyon: **Başlat**.

**Terminal.** Başlat'a basınca o proje klasöründe gerçek bir PTY açılır ve içinde doğrudan
`claude` çalışır — session-start hook'u bağlamı kendisi enjekte eder, yani karttaki durumdan
tek tıkla oturuma girilir. Sekmeli: aynı anda birkaç oturum açık olabilir. **Bu paralel ajan
değil** (o 2026-09-06'da gerekçeleriyle reddedildi); kazanç, uygulamanın süreci sahiplenmesi
sayesinde gelen **canlı oturum farkındalığı**: "ScryneQuant — 40 dakikadır açık". Bu bilgi
bugün hiçbir yerden görünmüyor.

**Veri kaynağı: Katman 1.** Pano `durum.py --json` çıktısını çizer. Yeni bir toplayıcı
yazılmaz; script zaten dedupe, cache ve şema sürümleme dertlerini çözmüş durumda.

## Ürün hissi

Bilgisayarı aç → Kokpit'i aç → 10 saniyede "bugün ScryneQuant Faz 2, OsintLab temiz, beyin
logu taze" → karttan Başlat → içindesin. Kokpit terminalin yerine geçmez; **girmeden önceki
ve çıktıktan sonraki 60 saniyeyi** düzeltir.

## Kapsam Dışı

Planın "Ne değil" bölümü aynen geçerli, v1 için daraltmalarla:

- **Kendi veritabanı yok.** Kokpit hiçbir veriye sahip olmaz; gösterdiği her bayt git'in
  zaten takip ettiği bir dosyadan türetilir. Uygulama silinirse hiçbir şey kaybolmaz.
  Lens, depo değil.
- **v1 hiçbir yere yazmaz.** Hook'lar bu dosyalara zaten yazıyor; ikinci yazar yarış koşulu
  demek. Dar yazmalar (roadmap ⏳→🔄, `asama` ilerlet, inbox'a not) okuma penceresi oturduktan
  sonra gelir.
- **Editör yok.** Kod VS Code'da veya terminalde yazılır, Monaco gömülmez.
- **Paralel ajan ordusu yok.** Sekmeler eşzamanlı çalışma için değil, süreklilik için.
- **Öneri motoru yok.** Katman 3, ayrı ve sonraki iş.
- **Sağlık ve Envanter sayfaları v1'de yok** (2026-09-10 kararı). Veri tarafı bedava — Katman
  1 JSON'u ikisini de zaten üretiyor — maliyet iki ekran tasarımı. v1.1'e bırakıldı, çünkü
  "tek yüzey" hissini veren minimum Pano+Terminal.

## Kritik mimari karar — Electron kabuğu, ayrı PTY süreci

2026-09-06 planı "v1'de Electron YOK, önce tarayıcı" diyordu. Gerekçe tek bir şeydi:
`node-pty` native modül, Electron'un içinde her sürümde ABI uyuşmazlığı ve `electron-rebuild`
derdi çıkarır; elde çalışan hiçbir şey yokken ConPTY ile boğuşmak istenmiyordu.

**2026-09-10'da Electron v1'e alındı, ama gerekçeyi ezmeden:** PTY sunucusu **ayrı bir düz
Node süreci** olarak çalışır, Electron sadece pencereyi ve arayüzü taşır.

- `node-pty` düz Node'a karşı bir kez derlenir, Electron'un ABI'sini hiç görmez →
  `electron-rebuild` gerekmez.
- Electron main süreci açılışta PTY sunucusunu çocuk süreç olarak başlatır, kapanışta öldürür.
- Renderer localhost WebSocket üzerinden bağlanır.
- Yan fayda: kabuk bozulursa aynı arayüz tarayıcıda da açılır. Planın "kabuk değişir, frontend
  ve PTY sunucusu aynı kalır" ilkesi bozulmuyor — tersine, süreç sınırıyla korunuyor.

Bedeli: bir fazladan süreç ve onun yaşam döngüsü yönetimi (yetim süreç bırakmama, port
çakışması).

## Riskler

1. **ConPTY/Windows.** En büyük teknik risk. Çalışan bir PTY yoksa geri kalan her şey vitrin.
   **Finalizasyondan önce spike ile doğrulanacak** (Akış adım 3). Takılırsak
   `chaitanyagiri/munder-difflin` (MIT) kaynak olarak okunur — v0.4.4'te `cmd.exe` argüman
   kırpması hatasını çözmüşler. Kurulmaz.
2. **Kapsam kayması.** Bu araç haftayı yiyebilir. v1 dar tutulacak; Sağlık/Envanter'in
   dışarıda bırakılması bilinçli.
3. **İkinci yazar riski.** v1'in yazmaması bunu tanım gereği kapatıyor.
4. **Kullanılmama riski.** Katman 1 dört günde iki kez kullanıldı. Kokpit de kullanılmazsa
   bu, aracın değil ihtiyacın yanlış okunduğunun kanıtı olur — v1.1'e geçmeden önce bakılacak.

## Açık Sorular

- **A-01** — `node-pty` Windows 11 (build 26200) + güncel Node üzerinde ConPTY ile sorunsuz
  çalışıyor mu? Boyut, resize, renk, Ctrl+C, `claude`'un TUI'si. → **Spike.**
- **A-02** — Electron main → çocuk Node süreci: yetim süreç bırakmadan kapanış ve port
  çakışması nasıl ele alınacak? → Spike'ın ikinci yarısı.
- **A-03** — `durum.py --json` şeması Pano'nun ihtiyacı olan her alanı taşıyor mu, yoksa
  script'e alan eklenecek mi? (Ekleme gerekirse Katman 1'e dokunulur — tek doğruluk kaynağı
  orası kalmalı, Kokpit kendi toplayıcısını yazmamalı.)
- **A-04** — Pano ne sıklıkta tazelenir? Dosya izleme mi, açılışta+elle mi? (Cache'li script
  0.3sn sürüyor; dosya izleme gereksiz karmaşıklık olabilir.)
- **A-05** — Canlı oturum farkındalığı nereye kadar? Sadece "açık/kapalı + süre" mi, yoksa
  o oturumun son çıktısı da mı? İkincisi transcript okumak demek — ayrı iş.
