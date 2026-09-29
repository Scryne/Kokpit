import { useEffect, useMemo, useRef, useState } from 'react';
import { Search } from 'lucide-react';

export interface Komut {
  id: string;
  /** Liste ustundeki grup: Git, Aç, Eylem... */
  grup: string;
  baslik: string;
  /** Sagda soluk ek bilgi: kisayol ya da durum. */
  ipucu?: string;
  calistir: () => void;
}

interface Props {
  acik: boolean;
  komutlar: Komut[];
  onKapat: () => void;
}

const tr = (s: string) => s.toLocaleLowerCase('tr');

/**
 * Komut paleti (Ctrl+Shift+P). Yerel <dialog>: odak tuzagi ve Escape tarayicidan gelir.
 * Arama her kelimeyi ayri arar ("trade aç" -> "TradeBot · oturum aç"). Ok tuslari secer,
 * Enter calistirir. Combobox + listbox deseni: odak kutuda kalir, secim aria-activedescendant.
 */
export default function KomutPaleti({ acik, komutlar, onKapat }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const kutuRef = useRef<HTMLInputElement>(null);
  const listeRef = useRef<HTMLUListElement>(null);
  const [sorgu, setSorgu] = useState('');
  const [secili, setSecili] = useState(0);

  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (acik && !d.open) {
      setSorgu('');
      setSecili(0);
      d.showModal();
      setTimeout(() => kutuRef.current?.focus(), 0);
    } else if (!acik && d.open) {
      d.close();
    }
  }, [acik]);

  const suzulen = useMemo(() => {
    const kelimeler = tr(sorgu).split(/\s+/).filter(Boolean);
    if (kelimeler.length === 0) return komutlar;
    return komutlar.filter((k) => {
      const metin = tr(k.grup + ' ' + k.baslik + ' ' + (k.ipucu ?? ''));
      return kelimeler.every((w) => metin.includes(w));
    });
  }, [sorgu, komutlar]);

  useEffect(() => setSecili(0), [sorgu]);

  // Secili oge gorunur kalsin.
  useEffect(() => {
    listeRef.current
      ?.querySelector<HTMLElement>('[aria-selected="true"]')
      ?.scrollIntoView({ block: 'nearest' });
  }, [secili, suzulen]);

  const calistir = (k: Komut | undefined) => {
    if (!k) return;
    onKapat();
    // Dialog kapanip odak geri verildikten sonra calissin (terminale odak vb.).
    setTimeout(k.calistir, 0);
  };

  return (
    <dialog
      ref={dialogRef}
      onClose={onKapat}
      onCancel={(e) => {
        e.preventDefault();
        onKapat();
      }}
      aria-label="Komut paleti"
      // Zemin OPAK: yuzey-guclu %85 saydam, arkadaki tablo satirlari listenin altindan
      // okunuyordu (2026-09-29 ekran goruntusu). Opak taban + ustte ayni yuzey tonu.
      className="halka mx-auto mt-[12vh] mb-auto w-[min(36rem,calc(100vw-2rem))] rounded-base bg-bg-base p-0 text-metin shadow-2xl shadow-black/60 backdrop:bg-black/50"
    >
      <div className="bg-yuzey-guclu">
      <div className="flex items-center gap-2 border-b border-kenar px-4 py-3">
        <Search className="size-4 shrink-0 text-metin-soluk" aria-hidden="true" />
        <input
          ref={kutuRef}
          type="text"
          role="combobox"
          aria-expanded="true"
          aria-controls="palet-liste"
          aria-activedescendant={suzulen[secili] ? 'palet-' + suzulen[secili].id : undefined}
          aria-autocomplete="list"
          aria-label="Komut ara"
          value={sorgu}
          onChange={(e) => setSorgu(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setSecili((i) => (suzulen.length ? (i + 1) % suzulen.length : 0));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setSecili((i) => (suzulen.length ? (i - 1 + suzulen.length) % suzulen.length : 0));
            } else if (e.key === 'Enter') {
              e.preventDefault();
              calistir(suzulen[secili]);
            }
          }}
          placeholder="Proje, sayfa ya da eylem ara"
          spellCheck={false}
          // Kutu diyalogun tek odak noktasi ve imlec gorunur; genel aksan cercevesi burada
          // yalniz gurultu (not kutusundaki textarea da cerceve yerine kenar rengi kullanir).
          className="cercevesiz-odak min-w-0 flex-1 bg-transparent text-sm text-metin placeholder:text-metin-soluk"
        />
        <kbd className="enstruman shrink-0 text-xs text-metin-soluk">Esc</kbd>
      </div>
      <ul
        ref={listeRef}
        id="palet-liste"
        role="listbox"
        aria-label="Komutlar"
        className="max-h-[min(24rem,60vh)] overflow-y-auto py-1"
      >
        {suzulen.map((k, i) => (
          <li
            key={k.id}
            id={'palet-' + k.id}
            role="option"
            aria-selected={i === secili}
            onMouseMove={() => i !== secili && setSecili(i)}
            onClick={() => calistir(k)}
            className={
              'flex cursor-pointer items-center gap-3 px-4 py-2 text-sm ' +
              (i === secili ? 'bg-kenar-guclu text-metin' : 'text-metin-ikincil')
            }
          >
            <span className="etiket w-16 shrink-0">{k.grup}</span>
            <span className="min-w-0 flex-1 truncate">{k.baslik}</span>
            {k.ipucu && <span className="enstruman shrink-0 text-xs text-metin-soluk">{k.ipucu}</span>}
          </li>
        ))}
        {suzulen.length === 0 && (
          <li className="px-4 py-3 text-sm text-metin-soluk">Eşleşen komut yok.</li>
        )}
      </ul>
      </div>
    </dialog>
  );
}
