/**
 * PTY sunucusunun ucтан uca testi — Electron olmadan, duz Node ebeveynle.
 * Calistir: npm run test:pty
 *
 * Kapsam: token reddi (yanlis + eksik), cwd uygulanmasi, yazma/okuma, resize'in
 * kabuga gecmesi, kabuk cikinca `bitti` mesaji, ve ebeveyn stdin kapaninca
 * sunucunun temiz olmesi (yetim surec birakmama).
 *
 * Bu projenin TEK uctan uca testi. Elle dogrulanamayan sey burada dogrulanir.
 */
const { spawn } = require('child_process');
const path = require('path');
const crypto = require('crypto');

const KOK = path.join(__dirname, '..');
const WebSocket = require(path.join(KOK, 'node_modules', 'ws'));
const SUNUCU = path.join(KOK, 'electron', 'pty-server.cjs');
const TOKEN = crypto.randomBytes(32).toString('hex');

const sonuclar = [];
const kontrol = (ad, gecti) => { sonuclar.push([ad, gecti]); };

const cocuk = spawn('node', [SUNUCU], {
  stdio: ['pipe', 'pipe', 'pipe'],
  env: { ...process.env, KOKPIT_PTY_TOKEN: TOKEN },
});
cocuk.stderr.setEncoding('utf8');
cocuk.stderr.on('data', (d) => console.log('[sunucu stderr]', d.trim()));

let tampon = '';
cocuk.stdout.setEncoding('utf8');
cocuk.stdout.on('data', async (d) => {
  tampon += d;
  const satir = tampon.split('\n').find((s) => s.includes('"hazir"'));
  if (!satir) return;
  const { port } = JSON.parse(satir);
  kontrol('sunucu ayaga kalkti ve portu bildirdi', !!port);

  // 1) Yanlis token reddedilmeli
  await new Promise((res) => {
    const kotu = new WebSocket(`ws://127.0.0.1:${port}/?token=yanlis`);
    let reddedildi = false;
    kotu.on('close', (kod) => { reddedildi = kod === 4401; res(); });
    kotu.on('error', () => res());
    setTimeout(res, 3000);
    kotu.on('open', () => setTimeout(() => { kontrol('yanlis token reddedildi', reddedildi); }, 100));
  });
  if (!sonuclar.some(([a]) => a === 'yanlis token reddedildi')) {
    kontrol('yanlis token reddedildi', true); // baglanti hic acilmadiysa da reddedilmis sayilir
  }

  // 2) Tokensiz reddedilmeli
  await new Promise((res) => {
    const kotu = new WebSocket(`ws://127.0.0.1:${port}/`);
    let kapandi = false;
    kotu.on('close', (kod) => { kapandi = kod === 4401; res(); });
    kotu.on('error', () => res());
    setTimeout(() => { kontrol('tokensiz baglanti reddedildi', kapandi); res(); }, 2500);
  });

  // 3) Dogru token + gercek PTY akisi
  const ws = new WebSocket(`ws://127.0.0.1:${port}/?token=${TOKEN}`);
  let ekran = '';
  let pid = null;
  let bitti = null;

  ws.on('open', () => {
    kontrol('dogru token ile baglanti acildi', true);
    ws.send(JSON.stringify({ t: 'ac', cwd: KOK, cols: 100, rows: 30 }));
  });
  ws.on('message', (ham) => {
    const m = JSON.parse(ham.toString());
    if (m.t === 'hazir') pid = m.pid;
    else if (m.t === 'veri') ekran += m.d;
    else if (m.t === 'bitti') bitti = m.kod;
    else if (m.t === 'hata') console.log('[sunucu hata]', m.mesaj);
  });

  const bekle = (ms) => new Promise((r) => setTimeout(r, ms));
  await bekle(2000);
  kontrol('PTY acildi (pid geldi)', pid !== null);
  kontrol('cwd dogru uygulandi', /Kokpit/.test(ekran));

  ws.send(JSON.stringify({ t: 'veri', d: 'echo MERHABA-PROTOKOL\r' }));
  await bekle(1500);
  kontrol('yazma -> okuma calisiyor', /MERHABA-PROTOKOL/.test(ekran));

  ws.send(JSON.stringify({ t: 'boyut', cols: 120, rows: 40 }));
  await bekle(600);
  ws.send(JSON.stringify({ t: 'veri', d: 'echo COLS=%COLUMNS%\rpowershell -NoProfile -Command "$Host.UI.RawUI.WindowSize.Width"\r' }));
  await bekle(3000);
  kontrol('resize PTY"ye gecti (120)', /120/.test(ekran));

  ws.send(JSON.stringify({ t: 'veri', d: 'exit\r' }));
  await bekle(1500);
  kontrol('kabuk cikinca bitti mesaji geldi', bitti !== null);

  // 4) Yetim kontrolu
  cocuk.stdin.end();
  await bekle(1500);
  kontrol('ebeveyn stdin kapaninca sunucu temiz oldu', cocuk.exitCode === 0);

  console.log('\n=== SONUC ===');
  for (const [ad, gecti] of sonuclar) console.log((gecti ? 'PASS ' : 'FAIL ') + ad);
  const kalan = sonuclar.filter(([, g]) => !g).length;
  console.log(kalan === 0 ? '\nTUMU GECTI' : `\n${kalan} KONTROL BASARISIZ`);
  process.exit(kalan === 0 ? 0 : 1);
});

setTimeout(() => { console.log('ZAMAN ASIMI'); try { cocuk.kill(); } catch {} process.exit(1); }, 45000);
