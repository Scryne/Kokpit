import { useEffect, useState } from 'react';
import { Check, Plus, X } from 'lucide-react';
import type { Yapilacak } from '../types';
import { AdaGirdi, IkonDugme, SayfaBos } from './ortak';

// v4.0 Liste sayfasi. Durum main'de (electron/yapilacak.cjs); sayfa yalniz cizer ve komut yollar,
// yeni liste yayinla geri gelir (iyimser guncelleme yok). Sira main'den gelir, burada degismez.
// Tarih hesaplari yerel saatle: toISOString UTC'ye kaydirir, gece 00-03 arasi bir gun geri dusurur.

export const AY_ADI = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
export const AY_KISA = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
/** getDay() sirasiyla (0 = Pazar). */
export const GUN_ADI = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
const GUN_KISA = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];

const iki = (n: number) => String(n).padStart(2, '0');

/** Yerel takvim gunu, YYYY-MM-DD. */
export function yerelGun(simdi: number): string {
  const d = new Date(simdi);
  return d.getFullYear() + '-' + iki(d.getMonth() + 1) + '-' + iki(d.getDate());
}

/** Date -> YYYY-MM-DD (yerel). */
export function gunAnahtari(d: Date): string {
  return d.getFullYear() + '-' + iki(d.getMonth() + 1) + '-' + iki(d.getDate());
}

/** YYYY-MM-DD -> yerel gece yarisi; bozuksa null. */
export function tarihCoz(tarih: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(tarih);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  // 2026-02-31 gibi tasan tarihler Date'te sessizce kayar; kaymissa gecersiz say.
  return d.getMonth() === Number(m[2]) - 1 ? d : null;
}

/** Bugunden `tarih`e kac takvim gunu (gecmis negatif); bozuksa null. */
export function gunFarki(tarih: string, simdi: number): number | null {
  const d = tarihCoz(tarih);
  if (!d) return null;
  const s = new Date(simdi);
  const bugun = new Date(s.getFullYear(), s.getMonth(), s.getDate());
  // Yaz saati gecisinde gun 23/25 saat olur; yuvarlama bunu emer.
  return Math.round((d.getTime() - bugun.getTime()) / 86_400_000);
}

export function tarihEtiketi(tarih: string, simdi: number): { metin: string; gecikmis: boolean; bugun: boolean } {
  const fark = gunFarki(tarih, simdi);
  const d = tarihCoz(tarih);
  if (fark === null || !d) return { metin: tarih, gecikmis: false, bugun: false };
  if (fark < 0) return { metin: -fark + ' gün gecikti', gecikmis: true, bugun: false };
  if (fark === 0) return { metin: 'Bugün', gecikmis: false, bugun: true };
  if (fark === 1) return { metin: 'Yarın', gecikmis: false, bugun: false };
  if (fark < 7) return { metin: GUN_KISA[d.getDay()], gecikmis: false, bugun: false };
  const yil = new Date(simdi).getFullYear() !== d.getFullYear() ? ' ' + d.getFullYear() : '';
  return { metin: d.getDate() + ' ' + AY_KISA[d.getMonth()] + yil, gecikmis: false, bugun: false };
}

/**
 * Bugunun zamani; yalniz takvim gunu degisince yeniden cizdirir. Dakikada bir yoklar: gece yarisi
 * "Bugün" etiketleri ve takvimin bugun hucresi kendiliginden kaysin diye.
 */
export function useBugun(): number {
  const [simdi, setSimdi] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => {
      const t = Date.now();
      setSimdi((onceki) => (yerelGun(onceki) === yerelGun(t) ? onceki : t));
    }, 60_000);
    return () => clearInterval(id);
  }, []);
  return simdi;
}

const BITEN_SINIRI = 5;

/** Tek yapilacak satiri: satirin tamami onay kutusu, sil ayri dugme. Takvim de kullanir (tarihsiz). */
export function YapilacakSatiri({ y, simdi, tarihsiz }: { y: Yapilacak; simdi: number; tarihsiz?: boolean }) {
  const et = !tarihsiz && y.tarih ? tarihEtiketi(y.tarih, simdi) : null;
  const tarihRengi = !et || y.bitti ? 'text-metin-soluk' : et.gecikmis ? 'text-dikkat-metin' : et.bugun ? 'text-metin-ikincil' : 'text-metin-soluk';
  return (
    <li data-yapilacak={y.id} className="group flex items-start gap-0.5 rounded-lg transition-colors duration-[120ms] hover:bg-yuzey-guclu/60">
      <button
        type="button"
        role="checkbox"
        aria-checked={y.bitti}
        onClick={() => window.kokpit.listeKomut({ tur: 'degistir', id: y.id, bitti: !y.bitti })}
        title={y.metin}
        className="flex min-w-0 flex-1 cursor-pointer items-start gap-2 rounded-lg px-1.5 py-1 text-left"
      >
        <span
          aria-hidden="true"
          className={
            'flex size-4 shrink-0 items-center justify-center rounded-rozet border border-kenar-guclu ' +
            (y.bitti ? 'bg-yuzey-guclu text-metin-ikincil' : '')
          }
        >
          {y.bitti && <Check className="size-3" />}
        </span>
        <span
          className={
            'line-clamp-2 min-w-0 flex-1 break-words leading-4 ' +
            (y.bitti ? 'text-metin-soluk line-through decoration-kenar-guclu' : 'text-metin')
          }
        >
          {y.metin}
        </span>
        {et && <span className={'enstruman shrink-0 leading-4 ' + tarihRengi}>{et.metin}</span>}
      </button>
      {/* Sil yalniz uzerine gelince ya da klavye odaginda: satir sakin kalsin, Tab yine ulassin. */}
      <span className="py-0.5 pr-0.5 opacity-0 transition-opacity duration-[120ms] focus-within:opacity-100 group-hover:opacity-100">
        <IkonDugme etiket={'Sil: ' + y.metin} ipucu="Sil" onClick={() => window.kokpit.listeKomut({ tur: 'sil', id: y.id })}>
          <X className="size-3.5" aria-hidden="true" />
        </IkonDugme>
      </span>
    </li>
  );
}

export function ListeSayfasi({ liste }: { liste: Yapilacak[] }) {
  const simdi = useBugun();
  const [bitenlerAcik, setBitenlerAcik] = useState(false);
  const acik = liste.filter((y) => !y.bitti);
  const biten = liste.filter((y) => y.bitti);
  const gecikmis = acik.filter((y) => y.tarih && (gunFarki(y.tarih, simdi) ?? 0) < 0).length;
  const gorunenBiten = bitenlerAcik ? biten : biten.slice(0, BITEN_SINIRI);

  return (
    <section aria-label="Liste" data-ada-sayfa="liste" className="px-2 py-1.5 text-xs">
      <div className="mb-1.5 flex items-baseline gap-2 px-0.5">
        <span className="etiket">Liste</span>
        <span className="enstruman text-metin-soluk">
          {acik.length} açık
          {gecikmis > 0 && <span className="text-dikkat-metin"> · {gecikmis} gecikti</span>}
        </span>
      </div>
      <AdaGirdi
        placeholder="Yapılacak ekle · 'yarın …' tarih verir"
        etiket="Yapılacak ekle"
        ikon={<Plus className="size-3.5" aria-hidden="true" />}
        onGonder={(metin) => window.kokpit.listeKomut({ tur: 'ekle', metin })}
      />
      {liste.length === 0 ? (
        <SayfaBos>{"Liste boş. Yukarıya yaz ya da 'Ada, listeye ekle …' de."}</SayfaBos>
      ) : (
        <>
          {acik.length === 0 ? (
            <p className="px-1.5 py-2 text-metin-soluk">Açık iş yok.</p>
          ) : (
            <ul aria-label="Açık yapılacaklar" className="mt-1.5">
              {acik.map((y) => (
                <YapilacakSatiri key={y.id} y={y} simdi={simdi} />
              ))}
            </ul>
          )}
          {biten.length > 0 && (
            <div className="mt-1.5 border-t border-kenar pt-1.5">
              <div className="flex items-center gap-2 px-0.5">
                <span className="etiket">Bitenler</span>
                <span className="enstruman text-metin-soluk">{biten.length}</span>
                <button
                  type="button"
                  onClick={() => window.kokpit.listeKomut({ tur: 'temizle' })}
                  title="Bitenleri listeden sil"
                  className="ml-auto cursor-pointer rounded px-1 py-0.5 text-metin-soluk transition-colors duration-[120ms] hover:text-metin"
                >
                  Temizle
                </button>
              </div>
              <ul aria-label="Biten yapılacaklar" className="mt-0.5">
                {gorunenBiten.map((y) => (
                  <YapilacakSatiri key={y.id} y={y} simdi={simdi} />
                ))}
              </ul>
              {biten.length > BITEN_SINIRI && (
                <button
                  type="button"
                  aria-expanded={bitenlerAcik}
                  onClick={() => setBitenlerAcik((x) => !x)}
                  className="mt-0.5 cursor-pointer rounded px-1.5 py-0.5 text-metin-soluk transition-colors duration-[120ms] hover:text-metin"
                >
                  {bitenlerAcik ? (
                    'Daha az göster'
                  ) : (
                    <>
                      <span className="enstruman">+{biten.length - BITEN_SINIRI}</span> daha
                    </>
                  )}
                </button>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
