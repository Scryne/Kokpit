import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY, type SimulationLinkDatum, type SimulationNodeDatum } from 'd3-force';
import { Locate, Search } from 'lucide-react';
import type { AgGrubu, AriaAraci, HafizaAgi } from './types';
import type { HalkaHali } from './SinyalHalkasi';

// v3.4, Aria'nin agi: vault'un not grafigi bir sinir agi gibi. Dugumler notlar (hafiza, proje, bilgi, kavram, gun), kenarlar
// notlarin kendi baglari (electron/hafiza-ag.cjs). Merkezde Aria. Aria bir notu okudugunda merkezden o nota bir sinyal yol
// alir (agin kendi baglari uzerinden en kisa yol), varinca not parlar ve aktivasyon komsulara yayilir; yazdiginda notun
// etrafinda bir halka acilir; aradiginda eslesen notlar yanar; Scryne bir sey sordugunda hafizada eslesen notlar soluk
// yanar (cagrisim: arama eslesmesi, Aria'nin okudugu degil). Aria dusunurken son ates alan notlar arasinda kivilcim dolasir.
// DESIGN.md: yeni renk yok (gumus rampa; amber yalniz "seni bekliyor": onay bekleyen onerinin projesi). Hareket butcesi:
// kare dongusu yalniz bir sey hareket ederken ve pencere odaktayken; bostayken tek cizim. Hareket azaltmada sinyal yolculugu
// yok, yanan notlar duragan isaretlenir. Yerlesim bir kez hesaplanir ve saklanir: agin cografyasi gunden gune ayni kalir.

export type AtesTuru = 'okuma' | 'yazma' | 'arama' | 'cagrisim' | 'kokpit';
export interface AgKumanda {
  ates: (idler: string[], tur: AtesTuru, etiket: string) => void;
}

const GUMUS = '#C3CEDB'; // aksan
const ACIK = '#E6EAF0'; // birincil
const SOLUK = '#A3A9B3'; // metin-soluk
const METIN = '#F3F5F8';
const DIKKAT = '#C99A3E';
const ZEMIN = 'rgba(11,12,15,0.85)';
const YERLESIM_ANAHTAR = 'kokpit.aria.ag.yerlesim.v1';
const YAZAN = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit']);

const GRUP_ADI: Record<AgGrubu, string> = {
  aria: 'Aria',
  kokpit: 'Kokpit araçları',
  kimlik: 'hafıza',
  proje: 'proje',
  bilgi: 'bilgi',
  kavram: 'kavram',
  gunluk: 'gün',
  arsiv: 'arşiv',
};

interface Dugum extends SimulationNodeDatum {
  i: number;
  id: string;
  baslik: string;
  grup: AgGrubu;
  yol: string | null;
  t: number;
  derece: number;
  r: number;
  anahtar: string;
}
type Bag = SimulationLinkDatum<Dugum> & { tur: string };

interface Sinyal {
  yol: number[];
  t0: number;
  adim: number; // ms / sekme
  guc: number; // 0..1 parlaklik
  varis: AtesTuru | null; // varinca hedef ates alir
}

function anahtar(s: string) {
  return s
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i')
    .replace(/ş/g, 's')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c');
}

function yaricap(grup: AgGrubu, derece: number) {
  switch (grup) {
    case 'aria':
      return 9;
    case 'kokpit':
      return 4.5;
    case 'kimlik':
      return 5.5;
    case 'proje':
      return 4.6;
    case 'bilgi':
      return 4;
    case 'gunluk':
      return 2.6;
    case 'arsiv':
      return 2;
    default:
      return Math.min(5.2, 1.5 + Math.sqrt(derece) * 0.55);
  }
}

/** Bir arac cagrisinin agda hangi dugumleri yaktigi. SAF (dugum listesi + vault yolu verilir). */
export function aracDugumleri(a: AriaAraci, dugumler: { id: string; baslik: string; grup: AgGrubu }[], vault: string): { idler: string[]; tur: AtesTuru; etiket: string } {
  const varMi = new Set(dugumler.map((d) => d.id));
  const projeBul = (ad: string) => {
    const k = anahtar(ad);
    return dugumler.find((d) => d.grup === 'proje' && anahtar(d.id.split('/').pop() ?? '') === k)?.id;
  };
  if (a.ad.startsWith('kokpit.')) {
    const p = a.proje ? projeBul(a.proje) : undefined;
    return { idler: p ? ['kokpit', p] : ['kokpit'], tur: 'kokpit', etiket: a.ad + (a.proje ? ' ' + a.proje : '') };
  }
  if (a.dosya) {
    const tam = a.dosya.split('\\').join('/');
    const tur: AtesTuru = YAZAN.has(a.ad) ? 'yazma' : 'okuma';
    const fiil = tur === 'yazma' ? 'yazdı' : 'okudu';
    const kok = vault.replace(/\/+$/, '') + '/';
    if (tam.toLowerCase().startsWith(kok.toLowerCase())) {
      const id = tam.slice(kok.length).replace(/\.md$/, '');
      if (varMi.has(id)) return { idler: [id], tur, etiket: fiil + ' ' + id.split('/').pop() };
      return { idler: ['aria'], tur, etiket: fiil + ' ' + tam.slice(kok.length) };
    }
    // Vault disi: bir projenin dosyasi ise o projenin notu yanar (Projeler/<Ad>/...).
    const m = /\/Projeler\/([^/]+)\//i.exec(tam);
    const p = m ? projeBul(m[1]) : /dönem sonu projeler/i.test(tam) ? '🏰 300-Projects/Donem-Sonu-Projeleri' : undefined;
    if (p && varMi.has(p)) return { idler: [p], tur, etiket: fiil + ' ' + tam.split('/').slice(-2).join('/') };
    return { idler: [], tur, etiket: fiil + ' ' + tam.split('/').slice(-2).join('/') };
  }
  if (a.desen) {
    const sozler = anahtar(a.desen)
      .split(/[^a-z0-9]+/)
      .filter((s) => s.length >= 3);
    const idler = sozler.length
      ? dugumler
          .filter((d) => d.grup !== 'aria' && d.grup !== 'kokpit' && sozler.some((s) => anahtar(d.baslik + ' ' + d.id).includes(s)))
          .slice(0, 12)
          .map((d) => d.id)
      : [];
    return { idler, tur: 'arama', etiket: 'aradı ' + a.desen.slice(0, 40) };
  }
  return { idler: [], tur: 'okuma', etiket: a.ad + (a.hedef ? ' ' + a.hedef : '') };
}

function yerlesimOku(): Record<string, [number, number]> {
  try {
    return JSON.parse(localStorage.getItem(YERLESIM_ANAHTAR) ?? '{}') ?? {};
  } catch {
    return {};
  }
}
function yerlesimYaz(d: Dugum[]) {
  try {
    const o: Record<string, [number, number]> = {};
    for (const n of d) o[n.id] = [Math.round(n.x ?? 0), Math.round(n.y ?? 0)];
    localStorage.setItem(YERLESIM_ANAHTAR, JSON.stringify(o));
  } catch {
    /* depolama kapali: her acilista yeniden hesaplanir (deterministik) */
  }
}

/** Kuvvet yerlesimi: kayitli konumlar korunur, yeni notlar komsularinin yaninda dogar. d3-force rastgelesi tohumlu (deterministik). */
function yerlestir(ag: HafizaAgi): { dugumler: Dugum[]; baglar: Bag[]; komsu: number[][] } {
  const derece = new Map<string, number>();
  for (const k of ag.kenarlar) {
    derece.set(k.a, (derece.get(k.a) ?? 0) + 1);
    derece.set(k.b, (derece.get(k.b) ?? 0) + 1);
  }
  const dugumler: Dugum[] = ag.dugumler.map((d, i) => ({
    ...d,
    i,
    derece: derece.get(d.id) ?? 0,
    r: yaricap(d.grup, derece.get(d.id) ?? 0),
    anahtar: anahtar(d.baslik + ' ' + d.id),
  }));
  const sira = new Map(dugumler.map((d) => [d.id, d.i]));
  const baglar: Bag[] = ag.kenarlar.filter((k) => sira.has(k.a) && sira.has(k.b)).map((k) => ({ source: sira.get(k.a)!, target: sira.get(k.b)!, tur: k.tur }));
  const komsu: number[][] = dugumler.map(() => []);
  for (const b of baglar) {
    komsu[b.source as number].push(b.target as number);
    komsu[b.target as number].push(b.source as number);
  }
  const kayit = yerlesimOku();
  let bilinen = 0;
  for (const d of dugumler) {
    const k = kayit[d.id];
    if (k) {
      d.x = k[0];
      d.y = k[1];
      bilinen++;
    }
  }
  for (const d of dugumler) {
    if (d.x !== undefined) continue;
    const yaninda = komsu[d.i].map((j) => dugumler[j]).find((n) => n.x !== undefined);
    if (yaninda && bilinen) {
      d.x = (yaninda.x ?? 0) + ((d.i * 37) % 21) - 10;
      d.y = (yaninda.y ?? 0) + ((d.i * 53) % 21) - 10;
    }
  }
  const aria = dugumler.find((d) => d.id === 'aria');
  if (aria) {
    aria.fx = 0;
    aria.fy = 0;
  }
  const taze = bilinen / Math.max(1, dugumler.length) > 0.9;
  const sim = forceSimulation<Dugum>(dugumler)
    .force(
      'bag',
      forceLink<Dugum, Bag>(baglar)
        .distance((b) => (b.tur === 'aria' ? 46 : b.tur === 'konu' ? 22 : b.tur === 'kaynak' ? 38 : 30))
        .strength((b) => (b.tur === 'kaynak' ? 0.25 : b.tur === 'aria' ? 0.9 : 0.5))
    )
    .force('itme', forceManyBody<Dugum>().strength((d) => (d.grup === 'kavram' ? -26 : -60)).distanceMax(280))
    .force('carpisma', forceCollide<Dugum>((d) => d.r + 2))
    .force('x', forceX<Dugum>(0).strength(0.035))
    .force('y', forceY<Dugum>(0).strength(0.035))
    .stop();
  if (taze) sim.alpha(0.2);
  const adim = taze ? 60 : 320;
  for (let i = 0; i < adim; i++) sim.tick();
  yerlesimYaz(dugumler);
  return { dugumler, baglar, komsu };
}

export default function AriaAgi({
  ag,
  hal,
  bekleyen,
  kumanda,
  onSec,
  cekmece = false,
  gorunur = true,
}: {
  ag: HafizaAgi | null;
  hal: HalkaHali;
  /** Onay bekleyen onerilerin proje adlari: o projelerin notu amber halkali (seni bekliyor). */
  bekleyen: string[];
  kumanda: RefObject<AgKumanda | null>;
  onSec: (yol: string) => void;
  /** Sagda hafiza cekmecesi acik: lejant onun altinda kalmasin. */
  cekmece?: boolean;
  /** Aria sayfasi gorunur mu: gizliyken (baska sayfa) kare dongusu hic calismaz. */
  gorunur?: boolean;
}) {
  const kap = useRef<HTMLDivElement>(null);
  const tuval = useRef<HTMLCanvasElement>(null);
  const [boyut, setBoyut] = useState({ w: 0, h: 0 });
  const [uzerinde, setUzerinde] = useState<Dugum | null>(null);
  const [sorgu, setSorgu] = useState('');
  const [akis, setAkis] = useState<{ t: number; tur: AtesTuru; etiket: string }[]>([]);
  const [gecmis, setGecmis] = useState<string[]>([]); // son ateslerin izi (test ve teshis: tur:id|id)

  const veri = useMemo(() => (ag ? yerlestir(ag) : null), [ag]);
  const gorus = useRef({ k: 1, x: 0, y: 0, oturdu: false });
  // Kullanici kaydirdi/yakinlastirdiysa yeniden boyutlanmada gorus korunur; yoksa ag yeniden sigdirilir.
  const elle = useRef(false);
  const gorunurRef = useRef(gorunur);
  gorunurRef.current = gorunur;
  const enerji = useRef(new Map<number, { e: number; tur: AtesTuru }>());
  const sinyaller = useRef<Sinyal[]>([]);
  const sonAtesler = useRef<number[]>([]);
  const halRef = useRef(hal);
  halRef.current = hal;
  const uzerindeRef = useRef<Dugum | null>(null);
  uzerindeRef.current = uzerinde;
  const sorguRef = useRef('');
  sorguRef.current = anahtar(sorgu.trim());
  const bekleyenIdler = useMemo(() => {
    if (!veri) return new Set<number>();
    const adlar = new Set(bekleyen.map(anahtar));
    return new Set(veri.dugumler.filter((d) => d.grup === 'proje' && adlar.has(anahtar(d.id.split('/').pop() ?? ''))).map((d) => d.i));
  }, [veri, bekleyen]);
  const bekleyenRef = useRef(bekleyenIdler);
  bekleyenRef.current = bekleyenIdler;
  // Hareket azaltma tercihi calisirken degisebilir (Windows ayari): izlenir.
  const [azalt, setAzalt] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const d = () => setAzalt(mq.matches);
    mq.addEventListener('change', d);
    return () => mq.removeEventListener('change', d);
  }, []);
  // Ekran olcegi degisince (baska monitor, sistem olcegi) tuval yeni piksel yogunluguyla yeniden kurulur; yoksa bulaniklasir.
  const [dpr, setDpr] = useState(() => window.devicePixelRatio || 1);
  useEffect(() => {
    const mq = window.matchMedia('(resolution: ' + dpr + 'dppx)');
    const d = () => setDpr(window.devicePixelRatio || 1);
    mq.addEventListener('change', d);
    return () => mq.removeEventListener('change', d);
  }, [dpr]);
  // Ag tazelenince (Aria not yazdi) dugum indeksleri kayar: yanan notlar kimlikle yeni indekse tasinir, yoldaki
  // sinyaller atilir. Yoksa yanlis not yanar; ag kuculdiyse cizim tanimsiz dugume erisip donuyordu.
  const oncekiVeri = useRef<typeof veri>(null);
  useEffect(() => {
    const eski = oncekiVeri.current;
    oncekiVeri.current = veri;
    if (!eski || !veri || eski === veri) return;
    const yeniSira = new Map(veri.dugumler.map((d) => [d.id, d.i]));
    const tasi = (i: number) => yeniSira.get(eski.dugumler[i]?.id ?? '');
    const yeniEnerji = new Map<number, { e: number; tur: AtesTuru }>();
    for (const [i, v] of enerji.current) {
      const j = tasi(i);
      if (j !== undefined) yeniEnerji.set(j, v);
    }
    enerji.current = yeniEnerji;
    sonAtesler.current = sonAtesler.current.map(tasi).filter((j): j is number => j !== undefined);
    sinyaller.current = [];
    setUzerinde(null);
  }, [veri]);
  const dongu = useRef({ kare: 0, calisiyor: false, sonT: 0, sonKivilcim: 0 });
  // Cizim hazir degilken (ag yuklenmeden) gelen kare bayragi indirir; yoksa sonraki istekler yutulur.
  const cizRef = useRef<(t: number) => void>(() => {
    dongu.current.calisiyor = false;
    kap.current?.setAttribute('data-ag-dongu', '0');
  });

  // Boyut: kap degisince tuval yeniden olceklenir.
  useEffect(() => {
    const el = kap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBoyut({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const sigdir = useCallback(() => {
    if (!veri || !boyut.w) return;
    // Agin govdesine sigdir (%2-%98 dilim): bagi az birkac uzak not butun agi kuculturdu.
    const xs = veri.dugumler.map((d) => d.x ?? 0).sort((a, b) => a - b);
    const ys = veri.dugumler.map((d) => d.y ?? 0).sort((a, b) => a - b);
    const q = (l: number[], p: number) => l[Math.min(l.length - 1, Math.max(0, Math.round((l.length - 1) * p)))];
    const [x0, x1, y0, y1] = [q(xs, 0.02), q(xs, 0.98), q(ys, 0.02), q(ys, 0.98)];
    const k = Math.max(0.25, Math.min(2.5, Math.min(boyut.w / (x1 - x0 + 120), (boyut.h - 70) / (y1 - y0 + 120))));
    gorus.current = { k, x: boyut.w / 2 - ((x0 + x1) / 2) * k, y: boyut.h / 2 + 8 - ((y0 + y1) / 2) * k, oturdu: true };
  }, [veri, boyut]);

  useEffect(() => {
    if (!gorus.current.oturdu || !elle.current) sigdir();
  }, [sigdir]);

  const hareketVar = () => {
    if (azalt || !gorunurRef.current) return false;
    if (sinyaller.current.length) return true;
    const h = halRef.current;
    if (h === 'dusunuyor' || h === 'arac' || h === 'yaziyor' || h === 'aciliyor') return true;
    for (const v of enerji.current.values()) if (v.e > 0.02) return true;
    return false;
  };

  const iste = useCallback(() => {
    const d = dongu.current;
    if (d.calisiyor || !gorunurRef.current) return;
    d.calisiyor = true;
    kap.current?.setAttribute('data-ag-dongu', '1'); // test: hareket butcesi (bostayken dongu durur)
    d.kare = requestAnimationFrame((t) => cizRef.current(t));
  }, []);

  // En kisa yol (BFS) Aria'dan hedefe; bag yoksa dogrudan.
  const yolBul = useCallback(
    (hedef: number): number[] => {
      if (!veri) return [];
      const kaynak = veri.dugumler.findIndex((d) => d.id === 'aria');
      if (kaynak < 0 || kaynak === hedef) return [hedef];
      const once = new Int32Array(veri.dugumler.length).fill(-2);
      once[kaynak] = -1;
      const kuyruk = [kaynak];
      for (let q = 0; q < kuyruk.length; q++) {
        const u = kuyruk[q];
        if (u === hedef) break;
        for (const v of veri.komsu[u])
          if (once[v] === -2) {
            once[v] = u;
            kuyruk.push(v);
          }
      }
      if (once[hedef] === -2) return [kaynak, hedef];
      const yol = [];
      for (let v = hedef; v !== -1; v = once[v]) yol.push(v);
      return yol.reverse();
    },
    [veri]
  );

  const yak = useCallback(
    (i: number, tur: AtesTuru, guc = 1) => {
      if (!veri) return;
      const m = enerji.current;
      const once = m.get(i);
      m.set(i, { e: Math.max(once?.e ?? 0, guc), tur: once && once.e > guc ? once.tur : tur });
      // Yayilan aktivasyon: komsular soluk, ikinci halka daha soluk.
      if (tur !== 'cagrisim')
        for (const j of veri.komsu[i]) {
          const k = m.get(j);
          if ((k?.e ?? 0) < guc * 0.35) m.set(j, { e: guc * 0.35, tur: 'okuma' });
        }
      sonAtesler.current = [i, ...sonAtesler.current.filter((x) => x !== i)].slice(0, 16);
    },
    [veri]
  );

  // Disaridan ates: Aria'nin araclari, cagrisim, yazma.
  useEffect(() => {
    kumanda.current = {
      ates: (idler, tur, etiket) => {
        setAkis((l) => [{ t: Date.now(), tur, etiket }, ...l].slice(0, 4));
        if (!veri) return;
        const indisler = idler.map((id) => veri.dugumler.findIndex((d) => d.id === id)).filter((i) => i >= 0);
        setGecmis((l) => [tur + ':' + idler.join('|'), ...l].slice(0, 8));
        const simdi = performance.now();
        if (!indisler.length) {
          const a = veri.dugumler.findIndex((d) => d.id === 'aria');
          if (a >= 0) yak(a, tur, 0.8);
        }
        for (const [n, i] of indisler.entries()) {
          if (azalt || tur === 'cagrisim') {
            yak(i, tur, tur === 'cagrisim' ? 0.55 : 1);
            continue;
          }
          sinyaller.current.push({ yol: yolBul(i), t0: simdi + n * 70, adim: 110, guc: 1, varis: tur });
        }
        iste();
      },
    };
    return () => {
      kumanda.current = null;
    };
  }, [kumanda, veri, yak, yolBul, iste, azalt]);

  // Hal degisince (dusunmeye basladi / bitti) dongu uyanir.
  useEffect(() => {
    iste();
  }, [hal, iste, uzerinde, sorgu, boyut, veri, bekleyenIdler, gorunur]);

  useEffect(() => {
    const c = tuval.current;
    if (!c || !veri || !boyut.w) return;
    c.width = Math.round(boyut.w * dpr);
    c.height = Math.round(boyut.h * dpr);
    const g = c.getContext('2d');
    if (!g) return;
    const yazi = getComputedStyle(document.body).fontFamily;
    const { dugumler, baglar, komsu } = veri;
    const tazeSinir = Date.now() - 48 * 3600 * 1000;

    cizRef.current = (simdi: number) => {
      const d = dongu.current;
      const dt = d.sonT ? Math.min(100, simdi - d.sonT) : 16;
      d.sonT = simdi;
      const h = halRef.current;
      const mesgul = h === 'dusunuyor' || h === 'arac' || h === 'yaziyor' || h === 'aciliyor';
      // Enerji soner (yari omur ~1 sn); hareket azaltmada isaret 4 sn duragan kalir, sonra silinir.
      if (!azalt) {
        const sonum = Math.exp(-dt / 1400);
        for (const [i, v] of enerji.current) {
          v.e *= sonum;
          if (v.e < 0.015) enerji.current.delete(i);
        }
      }
      // Ortam kivilcimi: Aria calisirken son ates alan notlar arasinda (yazarken notlardan Aria'ya dogru).
      if (mesgul && !azalt && simdi - d.sonKivilcim > 170) {
        d.sonKivilcim = simdi;
        const kaynaklar = sonAtesler.current.length ? sonAtesler.current : dugumler.filter((n) => n.grup === 'kimlik').map((n) => n.i);
        const u = kaynaklar[Math.floor(Math.random() * kaynaklar.length)];
        if (u !== undefined) {
          if (h === 'yaziyor') {
            const y = yolBul(u);
            if (y.length > 1) sinyaller.current.push({ yol: y.reverse(), t0: simdi, adim: 90, guc: 0.45, varis: null });
          } else if (komsu[u].length) {
            const v = komsu[u][Math.floor(Math.random() * komsu[u].length)];
            sinyaller.current.push({ yol: [u, v], t0: simdi, adim: 260, guc: 0.4, varis: null });
          }
        }
      }

      const { k, x: ox, y: oy } = gorus.current;
      const sx = (n: Dugum) => (n.x ?? 0) * k + ox;
      const sy = (n: Dugum) => (n.y ?? 0) * k + oy;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, boyut.w, boyut.h);
      const ust = uzerindeRef.current;
      const s = sorguRef.current;
      const eslesir = s.length >= 2 ? (n: Dugum) => n.anahtar.includes(s) : null;
      const vurgu = new Set<number>();
      if (ust) {
        vurgu.add(ust.i);
        for (const j of komsu[ust.i]) vurgu.add(j);
      }
      const en = enerji.current;

      // Kenarlar: taban tek yol; vurgulu (uzerinde, ates alan) ayri, daha parlak.
      g.lineWidth = 0.6;
      g.strokeStyle = GUMUS;
      g.globalAlpha = eslesir ? 0.035 : 0.075;
      g.beginPath();
      for (const b of baglar) {
        const a = b.source as Dugum;
        const c2 = b.target as Dugum;
        g.moveTo(sx(a), sy(a));
        g.lineTo(sx(c2), sy(c2));
      }
      g.stroke();
      g.beginPath();
      g.lineWidth = 0.9;
      let vurguluVar = false;
      for (const b of baglar) {
        const a = b.source as Dugum;
        const c2 = b.target as Dugum;
        const ea = en.get(a.i)?.e ?? 0;
        const ec = en.get(c2.i)?.e ?? 0;
        const ustte = ust && (a.i === ust.i || c2.i === ust.i);
        if (ustte || (ea > 0.2 && ec > 0.2)) {
          g.moveTo(sx(a), sy(a));
          g.lineTo(sx(c2), sy(c2));
          vurguluVar = true;
        }
      }
      if (vurguluVar) {
        g.globalAlpha = 0.4;
        g.strokeStyle = ACIK;
        g.stroke();
      }

      // Sinyaller: yol boyunca ilerleyen isik + kisa iz.
      const kalan: Sinyal[] = [];
      for (const sg of sinyaller.current) {
        const gecen = simdi - sg.t0;
        if (gecen < 0) {
          kalan.push(sg);
          continue;
        }
        const seg = Math.floor(gecen / sg.adim);
        if (seg >= sg.yol.length - 1) {
          if (sg.varis) yak(sg.yol[sg.yol.length - 1], sg.varis, sg.guc);
          continue;
        }
        kalan.push(sg);
        const f = (gecen % sg.adim) / sg.adim;
        const a = dugumler[sg.yol[seg]];
        const b = dugumler[sg.yol[seg + 1]];
        if (!a || !b) continue;
        const px = sx(a) + (sx(b) - sx(a)) * f;
        const py = sy(a) + (sy(b) - sy(a)) * f;
        const iz = g.createLinearGradient(sx(a), sy(a), px, py);
        iz.addColorStop(0, 'rgba(230,234,240,0)');
        iz.addColorStop(1, `rgba(230,234,240,${0.75 * sg.guc})`);
        g.globalAlpha = 1;
        g.strokeStyle = iz;
        g.lineWidth = 1.4;
        g.beginPath();
        g.moveTo(sx(a), sy(a));
        g.lineTo(px, py);
        g.stroke();
        const p = g.createRadialGradient(px, py, 0, px, py, 7);
        p.addColorStop(0, `rgba(255,255,255,${0.95 * sg.guc})`);
        p.addColorStop(1, 'rgba(230,234,240,0)');
        g.fillStyle = p;
        g.beginPath();
        g.arc(px, py, 7, 0, Math.PI * 2);
        g.fill();
      }
      sinyaller.current = kalan;

      // Dugumler.
      const olcek = Math.max(0.7, Math.min(1.6, k));
      for (const n of dugumler) {
        const x = sx(n);
        const y = sy(n);
        if (x < -30 || y < -30 || x > boyut.w + 30 || y > boyut.h + 30) continue;
        const r = n.r * olcek;
        const e = en.get(n.i);
        const enj = e?.e ?? 0;
        const sonuk = eslesir ? !eslesir(n) : false;
        let alfa = n.grup === 'kavram' ? 0.5 : n.grup === 'arsiv' ? 0.28 : n.grup === 'gunluk' ? 0.5 : 0.88;
        if (n.t > tazeSinir) alfa = Math.min(1, alfa + 0.25);
        if (vurgu.size && !vurgu.has(n.i)) alfa *= 0.45;
        if (sonuk) alfa *= 0.22;
        alfa = Math.max(alfa, enj);
        // Ates parlamasi.
        if (enj > 0.05) {
          const pr = r + 4 + 14 * enj;
          const p = g.createRadialGradient(x, y, r * 0.5, x, y, pr);
          p.addColorStop(0, `rgba(255,255,255,${(e!.tur === 'cagrisim' ? 0.28 : 0.55) * enj})`);
          p.addColorStop(1, 'rgba(230,234,240,0)');
          g.globalAlpha = 1;
          g.fillStyle = p;
          g.beginPath();
          g.arc(x, y, pr, 0, Math.PI * 2);
          g.fill();
          if (e!.tur === 'yazma') {
            g.strokeStyle = ACIK;
            g.globalAlpha = enj * 0.8;
            g.lineWidth = 1.2;
            g.beginPath();
            g.arc(x, y, r + 3 + (1 - enj) * 22, 0, Math.PI * 2);
            g.stroke();
          }
        }
        g.globalAlpha = alfa;
        if (n.grup === 'aria') {
          // Aria: kucuk sinyal halkasi; calisirken orta halkada donen isik.
          const cek = g.createRadialGradient(x - r * 0.35, y - r * 0.45, r * 0.1, x, y, r);
          cek.addColorStop(0, ACIK);
          cek.addColorStop(0.55, GUMUS);
          cek.addColorStop(1, SOLUK);
          g.globalAlpha = 1;
          g.fillStyle = cek;
          g.beginPath();
          g.arc(x, y, r, 0, Math.PI * 2);
          g.fill();
          g.strokeStyle = GUMUS;
          g.globalAlpha = 0.45;
          g.lineWidth = 1;
          g.beginPath();
          g.arc(x, y, r + 5, 0, Math.PI * 2);
          g.stroke();
          if (mesgul && !azalt) {
            const yay = g.createConicGradient(simdi / 400, x, y);
            yay.addColorStop(0, 'rgba(230,234,240,0.95)');
            yay.addColorStop(0.2, 'rgba(230,234,240,0)');
            yay.addColorStop(1, 'rgba(230,234,240,0)');
            g.strokeStyle = yay;
            g.globalAlpha = 1;
            g.lineWidth = 1.8;
            g.beginPath();
            g.arc(x, y, r + 5, 0, Math.PI * 2);
            g.stroke();
          }
          continue;
        }
        g.fillStyle = enj > 0.3 ? ACIK : GUMUS;
        g.strokeStyle = enj > 0.3 ? ACIK : GUMUS;
        g.lineWidth = 1;
        g.beginPath();
        if (n.grup === 'gunluk' || n.grup === 'kokpit') {
          // Gunler ve Kokpit icidolu degil: bicim farki (anlam yalniz renkle tasinmaz).
          g.arc(x, y, r, 0, Math.PI * 2);
          g.stroke();
          if (n.grup === 'kokpit') {
            g.beginPath();
            g.arc(x, y, r * 0.4, 0, Math.PI * 2);
            g.fill();
          }
        } else {
          g.arc(x, y, r, 0, Math.PI * 2);
          g.fill();
          if (n.grup === 'kimlik' || n.grup === 'proje') {
            g.globalAlpha = alfa * 0.5;
            g.beginPath();
            g.arc(x, y, r + 2.5, 0, Math.PI * 2);
            g.stroke();
          }
        }
        if (bekleyenRef.current.has(n.i)) {
          // Seni bekliyor: amber + kesik cizgi (anlam yalniz renkle tasinmaz, DESIGN.md).
          g.globalAlpha = 1;
          g.strokeStyle = DIKKAT;
          g.lineWidth = 1.6;
          g.setLineDash([3, 2.5]);
          g.beginPath();
          g.arc(x, y, r + 4.5, 0, Math.PI * 2);
          g.stroke();
          g.setLineDash([]);
        }
      }

      // Etiketler: hafiza ve projeler hep; digerleri uzerindeyken, ates alirken, aramada ya da yakinlasinca. Oncelik
      // sirasiyla yerlesir, cakisan atlanir (sikisik kumede ust uste binen yazi okunmuyordu).
      g.font = `11px ${yazi}`;
      g.textBaseline = 'middle';
      g.lineJoin = 'round';
      const adaylar: { n: Dugum; p: number; enj: number }[] = [];
      for (const n of dugumler) {
        const enj = en.get(n.i)?.e ?? 0;
        const sabit = n.grup === 'kimlik' || n.grup === 'proje' || n.grup === 'aria' || n.grup === 'kokpit';
        const ustteki = !!ust && n.i === ust.i;
        const esl = !!eslesir && eslesir(n);
        const goster = (sabit && k >= 0.45) || enj > 0.3 || ustteki || esl || (k >= 2.2 && n.derece >= 6);
        if (!goster) continue;
        if (eslesir && !esl && !sabit) continue;
        const p = ustteki ? 0 : enj > 0.3 ? 1 + (1 - enj) : esl ? 3 : n.grup === 'aria' ? 4 : n.grup === 'kimlik' ? 5 : n.grup === 'proje' ? 6 : 7 + 1 / (1 + n.derece);
        adaylar.push({ n, p, enj });
      }
      adaylar.sort((a, b) => a.p - b.p);
      const yerlesen: [number, number, number, number][] = [];
      for (const { n, enj } of adaylar) {
        const x = sx(n) + n.r * olcek + 5;
        const y = sy(n);
        const ad = n.baslik.length > 34 ? n.baslik.slice(0, 33) + '…' : n.baslik;
        const w = g.measureText(ad).width;
        const kutu: [number, number, number, number] = [x - 2, y - 7, x + w + 2, y + 7];
        if (yerlesen.some((b) => kutu[0] < b[2] && kutu[2] > b[0] && kutu[1] < b[3] && kutu[3] > b[1])) continue;
        yerlesen.push(kutu);
        g.globalAlpha = 1;
        g.strokeStyle = ZEMIN;
        g.lineWidth = 3;
        g.strokeText(ad, x, y);
        g.fillStyle = enj > 0.3 || (ust && n.i === ust.i) ? METIN : SOLUK;
        g.globalAlpha = eslesir && !eslesir(n) ? 0.4 : 1;
        g.fillText(ad, x, y);
      }
      g.globalAlpha = 1;

      if (hareketVar() && document.hasFocus()) d.kare = requestAnimationFrame((t) => cizRef.current(t));
      else {
        d.calisiyor = false;
        kap.current?.setAttribute('data-ag-dongu', '0');
        d.sonT = 0;
      }
    };
    iste();
    // Pencere odak kazaninca dongu (gerekiyorsa) yeniden baslar; hareket azaltmada yanan notlar 4 sn sonra silinir.
    const odak = () => iste();
    window.addEventListener('focus', odak);
    let temizle = 0;
    if (azalt) {
      temizle = window.setInterval(() => {
        if (enerji.current.size) {
          enerji.current.clear();
          iste();
        }
      }, 4000);
    }
    return () => {
      window.removeEventListener('focus', odak);
      cancelAnimationFrame(dongu.current.kare);
      dongu.current.calisiyor = false;
      if (temizle) clearInterval(temizle);
    };
  }, [veri, boyut, yak, yolBul, iste, azalt, dpr]);

  // Fare: surukle = kaydir, tekerlek = yakinlas (imlecin etrafinda), uzerinde = komsular vurgulu, tik = notu ac.
  const surukle = useRef<{ x: number; y: number; gx: number; gy: number; oynadi: boolean } | null>(null);
  const dugumBul = (cx: number, cy: number): Dugum | null => {
    if (!veri) return null;
    const { k, x, y } = gorus.current;
    const wx = (cx - x) / k;
    const wy = (cy - y) / k;
    let en: Dugum | null = null;
    let enUzak = Infinity;
    for (const n of veri.dugumler) {
      const dx = (n.x ?? 0) - wx;
      const dy = (n.y ?? 0) - wy;
      const u = dx * dx + dy * dy;
      const esik = Math.max(n.r + 3, 7 / k);
      if (u < esik * esik && u < enUzak) {
        en = n;
        enUzak = u;
      }
    }
    return en;
  };

  const sayilar = veri ? { not: veri.dugumler.length - 2, bag: veri.baglar.length } : null;
  const eslesen = useMemo(() => {
    const s = anahtar(sorgu.trim());
    if (!veri || s.length < 2) return [];
    return veri.dugumler.filter((d) => d.yol && d.anahtar.includes(s));
  }, [veri, sorgu]);

  return (
    <div ref={kap} className="relative size-full overflow-hidden" data-aria-ag data-dugum={sayilar?.not ?? 0} data-kenar={sayilar?.bag ?? 0} data-ag-gecmis={gecmis.join(' || ')}>
      <canvas
        ref={tuval}
        role="img"
        aria-label={sayilar ? `Aria'nın hafıza ağı: ${sayilar.not} not, ${sayilar.bag} bağ` : 'Hafıza ağı yükleniyor'}
        style={{ width: boyut.w, height: boyut.h }}
        className={'block ' + (uzerinde ? 'cursor-pointer' : 'cursor-grab active:cursor-grabbing')}
        onPointerDown={(e) => {
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          surukle.current = { x: e.clientX, y: e.clientY, gx: gorus.current.x, gy: gorus.current.y, oynadi: false };
        }}
        onPointerMove={(e) => {
          const r = (e.target as HTMLElement).getBoundingClientRect();
          const s = surukle.current;
          if (s) {
            const dx = e.clientX - s.x;
            const dy = e.clientY - s.y;
            if (Math.abs(dx) + Math.abs(dy) > 3 && !s.oynadi) {
              s.oynadi = true;
              elle.current = true;
              setUzerinde(null);
            }
            if (s.oynadi) {
              gorus.current = { ...gorus.current, x: s.gx + dx, y: s.gy + dy };
              iste();
              return;
            }
          }
          const n = dugumBul(e.clientX - r.left, e.clientY - r.top);
          if (n !== uzerindeRef.current) setUzerinde(n);
        }}
        onPointerUp={(e) => {
          const s = surukle.current;
          surukle.current = null;
          if (s && !s.oynadi) {
            const r = (e.target as HTMLElement).getBoundingClientRect();
            const n = dugumBul(e.clientX - r.left, e.clientY - r.top);
            if (n?.yol) onSec(n.yol);
          }
        }}
        onPointerLeave={() => setUzerinde(null)}
        onWheel={(e) => {
          const r = (e.target as HTMLElement).getBoundingClientRect();
          const cx = e.clientX - r.left;
          const cy = e.clientY - r.top;
          const { k, x, y } = gorus.current;
          const yeniK = Math.max(0.25, Math.min(5, k * Math.exp(-e.deltaY * 0.0015)));
          gorus.current = { k: yeniK, x: cx - ((cx - x) / k) * yeniK, y: cy - ((cy - y) / k) * yeniK, oturdu: true };
          elle.current = true;
          // Ipucu eski konumda kalmasin: yakinlasinca gizlenir, fare oynayinca yeniden bulunur.
          if (uzerindeRef.current) setUzerinde(null);
          iste();
        }}
      />

      <div className="pointer-events-none absolute left-3 top-2.5 flex items-baseline gap-2">
        <span className="etiket">Hafıza ağı</span>
        {sayilar && (
          <span className="enstruman text-[0.6875rem] text-metin-soluk tabular-nums">
            {sayilar.not} not · {sayilar.bag.toLocaleString('tr-TR')} bağ
          </span>
        )}
      </div>

      <div className="absolute right-2.5 top-2 flex items-center gap-1">
        <label className="relative flex items-center">
          <Search className="pointer-events-none absolute left-2 size-3.5 text-metin-soluk" aria-hidden="true" />
          <input
            type="search"
            value={sorgu}
            onChange={(e) => setSorgu(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && eslesen[0]?.yol) onSec(eslesen[0].yol);
              if (e.key === 'Escape') setSorgu('');
            }}
            placeholder="Ağda bul"
            aria-label="Ağda not bul (Enter ilk eşleşmeyi açar)"
            data-ag-ara
            className="w-40 rounded-kontrol border border-kenar bg-terminal/70 py-1 pl-7 pr-2 text-xs text-metin placeholder:text-metin-soluk"
          />
        </label>
        {sorgu.trim().length >= 2 && <span className="enstruman px-1 text-[0.6875rem] text-metin-soluk tabular-nums" aria-live="polite">{eslesen.length}</span>}
        <button
          type="button"
          onClick={() => {
            elle.current = false;
            sigdir();
            iste();
          }}
          title="Bütün ağı göster"
          className="cursor-pointer rounded-kontrol p-1.5 text-metin-soluk hover:bg-yuzey hover:text-metin"
        >
          <Locate className="size-4" aria-hidden="true" />
          <span className="sr-only">Bütün ağı göster</span>
        </button>
      </div>

      {/* Klavyeyle erisim: tuvaldeki notlar fareye bagliydi. Aramanin ilk eslesmeleri dugme listesi (Tab ile gezilir). */}
      {sorgu.trim().length >= 2 && eslesen.length > 0 && !cekmece && (
        <ul aria-label="Ağdaki eşleşmeler" data-ag-eslesmeler className="absolute right-2.5 top-11 z-10 w-64 overflow-hidden rounded-kontrol border border-kenar bg-yuzey-guclu py-1 text-xs">
          {eslesen.slice(0, 8).map((d) => (
            <li key={d.id}>
              <button type="button" onClick={() => d.yol && onSec(d.yol)} className="flex w-full cursor-pointer items-baseline gap-2 px-2.5 py-1 text-left hover:bg-yuzey focus-visible:bg-yuzey">
                <span className="min-w-0 flex-1 truncate text-metin-ikincil">{d.baslik}</span>
                <span className="shrink-0 text-[0.6875rem] text-metin-soluk">{GRUP_ADI[d.grup]}</span>
              </button>
            </li>
          ))}
          {eslesen.length > 8 && <li className="px-2.5 py-1 text-[0.6875rem] text-metin-soluk">+{eslesen.length - 8} daha; aramayı daralt</li>}
        </ul>
      )}

      {uzerinde && (
        <div
          className="pointer-events-none absolute z-10 max-w-72 rounded-kontrol border border-kenar bg-yuzey-guclu px-2.5 py-1.5 text-xs"
          style={{
            left: Math.min(boyut.w - 290, (uzerinde.x ?? 0) * gorus.current.k + gorus.current.x + 14),
            top: Math.max(4, (uzerinde.y ?? 0) * gorus.current.k + gorus.current.y - 14),
          }}
          data-ag-ipucu
        >
          <p className="text-metin">{uzerinde.baslik}</p>
          <p className="enstruman mt-0.5 text-[0.6875rem] text-metin-soluk">
            {GRUP_ADI[uzerinde.grup]} · {uzerinde.derece} bağ{uzerinde.t ? ' · ' + new Date(uzerinde.t).toLocaleDateString('tr-TR') : ''}
          </p>
          {bekleyenIdler.has(uzerinde.i) && <p className="mt-0.5 text-[0.6875rem] text-dikkat-metin">Bu projede onay bekleyen bir öneri var</p>}
          {uzerinde.yol && <p className="mt-0.5 text-[0.6875rem] text-metin-soluk">Tıkla: notu aç</p>}
        </div>
      )}

      <div className="pointer-events-none absolute bottom-2.5 left-3 flex flex-col gap-0.5" aria-hidden="true">
        {akis.map((a) => (
          <p key={a.t + a.etiket} className="enstruman truncate text-[0.6875rem] text-metin-soluk" style={{ maxWidth: Math.max(160, boyut.w - 260) }}>
            {a.tur === 'cagrisim' ? 'çağrışım · ' : ''}
            {a.etiket}
          </p>
        ))}
      </div>

      {!cekmece && <Lejant />}
    </div>
  );
}

/** Bicim lejanti: renk degil bicim (DESIGN.md: anlam yalniz renkle tasinmaz). */
function Lejant() {
  const ogeler: [string, ReactNode][] = [
    ['hafıza', <><circle cx="7" cy="7" r="3.5" fill={GUMUS} /><circle cx="7" cy="7" r="5.5" fill="none" stroke={GUMUS} strokeOpacity="0.5" /></>],
    ['kavram', <circle cx="7" cy="7" r="2.2" fill={GUMUS} fillOpacity="0.6" />],
    ['gün', <circle cx="7" cy="7" r="2.6" fill="none" stroke={GUMUS} />],
    ['bekliyor', <circle cx="7" cy="7" r="4.5" fill="none" stroke={DIKKAT} strokeWidth="1.4" strokeDasharray="2.5 2" />],
  ];
  return (
    <div className="pointer-events-none absolute bottom-2.5 right-3 flex items-center gap-3 text-[0.6875rem] text-metin-soluk">
      {ogeler.map(([ad, sekil]) => (
        <span key={ad} className="flex items-center gap-1">
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
            {sekil}
          </svg>
          {ad}
        </span>
      ))}
    </div>
  );
}
