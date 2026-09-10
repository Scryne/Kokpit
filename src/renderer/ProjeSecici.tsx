import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { LucideIcon } from 'lucide-react';
import type { Proje } from './types';

interface Props {
  projeler: Proje[];
  ikon: LucideIcon;
  baslik: string;
  onSec: (p: Proje) => void;
}

/**
 * Kucuk acilir liste: yeni sekme ve bolme icin proje secer.
 *
 * Menu PORTAL ile body'ye tasinir ve `fixed` konumlanir. Sebebi: buton, terminal
 * bolumunun icinde duruyor ve o bolum yuvarlak koseler icin `overflow-hidden`.
 * Agac icinde `absolute` bir menu o sinirda kirpiliyordu.
 */
export default function ProjeSecici({ projeler, ikon: Ikon, baslik, onSec }: Props) {
  const [acik, setAcik] = useState(false);
  const [konum, setKonum] = useState<{ ust: number; sag: number } | null>(null);
  const butonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const konumHesapla = useCallback(() => {
    const b = butonRef.current;
    if (!b) return;
    const r = b.getBoundingClientRect();
    setKonum({ ust: r.bottom + 6, sag: window.innerWidth - r.right });
  }, []);

  const ac = () => {
    konumHesapla();
    setAcik(true);
  };

  useEffect(() => {
    if (!acik) return;
    const disari = (e: MouseEvent) => {
      const hedef = e.target as Node;
      if (butonRef.current?.contains(hedef)) return;
      if (menuRef.current?.contains(hedef)) return;
      setAcik(false);
    };
    const kacis = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAcik(false);
    };
    const kapat = () => setAcik(false);

    document.addEventListener('mousedown', disari);
    document.addEventListener('keydown', kacis);
    window.addEventListener('resize', kapat);
    return () => {
      document.removeEventListener('mousedown', disari);
      document.removeEventListener('keydown', kacis);
      window.removeEventListener('resize', kapat);
    };
  }, [acik]);

  return (
    <>
      <button
        ref={butonRef}
        type="button"
        onClick={() => (acik ? setAcik(false) : ac())}
        title={baslik}
        aria-label={baslik}
        aria-expanded={acik}
        aria-haspopup="menu"
        className={
          'flex cursor-pointer items-center rounded-kontrol border p-1.5 transition-colors duration-[180ms] ' +
          (acik
            ? 'border-kenar-guclu bg-yuzey-guclu text-metin'
            : 'border-kenar text-metin-ikincil hover:border-kenar-guclu hover:text-metin')
        }
      >
        <Ikon className="size-4" aria-hidden="true" />
      </button>

      {acik &&
        konum &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            aria-label={baslik}
            style={{ top: konum.ust, right: konum.sag }}
            className="halka fixed z-50 w-56 overflow-hidden rounded-base bg-yuzey-guclu py-1 shadow-xl shadow-black/50 backdrop-blur-xl"
          >
            <p className="etiket px-3 py-1.5">{baslik}</p>
            {projeler.map((p) => (
              <button
                key={p.ad}
                type="button"
                role="menuitem"
                onClick={() => {
                  onSec(p);
                  setAcik(false);
                }}
                className="flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left transition-colors duration-[180ms] hover:bg-yuzey"
              >
                <span className="enstruman truncate text-xs text-metin-ikincil">{p.ad}</span>
              </button>
            ))}
          </div>,
          document.body
        )}
    </>
  );
}
