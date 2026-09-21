---
version: alpha
name: Kokpit
description: Scryne'in projelerini tek ekranda gosteren ve satirdan claude oturumu acan kisisel yer kontrol uygulamasi.
colors:
  # Spec `primary` ister; degeri tekrar etmemek icin referans (ayni token iki yerde yasamaz).
  primary: "{colors.birincil}"
  bg-base: "#090A0C"
  yuzey: "rgb(24 26 32 / 0.72)"
  yuzey-guclu: "rgb(30 33 40 / 0.85)"
  cam: "rgb(30 33 41 / 0.55)"
  terminal: "#06080F"
  kenar: "rgb(244 244 245 / 0.08)"
  kenar-guclu: "rgb(244 244 245 / 0.16)"
  metin: "#F4F4F5"
  metin-ikincil: "#A1A1AA"
  metin-soluk: "#86868F"
  aksan: "#8B5CF6"
  aksan-metin: "#956AF7"
  aksan-uzeri: "#14101F"
  birincil: "#F4F4F5"
  birincil-uzeri: "#090A0C"
  dikkat: "#C99A3E"
  dikkat-metin: "#D9AB52"
  hata: "#C4466E"
  hata-metin: "#CD6284"
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
- **Gorsel dil:** OsintLab ile ayni taban — modern dark theme, koyu indigo/violet zemin, cam
  yuzeyler, Inter + JetBrains Mono. Bu **bilincli bir karar** (2026-09-10, Scryne): global
  kural "hicbir proje bir oncekinin reskin'i olmasin" der, burada ayni dil isteniyor.
- **Kokpit'i ayiran sey renk degil, semantik:** OsintLab'da renk bir claim'in ne kadar saglam
  oldugunu tasir. Burada oyle bir sistem yok. Kokpit'in kendi kurali **mono = olculmus deger**:
  proje adi, faz sayisi, git sayisi, sure sayaci, branch. Mono gorursen bir olcum okuyorsun.

## Seffaflik: denendi, geri alindi

2026-09-10'da pencere Windows 11 native akriligiyle kuruldu
(`backgroundMaterial: 'acrylic'`); masaustu duvar kagidi pencerenin arkasindan goruniyordu.
**Geri alindi.** Sebep olculebilir: duvar kagidi acik gri oldugunda akrilik onu geciriyor, cam
paneller aciliyor ve `metin-soluk` seviyesindeki her sey okunmaz hale geliyordu. Yari saydam
bir yuzey, arkasinda ne oldugunu bilmedigi surece kendi kontrastini garanti edemez.

**Karar: pencere opak** (`backgroundColor: '#090a0c'`). Cam hala var, ama artik uygulamanin
**kendi zemini** uzerinde: kisik bir indigo/violet radial mesh. "Camin arkasinda bir sey
olmali" kurali korunuyor; o sey masaustu degil, bizim zeminimiz.

## Colors

Taban OsintLab paletinden: `bg-base` #090A0C, metin rampasi #F4F4F5 → #A1A1AA → #86868F,
`aksan` #8B5CF6.

- **`aksan` (violet) epistemik anlam tasimaz, "bu etkilesimli" demektir:** link, focus ring,
  aktif nav, canli oturum noktasi.
- **`birincil` neredeyse beyaz zemin + koyu metin.** Birincil buton bir renk lekesi degil,
  bir isik lekesidir.
- **Metin icin ham rampa degeri kullanilmaz.** `dikkat` ve `hata`nin `*-metin` varyanti var;
  nokta/kenarlik/zemin ham degeri, metin `*-metin` degerini kullanir. Ayrim olculebilir:
  metin esigi 4.5:1, dekoratif bilesen esigi 3:1.
- **"Temiz" durumunun rengi yoktur** — sadece metin. Her iyi seyi renklendirmek sinyali oldurur.
- Dorduncu bir renk ailesi acilmaz.

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

Panellerin kenarinda duz tek renk border yerine ustten parlayip alta sonumlenen gradient bir
"light-catcher" halka (`.halka`) var; isik kaynagi tutarli bicimde sol-usttedir.

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
  paleti `dataviz` doğrulayıcısıyla koyu yüzeyde test edildi: yeni girdi `#8b5cf6` (aksan),
  çıktı `#0d9488` (teal). Açık teal/mavi adaylar lightness bandını geçemedi. Renk yalnız
  seri kimliği; değerler metin token'larında. Ekran okuyucu için `sr-only` tablo.
- **Envanter** — drift en üstte (tek "müdahale" bilgisi; yoksa sakin yüzey), skill/MCP
  çipleri mono, transcript hijyeni ölçüm satırı.
- **Not kutusu** — yerel `<dialog>`, `bg-yuzey-guclu`, arka plan `black/50`. Cam değil.
- **Dikkat noktası** — zil sonrası `bg-dikkat` + `ring-2 ring-dikkat/30`, statik. Renk tek
  başına anlam taşımaz: sekmede `title` ve `sr-only` metin.
- **İkon** — `public/kokpit.svg`: koyu indigo zemin, 270° ölçek yayı (violet gradient),
  beyaz ibre. Metin yok; 16 px'te tek şekil okunur. `npm run ikon` → `.ico` + `.png`.

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

- **Yapma:** pencereyi tekrar seffaf/akrilik yapmak. Yukaridaki gerekce olculdu.
- **Yapma:** her yuzeye `cam` surmek. Cam nav ve sekme seridine aittir.
- **Yapma:** `backdrop-filter` animasyonu.
- **Yapma:** dorduncu bir renk ailesi acmak.
- **Yapma:** metin icin ham rampa rengi kullanmak; `*-metin` varyanti vardir.
- **Yapma:** "temiz", "hazir", "tamam" gibi iyi durumlari renklendirmek.
- **Yap:** olculmus her degeri mono yuzle yaz.
- **Yap:** her paneli `halka` ile ayir; duz border yerine light-catcher gradient.
