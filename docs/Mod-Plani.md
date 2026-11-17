---
proje: Kokpit
created: 2026-11-04
modified: 2026-11-04
type: plan
status: durduruldu
dayanak: "Keşif: 3 Explore ajanı + Plan ajanı + bağımsız gate incelemesi (2026-11-04)"
---
# Kokpit → Claude Desktop modu

> **DURDURULDU (2026-11-17, Kaan):** Claude Desktop'a geçiş resmen durduruldu; Kokpit bir süre
> daha Electron uygulaması olarak devam ediyor. M0-M8 fazları emekli; bu dosya yalnız kayıt
> olarak kalıyor. Yerine Electron hattında yeni fazlar işleniyor (bkz. Roadmap Faz 32+).

## Context

Kokpit, 32 fazlık bağımsız bir Electron dashboard'u (Pano, Sağlık, Envanter, Okuma, Etkinlik/limit, Ada, Gece görevi, PTY terminali). Kaan'ın isteği: dashboard'u sıfırdan büyütmek yerine, Kokpit'in sağladığı değeri (ikinci beyin dahil) Claude Desktop'un kendisini **modlayarak** kullanmak. Claude Code'un mod (plugin) sistemi buna izin veriyor: `Pane`, `AbovePrompt` band, `ToolUse`, status/toast, slash komutu, olay hook'ları, `$.fs`, `$.process`, `$.session.usage()`; `surface: 'desktop'` ayrı bir yüzey.

Yöntem: 3 paralel Explore (Kokpit envanteri, ikinci beyin/hook ekosistemi, mod API sınırları) → Plan ajanı taslağı → bağımsız `gate` incelemesi (2 engelleyici, 7 önemli bulgu; hepsi bu sürüme işlendi).

**Kaan'ın kararları (bu oturumda):**
- Hedef yüzey: **yalnız Claude Desktop'taki Code sekmesi.** Chat sekmesi kapsam dışı (mod oraya uzanmaz).
- **Gece görevi OS tetikleyicisine taşınır** (Görev Zamanlayıcı). Moda eklenmesi sonra denenir; olmazsa kodla (headless betik) çalışır. Ada ve Electron'un geri kalanı: bu oturumda ayrıca karara bağlanmadı → varsayılan "bakım modu" (aşağıda).

## Doğrulanmamış temel varsayımlar (M0 bunları ölçer)

- Masaüstünün gömülü motorları 2.1.281 / 2.1.308; mod API tipleri 2.1.318. Desteklenip desteklenmediği bilinmiyor (ölçüm: `$.session.version()`, `d.ts:2967`).
- `$.process` şemada "CLI only" (`d.ts:3639`); masaüstünde çalışması bekleniyor.
- `Client` masaüstü tablosunda var (`d.ts:4005-4018`) ama `d.ts:15371` "desktop once it has them".
- Pane eşiği (144/110 sütun) terminal terimleriyle yazılmış; kullanıcı eylemiyle (slash komutu) açılan pane her genişlikte yerleşir (`d.ts:2521-2523`, `15465-15469`).
- `$.prompt.fill` masaüstünde `no_composer` dönebilir (`d.ts:9280-9283`, `reference.md:241`: masaüstü headless host).
- `$.ui.notify` masaüstünde `no-surface` dönebilir (`d.ts:15449-15450`).
- `rateLimits` son API cevabından dolar; ilk turdan önce boş (`d.ts:12660`).

## Sınıflandırma

| Yetenek | Karar |
|---|---|
| Pano, Sağlık, Envanter | Modda yeniden kur: Pane, kaynak `durum.py --json` (ikinci toplayıcı yok) |
| Okuma | Pane + `Markdown`; `vault-okuyucu.cjs` güvenlik kuralları `$.fs.stat(resolve)` ile taşınır; `okuma-md.ts` gereksiz kalır |
| Etkinlik, limit, bağlam | `AbovePrompt` band. Olay kaynağı **`classic.*`** (`PreToolUse/PostToolUse/Notification/Stop/UserPromptSubmit/Subagent*`) → `etkinlik.isle()` portuna doğrudan; `tool.call`/`turn.*` tek başına izin/elicitation bekleyişini kaçırır (`etkinlik.cjs:192-197, 294-303`). Limit/bağlam: `$.session.usage()` |
| Hızlı komutlar | `/k` slash komutu. Birincil yol: Pane'de Button → kişinin basışı = açık eylem → `$.prompt.submit`. `$.prompt.fill` yalnız M0'da `no_composer` vermezse, modu `insert` olarak sabitleyip kullanılır (varsayılan `replace` taslağı ezer) |
| Inbox notu | `/not`; `$.fs.write` tüm içeriği yazar, append yok (`d.ts:3389-3395`). Ekleme **küçük bir python ekleyiciyle** (`O_APPEND`, `$.process.run`) yapılır; Electron `not.cjs` ile aynı ekleyici paylaşılır. Tek vault yazması burası |
| Terminal, Sürdür, güvenli kapatma | Claude Desktop zaten yapıyor, bırak |
| "Seni bekliyor" çok-proje bildirimi | Mod yalnız o oturumun bandında gösterir; masaüstünde yerel bildirim kanıtsız. M0'da ölçülür; çıkmazsa bu işlev Electron/Ada'da kalır (Desktop'un yaptığı varsayılmaz) |
| Ada (yüzen pencere) | Modda karşılığı yok; Electron'da kalır (bakım modu). Soru cevaplama kısmı gereksiz (Desktop kendi arayüzünde soruyor) |
| Çalıştır (servis bölmesi) | Ertele (mod PTY açamaz) |
| **Gece görevi** | **OS tetikleyicisi** (Görev Zamanlayıcı + headless betik; kapatma `night_guard.py` mantığıyla). Moda sonra denenir. Not: mevcut akış "işaretli sekme" + Electron PTY'ye soru yazmaya dayanıyor; Desktop oturumlarına Electron yazamaz, bu yüzden akış "işaretli sekme"den "tetikleyicili iş"e dönüşür (bkz. M7) |
| Faz 30 (aydınlık mod), Faz 31 (okuma düzenleme) | Emekli (`⛔`): mod ile değiştirildi |
| Beyin enjeksiyonu | M6'ya kadar dokunma; global `defter.py inject` tek yazar |

## Mod yapısı

Tek mod `kokpit`; `userConfig` bayrakları: `brifing`, `pano`, `band`, `beyin`, `hizliKomutlar`, `vaultYolu`, `pythonYolu`.

**Geliştirme:** `C:\Users\kaan\.claude\dev-mods\9e18c211-8351-4a40-be1c-31ead3c32410\kokpit\` (oturumun geçici mod klasörü, git dışı). **Kalıcı ev:** mod kaynağı `Kokpit\mod\kokpit\` altına alınır (git'te); `CLAUDE_CODE_PLUGIN_DIRS` kalıcı klasörü gösterir, oturum klasörünü değil (`reference.md:103`).

```
kokpit/
  .claude-plugin/plugin.json     # types: ./types/index.d.ts, userConfig
  hooks/hooks.json               # { "modules": ["./register.tsx"] }  (dizi, tek eleman)
  hooks/register.tsx             # yalnız olay bağlama
  hooks/veri/{durum,vault,oturumlar}.ts
  hooks/saf/etkinlik.ts          # etkinlik.cjs isle() portu (saf); girdi classic.* gövdesi
  hooks/ui/{pano,band,okuma}.tsx
  types/index.d.ts               # PluginState sözleşmesi
  *.test.tsx                     # claude plugin test
```

**Veri katmanı**
- `durum.py --json` (~2,4 sn ölçüldü) `$.process.run` ile `session.start`'ta başlayan async döngüden çağrılır (hook başı 10 sn bütçe); sonuç `$.state`'e yazılır, render yalnız okur (render'da yazma yasak).
- Yoklama: açılışta, Pane açıkken 60 sn, `turn.complete`'te. Hata olursa son iyi veri "bayat" etiketiyle.
- Diğer oturumlar: belgeli API yok. Her mod örneği `~/.kokpit/oturumlar/<session-id>.json` yazar, Pane `$.fs.list` ile okur (`$.store` kilidi belirsiz). Bayat eşiği: 10 dk olay yoksa "kapandı". Deneysel, M3'te ölçülür.
- **Yazma koruması gerçek bir kanca olarak:** `on('fs.write', …)` (`d.ts:7408`, sonuç `{value}|{deny}`, `d.ts:7539-7542`) realPath izin listesiyle; modun kendi `$.fs.write` çağrıları da bu kancadan geçer (`d.ts:5036-5037`). İzinli yol: `Inbox/Dump/YYYY-MM-DD.md` ve **yalnız `~/.kokpit/oturumlar/`** (Electron'un `ayarlar.json`/`komutlar.json`/`night-guard.json`/`okuma.json` dosyalarına mod yazmaz; `config.cjs:14-19` ezme olayı belgeli). Zorunlu `.catch(($,e,next)=>next.called?next(e):{deny})`.
- **Özyineleme/headless koruması:** global `CLAUDE_CODE_PLUGIN_DIRS` `flush.py`'nin başlattığı `claude -p` koşularında da modu yükler (`reference.md:72-73`). `register`'ın başında `$.env.get('BEYIN_INVOKED_BY')` veya `PROJE_SISTEMI_INVOKED_BY` doluysa mod hiçbir şey yapmaz. Mod hiçbir `claude -p` başlatmaz.
- Emoji'li klasör adları kaynakta `\u{1F52E}` kaçışıyla; dosyalar BOM'suz UTF-8; `python3` alias saplamasına güvenme.
- **Görsel:** Dark Glassmorphism'in bir kısmı uygulanabilir. `$.ui.backdrop` + `UiBackdropGlass` (blur/tint/opacity, yalnız desktop+mobil; `d.ts:14939-14960`, `11195-11202`) ve `Svg isInteractive` (hover, SMIL animasyon; `d.ts:13415`). Hücre tabanlı elementlerde akrilik yok. M1'de backdrop ve Svg denemesi; DESIGN.md eşlemesi M1 çıktısında yazılır.

## Fazlar (Roadmap.md'ye eklenecek; **4 sütun, Durum 3. sütunda** — `session-start.ps1:85` regex'i `^\|\s*[A-Za-z]?\d+(\.\d+)?\s*\|[^|]*\|\s*(✅|🔄|⏳|⛔)` böyle ister; "M0" kimliği regex'e uyuyor, sütun sayısı sorundu)

| Faz | Adı | Durum | Bitti Kriteri |
|---|---|---|---|
| M0 | Doğrulama spike'ı | ⏳ Bekliyor | 11 ölçüm `docs/Mod-Spike-Bulgulari.md`'de yazılı; her başarısızlık için B planı seçildi; devam/dur kararı verildi |
| M1 | Brifing band + tek Pane | ⏳ Bekliyor | Masaüstü Code sekmesinde yeni oturumda band proje/aşama/sıradaki faz/git gösteriyor; `/pano` 15 projeyi `durum.py`'dan çiziyor; backdrop+Svg denemesi sonucu yazılı; `plugin validate` temiz, `plugin test` terminal+desktop geçiyor; masaüstü ekran görüntüsü alındı |
| M2 | Etkinlik, limit, bağlam | ⏳ Bekliyor | `etkinlik.isle()` portu `classic.*` gövdeleriyle `scripts/test-kanca.cjs` fikstürlerinde aynı çıktıyı veriyor; band çalışıyor/bekliyor (izin dahil)/bitti + 5s/hafta limit + bağlam % gösteriyor |
| M3 | Çok oturum görünümü | ⏳ Bekliyor | İki masaüstü oturumu birbirini Pane'de görüyor; 10 dk olay yoksa "kapandı", dosya 24 saat sonra siliniyor; eşzamanlı yazma testinde bozuk JSON yok |
| M4 | Okuma + Inbox + hızlı komutlar | ⏳ Bekliyor | Okuma Pane'i vault'u `Markdown` ile gösteriyor, alan dışı yol reddi negatif testte geçiyor; `/not` ekleyici ile Dump'a bir satır ekliyor, paralel 20 ekleme testinde satır kaybı yok; `/k` komutu M0 sonucuna göre `fill(insert)` veya Button+`submit` ile çalışıyor |
| M5 | Sağlık + Envanter | ⏳ Bekliyor | Boru zinciri ve düşmemiş oturumlar Pane'de; `flush_kapsama.py`/`saglik.py` yoksa ilgili kutu "betik yok" metniyle ve nedeniyle gösteriliyor |
| M6 | Beyin/aşama enjeksiyonu devri | ⏳ Bekliyor | `injectDefter` açık + global hook'tan `defter.py inject` satırı çıkarılmış; yeni oturumda Defter bağlamda tam bir kez (`$.session.messages()` ile sayıldı); `BEYIN_INVOKED_BY` ve `resume` korumaları testli |
| M7 | Gece görevi → OS tetikleyicisi | ⏳ Bekliyor | Görev Zamanlayıcı görevi + headless betik bir gerçek gece koşusunda tamamlandı (başlama, bitiş işareti, kapatma/iptal kaydı `~/.kokpit` altında); `night_guard.py` kapatmayı yaptı; Electron `night*.cjs` bu akıştan çıkarıldı veya yeniden kullanıldı kararı yazılı. Moda ekleme (sor/dürt `$.prompt.submit`) opsiyonel alt adım |
| M8 | Electron kararı | ⏳ Bekliyor | Bir hafta yalnız mod kullanıldı; eksik yetenek listesi yazıldı; Electron dondur/koru kararı Kaan'dan alındı |
| 30 | Aydınlık mod | ⛔ | Emekli: mod ile değiştirildi |
| 31 | Okuma zenginleştirme | ⛔ | Emekli: mod ile değiştirildi |

### M0 ölçümleri (boş `kokpit-spike` modu; bu sırayla)

| # | Ölçüm | Başarısızlıkta |
|---|---|---|
| 1 | `$.session.version()` ve `session.start` tetikleniyor mu (gömülü motor mod API'sini destekliyor mu) | B planı 1: masaüstü sürümünü bekle, Electron kalır; geri kalan ölçümler atlanır |
| 2 | `CLAUDE_CODE_PLUGIN_DIRS` + `CLAUDE_CODE_PLUGIN_DIR_WATCH=1` ile mod yükleniyor (toast) | klasör marketplace / masaüstü + > Plugins |
| 3 | `Pane` ve `AbovePrompt` çiziliyor; slash komutuyla `$.ui.open` | yalnız band + toast |
| 4 | `Client` çiziliyor, `post` ulaşıyor; `$.ui.backdrop` ve `Svg isInteractive` çiziliyor | Client'siz, düz Box/Text/Svg |
| 5 | `$.process.run(["python", durum.py, "--json"])` | B planı 2: `durum.py` sarmalayan stdio MCP sunucusu |
| 6 | `$.fs` vault yolunda, emoji'li adlarla, `stat(resolve)`; MSIX sanal alanı vault/python erişimini engelliyor mu | yol düzeltmesi |
| 7 | En az bir turdan **sonra** `$.session.usage().rateLimits` dolu mu | limit göstergesi dilimden çıkar |
| 8 | Alt süreçte `python` PATH'te, env aktarımı çalışıyor | `pythonYolu` mutlak |
| 9 | `classic.Notification` (izin istemi dahil) masaüstünde tetikleniyor mu | band "bekliyor" için başka sinyal aranır |
| 10 | `$.prompt.fill` → `isFilled`/`refusal` (`no_composer`?) ve `$.ui.notify` sonucu (`no-surface`?) | `/k` Button+`submit` yoluna; bildirim işlevi Electron'da kalır |
| 11 | Global env ile yüklenen mod, `flush.py`'nin `claude -p` koşusunda yükleniyor mu ve `BEYIN_INVOKED_BY` koruması işe yarıyor mu | koruma `register` başında zorunlu kalır |

## Electron'un akıbeti

Kademeli dondurma, silme yok. M0-M2 yan yana; M3-M5'te eşleniği gelen yüzeyler "bakım modu" (yeni özellik yok); Ada ve terminal kalan gerekçedir; kararı M8'de Kaan verir. Gece görevi M7'de OS'a taşınır.

Yeniden kullanılacaklar: `durum.py` sözleşmesi (`durum.cjs`), `etkinlik.cjs` `isle()` (saf), `night.cjs` + `night_guard.py` (M7), `vault-okuyucu.cjs` güvenlik kuralları + `scripts/test-vault-okuyucu.cjs`/`okuma-fixture.cjs`, `not.cjs` satır biçimi (`- **HH:MM** _(kaynak)_ — metin`), `~/.kokpit/komutlar.json` (salt okuma).

## Doğrulama

- Her kayıtta `claude plugin validate <klasör>`; `claude plugin test <klasör>` (`$.ui.mount` ile terminal+desktop). Saf mantık için mevcut `test-kanca.cjs`, `test-night.cjs`, `test-vault-okuyucu.cjs` fikstürleri.
- Gerçek masaüstü doğrulaması: Desktop'ta gerçek Code oturumu açıp ekran görüntüsü (computer-use); her fazın bitti kriteri en az bir masaüstü ekran görüntüsü ister.
- Terminal hızlı döngü: `claude --plugin-dir <klasör>`; `claude --debug` ile "hook skipped" satırları.

## Dikkat edilecekler

- `CLAUDE_CODE_PLUGIN_DIRS` global `~/.claude/settings.json`'a yazılır: **yazmadan önce Kaan'dan açık onay** alınacak (M0-2). Plan modu bittikten sonra bile ilk yazma bu onayla yapılır.
- Mod `$.fs`/`$.process` ile tam yetkili çalışır; vault içeriği modele girdiği için prompt-injection yüzeyi: mod vault metnini bağlama enjekte etmez (M6'ya kadar), Pane yalnız kişiye gösterir.
- `flush_kapsama.py` ve `saglik.py` vault'ta yok; Sağlık "Geri doldur"/"nöbet" kısmı mod işinden bağımsız vault onarımı (ayrı iş).
- Roadmap'e üç yazar zaten var (`session-end.ps1`, `roadmap.py`, `project_flush.py`); mod dördüncü olmayacak.
- Global `~/.claude/CLAUDE.md` 0 bayt; Kokpit `.claude/CLAUDE.md` hâlâ ona atıf yapıyor (ayrı düzeltme).
- Gate'in kalan notu: M0 #1 başarısız olursa plan M0'da durur; Electron'a dokunulmaz.

## İlk adımlar (onaydan sonra)

1. `docs/Roadmap.md`'ye M0-M8 satırlarını (4 sütunlu) ve 30/31'e `⛔` ekle; `.claude/state.json` aşamasını gerektiği gibi güncelle.
2. `docs/Mod-Plani.md` olarak bu planın kalıcı kopyasını repoya koy.
3. M0: `kokpit-spike` modunu yaz, ölçümleri sırayla koş, bulguları `docs/Mod-Spike-Bulgulari.md`'ye yaz.
