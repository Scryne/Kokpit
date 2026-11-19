// test:usta icin sahte isci: gercek `claude -p` yerine usta.py'nin baslattigi surec. API'ye gitmez.
// Gordugu ortami ve argumanlari SAHTE_KAYIT dosyasina yazar (test bunlari denetler), cwd'deki a.txt'ye
// bir satir ekler, anahtari bilerek ciktiya sizdirir (usta.py silmeli) ve claude -p json bicimini taklit eder.
const fs = require('fs');
const path = require('path');

let girdi = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (p) => (girdi += p));
process.stdin.on('end', () => {
  const args = process.argv.slice(2);
  const ayarIdx = args.indexOf('--settings');
  const kayit = {
    cwd: process.cwd(),
    args,
    girdi,
    ayarlar: ayarIdx >= 0 ? JSON.parse(args[ayarIdx + 1]) : null,
    model: args[args.indexOf('--model') + 1],
    resume: args.includes('--resume') ? args[args.indexOf('--resume') + 1] : null,
    env: {
      baseUrl: process.env.ANTHROPIC_BASE_URL || null,
      tokenDogru: process.env.ANTHROPIC_AUTH_TOKEN === process.env.SAHTE_BEKLENEN,
      apiKey: process.env.ANTHROPIC_API_KEY || null,
      claudecode: process.env.CLAUDECODE || null,
      haiku: process.env.ANTHROPIC_DEFAULT_HAIKU_MODEL || null,
      usta: process.env.USTA || null,
    },
    kirliGorundu: fs.existsSync('kirli.txt') ? fs.readFileSync('kirli.txt', 'utf8') : null,
    nodeModulesVar: fs.existsSync(path.join('node_modules', 'x.txt')),
  };
  const kayitlar = fs.existsSync(process.env.SAHTE_KAYIT) ? JSON.parse(fs.readFileSync(process.env.SAHTE_KAYIT, 'utf8')) : [];
  kayitlar.push(kayit);
  fs.writeFileSync(process.env.SAHTE_KAYIT, JSON.stringify(kayitlar, null, 2));

  if (process.env.SAHTE_DAVRANIS !== 'bos') fs.appendFileSync('a.txt', 'usta ekledi: ' + (kayit.resume ? 'tur2' : 'tur1') + '\n');
  process.stdout.write(
    JSON.stringify({
      type: 'result',
      is_error: false,
      num_turns: 3,
      result: 'a.txt guncellendi. sizinti denemesi: ' + process.env.ANTHROPIC_AUTH_TOKEN,
      session_id: 'sahte-oturum-1',
      usage: { input_tokens: 1200, output_tokens: 340, cache_read_input_tokens: 800 },
    }),
  );
});
