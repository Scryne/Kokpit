const path = require('path');
const os = require('os');
const { DEV_PORT } = require('../kokpit.config.cjs');

// KURAL: Windows yollari path.resolve/join ile uretilir, string literal olarak yazilmaz.
// Spike'ta ters boludan kaynakli CreateProcess "error 267" tuzagi yasandi.
const home = os.homedir();

const VAULT = process.env.KOKPIT_VAULT
  ? path.resolve(process.env.KOKPIT_VAULT)
  : path.join(home, 'Documents', 'ScryneOS');

/**
 * Kokpit'in kendi verisi (ayarlar, oturum defteri, komutlar, tarifler, kanca ayarlari, log).
 * Varsayilan ~/.kokpit. KOKPIT_DIZIN yalniz test/ekran kosuculari icindir: gercek Kokpit
 * aciksa ayni dizini paylasan ikinci ornek onun acik oturumlarini "onceki calismadan kalan"
 * sanip deftere sahte "kapandi" yaziyordu ve kosucunun sondaki geri yuklemesi gercek ornegin
 * o arada yazdigi satirlari ezebiliyordu (2026-10-04'te oldu, satir elle geri alindi).
 * PTY sunucusu ortami miras aldigi icin ayni degiskeni okur.
 */
const KOKPIT_DIZIN = process.env.KOKPIT_DIZIN
  ? path.resolve(process.env.KOKPIT_DIZIN)
  : path.join(home, '.kokpit');

module.exports = {
  VAULT,
  KOKPIT_DIZIN,
  DURUM_SCRIPT: path.join(VAULT, '.claude', 'scripts', 'durum.py'),
  PYTHON: process.env.KOKPIT_PYTHON || 'python',
  DEV_PORT,
  DEV_URL: 'http://localhost:' + DEV_PORT,
  LOG_DOSYA: path.join(KOKPIT_DIZIN, 'kokpit.log'),
};
