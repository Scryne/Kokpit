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
    const r2 = await par.olustur(depo, 'Proje', '');
    kontrol('paralel: ikinci agac p2', r2.kayit?.ad === 'p2', JSON.stringify(r2));
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

(async () => {
  try {
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
