---
proje: Kokpit
created: 2026-09-10
type: spike
status: tamam
kapsam: "A-01 node-pty/ConPTY · A-02 Electron+ayri surec · A-03 durum.py semasi · A-04 tazeleme"
---
# Spike Bulguları — 2026-09-10

Akış adım 3: "riskli kararları önce doğrula". Finalizasyon bu dosyanın arkasında.

**Ortam:** Windows 11 Pro build 26200 · Node v24.20.0 x64 · npm 11.19.0 · node-pty 1.1.0 ·
Electron 44.3.0

## A-01 — node-pty + ConPTY: ✅ GEÇTİ

Prebuild bulundu (`prebuilds/win32-x64/`), **Visual Studio / node-gyp derlemesi gerekmedi**.
Spawn matrisi: `powershell.exe` ve `cmd.exe`, cwd'li ve cwd'siz, `useConptyDll: true` ve
`useConpty: false` (winpty) dahil **beş varyantın beşi de çalıştı**.

Fonksiyonel test (PowerShell, 80x24 → 120x40):

| Kontrol | Sonuç |
| --- | --- |
| ANSI escape / renk akıyor | ✅ |
| cwd doğru uygulanıyor | ✅ |
| Komut yazma → çıktı okuma | ✅ |
| Türkçe unicode (şğüöçİ) bozulmuyor | ✅ |
| `resize()` sonrası kabuk genişliği güncelleniyor (COLS=120) | ✅ |
| Ctrl+C (`\x03`) yarım satırı kesiyor | ✅ |
| `exit` → temiz `onExit` | ✅ |

**Asıl yük testi — `claude`'un TUI'si PTY üzerinden:** boş bir sandbox klasöründe
`powershell -Command claude` açıldı, hiçbir prompt gönderilmedi (sıfır token).

| Kontrol | Sonuç |
| --- | --- |
| TUI açıldı, çıktı geldi | ✅ |
| Alternate screen / imleç kontrolü (`\e[?1049h`, `\e[?25l`) | ✅ |
| Kutu çizim karakterleri (TUI çerçevesi) | ✅ |
| `resize()` sonrası yeniden çizdi | ✅ |
| Crash / "not recognized" izi | yok ✅ |

**Sonuç:** planın en büyük teknik riski kapandı. ConPTY yolu açık.

## A-02 — Electron + ayrı PTY süreci: ✅ GEÇTİ

Mimari: Electron main → `spawn('node', ['server.cjs'])` (PATH'teki **düz Node**, Electron'un
`execPath`'i değil) → o süreç PTY'yi sahiplenir → renderer 127.0.0.1'de ephemeral porta
WebSocket ile bağlanır.

Önce düz Node ebeveynle, sonra Scryne'ın makinesinde gerçek Electron 44.3.0 ile doğrulandı:

| Kontrol | Sonuç |
| --- | --- |
| Çocuk süreç ayağa kalktı, portu ebeveyne bildirdi | ✅ |
| Renderer WS bağlantısı açtı | ✅ |
| Komut PTY üzerinden çalıştı (`KOKPIT-SPIKE-OK`) | ✅ |
| ANSI akıyor, cwd doğru (ScryneQuant) | ✅ |
| `electron-rebuild` **gerekmedi** — node-pty Electron ABI'sini hiç görmedi | ✅ |
| **Yetim süreç yok:** Electron kapanınca çocuk temiz öldü (`stdin.end()`) | ✅ |

**Kritik bulgu — `data:` URL kullanılmayacak.** İlk denemede renderer hiç bağlanmadı ve
*hiçbir hata vermedi*: sunucu logunda "bağlantı geldi" satırı yoktu, o kadar. Sebep `data:`
URL'inin opaque origin'i — inline script ve WebSocket sessizce engelleniyor. `loadFile()` ile
gerçek dosyaya geçilince anında bağlandı. **Sessiz hata sınıfı**, teşhisi pahalı.

**İkinci bulgu — teşhis kablosu baştan döşenecek.** İlk tur "FAIL renderer sonuç üretmedi"den
başka hiçbir şey söylemedi. `console-message`, `did-fail-load`, `render-process-gone`,
`preload-error` main loguna bağlanınca sebep ilk turda göründü. Bunlar v1'de kalacak.
(Electron 44 `console-message`'ı tek event nesnesine çevirmiş, eski üç-argüman imzası
deprecation uyarısı basıyor — yeni imza kullanılacak.)

## A-03 — `durum.py --json` şeması: ✅ YETERLİ, script'e dokunulmayacak

Üst seviye: `olculdu`, `vault`, `projeler[]`, `beyin`, `envanter`, `butce`.
Her proje: `ad`, `yol`, `sistemde`, `asama`, `guncellendi`, `roadmap{dosya,toplam,tamamlandi,devam,bekleyen,sirada{no,ad,durum}}`,
`git{branch,kirli,upstream,ahead,behind,son_commit_gun,son_commit}`, `design`, `skills[]`.

Panonun ihtiyacı olan her alan var. **Kokpit kendi toplayıcısını yazmayacak** — tek doğruluk
kaynağı `durum.py` kalıyor. "Nerede kaldın" satırı `roadmap.sirada.ad` + `git.son_commit`
bileşiminden türetilir; yeni alan gerekmiyor.

Not: `sorudepo` hâlâ sistem dışında (`asama: null`) — pano bunu "sistem dışı" rozetiyle
gösterecek, gizlemeyecek.

## A-04 — Tazeleme: ✅ dosya izleme YOK

Ölçüm: `durum.py --json` cache'li halde **457/458/460 ms**. Dosya izleyici (chokidar,
fs.watch) gereksiz karmaşıklık ve ikinci bir yarış kaynağı olur. **Karar:** uygulama
açılışında bir kez + pencere odağa gelince + elle tazele butonu. Otomatik periyodik yok.

## Yan bulgular — kuruluma girecek

1. **npm 11.19 install script'leri varsayılan olarak blokluyor.** `node-pty` ve `electron`
   kurulumda sessizce yarım kaldı; `npm install-scripts approve <paket>` gerekiyor.
   README'ye ve kurulum adımlarına yazılacak, yoksa "kurdum ama çalışmıyor" tuzağı.
2. **`github.com` Node'un `fetch`'inden erişilemiyor** (`UND_ERR_CONNECT_TIMEOUT`), ama
   `curl` aynı adrese 200 dönüyor ve DNS sorgusu da timeout veriyor. Electron'un binary
   indirmesi bu yüzden patladı. **Çözüm:** `ELECTRON_MIRROR=https://registry.npmmirror.com/-/binary/electron/`
   ile indi. Bu bir *makine/ağ* durumu, projeye ait değil — ama kurulum adımına yazılmalı,
   yoksa her temiz kurulumda aynı duvara çarpılır.
3. **Windows yolları koda gömülmeyecek.** Spike'ta ters bölü kaçışları sessizce yenip
   `CreateProcess` "error code: 267" (ERROR_DIRECTORY) verdi — hata mesajı cwd'yi değil yolu
   suçluyor, teşhisi zor. Kural: yollar `path.resolve()` / `path.join()` ile üretilecek,
   string literal olarak yazılmayacak.
4. **`powershell.exe` kısa adı da çalışıyor** ama tam yol tercih edilecek — PATH'e bağımlılık
   sessiz kırılma kaynağı.
