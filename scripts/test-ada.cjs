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
  // v3.2: --remote-control <ad>. Ad suzulur (tirnak, $, ; atilir); gercek pwsh'ta tek arguman.
  kontrol('uzak: ad suzgeci', G.uzakAdi("Matbaa'; rm $x") === 'Matbaa rm x' && G.uzakAdi('Kokpit/p1') === 'Kokpit/p1' && G.uzakAdi('') === '');
  kontrol('uzak: ad yoksa bayrak yok', !G.claudeKomutu({ devam: false, claudeId: id, ayarArgumani: '', gorev: '', uzak: "'" }).includes('remote-control'));
  const cikti = path.join(GECICI, 'cikti-uzak.json');
  const komut = G.claudeKomutu({ devam: true, claudeId: id, ayarArgumani: '', gorev: '', uzak: "Kokpit/p1 'x' $y", ikili: 'node "' + betik + '"' });
  const p = pty.spawn('pwsh.exe', ['-NoLogo', '-NoProfile', '-Command', komut], { cols: 120, rows: 30, cwd: GECICI, env: { ...process.env, CIKTI: cikti } });
  await new Promise((r) => p.onExit(r));
  const s = fs.existsSync(cikti) ? JSON.parse(fs.readFileSync(cikti, 'utf8')) : null;
  kontrol('uzak: pwsh -> exe: --remote-control "Kokpit Kokpit/p1 x y" tek arguman (devamda da)', !!s && JSON.stringify(s.argv) === JSON.stringify(['--resume', id, '--remote-control', 'Kokpit Kokpit/p1 x y']), s && s.argv);
  const { uzakBul } = require(path.join(KOK, 'electron', 'adres.cjs'));
  kontrol('uzak: baglanti ANSI icinden (claude 2.1.312 durum satiri)', uzakBul('\x1b[2m/remote-control is active · Continue here, on your phone, or at https://claude.ai/code/session_012tYRZYo7B54XT7vcWb8GEv\x1b[0m') === 'https://claude.ai/code/session_012tYRZYo7B54XT7vcWb8GEv');
  kontrol('uzak: kirpilmis baglanti kabul edilmez', uzakBul('or at https://claude.ai/code/session_012tY…') === null);
}

// v2.7: Ada tam ekranda cekilir, kenar boyunca tasinir. Karar ve yer saf; Win32 okumasi test:ui'da.
function saklanmaTesti() {
  console.log('\n--- tam-ekran.cjs + ada-yer.cjs (v2.7) ---');
  const { tamEkranMi } = require(path.join(KOK, 'electron', 'tam-ekran.cjs'));
  const ekran = { sol: 0, ust: 0, sag: 2560, alt: 1440 };
  kontrol('tam ekran: ekrani tam kaplayan pencere', tamEkranMi({ sol: 0, ust: 0, sag: 2560, alt: 1440 }, ekran) === true);
  kontrol('tam ekran degil: buyutulmus pencere (gorev cubugu ustunde)', tamEkranMi({ sol: -8, ust: -8, sag: 2568, alt: 1400 }, ekran) === false);
  // Cercevesiz uygulama (Electron, VS Code) gorev cubugu otomatik gizliyken buyutulunce ekrani TAM kaplar, tasmaz:
  // yalniz IsZoomed ayirir. (Ilk surumdeki ornek -8 tasiyordu; tasma kurali zaten yakaladigi icin IsZoomed'i
  // silen mutasyon kacti, 2026-10-06.)
  kontrol('tam ekran degil: buyutulmus cercevesiz pencere ekrani tam kaplasa da (IsZoomed)', tamEkranMi({ ...ekran }, ekran, { buyuk: true }) === false);
  kontrol('tam ekran degil: kenarlari tasan cerceve (buyutulmus gibi), IsZoomed olmasa da', tamEkranMi({ sol: -8, ust: -8, sag: 2568, alt: 1448 }, ekran) === false);
  kontrol('tam ekran degil: masaustu (Progman/WorkerW)', tamEkranMi({ ...ekran }, ekran, { sinif: 'WorkerW' }) === false && tamEkranMi({ ...ekran }, ekran, { sinif: 'Progman' }) === false);
  kontrol('tam ekran degil: baska ekrandaki tam ekran', tamEkranMi({ ...ekran }, ekran, { ayniEkran: false }) === false);
  kontrol('tam ekran: ikinci ekranin koordinatlarinda da', tamEkranMi({ sol: 2560, ust: -200, sag: 4480, alt: 880 }, { sol: 2560, ust: -200, sag: 4480, alt: 880 }) === true);
  kontrol('tam ekran degil: okunamadi (null)', tamEkranMi(null, ekran) === false && tamEkranMi({ ...ekran }, null) === false);
  // Kabuk katmanlari ekrani kaplar ama uygulama degil (Alt+Tab, Gorev gorunumu, Baslat/Arama).
  kontrol(
    'tam ekran degil: kabuk katmanlari (Alt+Tab XAML adasi, Baslat/Arama CoreWindow)',
    ['XamlExplorerHostIslandWindow', 'MultitaskingViewFrame', 'Windows.UI.Core.CoreWindow'].every((sinif) => tamEkranMi({ ...ekran }, ekran, { sinif }) === false)
  );
  kontrol('tam ekran: siradan bir uygulama sinifi (Chrome) kaplarsa sayilir', tamEkranMi({ ...ekran }, ekran, { sinif: 'Chrome_WidgetWin_1' }) === true);

  // Giris gecikmesi (v2.9): gercek logda sinemalarin %62'si 2,5 sn'den kisaydi, Ada titriyordu.
  const { sinemaAdimi, SINEMA_GIRIS_MS } = require(path.join(KOK, 'electron', 'tam-ekran.cjs'));
  const yokla = (okumalar, adim = 600) => {
    let d = { sinema: false, aday: null };
    return okumalar.map((tam, i) => (d = sinemaAdimi(d, tam, 1000 + i * adim)).sinema);
  };
  kontrol('sinema: tek yoklamalik tam ekran (Alt+Tab) sinemaya sokmaz', yokla([false, true, false, false]).every((s) => !s));
  kontrol('sinema: 1,8 sn suren tam ekran da sokmaz', yokla([true, true, true, true, false]).every((s) => !s), yokla([true, true, true, true, false]));
  const surekli = yokla([true, true, true, true, true, true]);
  kontrol('sinema: kesintisiz ' + SINEMA_GIRIS_MS + ' ms sonra girer (600 ms yoklamada 5. okuma)', surekli.indexOf(true) === 4, surekli);
  kontrol('sinema: araya giren tek "degil" sayaci sifirlar', yokla([true, true, true, false, true, true, true, true]).indexOf(true) === -1);
  const cikis = yokla([true, true, true, true, true, false]);
  kontrol('sinema: cikis gecikmesiz (tam ekran biter bitmez)', cikis[4] === true && cikis[5] === false, cikis);

  const yer = require(path.join(KOK, 'electron', 'ada-yer.cjs'));
  const alan = { x: 0, width: 2560 };
  const G = 460;
  kontrol('yer: oran 0.5 -> tam orta', yer.yatayKonum(alan, G, 0.5) === 1050);
  kontrol('yer: gecersiz oran (null, NaN) -> orta', yer.yatayKonum(alan, G, null) === 1050 && yer.yatayKonum(alan, G, NaN) === 1050);
  kontrol('yer: kenarlarda calisma alaninin icinde kalir', yer.yatayKonum(alan, G, 0) === 0 && yer.yatayKonum(alan, G, 1) === 2100 && yer.yatayKonum(alan, G, 7) === 2100);
  kontrol('yer: calisma alani kaymissa (sol gorev cubugu) ona gore', yer.yatayKonum({ x: 100, width: 1820 }, G, 0) === 100);
  kontrol('surukle: imlecin yolu kadar', yer.surukluKonum(alan, G, 1050, -600) === 450);
  kontrol('surukle: merkeze 28 px yakin -> tam orta (miknatis)', yer.surukluKonum(alan, G, 1000, 30) === 1050 && yer.surukluKonum(alan, G, 1100, -25) === 1050);
  kontrol('surukle: miknatisin disi serbest', yer.surukluKonum(alan, G, 1000, 21) === 1021);
  kontrol('surukle: ekrandan tasmaz', yer.surukluKonum(alan, G, 100, -900) === 0 && yer.surukluKonum(alan, G, 2000, 900) === 2100);
  kontrol('oran: ortada tam 0.5', yer.oranBul(alan, G, 1050) === 0.5);
  const o = yer.oranBul(alan, G, 450);
  kontrol('oran: gidip donunce ayni yer (cozunurluk degisince goreli)', yer.yatayKonum(alan, G, o) === 450 && yer.yatayKonum({ x: 0, width: 1280 }, G, o) === Math.round(1280 * o - 230), o);
}

// v2.8: ust katman bekcisi. Karar saf; gercek z-sirasi test:ui'da.
function ustKatmanTesti() {
  console.log('\n--- ust-katman.cjs (v2.8) ---');
  const { dustuMu } = require(path.join(KOK, 'electron', 'ust-katman.cjs'));
  const T = { gorunur: true, ustte: true };
  const N = { gorunur: true, ustte: false };
  const G = { gorunur: false, ustte: false };
  kontrol('ustte: ustunde hic pencere yok', dustuMu([]) === -1);
  kontrol('ustte: ustunde yalniz topmost pencereler (mesru, yarisilmaz)', dustuMu([T, T]) === -1);
  kontrol('ustte: ustunde gizli normal pencere (gorunmuyor, saymaz)', dustuMu([G, T]) === -1);
  kontrol('dustu: ustunde gorunur normal pencere', dustuMu([N]) === 0);
  kontrol('dustu: topmost ve gizlilerden sonra gelen normal pencere bulunur', dustuMu([T, G, N, T]) === 2);

  // Surum bekcisi: imza git'in kendi dosyalarindan (surec acilmaz). Uc hal: gevsek ref, packed-refs, ayrik HEAD.
  const { imzaOku } = require(path.join(KOK, 'electron', 'surum.cjs'));
  const d = fs.mkdtempSync(path.join(require('os').tmpdir(), 'kokpit-imza-'));
  const h1 = 'a'.repeat(40);
  const h2 = 'b'.repeat(40);
  fs.mkdirSync(path.join(d, '.git', 'refs', 'heads'), { recursive: true });
  fs.writeFileSync(path.join(d, '.git', 'HEAD'), 'ref: refs/heads/master\n');
  kontrol('imza: ref hic yok -> null', imzaOku(d) === null);
  fs.writeFileSync(path.join(d, '.git', 'packed-refs'), '# pack-refs with: peeled\n' + h2 + ' refs/heads/master\n');
  kontrol('imza: packed-refs', imzaOku(d) === h2);
  fs.writeFileSync(path.join(d, '.git', 'refs', 'heads', 'master'), h1 + '\n');
  kontrol('imza: gevsek ref packed-refs\'ten once', imzaOku(d) === h1);
  fs.writeFileSync(path.join(d, '.git', 'HEAD'), h2 + '\n');
  kontrol('imza: ayrik HEAD', imzaOku(d) === h2);
  kontrol('imza: depo degil -> null', imzaOku(path.join(d, 'yok')) === null);
  fs.rmSync(d, { recursive: true, force: true });
}

// v3.0: nobet gecisleri, Ada'ya birakma bolgesi, git ozeti ayristirma, ek yolu denetimi (saf).
function v3Testi() {
  const { olaylariBul } = require(path.join(KOK, 'electron', 'nobet.cjs'));
  const is = (hal, ek = {}) => ({ proje: 'Yanki', ad: 'Üretim', hal, son: '2026-10-29T01:00:05+03:00', ayrinti: 'RunPod bakiyesi', ...ek });
  let r = olaylariBul(null, [is('dustu')]);
  kontrol('nobet: ilk okuma olay uretmez (eski dusus her acilista haber olmasin)', r.olaylar.length === 0 && r.gorulen['Yanki|Üretim'].hal === 'dustu');
  r = olaylariBul({ 'Yanki|Üretim': { hal: 'saglikli', son: null } }, [is('dustu')]);
  kontrol('nobet: saglikli -> dustu olayi', r.olaylar.length === 1 && r.olaylar[0].tur === 'dustu' && r.olaylar[0].ayrinti === 'RunPod bakiyesi', r.olaylar);
  r = olaylariBul({ 'Yanki|Üretim': { hal: 'dustu', son: null } }, [is('dustu')]);
  kontrol('nobet: dustu kalan is tekrar olay uretmez', r.olaylar.length === 0);
  r = olaylariBul({}, [is('dustu')]);
  kontrol('nobet: yeni bildirilen is (onceki kayitta yok) olay uretmez', r.olaylar.length === 0);
  const siparis = (son, deger) => ({ proje: 'Matbaa', ad: 'Günlük rapor', hal: 'saglikli', son, sayac: { ad: 'Yeni sipariş', deger, sevinc: true } });
  r = olaylariBul({ 'Matbaa|Günlük rapor': { hal: 'saglikli', son: 'A' } }, [siparis('B', 2)]);
  kontrol('nobet: yeni kosu + sayac > 0 -> sevinc', r.olaylar.length === 1 && r.olaylar[0].tur === 'sevinc' && r.olaylar[0].deger === 2 && r.olaylar[0].ad === 'Yeni sipariş', r.olaylar);
  r = olaylariBul({ 'Matbaa|Günlük rapor': { hal: 'saglikli', son: 'B' } }, [siparis('B', 2)]);
  kontrol('nobet: ayni kosu yeniden okununca sevinc tekrarlanmaz', r.olaylar.length === 0);
  r = olaylariBul({ 'Matbaa|Günlük rapor': { hal: 'saglikli', son: 'A' } }, [siparis('B', 0)]);
  kontrol('nobet: yeni kosu ama sayac 0 -> sevinc yok', r.olaylar.length === 0);

  const { hapBolgesinde } = require(path.join(KOK, 'electron', 'ada-yer.cjs'));
  const p = { x: 500, y: 0, width: 460 };
  kontrol('birak: hapin ustu (orta, ust 20 px) bolgede', hapBolgesinde({ x: 730, y: 20 }, p));
  kontrol('birak: hapin altindaki bos saydam alan bolgede degil', !hapBolgesinde({ x: 730, y: 200 }, p));
  kontrol('birak: pencerenin kenarindaki bos alan bolgede degil', !hapBolgesinde({ x: 505, y: 10 }, p));

  const { durumAyristir } = require(path.join(KOK, 'electron', 'git-ozet.cjs'));
  const g = durumAyristir(
    ['# branch.oid abc', '# branch.head master', '# branch.upstream origin/master', '# branch.ab +3 -1', '1 .M N... 100644 100644 100644 a b src/x.ts', '? yeni.txt', ''].join('\n')
  );
  kontrol('git: dal, ileride, uzak, kirli', g.dal === 'master' && g.ileride === 3 && g.uzakVar === true && g.kirli === 2, g);
  const g2 = durumAyristir('# branch.oid abc\n# branch.head (detached)\n');
  kontrol('git: ayrik HEAD + uzaksiz + temiz', g2.dal === null && g2.uzakVar === false && g2.ileride === 0 && g2.kirli === 0, g2);

  const { dosyaUygun } = require(path.join(KOK, 'electron', 'yakala.cjs'));
  const dosya = path.join(GECICI, 'ek.png');
  fs.writeFileSync(dosya, 'x');
  kontrol('ek: var olan mutlak dosya uygun', dosyaUygun(dosya, fs.statSync(dosya)));
  kontrol('ek: klasor uygun degil', !dosyaUygun(GECICI, fs.statSync(GECICI)));
  // Windows'ta klasorun boyutu 0: yukaridaki kontrol "bos dosya" kuralina da takilir. Dosya olmayan ama boyutu
  // olan bir girdi (aygit, baglanti) yalniz isFile kuraliyla reddedilir (mutasyonla kacti, 2026-10-29).
  kontrol('ek: boyutu olan ama dosya olmayan girdi uygun degil', !dosyaUygun(dosya, { isFile: () => false, size: 10 }));
  kontrol('ek: goreli yol uygun degil', !dosyaUygun('ek.png', fs.statSync(dosya)));
  kontrol('ek: satir sonu tasiyan yol uygun degil (Enter olurdu)', !dosyaUygun(dosya + '\r\nx', fs.statSync(dosya)));
  kontrol('ek: bos dosya uygun degil', (() => {
    const bos = path.join(GECICI, 'bos.png');
    fs.writeFileSync(bos, '');
    return !dosyaUygun(bos, fs.statSync(bos));
  })());
}

// v3.1: Ada'nin kulagi (electron/ses-komut.cjs). Ornekler gercek whisper ciktisindan (2026-10-29 olcumu).
function sesTesti() {
  const { duzelt, komutCoz, hedefBul, ipucu } = require('../electron/ses-komut.cjs');
  const o = [
    { id: 'k', ad: 'Kokpit' },
    { id: 'm', ad: 'Matbaa' },
    { id: 'y', ad: 'Yanki' },
    { id: 'c', ad: 'Citefield' },
    { id: 'u', ad: 'The Unknown' },
  ];
  kontrol('ses: "komit" -> commit', duzelt('sonucu komit at') === 'sonucu commit at');
  kontrol('ses: "paş" -> push (Unicode sinir)', duzelt('sonra paş etme') === 'sonra push etme');
  kontrol('ses: "puşla" -> push\'la', duzelt('komitle ve puşla') === "commitle ve push'la");
  kontrol('ses: "paşa" dokunulmaz (sozcugun parcasi)', duzelt('paşa geldi') === 'paşa geldi');
  kontrol('ses: ayrisik ş (s + cengel) da duzelir', duzelt('paş et') === 'push et');
  const n = (m) => komutCoz(m, o);
  const a = n('Matbaa oturumuna söyle, testleri koş ve sonucu komit at');
  kontrol('ses: "X oturumuna söyle" hedef + govde', a.tur === 'not' && a.hedef?.id === 'm' && a.metin === 'Testleri koş ve sonucu commit at' && !a.gonder, JSON.stringify(a));
  const b = n('Hoppite yaz, Ada penceresindeki hatayı düzelt');
  kontrol('ses: bulanik ad + baglac ("Hoppite yaz" -> Kokpit)', b.tur === 'not' && b.hedef?.id === 'k', JSON.stringify(b));
  // "Hoppit" Kokpit'e 2 harf uzak: baglac ("yaz", ":") olmadan hedef sayilmaz, yoksa siradan cumle oturuma gider.
  const c = n('Hoppit dedi ki bu iş bitti');
  kontrol('ses: baglacsiz bulanik ad hedef sayilmaz', c.tur === 'not' && c.hedef === null, JSON.stringify(c));
  const c2 = n('Hoppit: bunu düzelt');
  kontrol('ses: iki nokta da baglac sayilir ("Hoppit: ...")', c2.tur === 'not' && c2.hedef?.id === 'k' && c2.metin === 'Bunu düzelt', JSON.stringify(c2));
  const d = n("Citefield'e yaz, lint ve type check çalıştır, gönder");
  kontrol('ses: sondaki "gönder" hemen yollar', d.tur === 'not' && d.hedef?.id === 'c' && d.gonder && d.metin === 'Lint ve type check çalıştır', JSON.stringify(d));
  const e = n('Yanki oturumunda RunPod bakiyesini kontrol et');
  kontrol('ses: "X oturumunda" eki atilir', e.tur === 'not' && e.hedef?.id === 'y' && e.metin === 'RunPod bakiyesini kontrol et', JSON.stringify(e));
  const f = n('The Unknown oturumuna yaz deploy et');
  kontrol('ses: iki sozcuklu ad', f.tur === 'not' && f.hedef?.id === 'u' && f.metin === 'Deploy et', JSON.stringify(f));
  kontrol('ses: "Gönder." kontrol sozu', n('Gönder.').tur === 'gonder');
  kontrol('ses: "Vazgeç" kontrol sozu', n('Vazgeç').tur === 'vazgec');
  kontrol('ses: "Durum ne?" kontrol sozu', n('Durum ne?').tur === 'durum');
  kontrol('ses: "Yalnız yapıştır" kontrol sozu', n('Yalnız yapıştır').tur === 'yapistir');
  kontrol('ses: bos metin', n('  ').tur === 'bos');
  const g = n('testleri tekrar çalıştır');
  kontrol('ses: hedefsiz not, bas harf buyur', g.tur === 'not' && g.hedef === null && g.metin === 'Testleri tekrar çalıştır', JSON.stringify(g));
  const h = n('Kokpit');
  kontrol('ses: yalniz ad -> hedef secilir, metin bos', h.tur === 'not' && h.hedef?.id === 'k' && h.metin === '', JSON.stringify(h));
  kontrol('ses: "gönderdim" cumlesi kontrol sozu degil', n('dün gönderdim onu').tur === 'not');
  kontrol('ses: kisa ad bulanik eslesmez (Ada != Adam)', hedefBul('Adam yaz bunu', [{ id: 'a', ad: 'Ada' }]) === null);
  kontrol('ses: ipucu adlari ve terimleri tasir', ipucu(['Kokpit', 'Kokpit', '']).startsWith('Kokpit, commit'));
}

// v3.2, Faz 49-50: sesli ozet / cevap / git ve gunun brifingi (saf moduller).
function v32SesTesti() {
  const { komutCoz, siraCoz } = require('../electron/ses-komut.cjs');
  const { ozetCumlesi, cevapCoz, sozSadelestir, hedefSec } = require('../electron/sesli-ozet.cjs');
  const o = [{ id: 'm', ad: 'Matbaa' }, { id: 'k', ad: 'Kokpit' }, { id: 'y', ad: 'Yanki' }];
  const n = (m) => komutCoz(m, o);
  const j = (x) => JSON.stringify(x);
  // Komut cozumu
  let r = n('Matbaa ne yaptı?');
  kontrol('v32: "Matbaa ne yaptı" -> ozet @Matbaa', r.tur === 'ozet' && r.hedef?.id === 'm' && r.tam === false, j(r));
  r = n("Matbaa'da ne oldu");
  kontrol("v32: \"Matbaa'da ne oldu\" -> ozet @Matbaa", r.tur === 'ozet' && r.hedef?.id === 'm', j(r));
  r = n('ne yaptı');
  kontrol('v32: hedefsiz ozet', r.tur === 'ozet' && r.hedef === null, j(r));
  r = n('Matbaa son mesajı oku');
  kontrol('v32: "son mesajı oku" -> tam ozet', r.tur === 'ozet' && r.tam === true, j(r));
  r = n('İkinci seçenek.');
  kontrol('v32: "İkinci seçenek" (buyuk İ) -> cevap [1]', r.tur === 'cevap' && j(r.secimler) === '[1]', j(r));
  r = n("Matbaa'da birinci");
  kontrol("v32: \"Matbaa'da birinci\" -> cevap @Matbaa [0]", r.tur === 'cevap' && r.hedef?.id === 'm' && j(r.secimler) === '[0]', j(r));
  r = n('birinci ve üçüncü seçeneği gönder');
  kontrol('v32: cok soruya sirali cevap [0,2]', r.tur === 'cevap' && j(r.secimler) === '[0,2]', j(r));
  r = n('önerileni seç');
  kontrol('v32: "önerileni seç" -> onerilen', r.tur === 'cevap' && r.onerilen === true, j(r));
  r = n('ikinci seçeneği uygula sonra testleri koş');
  kontrol('v32: sira sayisiyla baslayan uzun cumle nottur', r.tur === 'not', j(r));
  r = n('bir şey yap');
  kontrol('v32: "bir şey yap" nottur (bir != secenek)', r.tur === 'not', j(r));
  r = n("Kokpit'i aç");
  kontrol("v32: \"Kokpit'i aç\" -> git @Kokpit", r.tur === 'git' && r.hedef?.id === 'k', j(r));
  r = n('aç');
  kontrol('v32: hedefsiz "aç" git degil (not)', r.tur !== 'git', j(r));
  r = n('Günaydın Ada.');
  kontrol('v32: "Günaydın Ada" -> brifing', r.tur === 'brifing', j(r));
  r = n('Ada, Matbaa ne yaptı?');
  kontrol('v32: bastaki "Ada," hitabi atilir', r.tur === 'ozet' && r.hedef?.id === 'm', j(r));
  r = n('İptal.');
  kontrol('v32: "İptal" (buyuk İ) vazgec (v3.1 hatasi)', r.tur === 'vazgec', j(r));
  kontrol('v32: siraCoz bes parca reddedilir', siraCoz('bir, iki, üç, dört, bir') === null);
  // Gercek whisper ciktilari (test:ses, 2026-10-29): rakamli sira ve "Önerilerini".
  r = n('2. Seçenek');
  kontrol('v32: whisper "2. Seçenek" -> cevap [1]', r.tur === 'cevap' && j(r.secimler) === '[1]', j(r));
  r = n('1. ve 3. seçenek');
  kontrol('v32: "1. ve 3. seçenek" -> [0,2]', r.tur === 'cevap' && j(r.secimler) === '[0,2]', j(r));
  r = n('Önerilerini Seç');
  kontrol('v32: whisper "Önerilerini Seç" -> onerilen', r.tur === 'cevap' && r.onerilen === true, j(r));
  r = n('2. el araba al');
  kontrol('v32: "2. el araba al" nottur', r.tur === 'not', j(r));
  // v3.3: Ada Aria'nin yuzu: soru bicimli ve acik hitapli cumle Aria'ya; yazma niyeti ve ozetler oldugu gibi.
  const tur = (m) => n(m).tur;
  kontrol('v33: bilgi sorusu Aria\'ya', tur("Matbaa'nın ölçüm günü ne zaman?") === 'aria' && tur('Yanki üretimi neden durdu') === 'aria' && tur("Kokpit'te testler geçti mi?") === 'aria');
  kontrol('v33: acik hitap ve "sor:" oneki atilir', n('Aria, bugün ne yapsam?').metin === 'bugün ne yapsam' && n('Sor: Tezgah kuralı neydi').metin === 'Tezgah kuralı neydi');
  kontrol('v33: "hatırla" Aria\'ya', tur("Hatırla: yarın ekiple toplantı var") === 'aria');
  kontrol('v33: yazma niyeti nottur, ozet/durum/cevap oncelikli', tur("Matbaa'ya yaz: testler geçti mi kontrol et") === 'not' && tur('Matbaa ne yaptı?') === 'ozet' && tur('Durum ne?') === 'durum' && tur('ikinci seçenek') === 'cevap' && tur('Testleri koş') === 'not');
  const { uyanmaAyikla } = require('../electron/ses-komut.cjs');
  const u = (m) => j(uyanmaAyikla(m));
  kontrol('v32 uyanma: "Ada, ..." komutu ayirir', u('Ada, Matbaa ne yaptı?') === '{"uyandi":true,"kalan":"Matbaa ne yaptı?"}');
  kontrol('v32 uyanma: yalniz "Ada." -> komutsuz uyanma', u('Ada.') === '{"uyandi":true,"kalan":""}');
  kontrol('v32 uyanma: "Hey Ada" ve tirnakli whisper ciktisi', uyanmaAyikla('Hey Ada günaydın').kalan === 'günaydın' && uyanmaAyikla('"Ada, ikinci seçenek."').kalan === 'ikinci seçenek.');
  kontrol('v32 uyanma: Adana / adam / Ada\'ya / cumle ortasi uyandirmaz', ['Adana çok sıcak', 'adam gibi', "Ada'ya yaz bunu", 'İyi akşamlar Ada', 'Altyazı M.K.'].every((m) => !uyanmaAyikla(m).uyandi));
  // Sesli ozet
  const simdi = 1_800_000_000_000;
  const soru = {
    durum: 'bekliyor', degisti: simdi - 5000, soruZamani: simdi - 5000,
    soruAyrinti: { cevaplanabilir: true, coklu: false, sorular: [{ baslik: 'Yol', soru: 'Hangi yolu seçelim?', secenekler: [{ etiket: 'Hızlı (Recommended)' }, { etiket: 'Sağlam' }] }] },
  };
  const bitti = {
    durum: 'bitti', degisti: simdi - 1000, durumZamani: simdi - 1000,
    tur: { dosyalar: ['a', 'b'], arti: 40, eksi: 3, araclar: 9, turlar: 1 }, ozet: { dosyalar: [], arti: 0, eksi: 0, araclar: 0, turlar: 0 },
    sonSoz: '## Bitti\n**Testler** geçti: `npm test` 12/12.\n- C:\\Users\\x\\proje\\src\\App.tsx düzeltildi',
  };
  const git = { olculdu: simdi, commit: 1, ileride: 1, kirli: 0, uzakVar: true };
  let c = ozetCumlesi({ ad: 'Matbaa', e: bitti, git, simdi, tam: false });
  kontrol('v32: bitti ozeti sayilari soyler', /2 dosyaya dokundu, 40 satır ekledi, 3 satır sildi/.test(c) && /1 commit attı/.test(c) && /push bekliyor/.test(c), c);
  kontrol('v32: ozet markdown ve tam yolu atar', !/[#*`]/.test(c) && /App\.tsx/.test(c) && !/Users/.test(c), c);
  c = ozetCumlesi({ ad: 'Matbaa', e: soru, git: null, simdi, tam: false });
  kontrol('v32: soru ozeti secenekleri sirayla okur', /bir, Hızlı/.test(c) && /iki, Sağlam/.test(c) && /ikinci/.test(c), c);
  c = ozetCumlesi({ ad: 'Matbaa', e: null, git: null, simdi, tam: false });
  kontrol('v32: etkinliksiz oturum', c === 'Matbaa henüz bir şey yapmadı.', c);
  const uzun = sozSadelestir('Bir. '.repeat(100), 60);
  kontrol('v32: uzun soz cumle sinirinda kesilir', uzun.length <= 61 && uzun.endsWith('.'), uzun);
  // Sesli cevap
  const oturumlar = { m: soru, k: bitti };
  let cv = cevapCoz({ hedef: null, secimler: [1], onerilen: false }, o, oturumlar);
  kontrol('v32: hedefsiz cevap soru soran oturuma gider', cv.istek?.id === 'm' && j(cv.istek.cevaplar) === '[1]' && cv.istek.damga === soru.soruZamani, j(cv));
  cv = cevapCoz({ hedef: null, secimler: null, onerilen: true }, o, oturumlar);
  kontrol('v32: onerilen secenek (Recommended) bulunur', j(cv.istek?.cevaplar) === '[0]', j(cv));
  cv = cevapCoz({ hedef: null, secimler: [2], onerilen: false }, o, oturumlar);
  kontrol('v32: olmayan secenek reddedilir', 'hata' in cv && /2 seçenek/.test(cv.hata), j(cv));
  cv = cevapCoz({ hedef: { id: 'k', ad: 'Kokpit' }, secimler: [0], onerilen: false }, o, oturumlar);
  kontrol('v32: soru sormayan oturuma cevap gitmez', 'hata' in cv && /soru sormuyor/.test(cv.hata), j(cv));
  cv = cevapCoz({ hedef: null, secimler: [0], onerilen: false }, o, { k: bitti });
  kontrol('v32: soru yoksa hata', 'hata' in cv && /bekleyen soru yok/i.test(cv.hata), j(cv));
  const iki = { ...soru, soruAyrinti: { ...soru.soruAyrinti, sorular: [soru.soruAyrinti.sorular[0], soru.soruAyrinti.sorular[0]] } };
  cv = cevapCoz({ hedef: null, secimler: [0], onerilen: false }, o, { m: iki });
  kontrol('v32: cok soruya tek sira yetmez', 'hata' in cv && /2 soru var/.test(cv.hata), j(cv));
  const coklu = { ...soru, soruAyrinti: { ...soru.soruAyrinti, cevaplanabilir: false, coklu: true } };
  cv = cevapCoz({ hedef: null, secimler: [0], onerilen: false }, o, { m: coklu });
  kontrol('v32: coklu secim terminale yonlenir', 'hata' in cv && /terminal/.test(cv.hata), j(cv));
  kontrol('v32: ozet hedefi sira sende olan', hedefSec(null, o, oturumlar, 'ozet')?.id === 'm');

  // Brifing
  const { brifingKur, brifingGunu } = require('../electron/brifing.cjs');
  const sabah = new Date(2026, 9, 30, 9, 0).getTime();
  kontrol('v32: brifing gunu 05:00 sinirli', brifingGunu(new Date(2026, 9, 30, 3, 0).getTime()) === '2026-10-29' && brifingGunu(sabah) === '2026-10-30');
  const durum = {
    vadeler: [
      { proje: 'Matbaa', tarih: '2026-10-29', saat: null, metin: 'matbaa kiyas', kalan_gun: -1 },
      { proje: 'GridGrade', tarih: '2026-10-30', saat: '14:00', metin: 'alan adı', kalan_gun: 0 },
      { proje: 'Otomat', tarih: '2026-11-05', saat: null, metin: 'uzak', kalan_gun: 6 },
    ],
    projeler: [
      { ad: 'Kokpit', envanter: '✅ kullanımda', git: { ahead: 2, kirli: 0 } },
      { ad: 'Eski', envanter: '⏸️ olduğu gibi', git: { ahead: 5, kirli: 3 } },
      { ad: 'Tezgah', envanter: '🟢 aktif', git: { ahead: 0, kirli: 4 } },
    ],
    beyin: { kapsama: { dusmemis: [{}, {}] }, islenmemis_loglar: ['a', 'b', 'c'] },
    saglik: { alarmlar: ['Otomat CI kırmızı'] },
  };
  const nob = { isler: [{ proje: 'Yanki', ad: 'üretim', hal: 'dustu', ayrinti: 'RunPod bakiyesi' }, { proje: 'Otomat', ad: 'günlük', hal: 'saglikli' }] };
  const lim = { besSaat: { yuzde: 20, sifirlanma: sabah + 3600_000 }, hafta: { yuzde: 92, sifirlanma: sabah + 2 * 86400_000 } };
  const b = brifingKur({ durum, nobet: nob, limitler: lim, oturumlar: { m: soru }, liste: o, simdi: sabah, gece: null });
  const turler = b.maddeler.map((x) => x.tur);
  kontrol('v32: brifing gecikmis vadeyi ilk sirada dikkatle verir', b.maddeler[0].tur === 'vade' && b.maddeler[0].onem === 'dikkat' && /gecikti/.test(b.maddeler[0].metin), j(b.maddeler[0]));
  kontrol('v32: brifing uzak vadeyi almaz', !b.maddeler.some((x) => /uzak/.test(x.metin)));
  kontrol('v32: brifing dusen botu ve bekleyen oturumu verir', turler.includes('bot') && turler.includes('oturum'), j(turler));
  kontrol('v32: brifing arsiv projesini push/kirli listesine koymaz', !b.maddeler.some((x) => /Eski/.test(x.metin)) && b.maddeler.some((x) => x.tur === 'push' && /Kokpit 2/.test(x.metin)), j(b.maddeler));
  kontrol('v32: brifing haftalik limiti sifirlanma gunuyle verir', b.maddeler.some((x) => x.tur === 'limit' && /%92/.test(x.metin) && x.onem === 'dikkat'), j(b.maddeler));
  kontrol('v32: brifing beyin ve saglik', turler.includes('beyin') && turler.includes('saglik'));
  kontrol('v32: brifing onerisi en acil is (gecikmis vade)', /Matbaa/.test(b.oneri || '') && /kiyas/.test(b.oneri || ''), b.oneri);
  kontrol('v32: brifing cumlesi selamla baslar, sembol yok', b.cumle.startsWith('Günaydın.') && !/[·`]/.test(b.cumle), b.cumle);
  const bos = brifingKur({ durum: { vadeler: [], projeler: [] }, nobet: null, limitler: null, oturumlar: {}, liste: [], simdi: new Date(2026, 9, 30, 20, 0).getTime() });
  kontrol('v32: bos gunde de konusur', bos.maddeler.length === 0 && /Bekleyen bir şey yok/.test(bos.cumle) && bos.selam === 'İyi akşamlar', bos.cumle);
}

// v3.2, Faz 51: secili metin (saf parcalar + ek kaydi). Gercek Ctrl+Insert/pano: npm run test:secim (elle).
function v32SecimTesti() {
  const { kaynakAdi, metniHazirla, AZAMI } = require('../electron/secim.cjs');
  kontrol('secim: Chrome basligi kisalir', kaynakAdi('TypeError - Stack Overflow - Google Chrome') === 'Chrome: TypeError - Stack Overflow', kaynakAdi('TypeError - Stack Overflow - Google Chrome'));
  kontrol('secim: VS Code basligi', kaynakAdi('App.tsx - Kokpit - Visual Studio Code') === 'VS Code: App.tsx - Kokpit');
  kontrol('secim: bilinmeyen uygulama basligi aynen, bos baslik "seçim"', kaynakAdi('Not Defteri') === 'Not Defteri' && kaynakAdi('') === 'seçim');
  kontrol('secim: CRLF -> LF, kontrol karakteri atilir, sekme kalir', metniHazirla('a\r\nb\u0007\tc\r') === 'a\nb\tc');
  const uzun = metniHazirla('x'.repeat(AZAMI + 50));
  kontrol('secim: azami boyutta kesilir ve isaretlenir', uzun.length < AZAMI + 20 && uzun.endsWith('(kesildi)'));
  const yakala = require('../electron/yakala.cjs');
  const olay = [];
  yakala.dinle((l, neden) => olay.push({ l, neden }));
  const id = yakala.metinEkle('satir 1\nsatir 2', 'Chrome: hata');
  const son = olay[olay.length - 1];
  const ek = son?.l.find((x) => x.id === id);
  kontrol('secim: metin eki tepsiye "secim" nedeniyle duser', son?.neden === 'secim' && ek?.tur === 'metin' && ek.satir === 2 && ek.ad === 'Chrome: hata', JSON.stringify(son));
  kontrol('secim: Ada listesine metnin tamami gitmez (ozet)', ek && !('metin' in ek) && ek.ozet === 'satir 1\nsatir 2');
  kontrol('secim: metin ekinin yolu yok, metinler() verir', yakala.yollar([id]).length === 0 && yakala.metinler([id])[0]?.metin === 'satir 1\nsatir 2');
  yakala.sil([id]);
  kontrol('secim: silinen metin eki gitmez', yakala.metinler([id]).length === 0);
}

// v3.2, Faz 52: Teslim. Gercek git: gecici depo + yerel bare "uzak" (aga cikilmaz).
async function v32TeslimTesti() {
  const t = require('../electron/teslim.cjs');
  const { execFileSync } = require('child_process');
  kontrol('teslim: githubDepo https/ssh', JSON.stringify(t.githubDepo('https://github.com/Scryne/Kokpit.git')) === '{"sahip":"Scryne","depo":"Kokpit"}' && t.githubDepo('git@github.com:a-b/c.d.git')?.depo === 'c.d' && t.githubDepo('https://gitlab.com/a/b') === null);
  kontrol('teslim: farkKes satir sinirinda', t.farkKes('aaa\nbbb\nccc', 6).metin === 'aaa\n' && t.farkKes('kisa', 10).kesildi === false);
  const ns = t.sayilariAyristir('3\t1\ta.txt\0-\t-\tlogo.png\0' + '2\t0\t\0eski.txt\0yeni.txt\0');
  kontrol('teslim: numstat (ikili ve yeniden adlandirma)', ns['a.txt']?.arti === 3 && ns['logo.png']?.arti === null && ns['yeni.txt']?.arti === 2, JSON.stringify(ns));
  const ds = t.durumAyristir(' M a.txt\0R  yeni.txt\0eski.txt\0?? ğ ü.md\0');
  kontrol('teslim: porcelain -z (R eski adi atlanir, Turkce ad)', ds.length === 3 && ds[1].yol === 'yeni.txt' && ds[2].yol === 'ğ ü.md' && ds[2].durum === '??', JSON.stringify(ds));

  const kok = fs.mkdtempSync(path.join(os.tmpdir(), 'kokpit-teslim-'));
  const uzak = path.join(kok, 'uzak.git');
  const depo = path.join(kok, 'depo');
  const g = (cwd, ...a) => execFileSync('git', ['-C', cwd, ...a], { stdio: 'pipe' }).toString();
  try {
    execFileSync('git', ['init', '--bare', '-b', 'main', uzak], { stdio: 'pipe' });
    execFileSync('git', ['init', '-b', 'main', depo], { stdio: 'pipe' });
    g(depo, 'config', 'user.email', 'test@users.noreply.github.com');
    g(depo, 'config', 'user.name', 'Test');
    g(depo, 'config', 'commit.gpgsign', 'false');
    fs.writeFileSync(path.join(depo, 'a.txt'), 'bir\n');
    g(depo, 'add', '.');
    g(depo, 'commit', '-m', 'ilk');
    g(depo, 'remote', 'add', 'origin', uzak);
    let d = await t.detay(depo);
    kontrol('teslim: uzak dalsiz depo: commit listesi son commitler, uzak yok', d.uzak === null && d.commitler.length === 1 && d.commitler[0].konu === 'ilk', JSON.stringify(d).slice(0, 200));
    let p = await t.push(depo);
    kontrol('teslim: uzak dal yokken push -u origin main', p.tamam && /main/.test(g(uzak, 'branch')), p.cikti);
    fs.writeFileSync(path.join(depo, 'a.txt'), 'bir\niki\n');
    g(depo, 'commit', '-am', 'ikinci: satır ekle');
    fs.writeFileSync(path.join(depo, 'a.txt'), 'bir\niki\nüç\n');
    fs.writeFileSync(path.join(depo, 'yeni dosya.md'), '# başlık\n');
    d = await t.detay(depo);
    kontrol('teslim: ileride 1, giden commit Turkce konu', d.uzak === 'origin/main' && d.ileride === 1 && d.commitler.length === 1 && d.commitler[0].konu === 'ikinci: satır ekle', JSON.stringify(d.commitler));
    const ad = d.dosyalar.find((x) => x.yol === 'a.txt');
    kontrol('teslim: kirli dosyalar + satir sayisi, izlenmeyen dosya', ad?.arti === 1 && ad?.eksi === 0 && d.dosyalar.some((x) => x.yol === 'yeni dosya.md' && x.durum === '??'), JSON.stringify(d.dosyalar));
    let f = await t.fark(depo, { commit: d.commitler[0].tam });
    kontrol('teslim: commit diff', !('hata' in f) && /\+iki/.test(f.metin) && /ikinci: satır ekle/.test(f.metin), JSON.stringify(f).slice(0, 200));
    f = await t.fark(depo, { dosya: 'yeni dosya.md' });
    kontrol('teslim: izlenmeyen dosya tamami eklenen', !('hata' in f) && /\+# başlık/.test(f.metin), JSON.stringify(f));
    f = await t.fark(depo, { dosya: '../uzak.git/HEAD' });
    kontrol('teslim: depo disina cikan yol reddedilir', 'hata' in f, JSON.stringify(f));
    f = await t.fark(depo, { commit: 'HEAD; rm -rf' });
    kontrol('teslim: gecersiz commit reddedilir', 'hata' in f);
    p = await t.push(depo);
    d = await t.detay(depo);
    kontrol('teslim: push sonra ileride 0', p.tamam && d.ileride === 0, p.cikti);
  } catch (e) {
    kontrol('teslim kosucusu', false, e.stack);
  } finally {
    fs.rmSync(kok, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
}

// v3.2, Faz 54: paralel oturumlar. Gercek git + gercek junction (gecici depo, KOKPIT_DIZIN gecici).
async function v32ParalelTesti() {
  const par = require('../electron/paralel.cjs');
  const { execFileSync } = require('child_process');
  kontrol('paralel: ad temizleme (Turkce, bosluk, sembol)', par.adTemizle('Ödeme Sayfası / v2!') === 'odeme-sayfasi-v2');
  kontrol('paralel: ad uretimi bos -> p1, cakisma -> sonraki', par.adUret('', []) === 'p1' && par.adUret('', ['p1', 'p2']) === 'p3' && par.adUret('Deneme', ['deneme']) === 'deneme1');
  const kok = fs.mkdtempSync(path.join(os.tmpdir(), 'kokpit-paralel-'));
  const depo = path.join(kok, 'Proje');
  const g = (cwd, ...a) => execFileSync('git', ['-C', cwd, ...a], { stdio: 'pipe' }).toString();
  try {
    execFileSync('git', ['init', '-b', 'main', depo], { stdio: 'pipe' });
    g(depo, 'config', 'user.email', 'test@users.noreply.github.com');
    g(depo, 'config', 'user.name', 'Test');
    g(depo, 'config', 'commit.gpgsign', 'false');
    fs.writeFileSync(path.join(depo, '.gitignore'), 'node_modules/\n.env\n');
    fs.writeFileSync(path.join(depo, 'a.txt'), 'bir\n');
    fs.mkdirSync(path.join(depo, 'node_modules', 'paket'), { recursive: true });
    fs.writeFileSync(path.join(depo, 'node_modules', 'paket', 'index.js'), 'module.exports = 1;\n');
    fs.writeFileSync(path.join(depo, '.env'), 'GIZLI=1\n');
    g(depo, 'add', '.');
    g(depo, 'commit', '-m', 'ilk');
    const r = await par.olustur(depo, 'Proje', '');
    kontrol('paralel: agac acildi (.claude/worktrees/p1, dal kokpit/p1, taban main)', r.kayit?.ad === 'p1' && r.kayit.dal === 'kokpit/p1' && r.kayit.taban === 'main' && fs.existsSync(path.join(depo, '.claude', 'worktrees', 'p1', 'a.txt')), JSON.stringify(r));
    const agac = r.kayit.yol;
    kontrol('paralel: node_modules junction + .env kopyasi', fs.existsSync(path.join(agac, 'node_modules', 'paket', 'index.js')) && fs.lstatSync(path.join(agac, 'node_modules')).isSymbolicLink() && fs.readFileSync(path.join(agac, '.env'), 'utf8') === 'GIZLI=1\n', JSON.stringify(r.notlar));
    kontrol('paralel: ana depo status temiz (agac exclude\'da)', g(depo, 'status', '--porcelain').trim() === '', g(depo, 'status', '--porcelain'));
    kontrol('paralel: yollar() Teslim icin agaci tanir', par.yollar().includes(agac));
    // v3.5: agacin icinden istenen yeni agac da ana deponun kokunde acilir (ic ice worktrees, kokpit/* taban olmaz).
    const r2 = await par.olustur(agac, 'Proje', '');
    kontrol('paralel: ikinci agac p2 (agacin icinden istense de ana kokte, taban main)', r2.kayit?.ad === 'p2' && path.resolve(r2.kayit.projeYol).toLowerCase() === path.resolve(depo).toLowerCase() && r2.kayit.taban === 'kokpit/p1' === false, JSON.stringify(r2));
    // v3.5: .gitignore'daki uretilmis dosya "At"ta uyarilir (worktree remove onu kirli saymadan siler).
    fs.writeFileSync(path.join(agac, '.gitignore'), 'node_modules/\n.env\nout/\n');
    fs.mkdirSync(path.join(agac, 'out'));
    fs.writeFileSync(path.join(agac, 'out', 'sonuc.json'), '{}');
    let l0 = (await par.liste()).find((x) => x.ad === 'p1');
    kontrol('paralel: yok sayilan uretilmis dosya listelenir (bagli klasor ve .env haric)', JSON.stringify(l0?.yoksayilan) === '["out"]', JSON.stringify(l0));
    fs.rmSync(path.join(agac, 'out'), { recursive: true });
    g(agac, 'checkout', '--', '.gitignore');
    fs.writeFileSync(path.join(agac, 'a.txt'), 'bir\niki\n');
    let l = (await par.liste()).find((x) => x.ad === 'p1');
    kontrol('paralel: liste kirli dosyayi sayar', l?.kirli === 1 && l.ileride === 0, JSON.stringify(l));
    let b = await par.birlestir(agac);
    kontrol('paralel: kirli agac birlestirilmez', !b.tamam && /commit edilmemiş/.test(b.cikti), b.cikti);
    g(agac, 'commit', '-am', 'paralel: iki');
    l = (await par.liste()).find((x) => x.ad === 'p1');
    kontrol('paralel: commit sonrasi ileride 1, satir farki', l?.ileride === 1 && l.arti === 1 && l.kirli === 0, JSON.stringify(l));
    const f = await par.fark(agac);
    kontrol('paralel: dal diff\'i (taban...dal)', !('hata' in f) && /\+iki/.test(f.metin));
    fs.writeFileSync(path.join(depo, 'a.txt'), 'bir\nANA\n');
    b = await par.birlestir(agac);
    kontrol('paralel: ana agac kirliyken birlestirilmez', !b.tamam && /Ana ağaçta/.test(b.cikti), b.cikti);
    g(depo, 'checkout', '--', 'a.txt');
    b = await par.birlestir(agac);
    // autocrlf=true makinede checkout CRLF yazar: satir sonu normallestirilir.
    const aMetni = () => fs.readFileSync(path.join(depo, 'a.txt'), 'utf8').replace(/\r/g, '');
    kontrol('paralel: birlestir --no-ff, ana dalda merge commit', b.tamam && /Paralel: p1/.test(g(depo, 'log', '-1', '--format=%s')) && aMetni() === 'bir\niki\n', b.cikti + ' | ' + JSON.stringify(aMetni()) + ' | ' + g(depo, 'log', '-1', '--format=%s'));
    // Cakisma: p2 ayni satiri baska turlu degistirir -> merge geri alinir, ana agac temiz kalir.
    fs.writeFileSync(path.join(r2.kayit.yol, 'a.txt'), 'bir\nUC\n');
    g(r2.kayit.yol, 'commit', '-am', 'p2: cakisan');
    b = await par.birlestir(r2.kayit.yol);
    kontrol('paralel: cakismada merge geri alinir, ana agac temiz', !b.tamam && /Çakışma/.test(b.cikti) && g(depo, 'status', '--porcelain').trim() === '' && aMetni() === 'bir\niki\n', b.cikti + ' | ' + g(depo, 'status', '--porcelain'));
    let a = await par.at(agac, false);
    kontrol('paralel: birlestirilmis agac atilir (dal da silinir)', a.tamam && !fs.existsSync(agac) && !g(depo, 'branch').includes('kokpit/p1'), a.cikti);
    kontrol('paralel: atinca ana node_modules yerinde (junction izlenmedi)', fs.existsSync(path.join(depo, 'node_modules', 'paket', 'index.js')));
    a = await par.at(r2.kayit.yol, false);
    kontrol('paralel: birlestirilmemis dal zorlamasiz silinmez (dal kalir)', a.tamam && /dal kaldı/.test(a.cikti) && g(depo, 'branch').includes('kokpit/p2'), a.cikti);
    kontrol('paralel: atilan agaclar kayittan duser', (await par.liste()).length === 0);
  } catch (e) {
    kontrol('paralel kosucusu', false, e.stack);
  } finally {
    fs.rmSync(kok, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
}

// v3.2, Faz 55: gece vardiyasi (saf karar + kayit suzgeci + sabah ozeti).
function v32GeceTesti() {
  const gece = require('../electron/gece.cjs');
  const ist = gece.gorevIstemi('Teslim sayfasina test yaz', 'kokpit/gece1');
  kontrol('gece: istem sinirlari ve gorevi tasir', /push/.test(ist) && /YASAK/.test(ist) && /kokpit\/gece1/.test(ist) && ist.endsWith('Görev: Teslim sayfasina test yaz'));
  const s = gece.suz({ aktif: true, baslaZamani: 5, gorevler: [{ id: 'a', proje: 'P', metin: 'x\u0007y', durum: 'uydurma', zararli: 1 }, { proje: 'eksik' }], tehlike: true });
  kontrol('gece: suzgec (bilinmeyen durum -> bekliyor, kontrol karakteri, eksik gorev, rastgele alan)', s.gorevler.length === 1 && s.gorevler[0].durum === 'bekliyor' && s.gorevler[0].metin === 'xy' && !('zararli' in s.gorevler[0]) && !('tehlike' in s) && s.baslaZamani === 5, JSON.stringify(s));
  const T = 1_800_000_000_000;
  const v = (gorevler, ek = {}) => ({ aktif: true, baslaZamani: null, gorevler, ...ek });
  // v3.5: limit olcumu taze olmali (olculdu); varsayilan fikstur 1 dk once olculmus dusuk limit.
  const L = { olculdu: T - 60_000, besSaat: { yuzde: 10 }, hafta: { yuzde: 10 } };
  const k = (vv, oturumlar = [], etkinlik = {}, limitler = L, simdi = T) => gece.karar({ v: vv, oturumlar, etkinlik, simdi, limitler });
  let e = k(v([{ id: 'a', durum: 'bekliyor' }]));
  kontrol('gece: bos vardiyada ilk gorev baslar', e.length === 1 && e[0].tur === 'baslat' && e[0].id === 'a', JSON.stringify(e));
  e = k(v([{ id: 'a', durum: 'bekliyor' }], { baslaZamani: T + 60_000 }));
  kontrol('gece: baslangic saatinden once bekler', e[0]?.tur === 'bekle', JSON.stringify(e));
  e = k(v([{ id: 'a', durum: 'bekliyor' }]), [], {}, { olculdu: T, besSaat: { yuzde: 95, sifirlanma: T + 3600_000 }, hafta: { yuzde: 50 } });
  kontrol('gece: 5 saat limiti doluyken baslamaz, bekler', e[0]?.tur === 'bekle' && /limit/.test(e[0].neden), JSON.stringify(e));
  e = k(v([{ id: 'a', durum: 'bekliyor' }]), [], {}, { olculdu: T, besSaat: { yuzde: 95, sifirlanma: T - 1 } });
  kontrol('gece: sifirlanma gectiyse limit 0 sayilir, baslar', e[0]?.tur === 'baslat', JSON.stringify(e));
  e = k(v([{ id: 'a', durum: 'bekliyor' }]), [], {}, { olculdu: T, hafta: { yuzde: 98 } });
  kontrol('gece: haftalik limit doluyken vardiya biter', e[0]?.tur === 'bitir', JSON.stringify(e));
  // v3.5: limit bilinmiyorsa gozetimsiz gorev baslamaz (fail-closed); bir saat surerse vardiya biter.
  e = k(v([{ id: 'a', durum: 'bekliyor' }], { baslaZamani: T - 10 * 60_000 }), [], {}, null);
  kontrol('gece: limit olculemezse baslamaz, bekler', e.length === 1 && e[0].tur === 'bekle' && /limit/.test(e[0].neden), JSON.stringify(e));
  e = k(v([{ id: 'a', durum: 'bekliyor' }], { baslaZamani: T - 10 * 60_000 }), [], {}, { olculdu: T - 31 * 60_000, hafta: { yuzde: 10 } });
  kontrol('gece: eski limit olcumu (31 dk) bilinmeyen sayilir', e[0]?.tur === 'bekle', JSON.stringify(e));
  e = k(v([{ id: 'a', durum: 'bekliyor' }], { baslaZamani: T - 61 * 60_000 }), [], {}, null);
  kontrol('gece: limit bir saattir olculemiyorsa vardiya biter', e[0]?.tur === 'bitir' && /limit/.test(e[0].neden), JSON.stringify(e));
  // v3.5: toplam vardiya siniri (12 gorev x 150 dk = 30 saat olmasin).
  e = k(v([{ id: 'x', durum: 'bitti', basladi: T - 10.5 * 3600_000, bitti: T - 60_000 }, { id: 'a', durum: 'bekliyor' }]));
  kontrol('gece: 10 saatlik vardiya suresi dolunca yeni gorev baslamaz, biter', e[0]?.tur === 'bitir' && /vardiya/.test(e[0].neden), JSON.stringify(e));
  kontrol('gece: gece gorevi oneki tanimlanir; yasaklar push/silme/gh icerir', gece.geceGoreviMi(gece.gorevIstemi('x', 'kokpit/gece1')) && !gece.geceGoreviMi('Normal gorev') && !gece.geceGoreviMi(undefined) && gece.YASAK.includes('Bash(git push:*)') && gece.YASAK.includes('Bash(rm -rf:*)') && gece.YASAK.includes('Bash(gh:*)'));
  const calisan = { id: 'a', durum: 'calisiyor', oturumId: 'o1', basladi: T - 60_000 };
  e = k(v([calisan, { id: 'b', durum: 'bekliyor' }]), [{ id: 'o1', durumu: 'acik' }], { o1: { durum: 'calisiyor', degisti: T - 1000 } });
  kontrol('gece: calisan varken ikinci gorev baslamaz', e.length === 0, JSON.stringify(e));
  e = k(v([calisan, { id: 'b', durum: 'bekliyor' }]), [{ id: 'o1', durumu: 'acik' }], { o1: { durum: 'bitti', degisti: T - 500, durumZamani: T - 500, sonSoz: 'Bitti: 3 test.' } });
  kontrol('gece: Stop -> bitti + ozet, sonra siradaki baslar', e[0]?.tur === 'isaretle' && e[0].durum === 'bitti' && e[0].ozet === 'Bitti: 3 test.' && e[1]?.tur === 'baslat' && e[1].id === 'b', JSON.stringify(e));
  e = k(v([calisan]), [{ id: 'o1', durumu: 'acik' }], { o1: { durum: 'bitti', degisti: T - 120_000, durumZamani: T - 120_000 } });
  kontrol('gece: gorev baslamadan onceki "bitti" sayilmaz', !e.some((x) => x.tur === 'isaretle'), JSON.stringify(e));
  const soru = { durum: 'bekliyor', degisti: T - 2000, soruZamani: T - 2000, soruAyrinti: { cevaplanabilir: true, sorular: [{ secenekler: [{ etiket: 'A' }, { etiket: 'B (Recommended)' }] }, { secenekler: [{ etiket: 'X' }] }] } };
  e = k(v([calisan]), [{ id: 'o1', durumu: 'acik' }], { o1: soru });
  kontrol('gece: soruya onerilen secenek, onerilen yoksa "sen karar ver"', e[0]?.tur === 'cevapla' && JSON.stringify(e[0].istek.cevaplar) === JSON.stringify([1, 'Sen karar ver: en mantıklı seçeneği uygula, gerekçeni özette yaz.']) && e[0].istek.damga === T - 2000, JSON.stringify(e));
  e = k(v([{ ...calisan, cevapDamga: T - 2000, cevaplanan: 1 }]), [{ id: 'o1', durumu: 'acik' }], { o1: soru });
  kontrol('gece: ayni soruya ikinci kez cevap gitmez', e.length === 0, JSON.stringify(e));
  e = k(v([{ ...calisan, cevaplanan: 6 }]), [{ id: 'o1', durumu: 'acik' }], { o1: soru });
  kontrol('gece: cevap siniri asilinca takildi', e[0]?.durum === 'takildi', JSON.stringify(e));
  e = k(v([calisan]), [{ id: 'o1', durumu: 'acik' }], { o1: { durum: 'bekliyor', degisti: T, soruAyrinti: null } });
  kontrol('gece: izin istemi -> takildi (cevaplanmaz)', e[0]?.durum === 'takildi' && /izin/.test(e[0].neden), JSON.stringify(e));
  e = k(v([calisan]), [{ id: 'o1', durumu: 'acik' }], { o1: { durum: 'calisiyor', degisti: T - 26 * 60_000 } });
  kontrol('gece: 25 dk sessizlik -> Esc + takildi', e[0]?.tur === 'kes' && e[0].oturumId === 'o1' && e[1]?.durum === 'takildi', JSON.stringify(e));
  e = k(v([calisan]), [{ id: 'o1', durumu: 'acik' }], { o1: { durum: 'calisiyor', degisti: T - 26 * 60_000, arac: { ad: 'Bash', bitti: null } } });
  kontrol('gece: uzun suren arac (build) varken esik iki kat: 26 dk takildi sayilmaz', e.length === 0, JSON.stringify(e));
  e = k(v([{ ...calisan, basladi: T - 151 * 60_000 }]), [{ id: 'o1', durumu: 'acik' }], { o1: { durum: 'calisiyor', degisti: T } });
  kontrol('gece: 150 dk -> Esc + oturum kapanir + sure', e[0]?.tur === 'kes' && e[1]?.tur === 'kapat' && e[1].oturumId === 'o1' && e[2]?.durum === 'sure', JSON.stringify(e));
  e = k(v([calisan]), [], {});
  kontrol('gece: oturum kapandiysa hata, sira bossa bitir', e[0]?.durum === 'hata' && e[1]?.tur === 'bitir', JSON.stringify(e));
  e = k({ ...v([{ id: 'a', durum: 'bekliyor' }]), aktif: false });
  kontrol('gece: aktif degilse hicbir sey', e.length === 0);
  const oz = gece.ozetKur({ gorevler: [{ durum: 'bitti', basladi: T - 5e6, bitti: T - 4e6 }, { durum: 'takildi', basladi: T - 3e6, bitti: T - 2e6 }, { durum: 'bekliyor' }, { durum: 'bitti', basladi: T - 30 * 3600_000, bitti: T - 29 * 3600_000 }] }, T);
  kontrol('gece: sabah ozeti son vardiyayi sayar (eski gorev disarida)', oz?.sayi === 2 && /2 görevden 1 bitti, 1 takıldı, 1 sırada/.test(oz.ozet), JSON.stringify(oz));
  kontrol('gece: vardiya yoksa ozet yok', gece.ozetKur({ gorevler: [{ durum: 'bekliyor' }] }, T) === null);
}

// v3.3, Faz 58: Aria cekirdegi. Saf olay isleme + sahte claude (scripts/sahte-claude.cjs) ile gercek surec akisi.
async function v33AriaTesti() {
  const aria = require('../electron/aria.cjs');
  const ARGLAR = path.join(GECICI, 'aria-arglar.jsonl');
  process.env.KOKPIT_TEST_ARIA_SAHTE = path.join(KOK, 'scripts', 'sahte-claude.cjs');
  process.env.SAHTE_ARIA_ARGLAR = ARGLAR;
  const j = (x) => JSON.stringify(x);
  // Saf parcalar
  kontrol('aria: gun 05:00 sinirli', aria.gunAnahtari(new Date(2026, 9, 30, 4, 0).getTime()) === '2026-10-29' && aria.gunAnahtari(new Date(2026, 9, 30, 9, 0).getTime()) === '2026-10-30');
  kontrol('aria: arac ozeti (dosya adi, komut, mcp adi)', j(aria.aracOzeti('Read', { file_path: 'C:\\v\\🔮 850-Companion\\Threads.md' })) === j({ ad: 'Read', hedef: '🔮 850-Companion/Threads.md', dosya: 'C:/v/🔮 850-Companion/Threads.md' }) && aria.aracOzeti('mcp__kokpit__oturumlar', {}).ad === 'kokpit.oturumlar' && aria.aracOzeti('Bash', { command: 'git status' }).hedef === 'git status');
  const vault = path.join(GECICI, 'vault');
  kontrol('aria: hafiza yolu yalniz vault icindeki yazma', aria.hafizaYolu('Edit', { file_path: path.join(vault, '🔮 850-Companion', 'Threads.md') }, vault) === '🔮 850-Companion/Threads.md' && aria.hafizaYolu('Read', { file_path: path.join(vault, 'x.md') }, vault) === null && aria.hafizaYolu('Write', { file_path: path.join(GECICI, 'disari.md') }, vault) === null);
  let a = { id: 'a1', metinBirikmis: '', taslak: '', araclar: [], hafiza: [] };
  let r = aria.olayIsle(a, { type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Mer' } } }, vault);
  r = aria.olayIsle(r.aktif, { type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'haba' } } }, vault);
  kontrol('aria: parcalar birikir, durum yaziyor', r.yayin[0]?.metin === 'Merhaba' && r.durum === 'yaziyor', j(r));
  r = aria.olayIsle(r.aktif, { type: 'assistant', message: { content: [{ type: 'text', text: 'Merhaba.' }, { type: 'tool_use', name: 'Edit', input: { file_path: path.join(vault, 'Journal.md') } }] } }, vault);
  kontrol('aria: tam mesaj taslagi ezer, arac + hafiza izi', r.aktif.metinBirikmis === 'Merhaba.' && r.aktif.araclar[0].ad === 'Edit' && r.aktif.hafiza[0] === 'Journal.md' && r.durum === 'arac', j(r.aktif));
  const alt = aria.olayIsle(r.aktif, { type: 'assistant', parent_tool_use_id: 'x', message: { content: [{ type: 'text', text: 'ALT AJAN' }] } }, vault);
  kontrol('aria: alt ajanin metni ana cevaba karismaz', alt.aktif.metinBirikmis === 'Merhaba.' && alt.yayin.length === 0);
  r = aria.olayIsle(r.aktif, { type: 'result', subtype: 'success', is_error: false, duration_ms: 1500 }, vault);
  kontrol('aria: result -> bitti, aktif bosalir', r.aktif === null && r.durum === 'bosta' && r.yayin[0]?.tur === 'bitti' && r.yayin[0].metin === 'Merhaba.' && r.yayin[0].sureMs === 1500);
  r = aria.olayIsle({ id: 'a2', metinBirikmis: 'yar', taslak: '', araclar: [], hafiza: [] }, { type: 'result', subtype: 'error_during_execution', is_error: true }, vault);
  kontrol('aria: kesilen tur hata degil "kesildi"', r.yayin[0].kesildi === true && r.yayin[0].hata === null);

  // Gercek surec (sahte claude): gonder -> parca -> bitti; sira; kesme; kapat + resume.
  fs.mkdirSync(vault, { recursive: true });
  const olaylar = [];
  let bekleyen = null;
  aria.kur({ vault, yayin: (o) => { olaylar.push(o); if (o.tur === 'bitti' && bekleyen) bekleyen(o); } });
  const bitti = (ms = 8000) => new Promise((coz) => { bekleyen = coz; setTimeout(() => coz(null), ms); });
  let b = bitti();
  const g1 = aria.gonder('merhaba');
  let son = await b;
  kontrol('aria surec: cevap geldi, parca olaylari akti', son && son.id === g1.ariaId && son.metin === 'Yanki: merhaba' && olaylar.some((o) => o.tur === 'parca'), j(son));
  const ilkArg = JSON.parse(fs.readFileSync(ARGLAR, 'utf8').trim().split('\n')[0]);
  kontrol('aria surec: stream-json, strict mcp, Kokpit istemi, yeni kimlik', ilkArg.includes('--input-format') && ilkArg.includes('--strict-mcp-config') && ilkArg.includes('--append-system-prompt') && ilkArg.includes('--session-id'), j(ilkArg));
  b = bitti();
  aria.gonder('sesli soru', { kaynak: 'ses' });
  son = await b;
  kontrol('aria surec: sesli kaynak "[ses]" onekiyle gider', son && son.metin === 'Sesli: sesli soru', j(son));
  // Sira (kesmesiz): art arda iki mesajin her cevabi kendi mesaj kimligine baglanir, sirayla.
  const sirali = [];
  bekleyen = (o) => sirali.push(o);
  const s1 = aria.gonder('birinci');
  const s2 = aria.gonder('ikinci');
  for (let i = 0; i < 40 && sirali.length < 2; i++) await new Promise((r2) => setTimeout(r2, 150));
  kontrol('aria surec: art arda iki mesaj, cevaplar kendi kimliklerinde ve sirayla', sirali.length === 2 && sirali[0].id === s1.ariaId && sirali[0].metin === 'Yanki: birinci' && sirali[1].id === s2.ariaId && sirali[1].metin === 'Yanki: ikinci', j(sirali.map((x) => [x.id === s1.ariaId ? 's1' : x.id === s2.ariaId ? 's2' : '?', x.metin])));
  // Sira: mesgulken gelen mesaj tur bitince gider.
  const ikiBitti = [];
  bekleyen = (o) => ikiBitti.push(o);
  aria.gonder('yavas birinci');
  aria.gonder('ikinci');
  await new Promise((r2) => setTimeout(r2, 300));
  kontrol('aria surec: kesme calisan turu durdurur', aria.kes() === true);
  for (let i = 0; i < 40 && ikiBitti.length < 2; i++) await new Promise((r2) => setTimeout(r2, 150));
  // v3.5: kuyruktaki mesaj sessizce atilmaz, "kesildi" diye kapanir (ekranda "yaziyor" diye kalan balon olmasin).
  await new Promise((r2) => setTimeout(r2, 600));
  kontrol('aria surec: kesme kuyrugu da bosaltir (ikinci gitmez, cevapsiz "kesildi" kapanir)', ikiBitti.length === 2 && ikiBitti.every((x) => x.kesildi === true) && !ikiBitti.some((x) => x.metin.includes('ikinci') && !x.metin.includes('birinci')), j(ikiBitti.map((x) => [x.kesildi, x.metin.slice(0, 20)])));
  aria.kapat();
  await new Promise((r2) => setTimeout(r2, 600));
  b = bitti();
  aria.gonder('devam');
  son = await b;
  const arglar = fs.readFileSync(ARGLAR, 'utf8').trim().split('\n').map((x) => JSON.parse(x));
  const ikinci = arglar[arglar.length - 1];
  kontrol('aria surec: kapatilinca ayni gunun kimligiyle --resume', son && ikinci.includes('--resume') && ikinci[ikinci.indexOf('--resume') + 1] === ilkArg[ilkArg.indexOf('--session-id') + 1], j(ikinci));
  const g = aria.gecmis();
  kontrol('aria: gecmis diske yazildi (sen + aria mesajlari)', g.mesajlar.filter((m) => m.rol === 'sen').length >= 4 && g.mesajlar.some((m) => m.rol === 'aria' && m.metin === 'Yanki: devam') && g.oturum.baslik === 'merhaba', j(g.mesajlar.map((m) => m.rol + ':' + m.metin.slice(0, 12))));
  aria.yeniSohbet();
  await new Promise((r2) => setTimeout(r2, 400));
  kontrol('aria: yeni sohbet ayni gune ikinci kimlik', aria.oturumlar().length === 2 && aria.oturumlar()[0].id !== aria.oturumlar()[1].id);
  aria.kapat();
  // Faz 63: gunluk not. Ayri, kalici olmayan claude -p; sohbetin kimligine dokunmaz; gunde bir (zorla haric).
  fs.writeFileSync(ARGLAR, '');
  const notOlay = [];
  aria.kur({ vault, yayin: (o) => o.tur === 'not' && notOlay.push(o) });
  const n1 = await aria.gunlukNot();
  const notArg = JSON.parse(fs.readFileSync(ARGLAR, 'utf8').trim().split('\n').pop());
  kontrol('aria not: yazildi, diske kondu', n1.metin && /Sahte not/.test(n1.metin) && aria.notOku()?.gun === aria.gunAnahtari(), j(n1));
  kontrol('aria not: kalici olmayan tek atis (-p, --no-session-persistence, json), sohbet kimligi yok', notArg.includes('--no-session-persistence') && notArg.includes('-p') && !notArg.includes('--session-id') && !notArg.includes('--resume'), j(notArg));
  kontrol('aria not: yaziyor -> hazir olaylari', notOlay[0]?.durum === 'yaziyor' && notOlay[notOlay.length - 1]?.durum === 'hazir' && notOlay[notOlay.length - 1].not?.metin === n1.metin);
  const satirOnce = fs.readFileSync(ARGLAR, 'utf8').trim().split('\n').filter(Boolean).length;
  await aria.gunlukNot();
  kontrol('aria not: ayni gun ikinci istek claude cagirmaz (onbellek)', fs.readFileSync(ARGLAR, 'utf8').trim().split('\n').filter(Boolean).length === satirOnce);
  delete process.env.KOKPIT_TEST_ARIA_SAHTE;
}

// v3.3, Faz 62: Aria'nin Kokpit araclari. Gercek MCP sureci (stdio JSON-RPC) -> gercek HTTP ucu -> isleyici; oneri deposu.
async function v33AracTesti() {
  const ariaArac = require('../electron/aria-arac.cjs');
  const { spawn } = require('child_process');
  const j = (x) => JSON.stringify(x);
  const cagrilar = [];
  const kartlar = [];
  const a = await ariaArac.baslat({
    isleyiciler: {
      kokpit_oturumlar: () => (cagrilar.push('oturumlar'), 'Matbaa seni bekliyor'),
      oneri_gorev: ({ proje, metin }) => {
        const k = ariaArac.oneriEkle({ tur: 'gorev', proje, metin });
        return 'Oneri #' + k.id;
      },
      kokpit_limit: () => {
        throw new Error('limit okunamadi');
      },
    },
    onOneri: (k) => kartlar.push({ ...k }),
    aktifMesaj: () => 'a-test',
  });
  const cfg = JSON.parse(fs.readFileSync(a.mcpConfig, 'utf8')).mcpServers.kokpit;
  kontrol('arac: mcp yapilandirmasi node + aria-mcp.cjs + adres/token', cfg.command === 'node' && /aria-mcp\.cjs$/.test(cfg.args[0]) && /^http:\/\/127\.0\.0\.1:\d+$/.test(cfg.env.KOKPIT_ARIA_URL) && cfg.env.KOKPIT_ARIA_TOKEN.length === 48);
  // Tokensiz istek reddedilir.
  const yetkisiz = await new Promise((coz) => {
    const u = new URL(cfg.env.KOKPIT_ARIA_URL);
    const r = http.request({ host: u.hostname, port: u.port, path: '/arac', method: 'POST' }, (y) => coz(y.statusCode));
    r.on('error', () => coz(0));
    r.end('{"ad":"kokpit_oturumlar"}');
  });
  kontrol('arac: tokensiz istek 403', yetkisiz === 403, yetkisiz);
  // Gercek MCP sureci: claude'un yapacagi gibi stdio JSON-RPC.
  const p = spawn(cfg.command, cfg.args, { env: { ...process.env, ...cfg.env } });
  let tampon = '';
  const cevaplar = new Map();
  p.stdout.setEncoding('utf8');
  p.stdout.on('data', (d) => {
    tampon += d;
    let i;
    while ((i = tampon.indexOf('\n')) >= 0) {
      const m = JSON.parse(tampon.slice(0, i));
      tampon = tampon.slice(i + 1);
      cevaplar.set(m.id, m.result);
    }
  });
  const rpc = async (id, method, params) => {
    p.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    for (let t = 0; t < 100 && !cevaplar.has(id); t++) await new Promise((r) => setTimeout(r, 50));
    return cevaplar.get(id);
  };
  const ini = await rpc(1, 'initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '0' } });
  kontrol('mcp: initialize (protokol surumu yansir, tools yetenegi)', ini?.protocolVersion === '2025-06-18' && !!ini.capabilities.tools, j(ini));
  const liste = await rpc(2, 'tools/list', {});
  const adlar = (liste?.tools ?? []).map((t) => t.name);
  kontrol('mcp: okuma ve oneri araclari listede (yazma araci yalniz oneri_*)', ['kokpit_oturumlar', 'kokpit_brifing', 'kokpit_teslim', 'oneri_gorev', 'oneri_gece', 'oneri_mesaj'].every((x) => adlar.includes(x)) && adlar.every((x) => x.startsWith('kokpit_') || x.startsWith('oneri_')), j(adlar));
  let r = await rpc(3, 'tools/call', { name: 'kokpit_oturumlar', arguments: {} });
  kontrol('mcp: arac cagrisi HTTP ile isleyiciye gider, metin doner', r?.content?.[0]?.text === 'Matbaa seni bekliyor' && cagrilar.length === 1, j(r));
  r = await rpc(4, 'tools/call', { name: 'oneri_gorev', arguments: { proje: 'Kokpit', metin: 'README\'yi gozden gecir' } });
  kontrol('mcp: oneri karti dogar (bekliyor, aktif mesaja bagli), isleyicinin cevabi doner', /^Oneri #o1-/.test(r?.content?.[0]?.text) && kartlar[0]?.durum === 'bekliyor' && kartlar[0].mesajId === 'a-test', j(r) + j(kartlar));
  r = await rpc(5, 'tools/call', { name: 'kokpit_limit', arguments: {} });
  kontrol('mcp: isleyici hatasi isError ile doner (surec yasar)', r?.isError === true && /limit okunamadi/.test(r.content[0].text), j(r));
  r = await rpc(6, 'tools/call', { name: 'rm_rf', arguments: {} });
  kontrol('mcp: listede olmayan arac reddedilir', r?.isError === true, j(r));
  p.kill();
  // Oneri deposu: karar bir kez; metin model icin.
  const id = kartlar[0].id;
  // v3.5: onay ani 'uygulaniyor' (cift onay ayni isi iki kez yaptirmasin); sonuc yalniz uygulanmakta olana.
  kontrol('oneri: baslamadan sonuc kabul edilmez', ariaArac.oneriSonuc(id, 'onaylandi', 'x') === null);
  kontrol('oneri: onay ani uygulaniyor; ikinci onay null', ariaArac.oneriBasla(id)?.durum === 'uygulaniyor' && kartlar[kartlar.length - 1].durum === 'uygulaniyor' && ariaArac.oneriBasla(id) === null);
  kontrol('oneri: uygulanirken red kabul edilmez', ariaArac.oneriSonuc(id, 'reddedildi') === null);
  kontrol('oneri: karar verilince durum ve sonuc yayinlanir', ariaArac.oneriSonuc(id, 'onaylandi', 'Kokpit oturumu acildi')?.durum === 'onaylandi' && kartlar[kartlar.length - 1].sonuc === 'Kokpit oturumu acildi');
  kontrol('oneri: ikinci karar yok sayilir', ariaArac.oneriSonuc(id, 'reddedildi') === null && ariaArac.oneriSonuc(id, 'hata', 'zaman asimi') === null);
  kontrol('oneri: model icin metin (ONAYLANDI + sonuc)', /ONAYLANDI \(Kokpit oturumu acildi\)/.test(ariaArac.onerilerMetni(ariaArac.oneriler())));
  let bos = null;
  try {
    ariaArac.oneriEkle({ tur: 'sil', metin: 'x' });
  } catch (e) {
    bos = e.message;
  }
  kontrol('oneri: bilinmeyen tur dogmaz', bos === 'bilinmeyen oneri');
  ariaArac.durdur();
  kontrol('arac: kapaninca mcp yapilandirmasi silinir (token diskte kalmaz)', !fs.existsSync(a.mcpConfig));
}

// v3.3, Faz 61: hafiza paneli ayristiricilari (fikstur) + vault disina okuma reddi.
function v33HafizaTesti() {
  const h = require('../electron/hafiza.cjs');
  const t = h.threadler('# Threads\n\n### Thread: Matbaa — POD\n**Status:** 🟢 Active: created 2026-10-12\n**İzle:** (1) günde 10 dk\n\n### Thread: Eski\n**Status:** ⚪ Devredildi\ngovde\n### Baska baslik\nx');
  kontrol('hafiza: threadler (isaret, durum, izle ozeti; Thread: olmayan baslik atlanir)', t.length === 2 && t[0].baslik === 'Matbaa — POD' && t[0].isaret === '🟢' && t[0].durum === 'Active' && t[0].ozet === '(1) günde 10 dk' && t[1].isaret === '⚪', JSON.stringify(t.map(({ govde, ...x }) => x)));
  const k = h.kurallar('# Kurallar\n- **kural:** Kisa olsun.\n  **neden:** Scryne istedi.\n\n- **kural:** Ikinci\n  satir devam.\n');
  kontrol('hafiza: kurallar (cok satirli madde, neden ayrilir)', k.length === 2 && k[0].kural === 'Kisa olsun.' && k[0].neden === 'Scryne istedi.' && k[1].kural === 'Ikinci satir devam.', JSON.stringify(k));
  const d = [
    { yol: 'a.md', baslik: 'Matbaa Kıyas Ölçümü', metin: 'matbaa kiyas 11-02 olcum' },
    { yol: 'b.md', baslik: 'Otomat', metin: 'matbaa bir kez gecer' },
    { yol: 'c.md', baslik: 'Tezgah', metin: 'hic ilgisiz' },
  ];
  const r = h.ara('matbaa kıyas', d);
  kontrol('hafiza: arama Turkce duyarsiz, butun sozcukler gerekli, baslik agirlikli', r.length === 1 && r[0].yol === 'a.md', JSON.stringify(r));
  kontrol('hafiza: kisa/bos sorgu sonuc vermez', h.ara('a', d).length === 0 && h.ara('  ', d).length === 0);
  const vault = path.join(GECICI, 'hafiza-vault');
  fs.mkdirSync(path.join(vault, 'n'), { recursive: true });
  fs.writeFileSync(path.join(vault, 'n', 'x.md'), '---\ntitle: Deneme\n---\n# Deneme\ngovde');
  fs.writeFileSync(path.join(GECICI, 'disari.md'), 'gizli');
  const o = h.dosyaOku(vault, 'n/x.md');
  kontrol('hafiza: dosya okuma (frontmatter atilir, baslik frontmatter\'dan)', o.baslik === 'Deneme' && !/title:/.test(o.metin), JSON.stringify(o));
  kontrol('hafiza: vault disi ve .md olmayan yol reddedilir', 'hata' in h.dosyaOku(vault, '../disari.md') && 'hata' in h.dosyaOku(vault, 'n/x.txt'));
}

// v3.4: Aria'nin agi (vault not grafigi). Saf kurulum fiksturle; disk okuma gecici vault'ta.
function v34AgTesti() {
  const { agKur, agOku, fmListe } = require('../electron/hafiza-ag.cjs');
  const aria = require('../electron/aria.cjs');
  const dosyalar = [
    { yol: '🔮 850-Companion/Core.md', metin: '# Core\n[[🏰 300-Projects/Otomat]] ve [[Threads]]', t: 5 },
    { yol: '🔮 850-Companion/Threads.md', metin: '---\ntitle: Konular\n---\n[[otomat|takma ad]] [[yok-boyle-not]] [[Core#Bolum]]' },
    { yol: '🏰 300-Projects/Otomat.md', metin: 'proje notu' },
    { yol: 'knowledge/concepts/otomat.md', metin: '---\ntitle: Otomat\nsources: [2026-10-27.md, "2026-10-28.md"]\n---\n[[otomat-k1]] [[otomat-k1]]' },
    { yol: 'knowledge/concepts/otomat-k1.md', metin: '# K1\n[[otomat]]' },
    { yol: 'knowledge/concepts/yalniz.md', metin: '# Yalniz' },
    { yol: 'knowledge/connections/otomat--yalniz.md', metin: '---\nconnects: [otomat, yalniz]\n---\n' },
    { yol: 'daily/2026-10-27.md', metin: '# gun' },
    { yol: '📥 000-Inbox/Dump/x.md', metin: '[[Core]]' },
    { yol: 'knowledge/concepts/resim.png', metin: '' },
  ];
  const ag = agKur(dosyalar);
  const kim = new Set(ag.dugumler.map((d) => d.id));
  const bag = (a, b) => ag.kenarlar.find((k) => (k.a === a && k.b === b) || (k.a === b && k.b === a));
  kontrol('ag: dugumler (6 klasor icinden .md; iliski makalesi ve Inbox dugum degil; aria + kokpit sanal)', kim.size === 9 && kim.has('aria') && kim.has('kokpit') && !kim.has('knowledge/connections/otomat--yalniz') && ![...kim].some((k) => k.includes('Inbox') || k.includes('resim')), [...kim].join(', '));
  kontrol('ag: baslik frontmatter title > # baslik > dosya adi', ag.dugumler.find((d) => d.id === '🔮 850-Companion/Threads').baslik === 'Konular' && ag.dugumler.find((d) => d.id === 'knowledge/concepts/otomat-k1').baslik === 'K1');
  kontrol('ag: [[tam yol]] ve [[ad]] cozulur; "|" ve "#" sonrasi atilir; olmayan hedef bag uretmez', !!bag('🔮 850-Companion/Core', '🏰 300-Projects/Otomat') && !!bag('🔮 850-Companion/Core', '🔮 850-Companion/Threads') && !ag.kenarlar.some((k) => k.a.includes('yok-boyle') || k.b.includes('yok-boyle')));
  kontrol('ag: ad cakismasinda once kaynak notun klasoru (kavramdaki [[otomat]] kavram; Companion\'dakini dosya adi cozer: ilk klasor, proje)', !!bag('knowledge/concepts/otomat-k1', 'knowledge/concepts/otomat') && !bag('knowledge/concepts/otomat-k1', '🏰 300-Projects/Otomat') && !!bag('🔮 850-Companion/Threads', '🏰 300-Projects/Otomat') && !bag('🔮 850-Companion/Threads', 'knowledge/concepts/otomat'), ag.kenarlar);
  kontrol('ag: kavramdaki [[ad]] once kavram klasorunde aranir; tekrar eden bag tek kenar', ag.kenarlar.filter((k) => bag('knowledge/concepts/otomat', 'knowledge/concepts/otomat-k1') === k).length === 1);
  kontrol('ag: sources -> daily (kaynak), connects -> baglanti, ayni adli proje <-> kavram (konu)', bag('knowledge/concepts/otomat', 'daily/2026-10-27')?.tur === 'kaynak' && !ag.kenarlar.some((k) => k.a.includes('2026-10-28') || k.b.includes('2026-10-28')) && bag('knowledge/concepts/otomat', 'knowledge/concepts/yalniz')?.tur === 'baglanti' && bag('🏰 300-Projects/Otomat', 'knowledge/concepts/otomat')?.tur === 'konu');
  kontrol('ag: Aria hafiza dosyalarinin merkezi; Kokpit araclari Aria\'ya bagli', bag('aria', '🔮 850-Companion/Core')?.tur === 'aria' && bag('aria', '🔮 850-Companion/Threads')?.tur === 'aria' && !!bag('aria', 'kokpit') && !bag('aria', 'knowledge/concepts/otomat'));
  kontrol('ag: fmListe tirnak ve bosluk temizler; frontmatter yoksa bos', JSON.stringify(fmListe('---\nsources: [ a.md , "b.md" ]\n---\n', 'sources')) === '["a.md","b.md"]' && fmListe('sources: [a]', 'sources').length === 0);
  const vault = path.join(GECICI, 'ag-vault');
  for (const d of dosyalar.filter((x) => x.metin)) {
    fs.mkdirSync(path.join(vault, path.dirname(d.yol)), { recursive: true });
    fs.writeFileSync(path.join(vault, d.yol), d.metin);
  }
  const disk = agOku(vault, { taze: true });
  kontrol('ag: diskten okuma fikstürle ayni ag + dosya zamani', disk.dugumler.length === ag.dugumler.length && disk.kenarlar.length === ag.kenarlar.length && disk.dugumler.find((d) => d.id === 'daily/2026-10-27').t > 0, { disk: disk.kenarlar.length, saf: ag.kenarlar.length });
  fs.writeFileSync(path.join(vault, 'knowledge', 'concepts', 'yeni.md'), '[[otomat]]');
  kontrol('ag: onbellek 60 sn; taze istenince yeni not gorunur', agOku(vault).dugumler.length === disk.dugumler.length && agOku(vault, { taze: true }).dugumler.some((d) => d.id === 'knowledge/concepts/yeni'));
  const g = aria.aracOzeti('Grep', { pattern: 'matbaa kiyas', path: 'C:\\v' });
  const k = aria.aracOzeti('mcp__kokpit__oneri_gorev', { proje: 'Matbaa', metin: 'x' });
  kontrol('ag: arac ozeti ham hedefleri tasir (Grep deseni, Kokpit araci proje adi; yolu olmayan aracta dosya yok)', g.desen === 'matbaa kiyas' && g.dosya === 'C:/v' && k.proje === 'Matbaa' && !('dosya' in aria.aracOzeti('Bash', { command: 'ls' })), { g, k });
}

(async () => {
  try {
    v34AgTesti();
    v33HafizaTesti();
    await v33AracTesti();
    await v33AriaTesti();
    v32GeceTesti();
    await v32ParalelTesti();
    await v32TeslimTesti();
    v32SecimTesti();
    v32SesTesti();
    sesTesti();
    v3Testi();
    ustKatmanTesti();
    saklanmaTesti();
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
