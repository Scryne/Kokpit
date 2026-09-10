const path = require('path');
const os = require('os');

// KURAL: Windows yollari path.resolve/join ile uretilir, string literal olarak yazilmaz.
// Spike'ta ters boludan kaynakli CreateProcess "error 267" tuzagi yasandi.
const home = os.homedir();

const VAULT = process.env.KOKPIT_VAULT
  ? path.resolve(process.env.KOKPIT_VAULT)
  : path.join(home, 'Documents', 'ScryneOS');

module.exports = {
  VAULT,
  DURUM_SCRIPT: path.join(VAULT, '.claude', 'scripts', 'durum.py'),
  PYTHON: process.env.KOKPIT_PYTHON || 'python',
  DEV_URL: 'http://localhost:5173',
  LOG_DOSYA: path.join(home, '.kokpit', 'kokpit.log'),
};
