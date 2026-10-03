// Kanca koprusu testi: durum makinesi (etkinlik.cjs), HTTP alicisi (kanca.cjs), statusline
// koprusu (durum-satiri.cjs). Electron'suz, duz node. Payload sekilleri 2026-10-03 spike'inda
// gercek claude 2.1.288'den kaydedilenlerle ayni.
//
// Gercek ~/.kokpit/kanca/ dizinine yazmamak icin HOME/USERPROFILE gecici dizine cevrilir.

const os = require('os');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { spawn } = require('child_process');

const GECICI = fs.mkdtempSync(path.join(os.tmpdir(), 'kokpit-kanca-'));
process.env.USERPROFILE = GECICI;
process.env.HOME = GECICI;
fs.mkdirSync(path.join(GECICI, '.claude'), { recursive: true });
fs.writeFileSync(
  path.join(GECICI, '.claude', 'settings.json'),
  JSON.stringify({ statusLine: { type: 'command', command: 'node -e "process.stdout.write(\'ASIL\')"', padding: 0 } })
);

const KOK = path.join(__dirname, '..');
const etkinlik = require(path.join(KOK, 'electron', 'etkinlik.cjs'));

let gecen = 0;
let kalan = 0;
function kontrol(ad, kosul, ayrinti) {
  if (kosul) {
    gecen++;
    console.log('PASS ' + ad);
  } else {
    kalan++;
    console.log('FAIL ' + ad + (ayrinti !== undefined ? '  -> ' + JSON.stringify(ayrinti) : ''));
  }
}

const ORTAK = { session_id: 's-1', cwd: 'C:\\x', permission_mode: 'bypassPermissions' };
const P = (o) => ({ ...ORTAK, ...o });

// --- 1. Durum makinesi ---
let d = etkinlik.yeniDurum(0);
kontrol('baslangic bosta', d.durum === 'bosta');
let r = etkinlik.isle(d, P({ hook_event_name: 'UserPromptSubmit', prompt: 'x' }), 1000);
d = r.durum;
kontrol('UserPromptSubmit -> calisiyor', d.durum === 'calisiyor' && d.turBasladi === 1000 && d.ozet.turlar === 1);

r = etkinlik.isle(d, P({ hook_event_name: 'PreToolUse', tool_name: 'Edit', tool_input: { file_path: 'C:\\p\\src\\Sorular.tsx', old_string: 'a', new_string: 'b' } }), 2000);
d = r.durum;
kontrol('PreToolUse Edit -> arac adi ve dosya', d.arac.ad === 'Edit' && d.arac.hedef === 'Sorular.tsx' && d.arac.bitti === null, d.arac);

r = etkinlik.isle(
  d,
  P({
    hook_event_name: 'PostToolUse',
    tool_name: 'Edit',
    tool_input: { file_path: 'C:\\p\\src\\Sorular.tsx' },
    tool_response: {
      filePath: 'C:\\p\\src\\Sorular.tsx',
      structuredPatch: [{ oldStart: 1, oldLines: 3, newStart: 1, newLines: 4, lines: [' a', '-b', '+c', '+d', '+f'] }],
    },
  }),
  2500
);
d = r.durum;
// Asimetrik veri bilerek: baglam satiri sayisi (1) ekleme sayisindan (3) farkli olsun diye
// once 2/2 idi ve onek hatasi testi gecti (mutasyon testi, 2026-10-03).
kontrol('PostToolUse Edit structuredPatch -> +3 -1', d.arac.arti === 3 && d.arac.eksi === 1, d.arac);
kontrol('ozet dosya ve satir', d.ozet.dosyalar.length === 1 && d.ozet.arti === 3 && d.ozet.eksi === 1, d.ozet);

r = etkinlik.isle(d, P({ hook_event_name: 'PostToolUse', tool_name: 'Write', tool_input: { file_path: 'C:\\p\\a.txt', content: 'bir\niki\nuc\n' }, tool_response: { type: 'create', filePath: 'C:\\p\\a.txt' } }), 2600);
d = r.durum;
kontrol('Write create -> satir sayisi', d.arac.arti === 3 && d.arac.eksi === 0, d.arac);
kontrol('ozet iki dosya', d.ozet.dosyalar.length === 2 && d.ozet.arti === 6);

r = etkinlik.isle(d, P({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'npm run test:ui', description: 'x' } }), 2700);
kontrol('Bash hedefi komut', r.durum.arac.hedef === 'npm run test:ui' && r.durum.arac.arti === null);
d = r.durum;

r = etkinlik.isle(d, P({ hook_event_name: 'PreToolUse', tool_name: 'mcp__shadcn__search_items', tool_input: {} }), 2750);
kontrol('MCP araci okunur', r.durum.arac.ad === 'MCP' && r.durum.arac.hedef === 'shadcn · search_items', r.durum.arac);
d = r.durum;

r = etkinlik.isle(d, P({ hook_event_name: 'PreToolUse', tool_name: 'AskUserQuestion', tool_input: { questions: [{ question: 'Hangi kanal?' }] } }), 2800);
kontrol('AskUserQuestion -> bekliyor + sinyal', r.durum.durum === 'bekliyor' && r.sinyal === 'bekliyor' && r.durum.soru === 'Hangi kanal?', r.durum);
d = r.durum;
r = etkinlik.isle(d, P({ hook_event_name: 'PostToolUse', tool_name: 'AskUserQuestion', tool_input: {}, tool_response: {} }), 2900);
kontrol('cevaplaninca tekrar calisiyor', r.durum.durum === 'calisiyor' && r.durum.soru === null);
d = r.durum;

r = etkinlik.isle(d, P({ hook_event_name: 'PreToolUse', tool_name: 'Read', agent_id: 'a1', tool_input: { file_path: 'C:\\p\\x.md' } }), 2950);
kontrol('alt ajan araci isaretli', r.durum.arac.alt === true);
d = r.durum;
r = etkinlik.isle(d, P({ hook_event_name: 'Stop', agent_id: 'a1' }), 2960);
kontrol('alt ajanin Stop u turu bitirmez', r.durum.durum === 'calisiyor' && r.sinyal === null);
d = r.durum;

r = etkinlik.isle(d, P({ hook_event_name: 'Notification', notification_type: 'idle_prompt', message: 'waiting' }), 2970);
kontrol('idle_prompt yok sayilir', r.durum.durum === 'calisiyor' && r.sinyal === null);
d = r.durum;

r = etkinlik.isle(d, P({ hook_event_name: 'Stop', stop_hook_active: false, last_assistant_message: 'tamam' }), 4000);
kontrol('Stop -> bitti + sure + sinyal', r.durum.durum === 'bitti' && r.durum.sonTurSuresiMs === 3000 && r.sinyal === 'bitti', r.durum);
d = r.durum;

r = etkinlik.isle(d, P({ hook_event_name: 'Notification', notification_type: 'permission_prompt', message: 'izin' }), 4100);
kontrol('bittikten sonra izin bildirimi beklemeye cevirmez', r.durum.durum === 'bitti');

r = etkinlik.isle(d, P({ hook_event_name: 'BilinmeyenOlay' }), 4200);
kontrol('bilinmeyen olay durumu degistirmez', r.degisti === false && r.durum === d);

const oz = etkinlik.kaliciOzet(d);
kontrol('kalici ozet', oz && oz.dosya === 2 && oz.arti === 6 && oz.eksi === 1 && oz.turlar === 1, oz);
kontrol('bos oturumun ozeti yok', etkinlik.kaliciOzet(etkinlik.yeniDurum(0)) === null);

const ds = etkinlik.durumSatiri({
  rate_limits: { five_hour: { used_percentage: 76, resets_at: 1791069600 }, seven_day: { used_percentage: 62, resets_at: 1791309600 } },
  context_window: { context_window_size: 200000, used_percentage: 21, current_usage: { input_tokens: 8, cache_creation_input_tokens: 667, cache_read_input_tokens: 41896 } },
  model: { id: 'claude-haiku', display_name: 'Haiku' },
});
kontrol('statusline limitleri', ds.limitler.besSaat.yuzde === 76 && ds.limitler.hafta.sifirlanma === 1791309600000, ds);
kontrol('statusline baglami', ds.baglam.token === 42571 && ds.baglam.yuzde === 21, ds.baglam);
kontrol('rate_limits yoksa null', etkinlik.durumSatiri({}).limitler.besSaat === null);

// --- 2. HTTP alicisi + 3. statusline koprusu ---
function post(port, yol, govde, basliklar) {
  return new Promise((coz) => {
    const veri = Buffer.from(JSON.stringify(govde));
    const req = http.request(
      { host: '127.0.0.1', port, path: yol, method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': veri.length, ...basliklar } },
      (res) => {
        res.resume();
        res.on('end', () => coz(res.statusCode));
      }
    );
    req.on('error', () => coz(0));
    req.end(veri);
  });
}
const uyu = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const kanca = require(path.join(KOK, 'electron', 'kanca.cjs'));
  const yayinlar = [];
  const sinyaller = [];
  const b = await kanca.baslat({ yayin: (a) => yayinlar.push(a), sinyal: (id, s) => sinyaller.push([id, s]) });
  kontrol('ayar dosyasi gecici HOME altinda', b.ayarDosyasi && b.ayarDosyasi.startsWith(GECICI), b.ayarDosyasi);
  const ayar = JSON.parse(fs.readFileSync(b.ayarDosyasi, 'utf8'));
  const h = ayar.hooks.PreToolUse[0].hooks[0];
  kontrol('ayar: http hook, token ve oturum basligi env ile', h.type === 'http' && h.url.endsWith(':' + b.port + '/kanca') && h.headers['X-Kokpit-Oturum'] === '$KOKPIT_OTURUM' && h.allowedEnvVars.includes('KOKPIT_KANCA_TOKEN'), h);
  kontrol('ayar: token dosyada YOK', !fs.readFileSync(b.ayarDosyasi, 'utf8').includes(b.token));
  kontrol('ayar: statusline koprusu + kullanicinin padding alani korunur', /durum-satiri\.cjs/.test(ayar.statusLine.command) && ayar.statusLine.padding === 0, ayar.statusLine);

  const yetki = { Authorization: 'Bearer ' + b.token, 'X-Kokpit-Oturum': 'sekme-1' };
  kontrol('yanlis token 401', (await post(b.port, '/kanca', P({ hook_event_name: 'Stop' }), { ...yetki, Authorization: 'Bearer yanlis' })) === 401);
  kontrol('tokensiz 401', (await post(b.port, '/kanca', P({ hook_event_name: 'Stop' }), { 'X-Kokpit-Oturum': 'sekme-1' })) === 401);
  kontrol('baska yol 404', (await post(b.port, '/baska', {}, yetki)) === 404);
  kontrol('UserPromptSubmit 204', (await post(b.port, '/kanca', P({ hook_event_name: 'UserPromptSubmit', prompt: 'x' }), yetki)) === 204);
  await post(b.port, '/kanca', P({ hook_event_name: 'Stop' }), yetki);
  await post(b.port, '/kanca', P({ hook_event_name: 'UserPromptSubmit' }), { ...yetki, 'X-Kokpit-Oturum': '../../kotu' });
  await uyu(200);
  const a = kanca.anlik();
  kontrol('oturum durumu bitti', a.oturumlar['sekme-1'] && a.oturumlar['sekme-1'].durum === 'bitti', a.oturumlar);
  kontrol('gecersiz oturum basligi yok sayilir', Object.keys(a.oturumlar).length === 1);
  kontrol('sinyal bir kez: bitti', sinyaller.length === 1 && sinyaller[0][1] === 'bitti', sinyaller);
  kontrol('yayin kisildi (olay basina degil)', yayinlar.length >= 1 && yayinlar.length <= 2, yayinlar.length);

  // statusline koprusu: gercek alt surec, Claude Code'un yaptigi gibi stdin'e JSON
  const ortam = { ...process.env, ...kanca.ptyOrtami(), KOKPIT_OTURUM: 'sekme-1' };
  const girdi = JSON.stringify({ rate_limits: { five_hour: { used_percentage: 40, resets_at: 1 } }, context_window: { used_percentage: 10, context_window_size: 200000, current_usage: { input_tokens: 100 } } });
  const cikti = await new Promise((coz) => {
    const c = spawn(process.execPath, [path.join(KOK, 'electron', 'durum-satiri.cjs')], { env: ortam, windowsHide: true });
    let o = '';
    c.stdout.on('data', (x) => (o += x));
    c.on('exit', (kod) => coz({ o, kod }));
    c.stdin.end(girdi);
  });
  await uyu(200);
  kontrol('statusline: kullanicinin komutunun ciktisi aynen', cikti.o === 'ASIL' && cikti.kod === 0, cikti);
  const a2 = kanca.anlik();
  kontrol('statusline: limit Kokpit e ulasti', a2.limitler && a2.limitler.besSaat.yuzde === 40, a2.limitler);
  kontrol('statusline: oturum baglami', a2.baglamlar['sekme-1'] && a2.baglamlar['sekme-1'].token === 100);

  // Kokpit kapaliyken statusline kopru beklemeden cikar
  kanca.durdur();
  const t0 = Date.now();
  const kapali = await new Promise((coz) => {
    const c = spawn(process.execPath, [path.join(KOK, 'electron', 'durum-satiri.cjs')], { env: ortam, windowsHide: true });
    let o = '';
    c.stdout.on('data', (x) => (o += x));
    c.on('exit', () => coz(o));
    c.stdin.end(girdi);
  });
  const sure = Date.now() - t0;
  kontrol('Kokpit kapaliyken statusline yine basar, takilmaz', kapali === 'ASIL' && sure < 2000, { kapali, sure });
  kontrol('kapaninca ayar dosyasi silinir', !fs.existsSync(b.ayarDosyasi));

  fs.rmSync(GECICI, { recursive: true, force: true });
  console.log('\n' + gecen + ' gecti, ' + kalan + ' kaldi');
  if (kalan === 0) console.log('TUMU GECTI');
  process.exit(kalan === 0 ? 0 : 1);
})();
