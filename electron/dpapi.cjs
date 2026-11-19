// Windows DPAPI (CryptProtectData, kullanici kapsami). Usta'nin API anahtari diske boyle iner.
// Neden Electron safeStorage degil: safeStorage'in sifreli metnini yalniz Chromium cozebilir; anahtari
// okuyan asil taraf ise Kokpit disindaki isci betigi (scripts/usta.py, ctypes ile ayni API). DPAPI
// bloku ayni Windows kullanicisinin her surecinde cozulur, baska kullanici ya da baska makinede cozulmez.
// Entropi iki tarafta ayni sabit: baska bir uygulamanin DPAPI blogu bu kapidan gecmez.
const ENTROPI = Buffer.from('kokpit-usta', 'utf8');
const CRYPTPROTECT_UI_FORBIDDEN = 0x1;

let api = null;
function yukle() {
  if (api) return api;
  if (process.platform !== 'win32') throw new Error('DPAPI yalniz Windows');
  const koffi = require('koffi');
  const crypt32 = koffi.load('crypt32.dll');
  const kernel32 = koffi.load('kernel32.dll');
  // Ad, ayni surecte baska bir modulun DATA_BLOB tanimiyla carpismasin diye ozel.
  koffi.struct('KOKPIT_DPAPI_BLOB', { cbData: 'uint32_t', pbData: 'void *' });
  api = {
    koffi,
    koru: crypt32.func(
      'bool __stdcall CryptProtectData(KOKPIT_DPAPI_BLOB *giris, const char16_t *aciklama, KOKPIT_DPAPI_BLOB *entropi, void *ayrilmis, void *istem, uint32_t bayrak, _Out_ KOKPIT_DPAPI_BLOB *cikis)',
    ),
    coz: crypt32.func(
      'bool __stdcall CryptUnprotectData(KOKPIT_DPAPI_BLOB *giris, void *aciklama, KOKPIT_DPAPI_BLOB *entropi, void *ayrilmis, void *istem, uint32_t bayrak, _Out_ KOKPIT_DPAPI_BLOB *cikis)',
    ),
    serbest: kernel32.func('void * __stdcall LocalFree(void *h)'),
  };
  return api;
}

function cagir(fn, veri, aciklama) {
  const a = yukle();
  const cikis = {};
  const ok = fn({ cbData: veri.length, pbData: veri }, aciklama, { cbData: ENTROPI.length, pbData: ENTROPI }, null, null, CRYPTPROTECT_UI_FORBIDDEN, cikis);
  if (!ok || !cikis.pbData) throw new Error('DPAPI islemi basarisiz');
  try {
    return Buffer.from(a.koffi.decode(cikis.pbData, 'uint8_t', cikis.cbData));
  } finally {
    a.serbest(cikis.pbData);
  }
}

/** Metni sifreler, base64 doner. Hata metni girdiyi icermez. */
function sifrele(metin) {
  return cagir(yukle().koru, Buffer.from(String(metin), 'utf8'), 'kokpit-usta').toString('base64');
}

/** base64 DPAPI blogunu cozer. Bozuk/baska kullanicinin blogu -> hata. */
function coz(b64) {
  return cagir(yukle().coz, Buffer.from(String(b64), 'base64'), null).toString('utf8');
}

module.exports = { sifrele, coz };
