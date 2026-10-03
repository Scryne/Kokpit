import { useEffect, useId, useRef, useState } from 'react';
import {
  Bot,
  ChevronDown,
  FileEdit,
  FilePlus2,
  FileText,
  FolderSearch,
  Globe,
  ListChecks,
  MessageCircleQuestion,
  Plug,
  Search,
  Sparkles,
  SquareTerminal,
  Wrench,
} from 'lucide-react';
import type { EtkinlikAraci, Limit, Limitler, OturumEtkinligi } from './types';
import { sureMetni } from './parcalar';

// Kanca koprusunun arayuzu: etkinlik seridi (bolme basina), etkinlik akisi, limit gostergesi.
// DESIGN.md: mono = olculmus deger; renk yalniz seni bekleyen sey icin (dikkat). "Bitti"nin ve
// "calisiyor"un rengi yok — bicimle okunur (halka nokta, nabiz).

export function aracIkonu(ad: string) {
  switch (ad) {
    case 'Edit':
    case 'MultiEdit':
    case 'NotebookEdit':
      return FileEdit;
    case 'Write':
      return FilePlus2;
    case 'Read':
      return FileText;
    case 'Bash':
    case 'PowerShell':
      return SquareTerminal;
    case 'Grep':
      return Search;
    case 'Glob':
      return FolderSearch;
    case 'WebFetch':
    case 'WebSearch':
      return Globe;
    case 'Agent':
    case 'Task':
      return Bot;
    case 'Skill':
      return Sparkles;
    case 'TodoWrite':
      return ListChecks;
    case 'AskUserQuestion':
      return MessageCircleQuestion;
    case 'MCP':
      return Plug;
    default:
      return Wrench;
  }
}

/** "+38 −6": ekleme metin rengiyle, silme soluk. Iyi/kotu renklendirmesi yok (DESIGN.md). */
export function Fark({ arti, eksi }: { arti: number | null; eksi: number | null }) {
  if (arti === null && eksi === null) return null;
  return (
    <span className="enstruman shrink-0 whitespace-nowrap" aria-label={`${arti ?? 0} satır eklendi, ${eksi ?? 0} satır silindi`}>
      <span className="text-metin">+{arti ?? 0}</span> <span className="text-metin-soluk">−{eksi ?? 0}</span>
    </span>
  );
}

function sureMs(ms: number) {
  return sureMetni(Math.max(0, Math.floor(ms / 1000)));
}

/** Bildirim ve ada icin tek cumle: o an ne oluyor. */
export function etkinlikCumlesi(e: OturumEtkinligi, simdi: number): string {
  if (e.durum === 'bekliyor') return e.soru ? 'Soru: ' + e.soru : 'Seni bekliyor';
  if (e.durum === 'bitti') {
    const parca = ['Bitti'];
    if (e.sonTurSuresiMs !== null) parca.push(sureMs(e.sonTurSuresiMs));
    if (e.ozet.dosyalar.length > 0)
      parca.push(e.ozet.dosyalar.length + ' dosya +' + e.ozet.arti + ' −' + e.ozet.eksi);
    return parca.join(' · ');
  }
  if (e.durum === 'calisiyor') {
    if (e.arac) return (e.arac.alt ? 'alt ajan · ' : '') + e.arac.ad + (e.arac.hedef ? ' ' + e.arac.hedef : '');
    return e.turBasladi ? 'Düşünüyor · ' + sureMs(simdi - e.turBasladi) : 'Düşünüyor';
  }
  if (e.durum === 'kapandi') return 'Oturum kapandı';
  return 'Hazır';
}

/** Durum isareti: calisiyor = nabiz (renksiz), bekliyor = amber, bitti/bosta = bos halka. */
export function DurumIsareti({ durum }: { durum: OturumEtkinligi['durum'] }) {
  if (durum === 'bekliyor')
    return <span className="size-1.5 shrink-0 rounded-full bg-dikkat ring-2 ring-dikkat/30" aria-hidden="true" />;
  if (durum === 'calisiyor')
    return (
      <span className="calisma-isareti" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
    );
  return <span className="size-1.5 shrink-0 rounded-full border border-metin-soluk" aria-hidden="true" />;
}

const DURUM_ADI: Record<OturumEtkinligi['durum'], string> = {
  bosta: 'Hazır',
  calisiyor: 'Çalışıyor',
  bekliyor: 'Seni bekliyor',
  bitti: 'Bitti',
  kapandi: 'Kapandı',
};

function AracSatiri({ a, simdi }: { a: EtkinlikAraci; simdi: number }) {
  const Ikon = aracIkonu(a.ad);
  const suruyor = a.bitti === null;
  const gecen = suruyor ? simdi - a.basladi : 0;
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      {a.alt && <span className="shrink-0 text-metin-soluk">alt ajan ·</span>}
      <Ikon className="size-3.5 shrink-0 text-metin-ikincil" aria-hidden="true" />
      <span className="shrink-0 text-metin-ikincil">{a.ad}</span>
      {a.hedef && <span className="enstruman truncate text-metin">{a.hedef}</span>}
      <Fark arti={a.arti} eksi={a.eksi} />
      {suruyor && gecen >= 3000 && <span className="enstruman shrink-0 text-metin-soluk">{sureMs(gecen)}</span>}
    </span>
  );
}

/**
 * Bolmenin ustundeki tek satir: durum, son arac, tur suresi, oturum ozeti. Tiklayinca son
 * araclarin akisi acilir. Ekran okuyucuya yalniz DURUM degisimi duyurulur; her arac degil.
 */
export function EtkinlikSeridi({ e, simdi }: { e: OturumEtkinligi; simdi: number }) {
  const [acik, setAcik] = useState(false);
  const kap = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!acik) return;
    const disari = (ev: MouseEvent) => {
      if (kap.current && !kap.current.contains(ev.target as Node)) setAcik(false);
    };
    const tus = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') setAcik(false);
    };
    // Yakalama asamasi: odak terminaldeyken xterm Escape'i yutar (stopPropagation), akis
    // acik kalirdi. Olayi durdurmuyoruz; Escape claude'a da gider (kullanicinin niyeti).
    window.addEventListener('mousedown', disari);
    window.addEventListener('keydown', tus, true);
    return () => {
      window.removeEventListener('mousedown', disari);
      window.removeEventListener('keydown', tus, true);
    };
  }, [acik]);

  const o = e.ozet;
  const bekliyor = e.durum === 'bekliyor';
  return (
    <div ref={kap} className="relative shrink-0">
      <span className="sr-only" role="status">
        {DURUM_ADI[e.durum]}
      </span>
      <button
        type="button"
        onClick={() => setAcik((a) => !a)}
        aria-expanded={acik}
        aria-controls={panelId}
        title="Son araçlar"
        className={
          'flex w-full cursor-pointer items-center gap-3 border-b px-2.5 py-1 text-left text-xs transition-colors duration-[120ms] ' +
          (bekliyor ? 'border-dikkat/30 bg-dikkat/10' : 'border-kenar bg-yuzey hover:bg-yuzey-guclu')
        }
      >
        <span className="flex shrink-0 items-center gap-2">
          <DurumIsareti durum={e.durum} />
          <span className={bekliyor ? 'text-dikkat-metin' : 'text-metin-ikincil'}>{DURUM_ADI[e.durum]}</span>
        </span>

        <span className="min-w-0 flex-1">
          {bekliyor ? (
            <span className="block truncate text-metin">{e.soru}</span>
          ) : e.durum === 'bitti' ? (
            <span className="flex min-w-0 items-center gap-1.5 text-metin-soluk">
              {e.sonTurSuresiMs !== null && <span className="enstruman shrink-0">tur {sureMs(e.sonTurSuresiMs)}</span>}
              {e.arac && (
                <>
                  <span className="shrink-0">· son:</span>
                  <AracSatiri a={e.arac} simdi={simdi} />
                </>
              )}
            </span>
          ) : e.arac ? (
            <AracSatiri a={e.arac} simdi={simdi} />
          ) : e.durum === 'calisiyor' ? (
            <span className="text-metin-soluk">Düşünüyor</span>
          ) : null}
        </span>

        <span className="enstruman flex shrink-0 items-center gap-2 text-metin-soluk">
          {e.durum === 'calisiyor' && e.turBasladi !== null && (
            <span title="Bu turun süresi">{sureMs(simdi - e.turBasladi)}</span>
          )}
          {o.dosyalar.length > 0 && (
            <span title="Bu oturumda değişen dosya ve satır">
              {o.dosyalar.length} dosya <span className="text-metin-ikincil">+{o.arti}</span> −{o.eksi}
            </span>
          )}
          <ChevronDown className={'size-3.5 ' + (acik ? 'rotate-180' : '')} aria-hidden="true" />
        </span>
      </button>

      {acik && (
        <div
          id={panelId}
          className="halka absolute inset-x-2 top-full z-20 mt-1 max-h-72 overflow-y-auto rounded-kontrol bg-yuzey-guclu p-1.5 shadow-2xl shadow-black/60"
        >
          {e.olaylar.length === 0 ? (
            <p className="px-2 py-1.5 text-xs text-metin-soluk">Henüz araç çağrısı yok.</p>
          ) : (
            <ol aria-label="Son araçlar, en yenisi üstte" className="text-xs">
              {[...e.olaylar].reverse().map((x, i) => {
                const Ikon = aracIkonu(x.ad);
                return (
                  <li key={x.t + '-' + i} className="flex items-center gap-2 rounded px-2 py-1 odd:bg-yuzey/60">
                    <span className="enstruman w-16 shrink-0 text-metin-soluk">
                      {new Date(x.t).toLocaleTimeString('tr-TR')}
                    </span>
                    <Ikon className="size-3.5 shrink-0 text-metin-ikincil" aria-hidden="true" />
                    <span className="w-20 shrink-0 truncate text-metin-ikincil">
                      {x.alt ? '↳ ' : ''}
                      {x.ad}
                    </span>
                    <span className="enstruman min-w-0 flex-1 truncate text-metin">{x.hedef}</span>
                    <Fark arti={x.arti} eksi={x.eksi} />
                  </li>
                );
              })}
            </ol>
          )}
          <p className="enstruman border-t border-kenar px-2 pt-1.5 pb-0.5 text-xs text-metin-soluk">
            {o.turlar} tur · {o.araclar} araç · {o.dosyalar.length} dosya
          </p>
        </div>
      )}
    </div>
  );
}

function sifirlanmaMetni(ms: number | null, simdi: number) {
  if (!ms) return null;
  const kalan = ms - simdi;
  if (kalan <= 0) return 'sıfırlandı';
  // Ek yok ("22:14'te" / "00:30'da"): saatin okunusuna gore ek uretmek hata kaynagi.
  const t = new Date(ms);
  const saat = t.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  if (kalan < 24 * 3600_000) return 'sıfırlanma ' + saat;
  return 'sıfırlanma ' + t.toLocaleDateString('tr-TR', { weekday: 'short' }) + ' ' + saat;
}

function LimitSatiri({ ad, l, simdi }: { ad: string; l: Limit; simdi: number }) {
  const y = Math.max(0, Math.min(100, Math.round(l.yuzde)));
  const sinif = y >= 95 ? 'bg-hata' : y >= 80 ? 'bg-dikkat' : 'bg-metin-ikincil';
  const sifir = sifirlanmaMetni(l.sifirlanma, simdi);
  return (
    <div title={sifir ?? undefined}>
      <div className="flex items-baseline justify-between text-xs">
        <span className="text-metin-ikincil">{ad}</span>
        <span className={'enstruman ' + (y >= 80 ? 'text-dikkat-metin' : 'text-metin')}>%{y}</span>
      </div>
      <div
        role="meter"
        aria-label={ad + ' limiti'}
        aria-valuenow={y}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuetext={'%' + y + (sifir ? ', ' + sifir : '')}
        className="mt-1 h-1 overflow-hidden rounded-full bg-kenar-guclu"
      >
        <div className={'h-full rounded-full ' + sinif} style={{ width: y + '%' }} />
      </div>
      {sifir && <p className="mt-0.5 text-[0.6875rem] text-metin-soluk">{sifir}</p>}
    </div>
  );
}

/** Kenar cubugunun altinda: claude plan limitleri (statusline'dan, Kokpit oturumlarindan). */
export function LimitGostergesi({ limitler, simdi }: { limitler: Limitler | null; simdi: number }) {
  if (!limitler || (!limitler.besSaat && !limitler.hafta)) return null;
  const eski = simdi - limitler.olculdu > 30 * 60_000;
  return (
    <div className="space-y-2">
      <p className="etiket flex items-center justify-between">
        Limit
        {eski && (
          <span className="enstruman normal-case tracking-normal" title="Son ölçüm 30 dakikadan eski">
            {new Date(limitler.olculdu).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
          </span>
        )}
      </p>
      {limitler.besSaat && <LimitSatiri ad="5 saat" l={limitler.besSaat} simdi={simdi} />}
      {limitler.hafta && <LimitSatiri ad="Hafta" l={limitler.hafta} simdi={simdi} />}
    </div>
  );
}
