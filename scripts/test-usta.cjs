// npm run test:usta — Usta (OpenCode Go iscisi) uctan uca, gercek API'ye gitmeden.
// 1) electron/usta-ayar.cjs: anahtar DPAPI ile iner, renderer gorunumune ve diske duz metin girmez,
//    sahte anahtar gercek uc tarafindan reddedilir (ag: /v1/models, token harcamaz), dogrulama kurallari.
// 2) scripts/usta.py + sahte isci (scripts/sahte-usta.cjs): worktree yalitimi, ortam (anahtar Bearer,
//    gercek ANTHROPIC_API_KEY ve ebeveyn oturum izi silinmis, hook'lar kapali), kabul komutu, sizinti
//    temizligi, devam turu (--resume), al (ana agaca commit'siz), birak, junction guvenligi, --kirli.
// Gercek ~/.kokpit'e dokunmaz: KOKPIT_DIZIN gecici dizin.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const KOK = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'kokpit-usta-')));
process.env.KOKPIT_DIZIN = path.join(KOK, 'kokpit');
const ustaAyar = require('../electron/usta-ayar.cjs');
const dpapi = require('../electron/dpapi.cjs');

const USTA = path.join(__dirname, 'usta.py');
const SAHTE = path.join(__dirname, 'sahte-usta.cjs');
const KAYIT = path.join(KOK, 'sahte-kayit.json');
const ANAHTAR = 'sk-test-usta-' + Math.random().toString(36).slice(2) + '-ğüş';
const EBEVEYN_ANAHTARI = ['ebeveyn', 'ortami', 'sizmamali'].join('-');

let basarisiz = 0;
function kontrol(ad, kosul, ek) {
  if (kosul) console.log('  ok   ' + ad);
  else {
    basarisiz += 1;
    console.log('  HATA ' + ad + (ek ? '\n       ' + String(ek).slice(0, 600).replace(/\n/g, '\n       ') : ''));
  }
}
const ayni = (a, b) => path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();

function git(cwd, ...args) {
  const r = spawnSync('git', ['-c', 'user.name=test', '-c', 'user.email=test@localhost', ...args], { cwd, encoding: 'utf8' });
  if (r.status !== 0) throw new Error('git ' + args.join(' ') + ': ' + r.stderr);
  return r.stdout;
}

function usta(args, ekEnv = {}) {
  const r = spawnSync('python', ['-I', USTA, ...args], {
    encoding: 'utf8',
    env: {
      ...process.env,
      KOKPIT_DIZIN: process.env.KOKPIT_DIZIN,
      USTA_CLAUDE: SAHTE,
      SAHTE_KAYIT: KAYIT,
      SAHTE_BEKLENEN: ANAHTAR,
      // Ebeveyn ortamdaki Anthropic anahtarini taklit eder; isciye gecmemeli.
      ANTHROPIC_API_KEY: EBEVEYN_ANAHTARI,
      CLAUDECODE: '1',
      ...ekEnv,
    },
  });
  return { kod: r.status, cikti: (r.stdout || '') + (r.stderr || '') };
}

const sonKayit = () => JSON.parse(fs.readFileSync(KAYIT, 'utf8')).at(-1);
const isId = (cikti) => (cikti.match(/is=(\S+)/) || [])[1];

function depoKur(ad) {
  const d = path.join(KOK, ad);
  fs.mkdirSync(d, { recursive: true });
  git(d, 'init', '-q', '-b', 'main');
  fs.writeFileSync(path.join(d, 'a.txt'), 'ilk satir\n');
  fs.writeFileSync(path.join(d, 'kontrol.cjs'), "process.exit(require('fs').readFileSync('a.txt','utf8').includes('usta ekledi') ? 0 : 1)\n");
  fs.writeFileSync(path.join(d, '.gitignore'), 'node_modules/\n.venv/\n');
  git(d, 'add', '-A');
  git(d, 'commit', '-q', '-m', 'ilk');
  return d;
}

async function main() {
  console.log('usta-ayar.cjs');
  let g = ustaAyar.gorunum();
  kontrol('varsayilan: anahtar yok, OpenCode Go Anthropic ucu', !g.anahtarVar && g.baseUrl === 'https://opencode.ai/inference/go/anthropic' && g.varsayilanUrl);

  // Gercek uc: sahte anahtar 401 -> kaydedilmez.
  let s = await ustaAyar.anahtarKaydet('sk-kesinlikle-gecersiz-123');
  kontrol('sahte anahtar gercek uc tarafindan reddedilir, kaydedilmez', !s.ok && !s.gorunum.anahtarVar && /reddetti/.test(s.hata || ''), JSON.stringify(s));
  kontrol('bosluklu anahtar reddedilir', !(await ustaAyar.anahtarKaydet('ab cd')).ok);

  // Model listesi (anahtarsiz, token harcamaz).
  s = await ustaAyar.modelleriYenile();
  kontrol('model listesi gercek uctan gelir, glm-5.3 ve deepseek-v4.1-flash icinde', s.ok && s.gorunum.modeller.some((m) => m.id === 'glm-5.3') && s.gorunum.modeller.some((m) => m.id === 'deepseek-v4.1-flash'), s.hata);

  // Ulasilamayan uc: anahtar kaydedilir, durum "ulasilamadi". (Gecerli anahtar olmadan kayit yolunu boyle sinariz.)
  kontrol('http uc reddedilir', !ustaAyar.ayarKaydet({ baseUrl: 'http://ornek.com' }).ok);
  kontrol('gecersiz model adi reddedilir', !ustaAyar.ayarKaydet({ model: 'glm 5.3; rm' }).ok);
  kontrol('uc degisince model listesi sifirlanir', ustaAyar.ayarKaydet({ baseUrl: 'https://127.0.0.1:9/yok' }).gorunum.modeller.length === 0);
  s = await ustaAyar.anahtarKaydet(ANAHTAR);
  kontrol('ulasilamayan ucta anahtar kaydedilir, durum ulasilamadi', s.ok && s.gorunum.anahtarVar && s.gorunum.dogrulama?.durum === 'ulasilamadi', JSON.stringify(s));
  kontrol('gorunumde yalniz son dort karakter', s.gorunum.ipucu === ANAHTAR.slice(-4));
  const disk = fs.readFileSync(ustaAyar.DOSYA, 'utf8');
  kontrol('diskte duz metin anahtar yok', !disk.includes(ANAHTAR) && !disk.includes(ANAHTAR.slice(0, 12)));
  kontrol('DPAPI bloku cozulur, ayni anahtar', dpapi.coz(JSON.parse(disk).anahtar.dpapi) === ANAHTAR);
  const tumDonusler = JSON.stringify([s, ustaAyar.gorunum(), ustaAyar.ayarKaydet({ model: 'glm-5.3' }), await ustaAyar.anahtarSina()]);
  kontrol('hicbir IPC donusunde anahtar yok', !tumDonusler.includes(ANAHTAR) && !tumDonusler.includes('dpapi'));
  ustaAyar.ayarKaydet({ baseUrl: '' }); // varsayilan uc
  kontrol('bos uc varsayilana doner', ustaAyar.gorunum().varsayilanUrl);
  await ustaAyar.modelleriYenile();

  console.log('usta.py (sahte isci)');
  const depo = depoKur('depo1');
  const brif = path.join(KOK, 'brif.md');
  fs.writeFileSync(brif, '# a.txt satir ekle\n\nHedef: a.txt sonuna satir ekle.\n');

  let r = usta(['ver', '--proje', depo, '--brif', brif, '--model', 'bilinmeyen-model-x']);
  kontrol('listede olmayan model reddedilir (cikis 4)', r.kod === 4, r.cikti);

  r = usta(['ver', '--proje', depo, '--brif', brif, '--kabul', 'node kontrol.cjs']);
  const id1 = isId(r.cikti);
  let k = sonKayit();
  kontrol('ver: cikis 0, kabul GECTI', r.kod === 0 && /kabul \[GECTI\] node kontrol\.cjs/.test(r.cikti), r.cikti);
  kontrol('isci worktree\'de calisti, ana depoda degil', ayni(k.cwd, path.join(process.env.KOKPIT_DIZIN, 'usta', 'agac', id1)), k.cwd);
  kontrol('ana depo temiz kaldi', git(depo, 'status', '--porcelain').trim() === '');
  kontrol('anahtar Bearer olarak geldi, uc OpenCode', k.env.tokenDogru && k.env.baseUrl === 'https://opencode.ai/inference/go/anthropic');
  kontrol('gercek ANTHROPIC_API_KEY ve CLAUDECODE cocuga gecmedi', k.env.apiKey === null && k.env.claudecode === null);
  kontrol('model ve hafif model ayardan', k.model === 'glm-5.3' && k.env.haiku === 'deepseek-v4.1-flash');
  kontrol('hook\'lar kapali, commit/push yasak', k.ayarlar?.disableAllHooks === true && k.ayarlar.permissions.deny.includes('Bash(git commit*)') && k.ayarlar.permissions.deny.includes('Bash(git push*)'));
  kontrol('kabul komutu isciye izinli', k.args.includes('Bash(node kontrol.cjs*)'));
  kontrol('brif stdin\'den geldi', k.girdi.includes('a.txt sonuna satir ekle'));
  kontrol('usta.py ciktisinda anahtar yok', !r.cikti.includes(ANAHTAR));
  const turDosya = fs.readFileSync(path.join(process.env.KOKPIT_DIZIN, 'usta', 'is', id1, 'tur1.json'), 'utf8');
  kontrol('isci ciktisina sizan anahtar [gizli] ile silindi', !turDosya.includes(ANAHTAR) && turDosya.includes('[gizli]'));
  kontrol('degisiklik ozeti: 1 dosya +1', /degisiklik: 1 dosya, \+1 -0/.test(r.cikti), r.cikti);

  r = usta(['diff', id1]);
  kontrol('diff: isci satiri gorunur', r.kod === 0 && r.cikti.includes('+usta ekledi: tur1'), r.cikti);

  const not = path.join(KOK, 'not.md');
  fs.writeFileSync(not, 'Bir satir daha ekle.\n');
  r = usta(['devam', id1, '--not', not]);
  k = sonKayit();
  kontrol('devam: ayni oturum --resume ile, tur=2', r.kod === 0 && k.resume === 'sahte-oturum-1' && /tur=2/.test(r.cikti), r.cikti);

  r = usta(['al', id1]);
  const icerik = fs.readFileSync(path.join(depo, 'a.txt'), 'utf8');
  kontrol('al: iki tur ana agaca commit\'siz indi', r.kod === 0 && icerik.includes('tur1') && icerik.includes('tur2') && git(depo, 'status', '--porcelain').includes('a.txt'), r.cikti);
  kontrol('al: worktree ve usta dali kaldirildi', !fs.existsSync(path.join(process.env.KOKPIT_DIZIN, 'usta', 'agac', id1)) && !git(depo, 'branch', '--list', 'usta/*').trim());
  kontrol('al: commit atilmadi', git(depo, 'rev-list', '--count', 'HEAD').trim() === '1');

  // Junction guvenligi + birak + kabul kaldi.
  const depo2 = depoKur('depo2');
  fs.mkdirSync(path.join(depo2, 'node_modules'));
  fs.writeFileSync(path.join(depo2, 'node_modules', 'x.txt'), 'kurulu paket');
  r = usta(['ver', '--proje', depo2, '--brif', brif, '--kabul', 'node -e "process.exit(3)"']);
  const id2 = isId(r.cikti);
  k = sonKayit();
  kontrol('kabul kalinca cikis 1, KALDI', r.kod === 1 && /kabul \[KALDI\]/.test(r.cikti), r.cikti);
  kontrol('node_modules worktree\'ye junction ile baglandi', k.nodeModulesVar);
  kontrol('junction farka girmedi', !/node_modules/.test(usta(['diff', id2, '--stat']).cikti));
  r = usta(['birak', id2, '--neden', 'test']);
  kontrol('birak: worktree kalkti', r.kod === 0 && !fs.existsSync(path.join(process.env.KOKPIT_DIZIN, 'usta', 'agac', id2)), r.cikti);
  kontrol('birak: ana depodaki node_modules SAGLAM (junction hedefi silinmedi)', fs.existsSync(path.join(depo2, 'node_modules', 'x.txt')));
  kontrol('birak: ana depo degismedi', git(depo2, 'status', '--porcelain').trim() === '');

  // --kirli: orkestratorun commit'lenmemis isi isciye tasinir, al yalniz iscinin farkini uygular.
  const depo3 = depoKur('depo3');
  fs.writeFileSync(path.join(depo3, 'kirli.txt'), 'opus yarim birakti\n');
  fs.appendFileSync(path.join(depo3, 'a.txt'), 'opus satiri\n');
  r = usta(['ver', '--proje', depo3, '--brif', brif]);
  kontrol('kirli agacta --kirli yoksa uyarir', /UYARI: ana agacta commit'lenmemis/.test(r.cikti));
  usta(['birak', isId(r.cikti)]);
  r = usta(['ver', '--proje', depo3, '--brif', brif, '--kirli', '--kabul', 'node kontrol.cjs']);
  const id3 = isId(r.cikti);
  k = sonKayit();
  kontrol('--kirli: isci izlenmeyen dosyayi gordu', k.kirliGorundu === 'opus yarim birakti\n', JSON.stringify(k.kirliGorundu));
  kontrol('--kirli: degisiklik yalniz iscinin satiri', /degisiklik: 1 dosya, \+1 -0/.test(r.cikti), r.cikti);
  r = usta(['al', id3, '--duzeltildi']);
  // autocrlf acik makinede git apply calisma dosyasini CRLF yazar; icerik karsilastirmasi satir sonundan bagimsiz.
  const a3 = fs.readFileSync(path.join(depo3, 'a.txt'), 'utf8').replace(/\r\n/g, '\n');
  kontrol('--kirli al: opus satiri + isci satiri, cift uygulama yok', r.kod === 0 && a3 === 'ilk satir\nopus satiri\nusta ekledi: tur1\n', JSON.stringify(a3) + '\n' + r.cikti);

  // Gunluk (Kokpit'in okudugu).
  const gunluk = ustaAyar.isler();
  const bul = (id) => gunluk.isler.find((i) => i.id === id);
  kontrol('gunluk: kararlar dogru', bul(id1)?.karar === 'kabul' && bul(id2)?.karar === 'ret' && bul(id3)?.karar === 'duzeltip-kabul');
  kontrol('gunluk: model ozeti', gunluk.ozet.some((o) => o.model === 'glm-5.3' && o.kabul === 1 && o.ret >= 1 && o.duzeltip === 1));
  kontrol('gunluk: tur ve token', bul(id1)?.tur === 2 && bul(id1)?.ciktiToken === 680);
  r = usta(['liste']);
  kontrol('liste calisir', r.kod === 0 && r.cikti.includes(id1));
  r = usta(['ayar']);
  kontrol('ayar: anahtar yazilmaz', r.kod === 0 && /anahtar=var/.test(r.cikti) && !r.cikti.includes(ANAHTAR));

  ustaAyar.anahtarSil();
  r = usta(['ver', '--proje', depo, '--brif', brif]);
  kontrol('anahtarsiz ver: cikis 2, worktree acilmaz', r.kod === 2 && git(depo, 'worktree', 'list').trim().split('\n').length === 1, r.cikti);
}

main()
  .catch((e) => {
    basarisiz += 1;
    console.error(e);
  })
  .finally(() => {
    try {
      fs.rmSync(KOK, { recursive: true, force: true });
    } catch {
      /* gecici dizin */
    }
    console.log(basarisiz ? `\n${basarisiz} kontrol BASARISIZ` : '\ntum kontroller gecti');
    process.exit(basarisiz ? 1 : 0);
  });
