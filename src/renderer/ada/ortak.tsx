import { useEffect, useRef, useState, type ReactNode } from 'react';
import { CornerDownLeft } from 'lucide-react';

// Ada sayfalarinin ortak parcalari (v4.0). Ada penceresi odak almaz (focusable: false): bir yazi
// kutusuna tiklamak tek basina odak vermez. Once main pencereyi odaklanabilir yapar (adaOdak),
// sonra kutu elle odaklanir. Bu kalip tek yerde dursun diye girdiler buradan gecer.

/** Odak almayan pencerede bir ogeye odak ver. */
export function odakIste(el: HTMLElement | null) {
  window.kokpit.adaOdak(true);
  setTimeout(() => el?.focus(), 60);
}

/** Tek satirlik yazi kutusu: Enter gonderir, Esc once metni siler sonra odagi birakir. */
export function AdaGirdi({
  placeholder,
  etiket,
  onGonder,
  baslangic = '',
  disabled,
  ikon,
  temizle = true,
  onDegis,
  azami = 300,
}: {
  placeholder: string;
  /** Ekran okuyucu adi. */
  etiket: string;
  onGonder: (metin: string) => void;
  baslangic?: string;
  disabled?: boolean;
  /** Gonder dugmesinin ikonu (varsayilan Enter oku). */
  ikon?: ReactNode;
  /** Gonderince kutu bosalsin mi (arama kutusunda hayir). */
  temizle?: boolean;
  /** Her tusta (canli arama). */
  onDegis?: (metin: string) => void;
  azami?: number;
}) {
  const [metin, setMetin] = useState(baslangic);
  const kutu = useRef<HTMLInputElement>(null);
  useEffect(() => setMetin(baslangic), [baslangic]);
  const gonder = () => {
    const m = metin.trim();
    if (!m) return;
    onGonder(m);
    if (temizle) setMetin('');
  };
  return (
    <form
      onSubmit={(ev) => {
        ev.preventDefault();
        gonder();
      }}
      className="flex items-center gap-1 rounded-lg border border-kenar bg-terminal/60 pr-1 focus-within:border-kenar-guclu"
    >
      <input
        ref={kutu}
        type="text"
        value={metin}
        onChange={(ev) => {
          setMetin(ev.target.value);
          onDegis?.(ev.target.value);
        }}
        onMouseDown={(ev) => {
          if (document.activeElement !== ev.currentTarget) odakIste(ev.currentTarget);
        }}
        onKeyDown={(ev) => {
          if (ev.key === 'Escape' && metin) {
            ev.preventDefault();
            ev.stopPropagation();
            setMetin('');
            onDegis?.('');
          }
        }}
        disabled={disabled}
        maxLength={azami}
        placeholder={placeholder}
        aria-label={etiket}
        spellCheck={false}
        className="cercevesiz-odak min-w-0 flex-1 bg-transparent px-2 py-1 text-xs text-metin placeholder:text-metin-soluk"
      />
      <button
        type="submit"
        disabled={disabled || !metin.trim()}
        aria-label={etiket + ': gönder'}
        title="Enter"
        className="shrink-0 cursor-pointer rounded p-0.5 text-metin-soluk transition-colors duration-[120ms] hover:text-metin disabled:cursor-default disabled:opacity-40"
      >
        {ikon ?? <CornerDownLeft className="size-3.5" aria-hidden="true" />}
      </button>
    </form>
  );
}

/** Bos durum: ne oldugunu ve nasil dolacagini soyleyen tek-iki satir. */
export function SayfaBos({ children }: { children: ReactNode }) {
  return <p className="px-1 py-3 text-xs leading-relaxed text-metin-soluk">{children}</p>;
}

/** Yalniz ikonlu dugme; adi `etiket`ten (aria-label + ipucu). `basili` verilirse acma-kapama dugmesidir. */
export function IkonDugme({
  etiket,
  onClick,
  children,
  basili,
  disabled,
  ipucu,
}: {
  etiket: string;
  onClick: () => void;
  children: ReactNode;
  basili?: boolean;
  disabled?: boolean;
  ipucu?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={etiket}
      aria-pressed={basili}
      title={ipucu ?? etiket}
      className={
        'flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-kontrol transition-colors duration-[120ms] hover:bg-yuzey-guclu hover:text-metin disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent ' +
        (basili ? 'bg-yuzey-guclu text-metin' : 'text-metin-soluk')
      }
    >
      {children}
    </button>
  );
}

/** Ince olcer cubugu (limit cubuklariyla ayni dil): dolgu metin-ikincil, %80 amber, %95 kirmizi. */
export function Olcer({ ad, yuzde, esikli = true }: { ad: string; yuzde: number; esikli?: boolean }) {
  const y = Math.max(0, Math.min(100, Math.round(yuzde)));
  return (
    <span
      role="meter"
      aria-label={ad}
      aria-valuenow={y}
      aria-valuemin={0}
      aria-valuemax={100}
      className="block h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-kenar-guclu"
    >
      <span
        className={'block h-full rounded-full ' + (esikli && y >= 95 ? 'bg-hata' : esikli && y >= 80 ? 'bg-dikkat' : 'bg-metin-ikincil')}
        style={{ width: y + '%' }}
      />
    </span>
  );
}

/** mm:ss (saat varsa s:mm:ss). */
export function sayacMetni(ms: number) {
  const t = Math.max(0, Math.round(ms / 1000));
  const s = Math.floor(t / 3600);
  const d = Math.floor((t % 3600) / 60);
  const sn = t % 60;
  const iki = (n: number) => String(n).padStart(2, '0');
  return s > 0 ? s + ':' + iki(d) + ':' + iki(sn) : d + ':' + iki(sn);
}
