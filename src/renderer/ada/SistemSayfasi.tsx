import { useEffect, useState, type JSX } from 'react';
import type { SistemDurumu } from '../types';
import { Olcer, SayfaBos } from './ortak';

// Ada'nin sistem sayfasi (v4.0): CPU / bellek / GPU. Olcum main'de (sistem.cjs) ve yalniz izleyen varken
// calisir; sayfa kendi aboneligini acip kapatir (izle sayaci main'de, StrictMode'un cift mount'u
// true/false/true olarak dengelenir).

const GRAFIK_G = 600;
const GRAFIK_Y = 56;
const OLCUM = 60;

const ondalik = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
function gb(bayt: number) {
  return ondalik.format(bayt / 1024 ** 3);
}

function yuzdeRengi(y: number) {
  return y >= 95 ? 'text-hata-metin' : y >= 80 ? 'text-dikkat-metin' : 'text-metin';
}

export function SistemSayfasi(): JSX.Element {
  const [d, setD] = useState<SistemDurumu | null>(null);
  useEffect(() => {
    window.kokpit.sistemIzle(true);
    const birak = window.kokpit.sistemDinle(setD);
    return () => {
      birak();
      window.kokpit.sistemIzle(false);
    };
  }, []);

  if (!d) {
    return (
      <section aria-label="Sistem" data-ada-sayfa="sistem" className="px-2 py-1.5 text-xs">
        <SayfaBos>Ölçülüyor…</SayfaBos>
      </section>
    );
  }

  const cpu = Math.round(Math.max(0, Math.min(100, d.cpu)));
  const bellekYuzde = d.bellek.toplam > 0 ? (d.bellek.kullanilan / d.bellek.toplam) * 100 : 0;
  const g = d.gpu;
  const gpuYuzde = g ? Math.round(Math.max(0, Math.min(100, g.yuzde))) : 0;
  const vramYuzde = g && g.bellekToplam > 0 ? (g.bellekKullanilan / g.bellekToplam) * 100 : 0;

  return (
    <section aria-label="Sistem" data-ada-sayfa="sistem" className="px-2 py-1.5 text-xs">
      <CpuGrafigi gecmis={d.gecmis} simdi={cpu} />

      <div className="mt-3 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2">
        <span className="text-metin-soluk">İşlemci</span>
        <Olcer ad="İşlemci kullanımı" yuzde={cpu} />
        <span className={'enstruman text-right ' + yuzdeRengi(cpu)}>%{cpu}</span>

        <span className="text-metin-soluk">Bellek</span>
        <Olcer ad="Bellek kullanımı" yuzde={bellekYuzde} />
        <span className="enstruman text-right">
          <span className={yuzdeRengi(bellekYuzde)}>{gb(d.bellek.kullanilan)}</span>
          <span className="text-metin-soluk"> / {gb(d.bellek.toplam)} GB</span>
        </span>

        {g && (
          <>
            <span className="text-metin-soluk" title={g.ad}>
              Ekran kartı
            </span>
            <Olcer ad="Ekran kartı kullanımı" yuzde={gpuYuzde} />
            <span className="enstruman text-right" title={g.ad}>
              <span className={yuzdeRengi(gpuYuzde)}>%{gpuYuzde}</span>
              {g.sicaklik !== null && (
                <span
                  className={g.sicaklik >= 85 ? 'text-dikkat-metin' : 'text-metin-soluk'}
                  title={'Ekran kartı sıcaklığı' + (g.sicaklik >= 85 ? ': yüksek' : '')}
                >
                  {' · ' + Math.round(g.sicaklik) + '°C'}
                </span>
              )}
            </span>

            <span className="text-metin-soluk" title={g.ad}>
              Görüntü belleği
            </span>
            <Olcer ad="Görüntü belleği kullanımı" yuzde={vramYuzde} />
            <span className="enstruman text-right" title={g.ad}>
              <span className={yuzdeRengi(vramYuzde)}>{gb(g.bellekKullanilan)}</span>
              <span className="text-metin-soluk"> / {gb(g.bellekToplam)} GB</span>
            </span>
          </>
        )}
      </div>

      {g && (
        <p className="mt-2 truncate text-[0.6875rem] text-metin-soluk" title={g.ad}>
          {g.ad}
        </p>
      )}
    </section>
  );
}

/**
 * Son 60 olcumun cizgisi; yeni olcum sagda. Gecmis kisaysa sola bosluk kalir (sag yasli), boylece
 * x ekseni hep "son 2 dakika" demektir. Izgara yok, yalniz %50 cizgisi: oran gozle okunsun.
 */
function CpuGrafigi({ gecmis, simdi }: { gecmis: number[]; simdi: number }) {
  const veri = gecmis.slice(-OLCUM).map((v) => Math.max(0, Math.min(100, Number.isFinite(v) ? v : 0)));
  const adim = GRAFIK_G / (OLCUM - 1);
  const ust = 2;
  const alt = GRAFIK_Y - 1;
  const noktalar = veri.map((v, i) => {
    const x = (OLCUM - veri.length + i) * adim;
    const y = alt - (v / 100) * (alt - ust);
    return x.toFixed(1) + ',' + y.toFixed(1);
  });
  const ilkX = ((OLCUM - veri.length) * adim).toFixed(1);
  const sonX = GRAFIK_G.toFixed(1);
  return (
    <figure className="m-0">
      <svg
        role="img"
        aria-label={'İşlemci kullanımı, son 2 dakika, şu an %' + simdi}
        viewBox={'0 0 ' + GRAFIK_G + ' ' + GRAFIK_Y}
        preserveAspectRatio="none"
        className="block h-14 w-full"
      >
        <line
          x1="0"
          x2={GRAFIK_G}
          y1={GRAFIK_Y / 2}
          y2={GRAFIK_Y / 2}
          stroke="var(--color-kenar)"
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
        />
        {veri.length > 1 && (
          <>
            <polygon
              points={ilkX + ',' + alt + ' ' + noktalar.join(' ') + ' ' + sonX + ',' + alt}
              fill="rgb(195 200 209 / 0.08)"
            />
            <polyline
              points={noktalar.join(' ')}
              fill="none"
              stroke="var(--color-metin-ikincil)"
              strokeWidth="1.25"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          </>
        )}
      </svg>
      <figcaption className="enstruman mt-0.5 flex justify-between text-[0.625rem] text-metin-soluk" aria-hidden="true">
        <span>−2 dk</span>
        <span>şimdi</span>
      </figcaption>
    </figure>
  );
}
