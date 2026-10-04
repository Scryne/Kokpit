// Oturum etkinligi: Claude Code hook olaylarini (HTTP hook, kanca.cjs) oturum durumuna cevirir.
// SAF modul: disk, ag, Electron yok. Girdi hook govdesi + simdi, cikti yeni durum nesnesi.
// Boylece scripts/test-kanca.cjs gercek payload sekilleriyle (2026-10-03 spike'inda olculdu)
// dogrudan sinar.
//
// Durumlar:
//   bosta     — oturum acik, henuz tur yok (SessionStart HTTP hook'u GELMIYOR, olculdu;
//               ilk olay UserPromptSubmit)
//   calisiyor — UserPromptSubmit ile Stop arasi
//   bekliyor  — claude kullanicidan cevap istiyor (AskUserQuestion, izin, elicitation)
//   bitti     — Stop geldi: tur tamam, sira kullanicida
//   kapandi   — SessionEnd

const path = require('path');

const SON_OLAY_SINIRI = 30;
const ALT_AJAN_ZAMAN_ASIMI = 15 * 60 * 1000;

function yeniDurum(simdi) {
  return {
    durum: 'bosta',
    claudeOturumu: null,
    arac: null, // { ad, hedef, alt, arti, eksi, basladi, bitti }
    soru: null, // bekliyor iken kullaniciya sorulan sey (kisa)
    soruAyrinti: null, // AskUserQuestion ise secenekler (ada'dan cevap icin), bkz. soruAyrintisi
    sonSoz: null, // bitti iken turun son mesaji (Stop last_assistant_message), bkz. sonSoz
    turBasladi: null,
    sonTurSuresiMs: null,
    degisti: simdi, // son islenen olay (herhangi biri)
    durumZamani: simdi, // `durum` en son ne zaman degisti ("ne zamandir bekliyor")
    // Acik sorunun dogdugu an: ada'dan cevabin damgasi. `degisti`ye baglanamaz — soru acikken arka
    // plan alt ajaninin araclari ve 60 sn sonraki idle_prompt da olay uretir (olculdu 2026-10-04).
    soruZamani: null,
    altlar: {}, // calisan alt ajanlar: { [agent_id]: { tur, t } } (SubagentStart..SubagentStop)
    ozet: { araclar: 0, dosyalar: [], arti: 0, eksi: 0, turlar: 0 },
    olaylar: [], // son N arac: { t, ad, hedef, arti, eksi, alt }
  };
}

function kisalt(metin, n) {
  const s = String(metin ?? '').replace(/\s+/g, ' ').trim();
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

function dosyaAdi(yol) {
  return yol ? path.win32.basename(String(yol)) : '';
}

/** Aracin "neye" dokundugu, tek kisa ifade. Bilinmeyen arac bos doner, ad yeter. */
function hedefOzeti(ad, girdi) {
  const g = girdi && typeof girdi === 'object' ? girdi : {};
  switch (ad) {
    case 'Read':
    case 'Edit':
    case 'MultiEdit':
    case 'Write':
      return dosyaAdi(g.file_path);
    case 'NotebookEdit':
      return dosyaAdi(g.notebook_path);
    case 'Bash':
    case 'PowerShell':
      return kisalt(g.command, 72);
    case 'Grep':
      return kisalt(g.pattern, 48);
    case 'Glob':
      return kisalt(g.pattern, 48);
    case 'WebFetch':
      try {
        return new URL(g.url).hostname;
      } catch {
        return kisalt(g.url, 48);
      }
    case 'WebSearch':
      return kisalt(g.query, 56);
    case 'Agent':
    case 'Task':
      return kisalt(g.description || g.subagent_type, 56);
    case 'Skill':
      return kisalt(g.skill, 40);
    case 'AskUserQuestion':
      return kisalt(g.questions?.[0]?.question, 80);
    default:
      if (ad && ad.startsWith('mcp__')) {
        const [, sunucu, arac] = ad.split('__');
        return (sunucu || '') + (arac ? ' · ' + arac : '');
      }
      return '';
  }
}

/** Ayni anda en fazla bu kadar soru (AskUserQuestion'un kendi siniri 4). */
const SORU_SINIRI = 4;

/**
 * AskUserQuestion'un sorulari ve secenekleri: Kokpit/ada bunlari dugme olarak gosterir.
 * TUI klavyesi gercek claude 2.1.289 ile olculdu (docs soylemiyor):
 *   - Tek soru (10-04): secenekler 1..N, rakam secip GONDERIR (Enter yok); N+1 "Type something"
 *     rakami serbest metin kutusunu acar, metin + Enter gonderir; N+2 "Chat about this".
 *   - Cok soru (10-04, v2.4): ayni tuslar, ama secim/metin sonraki soruya GECER; son sorudan
 *     sonra "Review your answers" ekrani gelir, orada 1 = "Submit answers" (2 = Cancel).
 *     Tuslar arasi 250 ms yetti (dizi formun ilk cizimi bittikten sonra baslarsa).
 * Coklu secim toggle'li bir akis (30 gunde 60 sorunun 2'si): oradan cevap verilmez,
 * `cevaplanabilir` false olur ve arayuz terminale yonlendirir.
 */
function soruAyrintisi(girdi) {
  const ham = Array.isArray(girdi?.questions) ? girdi.questions.filter((q) => q && typeof q === 'object') : [];
  if (ham.length === 0) return null;
  const sorular = ham.slice(0, SORU_SINIRI).map((q) => ({
    soru: kisalt(q.question, 240),
    baslik: kisalt(q.header, 24),
    secenekler: (Array.isArray(q.options) ? q.options : [])
      .slice(0, 4)
      .map((o) => ({ etiket: kisalt(o?.label, 60), aciklama: kisalt(o?.description, 140) }))
      .filter((o) => o.etiket),
  }));
  const coklu = ham.some((q) => q.multiSelect === true);
  return {
    sorular,
    coklu,
    soruSayisi: ham.length,
    cevaplanabilir: !coklu && ham.length <= SORU_SINIRI && sorular.every((q) => q.secenekler.length > 0),
  };
}

/**
 * Stop'un `last_assistant_message`'i (claude 2.1.289'da var, olculdu): turun son sozu. Ada
 * "bitti" dediginde ne dedigini gosterir; Kokpit'e gecmeden cevap verilebilsin. Bellekte kalir,
 * deftere yazilmaz (README kural 7). Markdown'in yalniz gurultusu atilir; metin degismez.
 */
const SON_SOZ_SINIRI = 4000;
function sonSoz(metin) {
  if (typeof metin !== 'string') return null;
  const s = metin
    .replace(/\r\n?/g, '\n')
    .replace(/^#{1,6}\s+/gm, '')
    // `__init__` gibi adlar bozulmasin diye yalniz ** (alt cizgi vurgusu atilmaz).
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (!s) return null;
  return s.length > SON_SOZ_SINIRI ? s.slice(0, SON_SOZ_SINIRI - 1) + '…' : s;
}

/** Gosterilen arac adi: mcp araclari "MCP", gerisi oldugu gibi. */
function aracAdi(ad) {
  return ad && ad.startsWith('mcp__') ? 'MCP' : ad || '?';
}

/**
 * Dosya degisikligi sayilari. Edit/MultiEdit/Write(update) `structuredPatch` tasir (hunk
 * satirlari '+', '-', ' ' onekli); Write(create) yeni dosyanin satirlarinin tamami eklenmistir.
 * Sonuc yoksa (PreToolUse) girdiden tahmin edilmez: yanlis sayi, sayi olmamasindan kotudur.
 */
function farkSayilari(ad, girdi, sonuc) {
  if (!['Edit', 'MultiEdit', 'Write', 'NotebookEdit'].includes(ad)) return null;
  const r = sonuc && typeof sonuc === 'object' ? sonuc : null;
  if (!r) return null;
  if (Array.isArray(r.structuredPatch) && r.structuredPatch.length > 0) {
    let arti = 0;
    let eksi = 0;
    for (const h of r.structuredPatch) {
      for (const satir of h.lines || []) {
        if (satir.startsWith('+')) arti++;
        else if (satir.startsWith('-')) eksi++;
      }
    }
    return { arti, eksi };
  }
  if (ad === 'Write' && r.type === 'create') {
    const icerik = typeof girdi?.content === 'string' ? girdi.content : '';
    const satirlar = icerik === '' ? 0 : icerik.replace(/\r?\n$/, '').split(/\r?\n/).length;
    return { arti: satirlar, eksi: 0 };
  }
  return null;
}

const BEKLETEN_BILDIRIMLER = new Set([
  'permission_prompt',
  'elicitation_dialog',
  'elicitation_url_dialog',
  'agent_needs_input',
]);

/**
 * Bir hook govdesini isler. `onceki` degistirilmez; yeni nesne doner.
 * `sinyal`: arayuzun zil/bildirim karari icin — 'bitti' | 'bekliyor' | null.
 */
function isle(onceki, govde, simdi = Date.now()) {
  const d = onceki ? structuredClone(onceki) : yeniDurum(simdi);
  const olay = govde?.hook_event_name;
  let sinyal = null;
  if (govde?.session_id) d.claudeOturumu = govde.session_id;
  const alt = Boolean(govde?.agent_id);
  const oncekiDurum = d.durum;
  if (!d.altlar) d.altlar = {};
  // Alt ajanlar: SubagentStart..SubagentStop arasi (gercek claude 2.1.289: ikisi de agent_id +
  // agent_type tasir; ana tur Stop dedikten SONRA arka planda calismaya devam edebilir). Araclari
  // da agent_id tasir: kayit tazelenir. Stop'u kacirilan ajan 15 dk sessizlikte dusurulur.
  if (alt && (olay === 'PreToolUse' || olay === 'PostToolUse' || olay === 'SubagentStart')) {
    d.altlar[String(govde.agent_id)] = { tur: kisalt(govde.agent_type, 40), t: simdi };
  }
  for (const [k, a] of Object.entries(d.altlar)) if (simdi - a.t > ALT_AJAN_ZAMAN_ASIMI) delete d.altlar[k];

  switch (olay) {
    case 'SessionStart':
      d.durum = 'bosta';
      break;

    case 'SubagentStart':
      break; // kayit yukarida
    case 'SubagentStop':
      if (alt) delete d.altlar[String(govde.agent_id)];
      break;

    case 'UserPromptSubmit':
      d.durum = 'calisiyor';
      d.turBasladi = simdi;
      d.arac = null;
      d.soru = null;
      d.soruAyrinti = null;
      d.sonSoz = null;
      d.ozet.turlar++;
      break;

    case 'PreToolUse': {
      const ad = govde.tool_name;
      d.arac = {
        ad: aracAdi(ad),
        hedef: hedefOzeti(ad, govde.tool_input),
        alt,
        arti: null,
        eksi: null,
        basladi: simdi,
        bitti: null,
      };
      if (ad === 'AskUserQuestion' && !alt) {
        d.durum = 'bekliyor';
        d.soru = hedefOzeti(ad, govde.tool_input) || 'Soru soruyor';
        d.soruAyrinti = soruAyrintisi(govde.tool_input);
        sinyal = 'bekliyor';
      } else if (d.durum !== 'bekliyor') {
        d.durum = 'calisiyor';
        if (d.turBasladi === null) d.turBasladi = simdi;
      }
      break;
    }

    case 'PostToolUse': {
      const ad = govde.tool_name;
      const fark = farkSayilari(ad, govde.tool_input, govde.tool_response);
      const hedef = hedefOzeti(ad, govde.tool_input);
      const ayniArac = d.arac && d.arac.ad === aracAdi(ad) && d.arac.bitti === null;
      d.arac = {
        ad: aracAdi(ad),
        hedef,
        alt,
        arti: fark ? fark.arti : null,
        eksi: fark ? fark.eksi : null,
        basladi: ayniArac ? d.arac.basladi : simdi,
        bitti: simdi,
      };
      d.ozet.araclar++;
      if (fark) {
        d.ozet.arti += fark.arti;
        d.ozet.eksi += fark.eksi;
        const yol = govde.tool_input?.file_path || govde.tool_input?.notebook_path;
        if (yol && !d.ozet.dosyalar.includes(yol)) d.ozet.dosyalar.push(yol);
      }
      d.olaylar.push({ t: simdi, ad: aracAdi(ad), hedef, alt, arti: d.arac.arti, eksi: d.arac.eksi });
      if (d.olaylar.length > SON_OLAY_SINIRI) d.olaylar.splice(0, d.olaylar.length - SON_OLAY_SINIRI);
      if (ad === 'AskUserQuestion' && d.durum === 'bekliyor') {
        d.durum = 'calisiyor';
        d.soru = null;
        d.soruAyrinti = null;
      }
      break;
    }

    case 'Notification': {
      const tur = govde.notification_type;
      if (BEKLETEN_BILDIRIMLER.has(tur) && d.durum !== 'bitti') {
        // AskUserQuestion zaten secenekleriyle bekliyorsa ayni bekleyisin bildirimi onu ezmesin.
        if (d.durum === 'bekliyor' && d.soruAyrinti) break;
        d.durum = 'bekliyor';
        d.soru = kisalt(govde.message, 80) || 'Cevap bekliyor';
        d.soruAyrinti = null;
        sinyal = 'bekliyor';
      }
      // idle_prompt bilerek yok sayilir: Stop'tan ~60 sn sonra gelir, "bitti" zaten soyledi.
      break;
    }

    case 'Stop':
      if (alt) break;
      d.durum = 'bitti';
      d.sonTurSuresiMs = d.turBasladi !== null ? simdi - d.turBasladi : null;
      d.turBasladi = null;
      d.soru = null;
      d.soruAyrinti = null;
      d.sonSoz = sonSoz(govde.last_assistant_message);
      sinyal = 'bitti';
      break;

    case 'SessionEnd':
      d.durum = 'kapandi';
      d.turBasladi = null;
      d.soru = null;
      d.soruAyrinti = null;
      d.altlar = {};
      break;

    default:
      return { durum: onceki ?? d, sinyal: null, degisti: false };
  }

  d.degisti = simdi;
  if (d.durum !== oncekiDurum) d.durumZamani = simdi;
  // Soru damgasi yalniz yeni bir bekleyis dogunca degisir; bekleyis bitince silinir.
  if (sinyal === 'bekliyor') d.soruZamani = simdi;
  else if (d.durum !== 'bekliyor') d.soruZamani = null;
  return { durum: d, sinyal, degisti: true };
}

/** Defter ve Pano icin kalici ozet: dosya listesi yerine sayisi. */
function kaliciOzet(d) {
  if (!d) return null;
  const o = d.ozet;
  if (o.turlar === 0 && o.araclar === 0) return null;
  return { turlar: o.turlar, araclar: o.araclar, dosya: o.dosyalar.length, arti: o.arti, eksi: o.eksi };
}

/** Statusline JSON'undan limit ve baglam (durum-satiri.cjs iletir). */
function durumSatiri(govde) {
  const rl = govde?.rate_limits || {};
  const limit = (x) =>
    x && Number.isFinite(Number(x.used_percentage))
      ? { yuzde: Number(x.used_percentage), sifirlanma: Number(x.resets_at) * 1000 || null }
      : null;
  const cw = govde?.context_window || {};
  const u = cw.current_usage || {};
  const baglamToken =
    (Number(u.input_tokens) || 0) +
    (Number(u.cache_creation_input_tokens) || 0) +
    (Number(u.cache_read_input_tokens) || 0);
  return {
    limitler: { besSaat: limit(rl.five_hour), hafta: limit(rl.seven_day) },
    baglam:
      baglamToken > 0
        ? {
            token: baglamToken,
            yuzde: Number.isFinite(Number(cw.used_percentage)) ? Number(cw.used_percentage) : null,
            boyut: Number(cw.context_window_size) || null,
            model: govde?.model?.display_name || govde?.model?.id || null,
          }
        : null,
  };
}

module.exports = { yeniDurum, isle, kaliciOzet, durumSatiri, hedefOzeti, farkSayilari, soruAyrintisi, sonSoz };
