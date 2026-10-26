---
title: Devir, Bozulan Oturumlar ve Gece Görevi Takibi
created: 2026-10-05
type: devir
status: uygulandi
---

# Devir: Bozulan Oturumlar ve Gece Görevi Takibi

Kaan, 5 Ekim sabahı: "audit sonunda bozulan oturumlar ve gece görevi takibi meselelerini halledelim." İkisi de 4 Ekim gecesinin vakası; kanıtlar aşağıda, kararlar bu oturumun.

## 1. Bozulan Oturumlar: `/clear` Sonrası Kimlik

**Belirti:** Bilgisayar yeniden açılınca Kokpit Uyanbi sekmesini `/clear` öncesi konuşmayla geri yükledi; gece çalışan konuşma görünmedi.

**Kanıt:**
- Defter (`~/.kokpit/oturumlar.jsonl`) Uyanbi'yi `claude: 1dffe60c-…` ile kaydetmiş (açılış anı, `--session-id`).
- Kaan sonra `/clear` attı; süreç aynı kaldı (pid 15476), konuşma yeni kimliğe geçti: `70f633c6-e535-43ef-afcc-f78417673e2f` (86 MB, gece işinin tamamı).
- Geri yükleme `claude --resume 1dffe60c` açtı (`electron/pty-server.cjs:261-273`).

**Çözüm yönü:** Her hook gövdesi `session_id` taşıyor ve `X-Kokpit-Oturum` başlığı hangi sekme olduğunu söylüyor. Gövdedeki kimlik defterdekinden farklıysa defter güncellenir. SessionStart'a güvenme: HTTP SessionStart gelmiyor (`electron/etkinlik.cjs:7`, ölçülmüş). İlk UserPromptSubmit yeter. Test: `scripts/test-kanca.cjs` desenine `/clear` sonrası farklı `session_id` ile gelen olay eklenir.

## 2. Gece Görevi Takibi

**Belirti:** Kaan iki ajanı gece bıraktı, kapanışı ayrı bir bekçiye verdi. Ajanlar 02:37 (Senkro) ve 02:57'de (Uyanbi) bitirdi; bilgisayar kapanmadı, Kaan 05:56'da elle kapattı. Kural: gece işi bitince bilgisayar kapanır (vault `Kurallar.md`).

**Kanıt:**
- Bekçi: `C:\Users\kaan\Documents\night-watch\session_watch.py`, günlük `session_watch.2026-10-05.log`. Bitti ölçütleri: sinyal dosyası, `claude.exe` sürecinin gitmesi ya da 60 dk boşta.
- Ajanlar Last-Session yazdı ama oturumu kapatamadı; geriye boşta kuralı kaldı ve tetiklenmedi.
- Büyük olasılıkla neden: boşta ölçüsü transcript mtime'ıydı. Claude Code dosyaya olay eklemeden dokunuyor (`1dffe60c` boyut sabit, mtime ilerledi). Bilgisayar uyumadı (olay günlüğünde uyku yok).
- Bekçi o sabah düzeltildi: jsonl içindeki son `timestamp` okunuyor, 30 dakikada bir heartbeat yazıyor. Süreç kimlikleri hâlâ elle giriliyor.

**Kokpit'in elindeki daha iyi sinyal:** Kanca köprüsü her sekme için `bitti` / `calisiyor` / `bekliyor` durumunu ve alt ajanları zaten biliyor (`electron/etkinlik.cjs`). Önerilen yön: sekmeye "gece görevi" işareti; işaretli sekmelerin hepsi `bitti` durumunda, alt ajanı yok ve N dakikadır olay yoksa `shutdown /s /t 300`. Kapatma Kokpit kapansa da çalışmalı (bekçi ayrı süreç ya da Kokpit'in tetiklediği `session_watch.py`). Pid ve klasör elle girilmez.

**Kaan'ın kararı (5 Eki sabah):**
1. İşaretli sekmeler `bitti` olunca Kokpit her ajana "bitti mi" diye sorar.
2. Ajan onay verince güvenli çıkış: Last-Session yazılmış, oturum düzgün kapanmış (SessionEnd gelmiş).
3. Sonra kapanma tetiklenir; kapanma gerçekleşene kadar kontrol sürer.

**Uygulama notları (öneri, karar bu oturumda):**
- Soru ve cevap makine okunur olmalı: soru ajandan tek satırlık bir işaret ister (örnek `GECE: BITTI` ya da `GECE: DEVAM`), Kokpit bunu Stop'tan sonra transcript'in son asistan mesajında arar. `DEVAM` diyen ajan çalışmayı sürdürür, bir sonraki `bitti`de yeniden sorulur.
- Gece `bekliyor` durumuna düşen ajan (izin, soru) sabaha kadar takılır. Kokpit N dakika sonra cevap verir: "Kaan uyuyor; kendi kararını ver ya da işi güvenli yerde bırakıp bitir."
- Güvenli çıkış: onaydan sonra pty'ye `/exit`; SessionEnd belli sürede gelmezse süreç sonlandırılır, günlüğe yazılır.
- Kapanma doğrulaması: `shutdown /s /t 300` sonrası makine hâlâ ayaktaysa (bekçi yaşıyorsa) 10 dakikada bir yeniden tetiklenir, gerekirse `/f /t 0`. Kaan'ın bilinçli iptali için kaçış gerekir: `shutdown /a` sonrası tekrar tetiklememek için bir iptal işareti (Kokpit düğmesi ya da `night-watch/iptal` dosyası).
- Bekçi ayrı süreç kalır (Kokpit çökerse kapanış yine olur); Kokpit onu besler.

## 3. Windows Yeniden Başlatmasına Karşı

**Ölçülen durum (5 Eki):**
- Etkin saatler 09:00 ile 03:00 arası: 03:00 ile 09:00 arası Windows Update makineyi yeniden başlatabilir, gece işinin tam penceresi.
- Kanıtlanmış vaka: 1 Eki 05:44, `MoUsoCoreWorker.exe` planlı yeniden başlatma yaptı.
- `night_watch.py`'nin etkin saat görevi `NightWatch-Hours` hiç kurulmamış; `NoAutoRebootWithLoggedOnUsers` ilkesi yok.

**Öneriler (yönetici onayı gerekir, bir kez):**
1. **Oturum açıkken otomatik yeniden başlatma yok:** `HKLM\SOFTWARE\Policies\Microsoft\Windows\WindowsUpdate\AU` altında `NoAutoRebootWithLoggedOnUsers = 1` (Windows 11 Pro bu ilkeyi okur). Güncellemeler indirilir ama yeniden başlatma bekler. En güçlü tek adım.
2. **Güncelleme penceresi gece kapanışı olsun:** bekçinin her gece yaptığı kapatma, bekleyen güncellemeleri kurmak için doğal pencere. Kapanış bekleyen güncelleme varsa "güncelleştir ve kapat" yolundan gider; güncellemeler birikmez. Kurulumda doğrulanmalı.
3. **Yedek kat, etkin saatler:** `NightWatch-Hours` görevi kurulur (`night_watch.py --install-admin`); gece görevi başlarken etkin saatler o andan 18 saat ileriye kayar.
4. **Yine de yeniden başlarsa dirilme:** Kokpit oturum açılışında başlar, gece işaretli ve onay vermemiş sekmeleri doğru kimlikle (madde 1 düzeltmesi şart) sürdürür ve ajana "yeniden başlatma oldu, kaldığın yerden devam" der. Bunun için oturumun kendiliğinden açılması gerekir; Windows'un "güncelleştirmeden sonra kurulumu bitirmek için oturum bilgilerimi kullan" seçeneği yalnız güncelleme yeniden başlatmalarında işe yarar.
