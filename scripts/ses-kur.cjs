// v3.1: Ada'nin sesi icin dosyalari kurar (`npm run ses:kur`). Kokpit'in deposuna girmez, ~/.kokpit/ses
// altina iner (KOKPIT_SES_DIZIN ile degisir). Var olani yeniden indirmez.
//   - whisper.cpp CUDA 12.4 derlemesi (ggml-org/whisper.cpp surumu; ~1,2 GB acilmis, CUDA kutuphaneleri icinde)
//   - large-v3-turbo q8_0 modeli (Hugging Face ggerganov/whisper.cpp, 874 MB)
//   - edge-tts (uv ile ayri bir venv; Turkce ses tr-TR-EmelNeural)
// Gereken: gh (oturum acik), curl, uv. NVIDIA surucusu CUDA 12.4'u desteklemeli (olculdu: 617.42).

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const ses = require('../electron/ses.cjs');

const WHISPER_SURUM = 'b5454';
const WHISPER_ZIP = 'whisper-bin-win-cuda-12.4.0-x64.zip';
const MODEL_URL = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo-q8_0.bin';

const calistir = (komut, argumanlar, ek = {}) => execFileSync(komut, argumanlar, { stdio: 'inherit', windowsHide: true, ...ek });
const varMi = (y) => fs.existsSync(y) && fs.statSync(y).size > 0;

fs.mkdirSync(ses.SES_DIZIN, { recursive: true });
console.log('ses dizini: ' + ses.SES_DIZIN);

if (varMi(ses.SUNUCU)) console.log('whisper sunucusu var');
else {
  console.log('whisper.cpp ' + WHISPER_SURUM + ' indiriliyor...');
  calistir('gh', ['release', 'download', WHISPER_SURUM, '-R', 'ggml-org/whisper.cpp', '-p', WHISPER_ZIP, '-D', ses.SES_DIZIN, '--clobber']);
  const zip = path.join(ses.SES_DIZIN, WHISPER_ZIP);
  calistir('powershell', ['-NoProfile', '-Command', `Expand-Archive -LiteralPath '${zip}' -DestinationPath '${path.join(ses.SES_DIZIN, 'bin')}' -Force`]);
  fs.rmSync(zip, { force: true });
}

if (varMi(ses.MODEL)) console.log('model var');
else {
  console.log('model indiriliyor (874 MB)...');
  fs.mkdirSync(path.dirname(ses.MODEL), { recursive: true });
  const gecici = ses.MODEL + '.indiriliyor';
  calistir('curl', ['-L', '--fail', '-o', gecici, MODEL_URL]);
  fs.renameSync(gecici, ses.MODEL);
}

if (varMi(ses.TTS)) console.log('edge-tts var');
else {
  console.log('edge-tts kuruluyor...');
  const venv = path.join(ses.SES_DIZIN, 'venv');
  calistir('uv', ['venv', venv, '--python', '3.12']);
  calistir('uv', ['pip', 'install', '--python', path.join(venv, 'Scripts', 'python.exe'), 'edge-tts']);
}

const d = ses.durum();
console.log('\nkonusma tanima: ' + (d.stt ? 'hazir' : 'EKSIK') + ' · ses: ' + (d.tts ? 'hazir' : 'EKSIK'));
console.log('Dogrulama: npm run test:ses (gercek GPU + edge-tts). Kokpit yeniden baslayinca Ctrl+Alt+Shift+Space.');
process.exit(d.stt && d.tts ? 0 : 1);
