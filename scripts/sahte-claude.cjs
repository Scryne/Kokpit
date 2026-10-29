// Test icin sahte `claude -p --input-format stream-json --output-format stream-json` (v3.3 Aria). Gercek claude
// vault'un hook'larini calistirir (gunluge test konusmasi duserdi) ve limit harcar; test:ui/test-ada bunu kullanir
// (KOKPIT_TEST_ARIA_SAHTE). Davranis: her kullanici mesajina "Yanki: <mesaj>" diye parca parca cevap; "[ses]" ile
// basliyorsa "Sesli: ..."; "arac" gecerse bir Read araci izi; "yavas" gecerse 4 sn yazar (kesme testi). Aldigi
// argumanlari SAHTE_ARIA_ARGLAR dosyasina yazar.
const fs = require('fs');
if (process.env.SAHTE_ARIA_ARGLAR) fs.appendFileSync(process.env.SAHTE_ARIA_ARGLAR, JSON.stringify(process.argv.slice(2)) + '\n');
const yaz = (o) => process.stdout.write(JSON.stringify(o) + '\n');
const uyu = (ms) => new Promise((r) => setTimeout(r, ms));
// v3.3 Faz 62: "oneri" gecen mesajda Kokpit'in arac ucuna (--mcp-config'teki adres + token) gercekten oneri_gorev yollar:
// kart akisi (main -> Aria sayfasi -> onay -> App) test:ui'da uctan uca sinanir.
function aracCagir(ad, girdi) {
  const i = process.argv.indexOf('--mcp-config');
  if (i < 0) return Promise.resolve('mcp yok');
  const env = JSON.parse(fs.readFileSync(process.argv[i + 1], 'utf8')).mcpServers.kokpit.env;
  const u = new URL(env.KOKPIT_ARIA_URL);
  const govde = JSON.stringify({ ad, girdi });
  return new Promise((coz) => {
    const r = require('http').request({ host: u.hostname, port: u.port, path: '/arac', method: 'POST', headers: { Authorization: 'Bearer ' + env.KOKPIT_ARIA_TOKEN, 'Content-Type': 'application/json' } }, (y) => {
      let v = '';
      y.on('data', (p) => (v += p));
      y.on('end', () => coz(v));
    });
    r.on('error', (e) => coz('hata ' + e.message));
    r.end(govde);
  });
}
let tampon = '';
let kes = false;
let calisiyor = false;
const kuyruk = [];
// Tek atislik `-p <istem> --output-format json` (gunluk not): tek JSON satiri ve cikis.
const pi = process.argv.indexOf('-p');
if (pi >= 0 && process.argv[pi + 1] && !process.argv[pi + 1].startsWith('--')) {
  yaz({ type: 'result', subtype: 'success', is_error: false, result: '- Sahte not: Matbaa olcumu yaklasiyor (kokpit.brifing)\n- Tezgah 30 gun kurali (Threads.md)' });
  process.exit(0);
}
yaz({ type: 'system', subtype: 'init', tools: ['Read'], model: 'sahte' });

async function cevapla(icerik) {
  calisiyor = true;
  kes = false;
  const t0 = Date.now();
  if (/oneri/.test(icerik)) {
    const proje = (/proje=(\S+)/.exec(icerik) || [])[1] || 'Kokpit';
    yaz({ type: 'assistant', parent_tool_use_id: null, message: { content: [{ type: 'tool_use', name: 'mcp__kokpit__oneri_gorev', input: { proje } }] } });
    await aracCagir('oneri_gorev', { proje, metin: 'README dosyasini gozden gecir' });
    yaz({ type: 'user', parent_tool_use_id: null, message: { content: [{ type: 'tool_result' }] } });
  }
  if (/arac/.test(icerik)) {
    yaz({ type: 'assistant', parent_tool_use_id: null, message: { content: [{ type: 'tool_use', name: 'Read', input: { file_path: 'C:/v/🔮 850-Companion/Threads.md' } }] } });
    yaz({ type: 'user', parent_tool_use_id: null, message: { content: [{ type: 'tool_result' }] } });
  }
  // v3.4 (Aria'nin agi): "dosya=<yol>" Read, "yaz=<yol>" Edit, "ara=<desen>" Grep izi. Yalniz olay; dosyaya dokunmaz.
  for (const [anahtar, ad, alan] of [['dosya', 'Read', 'file_path'], ['yaz', 'Edit', 'file_path'], ['ara', 'Grep', 'pattern']]) {
    for (const m of icerik.matchAll(new RegExp(anahtar + '=(\\S+)', 'g'))) {
      yaz({ type: 'assistant', parent_tool_use_id: null, message: { content: [{ type: 'tool_use', name: ad, input: { [alan]: m[1].replace(/\+/g, ' ') } }] } });
      await uyu(250);
      yaz({ type: 'user', parent_tool_use_id: null, message: { content: [{ type: 'tool_result' }] } });
    }
  }
  const metin = (icerik.startsWith('[ses]') ? 'Sesli: ' + icerik.slice(6) : 'Yanki: ' + icerik) + (/yavas/.test(icerik) ? ' ' + 'uzun '.repeat(40) : '');
  const parcalar = metin.match(/.{1,6}/gs) || [];
  for (const p of parcalar) {
    if (kes) break;
    yaz({ type: 'stream_event', parent_tool_use_id: null, event: { type: 'content_block_delta', delta: { type: 'text_delta', text: p } } });
    await uyu(/yavas/.test(icerik) ? 60 : 5);
  }
  if (kes) {
    yaz({ type: 'result', subtype: 'error_during_execution', is_error: true, duration_ms: Date.now() - t0 });
  } else {
    yaz({ type: 'assistant', parent_tool_use_id: null, message: { content: [{ type: 'text', text: metin }] } });
    yaz({ type: 'result', subtype: 'success', is_error: false, result: metin, duration_ms: Date.now() - t0 });
  }
  calisiyor = false;
  const s = kuyruk.shift();
  if (s) void cevapla(s);
}

process.stdin.setEncoding('utf8');
process.stdin.on('data', (d) => {
  tampon += d;
  let i;
  while ((i = tampon.indexOf('\n')) >= 0) {
    const s = tampon.slice(0, i).trim();
    tampon = tampon.slice(i + 1);
    if (!s) continue;
    const j = JSON.parse(s);
    if (j.type === 'control_request' && j.request && j.request.subtype === 'interrupt') {
      kes = true;
      yaz({ type: 'control_response', response: { subtype: 'success', request_id: j.request_id } });
    } else if (j.type === 'user') {
      const icerik = typeof j.message.content === 'string' ? j.message.content : '';
      if (calisiyor) kuyruk.push(icerik);
      else void cevapla(icerik);
    }
  }
});
process.stdin.on('end', () => setTimeout(() => process.exit(0), 50));
