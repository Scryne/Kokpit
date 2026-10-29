// v3.3, Aria'nin Kokpit araclari (Faz 62): claude'un baslattigi stdio MCP sunucusu. Bagimliliksiz (JSON-RPC, satir basina
// bir mesaj; spike S2'de gercek claude 2.1.312 ile calisti). Araclarin kendisi Kokpit main'de (aria-arac.cjs): bu surec
// cagriyi KOKPIT_ARIA_URL'ye (127.0.0.1, token'li) iletir ve metni geri verir. Kokpit kapaliysa arac hata metni doner.
const http = require('http');

const URL_ = process.env.KOKPIT_ARIA_URL || '';
const TOKEN = process.env.KOKPIT_ARIA_TOKEN || '';

const nesne = (ozellikler, gerekli = []) => ({ type: 'object', properties: ozellikler, required: gerekli, additionalProperties: false });
const yazi = (aciklama) => ({ type: 'string', description: aciklama });

const ARACLAR = [
  { name: 'kokpit_oturumlar', description: "Kokpit'te ve disinda acik claude oturumlari: ad, durum (calisiyor / seni bekliyor / bitti), hedef (ilk istek), son turun sonucu.", inputSchema: nesne({}) },
  { name: 'kokpit_oturum_ozeti', description: 'Bir Kokpit oturumunun ne yaptigi: son soz, turun dosya/satir sayilari, commit / push bekleyen. Soru soruyorsa secenekleri.', inputSchema: nesne({ oturum: yazi('Oturum adi (proje adi), ornegin "Matbaa"') }, ['oturum']) },
  { name: 'kokpit_brifing', description: 'Gunun brifingi: gecikmis/bugunku vadeler, dusen botlar, bekleyen oturumlar, push bekleyen commitler, limit zamanlamasi, beyin durumu ve onerilen ilk is.', inputSchema: nesne({}) },
  { name: 'kokpit_nobet', description: 'Kendiliginden calisan islerin (botlar, zamanlanmis gorevler, GitHub Actions) son hali: saglikli / gecikti / dustu ve nedeni.', inputSchema: nesne({}) },
  { name: 'kokpit_teslim', description: 'Disari cikmayi bekleyenler: push bekleyen commitler ve commit edilmemis degisiklikler (proje basina) + paralel dallar (calisma agaclari).', inputSchema: nesne({}) },
  { name: 'kokpit_gece', description: 'Gece vardiyasinin kaydi: siradaki ve biten gorevler, durumlari, ozetleri.', inputSchema: nesne({}) },
  { name: 'kokpit_limit', description: 'Claude kullanim limitleri: 5 saatlik ve haftalik yuzde, sifirlanma zamani.', inputSchema: nesne({}) },
  { name: 'kokpit_oneriler', description: "Bu gun verdigin onerilerin durumu (Scryne onayladi mi, sonuc ne).", inputSchema: nesne({}) },
  {
    name: 'oneri_gorev',
    description: "Bir projede yeni claude oturumu acip ona gorev vermeyi ONERIR. Kokpit Scryne'a bir oneri karti cizer; Scryne onaylarsa oturum acilir. Onaysiz hicbir sey olmaz. kip 'paralel' ise ayri git dalinda (calisma agaci) acilir.",
    inputSchema: nesne({ proje: yazi('Proje adi (Kokpit proje listesindeki ad)'), metin: yazi("Oturumun ilk mesaji: ne yapilacak, net ve tek basina anlasilir"), kip: { type: 'string', enum: ['simdi', 'paralel'], description: 'simdi (varsayilan) ya da paralel' } }, ['proje', 'metin']),
  },
  {
    name: 'oneri_gece',
    description: 'Gece vardiyasinin sirasina gorev eklemeyi ONERIR (Scryne onaylar). Gorev gece kendi git dalinda calisir; push/silme yasak.',
    inputSchema: nesne({ proje: yazi('Proje adi'), metin: yazi('Gece yapilacak is') }, ['proje', 'metin']),
  },
  {
    name: 'oneri_mesaj',
    description: "Acik bir Kokpit oturumuna mesaj yazmayi ONERIR (Scryne onaylar; onaylanirsa mesaj oturuma gider ve Enter'a basilir).",
    inputSchema: nesne({ oturum: yazi('Acik oturumun adi'), metin: yazi('Gonderilecek mesaj') }, ['oturum', 'metin']),
  },
];

function cagir(ad, girdi) {
  return new Promise((coz) => {
    if (!URL_) return coz({ hata: 'Kokpit adresi yok' });
    const govde = JSON.stringify({ ad, girdi: girdi || {} });
    const u = new URL(URL_);
    const istek = http.request(
      { host: u.hostname, port: u.port, path: '/arac', method: 'POST', timeout: 60_000, headers: { 'Content-Type': 'application/json; charset=utf-8', Authorization: 'Bearer ' + TOKEN, 'Content-Length': Buffer.byteLength(govde) } },
      (yanit) => {
        let v = '';
        yanit.setEncoding('utf8');
        yanit.on('data', (p) => (v += p));
        yanit.on('end', () => {
          try {
            coz(JSON.parse(v));
          } catch {
            coz({ hata: 'Kokpit yaniti okunamadi (' + yanit.statusCode + ')' });
          }
        });
      }
    );
    istek.on('timeout', () => istek.destroy(new Error('zaman asimi')));
    istek.on('error', (e) => coz({ hata: 'Kokpit kapali ya da ulasilamiyor: ' + e.message }));
    istek.end(govde);
  });
}

let tampon = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', async (d) => {
  tampon += d;
  let i;
  while ((i = tampon.indexOf('\n')) >= 0) {
    const s = tampon.slice(0, i).trim();
    tampon = tampon.slice(i + 1);
    if (!s) continue;
    let m;
    try {
      m = JSON.parse(s);
    } catch {
      continue;
    }
    const cevap = (result) => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: m.id, result }) + '\n');
    if (m.method === 'initialize') {
      cevap({ protocolVersion: (m.params && m.params.protocolVersion) || '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'kokpit', version: '3.3' } });
    } else if (m.method === 'tools/list') {
      cevap({ tools: ARACLAR });
    } else if (m.method === 'tools/call') {
      const ad = m.params && m.params.name;
      if (!ARACLAR.some((a) => a.name === ad)) {
        cevap({ content: [{ type: 'text', text: 'Bilinmeyen arac: ' + ad }], isError: true });
        continue;
      }
      const r = await cagir(ad, m.params.arguments);
      cevap(r.hata ? { content: [{ type: 'text', text: r.hata }], isError: true } : { content: [{ type: 'text', text: String(r.metin ?? '') }] });
    } else if (m.id !== undefined) {
      cevap({});
    }
  }
});

module.exports = { ARACLAR };
