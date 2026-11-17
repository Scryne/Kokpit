import { useCallback, useRef, useSyncExternalStore } from 'react';
import { sureMetni } from './parcalar';

// Saniyelik "simdi" degeri. Eskiden App kendi state'ini her saniye tazeliyordu ve 2.000+
// satirlik sayfa (gizli sayfalar dahil) saniyede bir bastan ciziliyordu. Artik deger yalniz
// onu GOSTEREN en kucuk bilesende yasar; aralik basina tek ortak zamanlayici var.
//
// Kurallar: abone sayisi sifira inince zamanlayici temizlenir; pencere gizliyken tiklenmez
// (gorunur olunca hemen bir kez tazelenir).

interface Saat {
  deger: number;
  aboneler: Set<() => void>;
  zamanlayici: ReturnType<typeof setInterval> | null;
}

const saatler = new Map<number, Saat>();

function saatAl(aralikMs: number): Saat {
  let s = saatler.get(aralikMs);
  if (!s) {
    s = { deger: Date.now(), aboneler: new Set(), zamanlayici: null };
    saatler.set(aralikMs, s);
  }
  return s;
}

function durdur(s: Saat) {
  if (s.zamanlayici !== null) {
    clearInterval(s.zamanlayici);
    s.zamanlayici = null;
  }
}

function tikle(s: Saat) {
  s.deger = Date.now();
  for (const bildir of s.aboneler) bildir();
}

function calistir(s: Saat, aralikMs: number) {
  durdur(s);
  if (document.hidden) return;
  s.zamanlayici = setInterval(() => tikle(s), aralikMs);
}

// Pencere gorunur olunca bir kez hemen tazele ve yeniden basla; gizlenince dur.
// (Arkada gecen sure atlanmasin: donunce metin bir tik gecikmesin.)
document.addEventListener('visibilitychange', () => {
  for (const [aralikMs, s] of saatler) {
    if (s.aboneler.size === 0) continue;
    if (document.hidden) durdur(s);
    else {
      tikle(s);
      calistir(s, aralikMs);
    }
  }
});

/**
 * `aralikMs`de bir tazelenen "simdi". `etkin` false iken abone olmaz, son degeri dondurur
 * (suren bir is yokken saniyede bir cizim yapilmasin).
 */
export function useSimdi(aralikMs: number, etkin = true): number {
  const abone = useCallback(
    (bildir: () => void) => {
      if (!etkin) return () => {};
      const s = saatAl(aralikMs);
      s.aboneler.add(bildir);
      // Ilk abone: deger bayat olabilir (kimse tikletmiyordu), hemen tazele.
      s.deger = Date.now();
      calistir(s, aralikMs);
      return () => {
        s.aboneler.delete(bildir);
        if (s.aboneler.size === 0) durdur(s);
      };
    },
    [aralikMs, etkin]
  );
  const deger = useSyncExternalStore(abone, () => saatAl(aralikMs).deger);
  const son = useRef(deger);
  if (etkin) son.current = deger;
  return son.current;
}

/** Gecen sure metni ("2 dk"). Yalniz metin doner: sarmalayici oge yok. */
export function Sure({ baslangic }: { baslangic: number }): string {
  const simdi = useSimdi(1000);
  return sureMetni(Math.floor((simdi - baslangic) / 1000));
}
