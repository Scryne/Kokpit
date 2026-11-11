import { useEffect, useState, type JSX } from 'react';
import type { OdakAsamasi, OdakDurumu } from '../types';
import { sayacMetni } from './ortak';

// Ada'nin odak sayfasi (v4.0): pomodoro. Sayac main'de (odak.cjs) yasar; burada yalniz geri sayim cizilir.

export const ODAK_ADI: Record<OdakAsamasi, string> = { odak: 'Odak', kisa: 'Kısa mola', uzun: 'Uzun mola' };

/** Calisiyorsa bitise kalan (>= 0), duruyorsa main'in yayinladigi kalan. */
export function odakKalan(o: OdakDurumu, simdi: number): number {
  if (o.calisiyor && o.bitis !== null) return Math.max(0, o.bitis - simdi);
  return Math.max(0, o.kalanMs);
}

// Cip etiketleri main'in varsayilan sureleriyle ayni olmali (odak.cjs).
const ASAMALAR: { asama: OdakAsamasi; kisa: string; dakika: number }[] = [
  { asama: 'odak', kisa: 'Odak', dakika: 25 },
  { asama: 'kisa', kisa: 'Kısa', dakika: 5 },
  { asama: 'uzun', kisa: 'Uzun', dakika: 15 },
];
const OZEL_DAKIKA = [15, 45, 60, 90];

/**
 * Saniye sinirina hizali tik (bkz. MedyaSayfasi): rastgele fazli setInterval gosterilen saniyeyi
 * bazen atlatiyordu. Geri sayimda sinir `bitis`e gore: kalan tam saniyeyi gectigi an.
 */
function useHizaliSaniye(aktif: boolean, faz: number): number {
  const [simdi, setSimdi] = useState(() => Date.now());
  useEffect(() => {
    setSimdi(Date.now());
    if (!aktif) return;
    let t: ReturnType<typeof setTimeout>;
    const kur = () => {
      const bekle = ((((faz - Date.now()) % 1000) + 1000) % 1000) + 20;
      t = setTimeout(() => {
        if (!document.hidden) setSimdi(Date.now());
        kur();
      }, bekle);
    };
    kur();
    return () => clearTimeout(t);
  }, [aktif, faz]);
  return simdi;
}

const CIP =
  'cursor-pointer rounded-full border px-2.5 py-0.5 text-xs transition-colors duration-[120ms] ';
const CIP_BOS = 'border-kenar text-metin-ikincil hover:border-kenar-guclu hover:text-metin';
const CIP_SECILI = 'border-kenar-guclu bg-yuzey-guclu text-metin';
const METIN_DUGME =
  'cursor-pointer rounded-kontrol px-1.5 py-1 text-xs text-metin-soluk transition-colors duration-[120ms] hover:text-metin disabled:cursor-default disabled:opacity-40 disabled:hover:text-metin-soluk';

export function OdakSayfasi({ odak }: { odak: OdakDurumu | null }): JSX.Element {
  const simdi = useHizaliSaniye(!!odak?.calisiyor, odak?.bitis ?? 0);

  if (!odak) {
    return (
      <section aria-label="Odak" data-ada-sayfa="odak" className="px-2 py-1.5 text-xs">
        <p role="status" className="px-1 py-3 text-metin-soluk">
          Odak sayacı yükleniyor…
        </p>
      </section>
    );
  }

  // Yeni yayin eski bir saatle cizilirse kalan sureyi asmasin.
  const kalan = Math.min(odakKalan(odak, simdi), odak.sureMs > 0 ? odak.sureMs : Infinity);
  // Yukari yuvarla: 25:00 baslangicta gorunsun, 0:00 yalniz bitiste.
  const metin = sayacMetni(Math.ceil(kalan / 1000) * 1000);
  const ilerleme = odak.sureMs > 0 ? Math.max(0, Math.min(1, (odak.sureMs - kalan) / odak.sureMs)) : 0;
  const baslamadi = !odak.calisiyor && odak.kalanMs >= odak.sureMs;
  const ad = ODAK_ADI[odak.asama];
  const komut = window.kokpit.odakKomut;

  return (
    <section aria-label="Odak" data-ada-sayfa="odak" className="px-2 py-1.5 text-xs">
      <div className="flex items-center gap-3.5">
        <Halka ilerleme={ilerleme} />
        <div className="min-w-0 flex-1">
          <p
            role="timer"
            aria-label={ad + ', kalan ' + metin}
            className={'enstruman text-3xl leading-none ' + (odak.calisiyor ? 'text-metin' : 'text-metin-ikincil')}
          >
            {metin}
          </p>
          <div className="mt-2 flex items-center gap-2.5">
            <p role="status" className="min-w-0 truncate text-metin-ikincil">
              {ad}
              <span className="text-metin-soluk">
                {' · '}
                {!odak.calisiyor && !baslamadi ? 'duraklatıldı · ' : ''}
                bugün{' '}
              </span>
              <span className="enstruman">{odak.tur}</span>
              <span className="text-metin-soluk"> tur</span>
            </p>
            <TurNoktalari tur={odak.tur} asama={odak.asama} />
          </div>
          <div className="mt-2 flex items-center gap-1">
            <button
              type="button"
              onClick={() => komut(odak.calisiyor ? { tur: 'duraklat' } : { tur: 'baslat' })}
              className="min-w-[4.75rem] cursor-pointer rounded-kontrol bg-birincil px-2.5 py-1 text-xs font-medium text-birincil-uzeri transition-opacity duration-[120ms] hover:opacity-90"
            >
              {odak.calisiyor ? 'Duraklat' : baslamadi ? 'Başlat' : 'Sürdür'}
            </button>
            <button
              type="button"
              onClick={() => komut({ tur: 'sifirla' })}
              disabled={baslamadi}
              title={ad + ' süresini başa al'}
              className={METIN_DUGME}
            >
              Sıfırla
            </button>
            <button
              type="button"
              onClick={() => komut({ tur: 'atla' })}
              title={ad + ' aşamasını bitir, sıradakine geç'}
              className={METIN_DUGME}
            >
              Atla
            </button>
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-kenar pt-2.5">
        <div role="radiogroup" aria-label="Aşama" className="flex items-center gap-1">
          {ASAMALAR.map((a) => {
            const sec = odak.asama === a.asama;
            return (
              <button
                key={a.asama}
                type="button"
                role="radio"
                aria-checked={sec}
                onClick={() => komut({ tur: 'baslat', asama: a.asama })}
                title={ODAK_ADI[a.asama] + ': ' + a.dakika + ' dk, hemen başlar'}
                className={CIP + (sec ? CIP_SECILI : CIP_BOS)}
              >
                {a.kisa} <span className="enstruman">{a.dakika}</span>
              </button>
            );
          })}
        </div>
        <div role="group" aria-label="Özel süreli odak" className="ml-auto flex items-center gap-1">
          <span className="mr-0.5 text-metin-soluk">Özel</span>
          {OZEL_DAKIKA.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => komut({ tur: 'baslat', asama: 'odak', dakika: d })}
              aria-label={'Odak ' + d + ' dakika, hemen başlar'}
              title={'Odak: ' + d + ' dk, hemen başlar'}
              className={CIP + 'enstruman px-2 ' + CIP_BOS}
            >
              {d}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

/** 64 px ilerleme halkasi; ici bos (sayi yaninda). Saniyede bir anlik degisir, gecis yok. */
function Halka({ ilerleme }: { ilerleme: number }) {
  const r = 30.5;
  const cevre = 2 * Math.PI * r;
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" className="shrink-0" aria-hidden="true">
      <circle cx="32" cy="32" r={r} fill="none" stroke="var(--color-kenar-guclu)" strokeWidth="3" />
      {ilerleme > 0 && (
        <circle
          cx="32"
          cy="32"
          r={r}
          fill="none"
          stroke="var(--color-metin-ikincil)"
          strokeWidth="3"
          strokeDasharray={cevre * ilerleme + ' ' + cevre}
          transform="rotate(-90 32 32)"
        />
      )}
    </svg>
  );
}

/** Uzun molaya kac odak kaldi: dort noktanin dolu olanlari bu donguda biten odaklar. */
function TurNoktalari({ tur, asama }: { tur: number; asama: OdakAsamasi }) {
  // Uzun moladayken dongu tamamlanmistir: dordu de dolu gorunsun (tur % 4 burada 0 verir).
  const dolu = asama === 'uzun' && tur > 0 && tur % 4 === 0 ? 4 : tur % 4;
  const kalan = 4 - dolu;
  return (
    <span
      role="img"
      aria-label={kalan === 0 ? 'Uzun mola hakkı kazanıldı' : 'Uzun molaya ' + kalan + ' odak kaldı'}
      title={kalan === 0 ? 'Uzun mola' : 'Uzun molaya ' + kalan + ' odak'}
      className="flex shrink-0 items-center gap-1"
    >
      {[0, 1, 2, 3].map((i) => (
        <span
          key={i}
          className={'block size-1.5 rounded-full ' + (i < dolu ? 'bg-metin-ikincil' : 'border border-kenar-guclu')}
        />
      ))}
    </span>
  );
}
