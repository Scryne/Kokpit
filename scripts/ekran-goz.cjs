// Ada'nin gozu (v2.5): her halin hap goruntusu, 4x. test:ui DOM'a bakar, bu goze.
// Izole veri dizininde calisir (gercek ~/.kokpit'e dokunmaz), claude acmaz: hook'lar ve statusline
// test kabugundan, oturumun kendi ortamiyla gonderilir (test:ui ile ayni yol).
// Kullanim: npm run build && node scripts/ekran-goz.cjs [cikti-dizini]
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');
const os = require('os');
const WebSocket = require('ws');

const KOK = path.join(__dirname, '..');
const PORT = 9337;
const electronBin = require('electron');
const CIKTI = process.argv[2] || os.tmpdir();
const TEST_DIZIN = fs.mkdtempSync(path.join(os.tmpdir(), 'kokpit-ekran-goz-'));
const uyu = (ms) => new Promise((r) => setTimeout(r, ms));

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
  const js = async (exp) => {
    const r = await gonder('Runtime.evaluate', { expression: exp, awaitPromise: true, returnByValue: true });
    if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description ?? 'sayfa hatasi');
    return r.result?.result?.value;
  };
  const bekle = async (exp, ms = 15000) => { const son = Date.now() + ms; while (Date.now() < son) { if (await js(exp)) return true; await uyu(150); } throw new Error('zaman asimi: ' + exp); };
  await gonder('Runtime.enable');
  return { gonder, js, bekle };
}

// Oturumun KENDI ortamindan hook (k) ve statusline (d) gonderen kabuk fonksiyonlari.
const KANCA =
  "$h=@{Authorization=\"Bearer $env:KOKPIT_KANCA_TOKEN\";'X-Kokpit-Oturum'=$env:KOKPIT_OTURUM};" +
  "$b=\"http://127.0.0.1:$env:KOKPIT_KANCA_PORT\";" +
  "function k($g){Invoke-RestMethod -Method Post -Uri \"$b/kanca\" -Headers $h -ContentType 'application/json' -Body $g|Out-Null};" +
  "function d($g){Invoke-RestMethod -Method Post -Uri \"$b/durum-satiri\" -Headers $h -ContentType 'application/json' -Body $g|Out-Null}; cls";

const P = (o) => "k '" + JSON.stringify({ session_id: 't', ...o }) + "'";
const SINIR = (yuzde) => "d '" + JSON.stringify({ rate_limits: { five_hour: { used_percentage: yuzde, resets_at: 1791309600 }, seven_day: { used_percentage: 61, resets_at: 1791309600 } } }) + "'";

(async () => {
  fs.writeFileSync(path.join(TEST_DIZIN, 'ayarlar.json'), JSON.stringify({ surum: 1, ada: true, kenarAcik: true, yaziBoyutu: 13 }));
  const app = spawn(electronBin, [KOK, '--remote-debugging-port=' + PORT, '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding'], {
    cwd: KOK, stdio: 'ignore',
    env: { ...process.env, KOKPIT_DEV: '0', KOKPIT_TEST_KABUK: '1', KOKPIT_TEST_ADA: '1', KOKPIT_DIZIN: TEST_DIZIN },
  });
  let hedefler = [];
  for (let i = 0; i < 60 && hedefler.length < 2; i++) {
    await uyu(250);
    try { hedefler = (await jsonGetir(`http://127.0.0.1:${PORT}/json`)).filter((t) => t.type === 'page' && !t.url.startsWith('devtools')); } catch { /* bekle */ }
  }
  const ana = await baglan(hedefler.find((t) => !t.url.endsWith('#ada')));
  const ada = await baglan(hedefler.find((t) => t.url.endsWith('#ada')));
  const yazilan = [];
  const kabuk = async (satir) => {
    await ana.js(`(() => { document.querySelector('.xterm-helper-textarea')?.focus(); return true; })()`);
    await ana.gonder('Input.insertText', { text: satir + '; cls' });
    for (const type of ['rawKeyDown', 'char', 'keyUp']) {
      await ana.gonder('Input.dispatchKeyEvent', { type, key: 'Enter', windowsVirtualKeyCode: 13, ...(type === 'char' ? { text: '\r' } : {}) });
    }
  };
  async function cek(ad, aciklama) {
    await uyu(1700); // durum + saniyelik saat + gecisler otursun
    const kutu = await ada.js(`(() => { const r = document.querySelector('.ada-kart')?.getBoundingClientRect(); return r ? { x: r.x, y: r.y, w: r.width, h: r.height } : null; })()`);
    const { result } = await ada.gonder('Page.captureScreenshot', { format: 'png', clip: { x: kutu.x - 6, y: Math.max(0, kutu.y - 6), width: kutu.w + 12, height: kutu.h + 12, scale: 4 } });
    const dosya = path.join(CIKTI, 'goz-' + ad + '.png');
    fs.writeFileSync(dosya, Buffer.from(result.data, 'base64'));
    const hal = await ada.js(`(() => { const g = document.querySelector('.ada-goz'); return g.dataset.hal + (g.dataset.poz ? '/' + g.dataset.poz : '') + ' · alt ' + document.querySelectorAll('.ada-goz-altlar i').length + ' · kenar ' + (document.querySelector('.ada-kenar path')?.getAttribute('stroke-dasharray') ?? '-'); })()`);
    yazilan.push(ad + ' (' + aciklama + '): ' + hal);
  }
  try {
    await ana.bekle(`document.querySelectorAll('table tbody tr').length > 0`, 20000);
    await ana.js(`(() => { [...document.querySelectorAll('table tbody tr button')].find(b => b.textContent.trim() === 'Aç').click(); return true; })()`);
    await ana.bekle(`!!document.querySelector('[role="tab"] .bg-aksan')`, 20000);
    await uyu(1500);
    // Kokpit "bakmiyor": bitti oturumu dikkat alir (adada "bitti" hapi).
    await ana.js(`(() => { document.hasFocus = () => false; return true; })()`);
    await kabuk(KANCA);
    await kabuk(SINIR(42));
    await ada.bekle(`!!document.querySelector('.ada-goz')`);

    await kabuk(P({ hook_event_name: 'SessionStart' }));
    await cek('1-bosta', 'oturum acik, tur yok');
    await kabuk(P({ hook_event_name: 'UserPromptSubmit' }));
    await cek('2-dusun', 'tur basladi, arac yok');
    await kabuk(P({ hook_event_name: 'PreToolUse', tool_name: 'Read', tool_input: { file_path: 'C:/x/Roadmap.md' } }));
    await cek('3-oku', 'Read');
    await kabuk(P({ hook_event_name: 'PreToolUse', tool_name: 'Edit', tool_input: { file_path: 'C:/x/Ada.tsx' } }));
    await cek('4-yaz', 'Edit');
    await kabuk(P({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'npm run test:ui' } }));
    await cek('5-komut', 'Bash');
    await kabuk(P({ hook_event_name: 'PreToolUse', tool_name: 'WebSearch', tool_input: { query: 'rive lisans' } }));
    await cek('6-web', 'WebSearch');
    await kabuk(P({ hook_event_name: 'PreToolUse', tool_name: 'Agent', tool_input: { description: 'kasif' } }) + ';' + P({ hook_event_name: 'SubagentStart', agent_id: 'a1', agent_type: 'kasif' }) + ';' + P({ hook_event_name: 'SubagentStart', agent_id: 'a2', agent_type: 'arastirmaci' }));
    await cek('7-ajan', 'Agent + 2 alt ajan');
    await kabuk(P({ hook_event_name: 'SubagentStop', agent_id: 'a1', agent_type: 'kasif' }) + ';' + P({ hook_event_name: 'SubagentStop', agent_id: 'a2', agent_type: 'arastirmaci' }) + ';' + SINIR(86));
    await kabuk(P({ hook_event_name: 'PreToolUse', tool_name: 'AskUserQuestion', tool_input: { questions: [{ question: 'Push edeyim mi?', header: 'Push', multiSelect: false, options: [{ label: 'Evet' }, { label: 'Hayir' }] }] } }));
    await cek('8-bekliyor', 'soru, sinyalle acilan kart');
    await uyu(4500); // 5 sn'lik bakis biter, kart hapa doner
    await cek('8b-kenar', 'soru, hap; limit %86 amber kenar');
    await kabuk(P({ hook_event_name: 'PostToolUse', tool_name: 'AskUserQuestion', tool_input: {}, tool_response: {} }) + ';' + SINIR(42) + ';' + P({ hook_event_name: 'Stop', last_assistant_message: 'tamam' }));
    await uyu(200);
    await cek('9-mutlu', 'bitti, ilk 8 sn');
    await uyu(8000);
    await cek('10-bitti', 'bitti, sakin');
    // Uyku: ada sayfasinin saati 31 dk ileri alinir (yalniz gorunum icin).
    await ada.js(`(() => { const g = Date.now; Date.now = () => g() + 31 * 60 * 1000; return true; })()`);
    await cek('11-uyku', '31 dk sessiz');
    console.log(yazilan.join('\n'));
  } catch (e) {
    console.error('HATA ' + e.message);
  }
  const cikis = new Promise((r) => { app.on('exit', r); setTimeout(() => { try { app.kill(); } catch { /* */ } r(); }, 15000); });
  void ana.gonder('Browser.close');
  await cikis;
  try { fs.rmSync(TEST_DIZIN, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 }); } catch { /* temp */ }
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
