import { useEffect, useState, type JSX } from 'react';
import { Music, Pause, Play, SkipBack, SkipForward } from 'lucide-react';
import type { MedyaDurumu, SozSatiri, Sozler } from '../types';
import { IkonDugme, Olcer, SayfaBos, sayacMetni } from './ortak';

// Ada'nin medya sayfasi (v4.0): calan parca, kontrol, sarki sozu. Durum main'de (medya.cjs); burada yalniz
// konum ilerletilir, cunku main her saniye yayin yapmaz (olculdu + konumMs yeter).

/** Calarken olcum anindan bu yana gecen sure eklenir; sure biliniyorsa ona kirpilir. */
export function medyaKonumu(m: MedyaDurumu, simdi: number): number {
  // simdi < olculdu olabilir (yeni yayin eski bir saatle cizilirse): geri gitmesin.
  const ham = m.caliyor ? m.konumMs + Math.max(0, simdi - m.olculdu) : m.konumMs;
  const k = Math.max(0, ham);
  return m.sureMs > 0 ? Math.min(k, m.sureMs) : k;
}

function parcaAnahtari(m: MedyaDurumu | null): string | null {
  return m ? m.baslik + '|' + m.sanatci + '|' + m.album : null;
}

function hareketAzalt() {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Saniye sinirina hizali tik: rastgele fazli setInterval(1000) gosterilen saniyeyi bazen atlatip bazen iki
 * kez gosteriyordu. `faz` sinirin epoch'taki karsiligi (konum = 0 ani); tik siniri 20 ms gecince gelir.
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

// Satir bir tik erken yansin: goz satiri okurken ses zaten basliyor.
const SOZ_ONDE = 200;

function etkinSatir(satirlar: SozSatiri[], konum: number): number {
  let i = -1;
  for (let j = 0; j < satirlar.length; j++) {
    if (satirlar[j].t <= konum + SOZ_ONDE) i = j;
    else break;
  }
  return i;
}

type SozHali = { anahtar: string; s: Sozler | 'yukleniyor' | 'yok' };

export function MedyaSayfasi({ medya, sozlerAcik }: { medya: MedyaDurumu | null; sozlerAcik: boolean }): JSX.Element {
  const anahtar = parcaAnahtari(medya);
  const simdi = useHizaliSaniye(!!medya?.caliyor, medya ? medya.olculdu - medya.konumMs : 0);

  // Kapak parca degisince bir kez gelir; sonraki yayinlarda bos gelirse eldekini tut.
  const [sakliKapak, setSakliKapak] = useState<{ anahtar: string; kapak: string } | null>(null);
  useEffect(() => {
    if (anahtar && medya?.kapak) setSakliKapak({ anahtar, kapak: medya.kapak });
  }, [anahtar, medya?.kapak]);
  const kapak = medya?.kapak ?? (sakliKapak && sakliKapak.anahtar === anahtar ? sakliKapak.kapak : null);

  const [soz, setSoz] = useState<SozHali | null>(null);
  useEffect(() => {
    if (!sozlerAcik || !anahtar) return;
    // Parca degisince cleanup iptal eder: gec gelen cevap yeni parcanin ustune yazilmaz.
    let iptal = false;
    setSoz({ anahtar, s: 'yukleniyor' });
    window.kokpit.medyaSozler().then(
      (s) => {
        if (iptal) return;
        setSoz({ anahtar, s: s && !('yok' in s) && s.satirlar.length > 0 ? s : 'yok' });
      },
      () => {
        if (!iptal) setSoz({ anahtar, s: 'yok' });
      },
    );
    return () => {
      iptal = true;
    };
  }, [sozlerAcik, anahtar]);

  const sozler = soz && soz.anahtar === anahtar ? soz.s : 'yukleniyor';
  const esliSatirlar = typeof sozler === 'object' && !('yok' in sozler) && sozler.esli ? sozler.satirlar : null;

  // Etkin satir saniyelik tikten sik yoklanir (satirlar saniyeye hizali degil); deger ayniysa React cizmez.
  const [etkin, setEtkin] = useState(-1);
  useEffect(() => {
    if (!medya || !esliSatirlar) return;
    const bul = () => etkinSatir(esliSatirlar, medyaKonumu(medya, Date.now()));
    setEtkin(bul());
    if (!medya.caliyor) return;
    const t = setInterval(() => {
      if (!document.hidden) setEtkin(bul());
    }, 450);
    return () => clearInterval(t);
  }, [medya, esliSatirlar]);

  if (!medya) {
    return (
      <section aria-label="Medya" data-ada-sayfa="medya" className="px-2 py-1.5 text-xs">
        <SayfaBos>Çalan bir şey yok. Spotify ya da tarayıcıda bir şey açınca burada görünür.</SayfaBos>
      </section>
    );
  }

  const konum = medyaKonumu(medya, simdi);
  const gecen = sayacMetni(Math.floor(konum / 1000) * 1000);
  const alt = [medya.album, medya.uygulama].filter(Boolean).join(' · ');

  return (
    <section aria-label="Medya" data-ada-sayfa="medya" className="px-2 py-1.5 text-xs">
      <div className="flex items-center gap-3">
        {kapak ? (
          <img src={kapak} alt="" className="size-14 shrink-0 rounded-lg border border-kenar object-cover" />
        ) : (
          <span className="flex size-14 shrink-0 items-center justify-center rounded-lg border border-kenar bg-yuzey-guclu text-metin-soluk">
            <Music className="size-5" aria-hidden="true" />
          </span>
        )}
        <div className="min-w-0 flex-1 space-y-0.5">
          <p className="truncate text-[0.8125rem] font-medium text-metin" title={medya.baslik}>
            {medya.baslik || 'Adsız parça'}
          </p>
          {medya.sanatci && (
            <p className="truncate text-metin-ikincil" title={medya.sanatci}>
              {medya.sanatci}
            </p>
          )}
          {alt && (
            <p className="truncate text-metin-soluk" title={alt}>
              {alt}
            </p>
          )}
        </div>
      </div>

      <div className="mt-2.5 flex items-center gap-2">
        <div role="group" aria-label="Oynatma kontrolleri" className="flex shrink-0 items-center gap-1">
          <IkonDugme etiket="Önceki parça" onClick={() => window.kokpit.medyaKomut('onceki')} disabled={!medya.kontrol.onceki}>
            <SkipBack className="size-3.5" aria-hidden="true" />
          </IkonDugme>
          <button
            type="button"
            onClick={() => window.kokpit.medyaKomut('oynat-duraklat')}
            disabled={!medya.kontrol.oynat}
            aria-label={medya.caliyor ? 'Duraklat' : 'Oynat'}
            title={medya.caliyor ? 'Duraklat' : 'Oynat'}
            className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-full bg-birincil text-birincil-uzeri transition-opacity duration-[120ms] hover:opacity-90 disabled:cursor-default disabled:opacity-40"
          >
            {medya.caliyor ? (
              <Pause className="size-3.5" fill="currentColor" aria-hidden="true" />
            ) : (
              <Play className="size-3.5 translate-x-px" fill="currentColor" aria-hidden="true" />
            )}
          </button>
          <IkonDugme etiket="Sonraki parça" onClick={() => window.kokpit.medyaKomut('sonraki')} disabled={!medya.kontrol.sonraki}>
            <SkipForward className="size-3.5" aria-hidden="true" />
          </IkonDugme>
        </div>
        <span role="status" className="sr-only">
          {medya.caliyor ? 'Çalıyor' : 'Duraklatıldı'}
        </span>
        <span className="enstruman ml-1 shrink-0 text-metin-soluk" title="Geçen süre">
          {gecen}
        </span>
        {medya.sureMs > 0 && (
          <>
            <Olcer ad="Parçanın konumu" yuzde={(konum / medya.sureMs) * 100} esikli={false} />
            <span className="enstruman shrink-0 text-metin-soluk" title="Parçanın süresi">
              {sayacMetni(Math.floor(medya.sureMs / 1000) * 1000)}
            </span>
          </>
        )}
      </div>

      {sozlerAcik && (
        <div className="mt-3 border-t border-kenar pt-2">
          <SozGovdesi sozler={sozler} esliSatirlar={esliSatirlar} etkin={etkin} />
        </div>
      )}
    </section>
  );
}

function SozGovdesi({
  sozler,
  esliSatirlar,
  etkin,
}: {
  sozler: SozHali['s'];
  esliSatirlar: SozSatiri[] | null;
  etkin: number;
}) {
  if (sozler === 'yukleniyor') return <p className="py-1 text-metin-soluk">Sözler aranıyor…</p>;
  if (sozler === 'yok' || 'yok' in sozler) return <p className="py-1 text-metin-soluk">Bu parça için söz bulunamadı.</p>;

  if (!esliSatirlar) {
    return (
      <div>
        <p className="text-[0.6875rem] text-metin-soluk">Zamansız söz</p>
        <div
          tabIndex={0}
          aria-label="Şarkı sözleri"
          className="mt-1 max-h-28 overflow-y-auto whitespace-pre-line break-words pr-1 leading-5 text-metin-ikincil"
        >
          {sozler.satirlar.map((s) => s.metin).join('\n')}
        </div>
      </div>
    );
  }

  // Bes satirlik pencere, etkin satir ortada; basta ve sonda pencere kenara yaslanir.
  const n = esliSatirlar.length;
  const bas = Math.max(0, Math.min(etkin - 2, n - 5));
  const pencere = esliSatirlar.slice(bas, bas + 5);
  return (
    // Sabit yukseklik: satir degisince kart boyu oynamasin (5 satir + etkin satirin olasi ikinci satiri).
    <ol aria-label="Şarkı sözleri" className="h-[7.5rem] overflow-hidden text-[0.8125rem] leading-5">
      {pencere.map((s, i) => {
        const sira = bas + i;
        const bu = sira === etkin;
        const bos = !s.metin.trim();
        return (
          <li
            key={sira}
            aria-current={bu ? 'true' : undefined}
            title={bos ? undefined : s.metin}
            className={
              'transition-colors duration-[120ms] ' +
              (bu ? 'line-clamp-2 break-words text-metin' : 'truncate text-metin-soluk')
            }
          >
            {bos ? (
              <>
                <span className="enstruman whitespace-pre text-metin-soluk" aria-hidden="true">
                  {'·  ·  ·'}
                </span>
                <span className="sr-only">Müzik arası</span>
              </>
            ) : (
              s.metin
            )}
          </li>
        );
      })}
    </ol>
  );
}

// Sekiz adimlik sabit desen: rastgele degil, cunku her acilista ayni ritim "olculen bir sey" gibi okunur
// ve testte tekrarlanabilir.
const DESEN: readonly (readonly [number, number, number])[] = [
  [0.45, 0.9, 0.6],
  [0.7, 0.55, 0.95],
  [1, 0.4, 0.7],
  [0.6, 0.8, 0.45],
  [0.35, 1, 0.8],
  [0.8, 0.65, 0.5],
  [0.55, 0.85, 1],
  [0.9, 0.5, 0.65],
];
const DURGUN = [0.25, 0.25, 0.25] as const;

/**
 * Kapali hapta calan sarki gostergesi. Sonsuz CSS animasyonu yok (DESIGN.md hareket butcesi): 480 ms'lik
 * zamanlayici desende bir adim ilerler, aradaki gecis transform ile; pencere gizliyse adim atlanir.
 */
export function MedyaCubuklari({ caliyor }: { caliyor: boolean }): JSX.Element {
  const [adim, setAdim] = useState(0);
  const azalt = hareketAzalt();
  useEffect(() => {
    if (!caliyor || hareketAzalt()) return;
    const t = setInterval(() => {
      if (!document.hidden) setAdim((n) => (n + 1) % DESEN.length);
    }, 480);
    return () => clearInterval(t);
  }, [caliyor]);
  const y = caliyor ? DESEN[azalt ? 0 : adim] : DURGUN;
  return (
    <span aria-hidden="true" className="inline-flex h-3 shrink-0 items-end gap-0.5">
      {y.map((s, i) => (
        <i
          key={i}
          className="block h-full w-0.5 rounded-full bg-aksan"
          style={{
            transform: 'scaleY(' + s + ')',
            transformOrigin: 'bottom',
            // Kisa gecis, uzun durak: 480 ms'lik adimin yalniz ilk 120 ms'inde kare uretilir (hareket butcesi, DESIGN.md v2.5).
            transition: azalt ? 'none' : 'transform 120ms ease-out',
          }}
        />
      ))}
    </span>
  );
}
