import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Crosshair, ExternalLink, Mic, RotateCw, Send, TriangleAlert, X } from 'lucide-react';
import { kayitBaslat, type Kayit } from './sesKayit';

// v3.2, canli onizleme + isaretle-soyle (electron/onizleme.cjs). Servis bolmesinin govdesi: uygulamanin
// kendisi (<webview>, yalniz yerel adres). "Isaretle" ile sayfada bir oge secilir; ogenin kirpigi, secicisi,
// React/Vue bileseni ve Scryne'in notu (yazi ya da mikrofon) hedef claude oturumuna tek pakette gider.
// Konsol hatalari sayilir; tek tikla oturuma gider. DESIGN.md: arac seridi servis basligiyla ayni aile
// (yuzey, mono adres), amber yalniz hata sayaci; isaretleme cercevesi sayfanin icinde gumus (aksan).

interface Webview extends HTMLElement {
  src: string;
  reload: () => void;
  goBack: () => void;
  canGoBack: () => boolean;
  getURL: () => string;
  getWebContentsId: () => number;
  executeJavaScript: <T = unknown>(kod: string, kullaniciHareketi?: boolean) => Promise<T>;
}

export interface IsaretliOge {
  etiket: string;
  secici: string;
  metin: string;
  html: string;
  bilesen: string[];
  alan: { x: number; y: number; w: number; h: number };
  url: string;
  sayfaBaslik: string;
}

export interface OnizlemePaketi {
  yollar: string[];
  metinler: { kaynak: string; metin: string }[];
  not: string;
}

/**
 * Sayfaya enjekte edilen isaretci. Promise doner: tiklanan ogenin bilgisi, Esc'te null. Cerceve ve etiket
 * sayfanin kendi DOM'unda (pointer-events: none); tiklama yakalama evresinde yutulur (sayfadaki dugme
 * tetiklenmez). Bilesen adi React fiber'indan (__reactFiber$...), Vue'da __vueParentComponent'ten.
 */
const ISARETCI_JS = String.raw`(() => new Promise((coz) => {
  const eski = document.getElementById('__kokpit_isaret'); if (eski) eski.remove();
  const kap = document.createElement('div'); kap.id = '__kokpit_isaret';
  kap.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483647';
  const cer = document.createElement('div');
  cer.style.cssText = 'position:fixed;border:2px solid #C3CEDB;background:rgba(195,206,219,.12);border-radius:3px;box-shadow:0 0 0 1px rgba(11,12,15,.6);transition:all 60ms';
  const et = document.createElement('div');
  et.style.cssText = 'position:fixed;font:11px/1.4 ui-monospace,Consolas,monospace;color:#101216;background:#E6EAF0;padding:1px 6px;border-radius:3px;white-space:nowrap';
  kap.append(cer, et); document.documentElement.append(kap);
  const prevCursor = document.documentElement.style.cursor; document.documentElement.style.cursor = 'crosshair';
  let hedef = null;
  const ad = (el) => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + [...el.classList].filter((c) => /^[a-zA-Z][\w-]{0,30}$/.test(c)).slice(0, 2).map((c) => '.' + c).join('');
  const secici = (el) => { const p = []; let x = el; while (x && x.nodeType === 1 && x !== document.body && p.length < 6) { let s = ad(x); if (x.id) { p.unshift(s); break; } const k = x.parentElement; if (k) { const ayni = [...k.children].filter((c) => c.tagName === x.tagName); if (ayni.length > 1) s += ':nth-of-type(' + (ayni.indexOf(x) + 1) + ')'; } p.unshift(s); x = k; } return p.join(' > '); };
  const bilesen = (el) => { const sonuc = []; let x = el;
    while (x && sonuc.length < 5) {
      const k = Object.keys(x).find((n) => n.startsWith('__reactFiber$'));
      if (k) { let f = x[k]; while (f && sonuc.length < 5) { const t = f.type; const n = t && typeof t !== 'string' ? (t.displayName || t.name || (t.render && (t.render.displayName || t.render.name))) : null; if (n && !sonuc.includes(n) && !/^(Fragment|Suspense|StrictMode|Provider|Consumer|Context)$/.test(n) && n.length < 60) sonuc.push(n); f = f.return; } break; }
      const v = x.__vueParentComponent; if (v) { let c = v; while (c && sonuc.length < 5) { const n = c.type && (c.type.__name || c.type.name); if (n && !sonuc.includes(n)) sonuc.push(n); c = c.parent; } break; }
      x = x.parentElement; }
    return sonuc.reverse(); };
  const ciz = (el) => { const r = el.getBoundingClientRect(); cer.style.left = r.left + 'px'; cer.style.top = r.top + 'px'; cer.style.width = r.width + 'px'; cer.style.height = r.height + 'px'; et.textContent = ad(el) + '  ' + Math.round(r.width) + '×' + Math.round(r.height); et.style.left = Math.max(2, r.left) + 'px'; et.style.top = (r.top > 22 ? r.top - 20 : r.bottom + 4) + 'px'; };
  const hareket = (e) => { const el = document.elementFromPoint(e.clientX, e.clientY); if (el && el !== hedef && !kap.contains(el)) { hedef = el; ciz(el); } };
  const bitir = (sonuc) => { removeEventListener('mousemove', hareket, true); removeEventListener('click', tik, true); removeEventListener('mousedown', yut, true); removeEventListener('mouseup', yut, true); removeEventListener('keydown', tus, true); document.documentElement.style.cursor = prevCursor; kap.remove(); coz(sonuc); };
  const yut = (e) => { e.preventDefault(); e.stopPropagation(); };
  const tik = (e) => { yut(e); const el = document.elementFromPoint(e.clientX, e.clientY) || hedef; if (!el) return bitir(null); const r = el.getBoundingClientRect();
    const html = el.outerHTML.replace(/\s+/g, ' '); const ic = el.innerHTML.length > 160 ? html.slice(0, html.indexOf('>') + 1) + '…' : html;
    bitir({ etiket: ad(el), secici: secici(el), metin: (el.innerText || el.getAttribute('aria-label') || el.getAttribute('alt') || '').replace(/\s+/g, ' ').trim().slice(0, 160), html: ic.slice(0, 400), bilesen: bilesen(el), alan: { x: r.left, y: r.top, w: r.width, h: r.height }, url: location.href, sayfaBaslik: document.title.slice(0, 80) }); };
  const tus = (e) => { if (e.key === 'Escape') { yut(e); bitir(null); } };
  addEventListener('mousemove', hareket, true); addEventListener('click', tik, true); addEventListener('mousedown', yut, true); addEventListener('mouseup', yut, true); addEventListener('keydown', tus, true);
}))()`;

const ISARETCI_IPTAL_JS = `dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))`;

/** Model icin oge bilgisi: kisa, alanli, tahmine yer birakmayan blok. */
export function ogeMetni(o: IsaretliOge) {
  return [
    'İşaretlenen öğe: <' + o.etiket + '>' + (o.metin ? ' "' + o.metin + '"' : ''),
    'Seçici: ' + o.secici,
    ...(o.bilesen.length ? ['Bileşen: ' + o.bilesen.join(' > ')] : []),
    'Boyut: ' + Math.round(o.alan.w) + '×' + Math.round(o.alan.h) + ' px, konum (' + Math.round(o.alan.x) + ', ' + Math.round(o.alan.y) + ')',
    'Sayfa: ' + o.url + (o.sayfaBaslik ? ' (' + o.sayfaBaslik + ')' : ''),
    'HTML: ' + o.html,
  ].join('\n');
}

const HATA_SINIRI = 50;

export default function Onizleme({
  adres,
  gorunur,
  hedefler,
  varsayilanHedef,
  onGonder,
}: {
  adres: string;
  gorunur: boolean;
  /** Paketin gidebilecegi claude oturumlari (acik). */
  hedefler: { id: string; ad: string }[];
  varsayilanHedef: string | null;
  onGonder: (id: string, paket: OnizlemePaketi) => Promise<string | null>;
}) {
  const wv = useRef<Webview | null>(null);
  const [url, setUrl] = useState(adres);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [hatalar, setHatalar] = useState<{ t: number; metin: string; kaynak: string }[]>([]);
  const [hataAcik, setHataAcik] = useState(false);
  const [isaretleniyor, setIsaretleniyor] = useState(false);
  const [secilen, setSecilen] = useState<{ oge: IsaretliOge; yol: string | null; onizleme: string | null } | null>(null);
  const [not, setNot] = useState('');
  const [hedef, setHedef] = useState<string | null>(varsayilanHedef);
  const [bildirim, setBildirim] = useState<string | null>(null);
  const [dinleme, setDinleme] = useState<'yok' | 'dinliyor' | 'cozuluyor'>('yok');
  const kayit = useRef<Kayit | null>(null);
  const notKutusu = useRef<HTMLInputElement>(null);

  useEffect(() => setHedef((h) => (h && hedefler.some((x) => x.id === h) ? h : varsayilanHedef)), [hedefler, varsayilanHedef]);

  useEffect(() => {
    const w = wv.current;
    if (!w) return;
    const bitti = () => {
      setYukleniyor(false);
      try {
        setUrl(w.getURL());
      } catch {
        /* henuz bagli degil */
      }
    };
    const basladi = () => setYukleniyor(true);
    const konsol = (e: Event) => {
      const c = e as Event & { level: number; message: string; sourceId?: string; line?: number };
      if (c.level < 3) return; // 3 = error (spike: Electron 44 sayisal seviye)
      setHatalar((l) => [...l.slice(-(HATA_SINIRI - 1)), { t: Date.now(), metin: String(c.message).slice(0, 600), kaynak: (c.sourceId ? c.sourceId.replace(/^https?:\/\/[^/]+/, '') : '') + (c.line ? ':' + c.line : '') }]);
    };
    const yuklenemedi = (e: Event) => {
      const c = e as Event & { errorCode: number; errorDescription: string; validatedURL: string; isMainFrame: boolean };
      if (!c.isMainFrame || c.errorCode === -3) return; // -3: iptal (yeni gezinme)
      setYukleniyor(false);
      setHatalar((l) => [...l.slice(-(HATA_SINIRI - 1)), { t: Date.now(), metin: 'Sayfa yüklenemedi: ' + c.errorDescription + ' (' + c.errorCode + ')', kaynak: c.validatedURL }]);
    };
    w.addEventListener('did-stop-loading', bitti);
    w.addEventListener('did-start-loading', basladi);
    w.addEventListener('console-message', konsol);
    w.addEventListener('did-fail-load', yuklenemedi);
    w.addEventListener('did-navigate-in-page', bitti);
    return () => {
      w.removeEventListener('did-stop-loading', bitti);
      w.removeEventListener('did-start-loading', basladi);
      w.removeEventListener('console-message', konsol);
      w.removeEventListener('did-fail-load', yuklenemedi);
      w.removeEventListener('did-navigate-in-page', bitti);
    };
  }, []);

  useEffect(() => {
    if (!bildirim) return;
    const t = setTimeout(() => setBildirim(null), 5000);
    return () => clearTimeout(t);
  }, [bildirim]);

  const isaretle = useCallback(async () => {
    const w = wv.current;
    if (!w) return;
    if (isaretleniyor) {
      void w.executeJavaScript(ISARETCI_IPTAL_JS).catch(() => {});
      return;
    }
    setIsaretleniyor(true);
    setSecilen(null);
    try {
      w.focus();
      const oge = await w.executeJavaScript<IsaretliOge | null>(ISARETCI_JS, true);
      if (!oge) return;
      const k = await window.kokpit.onizlemeYakala(w.getWebContentsId(), oge.alan);
      setSecilen({ oge, yol: 'hata' in k ? null : k.yol, onizleme: 'hata' in k ? null : k.onizleme });
      requestAnimationFrame(() => notKutusu.current?.focus());
    } catch (e) {
      setBildirim('İşaretlenemedi: ' + (e as Error).message);
    } finally {
      setIsaretleniyor(false);
    }
  }, [isaretleniyor]);

  const dinle = useCallback(async () => {
    if (kayit.current) return kayit.current.durdur();
    window.kokpit.sesHazirla();
    setDinleme('dinliyor');
    try {
      kayit.current = await kayitBaslat({
        seviye: () => {},
        bitti: (wav) => {
          kayit.current = null;
          if (!wav) {
            setDinleme('yok');
            return;
          }
          setDinleme('cozuluyor');
          void window.kokpit.sesMetin(wav).then((r) => {
            setDinleme('yok');
            if ('hata' in r) setBildirim(r.hata);
            else setNot((n) => (n.trim() ? n.trim() + ' ' : '') + r.metin);
            notKutusu.current?.focus();
          });
        },
      });
    } catch {
      kayit.current = null;
      setDinleme('yok');
      setBildirim('Mikrofon açılamadı');
    }
  }, []);

  const gonder = async () => {
    if (!secilen || !hedef) return;
    const paket: OnizlemePaketi = {
      yollar: secilen.yol ? [secilen.yol] : [],
      metinler: [{ kaynak: 'Önizleme', metin: ogeMetni(secilen.oge) }],
      not: not.trim() || 'Bu öğeyi incele.',
    };
    const hata = await onGonder(hedef, paket);
    if (hata) return setBildirim(hata);
    setBildirim((hedefler.find((h) => h.id === hedef)?.ad ?? 'Oturum') + ' oturumuna gönderildi');
    setSecilen(null);
    setNot('');
  };

  const hatalariGonder = async () => {
    const h = hedef ?? varsayilanHedef;
    if (!h || hatalar.length === 0) return;
    const metin = 'Önizleme konsol hataları (' + url + ', son ' + hatalar.length + '):\n' + hatalar.map((x) => '- ' + x.metin + (x.kaynak ? '  [' + x.kaynak + ']' : '')).join('\n');
    const hata = await onGonder(h, { yollar: [], metinler: [{ kaynak: 'Önizleme', metin }], not: 'Bu konsol hatalarını incele ve düzelt.' });
    if (hata) return setBildirim(hata);
    setBildirim('Hatalar gönderildi');
    setHatalar([]);
    setHataAcik(false);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-onizleme>
      <div className="flex shrink-0 items-center gap-1 border-b border-kenar bg-yuzey px-1.5 py-1 text-xs">
        <button type="button" onClick={() => wv.current?.canGoBack() && wv.current.goBack()} aria-label="Geri" className="cursor-pointer rounded p-1 text-metin-soluk hover:bg-yuzey-guclu hover:text-metin">
          <ArrowLeft className="size-3.5" aria-hidden="true" />
        </button>
        <button type="button" onClick={() => wv.current?.reload()} aria-label="Yenile" className="cursor-pointer rounded p-1 text-metin-soluk hover:bg-yuzey-guclu hover:text-metin">
          <RotateCw className={'size-3.5 ' + (yukleniyor ? 'animate-spin motion-reduce:animate-none' : '')} aria-hidden="true" />
        </button>
        <span className="enstruman min-w-0 flex-1 truncate px-1 text-metin-soluk" title={url}>
          {url.replace(/^https?:\/\//, '')}
        </span>
        {hatalar.length > 0 && (
          <button
            type="button"
            data-onizleme-hata
            onClick={() => setHataAcik((x) => !x)}
            aria-expanded={hataAcik}
            className="flex cursor-pointer items-center gap-1 rounded px-1.5 py-0.5 text-dikkat-metin hover:bg-yuzey-guclu"
          >
            <TriangleAlert className="size-3.5" aria-hidden="true" />
            <span className="enstruman">{hatalar.length}</span> hata
          </button>
        )}
        <button
          type="button"
          data-isaretle
          onClick={() => void isaretle()}
          aria-pressed={isaretleniyor}
          title={isaretleniyor ? 'İşaretlemeyi bırak (Esc)' : 'Sayfada bir öğe işaretle; claude\'a öğeyle birlikte not gider'}
          className={
            'flex cursor-pointer items-center gap-1 rounded-kontrol border px-2 py-0.5 transition-colors duration-[120ms] ' +
            (isaretleniyor ? 'border-aksan text-metin' : 'border-kenar text-metin-ikincil hover:border-kenar-guclu hover:text-metin')
          }
        >
          <Crosshair className="size-3.5" aria-hidden="true" />
          {isaretleniyor ? 'Bir öğeye tıkla' : 'İşaretle'}
        </button>
        <button type="button" onClick={() => void window.kokpit.linkAc(url)} aria-label="Tarayıcıda aç" title="Tarayıcıda aç" className="cursor-pointer rounded p-1 text-metin-soluk hover:bg-yuzey-guclu hover:text-metin">
          <ExternalLink className="size-3.5" aria-hidden="true" />
        </button>
      </div>

      {hataAcik && hatalar.length > 0 && (
        <div className="max-h-48 shrink-0 overflow-y-auto border-b border-kenar bg-yuzey-guclu px-3 py-2 text-xs">
          <ul className="space-y-1">
            {hatalar.slice(-12).map((h, i) => (
              <li key={h.t + ':' + i} className="enstruman break-words text-metin-ikincil">
                {h.metin}
                {h.kaynak && <span className="text-metin-soluk"> · {h.kaynak}</span>}
              </li>
            ))}
          </ul>
          <div className="mt-2 flex items-center gap-2">
            <button type="button" onClick={() => void hatalariGonder()} disabled={!hedef && !varsayilanHedef} className="cursor-pointer rounded-kontrol bg-birincil px-2.5 py-0.5 text-xs font-medium text-birincil-uzeri hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50">
              Oturuma gönder
            </button>
            <button type="button" onClick={() => setHatalar([])} className="cursor-pointer text-metin-soluk hover:text-metin">
              Temizle
            </button>
          </div>
        </div>
      )}

      <div className="relative min-h-0 flex-1 bg-white">
        {/* Konuk sayfa: ayarlari main zorlar (preload yok, sandbox, ayri bolum). */}
        {/* display:none webview'i bozar (Electron belgesi): gizleme ust kapta (sekme), burada yalniz gorunurluk. */}
        <webview ref={wv as unknown as React.Ref<HTMLWebViewElement>} src={adres} className="absolute inset-0 flex" style={{ width: '100%', height: '100%', visibility: gorunur ? 'visible' : 'hidden' }} />

        {secilen && (
          <form
            data-isaret-karti
            onSubmit={(e) => {
              e.preventDefault();
              void gonder();
            }}
            className="halka absolute inset-x-2 bottom-2 space-y-2 rounded-base bg-yuzey-guclu p-2.5 text-xs shadow-lg"
          >
            <div className="flex items-start gap-2.5">
              {secilen.onizleme && <img src={secilen.onizleme} alt="İşaretlenen öğe" className="h-12 max-w-[9rem] shrink-0 rounded border border-kenar object-contain" />}
              <div className="min-w-0 flex-1">
                <p className="enstruman truncate text-metin" title={secilen.oge.secici}>
                  &lt;{secilen.oge.etiket}&gt; {secilen.oge.metin && <span className="text-metin-ikincil">"{secilen.oge.metin}"</span>}
                </p>
                <p className="enstruman truncate text-metin-soluk" title={secilen.oge.bilesen.join(' > ')}>
                  {secilen.oge.bilesen.length ? secilen.oge.bilesen.join(' › ') : secilen.oge.secici}
                </p>
              </div>
              <button type="button" onClick={() => setSecilen(null)} aria-label="Vazgeç" className="cursor-pointer rounded p-0.5 text-metin-soluk hover:text-metin">
                <X className="size-3.5" aria-hidden="true" />
              </button>
            </div>
            <div className="flex items-center gap-1.5">
              <input
                ref={notKutusu}
                value={not}
                onChange={(e) => setNot(e.target.value)}
                placeholder={dinleme === 'dinliyor' ? 'Dinliyorum…' : dinleme === 'cozuluyor' ? 'Anlıyorum…' : 'Ne yapılsın? (örn. bunu büyüt, rengini koyulaştır)'}
                aria-label="İşaretlenen öğe için not"
                className="halka min-w-0 flex-1 rounded-kontrol border border-kenar bg-terminal/60 px-2 py-1 text-xs text-metin placeholder:text-metin-soluk"
              />
              <button
                type="button"
                onClick={() => void dinle()}
                aria-pressed={dinleme === 'dinliyor'}
                aria-label={dinleme === 'dinliyor' ? 'Dinlemeyi bitir' : 'Sesle söyle'}
                title="Sesle söyle"
                className={'cursor-pointer rounded-kontrol border border-kenar p-1.5 hover:border-kenar-guclu ' + (dinleme === 'dinliyor' ? 'text-metin' : 'text-metin-soluk')}
              >
                <Mic className="size-3.5" aria-hidden="true" />
              </button>
              {hedefler.length > 1 && (
                <select
                  value={hedef ?? ''}
                  onChange={(e) => setHedef(e.target.value)}
                  aria-label="Hedef oturum"
                  className="enstruman rounded-kontrol border border-kenar bg-yuzey px-1.5 py-1 text-xs text-metin"
                >
                  {hedefler.map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.ad}
                    </option>
                  ))}
                </select>
              )}
              <button
                type="submit"
                disabled={!hedef}
                title={hedef ? (hedefler.find((h) => h.id === hedef)?.ad ?? '') + ' oturumuna gönder' : 'Açık claude oturumu yok'}
                className="flex cursor-pointer items-center gap-1 rounded-kontrol bg-birincil px-2.5 py-1 font-medium text-birincil-uzeri hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Send className="size-3.5" aria-hidden="true" />
                Gönder
              </button>
            </div>
            {!hedef && <p className="text-metin-soluk">Açık claude oturumu yok: önce bu projede bir oturum aç.</p>}
          </form>
        )}

        {bildirim && (
          <p role="status" className="absolute left-1/2 top-2 -translate-x-1/2 rounded-kontrol border border-kenar bg-yuzey-guclu px-2.5 py-1 text-xs text-metin shadow">
            {bildirim}
          </p>
        )}
      </div>
    </div>
  );
}
