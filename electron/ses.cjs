// v3.1, Ada'nin sesi: yerel konusma tanima (whisper.cpp sunucusu, GPU) ve Turkce ses (edge-tts).
//
// Dosyalar Kokpit'in deposunda degil, ~/.kokpit/ses altinda (1,2 GB ikili + 874 MB model; kurulum:
// `npm run ses:kur`). KOKPIT_SES_DIZIN yalniz test icindir. Dosyalar yoksa Kokpit sesi kapali calisir.
//
// Olcum (2026-10-29, RTX 4060 Laptop, large-v3-turbo q8_0): 5-10 sn'lik Turkce cumle ~250 ms (ilk istek
// ~600 ms), VRAM ~1,2 GB. Sunucu ilk dinlemede acilir (model yuklemesi konusma surerken biter) ve 15 dk
// bos kalinca kapanir: GPU bellegi oyunda/videoda bos kalsin.
//
// edge-tts resmi olmayan bir uctur (Edge'in sesli okuma servisi): bazen bir ses icin bos doner (olculdu,
// tr-TR-AhmetNeural ayni gece iki kez). Bu yuzden iki ses sirayla denenir, ikisi de olmazsa Ada yazar
// ama konusmaz.

const { spawn, execFile } = require('child_process');
const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');
const { KOKPIT_DIZIN } = require('./config.cjs');
const { log } = require('./log.cjs');

const SES_DIZIN = process.env.KOKPIT_SES_DIZIN
  ? path.resolve(process.env.KOKPIT_SES_DIZIN)
  : path.join(os.homedir(), '.kokpit', 'ses');
const SUNUCU = path.join(SES_DIZIN, 'bin', 'Release', 'whisper-server.exe');
const MODEL = path.join(SES_DIZIN, 'model', 'ggml-large-v3-turbo-q8_0.bin');
const TTS = path.join(SES_DIZIN, 'venv', 'Scripts', 'edge-tts.exe');
const SESLER = ['tr-TR-EmelNeural', 'tr-TR-AhmetNeural'];

const BOS_KAPAT_MS = 15 * 60 * 1000;
const ACILIS_MS = 60_000;
const COZ_MS = 30_000;
const KONUS_MS = 12_000;
/** 30 sn, 16 kHz, 16 bit mono + baslik: renderer'dan gelen ses bundan buyuk olamaz. */
const AZAMI_BAYT = 30 * 16000 * 2 + 44;

let surec = null;
let port = 0;
let aciliyor = null;
let bosZamanlayici = null;
const onbellek = new Map(); // konus: metin -> mp3

/**
 * Test taklidi: test:ui gercek modeli acmaz. KOKPIT_TEST_SES_DOSYA her cozumde okunan metin dosyasi
 * (test sirada cumleyi degistirir), KOKPIT_TEST_SES_METIN sabit metin. Test kabugunda Ada konusmaz
 * (gece kosan test hoparlorden ses vermesin, aga cikmasin); KOKPIT_TEST_SES_KONUS=1 acar.
 */
function taklit() {
  if (process.env.KOKPIT_TEST_SES_DOSYA) {
    try {
      return fs.readFileSync(process.env.KOKPIT_TEST_SES_DOSYA, 'utf8').trim();
    } catch {
      return '';
    }
  }
  return typeof process.env.KOKPIT_TEST_SES_METIN === 'string' ? process.env.KOKPIT_TEST_SES_METIN : null;
}
const taklitVar = () => !!process.env.KOKPIT_TEST_SES_DOSYA || typeof process.env.KOKPIT_TEST_SES_METIN === 'string';
const SESSIZ = process.env.KOKPIT_TEST_KABUK === '1' && process.env.KOKPIT_TEST_SES_KONUS !== '1';

const varMi = (y) => {
  try {
    return fs.statSync(y).isFile();
  } catch {
    return false;
  }
};

function durum() {
  return {
    stt: taklitVar() || (varMi(SUNUCU) && varMi(MODEL)),
    tts: !SESSIZ && varMi(TTS),
    sunucu: surec ? (aciliyor ? 'aciliyor' : 'acik') : 'kapali',
  };
}

function bosPort() {
  return new Promise((coz, red) => {
    const s = net.createServer();
    s.once('error', red);
    s.listen(0, '127.0.0.1', () => {
      const p = s.address().port;
      s.close(() => coz(p));
    });
  });
}

function bosSay() {
  if (bosZamanlayici) clearTimeout(bosZamanlayici);
  bosZamanlayici = setTimeout(() => {
    log('ses: ' + BOS_KAPAT_MS / 60000 + ' dk bos, whisper sunucusu kapatiliyor');
    durdur();
  }, BOS_KAPAT_MS);
  bosZamanlayici.unref?.();
}

async function ayaktaMi() {
  try {
    const r = await fetch('http://127.0.0.1:' + port + '/', { signal: AbortSignal.timeout(1500) });
    return r.ok;
  } catch {
    return false;
  }
}

/** Sunucuyu acar (aciksa bir sey yapmaz). Dinleme baslarken cagrilir: model konusma surerken yuklenir. */
function hazirla() {
  if (taklitVar()) return Promise.resolve(true);
  if (surec && !aciliyor) return Promise.resolve(true);
  if (aciliyor) return aciliyor;
  if (!varMi(SUNUCU) || !varMi(MODEL)) return Promise.resolve(false);
  aciliyor = (async () => {
    const t0 = Date.now();
    port = await bosPort();
    const logDosya = path.join(KOKPIT_DIZIN, 'ses.log');
    let cikti = null;
    try {
      fs.mkdirSync(KOKPIT_DIZIN, { recursive: true });
      cikti = fs.openSync(logDosya, 'w');
    } catch {
      /* log yazilamazsa sunucu yine calisir */
    }
    const s = spawn(SUNUCU, ['-m', MODEL, '-l', 'tr', '--host', '127.0.0.1', '--port', String(port), '-t', '4'], {
      cwd: path.dirname(SUNUCU),
      windowsHide: true,
      stdio: ['ignore', cikti ?? 'ignore', cikti ?? 'ignore'],
    });
    surec = s;
    s.on('exit', (kod) => {
      log('ses: whisper sunucusu kapandi (kod ' + kod + ')');
      if (surec === s) surec = null;
      if (cikti !== null) fs.close(cikti, () => {});
    });
    s.on('error', (e) => log('ses: whisper sunucusu baslatilamadi: ' + e.message));
    while (Date.now() - t0 < ACILIS_MS) {
      if (!surec || surec !== s) break;
      if (await ayaktaMi()) {
        log('ses: whisper sunucusu hazir (' + (Date.now() - t0) + ' ms, port ' + port + ')');
        bosSay();
        return true;
      }
      await new Promise((r) => setTimeout(r, 250));
    }
    log('ses: whisper sunucusu ' + ACILIS_MS / 1000 + ' sn icinde acilmadi');
    durdur();
    return false;
  })().finally(() => {
    aciliyor = null;
  });
  return aciliyor;
}

/**
 * 16 kHz mono WAV -> metin.
 * @param {Buffer} wav
 * @param {string} ipucu whisper'in ilk istemi (proje adlari, terimler)
 * @returns {Promise<{ metin: string, ms: number } | { hata: string }>}
 */
async function coz(wav, ipucu) {
  if (!Buffer.isBuffer(wav) || wav.length < 44 || wav.length > AZAMI_BAYT) return { hata: 'ses kaydı geçersiz' };
  if (wav.toString('ascii', 0, 4) !== 'RIFF' || wav.toString('ascii', 8, 12) !== 'WAVE') return { hata: 'ses kaydı WAV değil' };
  if (taklitVar()) return { metin: taklit() ?? '', ms: 0 };
  if (!(await hazirla())) return { hata: 'konuşma tanıma açılamadı' };
  const t0 = Date.now();
  try {
    const form = new FormData();
    form.append('file', new Blob([wav], { type: 'audio/wav' }), 'ses.wav');
    form.append('response_format', 'json');
    form.append('language', 'tr');
    form.append('temperature', '0.0');
    if (ipucu) form.append('prompt', ipucu);
    const r = await fetch('http://127.0.0.1:' + port + '/inference', { method: 'POST', body: form, signal: AbortSignal.timeout(COZ_MS) });
    if (!r.ok) return { hata: 'konuşma tanıma hata verdi (' + r.status + ')' };
    const j = await r.json();
    bosSay();
    const metin = typeof j.text === 'string' ? j.text.replace(/\s+/g, ' ').trim() : '';
    const ms = Date.now() - t0;
    log('ses: cozuldu (' + ms + ' ms, ' + metin.length + ' karakter)');
    return { metin, ms };
  } catch (e) {
    log('ses: cozme basarisiz: ' + e.message);
    return { hata: 'konuşma tanıma cevap vermedi' };
  }
}

function sentezle(ses, metin, hedef) {
  return new Promise((coz) => {
    execFile(TTS, ['--voice', ses, '--text', metin, '--write-media', hedef], { windowsHide: true, timeout: KONUS_MS }, (hata) => {
      if (hata) return coz(null);
      try {
        const b = fs.readFileSync(hedef);
        coz(b.length > 0 ? b : null);
      } catch {
        coz(null);
      }
    });
  });
}

/**
 * Metni Turkce sese cevirir (mp3). Kisa cumleler icindir; olmazsa null (Ada yazar, konusmaz).
 * @param {string} metin
 * @returns {Promise<Buffer | null>}
 */
async function konus(metin) {
  const m = String(metin || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 700);
  if (!m || SESSIZ || !varMi(TTS)) return null;
  if (onbellek.has(m)) return onbellek.get(m);
  const hedef = path.join(os.tmpdir(), 'kokpit-ses-' + process.pid + '-' + Date.now() + '.mp3');
  const t0 = Date.now();
  let sonuc = null;
  for (const ses of SESLER) {
    sonuc = await sentezle(ses, m, hedef);
    if (sonuc) {
      log('ses: konustu (' + ses + ', ' + (Date.now() - t0) + ' ms)');
      break;
    }
    log('ses: ' + ses + ' bos dondu');
  }
  fs.rm(hedef, { force: true }, () => {});
  if (sonuc) {
    onbellek.set(m, sonuc);
    if (onbellek.size > 40) onbellek.delete(onbellek.keys().next().value);
  }
  return sonuc;
}

function durdur() {
  if (bosZamanlayici) clearTimeout(bosZamanlayici);
  bosZamanlayici = null;
  if (surec) {
    try {
      surec.kill();
    } catch {
      /* zaten kapanmis */
    }
    surec = null;
  }
}

module.exports = { SES_DIZIN, SUNUCU, MODEL, TTS, AZAMI_BAYT, durum, hazirla, coz, konus, durdur };
