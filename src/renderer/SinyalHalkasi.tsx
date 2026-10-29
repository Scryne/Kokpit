import { useEffect, useRef } from 'react';

// v3.3, Aria'nin yuzu: sinyal halkasi (Scryne 2026-10-29'da uc yon arasindan secti). Ince gumus halkalar ve bir
// cekirdek. Bosta duragan (hareket butcesi: akrilik pencerede sonsuz animasyon yok, DESIGN.md v2.5 olcumu);
// dinlerken halkalar mikrofon seviyesiyle acilir, dusunurken orta halkada bir isik yayi doner, yazarken noktalar
// disari dalgalanir, konusurken cekirdek ve noktalar sesin genligiyle titrer. Kare dongusu yalniz hal hareketliyken
// ve pencere odaktayken calisir; hareket azaltmada her hal tek, duragan bir cizimdir.

export type HalkaHali = 'bosta' | 'aciliyor' | 'dusunuyor' | 'yaziyor' | 'arac' | 'dinliyor' | 'konusuyor' | 'hata';

const GUMUS = '#C3CEDB'; // aksan
const ACIK = '#E6EAF0'; // birincil
const SOLUK = '#A3A9B3'; // metin-soluk
const HATA = '#C4466E';

export default function SinyalHalkasi({
  hal,
  seviye,
  boyut = 184,
}: {
  hal: HalkaHali;
  /** 0..1: dinlerken mikrofon, konusurken sesin genligi. */
  seviye: number;
  boyut?: number;
}) {
  const tuval = useRef<HTMLCanvasElement>(null);
  const seviyeRef = useRef(seviye);
  seviyeRef.current = seviye;
  const halRef = useRef(hal);
  halRef.current = hal;

  useEffect(() => {
    const c = tuval.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = boyut * dpr;
    c.height = boyut * dpr;
    const g = c.getContext('2d');
    if (!g) return;
    const azalt = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const hareketli = hal !== 'bosta' && hal !== 'hata' && !azalt;
    let kare = 0;
    let gorunur = document.hasFocus();
    const t0 = performance.now();
    let yumusak = 0; // seviyenin yumusatilmis hali (titreme degil nefes)

    const ciz = (simdi: number) => {
      const t = (simdi - t0) / 1000;
      const h = halRef.current;
      yumusak += (seviyeRef.current - yumusak) * 0.25;
      const s = yumusak;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, boyut, boyut);
      const m = boyut / 2;
      const R = boyut * 0.44;
      // Dis nokta halkasi: 72 nokta. Yazarken dalga, konusurken genlik, dinlerken acilma.
      for (let i = 0; i < 72; i++) {
        const a = (i / 72) * Math.PI * 2 - Math.PI / 2;
        let r = R;
        let alfa = 0.28;
        if (h === 'yaziyor') {
          const dalga = Math.sin(a * 3 - t * 4);
          r += dalga * 2.2;
          alfa = 0.3 + 0.35 * Math.max(0, dalga);
        } else if (h === 'konusuyor') {
          const dalga = Math.sin(a * 5 + t * 6) * 0.5 + 0.5;
          r += s * 10 * dalga;
          alfa = 0.3 + 0.6 * s * dalga;
        } else if (h === 'dinliyor') {
          r += 2 + s * 9;
          alfa = 0.35 + 0.5 * s;
        } else if (h === 'hata') {
          alfa = i % 6 === 0 ? 0.6 : 0.15;
        }
        g.beginPath();
        g.arc(m + Math.cos(a) * r, m + Math.sin(a) * r, i % 6 === 0 ? 1.4 : 0.9, 0, Math.PI * 2);
        g.fillStyle = h === 'hata' ? HATA : GUMUS;
        g.globalAlpha = alfa;
        g.fill();
      }
      g.globalAlpha = 1;
      // Ince halkalar: orta ve ic. Dinlerken aralari acilir.
      const acilma = h === 'dinliyor' ? 4 + s * 8 : 0;
      for (const [oran, kalinlik, alfa] of [
        [0.33, 1, 0.35],
        [0.25, 1.4, 0.55],
      ] as const) {
        g.beginPath();
        g.arc(m, m, boyut * oran + acilma * (oran > 0.3 ? 1 : 0.5), 0, Math.PI * 2);
        g.strokeStyle = GUMUS;
        g.globalAlpha = alfa;
        g.lineWidth = kalinlik;
        g.stroke();
      }
      g.globalAlpha = 1;
      // Dusunurken / arac kullanirken / acilirken: orta halkada donen isik yayi.
      if (h === 'dusunuyor' || h === 'arac' || h === 'aciliyor') {
        const hiz = h === 'arac' ? 3.2 : h === 'aciliyor' ? 1.2 : 2;
        const bas = t * hiz;
        const yay = g.createConicGradient(bas, m, m);
        yay.addColorStop(0, 'rgba(230,234,240,0.95)');
        yay.addColorStop(0.18, 'rgba(230,234,240,0)');
        yay.addColorStop(1, 'rgba(230,234,240,0)');
        g.beginPath();
        g.arc(m, m, boyut * 0.33, 0, Math.PI * 2);
        g.strokeStyle = yay;
        g.lineWidth = 2.2;
        g.stroke();
      }
      // Cekirdek: gumus radyal gradyan; konusurken genlikle buyur, bostayken sakin.
      const cr = boyut * (0.13 + (h === 'konusuyor' ? s * 0.035 : h === 'dinliyor' ? s * 0.02 : 0));
      const cek = g.createRadialGradient(m - cr * 0.35, m - cr * 0.45, cr * 0.1, m, m, cr);
      cek.addColorStop(0, ACIK);
      cek.addColorStop(0.55, GUMUS);
      cek.addColorStop(1, h === 'hata' ? HATA : SOLUK);
      g.beginPath();
      g.arc(m, m, cr, 0, Math.PI * 2);
      g.fillStyle = cek;
      g.globalAlpha = h === 'bosta' ? 0.82 : 1;
      g.fill();
      g.globalAlpha = 1;
      // Cekirdegin ust kenarinda tek isik (isik kaynagi sol-ust, DESIGN.md).
      g.beginPath();
      g.arc(m, m, cr - 0.5, Math.PI * 1.1, Math.PI * 1.55);
      g.strokeStyle = 'rgba(255,255,255,0.7)';
      g.lineWidth = 1;
      g.stroke();
      if (hareketli && gorunur) kare = requestAnimationFrame(ciz);
    };
    const odak = () => {
      gorunur = true;
      cancelAnimationFrame(kare);
      kare = requestAnimationFrame(ciz);
    };
    const bulanik = () => {
      gorunur = false;
    };
    window.addEventListener('focus', odak);
    window.addEventListener('blur', bulanik);
    kare = requestAnimationFrame(ciz);
    return () => {
      cancelAnimationFrame(kare);
      window.removeEventListener('focus', odak);
      window.removeEventListener('blur', bulanik);
    };
  }, [hal, boyut]);

  return (
    <canvas
      ref={tuval}
      data-sinyal-halkasi={hal}
      role="img"
      aria-label={HAL_ADI[hal]}
      style={{ width: boyut, height: boyut }}
      className="shrink-0"
    />
  );
}

export const HAL_ADI: Record<HalkaHali, string> = {
  bosta: 'Aria hazır',
  aciliyor: 'Aria uyanıyor',
  dusunuyor: 'Aria düşünüyor',
  yaziyor: 'Aria yazıyor',
  arac: 'Aria bakıyor',
  dinliyor: 'Aria dinliyor',
  konusuyor: 'Aria konuşuyor',
  hata: 'Aria bir hata aldı',
};
