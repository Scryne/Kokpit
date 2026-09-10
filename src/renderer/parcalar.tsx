import {
  AlertTriangle,
  CheckCircle2,
  CircleOff,
  FileCheck2,
  GitBranch,
  Hammer,
  Lightbulb,
  Map as MapIcon,
  ScanSearch,
  type LucideIcon,
} from 'lucide-react';
import type { Proje } from './types';

export const ASAMA_SIRA = ['fikir', 'denetim', 'finalizasyon', 'roadmap', 'uygulama', 'tamamlandi'];

export const ASAMA_IKON: Record<string, LucideIcon> = {
  fikir: Lightbulb,
  denetim: ScanSearch,
  finalizasyon: FileCheck2,
  roadmap: MapIcon,
  uygulama: Hammer,
  tamamlandi: CheckCircle2,
};

export function gunMetni(gun: number | null | undefined) {
  if (gun === null || gun === undefined) return null;
  if (gun === 0) return 'bugün';
  if (gun === 1) return 'dün';
  return gun + ' gün önce';
}

export function sureMetni(saniye: number) {
  if (saniye < 60) return saniye + ' sn';
  const dk = Math.floor(saniye / 60);
  if (dk < 60) return dk + ' dk';
  return Math.floor(dk / 60) + ' sa ' + (dk % 60) + ' dk';
}

/** Asama rozeti: ikon + metin. Renk tek basina anlam tasimaz (DESIGN.md). */
export function AsamaRozeti({ asama }: { asama: Proje['asama'] }) {
  const Ikon = asama ? (ASAMA_IKON[asama] ?? CircleOff) : CircleOff;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-rozet border border-kenar px-2 py-1">
      <Ikon className="size-3.5 shrink-0 text-metin-soluk" aria-hidden="true" />
      <span className="text-xs whitespace-nowrap text-metin-ikincil">{asama ?? 'sistem dışı'}</span>
    </span>
  );
}

/** Git durumu. "Temiz"in rengi yoktur; sadece mudahale gerektiren sey isaretlenir. */
export function GitDurumu({ p }: { p: Proje }) {
  const g = p.git;
  if (!g) return null;
  return (
    <span className="inline-flex items-center gap-3 text-xs whitespace-nowrap">
      <span className="inline-flex items-center gap-1.5 text-metin-ikincil">
        <GitBranch className="size-3.5 shrink-0 text-metin-soluk" aria-hidden="true" />
        <span className="enstruman">{g.branch ?? '—'}</span>
      </span>
      {g.kirli > 0 ? (
        <span className="inline-flex items-center gap-1.5 text-dikkat-metin">
          <AlertTriangle className="size-3.5 shrink-0" aria-hidden="true" />
          <span className="enstruman">{g.kirli}</span>
          <span className="text-metin-ikincil">kirli</span>
        </span>
      ) : (
        <span className="text-metin-soluk">temiz</span>
      )}
    </span>
  );
}

/**
 * Roadmap ilerlemesi: sayi asil, olcek ikincil. Yuzde gosterilmez.
 * Faz basina bir isaret ancak sayilabilir oldugunda bilgi tasir; 32 faz 32 nokta
 * uretip serit haline geliyordu. Esigin ustunde tek olcum cubuguna dusuluyor.
 */
const ISARET_ESIGI = 12;

export function Ilerleme({ p }: { p: Proje }) {
  const r = p.roadmap;
  if (!r || r.toplam === 0) return <span className="text-xs text-metin-soluk">roadmap yok</span>;
  const oran = r.tamamlandi / r.toplam;
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap">
      <span className="enstruman text-sm text-metin">
        {r.tamamlandi}
        <span className="text-metin-soluk">/{r.toplam}</span>
      </span>
      {r.toplam <= ISARET_ESIGI ? (
        <span className="flex gap-0.5" aria-hidden="true">
          {Array.from({ length: r.toplam }, (_, i) => (
            <span
              key={i}
              className={
                'h-1 w-1.5 rounded-full ' + (i < r.tamamlandi ? 'bg-metin-ikincil' : 'bg-kenar')
              }
            />
          ))}
        </span>
      ) : (
        <span className="block h-1 w-14 overflow-hidden rounded-full bg-kenar" aria-hidden="true">
          <span
            className="block h-full rounded-full bg-metin-ikincil"
            style={{ width: Math.round(oran * 100) + '%' }}
          />
        </span>
      )}
    </span>
  );
}

/** Panonun ust seridindeki tek olcum. Buyuk sayi mono, etiket kucuk. */
export function Olcum({
  etiket,
  deger,
  alt,
  vurgu = false,
}: {
  etiket: string;
  deger: string | number;
  alt?: string | null;
  vurgu?: boolean;
}) {
  return (
    <div className="halka relative rounded-base bg-yuzey px-4 py-3">
      <p className="etiket">{etiket}</p>
      <p
        className={
          'enstruman mt-1.5 text-2xl leading-none ' + (vurgu ? 'text-dikkat-metin' : 'text-metin')
        }
      >
        {deger}
      </p>
      {alt && <p className="mt-1.5 truncate text-xs text-metin-soluk">{alt}</p>}
    </div>
  );
}
