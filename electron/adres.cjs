// Sunucu ciktisindan yerel adres. SAF modul (bagimlilik yok): pty-server.cjs servis
// bolmesinin akisinda kullanir, scripts/test-kanca.cjs dogrudan sinar.
//
// Vite "Local:   http://localhost:5173/", Next "- Local: http://localhost:3000", uvicorn
// "running on http://127.0.0.1:8000". 0.0.0.0 tarayicida acilmaz, localhost'a cevrilir.
// ANSI renkleri once soyulur: Vite port oncesine renk kodu koyuyor (Faz 1'deki sessiz hata,
// duz eslesme hic tutmuyordu).
function adresBul(metin) {
  const duz = String(metin).replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '');
  const m = /https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1?\]):\d{2,5}(?:\/[^\s'"<>)\]]*)?/i.exec(duz);
  if (!m) return null;
  return m[0].replace('0.0.0.0', 'localhost').replace(/[.,;]+$/, '');
}

module.exports = { adresBul };
