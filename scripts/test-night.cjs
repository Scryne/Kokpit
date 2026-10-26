/**
 * Gece gorevi durum makinesi testi (electron/night.cjs), sahte saatle; sonunda night.json
 * sozlesmesi: Kokpit'in yazicisi gecici KOKPIT_DIZIN'e yazar, gercek bekci (--dry-run --once) okur.
 * Calistir: npm run test:night
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const GECICI = fs.mkdtempSync(path.join(os.tmpdir(), 'kokpit-night-'));
process.env.KOKPIT_DIZIN = GECICI;

const KOK = path.join(__dirname, '..');
const night = require(path.join(KOK, 'electron', 'night.cjs'));
const { writeNightFile } = require(path.join(KOK, 'electron', 'night-host.cjs'));
const { gonderIstegi } = require(path.join(KOK, 'electron', 'gonder-istegi.cjs'));

let gecen = 0;
let kalan = 0;
function kontrol(ad, kosul, ayrinti) {
  if (kosul) {
    gecen++;
    console.log('PASS ' + ad);
  } else {
    kalan++;
    console.log('FAIL ' + ad + (ayrinti !== undefined ? '  -> ' + JSON.stringify(ayrinti) : ''));
  }
}

const SN = 1000;
const DK = 60 * SN;
let saat = 1_000_000;
let s = night.initial();
let eylemler = [];
function olay(ev, ileri = 0) {
  saat += ileri;
  const r = night.step(s, ev, saat);
  s = r.state;
  eylemler = r.actions;
  return r.actions;
}
const tur = (id, status, ek = {}, ileri = 0) => olay({ type: 'hook', id, status, subagents: 0, ...ek }, ileri);
const tip = (a) => a.map((x) => x.type).join(',');
const durum = (id) => s.tabs[id]?.state;

// --- Metinler gonder-istegi denetiminden gecer ---
for (const [ad, metin] of Object.entries(night.TEXT)) {
  const r = gonderIstegi({ id: 'a', tur: 'metin', metin });
  kontrol('metin tek satir ve gecerli: ' + ad, r && r.metin === metin && !/\n/.test(metin) && metin.length <= 2000);
}

// --- Isaret ayrismasi ---
kontrol('isaret: son satir BITTI', night.parseMarker('ozet\nGECE: BITTI') === 'BITTI');
kontrol('isaret: kucuk harf', night.parseMarker('tamam\ngece: bitti') === 'BITTI');
kontrol('isaret: noktali BİTTİ', night.parseMarker('GECE: BİTTİ') === 'BITTI');
kontrol('isaret: son isaret kazanir (DEVAM sonra)', night.parseMarker('GECE: BITTI dedim ama\nGECE: DEVAM') === 'DEVAM');
kontrol('isaret: son isaret kazanir (BITTI sonra)', night.parseMarker('GECE: DEVAM\nsonra\nGECE: BITTI') === 'BITTI');
kontrol('isaret: son satirda degil ama son isaretli satir karar verir', night.parseMarker('GECE: BITTI\n\nNotlar yazildi.') === 'BITTI');
kontrol('isaret: kalin yazi icinde', night.parseMarker('**GECE: BITTI**') === 'BITTI');
kontrol('isaret: yok -> null', night.parseMarker('Bitti sanirim') === null && night.parseMarker(null) === null);

// --- Isaret, baslangic ---
let a = olay({ type: 'mark', id: 'a', name: 'Uyanbi', claude: '11111111-1111-1111-1111-111111111111' });
kontrol('ilk isaret start eylemi uretir', tip(a) === 'start' && durum('a') === 'working' && s.started === saat);
a = olay({ type: 'mark', id: 'b', name: 'Senkro' });
kontrol('ikinci isaret start uretmez', a.length === 0 && durum('b') === 'working');

// --- Sor: sessizlik, alt ajan, aralik ---
tur('a', 'calisiyor', { transcript: 'C:\\t\\a.jsonl' });
tur('a', 'bitti', { stop: true, message: 'is bitti' }, 5 * SN);
kontrol('Stop sorulmamis sekmede durumu degistirmez', durum('a') === 'working');
kontrol('transcript yolu tutulur', s.tabs.a.transcript === 'C:\\t\\a.jsonl');
a = olay({ type: 'tick' }, 30 * SN);
kontrol('60 sn dolmadan sorulmaz', a.length === 0);
tur('a', 'bitti', { subagents: 1 }, 1 * SN);
a = olay({ type: 'tick' }, 2 * DK);
kontrol('canli alt ajan varken sorulmaz', a.length === 0 && durum('a') === 'working');
tur('a', 'bitti', { subagents: 0 }, 1 * SN);
a = olay({ type: 'tick' }, 59 * SN);
kontrol('alt ajan bittikten sonra da 60 sn sessizlik beklenir', a.length === 0);
a = olay({ type: 'tick' }, 2 * SN);
kontrol('bitti + alt ajan yok + 60 sn sessiz -> ask', tip(a) === 'ask' && a[0].id === 'a' && a[0].text === night.TEXT.question && durum('a') === 'asked');
const ilkSoru = saat;

// --- asked: DEVAM / isaretsiz -> working, aralik ---
tur('a', 'calisiyor', {}, 5 * SN);
tur('a', 'bitti', { stop: true, message: 'Hala suruyor.\nGECE: DEVAM' }, 2 * DK);
kontrol('DEVAM -> working', durum('a') === 'working');
a = olay({ type: 'tick' }, 2 * DK);
kontrol('son sorudan 10 dk gecmeden yeniden sorulmaz', a.length === 0 && saat - ilkSoru < night.ASK_INTERVAL_MS);
saat = ilkSoru + night.ASK_INTERVAL_MS - 1;
a = olay({ type: 'tick' });
kontrol('10 dk siniri: bir ms eksik', a.length === 0);
a = olay({ type: 'tick' }, 1);
kontrol('10 dk sonra yeniden ask', tip(a) === 'ask' && durum('a') === 'asked');
tur('a', 'calisiyor', {}, 5 * SN);
tur('a', 'bitti', { stop: true, message: 'Bir sey yazmadim' }, 1 * DK);
kontrol('isaretsiz cevap -> working', durum('a') === 'working');

// --- asked: BITTI -> confirmed + close; SessionEnd -> closed ---
olay({ type: 'tick' }, night.ASK_INTERVAL_MS);
kontrol('ucuncu soru', durum('a') === 'asked');
tur('a', 'calisiyor', {}, 5 * SN);
a = tur('a', 'bitti', { stop: true, message: 'Last-Session yazildi.\nGECE: BITTI' }, 1 * DK);
kontrol('BITTI -> confirmed + close', tip(a) === 'close' && a[0].id === 'a' && durum('a') === 'confirmed');
tur('b', 'calisiyor', {}, 1 * SN); // b uzun bir turda (180 dk'dan once dokunulmaz)
a = olay({ type: 'tick' }, night.IDLE_CLOSE_MS);
kontrol('confirmed sekmeye tick bir sey yapmaz', a.length === 0);
a = tur('a', 'kapandi', {}, 10 * SN);
kontrol('confirmed + SessionEnd -> closed, b acikken done yok', durum('a') === 'closed' && a.length === 0 && !s.done);

// --- SessionEnd confirmed olmadan (ornegin /clear) kapatmaz ---
tur('b', 'kapandi', {}, 1 * SN);
kontrol('onaysiz SessionEnd (/clear) closed saymaz', durum('b') === 'working');

// --- bekliyor: durt, 20 dk'da en fazla bir ---
tur('b', 'bekliyor', {}, 1 * SN);
a = olay({ type: 'tick' }, night.WAITING_MS - 1);
kontrol('bekliyor 20 dk dolmadan durtulmez', a.length === 0);
a = olay({ type: 'tick' }, 1);
kontrol('bekliyor 20 dk -> nudge', tip(a) === 'nudge' && a[0].text === night.TEXT.nudge);
tur('b', 'bekliyor', {}, 1 * SN); // ayni bekleyisin bildirimi
a = olay({ type: 'tick' }, 5 * DK);
kontrol('nudge kisitli: 20 dk icinde ikincisi yok', a.length === 0);
a = olay({ type: 'tick' }, night.WAITING_MS);
kontrol('20 dk sonra ikinci nudge', tip(a) === 'nudge');

// --- denetim B1: izin onaylaninca etkinlik tur boyu 'bekliyor' kalir; olay gelirken durtulmez ---
for (let i = 0; i < 30; i++) {
  tur('b', 'bekliyor', {}, 1 * DK); // calisan ajanin araclari: her dakika olay
  a = olay({ type: 'tick' });
  if (a.length) break;
}
kontrol('B1: bekliyor ama her dakika olay -> 30 dk boyunca nudge yok', a.length === 0);

// --- soru teslim edilmediyse (ardindan olay yok) 2 dk sonra yeniden sorulur ---
tur('b', 'bitti', { stop: true, message: 'bekleyisten cikti' }, 1 * SN);
olay({ type: 'tick' }, night.QUIET_MS);
kontrol('b soruldu', durum('b') === 'asked');
a = olay({ type: 'tick' }, night.DELIVERY_MS);
kontrol('teslim edilmeyen soru 2 dk sonra yeniden', tip(a) === 'ask' && durum('b') === 'asked');

// --- denetim B2: soru teslim edildi, ajan calisiyor; alt ajan varken ve 180 dk'dan once kapatilmaz ---
for (let i = 0; i < 20; i++) {
  tur('b', 'calisiyor', { subagents: 1 }, 10 * DK); // alt ajan calisiyor: araclari her 10 dk olay uretir
  a = olay({ type: 'tick' });
  if (a.length) break;
}
kontrol('B2: alt ajan olay urettikce 200 dk boyunca kapatmaz', a.length === 0 && durum('b') === 'asked');
tur('b', 'calisiyor', { subagents: 0 }, 1 * SN);
a = olay({ type: 'tick' }, night.IDLE_CLOSE_MS);
kontrol('B2: calisiyor, 60 dk sessiz -> kapatmaz', a.length === 0 && durum('b') === 'asked');
a = olay({ type: 'tick' }, night.STUCK_CLOSE_MS - night.IDLE_CLOSE_MS - 1);
kontrol('B2: calisiyor, 180 dk eksik bir ms -> kapatmaz', a.length === 0);
a = olay({ type: 'tick' }, 1);
kontrol('takilmis ajan (calisiyor, 180 dk hic olay yok) -> confirmed + close', tip(a) === 'close' && durum('b') === 'confirmed');
tur('b', 'kapandi', {}, 1 * SN);
kontrol('b closed: a ve b kapali -> gece done', durum('b') === 'closed' && s.done);

// --- denetim D1: BITTI ama arka planda alt ajan suruyor -> kapanis bekler ---
olay({ type: 'mark', id: 'b2', name: 'B2' });
tur('b2', 'bitti', { stop: true, message: 'x' }, 1 * SN);
olay({ type: 'tick' }, night.QUIET_MS);
tur('b2', 'calisiyor', {}, 1 * SN);
a = tur('b2', 'bitti', { stop: true, subagents: 1, message: 'Devir ajani arkada.\nGECE: BITTI' }, 1 * SN);
kontrol('D1: BITTI + alt ajan -> confirmed, close yok', durum('b2') === 'confirmed' && a.length === 0);
a = olay({ type: 'tick' }, 5 * DK);
kontrol('D1: alt ajan surerken tick kapatmaz', a.length === 0);
a = tur('b2', 'bitti', { subagents: 0 }, 1 * SN);
kontrol('D1: alt ajan bitince close', tip(a) === 'close');
olay({ type: 'closed', id: 'b2' });

// --- gate F1: SubagentStop kacti, sayi takili; 15 dk hic olay yoksa sayilmaz, gece kilitlenmez ---
olay({ type: 'mark', id: 'b5', name: 'B5' });
tur('b5', 'bitti', { stop: true, subagents: 1, message: 'x' }, 1 * SN);
a = olay({ type: 'tick' }, night.SUBAGENT_STALE_MS - 1);
kontrol('F1: takili alt ajan, 15 dk dolmadan sorulmaz', a.length === 0 && durum('b5') === 'working');
a = olay({ type: 'tick' }, 1);
kontrol('F1: 15 dk hic olay yok -> alt ajan sayilmaz, sorulur', tip(a) === 'ask' && durum('b5') === 'asked');
olay({ type: 'closed', id: 'b5' });

// --- bosta sekme (hic tur yok) 60 dk sessiz -> kapatilir, gece kilitlenmez ---
olay({ type: 'mark', id: 'b3', name: 'B3' });
a = olay({ type: 'tick' }, night.IDLE_CLOSE_MS);
kontrol('turu hic olmayan sekme 60 dk sonra kapatilir', tip(a) === 'close' && durum('b3') === 'confirmed');
olay({ type: 'closed', id: 'b3' });

// --- yeni sekme c; elle kapatma closed sayar; hepsi closed -> done (bir kez) ---
olay({ type: 'mark', id: 'c', name: 'Vault' });
olay({ type: 'mark', id: 'b4', name: 'B4' });
a = olay({ type: 'closed', id: 'b4' });
kontrol('pty cikisi -> closed, c acik: done yok', durum('b4') === 'closed' && a.length === 0 && !s.done);
a = olay({ type: 'closed', id: 'c' });
kontrol('elle kapatma (calisirken) closed, son sekme -> done', durum('c') === 'closed' && tip(a) === 'done' && s.done);
a = olay({ type: 'closed', id: 'c' });
kontrol('done ikinci kez cikmaz', a.length === 0);

// --- night.json gorunumu ---
const f = night.toFile(s, saat);
kontrol(
  'toFile sozlesme anahtarlari',
  f.version === 1 && f.heartbeat === saat && f.started > 0 && f.done === true && f.tabs.length === 2 &&
    f.tabs.every((t) => Object.keys(t).sort().join() === 'claude,id,name,state,transcript'),
  f
);

// --- done sonrasi yeni isaret yeni gece baslatir ---
a = olay({ type: 'mark', id: 'd', name: 'Yeni' });
kontrol('done sonrasi isaret: yeni gece, start', tip(a) === 'start' && !s.done && Object.keys(s.tabs).join() === 'd');

// --- unmark ve iptal ---
olay({ type: 'mark', id: 'e', name: 'E' });
a = olay({ type: 'unmark', id: 'd' });
kontrol('bir sekmenin isareti kalkar, gece surer', a.length === 0 && !s.tabs.d && durum('e') === 'working');
a = olay({ type: 'unmark', id: 'e' });
kontrol('son canli sekmenin isareti kalkinca cancel', tip(a) === 'cancel' && s.started === null);
olay({ type: 'mark', id: 'f', name: 'F' });
a = olay({ type: 'cancel' });
kontrol('iptal: cancel + bos durum', tip(a) === 'cancel' && Object.keys(s.tabs).length === 0);
a = olay({ type: 'cancel' });
kontrol('gece yokken iptal bir sey yapmaz', a.length === 0);

// --- kimlik (/clear) ---
olay({ type: 'mark', id: 'g', name: 'G', claude: '11111111-1111-1111-1111-111111111111' });
olay({ type: 'identity', id: 'g', claude: '22222222-2222-2222-2222-222222222222' });
kontrol('kimlik degisince night.json yeni uuid tasir', night.toFile(s, saat).tabs[0].claude === '22222222-2222-2222-2222-222222222222');

// --- yeniden baslama sonrasi: ilk olay ya da 30 sn, bir kez ---
s = night.initial();
olay({ type: 'mark', id: 'r1', name: 'R1', resume: true });
olay({ type: 'mark', id: 'r2', name: 'R2', resume: true });
a = tur('r1', 'bosta', {}, 3 * SN);
kontrol('resume: ilk hook olayinda devam mesaji', tip(a) === 'resume' && a[0].id === 'r1' && a[0].text === night.TEXT.resume);
a = olay({ type: 'tick' }, 27 * SN - 1);
kontrol('resume: 30 sn dolmadan r2 beklenir', a.length === 0);
a = olay({ type: 'tick' }, 1);
kontrol('resume: 30 sn sonra r2', tip(a) === 'resume' && a[0].id === 'r2');
a = tur('r2', 'calisiyor', {}, 1 * SN);
const b = olay({ type: 'tick' }, 1 * DK);
kontrol('resume yalniz bir kez', a.length === 0 && !b.some((x) => x.type === 'resume'));
a = olay({ type: 'tick' }, night.DELIVERY_MS);
kontrol('D3: r1 devam mesajindan sonra olay yok -> yeniden', tip(a) === 'resume' && a[0].id === 'r1');
tur('r1', 'calisiyor', {}, 1 * SN);
a = olay({ type: 'tick' }, night.DELIVERY_MS);
kontrol('D3: teslim edildi (olay geldi) -> bir daha yok', !a.some((x) => x.type === 'resume'));
olay({ type: 'mark', id: 'r3', name: 'R3', resume: true });
for (let i = 0; i < night.MAX_RESUME_TRIES + 2; i++) olay({ type: 'tick' }, night.DELIVERY_MS);
kontrol('D3: hic acilamayan sekme geceyi kilitlemez (closed)', durum('r3') === 'closed');

// --- acilis plani ---
const simdi = Date.now();
kontrol('plan: dosya yok -> temizle', night.resumePlan(null, simdi).clear === true);
kontrol('plan: done -> temizle', night.resumePlan({ started: simdi, done: true, tabs: [{ id: 'x', state: 'working' }] }, simdi).clear === true);
kontrol('plan: 12 sa bayat -> temizle', night.resumePlan({ started: simdi - night.MAX_NIGHT_MS, done: false, tabs: [{ id: 'x', state: 'working' }] }, simdi).clear === true);
kontrol('plan: sekme yok -> temizle', night.resumePlan({ started: simdi, done: false, tabs: [] }, simdi).clear === true);
kontrol('plan: hepsi kapali/onayli ama done yazilmamis -> bitir', night.resumePlan({ started: simdi, done: false, tabs: [{ id: 'x', state: 'closed' }, { id: 'z', state: 'confirmed' }] }, simdi).finish === true);
const plan2 = night.resumePlan({ started: simdi, done: false, tabs: [{ id: 'x', state: 'confirmed' }, { id: 'w', state: 'working' }] }, simdi);
kontrol('D2: onay vermis sekme devam ettirilmez', plan2.resume && plan2.resume.map((t) => t.id).join() === 'w');
const plan = night.resumePlan({ started: simdi - 3 * 60 * DK, done: false, tabs: [{ id: 'x', state: 'asked' }, { id: 'y', state: 'closed' }] }, simdi);
kontrol('plan: kapanmamis sekmeler geri acilir', plan.resume && plan.resume.map((t) => t.id).join() === 'x' && plan.started === simdi - 3 * 60 * DK);

// --- night.json sozlesmesi: Kokpit'in yazicisi + gercek bekci ---
function bekci() {
  const r = spawnSync('python', [path.join(KOK, 'scripts', 'night_guard.py'), '--dir', GECICI, '--dry-run', '--once'], { encoding: 'utf8' });
  return (r.stdout || '').trim() || (r.stderr || '').trim();
}
s = night.initial();
saat = Date.now();
olay({ type: 'mark', id: 'k1', name: 'K1', claude: '33333333-3333-3333-3333-333333333333' });
olay({ type: 'mark', id: 'k2', name: 'K2' });
tur('k1', 'bitti', { stop: true, message: 'x', transcript: path.join(GECICI, 'yok.jsonl') });
writeNightFile(GECICI, night.toFile(s, Date.now()));
const ham = JSON.parse(fs.readFileSync(path.join(GECICI, 'night.json'), 'utf8'));
kontrol('yazici atomik: tmp dosyasi kalmaz, json okunur', !fs.existsSync(path.join(GECICI, 'night.json.tmp')) && ham.version === 1 && ham.tabs.length === 2);
let cikti = bekci();
kontrol('bekci: sekmeler acikken waiting', cikti === 'waiting', cikti);
olay({ type: 'closed', id: 'k1' });
writeNightFile(GECICI, night.toFile(s, Date.now()));
cikti = bekci();
kontrol('bekci: bir sekme acik -> hala waiting', cikti === 'waiting', cikti);
olay({ type: 'closed', id: 'k2' });
writeNightFile(GECICI, night.toFile(s, Date.now()));
cikti = bekci();
const gunluk = fs.readFileSync(path.join(GECICI, 'night-guard.log'), 'utf8');
kontrol('bekci: hepsi kapandi -> shutdown (dry-run)', cikti === 'shutdown' && /would run: shutdown \/s \/t 300/.test(gunluk), cikti);

fs.rmSync(GECICI, { recursive: true, force: true });
console.log('\n' + gecen + ' gecti, ' + kalan + ' kaldi');
if (kalan === 0) console.log('TUMU GECTI');
process.exit(kalan === 0 ? 0 : 1);
