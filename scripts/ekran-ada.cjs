// v2.3/v2.4 yuzeylerinin ekran goruntusu: Ada (cok sorulu soru, son soz, hizli komutlar, yanit
// kutusu, klavye hali), terminal gorunumu (etkinlik seridi, hizli komut menusu, servis bolmesi).
// test:ui DOM'a bakar, bu goze. Izole veri dizininde calisir (gercek ~/.kokpit'e dokunmaz),
// claude acmaz: hook'lar test kabugundan taklit edilir (test:ui ile ayni yol).
// Kullanim: npm run build && node scripts/ekran-ada.cjs [cikti-dizini]
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');
const os = require('os');
const WebSocket = require('ws');

const KOK = path.join(__dirname, '..');
const PORT = 9335;
const electronBin = require('electron');
const CIKTI = process.argv[2] || os.tmpdir();
const TEST_DIZIN = fs.mkdtempSync(path.join(os.tmpdir(), 'kokpit-ekran-ada-'));
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
  return { ws, gonder, js, bekle };
}

async function kabugaYaz(s, metin) {
  await s.js(`(() => { document.querySelectorAll('.xterm-helper-textarea')[document.querySelectorAll('.xterm-helper-textarea').length - 1]?.focus(); return true; })()`);
  await s.gonder('Input.insertText', { text: metin });
  await s.gonder('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Enter', windowsVirtualKeyCode: 13 });
  await s.gonder('Input.dispatchKeyEvent', { type: 'char', key: 'Enter', text: '\r', windowsVirtualKeyCode: 13 });
  await s.gonder('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', windowsVirtualKeyCode: 13 });
}

// Oturumun KENDI ortamindan hook (claude'un yapacagi gibi): test:ui ile ayni kalip.
const KANCA = "$h=@{Authorization=\"Bearer $env:KOKPIT_KANCA_TOKEN\";'X-Kokpit-Oturum'=$env:KOKPIT_OTURUM};$u=\"http://127.0.0.1:$env:KOKPIT_KANCA_PORT/kanca\";function k($b){Invoke-RestMethod -Method Post -Uri $u -Headers $h -ContentType 'application/json' -Body $b|Out-Null};";

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
  const anaHedef = hedefler.find((t) => !t.url.endsWith('#ada'));
  const adaHedef = hedefler.find((t) => t.url.endsWith('#ada'));
  if (!anaHedef || !adaHedef) throw new Error('hedefler: ' + hedefler.map((t) => t.url).join(', '));
  const ana = await baglan(anaHedef);
  const ada = await baglan(adaHedef);
  try {
    await ana.bekle(`document.querySelectorAll('table tbody tr').length > 0`, 20000);
    const projeler = await ana.js(`[...document.querySelectorAll('table tbody tr button')].filter(b => b.textContent.trim() === 'Aç').slice(0, 2).map(b => b.closest('tr').querySelector('th .enstruman').textContent)`);
    // Iki oturum: biri soru soruyor, digeri bitti.
    for (const ad of projeler) {
      await ana.js(`(() => { [...document.querySelectorAll('table tbody tr')].find(r => r.querySelector('th .enstruman')?.textContent === ${JSON.stringify(ad)}).querySelector('button[title$="claude oturumu aç"]').click(); return true; })()`);
      await ana.bekle(`[...document.querySelectorAll('[role="tab"]')].some(t => t.textContent.includes(${JSON.stringify(ad)}) && t.querySelector('.bg-aksan'))`, 20000);
      await uyu(1500);
      await ana.js(`(() => { document.querySelector('[role="tab"][aria-selected="true"]')?.click(); return true; })()`);
      await ana.gonder('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: '1', code: 'Digit1', modifiers: 2, windowsVirtualKeyCode: 49 });
      await ana.gonder('Input.dispatchKeyEvent', { type: 'keyUp', key: '1', code: 'Digit1', modifiers: 2, windowsVirtualKeyCode: 49 });
      await uyu(300);
    }
    // Kokpit "bakmiyor" sayilsin: bitti oturumu dikkat rozeti alir (adada "Gördüm" gorunur).
    await ana.js(`(() => { document.hasFocus = () => false; return true; })()`);
    // Ikinci oturum (aktif): duzenleme + bitti, son sozuyle (Stop last_assistant_message).
    const STOP_GOVDESI = path.join(TEST_DIZIN, 'stop.json');
    fs.writeFileSync(STOP_GOVDESI, JSON.stringify({
      hook_event_name: 'Stop',
      session_id: 't',
      last_assistant_message: [
        '## Faz 5 tamam',
        '',
        '**Form** 11 soruyla çalışıyor; Şekil A.1 çizimleri eklendi, bilmiyorum seçeneği her soruda var.',
        '',
        '- test:ui 81/81, iki kez',
        '- localStorage taslağı sayfa yenilenince geri geliyor',
        '',
        'Sırada Faz 6 (sonuç ekranı). Commit atayım mı, yoksa önce mobilde bakmak ister misin?',
      ].join('\n'),
    }));
    await ana.gonder('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: '2', code: 'Digit2', modifiers: 2, windowsVirtualKeyCode: 50 });
    await ana.gonder('Input.dispatchKeyEvent', { type: 'keyUp', key: '2', code: 'Digit2', modifiers: 2, windowsVirtualKeyCode: 50 });
    await uyu(500);
    await kabugaYaz(ana, KANCA + `k '{"hook_event_name":"UserPromptSubmit","session_id":"t"}';k '{"hook_event_name":"PostToolUse","session_id":"t","tool_name":"Edit","tool_input":{"file_path":"C:/x/src/Pano.tsx"},"tool_response":{"structuredPatch":[{"lines":["+a","+b","+c","-d"]}]}}';k (Get-Content -Raw -Encoding utf8 '${STOP_GOVDESI}'); cls`);
    await uyu(1500);
    // Ilk sekmeye gec: cok sorulu soru (v2.4).
    await ana.js(`(() => { document.querySelectorAll('[role="tab"]')[0].click(); return true; })()`);
    await uyu(600);
    await kabugaYaz(ana, KANCA + `k '{"hook_event_name":"UserPromptSubmit","session_id":"t"}';k '{"hook_event_name":"PreToolUse","session_id":"t","tool_name":"AskUserQuestion","tool_input":{"questions":[{"question":"Push etmeden önce yayin-oncesi taramasını çalıştırayım mı?","header":"Yayın","multiSelect":false,"options":[{"label":"Evet, tara","description":"Geçmiş + meta veri, ~1 dk"},{"label":"Hayır, sadece commit","description":""},{"label":"Sonra","description":"Şimdilik dur"}]},{"question":"Commit mesajı hangi dilde olsun?","header":"Dil","multiSelect":false,"options":[{"label":"Türkçe","description":"Repodaki diğer commitler gibi"},{"label":"İngilizce","description":""}]}]}}'; cls`);
    await uyu(1500);

    // Terminal gorunumu: servis bolmesi + hizli komut menusu acik.
    const yol = await ana.js(`window.kokpit.durumGetir().then(d => d.veri.projeler.find(p => p.ad === ${JSON.stringify(projeler[1])}).yol)`);
    await ana.js(`window.kokpit.calistirKaydet(${JSON.stringify(yol)}, ${JSON.stringify(`node -e "console.log('  VITE v7  ready in 412 ms'); console.log('  Local:   http://localhost:5173/'); setInterval(() => {}, 1000)"`)})`);
    await ana.js(`(() => { document.querySelectorAll('[role="tab"]')[1].click(); return true; })()`);
    await uyu(400);
    await ana.gonder('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: '1', code: 'Digit1', modifiers: 2, windowsVirtualKeyCode: 49 });
    await ana.gonder('Input.dispatchKeyEvent', { type: 'keyUp', key: '1', code: 'Digit1', modifiers: 2, windowsVirtualKeyCode: 49 });
    await uyu(300);
    await ana.js(`(() => { document.querySelector('button[aria-label=${JSON.stringify(projeler[1] + ' uygulamasını çalıştır')}]').click(); return true; })()`);
    await ana.bekle(`[...document.querySelectorAll('button')].some(b => b.textContent.includes('localhost:5173'))`, 20000);
    await uyu(800);
    await ana.js(`(() => { [...document.querySelectorAll('button[aria-label$="hızlı komut gönder"]')].pop()?.click(); return true; })()`);
    await uyu(500);
    let { result } = await ana.gonder('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(CIKTI, 'kokpit-v24-terminal.png'), Buffer.from(result.data, 'base64'));
    await ana.js(`(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); return true; })()`);

    // Pano: Calistir isareti.
    await ana.gonder('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: '1', code: 'Digit1', modifiers: 2, windowsVirtualKeyCode: 49 });
    await ana.gonder('Input.dispatchKeyEvent', { type: 'keyUp', key: '1', code: 'Digit1', modifiers: 2, windowsVirtualKeyCode: 49 });
    await uyu(600);
    ({ result } = await ana.gonder('Page.captureScreenshot', { format: 'png' }));
    fs.writeFileSync(path.join(CIKTI, 'kokpit-v24-pano.png'), Buffer.from(result.data, 'base64'));

    // Ada: ana pencere kuculur (Kokpit arka planda) -> ada gorunur; imlec ustune gelir -> acilir.
    // Electron'un CDP'si Browser.setWindowBounds'u desteklemiyor; ada penceresi gizliyken de
    // DOM'u cizilir (kosucu arka plana alma bayraklariyla acilir), goruntu oradan alinir.
    await uyu(300);
    await ada.gonder('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 230, y: 18 });
    await uyu(900);
    const kutu = await ada.js(`(() => { const r = document.querySelector('.ada-kart')?.getBoundingClientRect(); return r ? { x: r.x, y: r.y, w: r.width, h: r.height } : null; })()`);
    ({ result } = await ada.gonder('Page.captureScreenshot', { format: 'png', ...(kutu ? { clip: { x: Math.max(0, kutu.x - 12), y: 0, width: kutu.w + 24, height: kutu.y + kutu.h + 16, scale: 2 } } : {}) }));
    fs.writeFileSync(path.join(CIKTI, 'kokpit-v24-ada.png'), Buffer.from(result.data, 'base64'));
    console.log('ada metni: ' + (await ada.js(`document.body.innerText`)).replace(/\s+/g, ' ').slice(0, 600));

    // Klavye hali (v2.4): kisayolun yaptigi gibi odak alir, ilk soruda bir cevap secilir.
    await uyu(400);
    await ada.js(`(() => { window.kokpit.adaOdak(true); return true; })()`);
    await uyu(300);
    await ada.js(`(() => { document.querySelector('.ada-kart [data-eylem]')?.focus(); return true; })()`);
    await ada.gonder('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: '1', code: 'Digit1', windowsVirtualKeyCode: 49 });
    await ada.gonder('Input.dispatchKeyEvent', { type: 'char', key: '1', text: '1', windowsVirtualKeyCode: 49 });
    await ada.gonder('Input.dispatchKeyEvent', { type: 'keyUp', key: '1', code: 'Digit1', windowsVirtualKeyCode: 49 });
    await uyu(400);
    const kutu2 = await ada.js(`(() => { const r = document.querySelector('.ada-kart')?.getBoundingClientRect(); return r ? { x: r.x, y: r.y, w: r.width, h: r.height } : null; })()`);
    ({ result } = await ada.gonder('Page.captureScreenshot', { format: 'png', ...(kutu2 ? { clip: { x: Math.max(0, kutu2.x - 12), y: 0, width: kutu2.w + 24, height: kutu2.y + kutu2.h + 16, scale: 2 } } : {}) }));
    fs.writeFileSync(path.join(CIKTI, 'kokpit-v24-ada-klavye.png'), Buffer.from(result.data, 'base64'));
    console.log('odak: ' + (await ada.js(`document.activeElement?.textContent ?? ''`)));
    // Bitti satiri (son soz + cipler + Gördüm): liste sona kaydirilir.
    await ada.js(`(() => { const k = document.querySelector('.ada-kart .overflow-y-auto'); k.scrollTop = k.scrollHeight; return true; })()`);
    await uyu(200);
    ({ result } = await ada.gonder('Page.captureScreenshot', { format: 'png', ...(kutu2 ? { clip: { x: Math.max(0, kutu2.x - 12), y: 0, width: kutu2.w + 24, height: kutu2.y + kutu2.h + 40, scale: 2 } } : {}) }));
    fs.writeFileSync(path.join(CIKTI, 'kokpit-v24-ada-bitti.png'), Buffer.from(result.data, 'base64'));
    await ada.js(`(() => { document.activeElement?.blur(); return true; })()`);
    await ada.gonder('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 5, y: 510 });
    console.log('yazildi: ' + ['terminal', 'pano', 'ada', 'ada-klavye'].map((x) => path.join(CIKTI, 'kokpit-v24-' + x + '.png')).join(', '));
  } catch (e) {
    console.error('HATA ' + e.message);
  }
  const cikis = new Promise((r) => { app.on('exit', r); setTimeout(() => { try { app.kill(); } catch { /* */ } r(); }, 15000); });
  void ana.gonder('Browser.close');
  await cikis;
  try { fs.rmSync(TEST_DIZIN, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 }); } catch { /* temp */ }
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
