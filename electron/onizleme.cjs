// v3.2, canli onizleme + isaretle-soyle (Faz 53). Calistir'in servis bolmesi adres yakalayinca bolme ayni
// yerde uygulamanin kendisini gosterebilir (<webview>). "Isaretle" ile sayfada bir oge secilir; ogenin
// kirpigi + secicisi + React bileseni + Scryne'in notu (yazi ya da ses) yandaki claude oturumuna gider.
//
// Neden: 10-04..28 arasi 1.184 prompt'un 197'si ekran goruntusuydu (v3.0 olcumu); cogu "su dugmeyi duzelt"
// turunden bir UI geri bildirimi. Ekran goruntusu + tarif yerine oge kendisi isaretlenir: model hangi
// ogeden soz edildigini secici ve bilesen adiyla bilir (spike 2026-10-29: webview Kokpit'in CSP'si ve
// sandbox'iyla calisti, `capturePage` ogenin dikdortgenini 1,25 olcekte 120x55 px verdi).
//
// Guvenlik: konuk sayfa yalniz yerel adres (localhost / 127.0.0.1 / ::1 / 0.0.0.0); preload ve Node almaz
// (main.cjs will-attach-webview); yeni pencere ve yerel olmayan gezinme varsayilan tarayiciya gider.

const fs = require('fs');
const path = require('path');
const { log } = require('./log.cjs');
const yakalaModulu = require('./yakala.cjs');

/** SAF: onizlenebilir adres mi (http/https + yerel ana makine). */
function yerelAdres(url) {
  let u;
  try {
    u = new URL(String(url || ''));
  } catch {
    return false;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
  const h = u.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  return h === 'localhost' || h.endsWith('.localhost') || h === '127.0.0.1' || h === '::1' || h === '0.0.0.0';
}

/** Konuk webContents: yeni pencere yok, yerel disi gezinme varsayilan tarayicida. */
function konukKur(wc, disariAc) {
  // Dis tarayiciya gonderme sinirli: dongude window.open cagiran bir sayfa sekme yagdiramaz (30 sn'de en fazla 3).
  let disariZamanlari = [];
  const sinirliAc = (url) => {
    const simdi = Date.now();
    disariZamanlari = disariZamanlari.filter((t) => simdi - t < 30_000);
    if (disariZamanlari.length >= 3) {
      log('onizleme: dis adres sinirda, acilmadi: ' + String(url).slice(0, 80));
      return;
    }
    disariZamanlari.push(simdi);
    disariAc(url);
  };
  wc.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) sinirliAc(url);
    return { action: 'deny' };
  });
  wc.on('will-navigate', (olay, url) => {
    if (yerelAdres(url)) return;
    olay.preventDefault();
    if (/^https?:\/\//.test(url)) sinirliAc(url);
  });
  // Sunucu yonlendirmesi (302) ve alt cerceve gezinmesi de ayni kapidan: yerel sunucu dis siteye yonlendiremez.
  wc.on('will-redirect', (olay, url) => {
    if (yerelAdres(url)) return;
    olay.preventDefault();
    log('onizleme: yerel disi yonlendirme engellendi: ' + String(url).slice(0, 80));
  });
  wc.on('will-frame-navigate', (olay) => {
    if (olay.isMainFrame || yerelAdres(olay.url) || /^(about|data|blob):/.test(String(olay.url))) return;
    olay.preventDefault();
  });
  // Konuk sayfa izin istemez (kamera, bildirim ...): onizleme bir gelistirme gorunumu.
  try {
    wc.session.setPermissionRequestHandler((_wc, _izin, geri) => geri(false));
  } catch {
    /* oturum ayni: bir kez kurulmasi yeter */
  }
}

/**
 * Isaretlenen ogenin kirpigi. `alan` konuk sayfanin CSS pikseli (getBoundingClientRect); 8 px pay eklenir,
 * gorunur alana kirpilir. PNG ekran yakalamalariyla ayni dizine (7 gunde silinir).
 * @returns {Promise<{ yol: string, onizleme: string } | { hata: string }>}
 */
async function yakala(host, wcId, alan) {
  const { webContents } = require('electron');
  const wc = Number.isInteger(wcId) ? webContents.fromId(wcId) : null;
  if (!wc || wc.isDestroyed() || wc.getType() !== 'webview' || wc.hostWebContents !== host) return { hata: 'önizleme bulunamadı' };
  const s = (v) => (Number.isFinite(v) ? v : 0);
  const PAY = 8;
  const x = Math.max(0, Math.floor(s(alan?.x) - PAY));
  const y = Math.max(0, Math.floor(s(alan?.y) - PAY));
  const w = Math.max(1, Math.min(4000, Math.ceil(s(alan?.w) + PAY * 2)));
  const h = Math.max(1, Math.min(4000, Math.ceil(s(alan?.h) + PAY * 2)));
  try {
    const img = await wc.capturePage({ x, y, width: w, height: h });
    if (img.isEmpty()) return { hata: 'kırpık boş' };
    fs.mkdirSync(yakalaModulu.DIZIN, { recursive: true });
    const ad = 'yakala-isaret-' + new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19) + '.png';
    const yol = path.join(yakalaModulu.DIZIN, ad);
    fs.writeFileSync(yol, img.toPNG());
    const k = img.getSize().width > 360 ? img.resize({ width: 360, quality: 'good' }) : img;
    log('onizleme: oge kirpildi ' + JSON.stringify(img.getSize()) + ' -> ' + ad);
    return { yol, onizleme: k.toDataURL() };
  } catch (e) {
    return { hata: e.message };
  }
}

module.exports = { yerelAdres, konukKur, yakala };
