// Model saglayicisi testi (v3.0): saf Node. Electron, claude ve gercek ~/.kokpit YOK.
// KOKPIT_DIZIN require'dan ONCE gecici dizine cevrilir (config.cjs ortami okur).
const fs = require('fs');
const os = require('os');
const path = require('path');

const TEST_DIZIN = fs.mkdtempSync(path.join(os.tmpdir(), 'kokpit-saglayici-'));
process.env.KOKPIT_DIZIN = TEST_DIZIN;
const saglayici = require('../electron/saglayici.cjs');

const DOSYA = path.join(TEST_DIZIN, 'saglayici.json');
const KEY = 'sk-test'; // ciktiya ASLA yazilmaz; yalniz karsilastirmalarda kullanilir.

let basarisiz = 0;
function kontrol(ad, kosul, detay) {
  console.log((kosul ? '  ok   ' : '  FAIL ') + ad + (kosul || detay === undefined ? '' : '  -> ' + detay));
  if (!kosul) basarisiz++;
}
function gecerliJson() {
  try {
    const a = JSON.parse(fs.readFileSync(DOSYA, 'utf8'));
    return Boolean(a) && a.surum === 1 && typeof a.saglayicilar === 'object';
  } catch {
    return false;
  }
}

console.log('Varsayilanlar');
const g0 = saglayici.gorunum();
kontrol('secili varsayilan', g0.secili === 'varsayilan');
kontrol('efor varsayilan', g0.efor === 'varsayilan');
kontrol(
  'deepseek preset degerleri korunuyor',
  g0.deepseek.baseUrl === 'https://api.deepseek.com/anthropic' &&
    g0.deepseek.model === 'deepseek-flash[1m]' &&
    g0.deepseek.hafifModel === 'deepseek-flash' &&
    g0.deepseek.altModel === 'deepseek-flash' &&
    g0.deepseek.baglam === 786432
);
kontrol(
  'opencode preset degerleri korunuyor',
  g0.opencode.baseUrl === 'https://opencode.ai/inference/go/anthropic' &&
    g0.opencode.model === 'deepseek-v4.1-flash[1m]' &&
    g0.opencode.hafifModel === 'deepseek-v4.1-flash' &&
    g0.opencode.altModel === 'deepseek-v4.1-flash' &&
    g0.opencode.baglam === 786432
);
kontrol(
  'hicbir anahtar yok',
  g0.anthropic.anahtarVar === false &&
    g0.opencode.anahtarVar === false &&
    g0.deepseek.anahtarVar === false &&
    g0.ozel.anahtarVar === false
);
kontrol('DOSYA gecici dizinde', saglayici.DOSYA === DOSYA);

console.log('Gorunum anahtar degeri tasimiyor');
let sonuc = saglayici.kaydet({ secili: 'deepseek', deepseek: { anahtar: KEY } });
kontrol('deepseek kaydi ok', sonuc.ok === true);
kontrol('donen gorunumde anahtar degeri yok', !JSON.stringify(sonuc.gorunum).includes(KEY));
kontrol('anahtarVar true', sonuc.gorunum.deepseek.anahtarVar === true);
kontrol('diskten okunan gorunumde de anahtar yok', !JSON.stringify(saglayici.gorunum()).includes(KEY));
kontrol('dosya gecerli JSON (ilk yazim)', gecerliJson());

console.log('DeepSeek ortami');
let o = saglayici.ortam();
kontrol('secili deepseek', o.secili === 'deepseek');
kontrol('BASE_URL tam', o.ekle.ANTHROPIC_BASE_URL === 'https://api.deepseek.com/anthropic');
kontrol('AUTH_TOKEN yazildi', o.ekle.ANTHROPIC_AUTH_TOKEN === KEY);
kontrol(
  'MODEL + OPUS/SONNET/FABLE tam',
  o.ekle.ANTHROPIC_MODEL === 'deepseek-flash[1m]' &&
    o.ekle.ANTHROPIC_DEFAULT_OPUS_MODEL === 'deepseek-flash[1m]' &&
    o.ekle.ANTHROPIC_DEFAULT_SONNET_MODEL === 'deepseek-flash[1m]' &&
    o.ekle.ANTHROPIC_DEFAULT_FABLE_MODEL === 'deepseek-flash[1m]'
);
kontrol('HAIKU hafif model', o.ekle.ANTHROPIC_DEFAULT_HAIKU_MODEL === 'deepseek-flash');
kontrol('SUBAGENT alt model', o.ekle.CLAUDE_CODE_SUBAGENT_MODEL === 'deepseek-flash');
kontrol('AUTO_COMPACT penceresi', o.ekle.CLAUDE_CODE_AUTO_COMPACT_WINDOW === '786432');
kontrol('API_KEY silinmiyor (miras korunur)', !o.sil.includes('ANTHROPIC_API_KEY'));
kontrol('AUTH_TOKEN silinmiyor (token saglayicilari)', !o.sil.includes('ANTHROPIC_AUTH_TOKEN'));
kontrol('anahtar dolu -> AUTH_TOKEN ekleniyor', o.ekle.ANTHROPIC_AUTH_TOKEN === KEY);
kontrol('deprecated SMALL_FAST siliniyor, yazilmiyor',
  o.sil.includes('ANTHROPIC_SMALL_FAST_MODEL') && !('ANTHROPIC_SMALL_FAST_MODEL' in o.ekle));
kontrol('efor varsayilanda EFFORT eklenmiyor', !('CLAUDE_CODE_EFFORT_LEVEL' in o.ekle));

console.log("Anthropic anahtari API_KEY'e yazilir (x-api-key)");
sonuc = saglayici.kaydet({ secili: 'anthropic', efor: 'varsayilan', anthropic: { anahtar: KEY } });
kontrol('anthropic kaydi ok', sonuc.ok === true);
o = saglayici.ortam();
kontrol('sil listesinde API_KEY YOK (miras korunur)', !o.sil.includes('ANTHROPIC_API_KEY'));
kontrol('BASE_URL siliniyor (gercek Anthropic)', o.sil.includes('ANTHROPIC_BASE_URL'));
kontrol('AUTH_TOKEN siliniyor', o.sil.includes('ANTHROPIC_AUTH_TOKEN'));
kontrol('API_KEY ekleniyor (x-api-key)', o.ekle.ANTHROPIC_API_KEY === KEY);
kontrol('AUTH_TOKEN eklenmiyor (Bearer degil)', !('ANTHROPIC_AUTH_TOKEN' in o.ekle));
kontrol('ekle icinde BASE_URL yok', !('ANTHROPIC_BASE_URL' in o.ekle));
kontrol('dosya gecerli JSON (anthropic)', gecerliJson());

sonuc = saglayici.kaydet({ anthropic: { anahtarSil: true } });
o = saglayici.ortam();
kontrol('anahtarSil sonrasi API_KEY eklenmiyor', !('ANTHROPIC_API_KEY' in o.ekle));
kontrol('anahtarSil gorunume yansidi', saglayici.gorunum().anthropic.anahtarVar === false);

console.log('Varsayilan + efor');
sonuc = saglayici.kaydet({ secili: 'varsayilan', efor: 'high' });
kontrol('varsayilan kaydi ok', sonuc.ok === true);
o = saglayici.ortam();
kontrol('sil listesi bos', o.sil.length === 0);
kontrol('ekle yalniz EFFORT', Object.keys(o.ekle).length === 1 && o.ekle.CLAUDE_CODE_EFFORT_LEVEL === 'high');

console.log('Efor degerleri');
kontrol('xhigh kabul', saglayici.kaydet({ efor: 'xhigh' }).ok === true);
kontrol('max kabul', saglayici.kaydet({ efor: 'max' }).ok === true);
o = saglayici.ortam();
kontrol('max ortama geciyor', o.ekle.CLAUDE_CODE_EFFORT_LEVEL === 'max');
sonuc = saglayici.kaydet({ efor: 'ultracode' });
kontrol('ultracode reddedildi', sonuc.ok === false && typeof sonuc.hata === 'string');
kontrol('red sonrasi onceki efor korunuyor', sonuc.gorunum.efor === 'max');
kontrol('hata metni anahtar icermiyor', !(sonuc.hata ?? '').includes(KEY));

console.log('Ozel API');
sonuc = saglayici.kaydet({
  secili: 'ozel',
  efor: 'varsayilan',
  ozel: {
    baseUrl: 'https://gw.example.com/anthropic',
    model: 'gw-main',
    hafifModel: '',
    altModel: '',
    baglam: 0,
    anahtar: '',
  },
});
kontrol('ozel kaydi ok', sonuc.ok === true);
kontrol('ozel kaydi okunuyor', saglayici.gorunum().ozel.baseUrl === 'https://gw.example.com/anthropic');
o = saglayici.ortam();
kontrol('ozel BASE_URL tam', o.ekle.ANTHROPIC_BASE_URL === 'https://gw.example.com/anthropic');
kontrol('ozel API_KEY silinmiyor', !o.sil.includes('ANTHROPIC_API_KEY'));
kontrol(
  'ozel model eslemesi tam',
  o.ekle.ANTHROPIC_MODEL === 'gw-main' &&
    o.ekle.ANTHROPIC_DEFAULT_OPUS_MODEL === 'gw-main' &&
    o.ekle.ANTHROPIC_DEFAULT_SONNET_MODEL === 'gw-main' &&
    o.ekle.ANTHROPIC_DEFAULT_FABLE_MODEL === 'gw-main'
);
kontrol('bos hafif model ana modelden turer', o.ekle.ANTHROPIC_DEFAULT_HAIKU_MODEL === 'gw-main');
kontrol('bos alt model ana modelden turer', o.ekle.CLAUDE_CODE_SUBAGENT_MODEL === 'gw-main');
kontrol('ozel: AUTH_TOKEN silinmiyor (bos anahtar mirasi korur)', !o.sil.includes('ANTHROPIC_AUTH_TOKEN'));
kontrol('bos anahtar AUTH_TOKEN eklemiyor', !('ANTHROPIC_AUTH_TOKEN' in o.ekle));
kontrol('baglam 0 AUTO_COMPACT eklemiyor', !('CLAUDE_CODE_AUTO_COMPACT_WINDOW' in o.ekle));

console.log('Zorunlu Base URL');
sonuc = saglayici.kaydet({ secili: 'ozel', ozel: { baseUrl: '' } });
kontrol(
  'ozel: bos baseUrl reddedildi',
  sonuc.ok === false && sonuc.hata === 'Özel API için Base URL gerekli.'
);
kontrol(
  'ozel: ret sonrasi baseUrl korunuyor',
  sonuc.gorunum.ozel.baseUrl === 'https://gw.example.com/anthropic'
);

console.log('Gecersiz degerler');
sonuc = saglayici.kaydet({ ozel: { baglam: 50000 } });
kontrol('baglam 50000 reddedildi', sonuc.ok === false && /100000/.test(sonuc.hata ?? ''));
kontrol('reddedilen yama yazilmadi (baseUrl yerinde)',
  sonuc.gorunum.ozel.baseUrl === 'https://gw.example.com/anthropic' && sonuc.gorunum.ozel.baglam === 0);
sonuc = saglayici.kaydet({ ozel: { baseUrl: 'ftp://example.com/x' } });
kontrol('ftp:// reddedildi', sonuc.ok === false && typeof sonuc.hata === 'string');
sonuc = saglayici.kaydet({ ozel: { anahtar: KEY + '\n' } });
kontrol('satir sonlu anahtar reddedildi', sonuc.ok === false && typeof sonuc.hata === 'string');
kontrol('anahtar hatasi anahtar degerini icermiyor', !(sonuc.hata ?? '').includes(KEY));
sonuc = saglayici.kaydet({ secili: 'bilinmeyen' });
kontrol('gecersiz secili reddedildi', sonuc.ok === false && typeof sonuc.hata === 'string');
kontrol('gecersiz secili mevcut secimi koruyor', sonuc.gorunum.secili === 'ozel');
kontrol('hata sonrasi dosya hala gecerli JSON', gecerliJson());

console.log('DeepSeek Base URL ve bos ana model');
sonuc = saglayici.kaydet({ secili: 'deepseek' });
kontrol(
  'deepseek secimi (preset baseUrl) kabul',
  sonuc.ok === true && sonuc.gorunum.deepseek.baseUrl === 'https://api.deepseek.com/anthropic'
);
sonuc = saglayici.kaydet({ deepseek: { baseUrl: '' } });
kontrol(
  'deepseek: bos baseUrl reddedildi',
  sonuc.ok === false && sonuc.hata === 'DeepSeek için Base URL gerekli.'
);
kontrol(
  'deepseek: ret sonrasi baseUrl korunuyor',
  sonuc.gorunum.deepseek.baseUrl === 'https://api.deepseek.com/anthropic'
);
sonuc = saglayici.kaydet({ deepseek: { anahtar: '', model: '', hafifModel: '', altModel: '' } });
kontrol('bos ana model kaydi kabul', sonuc.ok === true);
o = saglayici.ortam();
kontrol('deepseek: bos anahtar AUTH_TOKEN silmiyor (miras korunur)', !o.sil.includes('ANTHROPIC_AUTH_TOKEN'));
kontrol('deepseek: bos anahtar AUTH_TOKEN eklemiyor', !('ANTHROPIC_AUTH_TOKEN' in o.ekle));
kontrol(
  "bos ana model model env'i yazmiyor",
  !('ANTHROPIC_MODEL' in o.ekle) &&
    !('ANTHROPIC_DEFAULT_OPUS_MODEL' in o.ekle) &&
    !('ANTHROPIC_DEFAULT_SONNET_MODEL' in o.ekle) &&
    !('ANTHROPIC_DEFAULT_FABLE_MODEL' in o.ekle) &&
    !('ANTHROPIC_DEFAULT_HAIKU_MODEL' in o.ekle) &&
    !('CLAUDE_CODE_SUBAGENT_MODEL' in o.ekle)
);
kontrol('dosya gecerli JSON (bos model)', gecerliJson());

console.log('OpenCode Go');
sonuc = saglayici.kaydet({ secili: 'opencode', opencode: { anahtar: KEY } });
kontrol('opencode kaydi ok', sonuc.ok === true);
kontrol('opencode gorunumu anahtar degeri tasimiyor', !JSON.stringify(sonuc.gorunum).includes(KEY));
kontrol('opencode anahtarVar true', sonuc.gorunum.opencode.anahtarVar === true);
kontrol(
  'opencode gorunumunde preset baseUrl',
  sonuc.gorunum.opencode.baseUrl === 'https://opencode.ai/inference/go/anthropic'
);
o = saglayici.ortam();
kontrol('secili opencode', o.secili === 'opencode');
kontrol('opencode BASE_URL presetten', o.ekle.ANTHROPIC_BASE_URL === 'https://opencode.ai/inference/go/anthropic');
kontrol('opencode AUTH_TOKEN yazildi', o.ekle.ANTHROPIC_AUTH_TOKEN === KEY);
kontrol(
  'opencode MODEL + OPUS/SONNET/FABLE tam',
  o.ekle.ANTHROPIC_MODEL === 'deepseek-v4.1-flash[1m]' &&
    o.ekle.ANTHROPIC_DEFAULT_OPUS_MODEL === 'deepseek-v4.1-flash[1m]' &&
    o.ekle.ANTHROPIC_DEFAULT_SONNET_MODEL === 'deepseek-v4.1-flash[1m]' &&
    o.ekle.ANTHROPIC_DEFAULT_FABLE_MODEL === 'deepseek-v4.1-flash[1m]'
);
kontrol('opencode HAIKU hafif model', o.ekle.ANTHROPIC_DEFAULT_HAIKU_MODEL === 'deepseek-v4.1-flash');
kontrol('opencode SUBAGENT alt model', o.ekle.CLAUDE_CODE_SUBAGENT_MODEL === 'deepseek-v4.1-flash');
kontrol('opencode AUTO_COMPACT penceresi', o.ekle.CLAUDE_CODE_AUTO_COMPACT_WINDOW === '786432');
kontrol('opencode API_KEY silinmiyor (miras korunur)', !o.sil.includes('ANTHROPIC_API_KEY'));
kontrol('opencode AUTH_TOKEN silinmiyor (token saglayicilari)', !o.sil.includes('ANTHROPIC_AUTH_TOKEN'));
kontrol('dosya gecerli JSON (opencode)', gecerliJson());

sonuc = saglayici.kaydet({ opencode: { anahtar: '' } });
kontrol('opencode bos anahtar kaydi ok', sonuc.ok === true);
kontrol('opencode bos anahtar anahtarVar false', sonuc.gorunum.opencode.anahtarVar === false);
o = saglayici.ortam();
kontrol('opencode: bos anahtar AUTH_TOKEN silmiyor (miras korunur)', !o.sil.includes('ANTHROPIC_AUTH_TOKEN'));
kontrol('opencode: bos anahtar AUTH_TOKEN eklemiyor', !('ANTHROPIC_AUTH_TOKEN' in o.ekle));

sonuc = saglayici.kaydet({ opencode: { baseUrl: '' } });
kontrol(
  'opencode: bos baseUrl reddedildi',
  sonuc.ok === false && sonuc.hata === 'OpenCode Go için Base URL gerekli.'
);
kontrol(
  'opencode: ret sonrasi baseUrl korunuyor',
  sonuc.gorunum.opencode.baseUrl === 'https://opencode.ai/inference/go/anthropic'
);

console.log('anahtarSil');
saglayici.kaydet({ deepseek: { anahtar: KEY }, secili: 'ozel' });
kontrol('anahtar yeniden yazildi', saglayici.gorunum().deepseek.anahtarVar === true);
sonuc = saglayici.kaydet({ deepseek: { anahtarSil: true, anahtar: KEY } });
kontrol('anahtarSil yazilan anahtari ezdi', sonuc.ok === true && saglayici.gorunum().deepseek.anahtarVar === false);
kontrol('dosya gecerli JSON (anahtarSil)', gecerliJson());
kontrol('gecici .tmp dosyasi kalmadi',
  !fs.readdirSync(TEST_DIZIN).some((ad) => ad.endsWith('.tmp')));

console.log('Eski dosyadan gecis (opencode kaydi yok)');
const ESKI_DIZIN = fs.mkdtempSync(path.join(os.tmpdir(), 'kokpit-saglayici-eski-'));
const ESKI_ANAHTAR = 'sk-eski-saglayici'; // ciktiya yazilmaz
fs.writeFileSync(
  path.join(ESKI_DIZIN, 'saglayici.json'),
  JSON.stringify(
    {
      surum: 1,
      secili: 'deepseek',
      efor: 'varsayilan',
      saglayicilar: {
        anthropic: { anahtar: '' },
        deepseek: {
          anahtar: ESKI_ANAHTAR,
          baseUrl: 'https://api.deepseek.com/anthropic',
          model: 'deepseek-flash[1m]',
          hafifModel: 'deepseek-flash',
          altModel: 'deepseek-flash',
          baglam: 786432,
        },
        ozel: { anahtar: '', baseUrl: '', model: '', hafifModel: '', altModel: '', baglam: 0 },
      },
    },
    null,
    2
  )
);
const eskiDizin = process.env.KOKPIT_DIZIN;
process.env.KOKPIT_DIZIN = ESKI_DIZIN;
delete require.cache[require.resolve('../electron/config.cjs')];
delete require.cache[require.resolve('../electron/saglayici.cjs')];
const eski = require('../electron/saglayici.cjs');
const ge = eski.gorunum();
kontrol('eski dosyada secili korunuyor', ge.secili === 'deepseek');
kontrol('eski dosyada deepseek anahtari korunuyor', ge.deepseek.anahtarVar === true);
kontrol(
  'opencode on tanimla geldi',
  ge.opencode.baseUrl === 'https://opencode.ai/inference/go/anthropic' &&
    ge.opencode.model === 'deepseek-v4.1-flash[1m]' &&
    ge.opencode.hafifModel === 'deepseek-v4.1-flash' &&
    ge.opencode.altModel === 'deepseek-v4.1-flash' &&
    ge.opencode.baglam === 786432 &&
    ge.opencode.anahtarVar === false
);
const eskiOrtam = eski.ortam();
kontrol('eski deepseek anahtari ortama geciyor', eskiOrtam.ekle.ANTHROPIC_AUTH_TOKEN === ESKI_ANAHTAR);
eski.kaydet({ efor: 'varsayilan' });
const eskiYazilan = JSON.parse(fs.readFileSync(path.join(ESKI_DIZIN, 'saglayici.json'), 'utf8'));
kontrol('surum 1 kaliyor', eskiYazilan.surum === 1);
kontrol('opencode kaydi dosyaya islendi', eskiYazilan.saglayicilar.opencode.baseUrl === 'https://opencode.ai/inference/go/anthropic');
process.env.KOKPIT_DIZIN = eskiDizin;
delete require.cache[require.resolve('../electron/config.cjs')];
delete require.cache[require.resolve('../electron/saglayici.cjs')];
fs.rmSync(ESKI_DIZIN, { recursive: true, force: true });

// Gecici dizin silinir; gercek ~/.kokpit'e hic dokunulmadi.
try {
  fs.rmSync(TEST_DIZIN, { recursive: true, force: true });
} catch {
  /* bir surec tutuyorsa temp'te kalir */
}

console.log(basarisiz === 0 ? '\nTUMU GECTI' : `\n${basarisiz} KONTROL BASARISIZ`);
process.exit(basarisiz === 0 ? 0 : 1);
