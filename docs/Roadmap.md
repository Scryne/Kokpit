---
proje: Kokpit
created: 2026-09-10
modified: 2026-09-10
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
| 5 | Sertleştirme + günlük kullanıma alma | 🔄 Devam Ediyor | Erişilebilirlik/animasyon pasları geçti, `kokpit` komutu çalışıyor, bir hafta gerçekten kullanıldı |

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
  - ⏳ `fixing-accessibility` ve `fixing-motion-performance` pasları — **bilerek bekletiliyor**,
    gerçek kullanımdan sonra yapılacak.
  - ⏳ Bir hafta günlük kullanım.
- **Notlar:** Kullanılmazsa v1.1'e (Sağlık/Envanter sayfaları) **geçilmez** — Katman 1'in
  dersi. Aracın değil ihtiyacın yanlış okunduğu anlaşılır.
