// v4.0 medya: Windows'ta calan parca (Spotify, tarayici, Medya Oynatici ...) Ada'nin Medya sayfasina.
//
// Kaynak Windows'un medya oturumu (GlobalSystemMediaTransportControlsSessionManager). Node'dan WinRT'ye
// bagimliliksiz yol yok; uzun omurlu bir Windows PowerShell 5.1 yardimcisi (medya-yardimci.ps1) oturumu
// ~1 sn'de bir yoklar, satir basina JSON yazar, stdin'den komut alir. Bu modul o sureci yonetir ve
// satirlari sozlesmedeki MedyaDurumu'na cevirir.
//
// Yetim surec olmasin: yardimci stdin EOF'unda cikar (ebeveyn olunce boru kapanir) ve libuv'nin is
// nesnesi de Node olunce cocugu kapatir. durdur() yalniz KENDI PID'ini oldurur.
//
// Testler gercek medya oturumuna dokunmaz: KOKPIT_MEDYA_YARDIMCI bir node betigi gosterirse yardimci
// yerine o calisir (Electron'da ELECTRON_RUN_AS_NODE=1 ile).

const path = require('path');
const { spawn } = require('child_process');
const { log } = require('./log.cjs');

const BETIK = path.join(__dirname, 'medya-yardimci.ps1');
const KOMUTLAR = new Set(['oynat-duraklat', 'sonraki', 'onceki']);
/** Yardimci 400 KB ustu kapagi gondermez; base64 hali ~546 KB. Fazlasi bozuk/yabanci satir sayilir. */
const KAPAK_EN_COK = Math.ceil((400 * 1024 * 4) / 3) + 8;
/** Satir sonu gelmeden bu kadar birikirse tampon atilir (kapak satiri dahil hicbir gecerli satir bu kadar degil). */
const TAMPON_EN_COK = 2 * 1024 * 1024;
/** Caliyorken konum tahmini bu kadar saparsa arama/sicrama sayilir ve yeniden yayinlanir. */
const SICRAMA_MS = 1500;

/** Bilinen uygulamalar: AUMID / exe adindan kullaniciya gorunen ad. */
function bilinen(ad) {
  const k = String(ad || '').toLowerCase();
  if (!k) return null;
  if (k.startsWith('spotify')) return 'Spotify';
  if (k.startsWith('chrome')) return 'Chrome';
  if (k.startsWith('msedge') || k === 'microsoftedge' || k.startsWith('microsoftedge')) return 'Edge';
  if (k.startsWith('firefox')) return 'Firefox';
  if (k.startsWith('brave')) return 'Brave';
  if (k.startsWith('opera')) return 'Opera';
  if (k === 'vlc') return 'VLC';
  if (k === 'zunemusic' || k === 'zunevideo' || k === 'mediaplayer') return 'Medya Oynatıcı';
  if (k === 'applemusicwin' || k === 'applemusic') return 'Apple Music';
  if (k === 'itunes') return 'iTunes';
  if (k === 'tidal') return 'TIDAL';
  if (k === 'deezer') return 'Deezer';
  return null;
}

/**
 * SourceAppUserModelId -> kisa ad. "Spotify.exe" -> "Spotify"; "chrome.exe" -> "Chrome";
 * "Microsoft.ZuneMusic_8wekyb3d8bbwe!Microsoft.ZuneMusic" -> Medya Oynatici; bilinmeyen -> uzantisiz ad.
 */
function uygulamaAdi(kimlik) {
  const s = typeof kimlik === 'string' ? kimlik.trim() : '';
  if (!s) return '';
  const unlem = s.indexOf('!');
  if (unlem >= 0) {
    // Paketli uygulama: "<Yayinci.Paket>_<yayinci ozeti>!<UygulamaKimligi>"
    const paket = s.slice(0, unlem).split('_')[0];
    const uyg = s.slice(unlem + 1);
    const parcalar = paket.split('.').filter(Boolean);
    for (const p of [uyg, ...uyg.split('.'), ...parcalar.slice().reverse()]) {
      const b = bilinen(p);
      if (b) return b;
    }
    // "App" gibi genel uygulama kimliginde paketin son parcasi daha anlamli.
    if (!uyg || /^(app|main|default)$/i.test(uyg)) return parcalar[parcalar.length - 1] || paket || s;
    return uyg.split('.').filter(Boolean).pop() || uyg;
  }
  const ad = path.win32.basename(s).replace(/\.exe$/i, '');
  return bilinen(ad) || ad || s;
}

const metin = (x) => (typeof x === 'string' ? x : '');
const sayi = (x) => (typeof x === 'number' && Number.isFinite(x) && x >= 0 ? Math.round(x) : 0);

/** Yardimci "durum" satirindan MedyaDurumu (kapak haric). Gecersiz satir -> null. */
function durumCevir(o, geldi) {
  if (!o || typeof o !== 'object') return null;
  const g = Number(o.guncelMs);
  // LastUpdatedTime bazi uygulamalarda bos (0 / 1601) ya da saat kaymis: o zaman satirin geldigi an.
  const gecerli = Number.isFinite(g) && g > 946684800000 && g <= geldi + 60 * 1000;
  return {
    uygulama: uygulamaAdi(o.uygulama),
    baslik: metin(o.baslik),
    sanatci: metin(o.sanatci),
    album: metin(o.album),
    caliyor: o.caliyor === true,
    konumMs: sayi(o.konumMs),
    sureMs: sayi(o.sureMs),
    olculdu: gecerli ? g : geldi,
    kapak: null,
    kontrol: { oynat: o.oynat === true, sonraki: o.sonraki === true, onceki: o.onceki === true },
  };
}

/** Yeni durum yayinlanmaya deger mi: parca, calma, kontrol, sure, kapak ya da konum sicramasi. */
function anlamliMi(eski, yeni) {
  if (!eski || !yeni) return eski !== yeni;
  if (
    eski.uygulama !== yeni.uygulama ||
    eski.baslik !== yeni.baslik ||
    eski.sanatci !== yeni.sanatci ||
    eski.album !== yeni.album ||
    eski.caliyor !== yeni.caliyor ||
    eski.sureMs !== yeni.sureMs ||
    eski.kapak !== yeni.kapak ||
    eski.kontrol.oynat !== yeni.kontrol.oynat ||
    eski.kontrol.sonraki !== yeni.kontrol.sonraki ||
    eski.kontrol.onceki !== yeni.kontrol.onceki
  ) {
    return true;
  }
  if (eski.konumMs === yeni.konumMs && eski.olculdu === yeni.olculdu) return false;
  // Renderer caliyorsa konumMs + (simdi - olculdu) ile ilerletir; ayni tahmini burada kur.
  const beklenen = yeni.caliyor ? eski.konumMs + (yeni.olculdu - eski.olculdu) : eski.konumMs;
  return Math.abs(yeni.konumMs - beklenen) > SICRAMA_MS;
}

function veriUrl(mime, veri) {
  if (typeof veri !== 'string' || !veri || veri.length > KAPAK_EN_COK || !/^[A-Za-z0-9+/]+={0,2}$/.test(veri)) return null;
  const m = typeof mime === 'string' && /^image\/[a-z0-9.+-]{1,40}$/i.test(mime) ? mime.toLowerCase() : 'image/jpeg';
  return 'data:' + m + ';base64,' + veri;
}

// --- surec yonetimi ---

let cocuk = null;
let secenek = null;
let durum = null; // yayinlanmis son MedyaDurumu
let kapakKimlik = null; // durum'un parcasi (yardimcinin baslik+sanatci+album ozeti)
let bekleyenKapak = null; // { kimlik, url } durumdan once gelen kapak
let tampon = '';
let yenidenZamanlayici = null;
let yenidenler = []; // yeniden baslatma anlari
let durduruldu = true;
let hataSayaci = 0;

function asciiYap(s) {
  return String(s).replace(/[^\x20-\x7e]/g, '?').slice(0, 300);
}

function olay(o) {
  try {
    secenek?.olay?.(o);
  } catch (e) {
    log('medya: olay dinleyici hatasi: ' + e.message);
  }
}

function yayinla(d) {
  durum = d;
  try {
    secenek?.yayin?.(d ? kopya(d) : null);
  } catch (e) {
    log('medya: yayin hatasi: ' + e.message);
  }
}

function kopya(d) {
  return { ...d, kontrol: { ...d.kontrol } };
}

function satirIsle(satir) {
  if (!satir.trim()) return;
  let o;
  try {
    o = JSON.parse(satir);
  } catch {
    if (hataSayaci++ < 20) log('medya: bozuk satir atlandi (' + satir.length + ' karakter)');
    return;
  }
  if (!o || typeof o !== 'object' || typeof o.tur !== 'string') {
    if (hataSayaci++ < 20) log('medya: turu olmayan satir atlandi');
    return;
  }
  const simdi = (secenek?.simdi || Date.now)();
  switch (o.tur) {
    case 'hazir':
      log('medya: yardimci hazir');
      break;
    case 'hata':
      log('medya: yardimci hatasi: ' + asciiYap(o.mesaj));
      break;
    case 'yok':
      kapakKimlik = null;
      bekleyenKapak = null;
      if (durum) yayinla(null);
      break;
    case 'durum': {
      const yeni = durumCevir(o, simdi);
      if (!yeni) break;
      const kimlik = typeof o.kapakKimlik === 'string' ? o.kapakKimlik : '';
      if (kimlik === kapakKimlik && durum) {
        yeni.kapak = durum.kapak;
      } else {
        // Parca degisti: eski kapak hemen duser (yanlis kapak gosterilmez); kapak once geldiyse o.
        kapakKimlik = kimlik;
        yeni.kapak = bekleyenKapak && bekleyenKapak.kimlik === kimlik ? bekleyenKapak.url : null;
        bekleyenKapak = null;
      }
      if (anlamliMi(durum, yeni)) yayinla(yeni);
      break;
    }
    case 'kapak': {
      if (typeof o.kimlik !== 'string') break;
      const url = veriUrl(o.mime, o.veri);
      if (o.kimlik === kapakKimlik && durum) {
        if (durum.kapak !== url) yayinla({ ...kopya(durum), kapak: url });
      } else {
        bekleyenKapak = { kimlik: o.kimlik, url };
      }
      break;
    }
    default:
      break;
  }
  olay(o);
}

function veriGeldi(parca) {
  tampon += parca;
  let i;
  while ((i = tampon.indexOf('\n')) >= 0) {
    const satir = tampon.slice(0, i).replace(/\r$/, '');
    tampon = tampon.slice(i + 1);
    satirIsle(satir);
  }
  if (tampon.length > TAMPON_EN_COK) {
    log('medya: satir sonu olmadan ' + tampon.length + ' karakter, tampon atildi');
    tampon = '';
  }
}

function surecAc() {
  const sahte = process.env.KOKPIT_MEDYA_YARDIMCI;
  const komut = sahte ? process.execPath : 'powershell.exe';
  const arg = sahte
    ? [path.resolve(sahte)]
    : ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', BETIK];
  const env = sahte ? { ...process.env, ELECTRON_RUN_AS_NODE: '1' } : process.env;
  let c;
  try {
    c = spawn(komut, arg, { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'], env });
  } catch (e) {
    log('medya: yardimci acilamadi: ' + e.message);
    bitti(null, null);
    return;
  }
  cocuk = c;
  tampon = '';
  let kapandi = false;
  const kapanis = (kod, hata) => {
    if (kapandi) return;
    kapandi = true;
    if (hata) log('medya: yardimci hatasi: ' + hata.message);
    bitti(c, kod);
  };
  c.stdout.setEncoding('utf8');
  c.stdout.on('data', veriGeldi);
  c.stderr.setEncoding('utf8');
  let stderrSayac = 0;
  c.stderr.on('data', (d) => {
    if (stderrSayac++ < 5) log('medya: yardimci stderr: ' + asciiYap(d));
  });
  // Yardimci olunce stdin'e yazmak EPIPE verir; surec yonetimi 'exit'te, burada yalniz yutulur.
  c.stdin.on('error', () => {});
  c.on('error', (e) => kapanis(null, e));
  c.on('exit', (kod) => kapanis(kod, null));
  log('medya: yardimci basladi (pid ' + c.pid + ')');
  olay({ tur: 'basladi', pid: c.pid });
}

function bitti(c, kod) {
  if (c && cocuk !== c) return;
  cocuk = null;
  olay({ tur: 'cikti', kod });
  kapakKimlik = null;
  bekleyenKapak = null;
  if (durum) yayinla(null); // yardimci yokken calan parca bilinmiyor
  if (durduruldu) return;
  const simdi = Date.now();
  yenidenler = yenidenler.filter((t) => simdi - t < secenek.pencereMs);
  if (yenidenler.length >= secenek.enFazlaYeniden) {
    log('medya: yardimci ' + secenek.enFazlaYeniden + ' kez yeniden basladi ve yine cikti (kod ' + kod + '); birakildi');
    olay({ tur: 'birakildi' });
    return;
  }
  log('medya: yardimci beklenmedik cikti (kod ' + kod + '), ' + secenek.yenidenMs + ' ms sonra yeniden');
  yenidenler.push(simdi);
  clearTimeout(yenidenZamanlayici);
  yenidenZamanlayici = setTimeout(() => {
    yenidenZamanlayici = null;
    if (!durduruldu && !cocuk) surecAc();
  }, secenek.yenidenMs);
}

/**
 * @param {{
 *   yayin?: (d: object | null) => void,
 *   olay?: (o: object) => void,       // teshis: yardimcinin her satiri + {tur:'basladi',pid} / {tur:'cikti',kod} / {tur:'birakildi'}
 *   yenidenMs?: number, pencereMs?: number, enFazlaYeniden?: number, durdurMs?: number,
 *   simdi?: () => number,
 * }} s
 */
function baslat(s = {}) {
  if (process.platform !== 'win32' && !process.env.KOKPIT_MEDYA_YARDIMCI) return;
  if (cocuk || yenidenZamanlayici) return;
  secenek = {
    yayin: s.yayin,
    olay: s.olay,
    yenidenMs: Number.isFinite(s.yenidenMs) ? s.yenidenMs : 5000,
    pencereMs: Number.isFinite(s.pencereMs) ? s.pencereMs : 10 * 60 * 1000,
    enFazlaYeniden: Number.isFinite(s.enFazlaYeniden) ? s.enFazlaYeniden : 3,
    durdurMs: Number.isFinite(s.durdurMs) ? s.durdurMs : 1500,
    simdi: typeof s.simdi === 'function' ? s.simdi : Date.now,
  };
  durduruldu = false;
  yenidenler = [];
  hataSayaci = 0;
  durum = null;
  kapakKimlik = null;
  bekleyenKapak = null;
  surecAc();
}

/** Yardimciyi kapatir: `cik`, stdin kapanir; durdurMs icinde cikmazsa yalniz kendi PID'i oldurulur. */
function durdur() {
  durduruldu = true;
  clearTimeout(yenidenZamanlayici);
  yenidenZamanlayici = null;
  const c = cocuk;
  if (!c) return Promise.resolve();
  return new Promise((coz) => {
    const zaman = setTimeout(() => {
      if (c.exitCode === null && c.signalCode === null) {
        log('medya: yardimci ' + secenek.durdurMs + ' ms icinde cikmadi, pid ' + c.pid + ' sonlandiriliyor');
        try {
          c.kill();
        } catch {
          /* zaten olmus */
        }
      }
    }, secenek?.durdurMs ?? 1500);
    c.once('exit', () => {
      clearTimeout(zaman);
      coz();
    });
    if (c.exitCode !== null || c.signalCode !== null) {
      clearTimeout(zaman);
      coz();
      return;
    }
    try {
      c.stdin.write('cik\n');
      c.stdin.end();
    } catch {
      /* boru kapali */
    }
  });
}

/** Yalniz uc gecerli komut; yardimci yoksa sessizce yok sayilir. */
function komut(k) {
  if (!KOMUTLAR.has(k)) return false;
  const c = cocuk;
  if (!c || !c.stdin.writable) return false;
  try {
    c.stdin.write(k + '\n');
    return true;
  } catch {
    return false;
  }
}

/** Son yayinlanan durum (kopya) ya da null. */
function anlik() {
  return durum ? kopya(durum) : null;
}

module.exports = { baslat, durdur, komut, anlik, uygulamaAdi };
