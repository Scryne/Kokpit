// Uretimde dist/ klasoru KENDI SEMAMIZDAN servis edilir: app://kokpit/...
//
// Neden file:// degil:
//  1. `onHeadersReceived` file:// istekleri icin TETIKLENMIYOR -> uretim CSP'si
//     pratikte hic uygulanmiyordu (2026-09-10'da fark edildi, uretim modu hic
//     denenmemisti).
//  2. file:// kaynagi opak; `script-src 'self'` orada guvenilir davranmiyor.
//
// Kendi standart+guvenli semamizla gercek bir origin olusuyor, 'self' anlam
// kazaniyor ve CSP her yaniti isaretleyebiliyoruz.

const { protocol } = require('electron');
const fs = require('fs/promises');
const path = require('path');
const { log } = require('./log.cjs');

const SEMA = 'app';
const HOST = 'kokpit';

const TURLER = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json; charset=utf-8',
};

/** app.whenReady()'den ONCE cagrilmali. */
function semaKaydet() {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: SEMA,
      privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true },
    },
  ]);
}

/** app.whenReady()'den SONRA cagrilir. */
function protokolKur(distDizin, csp) {
  const kok = path.resolve(distDizin);

  protocol.handle(SEMA, async (istek) => {
    let gorece;
    try {
      gorece = decodeURIComponent(new URL(istek.url).pathname);
    } catch {
      return new Response('Geçersiz istek', { status: 400 });
    }

    // Dizin disina cikma korumasi: cozulen yol kokun altinda kalmali.
    const hedef = path.resolve(kok, '.' + path.normalize(gorece));
    if (hedef !== kok && !hedef.startsWith(kok + path.sep)) {
      log('protokol: kok disina cikma denemesi reddedildi -> ' + gorece);
      return new Response('Yasak', { status: 403 });
    }

    try {
      const icerik = await fs.readFile(hedef);
      return new Response(icerik, {
        status: 200,
        headers: {
          'content-type': TURLER[path.extname(hedef).toLowerCase()] ?? 'application/octet-stream',
          'content-security-policy': csp,
        },
      });
    } catch (e) {
      log('protokol: dosya okunamadi ' + hedef + ' (' + e.code + ')');
      return new Response('Bulunamadı', { status: 404 });
    }
  });

  log('uretim protokolu hazir: ' + SEMA + '://' + HOST + '/  -> ' + kok);
}

const BASLANGIC_URL = SEMA + '://' + HOST + '/index.html';

module.exports = { semaKaydet, protokolKur, BASLANGIC_URL };
