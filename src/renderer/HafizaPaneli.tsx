import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, ChevronRight, MessageSquareQuote, Search } from 'lucide-react';
import type { HafizaDosyasi, HafizaOzeti, HafizaSonucu } from './types';
import { mdCiz } from './md';

// v3.3, Aria'nin hafiza paneli (Faz 61): "Aria ne biliyor". Vault salt okunur (electron/hafiza.cjs): kimlik, acik konular,
// kurallar, son oturumlar, Journal ve bilgi tabani aramasi. Bir dosya panelin icinde okunur; "Aria'ya sor" yazi
// kutusuna o dosyadan baslayan bir soru koyar. DESIGN.md: panel opak yuzey (cam degil), basliklar `etiket`, yollar mono.

type Sekme = 'hafiza' | 'bilgi';

/** Obsidian [[baglanti|ad]] -> ad (okuyucuda duz metin). */
function wikiTemizle(m: string) {
  return m.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2').replace(/\[\[([^\]]+)\]\]/g, (_x, a: string) => a.split('/').pop() ?? a);
}

export default function HafizaPaneli({
  acilacak,
  onSor,
}: {
  /** Disaridan acilmasi istenen dosya ("hafizaya yazdi" tiklandi). */
  acilacak: { yol: string; t: number } | null;
  onSor: (onek: string) => void;
}) {
  const [sekme, setSekme] = useState<Sekme>('hafiza');
  const [ozet, setOzet] = useState<HafizaOzeti | null>(null);
  const [sorgu, setSorgu] = useState('');
  const [sonuclar, setSonuclar] = useState<HafizaSonucu[] | null>(null);
  const [okunan, setOkunan] = useState<HafizaDosyasi | null>(null);
  const [acikKonu, setAcikKonu] = useState<number | null>(null);
  const [kurallarAcik, setKurallarAcik] = useState(false);
  const [coreTam, setCoreTam] = useState(false);

  const tazele = useCallback(() => void window.kokpit.hafizaOzet().then(setOzet), []);
  useEffect(() => tazele(), [tazele]);

  const ac = useCallback(async (yol: string) => {
    const d = await window.kokpit.hafizaOku(yol);
    if ('hata' in d) return;
    setOkunan(d);
  }, []);

  useEffect(() => {
    if (!acilacak) return;
    void ac(acilacak.yol);
    tazele(); // Aria hafizaya yazdi: ozet de tazelensin
  }, [acilacak, ac, tazele]);

  // Arama: yazdikca (250 ms bekleme), en az 2 harf.
  useEffect(() => {
    const s = sorgu.trim();
    if (s.length < 2) {
      setSonuclar(null);
      return;
    }
    const t = setTimeout(() => void window.kokpit.hafizaAra(s).then(setSonuclar), 250);
    return () => clearTimeout(t);
  }, [sorgu]);

  if (okunan) {
    return (
      <aside aria-label="Hafıza: dosya" data-hafiza-okuyucu className="flex min-h-0 flex-col">
        <div className="flex shrink-0 items-center gap-2 border-b border-kenar pb-2">
          <button type="button" onClick={() => setOkunan(null)} aria-label="Geri" className="cursor-pointer rounded p-1 text-metin-soluk hover:bg-yuzey hover:text-metin">
            <ArrowLeft className="size-4" aria-hidden="true" />
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm text-metin">{okunan.baslik}</p>
            <p className="enstruman truncate text-[0.6875rem] text-metin-soluk" title={okunan.yol}>{okunan.yol}</p>
          </div>
          <button
            type="button"
            onClick={() => onSor('«' + okunan.baslik + '» (' + okunan.yol + ') hakkında: ')}
            title="Bu dosyadan başlayan bir soru"
            className="flex shrink-0 cursor-pointer items-center gap-1 rounded-kontrol border border-kenar px-2 py-0.5 text-xs text-metin-ikincil hover:border-kenar-guclu hover:text-metin"
          >
            <MessageSquareQuote className="size-3.5" aria-hidden="true" />
            Aria'ya sor
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto pt-2 text-sm leading-relaxed text-metin-ikincil">{mdCiz(wikiTemizle(okunan.metin))}</div>
      </aside>
    );
  }

  return (
    <aside aria-label="Aria'nın hafızası" data-hafiza-paneli className="flex min-h-0 flex-col">
      <div role="tablist" aria-label="Hafıza sekmeleri" className="flex shrink-0 gap-1 border-b border-kenar pb-2">
        {(['hafiza', 'bilgi'] as const).map((s) => (
          <button
            key={s}
            type="button"
            role="tab"
            aria-selected={sekme === s}
            onClick={() => setSekme(s)}
            className={
              'cursor-pointer rounded-kontrol px-2.5 py-1 text-xs transition-colors duration-[120ms] ' +
              (sekme === s ? 'bg-yuzey-guclu text-metin' : 'text-metin-soluk hover:text-metin')
            }
          >
            {s === 'hafiza' ? 'Hafıza' : 'Bilgi' + (ozet ? ' · ' + ozet.makale : '')}
          </button>
        ))}
      </div>

      {sekme === 'bilgi' ? (
        <div className="flex min-h-0 flex-1 flex-col pt-2">
          <label className="halka relative flex shrink-0 items-center gap-2 rounded-kontrol border border-kenar bg-terminal/60 px-2">
            <Search className="size-3.5 shrink-0 text-metin-soluk" aria-hidden="true" />
            <input
              value={sorgu}
              onChange={(e) => setSorgu(e.target.value)}
              placeholder="Bilgi tabanında ara"
              aria-label="Bilgi tabanında ara"
              data-hafiza-ara
              className="min-w-0 flex-1 bg-transparent py-1.5 text-sm text-metin placeholder:text-metin-soluk focus:outline-none"
            />
          </label>
          <ul className="mt-2 min-h-0 flex-1 space-y-1 overflow-y-auto" aria-label="Arama sonuçları">
            {sonuclar === null && <li className="text-xs text-metin-soluk">Makaleler, bağlantılar, proje notları ve hafıza dosyaları aranır.</li>}
            {sonuclar?.length === 0 && <li className="text-xs text-metin-soluk">Sonuç yok.</li>}
            {sonuclar?.map((r) => (
              <li key={r.yol}>
                <button type="button" data-hafiza-sonuc onClick={() => void ac(r.yol)} className="w-full cursor-pointer rounded-kontrol px-2 py-1.5 text-left hover:bg-yuzey">
                  <p className="truncate text-sm text-metin">{r.baslik}</p>
                  <p className="line-clamp-2 text-xs text-metin-soluk">{r.parca}</p>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : !ozet ? (
        <p className="pt-2 text-xs text-metin-soluk">Okunuyor…</p>
      ) : (
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pt-2 text-sm">
          <section aria-label="Kimlik">
            <p className="etiket mb-1">Kimlik</p>
            <div className={'text-xs leading-relaxed text-metin-ikincil ' + (coreTam ? '' : 'line-clamp-6')}>{mdCiz(ozet.core.replace(/^﻿?#[^\n]*\n/, ''))}</div>
            <button type="button" onClick={() => setCoreTam((x) => !x)} className="cursor-pointer text-xs text-metin-soluk underline decoration-kenar-guclu underline-offset-2 hover:text-metin">
              {coreTam ? 'Daralt' : 'Tamamı'}
            </button>
          </section>

          <section aria-label="Açık konular">
            <p className="etiket mb-1">Açık konular · {ozet.threadler.length}</p>
            <ul className="space-y-0.5">
              {ozet.threadler.map((t, i) => (
                <li key={i}>
                  <button
                    type="button"
                    aria-expanded={acikKonu === i}
                    onClick={() => setAcikKonu(acikKonu === i ? null : i)}
                    className="flex w-full cursor-pointer items-baseline gap-2 rounded-kontrol px-1 py-1 text-left hover:bg-yuzey"
                  >
                    <span className="w-4 shrink-0 text-xs" aria-hidden="true">{t.isaret}</span>
                    <span className="min-w-0 flex-1 truncate text-metin-ikincil" title={t.baslik}>{t.baslik}</span>
                    <ChevronRight className={'size-3 shrink-0 text-metin-soluk transition-transform duration-[120ms] ' + (acikKonu === i ? 'rotate-90' : '')} aria-hidden="true" />
                  </button>
                  {acikKonu === i && <div className="mb-1 ml-6 text-xs leading-relaxed text-metin-soluk">{mdCiz(wikiTemizle(t.govde))}</div>}
                </li>
              ))}
            </ul>
          </section>

          <section aria-label="Kurallar">
            <button type="button" aria-expanded={kurallarAcik} onClick={() => setKurallarAcik((x) => !x)} className="etiket mb-1 flex cursor-pointer items-center gap-1 hover:text-metin">
              Kurallar · {ozet.kurallar.length}
              <ChevronRight className={'size-3 transition-transform duration-[120ms] ' + (kurallarAcik ? 'rotate-90' : '')} aria-hidden="true" />
            </button>
            {kurallarAcik && (
              <ol className="list-decimal space-y-1.5 pl-5 text-xs leading-relaxed text-metin-ikincil marker:text-metin-soluk">
                {ozet.kurallar.map((k, i) => (
                  <li key={i} title={k.neden}>{mdCiz(k.kural)}</li>
                ))}
              </ol>
            )}
          </section>

          <section aria-label="Son oturumlar">
            <p className="etiket mb-1">Son oturumlar</p>
            <ul className="space-y-1.5">
              {ozet.sonOturumlar.map((s, i) => (
                <li key={i} className="text-xs">
                  <p className="text-metin-ikincil">{s.baslik}</p>
                  <p className="line-clamp-3 text-metin-soluk">{s.govde.replace(/\*\*/g, '')}</p>
                </li>
              ))}
            </ul>
          </section>

          <section aria-label="Journal">
            <p className="etiket mb-1">Journal</p>
            <ul className="space-y-1.5">
              {ozet.journal.slice(0, 3).map((j, i) => (
                <li key={i} className="text-xs">
                  <p className="text-metin-ikincil">{j.baslik}</p>
                  <p className="line-clamp-3 text-metin-soluk">{j.govde}</p>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </aside>
  );
}
