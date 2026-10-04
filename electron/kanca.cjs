// Kanca koprusu: Kokpit'in actigi claude oturumlarindan gelen HTTP hook olaylarini alir.
//
// Nasil baglaniyor (2026-10-03 spike'inda olculdu, docs/Roadmap.md Faz 12):
//   - Kokpit claude'u `--settings <bu dosyanin yazdigi json>` ile acar. O json'daki hook'lar
//     `type: "http"`; projenin kendi hook'lariyla BIRLESIR (SessionStart/SessionEnd yine calisti),
//     global ~/.claude/settings.json'a hic dokunulmaz. Kokpit disinda acilan claude etkilenmez.
//   - Hangi sekme? PTY her oturuma KOKPIT_OTURUM ortam degiskeni verir; hook basligi
//     `X-Kokpit-Oturum: $KOKPIT_OTURUM` (allowedEnvVars) ile tasir. Token ayni yoldan.
//   - Statusline da ayni json'da: durum-satiri.cjs limitleri buraya iletir, sonra kullanicinin
//     kendi statusline komutunu calistirir (Scryne'in durum satiri degismez).
//
// Kokpit kapaliysa hook baglanamaz: Claude Code bunu "non-blocking error" sayar, oturum devam
// eder (docs). Zaman asimi 2 sn; sunucu govdeyi okuyup hemen 204 doner.

const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { log } = require('./log.cjs');
const { KOKPIT_DIZIN } = require('./config.cjs');
const etkinlik = require('./etkinlik.cjs');

const DIZIN = path.join(KOKPIT_DIZIN, 'kanca');
const GOVDE_SINIRI = 8 * 1024 * 1024; // Write'in content'i buyuk olabilir
const YAYIN_ARALIGI_MS = 80;
const OLAYLAR = ['SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'Notification', 'Stop', 'SubagentStart', 'SubagentStop', 'SessionEnd'];

let sunucu = null;
let bilgi = null; // { port, token, ayarDosyasi, asilDurumSatiri }
let hazirSozu = null;
const oturumlar = new Map(); // kokpit oturum id -> etkinlik durumu
const baglamlar = new Map(); // kokpit oturum id -> statusline baglami
let limitler = null; // { besSaat, hafta, olculdu }
let dinleyiciler = { yayin: () => {}, sinyal: () => {} };
let yayinZamanlayici = null;

function tokenGecerli(baslik) {
  const gelen = Buffer.from(String(baslik || '').replace(/^Bearer\s+/i, ''));
  const beklenen = Buffer.from(bilgi.token);
  return gelen.length === beklenen.length && crypto.timingSafeEqual(gelen, beklenen);
}

function anlik() {
  return {
    oturumlar: Object.fromEntries(oturumlar),
    baglamlar: Object.fromEntries(baglamlar),
    limitler,
  };
}

function yayinla() {
  if (yayinZamanlayici) return;
  yayinZamanlayici = setTimeout(() => {
    yayinZamanlayici = null;
    try {
      dinleyiciler.yayin(anlik());
    } catch (e) {
      log('kanca yayin hatasi: ' + e.message);
    }
  }, YAYIN_ARALIGI_MS);
}

function govdeOku(req) {
  return new Promise((coz, red) => {
    const parcalar = [];
    let boy = 0;
    req.on('data', (p) => {
      boy += p.length;
      if (boy > GOVDE_SINIRI) {
        red(new Error('govde cok buyuk'));
        req.destroy();
        return;
      }
      parcalar.push(p);
    });
    req.on('end', () => coz(Buffer.concat(parcalar).toString('utf8')));
    req.on('error', red);
  });
}

async function istek(req, res) {
  if (req.method !== 'POST' || (req.url !== '/kanca' && req.url !== '/durum-satiri')) {
    res.writeHead(404).end();
    return;
  }
  if (!tokenGecerli(req.headers['authorization'])) {
    res.writeHead(401).end();
    return;
  }
  const oturumId = String(req.headers['x-kokpit-oturum'] || '');
  let ham;
  try {
    ham = await govdeOku(req);
  } catch {
    res.writeHead(413).end();
    return;
  }
  // Once cevap: claude bu cevabi bekliyor, isleme onu geciktirmemeli.
  res.writeHead(204).end();
  if (!/^[\w.-]{1,160}$/.test(oturumId)) return;
  let govde;
  try {
    govde = JSON.parse(ham);
  } catch {
    return;
  }

  if (req.url === '/durum-satiri') {
    const ds = etkinlik.durumSatiri(govde);
    if (ds.limitler.besSaat || ds.limitler.hafta) limitler = { ...ds.limitler, olculdu: Date.now() };
    if (ds.baglam) baglamlar.set(oturumId, { ...ds.baglam, olculdu: Date.now() });
    yayinla();
    return;
  }

  const { durum, sinyal, degisti } = etkinlik.isle(oturumlar.get(oturumId), govde, Date.now());
  if (!degisti) return;
  oturumlar.set(oturumId, durum);
  yayinla();
  if (sinyal) {
    try {
      dinleyiciler.sinyal(oturumId, sinyal, durum);
    } catch (e) {
      log('kanca sinyal hatasi: ' + e.message);
    }
  }
}

/** Kullanicinin kendi statusline'i (user settings). Yoksa null; durum-satiri.cjs bos basar. */
function asilDurumSatiri() {
  try {
    const ayar = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.claude', 'settings.json'), 'utf8'));
    const s = ayar.statusLine;
    return s && s.type === 'command' && typeof s.command === 'string' ? s : null;
  } catch {
    return null;
  }
}

/**
 * Her Kokpit sureci kendi ayar dosyasini yazar (ayar-<pid>.json): test kosuculari gercek
 * Kokpit acikken de calisiyor, tek dosya olsaydi birbirinin portunu ezerlerdi. Olu sureclerin
 * dosyalari acilista temizlenir.
 */
function ayarDosyasiYaz(port, asil) {
  fs.mkdirSync(DIZIN, { recursive: true });
  for (const ad of fs.readdirSync(DIZIN)) {
    const m = /^ayar-(\d+)\.json$/.exec(ad);
    if (!m || Number(m[1]) === process.pid) continue;
    let yasiyor = true;
    try {
      process.kill(Number(m[1]), 0);
    } catch {
      yasiyor = false;
    }
    if (!yasiyor) {
      try {
        fs.unlinkSync(path.join(DIZIN, ad));
      } catch {
        /* baska biri sildi */
      }
    }
  }
  const kanca = {
    type: 'http',
    url: 'http://127.0.0.1:' + port + '/kanca',
    timeout: 2,
    headers: { Authorization: 'Bearer $KOKPIT_KANCA_TOKEN', 'X-Kokpit-Oturum': '$KOKPIT_OTURUM' },
    allowedEnvVars: ['KOKPIT_KANCA_TOKEN', 'KOKPIT_OTURUM'],
  };
  const hooks = Object.fromEntries(OLAYLAR.map((o) => [o, [{ hooks: [kanca] }]]));
  const betik = path.join(__dirname, 'durum-satiri.cjs').split(path.sep).join('/');
  const statusLine = { ...(asil || {}), type: 'command', command: 'node "' + betik + '"' };
  const dosya = path.join(DIZIN, 'ayar-' + process.pid + '.json');
  fs.writeFileSync(dosya, JSON.stringify({ hooks, statusLine }, null, 2));
  return dosya;
}

function baslat(yeniDinleyiciler) {
  if (yeniDinleyiciler) dinleyiciler = { ...dinleyiciler, ...yeniDinleyiciler };
  if (hazirSozu) return hazirSozu;
  hazirSozu = new Promise((coz, red) => {
    const token = crypto.randomBytes(32).toString('hex');
    sunucu = http.createServer((req, res) => {
      istek(req, res).catch((e) => {
        log('kanca istek hatasi: ' + e.message);
        if (!res.headersSent) res.writeHead(500).end();
      });
    });
    sunucu.on('error', (e) => {
      log('FAIL kanca sunucusu: ' + e.message);
      red(e);
    });
    sunucu.listen(0, '127.0.0.1', () => {
      const port = sunucu.address().port;
      const asil = asilDurumSatiri();
      bilgi = { port, token, ayarDosyasi: null, asilDurumSatiri: asil ? asil.command : null };
      try {
        bilgi.ayarDosyasi = ayarDosyasiYaz(port, asil);
      } catch (e) {
        log('FAIL kanca ayar dosyasi yazilamadi: ' + e.message);
      }
      log('kanca sunucusu hazir port=' + port + ' ayar=' + bilgi.ayarDosyasi);
      coz(bilgi);
    });
  });
  return hazirSozu;
}

/**
 * PTY sunucusuna gecen ortam: claude bu degiskenlerle acilir. Ayar dosyasi yazilamadiysa bos
 * doner ve oturumlar eskisi gibi (hook'suz) acilir: Kokpit'in cekirdegi buna bagli degil.
 */
function ptyOrtami() {
  if (!bilgi || !bilgi.ayarDosyasi) return {};
  return {
    KOKPIT_KANCA_AYAR: bilgi.ayarDosyasi,
    KOKPIT_KANCA_PORT: String(bilgi.port),
    KOKPIT_KANCA_TOKEN: bilgi.token,
    ...(bilgi.asilDurumSatiri ? { KOKPIT_ASIL_DURUM_SATIRI: bilgi.asilDurumSatiri } : {}),
  };
}

function ozet(oturumId) {
  return etkinlik.kaliciOzet(oturumlar.get(oturumId));
}

function unut(oturumId) {
  oturumlar.delete(oturumId);
  baglamlar.delete(oturumId);
  yayinla();
}

function durdur() {
  if (sunucu) {
    try {
      sunucu.close();
    } catch {
      /* zaten kapali */
    }
  }
  if (bilgi && bilgi.ayarDosyasi) {
    try {
      fs.unlinkSync(bilgi.ayarDosyasi);
    } catch {
      /* zaten yok */
    }
  }
  sunucu = null;
}

module.exports = { baslat, ptyOrtami, anlik, ozet, unut, durdur, mevcutBilgi: () => bilgi };
