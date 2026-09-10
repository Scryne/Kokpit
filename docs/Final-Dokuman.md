---
proje: Kokpit
created: 2026-09-10
modified: 2026-09-10
type: final-dokuman
status: onaylandi
dayanak: "docs/Proje-Fikri.md · docs/Spike-Bulgulari.md · ScryneOS/🧠 500-Knowledge/Kokpit-Plani.md"
---
# Kokpit — Final Doküman

## Özet

Kokpit, Scryne'ın dört projesinin durumunu tek ekranda gösteren ve karttan tek tıkla o
klasörde `claude` oturumu açan yerel bir masaüstü uygulamasıdır. Kendi verisi yoktur:
gösterdiği her şey `ScryneOS/.claude/scripts/durum.py --json` çıktısından, yani git'in zaten
takip ettiği dosyalardan türetilir. v1 hiçbir yere yazmaz. Uygulama silinirse hiçbir şey
kaybolmaz — bu bir lens, depo değil.

## Teknoloji Stack

| Katman | Seçim | Gerekçe |
| --- | --- | --- |
| Kabuk | Electron 44.3.0 | Görev çubuğunda ikonu olan gerçek uygulama; 2026-09-10'da Scryne'ın açık kararı. Spike'ta doğrulandı. |
| PTY sunucusu | **Ayrı düz Node süreci** (`node-pty` 1.1.0 + `ws`) | `node-pty` düz Node'a karşı bir kez derlenir, Electron'un ABI'sini hiç görmez → `electron-rebuild` yok. Spike'ta doğrulandı. |
| Terminal taşıma | WebSocket, `127.0.0.1`, ephemeral port | Loopback, dışarı açık değil. Port ebeveyne stdout'tan bildirilir; sabit port yok → çakışma yok. |
| Terminal görüntü | `xterm.js` + `@xterm/addon-fit` | Standart; ConPTY'nin ürettiği ANSI'yi doğru çizen tek olgun seçenek. |
| Renderer | Vite + React 19 + TypeScript | Global sistemin `shadcn` MCP zinciri React istiyor; pano kart-ağırlıklı, iterasyon olacak. |
| Stil | Tailwind v4 + shadcn/ui | Global frontend kontratı (`baseline-ui`, `tailwind-ui-refactor`) bu stack'i varsayıyor. |
| Veri | `durum.py --json` (Python 3.12) | Katman 1 zaten dedupe/cache/şema-sürümleme dertlerini çözmüş. **İkinci toplayıcı yazılmayacak.** |

## Mimari

Üç süreç, tek yön:

```
┌─ Electron main ────────────────────────────────────────────┐
│  · pencere ve yaşam döngüsü                                │
│  · spawn('node', ['pty-server.cjs'])  ← PATH'teki düz Node │
│  · spawn('python', ['durum.py','--json'])  → IPC ile UI'a   │
│  · before-quit → child.stdin.end()  (yetim bırakmaz)        │
└───────┬──────────────────────────────┬─────────────────────┘
        │ IPC (durum verisi)           │ stdout: {ready, port}
        ▼                              ▼
┌─ Renderer (React) ──┐      ┌─ PTY sunucusu (düz Node) ─────┐
│  Pano · Terminal    │◄────►│  node-pty → powershell/claude │
│  xterm.js           │  WS  │  her sekme = bir PTY          │
└─────────────────────┘      └───────────────────────────────┘
```

**Kararlar ve gerekçeleri:**

1. **PTY ayrı süreçte.** Tek gerekçe ABI değil: PTY sunucusu çökerse pencere hayatta kalır,
   ve aynı sunucu yarın tarayıcıdan da tüketilebilir. Kabuk değişir, sunucu ve frontend kalır.
2. **`durum.py` her seferinde yeniden çalıştırılır, sarılmaz.** 457 ms (ölçüldü). Kokpit'in
   veri katmanı yok; `durum.py`'ye alan gerekirse orada eklenir, burada değil.
3. **Tazeleme: açılışta + pencere odağa gelince + elle buton.** Dosya izleyici yok — 457 ms
   için karmaşıklık ve ikinci yarış kaynağı.
4. **`data:` URL yasak.** Opaque origin inline script ve WebSocket'i *sessizce* engelliyor
   (spike'ta yakalandı). Renderer her zaman `loadFile()` / dev'de `loadURL('http://localhost:5173')`.
5. **Windows yolları `path.resolve()` ile üretilir**, string literal olarak yazılmaz.
   Kaçış karakteri yenince `CreateProcess` "error 267" veriyor ve hata yolu değil dizini
   suçluyor — teşhisi pahalı.
6. **Teşhis kabloları v1'de kalır:** `console-message` (Electron 44 imzası), `did-fail-load`,
   `render-process-gone`, `preload-error` → main log. Sessiz hata sınıfı bu projede iki kez
   çıktı; üçüncüsüne hazırlıklı olunacak.
7. **`contextIsolation: true`, `nodeIntegration: false`.** Renderer'a Node verilmez; ihtiyacı
   olan her şey preload'daki dar `contextBridge` yüzeyinden geçer.
8. **Terminal sekmeleri süreklilik için, eşzamanlılık için değil.** Paralel ajan ekonomisi
   2026-09-06'da gerekçeleriyle reddedildi; sekmeler o kararı geri getirmez.

## Kapsam (v1)

- **Pano:** proje kartları — aşama rozeti, roadmap ilerleme çubuğu, sıradaki faz, git durumu
  (branch/kirli/ahead-behind/son commit yaşı), "nerede kaldın" satırı, tek **Başlat** butonu.
  Sistem dışı projeler (`sorudepo`) gizlenmez, rozetle gösterilir.
- **Terminal:** Başlat → o klasörde `claude`. Sekmeli, resize, kopyala/yapıştır, kapat.
  Canlı oturum farkındalığı: hangi proje, ne kadar süredir açık.
- **Teşhis logu:** main süreç dosyaya yazar; sorun çıkınca bakılacak yer belli.

## Riskler ve Doğrulamalar

| Risk | Durum |
| --- | --- |
| ConPTY/Windows'ta `node-pty` çalışmaz | ✅ çürütüldü — prebuild var, 5 spawn varyantı, `claude` TUI'si sorunsuz |
| Electron ABI / `electron-rebuild` cehennemi | ✅ çürütüldü — ayrı süreç mimarisi gerçek Electron'da doğrulandı |
| Electron kapanınca yetim PTY süreci kalır | ✅ çürütüldü — `stdin.end()` ile temiz ölüm, ölçüldü |
| `durum.py` şeması yetmez, ikinci toplayıcı gerekir | ✅ çürütüldü — tüm alanlar mevcut |
| Kapsam kayması (araç haftayı yer) | 🔄 açık — Sağlık/Envanter bilerek v1 dışında, roadmap dar |
| Kullanılmama (Katman 1 gibi) | 🔄 açık — v1.1'e geçmeden önce gerçek kullanım ölçülecek |

## Kurulum tuzakları (README'ye girecek)

1. **npm 11.19 install script'lerini bloklar.** `node-pty` ve `electron` sessizce yarım kurulur.
   `npm install-scripts approve node-pty electron` gerekir.
2. **Electron binary'si `github.com`'dan inmiyor** (bu makinede Node `fetch` timeout, `curl`
   200 dönüyor). `ELECTRON_MIRROR=https://registry.npmmirror.com/-/binary/electron/` ile iner.

## Kapsam Dışı

Kendi veritabanı · v1'de herhangi bir yazma · gömülü editör · paralel ajan ordusu ·
öneri motoru (Katman 3) · Sağlık ve Envanter sayfaları (v1.1) · uzaktan erişim, kimlik
doğrulama, çok kullanıcı · uygulamanın paketlenip dağıtılması (tek makine, `npm start` yeter).
