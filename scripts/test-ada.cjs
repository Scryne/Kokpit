// v2.6 masaustu ajani testi: oturumsuz limit yoklamasi (limit.cjs), Kokpit disindaki oturumlar
// (dis-oturumlar.cjs) ve Ada'dan gorevin kabuga gecisi (gorev.cjs). Electron'suz, duz node.
//
// Gercek hicbir seye dokunmaz: limit ucu yerel sahte sunucu (KOKPIT_LIMIT_URL), kimlik dosyasi ve
// ~/.claude/sessions gecici dizinde, Kokpit verisi gecici KOKPIT_DIZIN'de. Gorev testi GERCEK pwsh'u
// node-pty ile pty-server'in actigi gibi acar; claude yerine argumanlarini dosyaya yazan bir node
// betigi calisir (claude.exe gibi yerel bir exe: arguman ayristirma kurallari ayni).

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

const GECICI = fs.mkdtempSync(path.join(os.tmpdir(), 'kokpit-ada-'));
const KIMLIK = path.join(GECICI, 'credentials.json');
const OTURUMLAR = path.join(GECICI, 'sessions');
fs.mkdirSync(OTURUMLAR);
process.env.KOKPIT_DIZIN = path.join(GECICI, 'kokpit');
process.env.KOKPIT_KIMLIK = KIMLIK;
process.env.KOKPIT_CLAUDE_OTURUMLAR = OTURUMLAR;
process.env.KOKPIT_LIMIT_ELLE_MS = '0'; // elle tazeleme siklik siniri testte kapali
delete process.env.KOKPIT_TEST_KABUK;

const KOK = path.join(__dirname, '..');
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
const uyu = (ms) => new Promise((r) => setTimeout(r, ms));

// 2026-10-04 spike'indaki gercek yanitin ilgili parcasi (bilinmeyen alanlar dahil).
const YANIT = {
  five_hour: { utilization: 15.0, resets_at: '2026-10-04T15:30:00.213272+00:00', limit_dollars: null },
  seven_day: { utilization: 92.0, resets_at: '2026-10-06T18:00:00.213293+00:00', limit_dollars: null },
  seven_day_opus: null,
  extra_usage: { is_enabled: false },
  limits: [{ kind: 'session', percent: 15 }],
};

function kimlikYaz(token, expiresAt) {
  fs.writeFileSync(KIMLIK, JSON.stringify({ claudeAiOauth: { accessToken: token, refreshToken: 'yenile-GIZLI', expiresAt } }));
}

async function limitTesti() {
  console.log('\n--- limit.cjs ---');
  // Sahte uc: istekleri kaydeder, cevabi `cevap` belirler.
  const istekler = [];
  let cevap = { kod: 200, govde: YANIT };
  const sunucu = http.createServer((req, res) => {
    istekler.push({ yetki: req.headers.authorization, beta: req.headers['anthropic-beta'] });
    res.writeHead(cevap.kod, { 'Content-Type': 'application/json' }).end(JSON.stringify(cevap.govde));
  });
  await new Promise((r) => sunucu.listen(0, '127.0.0.1', r));
  process.env.KOKPIT_LIMIT_URL = 'http://127.0.0.1:' + sunucu.address().port + '/api/oauth/usage';
  const limit = require(path.join(KOK, 'electron', 'limit.cjs'));

  const a = limit.ayristir(YANIT, 1000);
  kontrol('ayristir: 5 saat %15 + sifirlanma ani', a.besSaat.yuzde === 15 && a.besSaat.sifirlanma === Date.parse(YANIT.five_hour.resets_at), a.besSaat);
  kontrol('ayristir: hafta %92', a.hafta.yuzde === 92 && a.kaynak === 'usage' && a.olculdu === 1000, a.hafta);
  kontrol('ayristir: alan yoksa null, ikisi de yoksa sonuc null', limit.ayristir({ five_hour: null, seven_day: { utilization: 'x' } }, 1) === null);
  kontrol('ayristir: tek alan yeter, sifirlanma bozuksa null', JSON.stringify(limit.ayristir({ seven_day: { utilization: 40, resets_at: 'bozuk' } }, 1).hafta) === '{"yuzde":40,"sifirlanma":null}');
  kontrol('ayristir: yuzde 0-100 arasina sikisir', limit.ayristir({ five_hour: { utilization: 130 } }, 1).besSaat.yuzde === 100);

  kimlikYaz('tok-1', Date.now() + 3600_000);
  const olaylar = [];
  limit.baslat((l, d) => olaylar.push({ l, d }));
  for (let i = 0; i < 40 && !olaylar.some((o) => o.d === 'tamam'); i++) await uyu(50);
  kontrol('yoklama: tamam, limitler geldi', limit.durum() === 'tamam' && limit.son()?.hafta?.yuzde === 92, limit.durum());
  kontrol('yoklama: token kimlik dosyasindan, Bearer + oauth beta basligi', istekler[0]?.yetki === 'Bearer tok-1' && istekler[0]?.beta === 'oauth-2025-04-20', istekler[0]);
  const disk = path.join(process.env.KOKPIT_DIZIN, 'limit.json');
  const diskMetni = fs.existsSync(disk) ? fs.readFileSync(disk, 'utf8') : '';
  kontrol('son olcum diske yazildi, tokensiz', diskMetni.includes('"yuzde":92') && !diskMetni.includes('tok-1') && !diskMetni.includes('GIZLI'), diskMetni);

  // Token degisti (claude yeniledi): her yoklamada yeniden okunur.
  kimlikYaz('tok-2', Date.now() + 3600_000);
  await limit.tazele();
  kontrol('token her yoklamada yeniden okunur', istekler.at(-1)?.yetki === 'Bearer tok-2', istekler.at(-1));

  // 401: son olcum korunur, durum token-eski.
  cevap = { kod: 401, govde: { error: 'x' } };
  await limit.tazele();
  kontrol('401: durum token-eski, son olcum korunur', limit.durum() === 'token-eski' && limit.son()?.besSaat?.yuzde === 15, limit.durum());

  // Suresi dolmus token: uca HIC gidilmez (Kokpit token yenilemez).
  cevap = { kod: 200, govde: YANIT };
  kimlikYaz('tok-3', Date.now() - 1000);
  const once = istekler.length;
  await limit.tazele();
  kontrol('suresi dolmus token: istek yok, durum token-eski', istekler.length === once && limit.durum() === 'token-eski', { istek: istekler.length - once, durum: limit.durum() });

  fs.unlinkSync(KIMLIK);
  await limit.tazele();
  kontrol('kimlik dosyasi yok: token-yok, son olcum duruyor', limit.durum() === 'token-yok' && limit.son()?.hafta?.yuzde === 92);

  kimlikYaz('tok-4', Date.now() + 3600_000);
  // 500 gecerli gorunen bir govde tasisa da kabul edilmez (hata sayfasi limit degildir).
  cevap = { kod: 500, govde: { ...YANIT, seven_day: { utilization: 3, resets_at: YANIT.seven_day.resets_at } } };
  await limit.tazele();
  kontrol('500: durum hata, govdesi limit sayilmaz', limit.durum() === 'hata' && limit.son()?.hafta?.yuzde === 92, limit.son()?.hafta);
  cevap = { kod: 200, govde: { beklenmedik: true } };
  await limit.tazele();
  kontrol('beklenmedik govde: hata, son olcum ezilmez', limit.durum() === 'hata' && limit.son()?.hafta?.yuzde === 92);

  const log = fs.readFileSync(path.join(process.env.KOKPIT_DIZIN, 'kokpit.log'), 'utf8');
  kontrol('log token icermez', !/tok-\d|GIZLI/.test(log), log.slice(-200));
  limit.durdur();
  sunucu.close();
}

function birlestirmeTesti() {
  console.log('\n--- kanca.cjs limit birlestirme ---');
  // Iki kaynak: oturumun statusline'i ve oturumsuz yoklama. Yeni olan kazanir, eksik alan eskiden kalir.
  const kanca = require(path.join(KOK, 'electron', 'kanca.cjs'));
  const L = (olculdu, b, h, kaynak) => ({ olculdu, kaynak, besSaat: b === null ? null : { yuzde: b, sifirlanma: null }, hafta: h === null ? null : { yuzde: h, sifirlanma: null } });
  kanca.disLimit(L(2000, 10, 50, 'usage'), 'tamam');
  kanca.disLimit(L(1000, 99, 99, 'oturum'));
  let l = kanca.anlik().limitler;
  kontrol('eski olcum yenisini ezmez', l.besSaat.yuzde === 10 && l.hafta.yuzde === 50 && l.olculdu === 2000, l);
  kanca.disLimit(L(3000, 20, null, 'oturum'));
  l = kanca.anlik().limitler;
  kontrol('yeni olcum kazanir, eksik alan (hafta) eskiden kalir', l.besSaat.yuzde === 20 && l.hafta.yuzde === 50 && l.kaynak === 'oturum', l);
  kontrol('yoklama durumu anlikta', kanca.anlik().limitDurumu === 'tamam');
}

async function disTesti() {
  console.log('\n--- dis-oturumlar.cjs ---');
  const dis = require(path.join(KOK, 'electron', 'dis-oturumlar.cjs'));
  // Yasayan bir pid: bekleyen bir cocuk surec (test sureci kendisi sayilmaz).
  const cocuk = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 60000)'], { stdio: 'ignore' });
  const canli = cocuk.pid;
  const yaz = (ad, k) => fs.writeFileSync(path.join(OTURUMLAR, ad), typeof k === 'string' ? k : JSON.stringify(k));
  const ortak = { pid: canli, kind: 'interactive', startedAt: 1000, statusUpdatedAt: 2000 };
  yaz(canli + '.json', { ...ortak, sessionId: 'aaaa', cwd: 'C:\\Projeler\\DisProje', status: 'waiting' });
  yaz('1.json', { ...ortak, sessionId: 'bbbb', cwd: 'C:\\x\\Kokpitin', status: 'busy' }); // haric listede
  yaz('2.json', { ...ortak, sessionId: 'cccc', cwd: 'C:\\x\\Baski', status: 'idle', kind: 'print' }); // claude -p
  yaz('3.json', { ...ortak, pid: 4194000, sessionId: 'dddd', cwd: 'C:\\x\\Olu', status: 'busy' }); // olu pid
  yaz('4.json', '{ yarim');
  yaz('5.json', { ...ortak, sessionId: 'eeee', cwd: 'C:\\x\\Kabuk', status: 'shell', startedAt: 500 });
  yaz('6.json', { ...ortak, sessionId: 'ffff', cwd: 'C:\\x\\Bosta', status: 'idle', startedAt: 3000 });
  yaz(canli + '.abc.key', { pid: canli });
  const l = dis.oku(new Set(['bbbb']));
  const ozet = l.map((x) => x.ad + ':' + x.durum).join(',');
  kontrol('yasayan etkilesimli oturumlar, baslangica gore sirali', ozet === 'Kabuk:calisiyor,DisProje:bekliyor,Bosta:hazir', ozet);
  kontrol('Kokpit oturumu (kimlik), claude -p, olu pid, yarim JSON, .key atlandi', !/Kokpitin|Baski|Olu/.test(ozet));
  kontrol('yol ve durum zamani tasinir', l.find((x) => x.ad === 'DisProje')?.yol === 'C:\\Projeler\\DisProje' && l[0].degisti === 2000);
  cocuk.kill();
}

async function gorevTesti() {
  console.log('\n--- gorev.cjs ---');
  const G = require(path.join(KOK, 'electron', 'gorev.cjs'));
  kontrol('gorevMetni: kontrol karakteri atilir, satir sonu kalir', G.gorevMetni('a\u0007b\u001bc\nd\u0000') === 'abc\nd');
  kontrol('gorevMetni: basta - olursa bosluk (bayrak sanilmasin)', G.gorevMetni('--help ver') === ' --help ver');
  kontrol('gorevMetni: 4000 karakter siniri, metin degilse bos', G.gorevMetni('x'.repeat(5000)).length === 4000 && G.gorevMetni(42) === '');
  const id = '0f5c1a2b-3c4d-4e5f-8a9b-0c1d2e3f4a5b';
  kontrol('devamda gorev eklenmez', !G.claudeKomutu({ devam: true, claudeId: id, ayarArgumani: '', gorev: 'x' }).includes('$g'));
  kontrol('gorevsiz komut eskisiyle ayni', G.claudeKomutu({ devam: false, claudeId: id, ayarArgumani: " --settings 'a'", gorev: '' }) === 'claude --session-id ' + id + " --settings 'a'");
  kontrol('gecersiz kimlik komuta girmez', G.claudeKomutu({ devam: false, claudeId: 'x; rm', ayarArgumani: '', gorev: '' }) === 'claude');

  // Gercek pwsh: komut pty-server'daki gibi node-pty ile, ortam degiskeniyle.
  const pty = require(path.join(KOK, 'node_modules', 'node-pty'));
  const betik = path.join(GECICI, 'arguman-yaz.cjs');
  fs.writeFileSync(betik, "require('fs').writeFileSync(process.env.CIKTI, JSON.stringify({ argv: process.argv.slice(2), gorev: process.env.KOKPIT_GOREV ?? null }))");
  const ayar = path.join(GECICI, 'bosluklu dizin', 'ayar.json');
  const ornekler = [
    'Şunu yap: "tırnak" & echo pwned; $env:USERNAME `n \'tek\' \\ sonda\\',
    G.gorevMetni('-x bayrak gibi'),
    'çok\nsatırlı görev "son"',
    '$(Remove-Item C:\\yok) @(1,2) %PATH% ^| > dosya.txt',
  ];
  for (const [i, gorev] of ornekler.entries()) {
    const cikti = path.join(GECICI, 'cikti-' + i + '.json');
    const komut = G.claudeKomutu({ devam: false, claudeId: id, ayarArgumani: " --settings '" + ayar + "'", gorev, ikili: 'node "' + betik + '"' });
    const p = pty.spawn('pwsh.exe', ['-NoLogo', '-NoProfile', '-Command', komut], {
      cols: 120,
      rows: 30,
      cwd: GECICI,
      env: { ...process.env, KOKPIT_GOREV: gorev, CIKTI: cikti },
    });
    let ekran = '';
    p.onData((d) => (ekran += d));
    await new Promise((r) => p.onExit(r));
    const s = fs.existsSync(cikti) ? JSON.parse(fs.readFileSync(cikti, 'utf8')) : null;
    const beklenen = ['--session-id', id, '--settings', ayar, gorev];
    kontrol('pwsh -> exe: gorev ' + (i + 1) + ' tek arguman, birebir', !!s && JSON.stringify(s.argv) === JSON.stringify(beklenen), s ? s.argv : ekran.slice(-300));
    kontrol('pwsh -> exe: KOKPIT_GOREV cocuga sizmadi (' + (i + 1) + ')', !!s && s.gorev === null, s && s.gorev);
  }
}

(async () => {
  try {
    await limitTesti();
    birlestirmeTesti();
    await disTesti();
    await gorevTesti();
  } catch (e) {
    kontrol('kosucu', false, e.stack);
  }
  try {
    fs.rmSync(GECICI, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    /* temp'te kalir */
  }
  console.log('\n' + gecen + ' gecti, ' + kalan + ' kaldi');
  if (kalan === 0) console.log('TUMU GECTI');
  process.exit(kalan === 0 ? 0 : 1);
})();
