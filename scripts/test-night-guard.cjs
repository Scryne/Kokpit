/**
 * Gece bekcisi (scripts/night_guard.py) karar testi: --dry-run --once, gecici dizinde.
 * Calistir: npm run test:night-guard
 *
 * Kapsam: night.json yokken bekler, Kokpit "done" ya da tum sekmeler kapali ise kapatir, Kokpit
 * canliyken bosta sekme kapatmaz, Kokpit sustuysa transcript ICINDEKI zaman damgasina gore karar
 * verir (5 Eki gecesi: dosya mtime'i taze, olay eski -> kapatmali), iptal dosyasi kapatmayi durdurur.
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const BEKCI = path.join(__dirname, 'night_guard.py');
const sonuclar = [];
const kontrol = (ad, gecti) => { sonuclar.push([ad, gecti]); };

const dakika = 60 * 1000;
const iso = (ms) => new Date(ms).toISOString().replace(/\.\d+Z$/, '.000Z');

function calistir(kurulum) {
  const dizin = fs.mkdtempSync(path.join(os.tmpdir(), 'kokpit-gece-'));
  kurulum(dizin);
  const r = spawnSync('python', [BEKCI, '--dir', dizin, '--dry-run', '--once'], { encoding: 'utf8' });
  const gunluk = fs.existsSync(path.join(dizin, 'night-guard.log'))
    ? fs.readFileSync(path.join(dizin, 'night-guard.log'), 'utf8') : '';
  const kendi = fs.existsSync(path.join(dizin, 'night-guard.json'));
  fs.rmSync(dizin, { recursive: true, force: true });
  return { cikti: (r.stdout || '').trim(), hata: r.stderr, gunluk, kendi };
}

function transcript(dizin, ad, sonOlayMs) {
  const p = path.join(dizin, ad + '.jsonl');
  const satirlar = [
    { type: 'user', timestamp: iso(sonOlayMs - 5 * dakika) },
    { type: 'assistant', timestamp: iso(sonOlayMs) },
    { type: 'cost-state' }, // zaman damgasiz meta satiri: karara girmez
  ];
  fs.writeFileSync(p, satirlar.map((s) => JSON.stringify(s)).join('\n') + '\n');
  return p; // mtime = simdi (taze), olay = sonOlayMs
}

function gece(dizin, { kalpOnce = 0, done = false, sekmeler }) {
  const simdi = Date.now();
  fs.writeFileSync(path.join(dizin, 'night.json'), JSON.stringify({
    version: 1, heartbeat: simdi - kalpOnce, started: simdi - 300 * dakika, done, tabs: sekmeler,
  }));
}

const simdi = Date.now();

let s = calistir(() => {});
kontrol('night.json yokken bekler', s.cikti === 'waiting');
kontrol('bekci kendi kalp dosyasini yazar', s.kendi);

s = calistir((d) => gece(d, { done: true, sekmeler: [{ id: 'a', name: 'A', state: 'working' }] }));
kontrol('Kokpit done dediyse kapatir', s.cikti === 'shutdown' && /would run: shutdown \/s \/t 300/.test(s.gunluk));

s = calistir((d) => gece(d, { sekmeler: [{ id: 'a', name: 'A', state: 'closed' }, { id: 'b', name: 'B', state: 'closed' }] }));
kontrol('tum sekmeler kapaliysa kapatir', s.cikti === 'shutdown');

s = calistir((d) => gece(d, { sekmeler: [{ id: 'a', name: 'A', state: 'closed' }, { id: 'b', name: 'B', state: 'asked' }] }));
kontrol('bir sekme acikken bekler', s.cikti === 'waiting');

s = calistir((d) => gece(d, { kalpOnce: 1 * dakika, sekmeler: [
  { id: 'a', name: 'A', state: 'working', transcript: transcript(d, 'a', simdi - 180 * dakika) }] }));
kontrol('Kokpit canliyken bosta sekme yuzunden kapatmaz', s.cikti === 'waiting');

s = calistir((d) => gece(d, { kalpOnce: 20 * dakika, sekmeler: [
  { id: 'a', name: 'A', state: 'working', transcript: transcript(d, 'a', simdi - 90 * dakika) },
  { id: 'b', name: 'B', state: 'closed' }] }));
kontrol('Kokpit sustu + olay 90 dk once: kapatir (mtime taze olsa da)', s.cikti === 'shutdown');

s = calistir((d) => gece(d, { kalpOnce: 20 * dakika, sekmeler: [
  { id: 'a', name: 'A', state: 'working', transcript: transcript(d, 'a', simdi - 90 * dakika) },
  { id: 'b', name: 'B', state: 'working', transcript: transcript(d, 'b', simdi - 10 * dakika) }] }));
kontrol('Kokpit sustu ama bir sekme 10 dk once calisti: bekler', s.cikti === 'waiting');

s = calistir((d) => {
  gece(d, { sekmeler: [{ id: 'a', name: 'A', state: 'closed' }] });
  fs.writeFileSync(path.join(d, 'night-cancel'), '');
});
kontrol('iptal dosyasi kapatmayi durdurur', s.cikti === 'cancelled' && !/would run: shutdown \/s/.test(s.gunluk));

s = calistir((d) => fs.writeFileSync(path.join(d, 'night.json'), '{"yarim'));
kontrol('bozuk night.json kapatmaz', s.cikti === 'waiting');

// --- Kapatma dongusu (NIGHT_GUARD_FAST: saniyeler): ilk cagri, zorla tekrar, yeni gece -> geri al, iptal ---
async function dongu() {
  const { spawn } = require('child_process');
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'kokpit-gece-dongu-'));
  const log = () => (fs.existsSync(path.join(d, 'night-guard.log')) ? fs.readFileSync(path.join(d, 'night-guard.log'), 'utf8') : '');
  const bekle = async (re, ms = 8000) => {
    for (const t0 = Date.now(); Date.now() - t0 < ms; ) {
      if (re.test(log())) return true;
      await new Promise((r) => setTimeout(r, 100));
    }
    return false;
  };
  gece(d, { done: true, sekmeler: [{ id: 'a', name: 'A', state: 'closed' }] });
  const c = spawn('python', [BEKCI, '--dir', d, '--dry-run'], { env: { ...process.env, NIGHT_GUARD_FAST: '1' }, stdio: 'ignore' });
  const cikti = new Promise((r) => c.on('exit', r));
  kontrol('dongu: done -> kapatma cagrisi', await bekle(/would run: shutdown \/s \/t 300/));
  kontrol('dongu: makine ayakta kaldi -> zorla tekrar', await bekle(/would run: shutdown \/s \/f \/t 0/));
  gece(d, { sekmeler: [{ id: 'b', name: 'B', state: 'working' }] });
  kontrol('dongu: yeni gece basladi -> bekleyen kapatma geri alinir', await bekle(/night active again.*shutdown aborted/));
  const sonra = log().length;
  await new Promise((r) => setTimeout(r, 2500));
  kontrol('dongu: geri alindiktan sonra zorla kapatma yok', !/shutdown \/s \/f/.test(log().slice(sonra)));
  fs.writeFileSync(path.join(d, 'night-cancel'), '');
  const kod = await Promise.race([cikti, new Promise((r) => setTimeout(() => r('zaman asimi'), 5000))]);
  kontrol('dongu: iptal dosyasi -> bekci cikar', kod === 0);
  if (kod !== 0) c.kill();
  fs.rmSync(d, { recursive: true, force: true });

  // gate F2: Kokpit night.json'i sildiyse bekci onbellekteki kopyayla kapatmaz, cikar
  const d2 = fs.mkdtempSync(path.join(os.tmpdir(), 'kokpit-gece-sil-'));
  gece(d2, { sekmeler: [{ id: 'a', name: 'A', state: 'working' }] });
  const c2 = spawn('python', [BEKCI, '--dir', d2, '--dry-run'], { env: { ...process.env, NIGHT_GUARD_FAST: '1' }, stdio: 'ignore' });
  const cikti2 = new Promise((r) => c2.on('exit', r));
  await new Promise((r) => setTimeout(r, 1500));
  fs.rmSync(path.join(d2, 'night.json'));
  const kod2 = await Promise.race([cikti2, new Promise((r) => setTimeout(() => r('zaman asimi'), 5000))]);
  const g2 = fs.readFileSync(path.join(d2, 'night-guard.log'), 'utf8');
  kontrol('F2: night.json silindi -> bekci kapatmadan cikar', kod2 === 0 && /night.json removed/.test(g2) && !/would run: shutdown \/s/.test(g2));
  if (kod2 !== 0) c2.kill();
  fs.rmSync(d2, { recursive: true, force: true });
}

dongu().then(() => {
  let gecen = 0;
  for (const [ad, ok] of sonuclar) {
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${ad}`);
    if (ok) gecen++;
  }
  console.log(`\n${gecen}/${sonuclar.length} gecti`);
  process.exit(gecen === sonuclar.length ? 0 : 1);
});
