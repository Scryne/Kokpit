// claude'u acan pwsh komutu ve Ada'dan gelen gorev metni (v2.6). pty-server bunu kullanir; saf
// modul oldugu icin scripts/test-ada.cjs ayni komutu gercek pwsh'ta (node-pty ile) sinar.
//
// Gorev metni komut satirina YAZILMAZ. Ortam degiskeniyle (KOKPIT_GOREV) gecer, pwsh onu tek arguman
// olarak verir: degiskenin icerigi yeniden ayristirilmaz (pwsh 7.6, PSNativeCommandArgumentPassing =
// Windows; tirnak, $, ;, & korunur). Degisken claude'dan once silinir, claude'un ve araclarinin
// ortamina sizmaz. Basta '-' olsaydi claude onu bayrak sanirdi: one bir bosluk eklenir.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SINIR = 4000;

/** Gorev metnini temizler: kontrol karakterleri (satir sonu ve sekme haric) atilir, sinirlanir. */
function gorevMetni(ham) {
  if (typeof ham !== 'string') return '';
  const m = ham.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').trim().slice(0, SINIR);
  return m.startsWith('-') ? ' ' + m : m;
}

/**
 * @param {{ devam: boolean, claudeId: string, ayarArgumani: string, gorev: string, ikili?: string }} s
 *   ikili: yalniz test (claude yerine argumanlari yazan bir program)
 */
function claudeKomutu({ devam, claudeId, ayarArgumani, gorev, ikili = 'claude' }) {
  const kimlik = UUID.test(claudeId || '') ? claudeId : '';
  const gorevli = !devam && !!gorev;
  return (
    (gorevli ? '$g = $env:KOKPIT_GOREV; Remove-Item Env:KOKPIT_GOREV; ' : '') +
    (devam
      ? kimlik
        ? ikili + ' --resume ' + kimlik
        : ikili + ' --continue'
      : kimlik
        ? ikili + ' --session-id ' + kimlik
        : ikili) +
    (ayarArgumani || '') +
    (gorevli ? ' $g' : '')
  );
}

module.exports = { gorevMetni, claudeKomutu, UUID };
