// v3.2, gunun brifingi: "Günaydın Ada" (ses), paletten ya da gunun ilk etkinliginde kendiliginden. SAF
// (test-ada dogrudan sinar). Katman 3'un ilk gercek adimi (Kokpit-Plani: "yalniz capraz oneriler"): tek bir
// oturumun icinden gorulmeyen seyler: vadeler, dusen botlar, push bekleyen commit'ler, limit zamanlamasi,
// beyne dusmeyen oturumlar, derleyici. Yeni toplayici yok: girdi durum.py ciktisi + nobet + kanca anligi.
//
// Iki cikti: `maddeler` (Ada kartinda satir satir, onem sirasiyla) ve `cumle` (kulak icin; sembol yok,
// en fazla birkac cumle). Bos gunde de bir sey soyler ("bekleyen bir sey yok"): sessizlik "calismadi" sanilir.

const GUN_SINIRI_SAAT = 5; // gece 05:00'e kadar onceki gun sayilir (gece calismasi ayni gunun parcasi)

/** Brifingin "gunu": 05:00 sinirli yerel tarih (YYYY-MM-DD). */
function brifingGunu(t) {
  const d = new Date(t - GUN_SINIRI_SAAT * 3600_000);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function selam(t) {
  const s = new Date(t).getHours();
  if (s >= 5 && s < 12) return 'Günaydın';
  if (s >= 12 && s < 18) return 'İyi günler';
  return 'İyi akşamlar';
}

/** Arsiv projeleri (envanterde 🟢/✅ olmayan) push/kirli listesine girmez: gurultu. */
function canliProje(p) {
  const e = p.envanter || '';
  if (!e) return true;
  return e.startsWith('🟢') || e.startsWith('✅');
}

const GUN_ADI = ['pazar', 'pazartesi', 'salı', 'çarşamba', 'perşembe', 'cuma', 'cumartesi'];

function sifirlanmaSozu(ms, simdi) {
  if (!ms) return '';
  const d = new Date(ms);
  const saat = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  const fark = Math.round((new Date(d.toDateString()) - new Date(new Date(simdi).toDateString())) / 86400_000);
  if (fark <= 0) return 'bugün ' + saat;
  if (fark === 1) return 'yarın ' + saat;
  return GUN_ADI[d.getDay()] + ' ' + saat;
}

function etkinYuzde(l, simdi) {
  if (!l) return null;
  return l.sifirlanma && l.sifirlanma <= simdi ? 0 : l.yuzde;
}

/**
 * @param {{ durum: any, nobet: any, limitler: any, oturumlar: Record<string, any>, liste: { id: string, ad: string }[],
 *   simdi: number, gece?: { ozet: string, sayi: number } | null }} g
 * @returns {{ gun: string, selam: string, maddeler: { tur: string, metin: string, onem: 'dikkat' | 'normal', proje?: string }[],
 *   cumle: string, oneri: string | null }}
 */
function brifingKur(g) {
  const simdi = g.simdi;
  const maddeler = [];
  const soz = []; // kulak icin parcalar, onem sirasiyla
  let oneri = null;

  // 0. Gece vardiyasi (varsa): sabahin ilk haberi.
  if (g.gece && g.gece.sayi > 0) {
    maddeler.push({ tur: 'gece', metin: g.gece.ozet, onem: 'dikkat' });
    soz.push(g.gece.ozet);
    oneri = oneri ?? 'gece vardiyasının sonuçlarını Teslim sayfasında incele';
  }

  // 1. Vadeler: gecikmis + bugun + yarin.
  const vadeler = (g.durum?.vadeler ?? []).filter((v) => v.kalan_gun <= 1);
  const gecikmis = vadeler.filter((v) => v.kalan_gun < 0);
  const bugun = vadeler.filter((v) => v.kalan_gun === 0);
  const yarin = vadeler.filter((v) => v.kalan_gun === 1);
  const vadeMetni = (v) => String(v.metin || '').replace(/`/g, '');
  for (const v of gecikmis) maddeler.push({ tur: 'vade', metin: v.proje + ': ' + vadeMetni(v) + ' (' + -v.kalan_gun + ' gün gecikti)', onem: 'dikkat', proje: v.proje });
  for (const v of bugun) maddeler.push({ tur: 'vade', metin: v.proje + ': ' + vadeMetni(v) + ' (bugün' + (v.saat ? ' ' + v.saat : '') + ')', onem: 'dikkat', proje: v.proje });
  for (const v of yarin) maddeler.push({ tur: 'vade', metin: v.proje + ': ' + vadeMetni(v) + ' (yarın)', onem: 'normal', proje: v.proje });
  if (gecikmis.length) {
    soz.push(gecikmis.length + ' gecikmiş iş var: ' + gecikmis.slice(0, 2).map((v) => v.proje + ', ' + vadeMetni(v)).join('; ') + '.');
    oneri = oneri ?? gecikmis[0].proje + ' için gecikmiş işi kapat: ' + vadeMetni(gecikmis[0]);
  }
  if (bugun.length) {
    soz.push('Bugün ' + bugun.length + ' tarihli iş var: ' + bugun.slice(0, 3).map((v) => v.proje + ', ' + vadeMetni(v)).join('; ') + '.');
    oneri = oneri ?? bugun[0].proje + ': ' + vadeMetni(bugun[0]);
  }
  if (yarin.length) soz.push('Yarın ' + yarin.length + ' iş var.');

  // 2. Dusen / geciken botlar.
  const isler = g.nobet?.isler ?? [];
  const dusen = isler.filter((x) => x.hal === 'dustu');
  const geciken = isler.filter((x) => x.hal === 'gecikti');
  for (const x of dusen) maddeler.push({ tur: 'bot', metin: x.proje + ' · ' + x.ad + ' düştü' + (x.ayrinti ? ': ' + x.ayrinti : ''), onem: 'dikkat', proje: x.proje });
  for (const x of geciken) maddeler.push({ tur: 'bot', metin: x.proje + ' · ' + x.ad + ' gecikti', onem: 'normal', proje: x.proje });
  if (dusen.length) {
    soz.push(dusen.length + ' bot düştü: ' + dusen.slice(0, 3).map((x) => x.proje + ' ' + x.ad).join(', ') + '.');
    oneri = oneri ?? dusen[0].proje + ' botunu ayağa kaldır (' + dusen[0].ad + ')';
  }

  // 3. Seni bekleyen / biten oturumlar.
  const bekleyen = g.liste.filter((o) => g.oturumlar[o.id]?.durum === 'bekliyor');
  if (bekleyen.length) {
    maddeler.push({ tur: 'oturum', metin: bekleyen.map((o) => o.ad).join(', ') + ' seni bekliyor', onem: 'dikkat' });
    soz.push(bekleyen.map((o) => o.ad).join(' ve ') + ' seni bekliyor.');
    oneri = oneri ?? bekleyen[0].ad + ' oturumuna cevap ver';
  }

  // 4. Push bekleyen commit'ler ve kirli agaclar (canli projeler).
  const projeler = (g.durum?.projeler ?? []).filter((p) => p.git && canliProje(p));
  const push = projeler.filter((p) => (p.git.ahead ?? 0) > 0);
  const kirli = projeler.filter((p) => (p.git.kirli ?? 0) > 0);
  if (push.length) {
    const toplam = push.reduce((n, p) => n + p.git.ahead, 0);
    maddeler.push({ tur: 'push', metin: toplam + ' commit push bekliyor: ' + push.map((p) => p.ad + ' ' + p.git.ahead).join(', '), onem: 'normal' });
    soz.push(push.length + ' projede ' + toplam + ' commit push bekliyor.');
    oneri = oneri ?? 'Teslim sayfasında push bekleyenleri gözden geçir';
  }
  if (kirli.length) {
    maddeler.push({ tur: 'kirli', metin: 'Commit edilmemiş değişiklik: ' + kirli.map((p) => p.ad + ' ' + p.git.kirli).join(', '), onem: 'normal' });
  }

  // 5. Limit zamanlamasi (Kokpit-Plani'nin ornegi: "limit iki gun sonra tazeleniyor").
  const bes = etkinYuzde(g.limitler?.besSaat, simdi);
  const haf = etkinYuzde(g.limitler?.hafta, simdi);
  if (haf !== null && haf >= 70) {
    const s = sifirlanmaSozu(g.limitler.hafta.sifirlanma, simdi);
    maddeler.push({ tur: 'limit', metin: 'Haftalık limit %' + Math.round(haf) + (s ? ', sıfırlanma ' + s : ''), onem: haf >= 90 ? 'dikkat' : 'normal' });
    soz.push('Haftalık limit yüzde ' + Math.round(haf) + (s ? ', ' + s + ' sıfırlanıyor' : '') + (haf >= 90 ? '; ağır işleri sıfırlanmaya bırak.' : '.'));
  }
  if (bes !== null && bes >= 80) {
    const s = sifirlanmaSozu(g.limitler.besSaat.sifirlanma, simdi);
    maddeler.push({ tur: 'limit', metin: '5 saatlik limit %' + Math.round(bes) + (s ? ', sıfırlanma ' + s : ''), onem: 'dikkat' });
    soz.push('Beş saatlik limit yüzde ' + Math.round(bes) + '.');
  }

  // 6. Beyin: dusmeyen oturumlar, geride kalan derleyici, saglik nobeti alarmlari.
  const b = g.durum?.beyin;
  const dusmemis = b?.kapsama?.dusmemis?.length ?? 0;
  if (dusmemis > 0) maddeler.push({ tur: 'beyin', metin: dusmemis + ' oturum beyne düşmedi (Sağlık → Geri doldur)', onem: 'normal' });
  const islenmemis = b?.islenmemis_loglar?.length ?? 0;
  if (islenmemis >= 2) {
    maddeler.push({ tur: 'beyin', metin: 'Derleyici ' + islenmemis + ' günlük logu işlemedi; bilgi tabanı bayat', onem: 'normal' });
    soz.push('Derleyici ' + islenmemis + ' gün geride.');
  }
  for (const a of (g.durum?.saglik?.alarmlar ?? []).slice(0, 3)) maddeler.push({ tur: 'saglik', metin: a, onem: 'normal' });

  const sel = selam(simdi);
  const bas = sel + (g.adi ? ' ' + g.adi : '') + '.';
  const cumle = soz.length
    ? bas + ' ' + soz.slice(0, 6).join(' ') + (oneri ? ' Önerim: ' + oneri + '.' : '')
    : bas + ' Bekleyen bir şey yok: vade, düşen bot, push bekleyen commit yok.';
  return { gun: brifingGunu(simdi), selam: sel, maddeler, cumle, oneri };
}

module.exports = { brifingKur, brifingGunu, GUN_SINIRI_SAAT };
