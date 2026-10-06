// Ada'nin yatay yeri (v2.7): saf hesap, Electron'suz (test:ada sinar). Ada ust kenarda durur; Scryne
// hapi kenar boyunca surukleyebilir. Yer, calisma alani genisliginin orani olarak saklanir: cozunurluk
// ya da olcek degisince Ada ayni goreli yerde kalir.

/** Merkeze bu kadar (px) yaklasan surukleme tam ortaya oturur. */
const MIKNATIS_PX = 28;

/**
 * Merkez orani -> pencerenin sol kenari, calisma alanina sigdirilmis.
 * @param {{ x: number, width: number }} alan
 * @param {number} genislik pencere genisligi
 * @param {number | null | undefined} oran 0..1; gecersizse orta
 */
function yatayKonum(alan, genislik, oran) {
  const o = typeof oran === 'number' && Number.isFinite(oran) ? Math.max(0, Math.min(1, oran)) : 0.5;
  const x = Math.round(alan.x + alan.width * o - genislik / 2);
  return Math.max(alan.x, Math.min(alan.x + alan.width - genislik, x));
}

/** Surukleme: baslangic x'i + imlecin yolu, sinirlanmis; merkeze MIKNATIS_PX'ten yakinsa tam orta. */
function surukluKonum(alan, genislik, x0, dx) {
  const orta = yatayKonum(alan, genislik, 0.5);
  const x = Math.max(alan.x, Math.min(alan.x + alan.width - genislik, Math.round(x0 + dx)));
  return Math.abs(x - orta) <= MIKNATIS_PX ? orta : x;
}

/** Pencerenin x'i -> merkez orani. Tam ortadaysa tam 0.5 (yuvarlama "ortada mi" sorusunu bozmasin). */
function oranBul(alan, genislik, x) {
  if (x === yatayKonum(alan, genislik, 0.5)) return 0.5;
  return Math.round(((x + genislik / 2 - alan.x) / alan.width) * 10000) / 10000;
}

module.exports = { yatayKonum, surukluKonum, oranBul, MIKNATIS_PX };
