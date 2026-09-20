// Oturum defteri: Kokpit'in actigi her oturumun kaydi. ~/.kokpit/oturumlar.jsonl
//
// Bu vault'a yazma DEGIL ve ikinci bir toplayici da degil: durum.py'nin bilemeyecegi
// tek veri bu — hangi oturumu Kokpit ne zaman acti, ne zaman kapandi. Tek yazar main.
// Satir basina bir olay (append-only); okurken indirgenir. Dosya buyuse de sorun degil:
// yalnizca son 2000 satir okunur.
//
// Olaylar:
//   { t, calisma, olay: 'acildi',  id, ad, yol }
//   { t, calisma, olay: 'kapandi', id, kod?, sebep? }   sebep: 'kullanici' | 'kabuk' | 'uygulama-kapandi'
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { log } = require('./log.cjs');

const DOSYA = path.join(os.homedir(), '.kokpit', 'oturumlar.jsonl');
const SON_SATIR = 2000;

// Her uygulama calismasinin kendi kimligi var: "onceki calismada acik kalanlar" bununla bulunur.
const CALISMA = Date.now().toString(36) + '-' + crypto.randomBytes(3).toString('hex');

function ekle(olay) {
  try {
    fs.mkdirSync(path.dirname(DOSYA), { recursive: true });
    fs.appendFileSync(DOSYA, JSON.stringify({ t: Date.now(), calisma: CALISMA, ...olay }) + '\n');
  } catch (e) {
    log('defter yazilamadi: ' + e.message);
  }
}

function oku() {
  let metin;
  try {
    metin = fs.readFileSync(DOSYA, 'utf8');
  } catch {
    return [];
  }
  const satirlar = metin.split('\n').filter(Boolean);
  const kesit = satirlar.length > SON_SATIR ? satirlar.slice(-SON_SATIR) : satirlar;
  const olaylar = [];
  for (const s of kesit) {
    try { olaylar.push(JSON.parse(s)); } catch { /* yarim satir (cokme) atlanir */ }
  }
  return olaylar;
}

/** Olaylari oturum kayitlarina indirger: id -> { id, ad, yol, calisma, baslangic, bitis, kod, sebep }. */
function oturumlar(olaylar = oku()) {
  const harita = new Map();
  for (const o of olaylar) {
    if (o.olay === 'acildi' && o.id) {
      harita.set(o.id, { id: o.id, ad: o.ad, yol: o.yol, calisma: o.calisma, baslangic: o.t, bitis: null, kod: null, sebep: null });
    } else if (o.olay === 'kapandi' && harita.has(o.id)) {
      const k = harita.get(o.id);
      if (k.bitis === null) Object.assign(k, { bitis: o.t, kod: o.kod ?? null, sebep: o.sebep ?? null });
    }
  }
  return [...harita.values()];
}

/**
 * Onceki calismada bitissiz kalmis oturumlar (uygulama kapatildi ya da coktu). Bir kez
 * verilir: ayni anda 'uygulama-kapandi' ile kapatilir ki ikinci acilista tekrar teklif
 * edilmesin. Yol basina en yeni kayit tutulur (ayni klasorde iki bolme -> tek geri yukleme).
 */
function oncekiAcikOturumlar() {
  const acik = oturumlar().filter((k) => k.bitis === null && k.calisma !== CALISMA);
  for (const k of acik) ekle({ olay: 'kapandi', id: k.id, sebep: 'uygulama-kapandi' });
  const yolaGore = new Map();
  for (const k of acik) {
    const eski = yolaGore.get(k.yol);
    if (!eski || eski.baslangic < k.baslangic) yolaGore.set(k.yol, k);
  }
  return [...yolaGore.values()].map((k) => ({ ad: k.ad, yol: k.yol, baslangic: k.baslangic }));
}

/** Yol basina son oturum: Pano'daki "son oturum" sutunu. Suren oturumlar dahil degil. */
function sonOturumlar() {
  const sonuc = {};
  for (const k of oturumlar()) {
    if (k.bitis === null) continue;
    const eski = sonuc[k.yol];
    if (!eski || eski.bitis < k.bitis) {
      sonuc[k.yol] = { bitis: k.bitis, sureSn: Math.max(0, Math.round((k.bitis - k.baslangic) / 1000)) };
    }
  }
  return sonuc;
}

module.exports = { ekle, oncekiAcikOturumlar, sonOturumlar, DOSYA, CALISMA };
