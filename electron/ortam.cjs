// Kokpit'in actigi her claude (PTY terminali, v3.3 Aria) tepe seviye bir oturum gibi davranir: Kokpit bir
// claude oturumunun icinden baslatildiysa (npm start bir claude kabugundan) bu isaretler miras kalir ve
// claude "Transcript saving is off - inherited CLAUDE_CODE_CHILD_SESSION marker" der (olculdu). Transcript
// yazilmazsa ikinci beyin o oturumu gormez. Ayrintili gerekce pty-server.cjs'te.
const TEMIZLENECEK = [
  'CLAUDECODE',
  'CLAUDE_CODE_CHILD_SESSION',
  'CLAUDE_CODE_SESSION_ID',
  'CLAUDE_CODE_BRIDGE_SESSION_ID',
  'CLAUDE_CODE_MESSAGING_SOCKET',
  'CLAUDE_CODE_MESSAGING_TOKEN',
  'CLAUDE_CODE_ENTRYPOINT',
  'CLAUDE_PID',
  'CLAUDE_EFFORT',
];

/** process.env'in isaretsiz kopyasi + silinen anahtarlar. */
function temizOrtam(kaynak = process.env) {
  const ortam = { ...kaynak };
  const silinen = [];
  for (const anahtar of TEMIZLENECEK) {
    if (anahtar in ortam) {
      delete ortam[anahtar];
      silinen.push(anahtar);
    }
  }
  return { ortam, silinen };
}

module.exports = { TEMIZLENECEK, temizOrtam };
