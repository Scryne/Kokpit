// v3.0 yuzeylerinin ekran goruntusu: Ada'da hedef + takilma, bitti sonucu, ek tepsisi, "Bugün" (vade + dusen bot),
// gozun yeni halleri (endise, para, yorgun); ana pencerede Pano seritleri ve Botlar sayfasi. test:ui DOM'a bakar, bu goze.
// Izole: gecici KOKPIT_DIZIN, limit ucu sahte, durum.py sarmalayicisi nobet/vade fiksturu basar. claude acmaz.
// Kullanim: npm run build && npm run ekran:v3 [cikti-dizini]
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');
const os = require('os');
const WebSocket = require('ws');
const { VAULT } = require('../electron/config.cjs');

const KOK = path.join(__dirname, '..');
const PORT = 9337;
const electronBin = require('electron');
const CIKTI = process.argv[2] || os.tmpdir();
const DIZIN = fs.mkdtempSync(path.join(os.tmpdir(), 'kokpit-ekran-v3-'));
const KIMLIK = path.join(DIZIN, 'kimlik.json');
const DIS = path.join(DIZIN, 'sessions');
fs.mkdirSync(DIS);
fs.writeFileSync(KIMLIK, JSON.stringify({ claudeAiOauth: { accessToken: 'ekran', expiresAt: Date.now() + 3600_000 } }));
const uyu = (ms) => new Promise((r) => setTimeout(r, ms));
let besSaat = 41;
const sunucu = http.createServer((_q, res) =>
  res.writeHead(200, { 'Content-Type': 'application/json' }).end(
    JSON.stringify({
      five_hour: { utilization: besSaat, resets_at: new Date(Date.now() + 2.4 * 3600_000).toISOString() },
      seven_day: { utilization: 58, resets_at: new Date(Date.now() + 55 * 3600_000).toISOString() },
    })
  )
);

const gun = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};
fs.writeFileSync(path.join(DIZIN, 'vadeler.json'), JSON.stringify([
  { proje: 'Donem-Sonu-Projeleri', tarih: gun(1), saat: '23:59', metin: 'GP2 v0.1 tam teslim + setup.exe release', kalan_gun: 1 },
  { proje: 'Matbaa', tarih: gun(4), saat: null, metin: '`matbaa kiyas` ölçümü (Faz 18)', kalan_gun: 4 },
  { proje: 'Matbaa', tarih: gun(5), saat: null, metin: 'kanal ölçümü', kalan_gun: 5 },
  { proje: 'Otomat', tarih: gun(18), saat: null, metin: 'Faz 18 biçim kararı', kalan_gun: 18 },
]));
const nobetYaz = (yanki, siparisSon, siparis) =>
  fs.writeFileSync(path.join(DIZIN, 'nobet.json'), JSON.stringify({
    olculdu: new Date().toISOString(),
    isler: [
      { proje: 'Yanki', ad: 'Üretim', tur: 'engel', siklik_saat: null, hal: yanki, ayrinti: yanki === 'dustu' ? 'RunPod bakiyesi 0.80 $ (en az 1.00 $): kredi yükle' : '', son: new Date(Date.now() - 3 * 3600_000).toISOString(), sonraki: null, kaynak: 'calisma/.uretim_engeli.json' },
      { proje: 'GridGrade', ad: 'Günlük yayın', tur: 'actions', siklik_saat: 24, hal: 'saglikli', ayrinti: '', son: new Date(Date.now() - 5 * 3600_000).toISOString(), sonraki: null, kaynak: 'Actions Scryne/gridgrade · Publish', url: 'https://github.com/Scryne/gridgrade/actions' },
      { proje: 'Matbaa', ad: 'Günlük koşu', tur: 'gorev', siklik_saat: 24, hal: 'saglikli', ayrinti: '', son: new Date(Date.now() - 15 * 3600_000).toISOString(), sonraki: new Date(Date.now() + 9 * 3600_000).toISOString(), kaynak: 'görev \\Matbaa-Gunluk' },
      { proje: 'Matbaa', ad: 'Günlük rapor', tur: 'dosya', siklik_saat: 24, hal: 'saglikli', ayrinti: '', son: siparisSon, sonraki: null, kaynak: 'calisma/gunluk/son.json', sayac: { ad: 'Yeni sipariş', deger: siparis, sevinc: true } },
      { proje: 'Otomat', ad: 'Günlük üretim', tur: 'actions', siklik_saat: 8, hal: 'saglikli', ayrinti: '24 saatte 2 başarısız koşu', son: new Date(Date.now() - 4 * 3600_000).toISOString(), sonraki: null, kaynak: 'Actions Scryne/Otomat · Günlük üretim' },
      { proje: 'ScryneOS', ad: 'Gece yedeği', tur: 'gorev', siklik_saat: 24, hal: 'saglikli', ayrinti: '', son: new Date(Date.now() - 2 * 3600_000).toISOString(), sonraki: new Date(Date.now() + 22 * 3600_000).toISOString(), kaynak: 'görev \\ScryneOS-Yedek' },
      { proje: 'Yanki', ad: 'Dinleme odası', tur: 'gorev', siklik_saat: null, hal: 'saglikli', ayrinti: 'çalışıyor', son: new Date(Date.now() - 60 * 3600_000).toISOString(), sonraki: null, kaynak: 'görev \\Yanki\\Oda' },
    ],
  }));
nobetYaz('saglikli', '2026-10-28T10:30:00+03:00', 0);
const SARMAL = path.join(DIZIN, 'durum-sarmal.py');
fs.writeFileSync(SARMAL, [
  'import json, os, subprocess, sys',
  "d = os.environ['KOKPIT_DIZIN']",
  "sys.stdout.reconfigure(encoding='utf-8')",
  "if '--nobet' in sys.argv:",
  "    print(open(os.path.join(d, 'nobet.json'), encoding='utf-8').read()); sys.exit(0)",
  "r = subprocess.run([sys.executable, os.environ['KOKPIT_TEST_GERCEK_DURUM'], '--json'], capture_output=True)",
  "veri = json.loads(r.stdout.decode('utf-8'))",
  "veri['vadeler'] = json.load(open(os.path.join(d, 'vadeler.json'), encoding='utf-8'))",
  'print(json.dumps(veri, ensure_ascii=False))',
].join('\n'));

function jsonGetir(url) {
  return new Promise((coz, red) => {
    http.get(url, (res) => {
      let v = '';
      res.on('data', (d) => (v += d));
      res.on('end', () => { try { coz(JSON.parse(v)); } catch (e) { red(e); } });
    }).on('error', red);
  });
}

async function baglan(hedef) {
  const ws = new WebSocket(hedef.webSocketDebuggerUrl);
  await new Promise((r) => ws.once('open', r));
  let sira = 0;
  const bekleyen = new Map();
  ws.on('message', (ham) => {
    const m = JSON.parse(ham.toString());
    if (m.id && bekleyen.has(m.id)) { bekleyen.get(m.id)(m); bekleyen.delete(m.id); }
  });
  const gonder = (method, params = {}) => new Promise((coz) => { const id = ++sira; bekleyen.set(id, coz); ws.send(JSON.stringify({ id, method, params })); });
  const js = async (exp) => (await gonder('Runtime.evaluate', { expression: exp, awaitPromise: true, returnByValue: true })).result?.result?.value;
  const bekle = async (exp, ms = 10000) => { for (let t = Date.now(); Date.now() - t < ms; await uyu(200)) if (await js(exp)) return true; return false; };
  return { gonder, js, bekle };
}

async function cekAda(ada, ad, ek = 16) {
  const k = await ada.js(`(() => { const r = document.querySelector('.ada-kart').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; })()`);
  const { result } = await ada.gonder('Page.captureScreenshot', { format: 'png', clip: { x: Math.max(0, k.x - 12), y: 0, width: k.w + 24, height: k.y + k.h + ek, scale: 2 } });
  const dosya = path.join(CIKTI, ad);
  fs.writeFileSync(dosya, Buffer.from(result.data, 'base64'));
  console.log(dosya);
}

async function cekAna(ana, ad, secici) {
  if (!(await ana.bekle(`!!document.querySelector(${JSON.stringify(secici)})`, 8000))) {
    console.error('yok: ' + secici + ' | botlar tablosunda dustu: ' + (await ana.js(`!!document.querySelector('section[aria-label="Botlar"] tr[data-bot-hal="dustu"]')`)) + ' | pano bolumleri: ' + (await ana.js(`[...document.querySelectorAll('section[aria-label]'))].map(x => x.getAttribute('aria-label')).join(', ')`)));
    return;
  }
  const k = await ana.js(`(() => { const r = document.querySelector(${JSON.stringify(secici)}).getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: Math.min(r.height, 900) }; })()`);
  const { result } = await ana.gonder('Page.captureScreenshot', { format: 'png', clip: { x: k.x - 8, y: k.y - 8, width: k.w + 16, height: k.h + 16, scale: 1.5 } });
  const dosya = path.join(CIKTI, ad);
  fs.writeFileSync(dosya, Buffer.from(result.data, 'base64'));
  console.log(dosya);
}

(async () => {
  await new Promise((r) => sunucu.listen(0, '127.0.0.1', r));
  const app = spawn(electronBin, [KOK, '--remote-debugging-port=' + PORT, '--disable-backgrounding-occluded-windows'], {
    cwd: KOK,
    stdio: 'ignore',
    env: {
      ...process.env,
      KOKPIT_DEV: '0',
      KOKPIT_TEST_KABUK: '1',
      KOKPIT_TEST_ADA: '1',
      KOKPIT_TEST_NOBET: '1',
      KOKPIT_DIZIN: DIZIN,
      KOKPIT_LIMIT_URL: 'http://127.0.0.1:' + sunucu.address().port + '/u',
      KOKPIT_KIMLIK: KIMLIK,
      KOKPIT_CLAUDE_OTURUMLAR: DIS,
      KOKPIT_LIMIT_ELLE_MS: '0',
      KOKPIT_DURUM_SCRIPT: SARMAL,
      KOKPIT_TEST_GERCEK_DURUM: path.join(VAULT, '.claude', 'scripts', 'durum.py'),
    },
  });
  try {
    let hedefler = null;
    for (let i = 0; i < 60 && !hedefler; i++) {
      await uyu(250);
      try {
        const l = (await jsonGetir(`http://127.0.0.1:${PORT}/json`)).filter((t) => t.type === 'page');
        if (l.some((t) => t.url.endsWith('#ada')) && l.some((t) => !t.url.endsWith('#ada'))) hedefler = l;
      } catch { /* henuz yok */ }
    }
    const ada = await baglan(hedefler.find((t) => t.url.endsWith('#ada')));
    const ana = await baglan(hedefler.find((t) => !t.url.endsWith('#ada')));
    // Pano'ya ozgu bir oge: Botlar sayfasi da (gizli) bir tablo tasidigi icin "tablo doldu" Pano'nun yuklendigini soylemez.
    await ana.bekle(`!!document.querySelector('section[aria-label="Vadeler"]')`, 40000);
    await ana.js(`window.kokpit.nobetTazele().then(() => true)`);
    nobetYaz('dustu', '2026-10-28T10:30:00+03:00', 0);
    await ana.js(`window.kokpit.nobetTazele().then(() => true)`);
    await uyu(800);
    await cekAna(ana, 'kokpit-v3-pano-seritler.png', 'section[aria-label="Bot nöbeti: sorunlu işler"]');
    await cekAna(ana, 'kokpit-v3-vadeler.png', 'section[aria-label="Vadeler"]');
    await ana.js(`(() => { document.querySelector('button[aria-label="Botlar"]').click(); return true; })()`);
    await uyu(500);
    await cekAna(ana, 'kokpit-v3-botlar.png', 'section[aria-label="Botlar"] > div');
    await ana.js(`(() => { document.querySelector('button[aria-label="Pano"]')?.click(); return true; })()`);

    // Oturum: Pano'dan Aç (test kabugu), kanca taklidi kabuktan.
    await ana.js(`(() => { const b = [...document.querySelectorAll('table tbody tr button')].find(x => x.textContent.trim() === 'Aç'); b.click(); return true; })()`);
    await ana.bekle(`!!document.querySelector('.xterm')`, 15000);
    await ana.bekle(`!!document.querySelector('[role="tab"] .bg-aksan')`, 20000);
    const yaz = async (m) => {
      await ana.js(`(() => { document.querySelector('.xterm-helper-textarea')?.focus(); return true; })()`);
      await ana.gonder('Input.insertText', { text: m + '; cls' });
      await ana.gonder('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Enter', windowsVirtualKeyCode: 13 });
      await ana.gonder('Input.dispatchKeyEvent', { type: 'char', text: '\r', key: 'Enter', windowsVirtualKeyCode: 13 });
      await ana.gonder('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', windowsVirtualKeyCode: 13 });
      await uyu(1500);
    };
    await yaz(
      "$h=@{Authorization=\"Bearer $env:KOKPIT_KANCA_TOKEN\";'X-Kokpit-Oturum'=$env:KOKPIT_OTURUM};" +
        "$u=\"http://127.0.0.1:$env:KOKPIT_KANCA_PORT/kanca\";" +
        "function k($b){Invoke-RestMethod -Method Post -Uri $u -Headers $h -ContentType 'application/json' -Body $b|Out-Null};" +
        "k '{\"hook_event_name\":\"UserPromptSubmit\",\"session_id\":\"t\",\"prompt\":\"selam. Matbaa ilanlarini yeniden fiyatla, kar marjini raporla\"}'"
    );
    const hata = "k '{\"hook_event_name\":\"PostToolUseFailure\",\"session_id\":\"t\",\"tool_name\":\"Bash\",\"tool_input\":{\"command\":\"uv run matbaa fiyat\"},\"error\":\"Exit code 1\\nETSY_API_KEY tanimli degil\",\"is_interrupt\":false}'";
    await yaz(hata + ';' + hata + ';' + hata);
    await ada.gonder('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 230, y: 18 });
    await ada.bekle(`!!document.querySelector('[data-takilma]')`);
    await uyu(500);
    await cekAda(ada, 'kokpit-v3-ada-takilma.png');
    await ada.gonder('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 5, y: 510 });
    await uyu(400);
    await cekAda(ada, 'kokpit-v3-hap-endise.png');

    await yaz(
      "k '{\"hook_event_name\":\"PostToolUse\",\"session_id\":\"t\",\"tool_name\":\"Edit\",\"tool_input\":{\"file_path\":\"C:/x/fiyat.py\"},\"tool_response\":{\"structuredPatch\":[{\"lines\":[\"+a\",\"+b\",\"+c\",\"-d\"]}]}}';" +
        "k '{\"hook_event_name\":\"Stop\",\"session_id\":\"t\",\"last_assistant_message\":\"Fiyatlar guncellendi; 59 ilanin 12si degisti. Rapor calisma/rapor.md.\"}'"
    );
    const png = path.join(DIZIN, 'Ekran Görüntüsü (253).png');
    fs.copyFileSync(path.join(KOK, 'public', fs.readdirSync(path.join(KOK, 'public')).find((x) => x.endsWith('.png'))), png);
    await ada.js(`(() => { window.kokpit.adaBirak([${JSON.stringify(png)}]); return true; })()`);
    await ada.gonder('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 230, y: 18 });
    await ada.bekle(`!!document.querySelector('[data-ek-tepsisi] img') && !!document.querySelector('[data-tur-sonucu]')`);
    await uyu(600);
    await cekAda(ada, 'kokpit-v3-ada-tepsi-bitti.png', 24);
    await ada.gonder('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 5, y: 510 });
    await ada.js(`(() => { window.kokpit.adaEkSil('hepsi'); return true; })()`);

    nobetYaz('dustu', new Date().toISOString(), 1);
    await ana.js(`window.kokpit.nobetTazele().then(() => true)`);
    await ada.bekle(`document.querySelector('.ada-goz')?.dataset.hal === 'para'`, 6000);
    await uyu(300);
    await cekAda(ada, 'kokpit-v3-hap-para.png');

    besSaat = 93;
    await uyu(9000); // para + endise gecsin
    await ada.js(`(() => { document.querySelector('button[aria-label="Limitleri tazele"]')?.click(); return true; })()`);
    await ana.js(`window.kokpit.etkinlikAnlik().then(() => true)`);
    await ada.gonder('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 230, y: 18 });
    await ada.js(`(() => { document.querySelector('button[aria-label="Limitleri tazele"]')?.click(); return true; })()`);
    await ada.bekle(`document.body.innerText.includes('5s %93')`, 15000);
    await ada.gonder('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 5, y: 510 });
    await ada.bekle(`document.querySelector('.ada-goz')?.dataset.hal === 'yorgun'`, 6000);
    await uyu(300);
    await cekAda(ada, 'kokpit-v3-hap-yorgun.png');
    await ada.gonder('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 230, y: 18 });
    await uyu(600);
    await cekAda(ada, 'kokpit-v3-ada-bugun.png', 24);
  } catch (e) {
    console.error('ekran hatasi: ' + e.stack);
    process.exitCode = 1;
  } finally {
    // Acik bir kabuk oturumu var: PTY sunucusu ve kabuk da olsun diye agac, yalniz bu PID ile (baslik suzgeci gercek Kokpit'i de oldururdu).
    try { require('child_process').execFileSync('taskkill', ['/T', '/F', '/PID', String(app.pid)], { stdio: 'ignore' }); } catch { /* */ }
    sunucu.close();
    await uyu(800);
    try { fs.rmSync(DIZIN, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* temp'te kalir */ }
  }
})();
