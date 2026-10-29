// v3.3, Aria'nin Kokpit araclari: main tarafi (Faz 62). aria-mcp.cjs (claude'un MCP sureci) buraya yerel HTTP ile gelir
// (127.0.0.1, rastgele port, token; kanca koprusuyle ayni desen). Okuma araclari Kokpit'in zaten bildigini metne cevirir.
// Oneri araclari HICBIR SEY YAPMAZ: bir oneri karti dogurur, Scryne Aria sayfasinda (ya da Ada'da sesle) onaylarsa ana
// pencere uygular. Bu, Kokpit'in v2.3'ten beri korudugu kuralin devami: oturuma yalniz Scryne'in acik eylemiyle yazilir.
//
// Metinler model icin: kisa, alanli, dogrudan veri; yorum yok. `metinKur` ailesi SAF (test-ada).

const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const path = require('path');
const { KOKPIT_DIZIN } = require('./config.cjs');
const { log } = require('./log.cjs');

const ONERI_TURLERI = new Set(['gorev', 'gece', 'mesaj']);
const AZAMI_ONERI = 50;

let sunucu = null;
let token = null;
let port = 0;
/** @type {Record<string, (girdi: object) => Promise<string> | string>} */
let isleyiciler = {};
let oneriler = []; // { id, tur, proje?, oturum?, oturumId?, metin, kip?, durum, sonuc?, t, mesajId? }
let oneriYayin = (_o) => {};
let aktifMesaj = () => null;

/** Oneri karti dogurur. Proje / oturum gercekten var mi cagiran (main) denetler; burada bicim. */
function oneriEkle(o) {
  if (!ONERI_TURLERI.has(o.tur)) throw new Error('bilinmeyen oneri');
  const metin = String(o.metin || '').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').trim().slice(0, 4000);
  if (!metin) throw new Error('oneri metni bos');
  const kart = {
    id: 'o' + (oneriler.length + 1) + '-' + crypto.randomBytes(2).toString('hex'),
    tur: o.tur,
    ...(o.proje ? { proje: o.proje } : {}),
    ...(o.oturum ? { oturum: o.oturum, oturumId: o.oturumId } : {}),
    ...(o.kip ? { kip: o.kip } : {}),
    metin,
    durum: 'bekliyor',
    t: Date.now(),
    mesajId: aktifMesaj(),
  };
  oneriler.push(kart);
  if (oneriler.length > AZAMI_ONERI) oneriler = oneriler.slice(-AZAMI_ONERI);
  log('aria: oneri ' + kart.id + ' (' + kart.tur + (kart.proje ? ' ' + kart.proje : kart.oturum ? ' ' + kart.oturum : '') + ')');
  oneriYayin(kart);
  return kart;
}

/**
 * Onay aninda kart 'uygulaniyor'a gecer: ikinci onay (Ada karti, sesli "onayla", Aria sayfasi ayni anda) ayni isi iki kez
 * yaptirmasin. Doner: kart ya da null (zaten karar verilmis).
 */
function oneriBasla(id) {
  const k = oneriler.find((x) => x.id === id);
  if (!k || k.durum !== 'bekliyor') return null;
  k.durum = 'uygulaniyor';
  log('aria: oneri ' + id + ' -> uygulaniyor');
  oneriYayin(k);
  return k;
}

function oneriSonuc(id, durum, sonuc) {
  const k = oneriler.find((x) => x.id === id);
  // Red yalniz bekleyene; sonuc (onaylandi/hata) yalniz uygulanmakta olana.
  if (!k || (durum === 'reddedildi' ? k.durum !== 'bekliyor' : k.durum !== 'uygulaniyor')) return null;
  k.durum = durum;
  if (sonuc) k.sonuc = String(sonuc).slice(0, 300);
  log('aria: oneri ' + id + ' -> ' + durum);
  oneriYayin(k);
  return k;
}

/** Oneri listesinin model icin metni. SAF. */
function onerilerMetni(liste) {
  if (!liste.length) return 'Bugun oneri yok.';
  const ad = { bekliyor: 'onay bekliyor', uygulaniyor: 'uygulaniyor', onaylandi: 'ONAYLANDI', reddedildi: 'reddedildi', hata: 'uygulanamadi' };
  return liste
    .map((k) => '#' + k.id + ' ' + k.tur + (k.proje ? ' ' + k.proje : '') + (k.oturum ? ' -> ' + k.oturum : '') + ': ' + (ad[k.durum] ?? k.durum) + (k.sonuc ? ' (' + k.sonuc + ')' : '') + ' | ' + k.metin.slice(0, 120))
    .join('\n');
}

function govdeOku(istek) {
  return new Promise((coz, red) => {
    let v = '';
    istek.setEncoding('utf8');
    istek.on('data', (p) => {
      v += p;
      if (v.length > 64 * 1024) {
        red(new Error('govde buyuk'));
        istek.destroy();
      }
    });
    istek.on('end', () => coz(v));
    istek.on('error', red);
  });
}

function tokenGecerli(gelen) {
  const a = Buffer.from(String(gelen || ''));
  const b = Buffer.from('Bearer ' + token);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * @param {{ isleyiciler: Record<string, Function>, onOneri: (k: object) => void, aktifMesaj: () => string | null }} s
 * @returns {Promise<{ url: string, token: string, mcpConfig: string }>}
 */
async function baslat(s) {
  isleyiciler = s.isleyiciler;
  oneriYayin = s.onOneri;
  aktifMesaj = s.aktifMesaj;
  if (sunucu) return { url: 'http://127.0.0.1:' + port, token, mcpConfig: mcpYolu() };
  token = crypto.randomBytes(24).toString('hex');
  sunucu = http.createServer(async (istek, yanit) => {
    const bitir = (kod, nesne) => {
      yanit.writeHead(kod, { 'Content-Type': 'application/json; charset=utf-8' });
      yanit.end(JSON.stringify(nesne));
    };
    if (istek.method !== 'POST' || istek.url !== '/arac' || !tokenGecerli(istek.headers.authorization)) return bitir(403, { hata: 'yetkisiz' });
    let j;
    try {
      j = JSON.parse(await govdeOku(istek));
    } catch {
      return bitir(400, { hata: 'gecersiz istek' });
    }
    const f = isleyiciler[j && j.ad];
    if (!f) return bitir(404, { hata: 'bilinmeyen arac' });
    try {
      const metin = await f(j.girdi && typeof j.girdi === 'object' ? j.girdi : {});
      log('aria araci: ' + j.ad + ' -> ' + String(metin ?? '').replace(/\s+/g, ' ').slice(0, 90));
      bitir(200, { metin: String(metin ?? '') });
    } catch (e) {
      bitir(200, { hata: e.message });
    }
  });
  await new Promise((coz, red) => {
    sunucu.once('error', red);
    sunucu.listen(0, '127.0.0.1', coz);
  });
  port = sunucu.address().port;
  // MCP yapilandirmasi: claude `node aria-mcp.cjs`'i bu ortamla baslatir. Token dosyada (Kokpit'in kendi dizini,
  // kanca ayar dosyasi gibi); her acilista yenilenir.
  const cfg = {
    mcpServers: {
      kokpit: {
        command: 'node',
        args: [path.join(__dirname, 'aria-mcp.cjs')],
        env: { KOKPIT_ARIA_URL: 'http://127.0.0.1:' + port, KOKPIT_ARIA_TOKEN: token },
      },
    },
  };
  fs.mkdirSync(path.dirname(mcpYolu()), { recursive: true });
  fs.writeFileSync(mcpYolu(), JSON.stringify(cfg, null, 2), 'utf8');
  log('aria araclari hazir (port ' + port + ')');
  return { url: 'http://127.0.0.1:' + port, token, mcpConfig: mcpYolu() };
}

function mcpYolu() {
  return path.join(KOKPIT_DIZIN, 'aria', 'mcp-' + process.pid + '.json');
}

function durdur() {
  if (sunucu) sunucu.close();
  sunucu = null;
  try {
    fs.rmSync(mcpYolu(), { force: true });
  } catch {
    /* yok */
  }
}

module.exports = { baslat, durdur, oneriEkle, oneriBasla, oneriSonuc, onerilerMetni, oneriler: () => oneriler.slice(), ONERI_TURLERI };
