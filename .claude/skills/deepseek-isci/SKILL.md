---
name: deepseek-isci
description: Mekanik, iyi tanımlı, testle ölçülen implementasyon işini (silme, taşıma, kalıp izleyen ekleme) ya da resim okuma işini (ekran görüntüsü, fotoğraf) ucuz DeepSeek işçisine devretmek gerektiğinde kullan.
---

# DeepSeek işçisi

DeepSeek işçisi ayrı bir başsız Claude Code süreci (`claude -p`). Ortamı yalnız o süreç için DeepSeek/OpenCode uç noktasına çevrilir; Agent aracı yalnız Anthropic modellerini seçebildiği için `scripts/ds-isci.ps1` ile başlatılır. İşçi senin bağlamını görmez.

## Kim ne yapar

- **DeepSeek:** angarya. Mekanik, iyi tanımlı, kabul komutuyla ölçülen iş: silme, taşıma, mevcut kalıbı izleyen ekleme. Ayrıca resim okuma (aşağıda).
- **Sonnet alt ajanı:** tasarım kararı, UI, belirsiz kapsam, DeepSeek'in takıldığı paket.
- **Opus:** denetim.

## Resim okuma

İşçi görüntü girdisi alır (jpeg, png, gif, webp; yalnız resim, video ve PDF değil). Çok sayıda ekran görüntüsünü ya da fotoğrafı kendi bağlamına almak yerine ona okut: resim dosyalarını `-Dizin`'in altına koy, brifte her resim için yanıtlanacak somut soruları yaz ve yanıtı bir dosyaya yazdır. Brife "göremiyorsan uydurma, öyle yaz" cümlesini ekle. Görsel yargı gerektiren iş (hizalama, tasarım kalitesi, ince piksel farkı) orkestratörde ya da Sonnet'te kalır; işçiye olgu sorulur: hangi sekme seçili, ekranda hangi metin var, hata mesajı ne diyor.

## Brif

Brif kendi kendine yeterli bir dosyadır; işçi başka hiçbir şey bilmez. Şunları içerir:

1. **Hedef:** tek cümle.
2. **Dokunulacak yerler:** `dosya:satır`.
3. **Dokunulmayacaklar:** açık liste.
4. **Kabul komutları:** geçmesi gereken komutlar (`npx tsc --noEmit`, `npm run test:*` vb.).
5. **Sınır:** commit atma, push yapma, repo dışına yazma.
6. **Rapor:** 5-10 satır; değişen dosyalar, koşulan komutlar ve sonuçları, takıldığı yer.

## Başlatma

Brifi scratchpad'e yaz, sonra PowerShell aracıyla `run_in_background: true` ile başlat:

```
pwsh -File scripts/ds-isci.ps1 -Brif <brif.md> -Dizin <repo> -Cikti <cikti.json>
# Varsayılan izin listesi dar: npm run typecheck|build|test*|design:lint, npx tsc, node --check,
# git status/diff/log/rm/mv. Başka kabul komutu gereken projede -IzinliAraclar ile ver.
# Desende `:*` yazma (eski önek sözdizimi sayılır, `test:ui`'yi eşlemez); `test*` yaz.
# İşçi package.json'ı düzenleyebildiği için test* yine de keyfi komut kapısıdır: commit/push
# yasağı güvenlik sınırı değil kuraldır. Her paketten sonra git log ve git status ile doğrula.
```

Bitince çıktı JSON'unun `result` alanını ve `git diff --stat`'ı oku. Betik son satırda sağlayıcı, model, çıkış kodu ve çıktı yolunu yazar; hata ayrıntısı `<cikti>.err` içindedir.

İsteğe bağlı: `-Efor low|medium|high|xhigh|max`, `-Saglayici opencode|ozel|deepseek`, `-IzinliAraclar` (`git commit` ve `git push` her zaman kapalı). OpenCode Go'da `-Efor high` ile koşan turda düşünme token'ı 0 raporlandı (2026-11-17); eforun çeviriden geçtiği doğrulanmadı, ona güvenme.

## Anahtar ve sağlayıcı

Betik anahtarı `~/.kokpit/saglayici.json`'dan kendisi okur ve yalnız çocuk sürecin ortamına koyar. Orkestratör o dosyayı açmaz. Hangi sağlayıcının seçileceğini görmek için `-Kuru` ekle; model adlarını ve `anahtarVar` bilgisini yazar, hiçbir şey çalıştırmaz. Sıra `opencode`, `ozel`, `deepseek`; anahtarı ve baseUrl'i dolu ilk kayıt kazanır.

## Doğrulama

Kabul komutlarını kendin koş; işçinin raporu kanıt sayılmaz. Commit'i orkestratör atar.

## Yükseltme

Aynı pakette iki düzeltme turundan sonra kabul komutları geçmiyorsa paketi Sonnet'e devret.

## Paralellik

Aynı dosyalara dokunan paketler sırayla koşar. Paralel koşan paketlerin dosya kümeleri ayrık olmalı.

## Limit (OpenCode Go, DeepSeek V4.1 Flash)

Aylık $100 hak; 5 saatte en çok %20, haftada en çok %50. Hafta içi 01-04 ve 06-10 UTC'de fiyat 2 kat; büyük paketleri bu pencerelerin dışına yerleştir.
