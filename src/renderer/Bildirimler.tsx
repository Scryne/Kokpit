import { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, X } from 'lucide-react';

// v3.5: bildirim gecmisi. Kokpit'in kisa bildirimleri (gonderim hatasi, paralel agac, gece vardiyasi, not) 4 sn'lik bir
// satirdi; bakmiyorsan kaciyordu. Denetimde birkac sessiz hata buraya yonlendirildi; gecmis olmadan yine kaybolurdu.
// Son 50 bildirim, okunmamis sayisi zilde (mono: olculmus deger). Hata `hata-metin`, digerleri soluk; amber yok
// (amber = seni bekliyor). Kalicilik tarayici deposunda (gorunurluk kolayligi; kaybolursa sorun degil).

export type Bildirim = { t: number; metin: string; tur: 'bilgi' | 'hata' };

const ANAHTAR = 'kokpit.bildirimler.v1';
const AZAMI = 50;

function oku(): Bildirim[] {
  try {
    const j = JSON.parse(localStorage.getItem(ANAHTAR) ?? '[]');
    return Array.isArray(j) ? j.filter((b) => b && typeof b.metin === 'string' && Number.isFinite(b.t)).slice(0, AZAMI) : [];
  } catch {
    return [];
  }
}

/** Bildirim gecmisi + anlik satir. `bildir` hem 4 sn'lik satiri hem gecmisi besler. */
export function useBildirimler() {
  const [liste, setListe] = useState<Bildirim[]>(oku);
  const [anlik, setAnlik] = useState<string | null>(null);
  const [okunan, setOkunan] = useState(() => liste[0]?.t ?? 0);
  useEffect(() => {
    try {
      localStorage.setItem(ANAHTAR, JSON.stringify(liste));
    } catch {
      /* depolama kapali */
    }
  }, [liste]);
  useEffect(() => {
    if (!anlik) return;
    const t = setTimeout(() => setAnlik(null), 4000);
    return () => clearTimeout(t);
  }, [anlik]);
  const bildir = useCallback((metin: string, tur: Bildirim['tur'] = 'bilgi') => {
    const m = metin.trim();
    if (!m) return;
    setAnlik(m);
    setListe((l) => [{ t: Date.now(), metin: m.slice(0, 500), tur }, ...l].slice(0, AZAMI));
  }, []);
  const okunmamis = liste.filter((b) => b.t > okunan).length;
  const okundu = useCallback(() => setOkunan(Date.now()), []);
  const temizle = useCallback(() => setListe([]), []);
  return { liste, anlik, bildir, okunmamis, okundu, temizle };
}

function saat(t: number) {
  const d = new Date(t);
  const bugun = new Date().toDateString() === d.toDateString();
  return (bugun ? '' : d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit' }) + ' ') + d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
}

export function BildirimZili({ liste, okunmamis, okundu, temizle }: Pick<ReturnType<typeof useBildirimler>, 'liste' | 'okunmamis' | 'okundu' | 'temizle'>) {
  const [acik, setAcik] = useState(false);
  const kap = useRef<HTMLDivElement>(null);
  const dugme = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!acik) return;
    okundu();
    const disari = (e: MouseEvent) => {
      if (kap.current && !kap.current.contains(e.target as Node)) setAcik(false);
    };
    window.addEventListener('mousedown', disari);
    return () => window.removeEventListener('mousedown', disari);
  }, [acik, okundu, liste.length]);
  return (
    <div ref={kap} className="relative">
      <button
        ref={dugme}
        type="button"
        onClick={() => setAcik((a) => !a)}
        aria-expanded={acik}
        aria-label={'Bildirimler' + (okunmamis ? ', ' + okunmamis + ' yeni' : '')}
        title="Bildirimler"
        data-bildirim-zili
        className="relative shrink-0 cursor-pointer rounded-kontrol border border-kenar p-1.5 text-metin-soluk transition-colors duration-[180ms] hover:border-kenar-guclu hover:text-metin"
      >
        <Bell className="size-4" aria-hidden="true" />
        {okunmamis > 0 && (
          <span className="enstruman absolute -right-1.5 -top-1.5 min-w-4 rounded-full bg-birincil px-1 text-center text-[0.625rem] leading-4 text-birincil-uzeri tabular-nums" aria-hidden="true">
            {okunmamis > 9 ? '9+' : okunmamis}
          </span>
        )}
      </button>
      {acik && (
        <div
          role="dialog"
          aria-label="Bildirim geçmişi"
          data-bildirimler
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setAcik(false);
              dugme.current?.focus();
            }
          }}
          className="halka absolute right-0 top-full z-50 mt-2 w-96 max-w-[calc(100vw-2rem)] overflow-hidden rounded-base bg-yuzey-guclu shadow-xl shadow-black/50"
        >
          <div className="flex items-center gap-2 border-b border-kenar px-3 py-2">
            <span className="etiket flex-1">Bildirimler</span>
            {liste.length > 0 && (
              <button type="button" onClick={temizle} className="cursor-pointer rounded-kontrol px-1.5 py-0.5 text-xs text-metin-soluk hover:bg-yuzey hover:text-metin">
                Temizle
              </button>
            )}
            <button type="button" onClick={() => setAcik(false)} aria-label="Kapat" className="cursor-pointer rounded-kontrol p-1 text-metin-soluk hover:bg-yuzey hover:text-metin">
              <X className="size-3.5" aria-hidden="true" />
            </button>
          </div>
          <ul className="max-h-96 overflow-y-auto">
            {liste.map((b) => (
              <li key={b.t + b.metin} className="flex gap-3 border-b border-kenar px-3 py-2 text-xs last:border-0">
                <span className="enstruman shrink-0 text-metin-soluk tabular-nums">{saat(b.t)}</span>
                <span className={'min-w-0 break-words ' + (b.tur === 'hata' ? 'text-hata-metin' : 'text-metin-ikincil')}>{b.metin}</span>
              </li>
            ))}
            {liste.length === 0 && <li className="px-3 py-4 text-center text-xs text-metin-soluk">Henüz bildirim yok.</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
