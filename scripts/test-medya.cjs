// v4.0 medya testi: sarki sozleri (sozler.cjs) ve medya yardimcisi yonetimi (medya.cjs). Duz node.
//
// Gercek hicbir seye dokunmaz: LRCLIB yerine enjekte istek, Windows medya oturumu yerine gecici dizine
// yazilan sahte bir node yardimcisi (KOKPIT_MEDYA_YARDIMCI), Kokpit verisi gecici KOKPIT_DIZIN'de.
// GERCEK=1 verilirse sonda gercek powershell yardimcisiyla bir duman testi kosar: yalniz OKUR, calan
// muzige komut gondermez; durdurduktan sonra ve ebeveyn aniden oldugunde PID'in oldugunu olcer.

const fs = require('fs');
const os = require('os');
const path = require('path');
const https = require('https');
const { EventEmitter } = require('events');
const { spawn } = require('child_process');

const GECICI = fs.mkdtempSync(path.join(os.tmpdir(), 'kokpit-medya-'));
process.env.KOKPIT_DIZIN = path.join(GECICI, 'kokpit');
delete process.env.KOKPIT_MEDYA_YARDIMCI;

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
async function bekle(kosul, ms = 3000) {
  const son = Date.now() + ms;
  while (Date.now() < son) {
    if (kosul()) return true;
    await uyu(20);
  }
  return kosul();
}
function canli(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === 'EPERM';
  }
}

const sozler = require(path.join(KOK, 'electron', 'sozler.cjs'));
const medya = require(path.join(KOK, 'electron', 'medya.cjs'));

// ---------------------------------------------------------------- sozler

const LRC = [
  '[ar:Örnek Sanatçı]',
  '[ti:Örnek Şarkı]',
  '[length:03:01]',
  '[00:12.34]İlk satır',
  '[01:02.345]Üç haneli kesir',
  '[00:05]Kesirsiz',
  '[00:20.00][00:40.50]Nakarat',
  '[00:30.00]',
  '[00:31:50]İki nokta kesir',
  '[aa:bb]bozuk etiket',
  'zamansız satır',
  '[00:33.00]<00:33.00>Kelime <00:33.50>zamanlı',
].join('\r\n');

function sozlerAyristirma() {
  console.log('\n--- sozler: lrcAyristir / anahtar / temizle ---');
  const s = sozler.lrcAyristir(LRC);
  const bul = (m) => s.find((x) => x.metin === m);
  kontrol('lrc: [mm:ss.xx] -> ms', bul('İlk satır')?.t === 12340, s);
  kontrol('lrc: [mm:ss.xxx] -> ms', bul('Üç haneli kesir')?.t === 62345);
  kontrol('lrc: [mm:ss] kesirsiz', bul('Kesirsiz')?.t === 5000);
  kontrol('lrc: [mm:ss:xx] iki nokta kesir', bul('İki nokta kesir')?.t === 31500);
  const nak = s.filter((x) => x.metin === 'Nakarat').map((x) => x.t);
  kontrol('lrc: bir satirda iki zaman etiketi -> iki satir', JSON.stringify(nak) === '[20000,40500]', nak);
  kontrol('lrc: bos metinli satir korunur (muzik arasi)', s.some((x) => x.t === 30000 && x.metin === ''));
  kontrol('lrc: meta etiketleri, bozuk etiket ve zamansiz satir atlanir',
    !s.some((x) => /Sanatçı|Örnek Şarkı|bozuk|zamansız|03:01/.test(x.metin)) && s.length === 8, s.length);
  kontrol('lrc: kelime zamanlari silinir', bul('Kelime zamanlı')?.t === 33000);
  kontrol('lrc: t artan sirali', s.every((x, i) => i === 0 || s[i - 1].t <= x.t));
  const ofset = sozler.lrcAyristir('[offset:+500]\n[00:10.00]a\n[00:00.20]b');
  kontrol('lrc: [offset:+500] sozleri 500 ms erken getirir, 0 alti kirpilir', ofset[0].t === 0 && ofset[1].t === 9500, ofset);
  const eksi = sozler.lrcAyristir('[offset:-250]\n[00:01.00]a');
  kontrol('lrc: [offset:-250] geciktirir', eksi[0].t === 1250, eksi);
  kontrol('lrc: bozuk girdi -> bos dizi', sozler.lrcAyristir(null).length === 0 && sozler.lrcAyristir(42).length === 0 &&
    sozler.lrcAyristir('').length === 0 && sozler.lrcAyristir('[ar:x]\nduz metin').length === 0);

  const a1 = sozler.anahtarUret({ baslik: '  Örnek   Şarkı (Remastered 2011) ', sanatci: 'Sanatçı A', album: 'Albüm' });
  const a2 = sozler.anahtarUret({ baslik: 'örnek şarkı (remastered 2011)', sanatci: 'sanatçı a', album: 'albüm' });
  kontrol('anahtar: buyuk/kucuk harf ve bosluk sadelesir', a1 === a2, [a1, a2]);
  kontrol('anahtar: ham basliktan (temizle uygulanmaz)', a1.includes('remastered 2011'), a1);
  kontrol('anahtar: album ayirt eder', a1 !== sozler.anahtarUret({ baslik: 'Örnek Şarkı (Remastered 2011)', sanatci: 'Sanatçı A', album: 'Canlı' }));
  kontrol('anahtar: bozuk girdi cokmez', typeof sozler.anahtarUret(null) === 'string' && typeof sozler.anahtarUret({ baslik: 5 }) === 'string');

  const ornekler = [
    ['Song (Remastered 2011)', 'Song'],
    ['Song - 2011 Remaster', 'Song'],
    ['Song - Remastered 2009', 'Song'],
    ['Song (feat. Diger)', 'Song'],
    ['Song feat. Diger', 'Song'],
    ['Song [Official Video]', 'Song'],
    ['Song (with Y) [Official Music Video]', 'Song'],
    ['Hit - Radio Edit', 'Hit'],
    ['Şarkı (Canlı)', 'Şarkı'],
    ['Song - From "Film"', 'Song'],
    ["(I Can't Live With You) Tonight", "(I Can't Live With You) Tonight"],
    ['Livestream Blues', 'Livestream Blues'],
    ['Edith', 'Edith'],
    ['(Live)', '(Live)'],
    ['', ''],
  ];
  const yanlis = ornekler.filter(([g, b]) => sozler.temizle(g) !== b).map(([g]) => [g, sozler.temizle(g)]);
  kontrol('temizle: ' + ornekler.length + ' ornek (ekler gider, baslik parcalari kalir)', yanlis.length === 0, yanlis);
  kontrol('temizle: bozuk girdi -> bos', sozler.temizle(null) === '' && sozler.temizle(7) === '');
}

/** Sahte LRCLIB: url -> { kod, govde } ya da hata; cagrilari kaydeder. */
function sahteIstek(yanitla, gecikme = 0) {
  const f = async (url) => {
    f.cagrilar.push(url);
    if (gecikme) await uyu(gecikme);
    const r = yanitla(new URL(url));
    if (r instanceof Error) throw r;
    return r;
  };
  f.cagrilar = [];
  return f;
}
const KAYIT = (ek) => ({ id: 1, trackName: 'x', artistName: 'y', duration: 181, instrumental: false, plainLyrics: 'a\nb', syncedLyrics: '[00:01.00]a\n[00:02.00]b', ...ek });
const tamam = (g) => ({ kod: 200, govde: JSON.stringify(g) });
const bulunamadi = { kod: 404, govde: '{"code":404,"name":"TrackNotFound"}' };

async function sozlerGetir() {
  console.log('\n--- sozler: getir / onbellek / ag ---');
  const dizin = path.join(GECICI, 'sozler-1');
  const parca = { baslik: 'Örnek Şarkı', sanatci: 'Sanatçı A', album: 'Albüm', sureMs: 181414 };

  const i1 = sahteIstek((u) => (u.pathname === '/api/get' ? tamam(KAYIT({ syncedLyrics: '[00:01.00]Bir\n[00:02.50]İki' })) : bulunamadi));
  const r1 = await sozler.getir(parca, { dizin, istek: i1 });
  kontrol('getir: esli sozler', r1.esli === true && r1.satirlar.length === 2 && r1.satirlar[1].t === 2500 && r1.satirlar[1].metin === 'İki', r1);
  kontrol('getir: anahtar = anahtarUret', r1.anahtar === sozler.anahtarUret(parca));
  const u1 = new URL(i1.cagrilar[0] || 'https://x/');
  kontrol('getir: /api/get, ham baslik + sanatci + album + sure (sn, yuvarlak)',
    u1.origin === 'https://lrclib.net' && u1.pathname === '/api/get' && u1.searchParams.get('track_name') === 'Örnek Şarkı' &&
    u1.searchParams.get('artist_name') === 'Sanatçı A' && u1.searchParams.get('album_name') === 'Albüm' && u1.searchParams.get('duration') === '181',
    i1.cagrilar);
  const r1b = await sozler.getir(parca, { dizin, istek: i1 });
  kontrol('onbellek: ikinci cagri istek atmaz, ayni sonuc', i1.cagrilar.length === 1 && JSON.stringify(r1b) === JSON.stringify(r1), i1.cagrilar.length);
  const dosyalar = fs.readdirSync(dizin);
  kontrol('onbellek: <sha1>.json, gecici dosya kalmaz', dosyalar.length === 1 && /^[0-9a-f]{40}\.json$/.test(dosyalar[0]), dosyalar);

  // 404 -> temizlenmis baslikla get -> 404 -> arama; sureye en yakin (+/-3 sn), esli once.
  const p2 = { baslik: 'Örnek Şarkı (Remastered 2011)', sanatci: 'Sanatçı A', album: 'Albüm', sureMs: 200000 };
  const i2 = sahteIstek((u) => {
    if (u.pathname === '/api/get') return bulunamadi;
    return tamam([
      KAYIT({ id: 10, duration: 260, syncedLyrics: '[00:01.00]uzak' }),
      KAYIT({ id: 11, duration: 201, syncedLyrics: null, plainLyrics: 'yakin duz' }),
      KAYIT({ id: 12, duration: 198, syncedLyrics: '[00:01.00]yakin esli' }),
      KAYIT({ id: 13, duration: 200.4, instrumental: true, syncedLyrics: null, plainLyrics: null }),
    ]);
  });
  const r2 = await sozler.getir(p2, { dizin, istek: i2 });
  const yollar = i2.cagrilar.map((x) => new URL(x));
  kontrol('404: once ham, sonra temizlenmis baslikla get, sonra arama',
    yollar.length === 3 && yollar[0].searchParams.get('track_name') === 'Örnek Şarkı (Remastered 2011)' &&
    yollar[1].pathname === '/api/get' && yollar[1].searchParams.get('track_name') === 'Örnek Şarkı' &&
    yollar[2].pathname === '/api/search' && yollar[2].searchParams.get('track_name') === 'Örnek Şarkı' &&
    yollar[2].searchParams.get('artist_name') === 'Sanatçı A', i2.cagrilar);
  kontrol('arama: +/-3 sn icinde esli olan secildi (uzak ve enstrumantal degil)', r2.esli === true && r2.satirlar[0].metin === 'yakin esli', r2);
  kontrol('arama: anahtar ham basliktan', r2.anahtar === sozler.anahtarUret(p2));

  const i3 = sahteIstek((u) => (u.pathname === '/api/get' ? bulunamadi : tamam([KAYIT({ duration: 100, syncedLyrics: null, plainLyrics: 'duz' }), KAYIT({ duration: 400, syncedLyrics: '[00:01.00]ilk esli' })])));
  const r3 = await sozler.getir({ baslik: 'Başka', sanatci: 'B', album: '', sureMs: 200000 }, { dizin, istek: i3 });
  kontrol('arama: temiz baslik ayniysa tek get; yakin yoksa ilk esli sonuc', i3.cagrilar.length === 2 && r3.esli === true && r3.satirlar[0].metin === 'ilk esli', [i3.cagrilar, r3]);
  kontrol('get: bos album / sure sorguya girmez', !new URL(i3.cagrilar[0]).searchParams.has('album_name'));

  const i4 = sahteIstek(() => tamam(KAYIT({ syncedLyrics: '', plainLyrics: 'Satır bir\n\nSatır iki\n\n' })));
  const r4 = await sozler.getir({ baslik: 'Düz', sanatci: 'C', sureMs: 0 }, { dizin, istek: i4 });
  kontrol('duz sozler: esli=false, t=0, aradaki bos satir korunur, sondaki atilir',
    r4.esli === false && r4.satirlar.length === 3 && r4.satirlar.every((x) => x.t === 0) && r4.satirlar[2].metin === 'Satır iki', r4);

  // Enstrumantal -> yok; 24 saat onbellekte, sonra yeniden denenir (enjekte saat).
  let saat = 1_800_000_000_000;
  const simdi = () => saat;
  const i5 = sahteIstek(() => tamam(KAYIT({ instrumental: true, plainLyrics: null, syncedLyrics: null })));
  const p5 = { baslik: 'Sözsüz', sanatci: 'D', album: 'E', sureMs: 120000 };
  const r5 = await sozler.getir(p5, { dizin, istek: i5, simdi });
  kontrol('enstrumantal -> yok', r5.yok === true && r5.anahtar === sozler.anahtarUret(p5) && !('hata' in r5), r5);
  saat += 23 * 3600 * 1000;
  await sozler.getir(p5, { dizin, istek: i5, simdi });
  kontrol('yok: 23 saat sonra istek atilmaz', i5.cagrilar.length === 1, i5.cagrilar.length);
  saat += 2 * 3600 * 1000;
  await sozler.getir(p5, { dizin, istek: i5, simdi });
  kontrol('yok: 24 saat gecince yeniden denenir', i5.cagrilar.length === 2, i5.cagrilar.length);

  const i5b = sahteIstek((u) => (u.pathname === '/api/get' ? bulunamadi : tamam([])));
  const r5b = await sozler.getir({ baslik: 'Hiç', sanatci: 'Yok' }, { dizin, istek: i5b });
  kontrol('hic sonuc yok -> yok (hata degil)', r5b.yok === true && !r5b.hata, r5b);
  const i5c = sahteIstek((u) => (u.pathname === '/api/get' ? tamam(KAYIT({ syncedLyrics: null, plainLyrics: null })) : tamam([KAYIT({ duration: 181, syncedLyrics: '[00:01.00]aramadan' })])));
  const r5c = await sozler.getir({ baslik: 'Sözsüz Kayıt', sanatci: 'F', sureMs: 181000 }, { dizin, istek: i5c });
  kontrol('get kaydi sozsuz (enstrumantal degil) -> aramaya duser', r5c.esli === true && r5c.satirlar[0].metin === 'aramadan', r5c);

  // Ag hatasi: onbellege girmez, reddetmez, sonraki cagri yeniden dener.
  const dizinH = path.join(GECICI, 'sozler-hata');
  const p6 = { baslik: 'Ağsız', sanatci: 'G' };
  for (const [ad, yanit] of [['istisna', new Error('ECONNRESET')], ['HTTP 500', { kod: 500, govde: 'x' }], ['HTTP 429', { kod: 429, govde: '' }], ['bozuk JSON', { kod: 200, govde: '{bozuk' }]]) {
    const i6 = sahteIstek(() => yanit);
    const r6 = await sozler.getir(p6, { dizin: dizinH, istek: i6 });
    kontrol('ag hatasi (' + ad + '): { yok, hata }, onbellege yazilmaz', r6.yok === true && r6.hata === true && !fs.existsSync(dizinH), r6);
  }
  const i6b = sahteIstek(() => tamam(KAYIT({})));
  const r6b = await sozler.getir(p6, { dizin: dizinH, istek: i6b });
  kontrol('ag hatasindan sonra yeniden denenir ve bulunur', i6b.cagrilar.length === 1 && r6b.esli === true);

  // Bozuk onbellek dosyasi: yok sayilir, yeniden alinir ve ezilir.
  const pB = { baslik: 'Bozuk', sanatci: 'H' };
  const dosyaB = path.join(dizin, require('crypto').createHash('sha1').update(sozler.anahtarUret(pB)).digest('hex') + '.json');
  fs.writeFileSync(dosyaB, '{"anahtar": yarim');
  const iB = sahteIstek(() => tamam(KAYIT({})));
  const rB = await sozler.getir(pB, { dizin, istek: iB });
  kontrol('bozuk onbellek: yeniden alinir, dosya duzelir', iB.cagrilar.length === 1 && rB.esli === true && JSON.parse(fs.readFileSync(dosyaB, 'utf8')).esli === true);
  fs.writeFileSync(dosyaB, JSON.stringify({ anahtar: 'baska|parca|', satirlar: [], esli: true }));
  await sozler.getir(pB, { dizin, istek: iB });
  kontrol('onbellek: anahtari tutmayan dosya kullanilmaz', iB.cagrilar.length === 2);
  fs.writeFileSync(dosyaB, JSON.stringify({ anahtar: sozler.anahtarUret(pB), satirlar: [{ t: 'x', metin: 1 }], esli: true }));
  await sozler.getir(pB, { dizin, istek: iB });
  kontrol('onbellek: sekli bozuk satirlar kullanilmaz', iB.cagrilar.length === 3);

  // Eszamanli istekler tekillesir.
  const iE = sahteIstek(() => tamam(KAYIT({})), 80);
  const pE = { baslik: 'Aynı Anda', sanatci: 'I', sureMs: 181000 };
  const [e1, e2, e3] = await Promise.all([sozler.getir(pE, { dizin, istek: iE }), sozler.getir(pE, { dizin, istek: iE }), sozler.getir({ ...pE }, { dizin, istek: iE })]);
  kontrol('eszamanli: ayni anahtar icin tek istek', iE.cagrilar.length === 1 && e1 === e2 && e2 === e3, iE.cagrilar.length);

  // Baslik / sanatci bos: istek yok.
  const iBos = sahteIstek(() => tamam(KAYIT({})));
  const rb1 = await sozler.getir({ baslik: '  ', sanatci: 'X' }, { dizin, istek: iBos });
  const rb2 = await sozler.getir({ baslik: 'X', sanatci: '' }, { dizin, istek: iBos });
  const rb3 = await sozler.getir(null, { dizin, istek: iBos });
  kontrol('bos baslik/sanatci/null parca -> yok, istek atilmaz', rb1.yok && rb2.yok && rb3.yok && iBos.cagrilar.length === 0);

  // 200 dosya siniri: en eskiler silinir.
  const dizinS = path.join(GECICI, 'sozler-sinir');
  fs.mkdirSync(dizinS, { recursive: true });
  const eskiZaman = Date.now() / 1000 - 10000;
  for (let i = 0; i < 205; i++) {
    const ad = require('crypto').createHash('sha1').update('dolgu' + i).digest('hex') + '.json';
    fs.writeFileSync(path.join(dizinS, ad), '{}');
    fs.utimesSync(path.join(dizinS, ad), eskiZaman + i, eskiZaman + i);
  }
  const ilkAd = require('crypto').createHash('sha1').update('dolgu0').digest('hex') + '.json';
  const sonAd = require('crypto').createHash('sha1').update('dolgu204').digest('hex') + '.json';
  await sozler.getir({ baslik: 'Taşan', sanatci: 'J' }, { dizin: dizinS, istek: sahteIstek(() => tamam(KAYIT({}))) });
  const kalanlar = fs.readdirSync(dizinS);
  kontrol('onbellek: 200 dosya siniri, en eskiler gider, yeni kalir',
    kalanlar.length === 200 && !kalanlar.includes(ilkAd) && kalanlar.includes(sonAd) &&
    kalanlar.includes(require('crypto').createHash('sha1').update(sozler.anahtarUret({ baslik: 'Taşan', sanatci: 'J' })).digest('hex') + '.json'), kalanlar.length);

  // Varsayilan istek: https, family 4, User-Agent, zaman asimi; ag hatasi onbellege girmez.
  const asil = https.get;
  let secenekler = null;
  let adres = null;
  https.get = (url, sec) => {
    adres = url;
    secenekler = sec;
    const req = new EventEmitter();
    req.destroy = (e) => req.emit('error', e || new Error('yok edildi'));
    setImmediate(() => req.emit('error', new Error('sahte ag kapali')));
    return req;
  };
  try {
    const dizinV = path.join(GECICI, 'sozler-varsayilan');
    const rV = await sozler.getir({ baslik: 'Varsayılan', sanatci: 'K', album: 'L', sureMs: 61000 }, { dizin: dizinV });
    kontrol('varsayilan istek: https lrclib, family 4, Kokpit/4.0, 10 sn',
      String(adres).startsWith('https://lrclib.net/api/get?') && secenekler?.family === 4 &&
      secenekler?.headers?.['User-Agent'] === 'Kokpit/4.0' && secenekler?.timeout === 10000, { adres, secenekler });
    kontrol('varsayilan istek: ag hatasi -> { yok, hata }, diske yazilmaz', rV.yok === true && rV.hata === true && !fs.existsSync(dizinV), rV);
    kontrol('varsayilan istek: kullaniciya dair alan yok (yalniz 4 sorgu alani)',
      [...new URL(adres).searchParams.keys()].sort().join(',') === 'album_name,artist_name,duration,track_name' &&
      Object.keys(secenekler.headers).sort().join(',') === 'Accept,User-Agent', [adres, secenekler?.headers]);
  } finally {
    https.get = asil;
  }
}

// ---------------------------------------------------------------- medya (sahte yardimci)

const SAHTE = `
const fs = require('fs');
const gelen = process.env.SAHTE_GELEN, kayit = process.env.SAHTE_KAYIT, mod = process.env.SAHTE_MOD || 'normal';
fs.appendFileSync(process.env.SAHTE_PID, process.pid + '\\n');
// Her yazim iki parcaya bolunur (bayt ortasindan): satir ve UTF-8 karakter bolunmesi sinanir.
function yaz(b) {
  const k = Math.floor(b.length / 2);
  process.stdout.write(b.subarray(0, k));
  setTimeout(() => process.stdout.write(b.subarray(k)), 15);
}
yaz(Buffer.from('{"tur":"hazir"}\\n'));
if (mod === 'ol') setTimeout(() => process.exit(3), 60);
let okunan = 0;
setInterval(() => {
  let b;
  try { b = fs.readFileSync(gelen); } catch { return; }
  if (b.length > okunan) { const yeni = b.subarray(okunan); okunan = b.length; yaz(yeni); }
}, 20);
let artik = '';
process.stdin.on('data', (d) => {
  artik += d;
  let i;
  while ((i = artik.indexOf('\\n')) >= 0) {
    const s = artik.slice(0, i); artik = artik.slice(i + 1);
    fs.appendFileSync(kayit, s + '\\n');
    if (s === 'cik' && mod !== 'inat') process.exit(0);
  }
});
process.stdin.on('end', () => { if (mod !== 'inat') process.exit(0); });
`;

async function medyaTesti() {
  console.log('\n--- medya: uygulamaAdi ---');
  const adlar = [
    ['Spotify.exe', 'Spotify'],
    ['chrome.exe', 'Chrome'],
    ['Chrome', 'Chrome'],
    ['Chrome._crx_abcdefgh', 'Chrome'],
    ['msedge.exe', 'Edge'],
    ['MSEdge', 'Edge'],
    ['Microsoft.MicrosoftEdge.Stable_8wekyb3d8bbwe!App', 'Edge'],
    ['SpotifyAB.SpotifyMusic_zpdnekdrzrea0!Spotify', 'Spotify'],
    ['Microsoft.ZuneMusic_8wekyb3d8bbwe!Microsoft.ZuneMusic', 'Medya Oynatıcı'],
    ['AppleInc.AppleMusicWin_nzyj5cx40ttqa!App', 'Apple Music'],
    ['Yayinci.OrnekCalar_abc123!App', 'OrnekCalar'],
    ['Yayinci.Paket_abc!OrnekUyg', 'OrnekUyg'],
    ['C:\\Program Files\\Ornek\\ornekcalar.exe', 'ornekcalar'],
    ['foobar2000.exe', 'foobar2000'],
    ['', ''],
    [null, ''],
    [42, ''],
  ];
  const yanlis = adlar.filter(([g, b]) => medya.uygulamaAdi(g) !== b).map(([g]) => [g, medya.uygulamaAdi(g)]);
  kontrol('uygulamaAdi: ' + adlar.length + ' ornek', yanlis.length === 0, yanlis);

  console.log('\n--- medya: sahte yardimci ---');
  const dz = path.join(GECICI, 'sahte');
  fs.mkdirSync(dz);
  const betik = path.join(dz, 'sahte-yardimci.cjs');
  fs.writeFileSync(betik, SAHTE);
  const GELEN = path.join(dz, 'gelen.txt');
  const KAYITD = path.join(dz, 'kayit.txt');
  const PIDLER = path.join(dz, 'pid.txt');
  process.env.KOKPIT_MEDYA_YARDIMCI = betik;
  process.env.SAHTE_GELEN = GELEN;
  process.env.SAHTE_KAYIT = KAYITD;
  process.env.SAHTE_PID = PIDLER;
  process.env.SAHTE_MOD = 'normal';
  fs.writeFileSync(GELEN, '');
  fs.writeFileSync(KAYITD, '');
  fs.writeFileSync(PIDLER, '');
  const gonder = (...satirlar) => fs.appendFileSync(GELEN, satirlar.map((s) => (typeof s === 'string' ? s : JSON.stringify(s)) + '\n').join(''));
  const pidler = () => fs.readFileSync(PIDLER, 'utf8').split('\n').filter(Boolean).map(Number);

  const yayinlar = [];
  const olaylar = [];
  const SAAT = 1_800_000_000_000;
  medya.baslat({ yayin: (d) => yayinlar.push(d), olay: (o) => olaylar.push(o), simdi: () => SAAT, yenidenMs: 60 });
  kontrol('baslat: yardimci acildi, hazir geldi', await bekle(() => olaylar.some((o) => o.tur === 'hazir')), olaylar);
  const pid1 = olaylar.find((o) => o.tur === 'basladi')?.pid;
  kontrol('baslat: basladi olayi pid tasir', Number.isInteger(pid1) && canli(pid1) && pidler()[0] === pid1);
  kontrol('baslangic: anlik null, yayin yok', medya.anlik() === null && yayinlar.length === 0);

  const BASLIK = 'Örnek Şarkı — ğüşıöç İ';
  const D1 = { tur: 'durum', uygulama: 'Spotify.exe', baslik: BASLIK, sanatci: 'Sanatçı A', album: 'Albüm', caliyor: true, konumMs: 73029, sureMs: 181414, guncelMs: SAAT - 2000, oynat: true, sonraki: true, onceki: false, kapakKimlik: 'k1' };
  gonder(D1);
  await bekle(() => yayinlar.length >= 1);
  const y1 = yayinlar[0];
  kontrol('durum: MedyaDurumu sekli', y1 && JSON.stringify(Object.keys(y1).sort()) === JSON.stringify(['album', 'baslik', 'caliyor', 'kapak', 'kontrol', 'konumMs', 'olculdu', 'sanatci', 'sureMs', 'uygulama']), y1 && Object.keys(y1));
  kontrol('durum: alanlar cevrildi (uygulama sade, Turkce karakter bozulmadi)',
    y1?.uygulama === 'Spotify' && y1.baslik === BASLIK && y1.sanatci === 'Sanatçı A' && y1.album === 'Albüm' && y1.caliyor === true &&
    y1.konumMs === 73029 && y1.sureMs === 181414 && y1.kapak === null, y1);
  kontrol('durum: olculdu = guncelMs', y1?.olculdu === SAAT - 2000, y1?.olculdu);
  kontrol('durum: kontroller', y1?.kontrol.oynat === true && y1.kontrol.sonraki === true && y1.kontrol.onceki === false, y1?.kontrol);

  // Kapak: kimlik eslesince data URL olarak girer.
  const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex').toString('base64');
  gonder({ tur: 'kapak', kimlik: 'k1', mime: 'image/png', veri: PNG });
  await bekle(() => yayinlar.length >= 2);
  kontrol('kapak: eslesen kimlik -> data URL', yayinlar[1]?.kapak === 'data:image/png;base64,' + PNG && yayinlar[1].baslik === BASLIK, yayinlar[1]);
  kontrol('anlik: son durum (kopya)', medya.anlik()?.kapak === yayinlar[1].kapak && medya.anlik() !== medya.anlik());

  // Konum tazelemesi tahminle tutarliysa yayin yok; sicrama (arama) yayinlanir.
  const n0 = yayinlar.length;
  gonder({ ...D1, konumMs: 73029 + 5000, guncelMs: SAAT + 3000 });
  gonder({ ...D1, konumMs: 73029 + 5400, guncelMs: SAAT + 3000 + 600 }); // 200 ms sapma: gurultu
  await uyu(250);
  kontrol('konum: tahminle tutarli tazeleme yayinlanmaz', yayinlar.length === n0, yayinlar.slice(n0));
  gonder({ ...D1, konumMs: 150000, guncelMs: SAAT + 4000 });
  await bekle(() => yayinlar.length > n0);
  kontrol('konum: sicrama (arama) yayinlanir, kapak korunur', yayinlar[n0]?.konumMs === 150000 && yayinlar[n0].kapak === yayinlar[1].kapak, yayinlar[n0]);
  const n1 = yayinlar.length;
  gonder({ ...D1, konumMs: 150000, guncelMs: SAAT + 4000, caliyor: false });
  await bekle(() => yayinlar.length > n1);
  kontrol('calma durumu degisince yayinlanir', yayinlar[n1]?.caliyor === false, yayinlar[n1]);
  const n1b = yayinlar.length;
  gonder({ ...D1, konumMs: 150000, guncelMs: SAAT + 9000, caliyor: false }); // duraklatilmisken guncelMs ilerler (Spotify boyle)
  await uyu(200);
  kontrol('duraklatilmisken yalniz guncelMs ilerlerse yayin yok', yayinlar.length === n1b);

  // Parca degisince eski kapak hemen duser; eski parcanin gec gelen kapagi kullanilmaz.
  const n2 = yayinlar.length;
  gonder({ ...D1, baslik: 'İkinci Parça', kapakKimlik: 'k2', guncelMs: 0, konumMs: 0 });
  await bekle(() => yayinlar.length > n2);
  kontrol('parca degisti: kapak hemen null', yayinlar[n2]?.baslik === 'İkinci Parça' && yayinlar[n2].kapak === null, yayinlar[n2]);
  kontrol('gecersiz guncelMs (0) -> olculdu = satirin geldigi an', yayinlar[n2]?.olculdu === SAAT, yayinlar[n2]?.olculdu);
  gonder({ tur: 'kapak', kimlik: 'k1', mime: 'image/png', veri: PNG });
  await uyu(200);
  kontrol('eski parcanin kapagi yeni parcaya girmez', yayinlar.length === n2 + 1 && medya.anlik()?.kapak === null, yayinlar.slice(n2));
  gonder({ tur: 'kapak', kimlik: 'k2', mime: 'image/jpeg', veri: null });
  await uyu(200);
  kontrol('kapak yok (veri null) -> kapak null kalir, gereksiz yayin yok', yayinlar.length === n2 + 1 && medya.anlik()?.kapak === null);

  // Kapak durumdan once gelirse bekletilir.
  const n3 = yayinlar.length;
  gonder({ tur: 'kapak', kimlik: 'k3', mime: 'IMAGE/JPEG', veri: PNG }, { ...D1, baslik: 'Üçüncü', kapakKimlik: 'k3' });
  await bekle(() => yayinlar.length > n3);
  kontrol('durumdan once gelen kapak eslesince kullanilir (mime kucuk harf)', yayinlar[n3]?.kapak === 'data:image/jpeg;base64,' + PNG, yayinlar[n3]);

  // Bozuk satirlar: atlanir, cokme yok, sonraki gecerli satir islenir.
  const n4 = yayinlar.length;
  gonder('{bozuk', 'null', '{"tur":5}', '[1,2]', '{"tur":"durum"', '', '{"tur":"bilinmeyen"}', '\u0000\u0001',
    { tur: 'durum', baslik: 5, caliyor: 'evet', konumMs: -5, sureMs: 'x', guncelMs: 'dun', kapakKimlik: 'k4' });
  await bekle(() => yayinlar.length > n4);
  const yb = yayinlar[n4];
  kontrol('bozuk satirlar atlanir; tipi bozuk alanlar guvenli varsayilana duser',
    yb && yb.baslik === '' && yb.caliyor === false && yb.konumMs === 0 && yb.sureMs === 0 && yb.olculdu === SAAT && yb.uygulama === '', yb);
  gonder({ tur: 'kapak', kimlik: 'k4', mime: 'text/html', veri: '<script>' }, { tur: 'kapak', kimlik: 'k4', mime: 'image/png', veri: 'A'.repeat(600 * 1024) });
  await uyu(250);
  kontrol('kapak: base64 olmayan / 400 KB ustu veri kabul edilmez', medya.anlik()?.kapak === null);
  kontrol('yardimci bozuk satirlardan sonra hala canli', canli(pid1));

  // yok -> null
  const n5 = yayinlar.length;
  gonder({ tur: 'yok' });
  await bekle(() => yayinlar.length > n5);
  kontrol('yok -> yayin(null), anlik null', yayinlar[n5] === null && medya.anlik() === null);
  gonder({ tur: 'yok' });
  await uyu(150);
  kontrol('ikinci yok tekrar yayinlanmaz', yayinlar.length === n5 + 1);

  // Komutlar: yalniz uc gecerli komut stdin'e ulasir.
  const kabul = ['oynat-duraklat', 'sonraki', 'onceki'].map((k) => medya.komut(k));
  const red = ['cik', 'sonraki\ncik', '', null, { k: 1 }].map((k) => medya.komut(k));
  await bekle(() => fs.readFileSync(KAYITD, 'utf8').split('\n').filter(Boolean).length >= 3);
  await uyu(100);
  const kayitlar = fs.readFileSync(KAYITD, 'utf8').split('\n').filter(Boolean);
  kontrol('komut: uc gecerli komut stdin\'e ulasti, gerisi reddedildi',
    JSON.stringify(kayitlar) === '["oynat-duraklat","sonraki","onceki"]' && kabul.every(Boolean) && red.every((x) => !x), [kayitlar, kabul, red]);
  kontrol('komut sonrasi yardimci canli (cik sizmadi)', canli(pid1));

  // durdur: cik yazar, surec olur, yeniden baslatma yok.
  gonder(D1);
  await bekle(() => medya.anlik() !== null);
  const nD = yayinlar.length;
  await medya.durdur();
  kontrol('durdur: cik gonderildi, surec gercekten olu', fs.readFileSync(KAYITD, 'utf8').includes('cik\n') && (await bekle(() => !canli(pid1), 2000)), pid1);
  kontrol('durdur: calan parca null yayinlandi', yayinlar[nD] === null && medya.anlik() === null);
  await uyu(300);
  kontrol('durdur: yeniden baslatma yok', pidler().length === 1, pidler());
  kontrol('durdur sonrasi komut sessizce yok sayilir', medya.komut('sonraki') === false);
  await medya.durdur(); // ikinci durdur cokmez

  // Beklenmedik cikis: yenidenMs sonra yeniden, pencerede en fazla enFazlaYeniden kez.
  console.log('\n--- medya: yeniden baslatma siniri ---');
  process.env.SAHTE_MOD = 'ol';
  fs.writeFileSync(PIDLER, '');
  fs.writeFileSync(GELEN, ''); // yeni sahte surecler eski satirlari yeniden oynatmasin
  const olay2 = [];
  medya.baslat({ olay: (o) => olay2.push(o), yenidenMs: 80, pencereMs: 60000, enFazlaYeniden: 2 });
  kontrol('olen yardimci: 1 + 2 yeniden baslatma, sonra birakildi', await bekle(() => olay2.some((o) => o.tur === 'birakildi'), 5000), olay2.map((o) => o.tur));
  await uyu(400);
  kontrol('birakildiktan sonra yeni surec yok', pidler().length === 3 && olay2.filter((o) => o.tur === 'basladi').length === 3, pidler());
  kontrol('yeniden baslatmalar arasi bekleme uygulandi', (() => {
    const b = olay2.filter((o) => o.tur === 'basladi' || o.tur === 'cikti').map((o) => o.tur).join(',');
    return b === 'basladi,cikti,basladi,cikti,basladi,cikti';
  })(), olay2.map((o) => o.tur));
  kontrol('birakildiktan sonra komut yok sayilir', medya.komut('sonraki') === false);
  await medya.durdur();

  // Pencere disina dusen eski baslatmalar sayilmaz: pencereMs kisa -> sinir dolmaz.
  fs.writeFileSync(PIDLER, '');
  const olay3 = [];
  medya.baslat({ olay: (o) => olay3.push(o), yenidenMs: 120, pencereMs: 100, enFazlaYeniden: 1 });
  await bekle(() => olay3.filter((o) => o.tur === 'basladi').length >= 4, 4000);
  await medya.durdur();
  kontrol('pencere: suresi gecen baslatmalar sinira sayilmaz', olay3.filter((o) => o.tur === 'basladi').length >= 4 && !olay3.some((o) => o.tur === 'birakildi'), olay3.map((o) => o.tur));
  await uyu(300);
  const sonPidler = pidler();
  kontrol('durdur bekleyen yeniden baslatmayi iptal eder, hic surec kalmaz', sonPidler.every((p) => !canli(p)), sonPidler.filter(canli));

  // Inatci yardimci: cik'i ve EOF'u yok sayar -> durdurMs sonra yalniz kendi PID'i oldurulur.
  console.log('\n--- medya: inatci yardimci ---');
  process.env.SAHTE_MOD = 'inat';
  fs.writeFileSync(PIDLER, '');
  const olay4 = [];
  medya.baslat({ olay: (o) => olay4.push(o), durdurMs: 300, yenidenMs: 50 });
  await bekle(() => olay4.some((o) => o.tur === 'hazir'));
  const pidI = olay4.find((o) => o.tur === 'basladi')?.pid;
  const t0 = Date.now();
  await medya.durdur();
  const gecti = Date.now() - t0;
  kontrol('inatci: durdurMs sonra oldurulur', !canli(pidI) && gecti >= 280 && gecti < 2000, { gecti, canli: canli(pidI) });
  await uyu(200);
  kontrol('inatci: oldurulunce yeniden baslatilmaz', pidler().length === 1);

  // Yardimci yokken baslat cift cagrilinca tek surec.
  process.env.SAHTE_MOD = 'normal';
  fs.writeFileSync(PIDLER, '');
  medya.baslat({});
  medya.baslat({});
  await bekle(() => pidler().length >= 1);
  await uyu(200);
  kontrol('cift baslat tek surec acar', pidler().length === 1, pidler());
  await medya.durdur();
  kontrol('son durdur: surec olu', pidler().every((p) => !canli(p)));
  delete process.env.KOKPIT_MEDYA_YARDIMCI;
}

// ---------------------------------------------------------------- GERCEK=1 duman testi

async function gercekTest() {
  console.log('\n--- GERCEK=1: gercek powershell yardimcisi (yalniz okuma) ---');
  if (process.platform !== 'win32') {
    console.log('atlandi: Windows degil');
    return;
  }
  delete process.env.KOKPIT_MEDYA_YARDIMCI;
  const olaylar = [];
  const t0 = Date.now();
  let hazirMs = null;
  medya.baslat({
    olay: (o) => {
      olaylar.push(o);
      if (o.tur === 'hazir' && hazirMs === null) hazirMs = Date.now() - t0;
    },
  });
  await uyu(4000);
  const pid = olaylar.find((o) => o.tur === 'basladi')?.pid;
  const turler = olaylar.map((o) => o.tur);
  console.log('  acilis (spawn -> hazir): ' + hazirMs + ' ms; olaylar: ' + [...new Set(turler)].join(','));
  const d = medya.anlik();
  if (d) console.log('  ornek: uygulama=' + d.uygulama + ' caliyor=' + d.caliyor + ' sure=' + d.sureMs + ' kapak=' + (d.kapak ? d.kapak.length + ' karakter' : 'yok'));
  kontrol('gercek: hazir geldi', turler.includes('hazir'), turler);
  kontrol('gercek: durum ya da yok geldi', turler.includes('durum') || turler.includes('yok'), turler);
  kontrol('gercek: hata yok', !turler.includes('hata'), olaylar.filter((o) => o.tur === 'hata'));
  await medya.durdur();
  kontrol('gercek: durdur sonrasi powershell PID olu', Number.isInteger(pid) && (await bekle(() => !canli(pid), 2000)), pid);

  // Yetim testi: ebeveyn aniden olur; yardimci 3 sn icinde cikmali.
  // (a) node ebeveyn medya.cjs ile, process.exit: libuv cocugu is nesnesine koyar, Node olunce is nesnesi
  //     cocugu kapatir (stdin EOF'u da ayni anda gelir).
  // (b) yalniz stdin EOF yolu: ebeveyn .NET Process ile acan bir powershell ([Environment]::Exit). .NET is
  //     nesnesi kullanmaz ve test surecinin is nesnesi hala acik; yardimciyi oldurebilecek tek sey EOF.
  //     (detached node spawn bunun icin kullanilamadi: konsolsuz powershell.exe ciktisiz cikiyor, olculdu.)
  const ebeveynPs = path.join(GECICI, 'ebeveyn.ps1');
  fs.writeFileSync(ebeveynPs, [
    '$p = New-Object System.Diagnostics.Process',
    "$p.StartInfo.FileName = 'powershell.exe'",
    "$p.StartInfo.Arguments = '-NoProfile -NonInteractive -ExecutionPolicy Bypass -File \"" + path.join(KOK, 'electron', 'medya-yardimci.ps1') + "\"'",
    '$p.StartInfo.UseShellExecute = $false',
    '$p.StartInfo.RedirectStandardInput = $true',
    '$p.StartInfo.RedirectStandardOutput = $true',
    '$p.StartInfo.CreateNoWindow = $true',
    '$null = $p.Start()',
    "while ($true) { $s = $p.StandardOutput.ReadLine(); if ($null -eq $s -or $s -like '*hazir*') { break } }",
    "[Console]::Out.WriteLine('PID ' + $p.Id); [Console]::Out.Flush()",
    '[Environment]::Exit(0)',
  ].join('\r\n'));
  for (const [ad, komut, arg] of [
    ['node ebeveyn, medya.cjs', process.execPath, ['-e', `const m = require(${JSON.stringify(path.join(KOK, 'electron', 'medya.cjs'))});
      let pid; m.baslat({ olay: (o) => { if (o.tur === 'basladi') pid = o.pid; if (o.tur === 'hazir') { console.log('PID ' + pid); process.exit(0); } } });`]],
    ['yalniz stdin EOF', 'powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', ebeveynPs]],
  ]) {
    const ebeveyn = spawn(komut, arg, { stdio: ['ignore', 'pipe', 'inherit'], env: process.env, windowsHide: true });
    let cikti = '';
    ebeveyn.stdout.on('data', (x) => (cikti += x));
    await new Promise((r) => ebeveyn.on('exit', r));
    const pidY = Number((/PID (\d+)/.exec(cikti) || [])[1]);
    const t = Date.now();
    const oldu = Number.isInteger(pidY) && pidY > 0 && (await bekle(() => !canli(pidY), 3000));
    console.log('  yetim (' + ad + '): ebeveyn oldukten ' + (Date.now() - t) + ' ms sonra yardimci ' + (oldu ? 'olu' : 'CANLI'));
    kontrol('yetim (' + ad + '): yardimci <= 3 sn icinde cikti', oldu, { pidY, cikti });
    if (!oldu && pidY > 0) {
      try {
        process.kill(pidY); // yalniz bu testin actigi surec
      } catch {
        /* yok */
      }
    }
  }
}

(async () => {
  try {
    sozlerAyristirma();
    await sozlerGetir();
    await medyaTesti();
    if (process.env.GERCEK === '1') await gercekTest();
  } catch (e) {
    kalan++;
    console.log('FAIL beklenmeyen hata: ' + (e && e.stack));
  }
  await medya.durdur().catch(() => {});
  try {
    fs.rmSync(GECICI, { recursive: true, force: true });
  } catch {
    /* Windows'ta kilitli kalan dosya: tmp temizligine kalir */
  }
  console.log('\n' + gecen + ' gecti, ' + kalan + ' kaldi');
  process.exit(kalan ? 1 : 0);
})();
