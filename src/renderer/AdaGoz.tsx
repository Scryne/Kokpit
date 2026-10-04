import { useEffect, useState } from 'react';
import type { OturumEtkinligi } from './types';

// Ada'nin gozu (v2.5): Kokpit'in gumusunden kucuk bir govde, iki goz. Coucou'nun Mochi'si ve
// Notch Pilot'un goz stilinden esinlendi; davranisi uydurma bir duygudan degil, hook'larin
// gercekten bildigi durumdan gelir (hangi arac, soru var mi, tur bitti mi, alt ajan var mi).
//
// Hareket butcesi (olculdu, bkz. DESIGN.md "Ada v2.5"): sonsuz CSS animasyonu yok. Calisirken
// nefes ve okuma bakisi 480 ms'lik bir zamanlayicinin anlik konum degisimleri; aradaki surede
// compositor kare uretmez. Bosta, bitti ve uyku duragan; kirpma birkac saniyede bir 140 ms.
// Hareket azaltmada zamanlayicilar hic kurulmaz, tek seferlik animasyonlar son karede durur.

/** Gozun hali: durum + bitti anindaki kisa sevinc + uzun sessizlik. */
export type GozHali = 'bosta' | 'calisiyor' | 'bekliyor' | 'bitti' | 'mutlu' | 'uyku';
/** Calisirken bakis: aracin turune gore. */
export type GozPozu = 'dusun' | 'oku' | 'yaz' | 'komut' | 'web' | 'ajan' | 'odak';

/**
 * Son aracin turu -> bakis. Arac yoksa (tur yeni basladi) ya da son arac 1,5 sn'den once bittiyse
 * claude araclar arasinda dusunuyordur: gozler yukari kayar.
 */
export function gozPozu(e: OturumEtkinligi | null, simdi: number): GozPozu {
  const a = e?.arac;
  if (!a || (a.bitti !== null && simdi - a.bitti > 1500)) return 'dusun';
  switch (a.ad) {
    case 'Read':
    case 'Grep':
    case 'Glob':
      return 'oku';
    case 'Edit':
    case 'MultiEdit':
    case 'Write':
    case 'NotebookEdit':
      return 'yaz';
    case 'Bash':
    case 'PowerShell':
      return 'komut';
    case 'WebFetch':
    case 'WebSearch':
      return 'web';
    case 'Agent':
    case 'Task':
      return 'ajan';
    default:
      return 'odak';
  }
}

function hareketAzalt() {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

export function AdaGoz({
  hal,
  poz,
  altSayisi,
  onay,
  takip,
}: {
  hal: GozHali;
  poz: GozPozu;
  /** Calisan alt ajan sayisi: govdenin yaninda nokta basina bir ajan (en fazla 3 nokta). */
  altSayisi: number;
  /** Her artista bir kez basini sallar (ada'dan cevap gonderildi). */
  onay: number;
  /** Imlec kartin ustundeyken gozlerin kaymasi (px), yoksa null. */
  takip: { x: number; y: number } | null;
}) {
  const [kirp, setKirp] = useState(false);
  const [sallar, setSallar] = useState(false);
  const [adim, setAdim] = useState(0);

  // Calisirken: 480 ms'de bir adim. Nefes 4 adimda bir tur (~1,9 sn), okuma 5 durakta bir satir.
  useEffect(() => {
    if (hal !== 'calisiyor' || hareketAzalt()) {
      setAdim(0);
      return;
    }
    const t = setInterval(() => {
      if (!document.hidden) setAdim((n) => (n + 1) % 20);
    }, 480);
    return () => clearInterval(t);
  }, [hal]);

  // Ara sira kirpma: surekli animasyon degil, birkac saniyede bir 140 ms'lik tek gecis. Okurken
  // (gozler satir tariyor) ve sabit hallerde yok; pencere gizliyken zamanlayici bos doner.
  useEffect(() => {
    if ((hal !== 'bosta' && hal !== 'calisiyor') || (hal === 'calisiyor' && poz === 'oku') || hareketAzalt()) return;
    let t1: ReturnType<typeof setTimeout>;
    let t2: ReturnType<typeof setTimeout>;
    const kur = () => {
      t1 = setTimeout(() => {
        if (document.hidden) return kur();
        setKirp(true);
        t2 = setTimeout(() => {
          setKirp(false);
          kur();
        }, 140);
      }, 4200 + Math.random() * 3600);
    };
    kur();
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      setKirp(false);
    };
  }, [hal, poz]);

  useEffect(() => {
    if (!onay) return;
    setSallar(true);
    const t = setTimeout(() => setSallar(false), 700);
    return () => clearTimeout(t);
  }, [onay]);

  const nokta = Math.min(altSayisi, 3);
  return (
    <span
      className="ada-goz"
      data-hal={hal}
      data-poz={hal === 'calisiyor' ? poz : undefined}
      data-nefes={hal === 'calisiyor' && adim % 4 >= 2 ? '' : undefined}
      data-oku={hal === 'calisiyor' && poz === 'oku' ? adim % 5 : undefined}
      data-kirp={kirp || undefined}
      data-onay={sallar || undefined}
      aria-hidden="true"
    >
      <span className="ada-goz-halo" />
      <span className="ada-goz-govde">
        <span className="ada-goz-takip" style={takip ? { transform: `translate(${takip.x}px, ${takip.y}px)` } : undefined}>
          <span className="ada-goz-poz">
            <i className="ada-goz-g" />
            <i className="ada-goz-g" />
          </span>
        </span>
      </span>
      {nokta > 0 && (
        <span className="ada-goz-altlar">
          {Array.from({ length: nokta }, (_, i) => (
            <i key={i} />
          ))}
        </span>
      )}
      <span className="ada-goz-z">z</span>
    </span>
  );
}
