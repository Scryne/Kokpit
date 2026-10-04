import { useEffect, useId, useRef, useState } from 'react';
import { Settings2, Zap } from 'lucide-react';
import type { HizliKomut } from './types';

// Hizli komut menusu: etkinlik seridinin sag ucunda. Secilen mesaj o oturuma yazilir ve
// gonderilir (klavyeden yazilmis gibi). Liste ~/.kokpit/komutlar.json'dan; "Düzenle" dosyayi acar.
// Menu deseni: dugme aria-haspopup, oklar gezer, Enter/Space secer, Escape kapatip odagi geri verir.

interface Props {
  komutlar: HizliKomut[];
  /** Hedef oturumun adi: menu basligi ve erisilebilir isim icin. */
  oturumAdi: string;
  onSec: (k: HizliKomut) => void;
}

export default function HizliKomutMenusu({ komutlar, oturumAdi, onSec }: Props) {
  const [acik, setAcik] = useState(false);
  const [secili, setSecili] = useState(0);
  const kap = useRef<HTMLDivElement>(null);
  const dugme = useRef<HTMLButtonElement>(null);
  const liste = useRef<HTMLUListElement>(null);
  const menuId = useId();
  // Son oge "Düzenle": komut sayisi + 1.
  const ogeSayisi = komutlar.length + 1;

  useEffect(() => {
    if (!acik) return;
    const disari = (ev: MouseEvent) => {
      if (kap.current && !kap.current.contains(ev.target as Node)) setAcik(false);
    };
    window.addEventListener('mousedown', disari);
    return () => window.removeEventListener('mousedown', disari);
  }, [acik]);

  useEffect(() => {
    if (acik) liste.current?.querySelectorAll<HTMLElement>('[role="menuitem"]')[secili]?.focus();
  }, [acik, secili]);

  const kapat = (odakGeri = true) => {
    setAcik(false);
    if (odakGeri) dugme.current?.focus();
  };

  const calistir = (i: number) => {
    kapat(false);
    if (i < komutlar.length) onSec(komutlar[i]);
    else void window.kokpit.komutlarDuzenle();
  };

  return (
    <div ref={kap} className="relative shrink-0">
      <button
        ref={dugme}
        type="button"
        aria-haspopup="menu"
        aria-expanded={acik}
        aria-controls={acik ? menuId : undefined}
        aria-label={oturumAdi + ' oturumuna hızlı komut gönder'}
        title="Hızlı komut gönder"
        onClick={() => {
          setSecili(0);
          setAcik((a) => !a);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' && !acik) {
            e.preventDefault();
            setSecili(0);
            setAcik(true);
          }
        }}
        className="flex h-full cursor-pointer items-center gap-1 border-b border-l border-kenar bg-yuzey px-2 text-xs text-metin-soluk transition-colors duration-[120ms] hover:bg-yuzey-guclu hover:text-metin aria-expanded:bg-yuzey-guclu aria-expanded:text-metin"
      >
        <Zap className="size-3.5" aria-hidden="true" />
      </button>

      {acik && (
        <div className="halka absolute top-full right-1 z-30 mt-1 w-72 rounded-kontrol bg-bg-base shadow-2xl shadow-black/60">
          <div className="rounded-kontrol bg-yuzey-guclu p-1">
            <p className="etiket truncate px-2 pt-1 pb-1.5">{oturumAdi} · gönder</p>
            <ul
              ref={liste}
              id={menuId}
              role="menu"
              aria-label={oturumAdi + ' hızlı komutlar'}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') setSecili((i) => (i + 1) % ogeSayisi);
                else if (e.key === 'ArrowUp') setSecili((i) => (i - 1 + ogeSayisi) % ogeSayisi);
                else if (e.key === 'Home') setSecili(0);
                else if (e.key === 'End') setSecili(ogeSayisi - 1);
                else if (e.key === 'Escape') kapat();
                else if (e.key === 'Tab') kapat(false);
                else return;
                e.preventDefault();
                e.stopPropagation();
              }}
            >
              {komutlar.map((k, i) => (
                <li key={k.ad + i} role="none">
                  <button
                    type="button"
                    role="menuitem"
                    tabIndex={i === secili ? 0 : -1}
                    onMouseMove={() => i !== secili && setSecili(i)}
                    onClick={() => calistir(i)}
                    title={k.metin}
                    className="block w-full cursor-pointer rounded px-2 py-1.5 text-left text-xs text-metin-ikincil outline-none focus-visible:bg-kenar-guclu focus-visible:text-metin hover:bg-kenar-guclu hover:text-metin"
                  >
                    <span className="block text-metin">{k.ad}</span>
                    <span className="block truncate text-metin-soluk">{k.metin}</span>
                  </button>
                </li>
              ))}
              <li role="none" className="mt-1 border-t border-kenar pt-1">
                <button
                  type="button"
                  role="menuitem"
                  tabIndex={secili === komutlar.length ? 0 : -1}
                  onMouseMove={() => secili !== komutlar.length && setSecili(komutlar.length)}
                  onClick={() => calistir(komutlar.length)}
                  className="flex w-full cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-metin-soluk outline-none focus-visible:bg-kenar-guclu focus-visible:text-metin hover:bg-kenar-guclu hover:text-metin"
                >
                  <Settings2 className="size-3.5" aria-hidden="true" />
                  Komutları düzenle
                  <span className="enstruman ml-auto">komutlar.json</span>
                </button>
              </li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
