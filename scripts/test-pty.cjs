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
    // Baglanti hic acilmadiysa da reddedilmis sayilir; aciliyorsa 4401 ile kapanmali.
    let acildi = false;
    kotu.on('open', () => { acildi = true; });
    kotu.on('close', () => kontrol('yanlis token reddedildi', !acildi || reddedildi));
  });

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

  // 4) Kapatma korumasinin iki ayagi: cocuk surec sorgusu ve guvenli cikis. claude yerine
  // uzun bir ping: ayni kural (Ctrl+C ile kendi yoluyla biten cocuk surec).
  const cevap = (tip, n) =>
    new Promise((r) => {
      const dinle = (ham) => {
        const m = JSON.parse(ham.toString());
        if (m.t === tip && m.n === n) {
          ws.off('message', dinle);
          r(m);
        }
      };
      ws.on('message', dinle);
      setTimeout(() => r(null), 20000);
    });
  ws.send(JSON.stringify({ t: 'veri', d: 'ping -n 60 127.0.0.1 > NUL\r' }));
  await bekle(1500);
  let bekleyen = cevap('cocuklar', 1);
  ws.send(JSON.stringify({ t: 'cocuk', n: 1 }));
  const c1 = await bekleyen;
  kontrol('cocuk sorgusu calisan sureci gordu (ping)', !!c1 && Array.isArray(c1.adlar) && c1.adlar.some((a) => /ping/i.test(a)));
  bekleyen = cevap('cikis', 2);
  ws.send(JSON.stringify({ t: 'cik', n: 2 }));
  const c2 = await bekleyen;
  kontrol('guvenli cikis sureci kendi yoluyla bitirdi (temiz)', !!c2 && c2.temiz === true);
  bekleyen = cevap('cocuklar', 3);
  ws.send(JSON.stringify({ t: 'cocuk', n: 3 }));
  const c3 = await bekleyen;
  kontrol('guvenli cikistan sonra cocuk yok, kabuk hayatta', !!c3 && Array.isArray(c3.adlar) && c3.adlar.length === 0 && bitti === null);

  ws.send(JSON.stringify({ t: 'veri', d: 'exit\r' }));
  await bekle(1500);
  kontrol('kabuk cikinca bitti mesaji geldi', bitti !== null);

  // 4b) Servis bolmesi (Calistir, v2.3): komut pwsh'ta calisir, adres ANSI'li ciktidan
  // yakalanir, bolme kapaninca TUM agac olur ve port bosalir (hayalet port tuzagi).
  // Sunucu Vite gibi yazar: port rakamlari renk kodlari arasinda. Bir de torun surec acar
  // (npm -> node -> vite zincirinin yerine): p.kill() yalniz kabugu oldururdu.
  {
    const fs = require('fs');
    const os = require('os');
    const net = require('net');
    const gecici = fs.mkdtempSync(path.join(os.tmpdir(), 'kokpit-servis-'));
    const pidDosyasi = path.join(gecici, 'pidler.json');
    const betik = path.join(gecici, 'sunucu.js');
    fs.writeFileSync(
      betik,
      [
        "const http = require('http'); const { spawn } = require('child_process'); const fs = require('fs');",
        // Torun konsoldan KOPUK (detached): ConPTY kapaninca konsola bagli surecler zaten olur, p.kill()
        // onlari da goturur (mutasyon testi 2026-10-04: yalniz-kabuk mutasyonu kacti). Hayalet port
        // konsoldan kopmus surectir; agac oldurmenin gerekcesi bu.
        "const torun = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore', detached: true, windowsHide: true }); torun.unref();",
        "const s = http.createServer((q, r) => r.end('ok')).listen(0, '127.0.0.1', () => {",
        "  const port = s.address().port;",
        "  fs.writeFileSync(" + JSON.stringify(pidDosyasi) + ", JSON.stringify({ ana: process.pid, torun: torun.pid, port }));",
        "  console.log('  VITE ready\\n  \\u001b[32m➜\\u001b[39m  Local:   \\u001b[36mhttp://localhost:\\u001b[1m' + port + '\\u001b[22m/\\u001b[39m');",
        '});',
      ].join('\n')
    );
    const ws2 = new WebSocket(`ws://127.0.0.1:${port}/?token=${TOKEN}`);
    let adres = null;
    let hata2 = null;
    ws2.on('message', (ham) => {
      const m = JSON.parse(ham.toString());
      if (m.t === 'adres') adres = m.adres;
      else if (m.t === 'hata') hata2 = m.mesaj;
    });
    await new Promise((r) => ws2.on('open', r));
    // Gecersiz komut (cok satirli) reddedilir: servis yalniz tek satir komut kosar.
    const red = new WebSocket(`ws://127.0.0.1:${port}/?token=${TOKEN}`);
    let redMesaji = null;
    red.on('message', (ham) => { const m = JSON.parse(ham.toString()); if (m.t === 'hata') redMesaji = m.mesaj; });
    await new Promise((r) => red.on('open', r));
    red.send(JSON.stringify({ t: 'ac', cwd: gecici, komut: 'servis', calistir: 'echo a\r\necho b', cols: 100, rows: 30 }));
    ws2.send(JSON.stringify({ t: 'ac', cwd: gecici, komut: 'servis', calistir: 'node "' + betik + '"', cols: 120, rows: 30 }));
    for (let i = 0; i < 60 && (!adres || !fs.existsSync(pidDosyasi)); i++) await bekle(250);
    kontrol('cok satirli servis komutu reddedildi', redMesaji === 'Geçersiz çalıştırma komutu');
    try { red.close(); } catch { /* */ }
    const pidler = fs.existsSync(pidDosyasi) ? JSON.parse(fs.readFileSync(pidDosyasi, 'utf8')) : null;
    kontrol('servis basladi, adres ANSI renkli ciktidan yakalandi', !!pidler && adres === 'http://localhost:' + pidler.port + '/' && !hata2);
    const yasiyor = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
    kontrol('servisin ana ve torun sureci calisiyor', !!pidler && yasiyor(pidler.ana) && yasiyor(pidler.torun));
    ws2.close();
    await bekle(2500);
    kontrol('bolme kapaninca agac oldu (ana + torun)', !!pidler && !yasiyor(pidler.ana) && !yasiyor(pidler.torun));
    const portAcik = await new Promise((r) => {
      const b = net.connect(pidler ? pidler.port : 1, '127.0.0.1');
      b.on('connect', () => { b.destroy(); r(true); });
      b.on('error', () => r(false));
    });
    kontrol('port bosaldi (hayalet port yok)', !portAcik);
    try { fs.rmSync(gecici, { recursive: true, force: true }); } catch { /* */ }
  }

  // 4c) Model saglayici env kapsami: yalniz `claude` komutlu oturum alir. Test seam'i
  // (KOKPIT_TEST_KABUK=1) gercek claude acmaz; ayni ortam yolunu duz pwsh ile sinar.
  try {
    const fs = require('fs');
    const os = require('os');
    const DIZIN = fs.mkdtempSync(path.join(os.tmpdir(), 'kokpit-pty-saglayici-'));
    const ANAHTAR = 'pty-test-anahtar'; // dummy: ciktiya gercek anahtar yazilmaz
    fs.writeFileSync(
      path.join(DIZIN, 'saglayici.json'),
      JSON.stringify(
        {
          surum: 1,
          secili: 'deepseek',
          efor: 'varsayilan',
          saglayicilar: {
            anthropic: { anahtar: '' },
            deepseek: {
              anahtar: ANAHTAR,
              baseUrl: 'https://api.deepseek.com/anthropic',
              model: 'deepseek-flash[1m]',
              hafifModel: 'deepseek-flash',
              altModel: 'deepseek-flash',
              baglam: 786432,
            },
            ozel: { anahtar: '', baseUrl: '', model: '', hafifModel: '', altModel: '', baglam: 0 },
          },
        },
        null,
        2
      )
    );

    // Ebeveyn ortamindaki gercek ANTHROPIC_* degerleri temizlenir: "bos" iddiasi onlara bagli kalmasin.
    const YONETILEN = [
      'ANTHROPIC_BASE_URL', 'ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_API_KEY', 'ANTHROPIC_MODEL',
      'ANTHROPIC_DEFAULT_OPUS_MODEL', 'ANTHROPIC_DEFAULT_SONNET_MODEL',
      'ANTHROPIC_DEFAULT_HAIKU_MODEL', 'ANTHROPIC_DEFAULT_FABLE_MODEL',
      'CLAUDE_CODE_SUBAGENT_MODEL', 'CLAUDE_CODE_EFFORT_LEVEL',
      'CLAUDE_CODE_AUTO_COMPACT_WINDOW', 'ANTHROPIC_SMALL_FAST_MODEL',
    ];
    const TEMIZ = {
      ...process.env,
      KOKPIT_PTY_TOKEN: TOKEN,
      KOKPIT_DIZIN: DIZIN,
      KOKPIT_TEST_KABUK: '1',
    };
    for (const ad of YONETILEN) delete TEMIZ[ad];

    const sunucu2 = spawn('node', [SUNUCU], { stdio: ['pipe', 'pipe', 'pipe'], env: TEMIZ });
    sunucu2.stderr.setEncoding('utf8');
    sunucu2.stderr.on('data', (d) => console.log('[saglayici sunucu stderr]', d.trim()));
    const port2 = await new Promise((coz, red) => {
      let t = '';
      const zaman = setTimeout(() => red(new Error('saglayici sunucu hazir olmadi')), 10000);
      sunucu2.stdout.setEncoding('utf8');
      sunucu2.stdout.on('data', (d) => {
        t += d;
        const satir = t.split('\n').find((s) => s.includes('"hazir"'));
        if (!satir) return;
        clearTimeout(zaman);
        coz(JSON.parse(satir).port);
      });
    });

    // Degerler ayri satirlarda yazilir; marker parcali kurulur ki komutun EKO satiri
    // gercek cikti sanilmasin (echo icinde "BASE=" bitisik gecmez).
    const envKomutu = () =>
      'Write-Output ("BA"+"SE="+$env:ANTHROPIC_BASE_URL);' +
      'Write-Output ("TO"+"K="+$env:ANTHROPIC_AUTH_TOKEN);' +
      'Write-Output ("MO"+"DEL="+$env:ANTHROPIC_MODEL);' +
      'Write-Output ("BA"+"G="+$env:CLAUDE_CODE_AUTO_COMPACT_WINDOW);' +
      'Write-Output ("OT"+"U="+$env:KOKPIT_OTURUM);' +
      'Write-Output ("KOKPIT"+"ENV-BITTI")';
    const deger = (ekran, ad) => {
      // ANSI kacislari satir basina yapisabiliyor; marker komutta parcali yazildigi icin
      // ("BA"+"SE=") eko satiri bu desenle eslesmez.
      const m = ekran.match(new RegExp(ad + '=([^\\r\\n]*)'));
      return m ? m[1].trim() : null;
    };
    const envOturum = (hedefPort, ac, elleYaz) =>
      new Promise((coz, red) => {
        const w = new WebSocket(`ws://127.0.0.1:${hedefPort}/?token=${TOKEN}`);
        let ekran = '';
        const zaman = setTimeout(() => {
          try { w.close(); } catch { /* */ }
          red(new Error('env oturumu zaman asimi'));
        }, 20000);
        w.on('open', () => {
          w.send(JSON.stringify(ac));
          if (elleYaz) {
            setTimeout(() => {
              try { w.send(JSON.stringify({ t: 'veri', d: envKomutu() + '\r' })); } catch { /* */ }
            }, 2500);
          }
        });
        w.on('message', (ham) => {
          const m = JSON.parse(ham.toString());
          if (m.t === 'veri') {
            ekran += m.d;
            if (ekran.includes('KOKPITENV-BITTI')) {
              clearTimeout(zaman);
              try { w.close(); } catch { /* */ }
              coz(ekran);
            }
          } else if (m.t === 'hata') {
            clearTimeout(zaman);
            try { w.close(); } catch { /* */ }
            red(new Error(m.mesaj));
          }
        });
        w.on('error', (e) => { clearTimeout(zaman); red(e); });
      });

    const c1 = await envOturum(
      port2,
      { t: 'ac', cwd: KOK, komut: 'claude', oturum: 'saglayici-test', cols: 100, rows: 30 },
      true
    );
    kontrol('claude (test kabugu): BASE_URL saglayicidan geldi', deger(c1, 'BASE') === 'https://api.deepseek.com/anthropic');
    kontrol('claude (test kabugu): AUTH_TOKEN saglayicidan geldi', deger(c1, 'TOK') === ANAHTAR);
    kontrol('claude (test kabugu): MODEL saglayicidan geldi', deger(c1, 'MODEL') === 'deepseek-flash[1m]');
    kontrol('claude (test kabugu): AUTO_COMPACT saglayicidan geldi', deger(c1, 'BAG') === '786432');
    kontrol('claude (test kabugu): KOKPIT_OTURUM korunuyor', deger(c1, 'OTU') === 'saglayici-test');

    const c2 = await envOturum(port2, { t: 'ac', cwd: KOK, cols: 100, rows: 30 }, true);
    kontrol('duz kabuk: saglayici env yok (BASE/TOK bos)', deger(c2, 'BASE') === '' && deger(c2, 'TOK') === '');
    kontrol('duz kabuk: model ve baglam bos', deger(c2, 'MODEL') === '' && deger(c2, 'BAG') === '');

    const c3 = await envOturum(
      port2,
      { t: 'ac', cwd: KOK, komut: 'servis', calistir: envKomutu() + ';exit', cols: 120, rows: 30 },
      false
    );
    kontrol(
      'servis oturumu: saglayici env yok',
      deger(c3, 'BASE') === '' && deger(c3, 'TOK') === '' && deger(c3, 'MODEL') === '' && deger(c3, 'BAG') === ''
    );

    try { sunucu2.stdin.end(); } catch { /* */ }
    await bekle(1500);
    try { fs.rmSync(DIZIN, { recursive: true, force: true }); } catch { /* kilitliyse temp'te kalir */ }

    // Miras AUTH_TOKEN: saglayici.json anahtari BOS. DeepSeek dalinda AUTH_TOKEN silinmedigi
    // icin ebeveyn ortamindan gelen deger claude oturumunda korunur (dolu olsaydi uzerine yazardi).
    // Duz kabuk/servis temiz ebeveynli sunucuda kosar: saglayici env'i onlara hic uygulanmaz
    // (parent env'lerinde dummy token olsaydi onlar da miras alirdi; bu yuzden ayri sunucu).
    const DIZIN2 = fs.mkdtempSync(path.join(os.tmpdir(), 'kokpit-pty-miras-'));
    fs.writeFileSync(
      path.join(DIZIN2, 'saglayici.json'),
      JSON.stringify(
        {
          surum: 1,
          secili: 'deepseek',
          efor: 'varsayilan',
          saglayicilar: {
            anthropic: { anahtar: '' },
            deepseek: {
              anahtar: '',
              baseUrl: 'https://api.deepseek.com/anthropic',
              model: 'deepseek-flash[1m]',
              hafifModel: 'deepseek-flash',
              altModel: 'deepseek-flash',
              baglam: 786432,
            },
            ozel: { anahtar: '', baseUrl: '', model: '', hafifModel: '', altModel: '', baglam: 0 },
          },
        },
        null,
        2
      )
    );
    const TEMIZ2 = { ...TEMIZ, KOKPIT_DIZIN: DIZIN2, ANTHROPIC_AUTH_TOKEN: 'miras-token' };
    const sunucu3 = spawn('node', [SUNUCU], { stdio: ['pipe', 'pipe', 'pipe'], env: TEMIZ2 });
    sunucu3.stderr.setEncoding('utf8');
    sunucu3.stderr.on('data', (d) => console.log('[miras sunucu stderr]', d.trim()));
    const port3 = await new Promise((coz, red) => {
      let t = '';
      const zaman = setTimeout(() => red(new Error('miras sunucu hazir olmadi')), 10000);
      sunucu3.stdout.setEncoding('utf8');
      sunucu3.stdout.on('data', (d) => {
        t += d;
        const satir = t.split('\n').find((s) => s.includes('"hazir"'));
        if (!satir) return;
        clearTimeout(zaman);
        coz(JSON.parse(satir).port);
      });
    });
    const c4 = await envOturum(
      port3,
      { t: 'ac', cwd: KOK, komut: 'claude', oturum: 'miras-test', cols: 100, rows: 30 },
      true
    );
    kontrol('miras AUTH_TOKEN: claude oturumu koruyor (anahtar bos)', deger(c4, 'TOK') === 'miras-token');
    kontrol(
      'miras AUTH_TOKEN: duz kabuk ve serviste yok (temiz sunucu)',
      deger(c2, 'TOK') === '' && deger(c3, 'TOK') === ''
    );
    try { sunucu3.stdin.end(); } catch { /* */ }
    await bekle(1500);
    try { fs.rmSync(DIZIN2, { recursive: true, force: true }); } catch { /* kilitliyse temp'te kalir */ }
  } catch (e) {
    kontrol('saglayici env kapsami calisti', false);
    console.log('[saglayici env testi]', e.message);
  }

  // 5) Yetim kontrolu
  cocuk.stdin.end();
  await bekle(1500);
  kontrol('ebeveyn stdin kapaninca sunucu temiz oldu', cocuk.exitCode === 0);

  console.log('\n=== SONUC ===');
  for (const [ad, gecti] of sonuclar) console.log((gecti ? 'PASS ' : 'FAIL ') + ad);
  const kalan = sonuclar.filter(([, g]) => !g).length;
  console.log(kalan === 0 ? '\nTUMU GECTI' : `\n${kalan} KONTROL BASARISIZ`);
  process.exit(kalan === 0 ? 0 : 1);
});

setTimeout(() => { console.log('ZAMAN ASIMI'); try { cocuk.kill(); } catch {} process.exit(1); }, 150000);
