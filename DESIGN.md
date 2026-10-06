---
version: alpha
name: Kokpit
description: Scryne'in projelerini tek ekranda gosteren ve satirdan claude oturumu acan kisisel yer kontrol uygulamasi.
colors:
  # Spec `primary` ister; degeri tekrar etmemek icin referans (ayni token iki yerde yasamaz).
  primary: "{colors.birincil}"
  bg-base: "#0B0C0F"
  zemin: "rgb(11 12 15 / 0.65)"
  yuzey: "rgb(24 26 31 / 0.4)"
  yuzey-guclu: "rgb(34 37 43 / 0.82)"
  cam: "rgb(30 33 40 / 0.32)"
  terminal: "#07080A"
  kenar: "rgb(220 226 235 / 0.09)"
  kenar-guclu: "rgb(220 226 235 / 0.2)"
  metin: "#F3F5F8"
  metin-ikincil: "#C2C8D1"
  metin-soluk: "#A3A9B3"
  aksan: "#C3CEDB"
  aksan-metin: "#D3DBE5"
  aksan-uzeri: "#101216"
  birincil: "#E6EAF0"
  birincil-uzeri: "#101216"
  dikkat: "#C99A3E"
  dikkat-metin: "#D9AB52"
  hata: "#C4466E"
  hata-metin: "#CD6284"
  grafik-1: "#5B8DEF"
  grafik-2: "#0D9488"
typography:
  sans:
    fontFamily: Inter
  mono:
    fontFamily: JetBrains Mono
rounded:
  base: "0.75rem"
  kontrol: "0.5rem"
  rozet: "0.375rem"
---

# Kokpit

## Overview

Kokpit tek kullanicili, yerel bir yer kontrol uygulamasi: projelerin durumunu tek ekranda
gosterir ve satirdan tek tikla o klasorde bir `claude` oturumu acar. Kendi verisi yoktur;
gosterdigi her sey `durum.py --json` ciktisindan turetilir.

- **Mood:** *enstruman*. Ekran heyecanlandirmaz, yonlendirir. Kullanildigi an ise girmeden
  onceki 60 saniyedir.
- **Gorsel dil: Gumus cam** (2026-10-03, Scryne secti; tema onizlemesinde dort yon arasindan).
  Notr grafit zemin, soguk gumus isik, fircalanmis metal halka, akrilik pencere. 2026-09-10'dan
  2026-10-02'ye kadar OsintLab'in indigo/violet tabanini tasiyordu; o bag artik yok.
- **Kokpit'i ayiran sey renk degil, semantik:** OsintLab'da renk bir claim'in ne kadar saglam
  oldugunu tasir. Burada oyle bir sistem yok. Kokpit'in kendi kurali **mono = olculmus deger**:
  proje adi, faz sayisi, git sayisi, sure sayaci, branch. Mono gorursen bir olcum okuyorsun.

## Seffaflik: akrilik, kontrasti hesapli (2026-10-03)

Pencere Windows 11 akrilikli (`backgroundMaterial: 'acrylic'`, `nativeTheme` koyu): arkadaki
masaustu ve pencereler bulanik olarak sizar. **Gecmis:** 2026-09-10'da ayni sey denenip geri
alinmisti; acik gri duvar kagidinda cam paneller aciliyor, `metin-soluk` okunmuyordu. Yari
saydam bir yuzey arkasinda ne oldugunu bilmeden kendi kontrastini garanti edemez.

**Fark artik zeminin kendisi:** body her zaman bir `zemin` ton katmani tasir (koyu, alfa 0.65).
Alfa zevkle degil olcumle secildi: Kokpit'in arkasina bembeyaz tam ekran bir pencere konup
gercek ekran goruntusu (DWM kompozisyonu dahil, CDP bunu goremez) piksel piksel olculdu
(`seffaf-spike.ps1`, 2026-10-03):

| zemin alfa | ciplak zemin (beyaz arkada) | `metin-soluk` kontrasti | karar |
| --- | --- | --- | --- |
| 0.82 | rgb(35 36 38) | 6.57 | gecer ama seffaflik hissedilmiyor |
| 0.45 | rgb(82 83 85) | 3.26 | **kalir** |
| 0.62 | rgb(61-63) | 4.44-4.53 | esikte |
| **0.65** | rgb(56-58) | **4.74-4.84** | secilen |

Tek istisna sol-ust kosedeki gumus isik lekesi (4.14): orasi nav panelinin altinda kalir, ciplak
zeminde metin yok. **Kural: ciplak zemine `metin-soluk` konmaz eger o bolge sol-ust parlamanin
altindaysa;** genel olarak metin panellerin uzerinde durur.

Paneller (`yuzey` 0.4, `cam` 0.32) zeminden koyu oldugu icin kontrasti yalniz artirir; bu
yuzden seffaflik payi panellerde harcanir. Olculen: beyaz arkada panel 5.4-5.8, normal duvar
kagidinda 6.4-7.9.

- Windows akriligi kendi koyu tonunu da ekliyor (beyaz arkada 0 alfada bile ~rgb(140)); bizim
  zemin bunun ustune biner. Ayarlarda saydamlik kapaliysa DWM duz renge duser: yine guvenli.
- **Pencere odakta degilken akrilik kapanir** (Windows davranisi, olculdu: beyaz arkada zemin
  35 -> 24). Seffaflik yalniz aktif pencerede gorunur.
- Windows 11 22H2 (build 22621) alti ya da `~/.kokpit/ayarlar.json` `seffaf: false` -> opak
  pencere (`#0B0C0F`), gorunum ayni.

## Colors

Taban notr grafit `bg-base` #0B0C0F (hafif soguk egilim), metin rampasi #F3F5F8 -> #C2C8D1 ->
#A3A9B3. Rampa eski paletten bilerek daha acik ve sik: seffaf zeminde `metin-soluk`
4.5:1'i beyaz arkada da gecmeli (yukaridaki tablo).

- **`aksan` (buz-gumus) epistemik anlam tasimaz, "bu etkilesimli" demektir:** link, focus ring,
  aktif nav, canli oturum noktasi. Akromatik oldugu icin etkilesim yalniz renkle degil bicimle de
  okunur (dugme kenarligi, hover zemini).
- **`birincil` metal:** duz renk degil, ustten acik alta inen gumus gradyan (`.bg-birincil`
  icin index.css'te resim katmani; renk token'i zemin rengi olarak kalir).
- **Metin icin ham rampa degeri kullanilmaz.** `dikkat` ve `hata`nin `*-metin` varyanti var;
  nokta/kenarlik/zemin ham degeri, metin `*-metin` degerini kullanir. Ayrim olculebilir:
  metin esigi 4.5:1, dekoratif bilesen esigi 3:1.
- **"Temiz" durumunun rengi yoktur** — sadece metin. Her iyi seyi renklendirmek sinyali oldurur.
- Dorduncu bir renk ailesi acilmaz. Gumus akromatik oldugu icin ekrandaki tek tonlar amber ve
  kirmizidir: renk gorduysen bir sey seni bekliyor.

## Typography

**Inter** baslik, nav, buton, govde. **JetBrains Mono** yalnizca olculmus degerlerde.
Ikisi de `@fontsource` ile pakete gomulu — CSP `default-src 'self'` Google Fonts'u zaten
engellerdi ve yerel bir masaustu uygulamasi acilirken aga cikmamalidir.
Sayisal veri her zaman `tabular-nums`.

## Layout

**Kabuk mimarisi:** solda yuzen cam nav paneli (kenara yapisik degil, 12px bosluklu ve
yuvarlak koseli), ustte ince baslik seridi, altta icerik. Pano ve terminaller birbirinin
yerine gecmez; ikisi de her an bir tik uzakta.

**Oturumlar App seviyesinde yasar ve gorunum degisince UNMOUNT EDILMEZ.** Bu bir tasarim
tercihi degil, mimari zorunluluk: ilk surumde Pano'ya her gecis WS'i kapatip PTY'yi
olduruyordu, yani calisan bir `claude` oturumu kayboluyordu.

Yogunluk dashboard-dense: genis nefes payi yerine maksimum veri gorunurlugu.

## Elevation & Depth

Gercek `backdrop-filter` cami **yalnizca anahtar yuzeylerde**: kenar navigasyonu ve oturum
sekme seridi. **Olcum kutulari, proje tablosu, beyin blogu ve terminal cam DEGIL** — yari
saydam opak yuzey (`yuzey`) kullanirlar. Her elemente cam surmek hem cami siradanlastirir
hem GPU'yu yorar.

Panellerin kenarinda duz tek renk border yerine fircalanmis metal bir "light-catcher" halka
(`.halka`) var: sol-ustte guclu parlama, sag-altta ikinci zayif yansima; isik kaynagi tutarli
bicimde sol-usttedir. Cam yuzeyler (`.cam`) 18 px blur + hafif doygunluk ve ust kenarda 1 px ic
isik tasir.

`backdrop-filter` **asla anime edilmez.**

## Motion

Spec'in `motion` token bolumu yok (lint: bilinmeyen anahtar export'ta sessizce yutulur), bu
yuzden sureler burada, kodda Tailwind sinifi olarak (`duration-[180ms]`) yasar.

- **Geri bildirim: 120 ms** — basma, odak, hover rengi.
- **Gecis: 180 ms** — gorunum degisimi, sekme secimi; yalniz `transition-colors`.
- **Anime edilmeyen:** `backdrop-filter` ve blur'lu yuzeylerin **boyutu**. Kenar cubugu
  daralirken genislik anime edilmiyordu diye degil, edilince her karede yeniden blur + ana
  alanda layout + xterm `fit()` + PTY resize zinciri tetiklendigi icin (2026-09-20'de olculup
  kaldirildi). Layout hareketi ani olur; hareket yalniz `transform`/`opacity`/renk uzerinde.
- `prefers-reduced-motion: reduce` altinda tum gecisler kapanir.

## Sayfalar (2026-09-21, v2)

- **Sağlık** — boru zinciri tek satırda dört halka + ok (kart ızgarası değil); düşmemiş
  oturumlar tablosu; bütçe grafiği geniş, "Aria ile konuş" dar (2:1, eşit değil). Grafik
  paleti `dataviz` doğrulayıcısıyla koyu yüzeyde test edildi (2026-10-03, #16181c): yeni girdi
  `grafik-1` çelik mavisi, çıktı `grafik-2` teal. Gümüş aksan grafikte kullanılamaz (akromatik:
  lightness band + chroma floor FAIL). Renk yalnız
  seri kimliği; değerler metin token'larında. Ekran okuyucu için `sr-only` tablo.
- **Envanter** — drift en üstte (tek "müdahale" bilgisi; yoksa sakin yüzey), skill/MCP
  çipleri mono, transcript hijyeni ölçüm satırı.
- **Not kutusu** — yerel `<dialog>`, `bg-yuzey-guclu`, arka plan `black/50`. Cam değil.
- **Dikkat noktası** — zil sonrası `bg-dikkat` + `ring-2 ring-dikkat/30`, statik. Renk tek
  başına anlam taşımaz: sekmede `title` ve `sr-only` metin.
- **Komut paleti** (2026-09-29) — not kutusuyla aynı yüzey (yerel `<dialog>`, cam değil),
  üstten %12 aşağıda; grup etiketi `etiket` sınıfıyla sol sütunda, kısayol sağda soluk mono.
  Seçili satır yalnız `bg-yuzey`; vurgu rengi yok.
- **Proje grupları** (2026-09-29) — Aktif / Kullanımda / Arşiv; başlıklar `etiket`, arşiv
  chevron'lu düğme ve varsayılan kapalı. Arşiv satır adları `metin-soluk`: geri planda durur.
- **Alarm şeridi / güvenli kapatma şeridi** — `dikkat` tonu yalnız müdahale gerektiğinde;
  kapanan oturumun noktası `animate-pulse bg-dikkat` (hareket azaltmada durur).
- **İkon** — `public/kokpit.svg`: grafit zemin, 270° ölçek yayı (gümüş gradyan),
  beyaz ibre. Metin yok; 16 px'te tek şekil okunur. `npm run ikon` → `.ico` + `.png`.

## Kanca yüzeyleri (2026-10-03, v2.2)

- **Etkinlik şeridi** — bölmenin üstünde tek satır, `bg-yuzey`, `text-xs`. Soldan sağa: durum
  işareti + adı, son araç (lucide ikonu + ad + mono hedef + `+N −M`), sağda tur süresi ve
  oturum özeti (mono, soluk). **Durumların rengi:** *çalışıyor* renksiz, üç noktalı nabız
  (`.calisma-isareti`, 1.2 sn; hareket azaltmada durur); *bitti* ve *hazır* boş halka;
  yalnız *seni bekliyor* amber (`dikkat`), satır zemini `dikkat/10`. `+` metin rengi, `−`
  soluk: ekleme/silme iyi-kötü diye boyanmaz. Ekran okuyucuya yalnız durum değişimi
  duyurulur (her araç değil). Tıklayınca son 30 araç: opak `yuzey-guclu` panel, zaman mono.
- **Limit ölçerleri** — kenarın altında, 1 px yüksek çubuk; dolgu `metin-ikincil`, ≥ %80
  `dikkat`, ≥ %95 `hata`. Değer mono, sıfırlanma "sıfırlanma 22:14" (ek yok: saate göre
  Türkçe ek üretmek hata kaynağı).
- **Ada** (v2.5'te hapın solundaki gösterge ikonu + durum noktası yerini Ada'nın gözüne bıraktı,
  bkz. "Ada v2.5") — saydam pencere, kart `rgb(14 15 18 / 0.93)` + halka (saydam pencere masaüstünü
  bulanıklaştıramaz; ton opak denecek kadar koyu, arkada ne olursa olsun okunur).
  Kapalıyken hap (`rounded-full`), açıkken `rounded-2xl` 440 px kart; açılış 160 ms
  `scaleY` + opaklık, `backdrop-filter` yok. Renk kuralı aynı: amber yalnız seni bekleyen.

## Vibe yüzeyleri (2026-10-04, v2.3)

Yeni renk yok, yeni cam yok. Hepsi mevcut token'larla; amber yine yalnız "seni bekliyor".

- **Hızlı komut menüsü** — etkinlik şeridinin sağ ucunda ⚡ (lucide `Zap`), şeridin yüksekliğinde,
  sol kenarlı. Açılır panel komut paletiyle aynı yüzey: opak `bg-base` taban + `yuzey-guclu` (cam
  değil; arkadaki terminal metni içinden okunmasın). Başlık `etiket` ("<proje> · gönder"); satırda ad
  `metin`, mesajın önizlemesi tek satır `metin-soluk`; son satır "Komutları düzenle" + mono dosya adı.
- **Ada eylemleri** — sıra sende olan oturumun altında, satırın metin hizasından (`pl-[1.75rem]`).
  Soru seçenekleri kenarlıklı satır düğmeler: rakam mono soluk (gerçekten basılan tuş o), etiket
  `metin`, açıklama soluk. **Seçenekler renksiz**: karar Scryne'ın, Kokpit bir seçeneği öne çıkarmaz.
  Hızlı komutlar `rounded-full` çip; yanıt kutusu `bg-terminal/60` (yazı alanı = terminal ailesi).
  Soru açıkken satır metni soruyu tekrar etmez, yalnız "Seni bekliyor · <başlık>".
- **Servis bölmesi başlığı** — tek bölmede de görünür: ▷ ikon, proje adı mono, komut mono soluk
  (kırpılır, tamamı `title`'da), adres düğmesi mono + `ExternalLink`, yeniden başlat, durdur.
  Çalışan servisin rengi yok (calisiyor gibi); adres gelmediyse "adres bekleniyor" soluk metin.
- **Pano satırı** — "Aç" ikonu artık `TerminalSquare` (claude oturumu), ▷ `Play` uygulamanın kendisi.
  Çalışan servis ▷ düğmesinde portuyla görünür (`:5173`, mono = ölçülmüş değer). "Sürdür" satırın alt
  metninde altı çizili metin düğmesi: ikincil eylem, düğme ağırlığı almaz.
- **Çalıştır kutusu** — not kutusuyla aynı desen (yerel `<dialog>`, opak taban); komut alanı mono.

## Ada v2.4 (2026-10-04)

Yeni renk yok. Amber yine yalnız "seni bekliyor".

- **Çok sorulu soru** — sorular alt alta; başlık `etiket` (büyük harf, soluk) + soru metni `metin`.
  Seçenekler v2.3'teki kenarlıklı satır düğmeler; **seçili** olan `border-kenar-guclu` + `bg-yuzey-guclu`
  ve rakamın yerinde lucide `Check` (renk değil biçim; `aria-pressed`). "Kendi cevabın…" metin düğmesi,
  tıklanınca yerinde yazı kutusu; yazılmış cevap seçili satır gibi görünür. Altta mono sayaç (`1/2`,
  ölçülmüş değer) ve tek birincil düğme "Cevapları gönder" (gümüş metal, uygulamadaki diğer birincil
  düğmelerle aynı). Tek soruda düğme yok: seçenek tek tıkla gider (claude'un kendi davranışı).
- **Son söz** — bitti satırının altında düz metin, `metin-ikincil`, markdown çizilmez (başlık işareti ve `**`
  atılır). Bakılmamışsa 4 satır, bakıldıysa 1 satır; kısa görünümde paragraf boşlukları tek satıra iner.
  "Tamamı" altı çizili metin düğmesi; açıkken en fazla 14rem, kendi içinde kayar.
- **Gördüm** — çip satırının sağ ucunda soluk metin düğmesi: ikincil eylem, çip ağırlığı almaz.
- **Bekleme süresi** — satırın sağındaki mono süre, sıra sende olan oturumda "ne zamandır bekliyor"
  (diğerlerinde oturum süresi); hapta özetin yanında soluk mono.
- **Klavye ipucu** — odak Ada'dayken kartın altında, kaydırma alanının dışında tek satır:
  `1–4 seçer · Tab gezinir · Esc bırakır`; tuşlar mono. Odak halkası uygulamanın `aksan` halkası.

## Ada v2.5: Ada'nın gözü (2026-10-04)

Scryne "pet tarzı" istedi; dört yön (gösterge ibresi, piksel ızgara, gümüş göz, piksel kedi) canlı
önizlemede sunuldu, **gümüş göz** seçildi. Esin: Coucou'nun Mochi'si, Notch Pilot. Claude'un maskotu
Clawd kullanılmaz (Anthropic markası).

- **Malzeme:** birincil düğmenin gümüş gradyanı (22×18, köşe 7 px), gözler grafit `#101216`. Yeni
  renk yok; amber yine yalnız "seni bekliyor" (gözün çevresinde halka, iki kez atar, sonra yanık kalır).
- **Davranış ölçülmüş durumdan gelir, uydurma duygudan değil.** Çalışırken bakış araca göre: Read/Grep
  satır okur (sıçramalı), Edit aşağı odaklanır, Bash kısılır, Web yukarı bakar, Agent yanındaki noktalara
  bakar, araçlar arası yukarı bakıp düşünür. Soru: gözler büyür, sana bakar. Bitti: 8 sn gülen gözler +
  tek zıplama, sonra yarı kapalı sakin gözler. 30 dk olay yoksa uyur (kapalı gözler, üç kez "z").
  Ada'dan cevap gönderilince bir kez baş sallar. İmleç kartın üstündeyken gözler onu izler (en fazla 1,6 px).
- **Alt ajan noktaları:** gövdenin sağında çalışan alt ajan başına bir nokta (en fazla 3),
  `SubagentStart`..`SubagentStop` (ölçüldü: ikisi de `agent_id` taşır, ajan ana tur bittikten sonra da sürebilir).
- **Limit kenarı:** hapın çevresi 5 saatlik limitle dolar, üst ortadan saat yönünde; %80 amber, %95
  kırmızı (kenardaki ölçerlerle aynı eşik). Kart açıkken çizilmez (orada çubuklar var).
- **Metin geçişi:** hap metni araç ya da durum değişince bir kez 180 ms soluklaşarak gelir; sayılar
  anahtar dışı (sayan süre her saniye titretiyordu).
- **Hareket bütçesi — ölçüldü, kural:** saydam ve akrilik pencerede **sonsuz CSS animasyonu yok.**
  Çalışan bir sonsuz animasyon, kademeli (`steps()`) bile olsa compositor'u 60 fps'te tutuyor ve pencere
  her karede yeniden birleşiyor. İlk sürümde çalışırken toplam %36 tek çekirdek ölçüldü. Hareket seyrek
  zamanlayıcıyla anlık konum değişimi (480 ms; okuma sıçramasında geçiş de yok). Ana pencerenin
  "çalışıyor" nabzı kademeli ve pencere arka plandayken duruyor (main süreçteki `blur`, `document.hasFocus`
  değil). Sonuç: göz canlıyken %2,3–2,9, durgunken %2,1–2,5 tek çekirdek (üç dönüşümlü tur; fark gürültü
  düzeyinde). Ölçüm yeniden: Ada görünürken süreç başına CPU + `GPU Engine` sayaçları.
- Hareket azaltmada zamanlayıcılar kurulmaz; tek seferlik animasyonlar son karede durur.

## Ada v2.6: masaüstü ajanı (2026-10-04)

Scryne: "Ada sürekli açık olsun, limitler terminal açmadan da görünsün, masaüstü ajanım olsun."
Yeni renk yok, yeni cam yok; amber yine yalnız "seni bekliyor" (ve ≥ %80 limit, ölçerlerle aynı eşik).

- **Hep görünür.** Kokpit öndeyken, oturum yokken, ana pencere tepsideyken de. Oturumsuz hap: göz +
  "Hazır" (`metin-ikincil`: söylenecek iş yok) + limitler. Kokpit öndeyken pencerenin başlık çubuğunun
  ortasına oturur; boş alan fareyi geçirdiği için başlık çubuğu tıklanır kalır. Tepsi menüsünde iki
  anahtar: "Ada'yı göster", "Kokpit öndeyken de göster".
- **Hapta iki limit:** `5s %15  hafta %92`, mono, soluk; ≥ %80 olan `dikkat-metin`. Kenar halkası yine
  5 saatlik (v2.5 kuralı; iki halka iki anlam taşıyıp okunmazdı). Sıfırlanma anı geçtiyse değer 0'dır
  (pencere yenilendi), sonraki ölçüm gerçeğini getirir.
- **Açık kartta sıra:** Kokpit oturumları → "Kokpit dışında" (terminal/VS Code oturumları, salt okunur:
  durum işareti + ad mono + durum + bu durumda geçen süre; tıklanmaz, tam yol `title`'da) → "Görev ver"
  → limitler. Limitlerin altında ölçüm satırı: "az önce ölçüldü" / "ölçüldü 14:05" + neden eski olduğu
  ("claude açılınca tazelenir") + tek turluk tazele ikonu (600 ms dönüş, sonsuz değil).
- **Görev ver:** başlık `etiket`, sağda proje çipi (`rounded-full`, mono ad + chevron). Liste yerinde
  açılır, yerel `<select>` değil (odak almayan saydam pencerede açılır menü güvenilmez). Yazı kutusu
  Ada'nın diğer yanıt kutularıyla aynı (`bg-terminal/60`). Gönderince kutunun yerinde 6 sn "X oturumu
  açılıyor" ve oturum yukarıda satır olarak belirir. Arşiv projeleri listede yok; en sonda ScryneOS (Aria).
- **Tepsi:** Kokpit ikonu; ipucunda `Kokpit · 5 saat %15 · hafta %92`. X tepsiye indirir; ilk seferde bir
  kez balon. Çıkış: tepsi menüsü ya da palet "Kokpit'ten çık".

## Ada v2.7: saklanma (2026-10-06)

Scryne: "Ada YouTube izlerken orada duruyor; kalsın ama gizlemek için bir şey olsun." Ada'yı kapatmak (tepside zaten
vardı) değil, **yolundan çekilmek** istendi. Yeni renk yok, yeni cam yok; amber yine yalnız "seni bekliyor".

- **Çene (saklı Ada).** Ada ekranın üst kenarının arkasına çekilir; görünen yalnız gümüş gövdenin alt kenarı
  (30×8 px, alt köşeler 8 px) ve gözlerin alt yarısı: kenardan bakıyor. Malzeme gözün gövdesiyle aynı gradyan.
  Tutulacak alan görünenden geniş (çevresinde 20 px, altında 7 px) ve kenara yapışık: ekranın üst kenarı sonsuz
  yüksek bir hedeftir. Uyurken gözler çizgi. Seni bekleyen varsa çenenin çevresinde amber halka + hafif amber gölge,
  durgun. Giriş tek seferlik 220 ms (kenardan iner), sonsuz animasyon yok (hareket bütçesi, v2.5).
- **Niyetli bakış.** İmleç çenenin üstünde **380 ms** durunca kart kenardan sarkar; geçip giderse açılmaz (çene ekranın
  üst ortasında, tarayıcı sekmesine giden imleç oradan geçer). Tıklayınca beklemeden sarkar. Sarkan kartın üst köşeleri
  düz, üst halka çizgisi yok (`.ada-sarkan`): kart ekranın kenarından iniyor, ondan kopmuyor.
- **Saklıyken kendiliğinden açılma yok.** Normalde "bitti/seni bekliyor" kartı 5 sn açar; saklıyken açmaz, yalnız çene
  amber yanar. Scryne gizlemeyi seçti; Ada'nın görevi haber vermek, araya girmek değil.
- **Kenara sakla / Geri getir** — açık kartın başlık satırının sağ ucunda lucide `ArrowUpToLine` / `ArrowDownFromLine`
  (soluk ikon, hover'da `yuzey-guclu` zemin). Kapalı hapta yok: hap kompakt kalır ve hover zaten kartı açar. Aynı
  anahtar tepsi menüsünde ("Kenara sakla") ve **Ctrl+Alt+Shift+G**'de. Kalıcı (`adaSakli`).
- **Sinema (tam ekran).** Ön plandaki pencere Ada'nın ekranını tam kaplıyorsa (tam ekran video, oyun, sunum) Ada
  pencereyi **tamamen** gizler. Seni bekleyen varsa yalnız çene görünür. Tam ekran bitince önceki hal (hap ya da çene)
  geri gelir. Algı: `user32` (koffi) ile 600 ms'de bir ön plan dikdörtgeni = ekran dikdörtgeni; büyütülmüş pencere
  (`IsZoomed`, kenarları taşan çerçeve), masaüstü (`Progman`/`WorkerW`) ve başka ekrandaki tam ekran sayılmaz.
  Tepsiden kapatılabilir ("Tam ekranda çekil", `adaTamEkran`). Sinemada kartta saklan düğmesi yok: çekilme otomatik.
- **Yer.** Hap başlık satırından yatay sürüklenir (5 px eşik; altı tıklamadır, sürüklemenin ardından gelen tık yutulur).
  Merkeze 28 px yaklaşınca tam ortaya oturur (mıknatıs). Yer çalışma alanı genişliğinin oranı olarak saklanır
  (`adaKonum`; orta = `null`). Tepside ortada değilse "Ada'yı ortala". İmleç sürükleme boyunca `grabbing`.

## Components

- **Pano = olcum seridi + proje tablosu + beyin blogu.** Esit agirlikli kart izgarasi yasak;
  denendi ve odak noktasi uretmedigi icin geri alindi. Tablo hizali sutunlardir, kart degil.
- **Rozetler ikon tasir.** Asama ve git durumu lucide ikonu + metin; renk tek basina anlam
  tasimaz.
- **Roadmap ilerlemesi cubuk degil sayidir** (`5/9`). 12 faza kadar faz basina bir isaret,
  ustunde tek olcum cubugu — 32 faz 32 nokta uretip serit haline geliyordu.
- **Terminal cam degil, tam opak.** Akan metnin arkasi bulanik olmamali; ayrica xterm'de
  saydamlik DOM renderer'a dusurup ikinci bir kompozisyon maliyeti bindiriyor.
- **xterm `fit()` font yuklendikten sonra cagrilir.** Yedek fontun hucre olculeriyle olculurse
  satir sayisi kabuga yanlis bildirilir ve TUI kayar. `document.fonts.ready` beklenir.
- **Ikon seti: lucide**, `currentColor` ile inline SVG. Emoji yasak — roadmap verisindeki
  isaretler arayuzde ikona cevrilir, oldugu gibi basilmaz.

## Do's and Don'ts

- **Yapma:** `zemin` alfasini olcmeden dusurmek. 0.65 beyaz arkada olculdu; daha seffafi
  `seffaf-spike` tekrarlanmadan girmez.
- **Yapma:** her yuzeye `cam` surmek. Cam nav ve sekme seridine aittir.
- **Yapma:** `backdrop-filter` animasyonu.
- **Yapma:** dorduncu bir renk ailesi acmak.
- **Yapma:** metin icin ham rampa rengi kullanmak; `*-metin` varyanti vardir.
- **Yapma:** "temiz", "hazir", "tamam" gibi iyi durumlari renklendirmek.
- **Yap:** olculmus her degeri mono yuzle yaz.
- **Yap:** her paneli `halka` ile ayir; duz border yerine light-catcher gradient.
