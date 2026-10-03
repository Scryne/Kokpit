/**
 * Kanca koprusunun GERCEK claude ile uctan uca testi. Elle calistirilir, CI'da degil:
 * gercek bir claude turu acar (plan kullanimi harcar, ~30-60 sn).
 *   npm run e2e:kanca
 *
 * Zincir: kanca.cjs (alici + ayar dosyasi) -> pty-server.cjs (claude --settings ...,
 * KOKPIT_OTURUM) -> claude'un HTTP hook'lari ve statusline'i -> kanca.anlik().
 * Kokpit'in kendisi (Electron) aradan cikarilir; arayuz tarafini test:ui sinar.
 *
 * Calisma klasoru sabit (~/.kokpit/e2e-proje): ilk kosuda claude "bu klasore guveniyor
 * musun" sorar, test "Evet"i secer; sonraki kosularda sorulmaz. Kosu bitince claude'un bu
 * klasor icin yazdigi transcript dizini silinir: test oturumu beyne "dusmemis oturum"
 * olarak gorunmesin.
 */
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');

const KOK = path.join(__dirname, '..');
const WebSocket = require(path.join(KOK, 'node_modules', 'ws'));
const kanca = require(path.join(KOK, 'electron', 'kanca.cjs'));

const E2E = path.join(os.homedir(), '.kokpit', 'e2e-proje');
const OTURUM = 'e2e-' + Date.now().toString(36);
const TRANSCRIPT_DIZINI = path.join(os.homedir(), '.claude', 'projects', E2E.replace(/[^A-Za-z0-9]/g, '-'));
const uyu = (ms) => new Promise((r) => setTimeout(r, ms));

const sonuclar = [];
function kontrol(ad, gecti, ayrinti) {
  sonuclar.push([ad, gecti]);
  console.log((gecti ? 'PASS ' : 'FAIL ') + ad + (!gecti && ayrinti !== undefined ? '  -> ' + JSON.stringify(ayrinti) : ''));
}

async function bekle(kosul, ms) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (kosul()) return true;
    await uyu(500);
  }
  return kosul();
}

(async () => {
  fs.mkdirSync(E2E, { recursive: true });
  const sinyaller = [];
  await kanca.baslat({ sinyal: (id, s) => sinyaller.push([id, s]) });

  const TOKEN = crypto.randomBytes(32).toString('hex');
  const sunucu = spawn('node', [path.join(KOK, 'electron', 'pty-server.cjs')], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, ...kanca.ptyOrtami(), KOKPIT_PTY_TOKEN: TOKEN },
  });
  const port = await new Promise((coz) => {
    let t = '';
    sunucu.stdout.setEncoding('utf8');
    sunucu.stdout.on('data', (d) => {
      t += d;
      const s = t.split('\n').find((x) => x.includes('"hazir"'));
      if (s) coz(JSON.parse(s).port);
    });
  });

  const ws = new WebSocket('ws://127.0.0.1:' + port + '/?token=' + TOKEN);
  let ekran = '';
  let guvenVerildi = false;
  let cikis = null;
  ws.on('message', (ham) => {
    const m = JSON.parse(ham.toString());
    if (m.t === 'veri') {
      ekran += m.d;
      if (!guvenVerildi && /trust/i.test(ekran) && /Esc.{0,8}to.{0,8}cancel/.test(ekran)) {
        guvenVerildi = true;
        setTimeout(() => {
          ws.send(JSON.stringify({ t: 'veri', d: '\x1b[B' }));
          setTimeout(() => ws.send(JSON.stringify({ t: 'veri', d: '\r' })), 400);
        }, 800);
      }
    } else if (m.t === 'cikis') cikis = m;
  });
  await new Promise((r) => ws.on('open', r));
  ws.send(JSON.stringify({ t: 'ac', cwd: E2E, komut: 'claude', oturum: OTURUM, cols: 120, rows: 40 }));

  await uyu(14000);
  ws.send(JSON.stringify({ t: 'veri', d: 'Use the Write tool to create kokpit-e2e.txt containing exactly one line: ok. Then reply only: tamam' }));
  await uyu(500);
  ws.send(JSON.stringify({ t: 'veri', d: '\r' }));

  const durum = () => kanca.anlik().oturumlar[OTURUM];
  kontrol('tur basladi: hook geldi, sekme kimligi dogru', await bekle(() => !!durum(), 60000), Object.keys(kanca.anlik().oturumlar));
  kontrol('tur bitti (Stop)', await bekle(() => durum() && durum().durum === 'bitti', 150000), durum() && durum().durum);
  const d = durum() || {};
  kontrol('Write araci goruldu, satir sayildi', d.ozet && d.ozet.dosyalar.some((x) => x.endsWith('kokpit-e2e.txt')) && d.ozet.arti >= 1, d.ozet);
  kontrol('bitti sinyali geldi', sinyaller.some(([id, s]) => id === OTURUM && s === 'bitti'), sinyaller);
  kontrol('tur suresi olculdu', typeof d.sonTurSuresiMs === 'number' && d.sonTurSuresiMs > 0, d.sonTurSuresiMs);
  const statusline = await bekle(() => !!kanca.anlik().limitler && !!kanca.anlik().baglamlar[OTURUM], 20000);
  const a = kanca.anlik();
  kontrol('statusline: limitler ulasti', !!(a.limitler && (a.limitler.besSaat || a.limitler.hafta)), a.limitler);
  kontrol('statusline: oturumun baglami', statusline && a.baglamlar[OTURUM].token > 0, a.baglamlar[OTURUM]);

  // Guvenli cikis: SessionEnd hook'u da kopruye gelmeli (projenin kendi hook'lariyla birlikte).
  ws.send(JSON.stringify({ t: 'cik', n: 1 }));
  await bekle(() => cikis !== null, 90000);
  kontrol('guvenli cikis temiz', cikis && cikis.temiz === true, cikis);
  kontrol('SessionEnd -> kapandi', await bekle(() => durum() && durum().durum === 'kapandi', 10000), durum() && durum().durum);

  try { ws.close(); } catch { /* kapali */ }
  sunucu.stdin.end();
  kanca.durdur();
  await uyu(1500);
  try { fs.rmSync(path.join(E2E, 'kokpit-e2e.txt'), { force: true }); } catch { /* yok */ }
  // Test transcript'i yalniz bu sabit test klasorune ait; silinmezse Saglik sayfasinda
  // "beyne dusmemis oturum" olarak kalir.
  if (fs.existsSync(TRANSCRIPT_DIZINI)) fs.rmSync(TRANSCRIPT_DIZINI, { recursive: true, force: true });
  kontrol('test transcript dizini temizlendi', !fs.existsSync(TRANSCRIPT_DIZINI), TRANSCRIPT_DIZINI);

  const kalan = sonuclar.filter(([, g]) => !g).length;
  console.log('\n' + (sonuclar.length - kalan) + ' gecti, ' + kalan + ' kaldi');
  if (kalan === 0) console.log('TUMU GECTI');
  process.exit(kalan === 0 ? 0 : 1);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
