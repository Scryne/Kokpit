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

// --- 1b. Soru ayrintisi (v2.3, ada'dan cevap). Girdi sekli 2026-10-04 spike'indaki gercek
// AskUserQuestion cagrisiyla ayni: questions[].{question, header, options[].{label, description}, multiSelect}.
{
  const tekli = {
    questions: [
      {
        question: 'Hangi renk?',
        header: 'Renk',
        multiSelect: false,
        options: [
          { label: 'Kirmizi', description: 'sicak' },
          { label: 'Mavi', description: '' },
          { label: 'Yesil', description: 'dogal' },
        ],
      },
    ],
  };
  let s0 = etkinlik.yeniDurum(0);
  let r1 = etkinlik.isle(s0, P({ hook_event_name: 'UserPromptSubmit', prompt: 'x' }), 10);
  r1 = etkinlik.isle(r1.durum, P({ hook_event_name: 'PreToolUse', tool_name: 'AskUserQuestion', tool_input: tekli }), 20);
  const sa = r1.durum.soruAyrinti;
  kontrol(
    'soru ayrintisi: tekli soru cevaplanabilir, secenek sirasi korunur',
    sa && sa.cevaplanabilir === true && sa.secenekler.length === 3 && sa.secenekler[1].etiket === 'Mavi' && sa.soru === 'Hangi renk?' && sa.baslik === 'Renk',
    sa
  );
  const izin = etkinlik.isle(r1.durum, P({ hook_event_name: 'Notification', notification_type: 'permission_prompt', message: 'izin' }), 25);
  kontrol('ayni bekleyisin bildirimi secenekleri silmez', izin.durum.soruAyrinti && izin.durum.soruAyrinti.secenekler.length === 3, izin.durum);
  const cevap = etkinlik.isle(r1.durum, P({ hook_event_name: 'PostToolUse', tool_name: 'AskUserQuestion', tool_input: tekli, tool_response: {} }), 30);
  kontrol('cevaplaninca soru ayrintisi silinir', cevap.durum.soruAyrinti === null && cevap.durum.durum === 'calisiyor');
  const durdu = etkinlik.isle(r1.durum, P({ hook_event_name: 'Stop' }), 40);
  kontrol('Stop soru ayrintisini siler (bayat secenek kalmaz)', durdu.durum.soruAyrinti === null);

  const coklu = etkinlik.soruAyrintisi({ questions: [{ question: 'Hangileri?', multiSelect: true, options: [{ label: 'a' }, { label: 'b' }] }] });
  kontrol('coklu secim cevaplanamaz (toggle akisi)', coklu.cevaplanabilir === false && coklu.coklu === true, coklu);
  const iki = etkinlik.soruAyrintisi({ questions: [{ question: 'A?', options: [{ label: 'x' }] }, { question: 'B?', options: [{ label: 'y' }] }] });
  kontrol('iki soru cevaplanamaz (sekmeli akis)', iki.cevaplanabilir === false && iki.soruSayisi === 2, iki);
  const bos = etkinlik.soruAyrintisi({ questions: [{ question: 'Ne?' }] });
  kontrol('secenegi olmayan soru cevaplanamaz', bos.cevaplanabilir === false && bos.secenekler.length === 0, bos);
  kontrol('bozuk girdi -> null', etkinlik.soruAyrintisi(null) === null && etkinlik.soruAyrintisi({ questions: 'x' }) === null);
  const bes = etkinlik.soruAyrintisi({ questions: [{ question: 'Q', options: [1, 2, 3, 4, 5].map((n) => ({ label: 'o' + n })) }] });
  kontrol('en fazla 4 secenek (rakam N+1 serbest metne denk gelir)', bes.secenekler.length === 4, bes);
  const altAjan = etkinlik.isle(s0, P({ hook_event_name: 'PreToolUse', tool_name: 'AskUserQuestion', agent_id: 'a1', tool_input: tekli }), 50);
  kontrol('alt ajanin sorusu bekletmez, ayrinti yok', altAjan.durum.durum !== 'bekliyor' && altAjan.durum.soruAyrinti === null);
}

// --- 1c. Hizli komutlar semasi (komutlar.cjs) ---
{
  const komutlar = require(path.join(KOK, 'electron', 'komutlar.cjs'));
  const t = komutlar.temizle([
    { ad: ' Devam ', metin: 'devam\r\net' },
    { ad: '', metin: 'x' },
    { ad: 'y' },
    ...Array.from({ length: 20 }, (_, i) => ({ ad: 'k' + i, metin: 'm' })),
  ]);
  kontrol('komut semasi: bos/eksik atlanir, satir sonu tek satira, en fazla 12', t[0].ad === 'Devam' && t[0].metin === 'devam et' && t.length === 12, t.slice(0, 2));
  kontrol('komut semasi: dizi degilse null', komutlar.temizle({}) === null);
  const k = komutlar.oku();
  kontrol('komutlar dosyasi yoksa varsayilanla olusur', fs.existsSync(komutlar.DOSYA) && k.length === komutlar.VARSAYILAN.length && k[0].metin === 'devam et', k[0]);
}

// --- 1d. Calistir: adres yakalama + tarif (v2.3) ---
{
  const { adresBul } = require(path.join(KOK, 'electron', 'adres.cjs'));
  const E = '\u001b';
  kontrol('adres: Vite (port renk kodlari arasinda)', adresBul('  ' + E + '[32m➜' + E + '[39m  Local:   ' + E + '[36mhttp://localhost:' + E + '[1m5173' + E + '[22m/' + E + '[39m') === 'http://localhost:5173/');
  kontrol('adres: Next', adresBul('   - Local:        http://localhost:3000\n') === 'http://localhost:3000');
  kontrol('adres: uvicorn 0.0.0.0 -> localhost', adresBul('INFO:     Uvicorn running on http://0.0.0.0:8000 (Press CTRL+C to quit)') === 'http://localhost:8000');
  kontrol('adres: 127.0.0.1 korunur, sondaki nokta atilir', adresBul('listening at http://127.0.0.1:8790.') === 'http://127.0.0.1:8790');
  kontrol('adres: uzak adres yakalanmaz', adresBul('see https://vitejs.dev/config and http://example.com:80/') === null);
  kontrol('adres: portsuz localhost yakalanmaz', adresBul('http://localhost/abc') === null);

  const calistir = require(path.join(KOK, 'electron', 'calistir.cjs'));
  const proje = fs.mkdtempSync(path.join(GECICI, 'proje-'));
  kontrol('tarif: package.json yok -> null + neden', calistir.tarif(proje).komut === null && !!calistir.tarif(proje).neden);
  fs.writeFileSync(path.join(proje, 'package.json'), JSON.stringify({ scripts: { start: 'node x', dev: 'vite' } }));
  kontrol('tarif: dev, start\'tan once', calistir.tarif(proje).komut === 'npm run dev' && calistir.tarif(proje).kaynak === 'package.json');
  fs.writeFileSync(path.join(proje, 'package.json'), JSON.stringify({ scripts: { start: 'node x' } }));
  kontrol('tarif: yalniz start', calistir.tarif(proje).komut === 'npm start');
  kontrol('tarif: Kokpit kendini calistirmaz', calistir.tarif(KOK).komut === null);
  kontrol('kaydet: cok satirli komut reddedilir', calistir.kaydet(proje, 'a\n\nb'.repeat(300)) === false);
  kontrol('kaydet: olmayan klasor reddedilir', calistir.kaydet(path.join(proje, 'yok'), 'x') === false);
  kontrol('kaydet: gecerli komut', calistir.kaydet(proje, '  uv run uvicorn app:app  ') === true);
  const t2 = calistir.tarif(proje.toUpperCase());
  kontrol('tarif: kayit package.json\'u ezer, yol buyuk/kucuk harf bagimsiz', t2.komut === 'uv run uvicorn app:app' && t2.kaynak === 'ayar', t2);
  kontrol('calistir.json gecici HOME altinda (gercek dosyaya dokunulmadi)', calistir.DOSYA.startsWith(GECICI), calistir.DOSYA);
}

// --- 1e. Oturum kimligi (v2.3): beyin durumu tahmin degil kimlikle ---
{
  const beyin = require(path.join(KOK, 'electron', 'beyin.cjs'));
  const yol = 'C:\\Proje\\Ornek';
  const dizin = path.join(GECICI, '.claude', 'projects', beyin.slug(yol));
  fs.mkdirSync(dizin, { recursive: true });
  const kimlik = '11111111-2222-4333-8444-555555555555';
  const baska = '99999999-2222-4333-8444-555555555555';
  // --resume senaryosu: konusmanin dosyasi bu oturum baslamadan COK once dogmus. Dogum zamani
  // taklit edilemez (utimes birthtime'i degistirmez), o yuzden oturum "simdi + 5 dk" baslatilir:
  // diskteki iki dosya da baslangictan once dogmus olur, tipki surdurulen konusma gibi.
  fs.writeFileSync(path.join(dizin, kimlik + '.jsonl'), '{"type":"assistant","message":{"model":"m","usage":{"input_tokens":5,"cache_read_input_tokens":7}}}\n');
  fs.writeFileSync(path.join(dizin, baska + '.jsonl'), '{"type":"assistant","message":{"model":"m","usage":{"input_tokens":1}}}\n');
  const baslangic = Date.now() + 5 * 60_000;
  kontrol('kimlik verilince surdurulen konusmanin baglami okunur', beyin.oturumBaglami(yol, baslangic, kimlik)?.token === 12, beyin.oturumBaglami(yol, baslangic, kimlik));
  kontrol('kimlik yoksa eski sezgi surdurulen konusmayi bulamaz (kimligin gerekcesi)', beyin.oturumBaglami(yol, baslangic) === null);
  kontrol('kimlik yanlis dosyaya dusmez: digeri ayri okunur', beyin.oturumBaglami(yol, baslangic, baska)?.token === 1);
  kontrol('transcriptVar: var / yok / gecersiz kimlik', beyin.transcriptVar(yol, kimlik) === true && beyin.transcriptVar(yol, '00000000-0000-4000-8000-000000000000') === false && beyin.transcriptVar(yol, '../x') === false);
}

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
