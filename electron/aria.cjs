// v3.3, Aria: Scryne'in ikinci beyni Kokpit'in icinde. Vault'ta (ScryneOS) kalici bir claude oturumu; Kokpit onu
// terminal degil yapilandirilmis akisla konusturur (`claude -p --input-format stream-json --output-format stream-json`).
// Ekranda sohbet, Ada'da ses. Vault'un hook'lari aynen calisir: SessionStart hafizayi yukler, SessionEnd gunluge dusurur.
//
// Spike (2026-10-29, claude 2.1.312): (S1) ayni surecte cok tur, tur basina ~2 sn; hook'lar hafizayi yukledi (son
// oturum basligini bildi); surec kapaninca `--resume <id>` ayni konusmaya dondu (SessionStart:resume). (S2) yerel stdio
// MCP araci oturumda goruldu ve cagrildi; kullanici MCP'leri yuklenince acilis 15 sn, `--strict-mcp-config` ile 1,8 sn.
// (S4) `control_request interrupt` turu hemen keser (result error_during_execution), surec yasar; `--include-partial-
// messages` metni parca parca verir.
//
// Oturum gunluktur: gunun ilk mesaji yeni kimlikle (SessionStart taze hafiza yukler), gun icinde ayni konusma; surec 20 dk
// bosta kalinca stdin kapatilir (SessionEnd hook'u gunluge dusurur), sonraki mesaj `--resume` ile surer. Kayitlar
// ~/.kokpit/aria/: `kayit.json` (gunler) + `<kimlik>.jsonl` (ekranda gosterilen mesajlar, sohbetin kendi kopyasi).
// Saf parcalar (`olayIsle`, `aracOzeti`, `gunAnahtari`) test-ada'da sinanir.

const { spawn, execFileSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { KOKPIT_DIZIN } = require('./config.cjs');
const { log } = require('./log.cjs');
const ortamModulu = require('./ortam.cjs');

const DIZIN = path.join(KOKPIT_DIZIN, 'aria');
const KAYIT = path.join(DIZIN, 'kayit.json');
const BOSTA_KAPAT_MS = 20 * 60 * 1000;
const GUN_SINIRI_SAAT = 5; // brifingle ayni: 05:00'e kadar onceki gun

/** Aria'nin Kokpit icindeki baglami: claude'un kendi sistem istemine eklenir (vault CLAUDE.md'si zaten yuklu). */
const KOKPIT_ISTEMI = [
  'Kokpit icindesin: Scryne seninle Kokpit\'in Aria sayfasindan yazarak ya da Ada\'dan sesle konusuyor. Ada senin ekrandaki yuzun ve sesin; ayri bir karakter degil.',
  'Mesaj "[ses]" ile basliyorsa cevabin sesli okunacak: 1-3 kisa cumle, markdown, liste, sembol, dosya yolu yok; ayrinti istenirse yazili verilir.',
  'Yazili cevaplar Kokpit\'te markdown olarak cizilir: kisa, basliksiz, gerektiginde liste ve `kod`.',
  'Kokpit araclarin (mcp__kokpit__*) oturumlari, nobeti, vadeleri, Teslim\'i ve brifingi okur. Is yaptirmak icin YALNIZ oneri_* araclarini kullan: Kokpit bir oneri karti cizer, Scryne onaylar; onaysiz hicbir oturuma yazilmaz.',
  'Push, silme, disari mesaj/yayin, para harcayan islem yasak (Kurallar.md dort kutu).',
].join('\n');

let ayar = { yayin: (_olay) => {}, vault: null, mcpConfig: null, ekArgumanlar: [] };
let surec = null;
let surecKimligi = null;
let tampon = '';
let durum = 'bosta'; // bosta | aciliyor | dusunuyor | yaziyor | arac
let aktif = null; // { id (aria mesaj), metin, araclar, hafiza, t0, kaynak }
let kuyruk = []; // surec mesgulken gelen kullanici mesajlari
let bostaZamanlayici = null;
let baslangic = 0;

function gunAnahtari(t = Date.now()) {
  const d = new Date(t - GUN_SINIRI_SAAT * 3600_000);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function kayitOku() {
  try {
    const j = JSON.parse(fs.readFileSync(KAYIT, 'utf8'));
    return Array.isArray(j.gunler) ? j : { gunler: [] };
  } catch {
    return { gunler: [] };
  }
}
function kayitYaz(k) {
  fs.mkdirSync(DIZIN, { recursive: true });
  const gecici = KAYIT + '.' + process.pid + '.tmp';
  fs.writeFileSync(gecici, JSON.stringify({ gunler: k.gunler.slice(-90) }, null, 2) + '\n', 'utf8');
  fs.renameSync(gecici, KAYIT);
}

/** Bugunun oturumu (yoksa yeni kimlik). `yeni`: kimlik henuz claude'a verilmedi (--session-id), degilse --resume. */
function bugunkuOturum(zorlaYeni = false) {
  const k = kayitOku();
  const gun = gunAnahtari();
  let g = !zorlaYeni && k.gunler.length ? k.gunler[k.gunler.length - 1] : null;
  if (!g || g.gun !== gun || zorlaYeni) {
    g = { gun, id: crypto.randomUUID(), t: Date.now(), baslik: null, basladi: false };
    k.gunler.push(g);
    kayitYaz(k);
  }
  return g;
}
function oturumGuncelle(id, yama) {
  const k = kayitOku();
  const g = k.gunler.find((x) => x.id === id);
  if (!g) return;
  Object.assign(g, yama);
  kayitYaz(k);
}

function mesajYolu(id) {
  return path.join(DIZIN, id + '.jsonl');
}
function mesajKaydet(oturumId, m) {
  try {
    fs.mkdirSync(DIZIN, { recursive: true });
    fs.appendFileSync(mesajYolu(oturumId), JSON.stringify(m) + '\n', 'utf8');
  } catch (e) {
    log('aria: mesaj yazilamadi: ' + e.message);
  }
}

/** claude.exe: kullanicinin kurulumu (~/.local/bin) ya da PATH. */
function claudeYolu() {
  const yerel = path.join(os.homedir(), '.local', 'bin', 'claude.exe');
  if (fs.existsSync(yerel)) return yerel;
  try {
    return String(execFileSync('where.exe', ['claude'], { windowsHide: true })).split(/\r?\n/)[0].trim() || 'claude';
  } catch {
    return 'claude';
  }
}

/**
 * Arac kullanimini tek satira indirir: ad + hedef (dosya adi, desen, komutun basi). SAF.
 * @returns {{ ad: string, hedef: string }}
 */
function aracOzeti(ad, girdi) {
  const g = girdi && typeof girdi === 'object' ? girdi : {};
  const kisa = (s, n = 60) => {
    const m = String(s ?? '').replace(/\s+/g, ' ').trim();
    return m.length > n ? m.slice(0, n - 1) + '…' : m;
  };
  const dosya = g.file_path || g.path || g.notebook_path;
  let hedef = '';
  if (dosya) hedef = String(dosya).split(/[\\/]/).slice(-2).join('/');
  else if (g.pattern) hedef = kisa(g.pattern, 40);
  else if (g.command) hedef = kisa(g.command, 50);
  else if (g.query) hedef = kisa(g.query, 50);
  else if (g.url) hedef = kisa(g.url, 50);
  else if (g.description) hedef = kisa(g.description, 50);
  const temizAd = String(ad).replace(/^mcp__kokpit__(?:kokpit_)?/, 'kokpit.');
  return { ad: temizAd, hedef };
}

/** Vault icine yazan arac mi (Write/Edit/MultiEdit): "gorunur hafiza" icin goreli yol. SAF. */
function hafizaYolu(ad, girdi, vault) {
  if (!vault || !['Write', 'Edit', 'MultiEdit', 'NotebookEdit'].includes(ad)) return null;
  const dosya = girdi && (girdi.file_path || girdi.notebook_path);
  if (typeof dosya !== 'string') return null;
  const tam = path.resolve(dosya);
  const kok = path.resolve(vault);
  if (!tam.toLowerCase().startsWith(kok.toLowerCase() + path.sep)) return null;
  return path.relative(kok, tam).split(path.sep).join('/');
}

/**
 * stream-json olayini Aria'nin durumuna isler. SAF: (durum, olay, vault) -> { aktif, durum, yayinlar[] }.
 * aktif: suren Aria mesaji { metin, araclar[], hafiza[] }. Yayinlar renderer'a gidecek olaylardir.
 */
function olayIsle(oncekiAktif, j, vault) {
  const aktifM = oncekiAktif ? { ...oncekiAktif, araclar: [...oncekiAktif.araclar], hafiza: [...oncekiAktif.hafiza] } : null;
  const yayin = [];
  let yeniDurum = null;
  if (!j || typeof j !== 'object') return { aktif: aktifM, durum: null, yayin };
  // Alt ajanlarin (Task) akisi ana metne karismaz.
  if (j.parent_tool_use_id) return { aktif: aktifM, durum: null, yayin };
  if (j.type === 'stream_event' && aktifM) {
    const ev = j.event || {};
    if (ev.type === 'content_block_delta' && ev.delta && ev.delta.type === 'text_delta') {
      aktifM.taslak = (aktifM.taslak ?? '') + ev.delta.text;
      yeniDurum = 'yaziyor';
      yayin.push({ tur: 'parca', id: aktifM.id, metin: aktifM.metinBirikmis + aktifM.taslak });
    } else if (ev.type === 'content_block_start' && ev.content_block && ev.content_block.type === 'thinking') {
      yeniDurum = 'dusunuyor';
    }
  } else if (j.type === 'assistant' && aktifM) {
    for (const c of (j.message && j.message.content) || []) {
      if (c.type === 'text' && c.text) {
        aktifM.metinBirikmis = (aktifM.metinBirikmis ? aktifM.metinBirikmis + '\n\n' : '') + c.text;
        aktifM.taslak = '';
      } else if (c.type === 'tool_use') {
        const o = aracOzeti(c.name, c.input);
        aktifM.araclar.push(o);
        const h = hafizaYolu(c.name, c.input, vault);
        if (h && !aktifM.hafiza.includes(h)) aktifM.hafiza.push(h);
        yeniDurum = 'arac';
        yayin.push({ tur: 'arac', id: aktifM.id, arac: o, hafiza: aktifM.hafiza });
      }
    }
    if (aktifM.metinBirikmis) yayin.push({ tur: 'parca', id: aktifM.id, metin: aktifM.metinBirikmis });
  } else if (j.type === 'user' && aktifM) {
    yeniDurum = 'dusunuyor'; // arac sonucu dondu, model yeniden dusunuyor
  } else if (j.type === 'result' && aktifM) {
    const kesildi = j.subtype === 'error_during_execution';
    const hata = j.is_error && !kesildi ? String(j.result || j.subtype || 'hata') : null;
    const metin = aktifM.metinBirikmis || (typeof j.result === 'string' && !j.is_error ? j.result : '');
    yayin.push({
      tur: 'bitti',
      id: aktifM.id,
      metin,
      kesildi,
      hata,
      sureMs: j.duration_ms ?? null,
      araclar: aktifM.araclar,
      hafiza: aktifM.hafiza,
    });
    yeniDurum = 'bosta';
    return { aktif: null, durum: yeniDurum, yayin };
  }
  return { aktif: aktifM, durum: yeniDurum, yayin };
}

function durumYayinla(d) {
  if (d === durum) return;
  durum = d;
  ayar.yayin({ tur: 'durum', durum });
}

function bostaKur() {
  if (bostaZamanlayici) clearTimeout(bostaZamanlayici);
  bostaZamanlayici = setTimeout(() => {
    if (surec && durum === 'bosta' && kuyruk.length === 0) {
      log('aria: 20 dk bosta, oturum kapatiliyor (SessionEnd)');
      kapat();
    }
  }, BOSTA_KAPAT_MS);
  bostaZamanlayici.unref?.();
}

function satirIsle(satir) {
  let j;
  try {
    j = JSON.parse(satir);
  } catch {
    return;
  }
  if (j.type === 'system' && j.subtype === 'init') {
    if (durum === 'aciliyor' && !aktif) durumYayinla('bosta');
    log('aria: oturum hazir (' + ((Date.now() - baslangic) / 1000).toFixed(1) + ' sn, ' + (j.tools || []).length + ' arac)');
    return;
  }
  const r = olayIsle(aktif, j, ayar.vault);
  aktif = r.aktif;
  for (const y of r.yayin) {
    ayar.yayin(y);
    if (y.tur === 'bitti') {
      const g = kayitOku().gunler.find((x) => x.id === surecKimligi);
      if (g && !g.basladi) oturumGuncelle(g.id, { basladi: true });
      mesajKaydet(surecKimligi, { id: y.id, rol: 'aria', metin: y.metin, t: Date.now(), araclar: y.araclar, hafiza: y.hafiza, kesildi: y.kesildi || undefined, hata: y.hata || undefined, sureMs: y.sureMs });
    }
  }
  if (r.durum) durumYayinla(r.durum);
  if (r.durum === 'bosta') {
    bostaKur();
    const sonraki = kuyruk.shift();
    if (sonraki) yaz(sonraki);
  }
}

function baslat() {
  if (surec) return;
  const g = bugunkuOturum();
  // Test: sahte claude (scripts/sahte-claude.cjs) node ile; gercek claude vault hook'larini calistirir ve limit harcar.
  const sahte = process.env.KOKPIT_TEST_ARIA_SAHTE;
  const exe = sahte ? 'node' : claudeYolu();
  const args = [
    ...(sahte ? [sahte] : []),
    '-p',
    '--input-format', 'stream-json',
    '--output-format', 'stream-json',
    '--verbose',
    '--include-partial-messages',
    '--strict-mcp-config',
    ...(ayar.mcpConfig ? ['--mcp-config', ayar.mcpConfig] : []),
    '--append-system-prompt', KOKPIT_ISTEMI,
    ...(g.basladi ? ['--resume', g.id] : ['--session-id', g.id]),
    ...ayar.ekArgumanlar,
  ];
  baslangic = Date.now();
  surecKimligi = g.id;
  durumYayinla('aciliyor');
  const { ortam } = ortamModulu.temizOrtam();
  try {
    surec = spawn(exe, args, { cwd: ayar.vault, env: { ...ortam, KOKPIT_ARIA: '1' }, windowsHide: true });
  } catch (e) {
    log('aria: claude baslatilamadi: ' + e.message);
    surec = null;
    durumYayinla('bosta');
    ayar.yayin({ tur: 'hata', metin: 'Aria başlatılamadı: ' + e.message });
    return;
  }
  // `basladi` ilk tur bitince yazilir: claude transcript'i ilk mesajda dogar; mesajsiz isinip kapanan kimlige
  // `--resume` "konusma yok" derdi.
  log('aria: oturum ' + (g.basladi ? 'surduruluyor ' : 'basliyor ') + g.id.slice(0, 8) + ' (' + g.gun + ')');
  tampon = '';
  const benim = surec;
  surec.stdout.setEncoding('utf8');
  surec.stdout.on('data', (d) => {
    tampon += d;
    let i;
    while ((i = tampon.indexOf('\n')) >= 0) {
      const s = tampon.slice(0, i).trim();
      tampon = tampon.slice(i + 1);
      if (s) satirIsle(s);
    }
  });
  surec.stderr.on('data', (d) => log('aria stderr: ' + String(d).trim().slice(0, 300)));
  surec.on('error', (e) => log('aria: surec hatasi: ' + e.message));
  surec.on('exit', (kod) => {
    if (surec !== benim) return;
    log('aria: surec kapandi (kod ' + kod + ')');
    surec = null;
    if (aktif) {
      ayar.yayin({ tur: 'bitti', id: aktif.id, metin: aktif.metinBirikmis || '', kesildi: true, hata: kod ? 'Aria süreci kapandı (kod ' + kod + ')' : null, araclar: aktif.araclar, hafiza: aktif.hafiza });
      aktif = null;
    }
    kuyruk = [];
    durumYayinla('bosta');
  });
}

function yaz(m) {
  if (!surec) baslat();
  if (!surec) return;
  aktif = { id: m.ariaId, metinBirikmis: '', taslak: '', araclar: [], hafiza: [], kaynak: m.kaynak };
  durumYayinla('dusunuyor');
  surec.stdin.write(JSON.stringify({ type: 'user', message: { role: 'user', content: m.icerik } }) + '\n');
}

/**
 * Scryne'in mesaji. `kaynak` 'ses' ise claude'a "[ses]" onekiyle gider (kisa, sesli okunabilir cevap). Doner: mesaj
 * kimlikleri (renderer hemen cizer, cevap olaylarla gelir).
 */
function gonder(metin, { kaynak = 'yazi' } = {}) {
  const temiz = String(metin || '').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').trim().slice(0, 8000);
  if (!temiz) return null;
  const g = bugunkuOturum();
  // Gun degistiyse eski surec kapanir, yeni gun yeni kimlikle baslar.
  if (surec && surecKimligi !== g.id) kapat();
  const senId = 's-' + Date.now().toString(36) + crypto.randomBytes(2).toString('hex');
  const ariaId = 'a-' + Date.now().toString(36) + crypto.randomBytes(2).toString('hex');
  const sen = { id: senId, rol: 'sen', metin: temiz, t: Date.now(), kaynak };
  mesajKaydet(g.id, sen);
  if (!g.baslik) oturumGuncelle(g.id, { baslik: temiz.slice(0, 80) });
  ayar.yayin({ tur: 'mesaj', mesaj: sen, ariaId });
  const istek = { ariaId, kaynak, icerik: kaynak === 'ses' || kaynak === 'ada' ? '[ses] ' + temiz : temiz };
  // Mesgul = bir tur suruyor. 'aciliyor' mesgul degil: claude stdin'i kendisi tamponlar (isinan surece ilk mesaj
  // dogrudan yazilir; kuyruk yalniz tur bitince bosaldigi icin aciliyorken kuyruga almak kilitlenirdi).
  if (surec && aktif) kuyruk.push(istek);
  else yaz(istek);
  return { senId, ariaId };
}

/** Suren turu keser (claude'un kendi kesmesi; surec yasar). */
function kes() {
  if (!surec || durum === 'bosta') return false;
  kuyruk = [];
  surec.stdin.write(JSON.stringify({ type: 'control_request', request_id: 'kes-' + Date.now(), request: { subtype: 'interrupt' } }) + '\n');
  return true;
}

/** Oturumu kapatir (stdin kapanir, SessionEnd hook'u gunluge dusurur). Takilirsa 90 sn sonra oldurulur. */
function kapat() {
  if (!surec) return;
  const s = surec;
  surec = null;
  try {
    s.stdin.end();
  } catch {
    /* kapali */
  }
  setTimeout(() => {
    try {
      if (s.exitCode === null) s.kill();
    } catch {
      /* zaten bitti */
    }
  }, 90_000).unref?.();
  durumYayinla('bosta');
}

// --- v3.3 Faz 63: gunluk "fark ettiklerim" notu ---
const NOT_DOSYA = path.join(DIZIN, 'notlar.json');
const NOT_ISTEMI = [
  'Gunluk not (Kokpit). Kokpit araclarinla (oturumlar, brifing, nobet, teslim, gece) ve vault\'tan (Threads, proje notlari) durumu oku.',
  "Bugun Scryne'in bilmesi gereken 3-5 sey yaz: yaklasan tarih, risk, unutulmus yarim is, firsat, birbirine bagli projeler.",
  'Her madde tek satir "- " ile baslar; sonunda parantez icinde kaynak (dosya ya da arac). Uydurma; emin olmadigini yazma.',
  'Brifingin zaten soyledigini tekrarlama (vade/bot/push listesi): onlarin arasindaki baglantiyi ya da gozden kacani yaz.',
  'Hafiza dosyalarina YAZMA, oneri araci kullanma; yalniz oku ve maddeleri yaz. Giris cumlesi yok.',
].join('\n');
let notSuruyor = null;

function notOku() {
  try {
    return JSON.parse(fs.readFileSync(NOT_DOSYA, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Gunun notu: ayri, kalici olmayan `claude -p` (sohbeti kirletmez, transcript yazilmaz). Ayni gun ikinci kez yalniz
 * `zorla` ile. Doner: { gun, metin, t } ya da { hata }.
 */
function gunlukNot({ zorla = false } = {}) {
  const gun = gunAnahtari();
  const eski = notOku();
  if (!zorla && eski && eski.gun === gun && eski.metin) return Promise.resolve(eski);
  if (notSuruyor) return notSuruyor;
  const sahte = process.env.KOKPIT_TEST_ARIA_SAHTE;
  const args = [
    ...(sahte ? [sahte] : []),
    '-p',
    NOT_ISTEMI,
    '--output-format', 'json',
    '--no-session-persistence',
    '--strict-mcp-config',
    ...(ayar.mcpConfig ? ['--mcp-config', ayar.mcpConfig] : []),
    '--append-system-prompt', KOKPIT_ISTEMI,
  ];
  const { ortam } = ortamModulu.temizOrtam();
  ayar.yayin({ tur: 'not', durum: 'yaziyor' });
  notSuruyor = new Promise((coz) => {
    let cikti = '';
    let p;
    try {
      p = spawn(sahte ? 'node' : claudeYolu(), args, { cwd: ayar.vault, env: { ...ortam, KOKPIT_ARIA: 'not' }, windowsHide: true });
    } catch (e) {
      return coz({ hata: e.message });
    }
    const zaman = setTimeout(() => p.kill(), 240_000);
    p.stdout.setEncoding('utf8');
    p.stdout.on('data', (d) => (cikti += d));
    p.on('error', (e) => coz({ hata: e.message }));
    p.on('exit', () => {
      clearTimeout(zaman);
      let metin = '';
      try {
        const j = JSON.parse(cikti.trim().split('\n').pop());
        metin = j.is_error ? '' : String(j.result || '').trim();
      } catch {
        metin = '';
      }
      if (!metin) return coz({ hata: 'Aria not yazamadı' });
      const n = { gun, metin: metin.slice(0, 4000), t: Date.now() };
      try {
        fs.mkdirSync(DIZIN, { recursive: true });
        fs.writeFileSync(NOT_DOSYA, JSON.stringify(n, null, 2), 'utf8');
      } catch {
        /* yazilamadi: yine de gosterilir */
      }
      log('aria: gunluk not yazildi (' + metin.length + ' karakter)');
      coz(n);
    });
  }).then((n) => {
    notSuruyor = null;
    ayar.yayin({ tur: 'not', durum: 'hazir', not: 'hata' in n ? null : n, hata: 'hata' in n ? n.hata : null });
    return n;
  });
  return notSuruyor;
}

/** Bir gunun mesajlari (ekran). */
function gecmis(id) {
  const k = kayitOku();
  const g = id ? k.gunler.find((x) => x.id === id) : k.gunler[k.gunler.length - 1];
  if (!g) return { oturum: null, mesajlar: [] };
  let mesajlar = [];
  try {
    mesajlar = fs
      .readFileSync(mesajYolu(g.id), 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((s) => JSON.parse(s));
  } catch {
    mesajlar = [];
  }
  return { oturum: g, mesajlar: mesajlar.slice(-400) };
}

module.exports = {
  KOKPIT_ISTEMI,
  DIZIN,
  gunAnahtari,
  aracOzeti,
  hafizaYolu,
  olayIsle,
  /** @param {{ yayin: (olay: object) => void, vault: string, mcpConfig?: string | null, ekArgumanlar?: string[] }} s */
  kur(s) {
    ayar = { ...ayar, ...s };
  },
  gonder,
  kes,
  kapat,
  gecmis,
  /** Gecmis gunler (yeniden eskiye). */
  oturumlar: () => kayitOku().gunler.slice().reverse().map(({ gun, id, baslik, t }) => ({ gun, id, baslik, t })),
  /** Bugunun konusmasini kapatip yenisini baslatir ("Yeni sohbet"). */
  yeniSohbet() {
    kapat();
    bugunkuOturum(true);
  },
  /** Sayfa acilinca isinmak: ilk mesajda 2 sn kaybedilmesin. */
  isit() {
    if (!surec && ayar.vault) baslat();
  },
  durum: () => ({ durum, canli: !!surec, id: surecKimligi }),
  gunlukNot,
  notOku,
  /** Suren Aria mesajinin kimligi (oneri karti o mesajin altina cizilir). */
  aktifMesajId: () => (aktif ? aktif.id : null),
};
