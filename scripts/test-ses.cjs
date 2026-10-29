// v3.1: Ada'nin sesi, gercek uc uca (elle kosulur: `npm run test:ses`). Gercek whisper sunucusunu (GPU) ve
// edge-tts'i kullanir; CI'da yok (model 874 MB, ag gerekir). Kokpit'in kendi dizinine dokunmaz: log gecici
// KOKPIT_DIZIN'e yazilir.
//
// Akis: edge-tts ile Turkce + Ingilizce terimli cumleler sentezlenir -> ffmpeg 16 kHz mono WAV -> ses.coz
// (gercek whisper) -> ses-komut.komutCoz. Kontrol: hedef oturum ve eylem dogru mu, metin beklenene yakin mi
// (sozcuk isabeti), sure. Konusan ses ile tanima ayni makinede: insan sesi degil; insan sesi elle denenir.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const GECICI = fs.mkdtempSync(path.join(os.tmpdir(), 'kokpit-test-ses-'));
process.env.KOKPIT_DIZIN = GECICI;
delete process.env.KOKPIT_TEST_SES_METIN;
const ses = require('../electron/ses.cjs');
const { komutCoz, ipucu, anahtar } = require('../electron/ses-komut.cjs');

const OTURUMLAR = [
  { id: 'k1', ad: 'Kokpit' },
  { id: 'm1', ad: 'Matbaa' },
  { id: 'y1', ad: 'Yanki' },
  { id: 'c1', ad: 'Citefield' },
  { id: 'p1', ad: 'Portfolyo' },
];

// [cumle, beklenen eylem, beklenen hedef, beklenen govde (sozcuk isabeti icin)]
const ORNEKLER = [
  ['Matbaa oturumuna söyle, testleri koş ve sonucu commit at.', 'not', 'm1', 'testleri koş ve sonucu commit at'],
  ["Kokpit'e yaz: Ada penceresindeki hatayı düzelt, sonra push etme.", 'not', 'k1', 'Ada penceresindeki hatayı düzelt sonra push etme'],
  ['Durum ne?', 'durum', null, ''],
  ['Portfolyo projesinde build al ve görsel doğrulamayı çalıştır.', 'not', 'p1', 'build al ve görsel doğrulamayı çalıştır'],
  ['Gönder.', 'gonder', null, ''],
  ['Yanki oturumunda RunPod bakiyesini kontrol et.', 'not', 'y1', 'RunPod bakiyesini kontrol et'],
  ["Citefield'a yaz, lint ve type check çalıştır, gönder.", 'not', 'c1', 'lint ve type check çalıştır'],
  ['Testleri bir kez daha çalıştır.', 'not', null, 'testleri bir kez daha çalıştır'],
];

let gecen = 0;
let kalan = 0;
const ok = (kosul, ad, ayrinti = '') => {
  if (kosul) gecen++;
  else kalan++;
  console.log((kosul ? '  ok   ' : '  HATA ') + ad + (ayrinti ? '  (' + ayrinti + ')' : ''));
};

function isabet(beklenen, gelen) {
  const b = beklenen.split(/\s+/).map(anahtar).filter(Boolean);
  const g = new Set(gelen.split(/\s+/).map(anahtar).filter(Boolean));
  return b.length ? b.filter((s) => g.has(s)).length / b.length : 1;
}

(async () => {
  const d = ses.durum();
  if (!d.stt || !d.tts) {
    console.log('ses dosyalari yok (' + ses.SES_DIZIN + '); once `npm run ses:kur`');
    process.exit(2);
  }
  const t0 = Date.now();
  ok(await ses.hazirla(), 'whisper sunucusu acildi', Date.now() - t0 + ' ms');
  const sureler = [];
  for (const [i, [cumle, tur, hedef, govde]] of ORNEKLER.entries()) {
    const mp3 = await ses.konus(cumle);
    if (!mp3) {
      ok(false, 'sentez: ' + cumle);
      continue;
    }
    const mp3Yol = path.join(GECICI, i + '.mp3');
    const wavYol = path.join(GECICI, i + '.wav');
    fs.writeFileSync(mp3Yol, mp3);
    execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', mp3Yol, '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', wavYol]);
    const r = await ses.coz(fs.readFileSync(wavYol), ipucu(OTURUMLAR.map((o) => o.ad)));
    if ('hata' in r) {
      ok(false, 'cozum: ' + cumle, r.hata);
      continue;
    }
    sureler.push(r.ms);
    const e = komutCoz(r.metin, OTURUMLAR);
    const hedefGelen = e.tur === 'not' && e.hedef ? e.hedef.id : null;
    const isa = e.tur === 'not' ? isabet(govde, e.metin) : 1;
    ok(
      e.tur === tur && hedefGelen === hedef && isa >= 0.8,
      JSON.stringify(cumle),
      r.ms + ' ms · "' + r.metin + '" -> ' + e.tur + (hedefGelen ? ' @' + hedefGelen : '') + (e.tur === 'not' ? ' isabet %' + Math.round(isa * 100) + (e.gonder ? ' +gönder' : '') : '')
    );
    if (cumle.endsWith('gönder.')) ok(e.tur === 'not' && e.gonder === true, 'sondaki "gönder" cumleyi yollar');
  }
  // v3.2: sesli ozet / cevap / git / brifing ve eller serbest ("Ada, ..."). Uyandirma parcasi whisper'a
  // "Ada, " ipucuyla gider (main.cjs onUyanmaCoz ile ayni).
  const { uyanmaAyikla } = require('../electron/ses-komut.cjs');
  const V32 = [
    // [cumle, uyandirma mi, beklenen eylem, beklenen hedef, ek kontrol]
    ['Ada, Matbaa ne yaptı?', true, 'ozet', 'm1'],
    ['Ada, ikinci seçenek.', true, 'cevap', null, (e) => JSON.stringify(e.secimler) === '[1]'],
    ["Ada, Kokpit'i aç.", true, 'git', 'k1'],
    ['Günaydın Ada.', false, 'brifing', null],
    ['Önerileni seç.', false, 'cevap', null, (e) => e.onerilen === true],
    ["Adana'ya yarın gidiyoruz.", false, 'not', null],
  ];
  for (const [i, [cumle, uyandirma, tur, hedef, ek]] of V32.entries()) {
    const mp3 = await ses.konus(cumle);
    if (!mp3) {
      ok(false, 'sentez: ' + cumle);
      continue;
    }
    const mp3Yol = path.join(GECICI, 'v32-' + i + '.mp3');
    const wavYol = path.join(GECICI, 'v32-' + i + '.wav');
    fs.writeFileSync(mp3Yol, mp3);
    execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', mp3Yol, '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', wavYol]);
    const r = await ses.coz(fs.readFileSync(wavYol), 'Ada, ' + ipucu(OTURUMLAR.map((o) => o.ad)));
    if ('hata' in r) {
      ok(false, 'cozum: ' + cumle, r.hata);
      continue;
    }
    const u = uyanmaAyikla(r.metin);
    const e = komutCoz(uyandirma ? u.kalan : r.metin, OTURUMLAR);
    const hedefGelen = e.hedef ? e.hedef.id : null;
    ok(
      u.uyandi === uyandirma && e.tur === tur && hedefGelen === hedef && (!ek || ek(e)),
      'v3.2 ' + JSON.stringify(cumle),
      r.ms + ' ms · "' + r.metin + '" -> uyandi=' + u.uyandi + ' ' + e.tur + (hedefGelen ? ' @' + hedefGelen : '')
    );
  }
  // Isinmis sunucuda cumle basina sure: konusmanin bitmesiyle tepsinin dolmasi arasindaki bekleme.
  const sicak = sureler.slice(1);
  const ort = sicak.length ? Math.round(sicak.reduce((a, b) => a + b, 0) / sicak.length) : 0;
  ok(ort > 0 && ort < 1500, 'isinmis sunucuda ortalama cozum suresi < 1,5 sn', ort + ' ms');
  // Bozuk girdi reddedilir, sunucuya gitmez.
  const bozuk = await ses.coz(Buffer.from('bu bir wav degil, ama yeterince uzun bir tampon olsun diye uzatildi'), '');
  ok('hata' in bozuk, 'WAV olmayan girdi reddedilir');
  ses.durdur();
  fs.rmSync(GECICI, { recursive: true, force: true });
  console.log('\n' + gecen + ' gecti, ' + kalan + ' kaldi');
  process.exit(kalan ? 1 : 0);
})().catch((e) => {
  console.error(e);
  ses.durdur();
  process.exit(1);
});
