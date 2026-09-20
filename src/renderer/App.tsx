import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  History,
  LayoutDashboard,
  PanelLeft,
  Plus,
  RefreshCw,
  SplitSquareHorizontal,
  TerminalSquare,
  X,
} from 'lucide-react';
import type { Durum, OncekiOturum, Oturum, OturumDurumu, Proje, SonOturum } from './types';
import Pano from './Pano';
import ProjeSecici from './ProjeSecici';
import TerminalOturumu, { type OturumApi } from './TerminalOturumu';
import { ASAMA_SIRA, sureMetni } from './parcalar';

// durum.py her cagrida ~500 ms'lik bir Python sureci demek. Iki koruma:
// - ayni anda tek istek (StrictMode'un cift effect'ini de yutar)
// - odak olayi bu araliktan sik tazeleyemez (alt-tab firtinasi)
const ODAK_ASGARI_ARALIK_MS = 30_000;
const ASGARI_ORAN = 0.15;
const YAZI_BOYUTU = { enAz: 9, enCok: 28, varsayilan: 13 };

/** Oturum noktasinin rengi: dikkat > acik > baglaniyor > hata > bitti. */
function noktaSinifi(o: Pick<Oturum, 'durumu' | 'dikkat'>) {
  if (o.dikkat) return 'bg-dikkat ring-2 ring-dikkat/30';
  if (o.durumu === 'acik') return 'bg-aksan';
  if (o.durumu === 'baglaniyor') return 'animate-pulse bg-dikkat';
  if (o.durumu === 'hata') return 'bg-hata';
  return 'bg-metin-soluk';
}

type Gorunum = 'pano' | 'terminal';

/** Onceki calismadan kalan oturumlar icin tek satirlik teklif. Bir kez gorunur. */
function GeriYuklemeSeridi({
  oncekiler,
  onYukle,
  onYoksay,
}: {
  oncekiler: OncekiOturum[];
  onYukle: () => void;
  onYoksay: () => void;
}) {
  return (
    <div
      role="status"
      className="halka relative mb-5 flex flex-wrap items-center gap-3 rounded-base border border-aksan/30 bg-aksan/10 px-4 py-3"
    >
      <History className="size-4 shrink-0 text-aksan-metin" aria-hidden="true" />
      <p className="min-w-0 flex-1 text-sm text-metin">
        Önceki çalışmada {oncekiler.length} oturum açıktı:{' '}
        <span className="enstruman text-metin-ikincil">{oncekiler.map((o) => o.ad).join(', ')}</span>
        <span className="block text-xs text-metin-soluk">
          Geri yüklemek her klasörde <span className="enstruman">claude --continue</span> ile son
          konuşmayı sürdürür.
        </span>
      </p>
      <button
        type="button"
        onClick={onYukle}
        className="cursor-pointer rounded-kontrol bg-birincil px-3 py-1.5 text-xs font-medium text-birincil-uzeri transition-colors duration-[180ms] hover:bg-metin-ikincil"
      >
        Geri yükle
      </button>
      <button
        type="button"
        onClick={onYoksay}
        className="cursor-pointer rounded-kontrol border border-kenar px-3 py-1.5 text-xs text-metin-ikincil transition-colors duration-[180ms] hover:border-kenar-guclu hover:text-metin"
      >
        Yoksay
      </button>
    </div>
  );
}

export default function App() {
  const [durum, setDurum] = useState<Durum | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [gorunum, setGorunum] = useState<Gorunum>('pano');
  const [kenarAcik, setKenarAcik] = useState(true);
  const [yaziBoyutu, setYaziBoyutu] = useState(YAZI_BOYUTU.varsayilan);
  // Ayarlar diskten gelene kadar yazma; yoksa varsayilan degerler ustune yazilir.
  const ayarHazir = useRef(false);

  // Oturumlar BURADA yasar. Gorunum degisince unmount olmazlar, yoksa Pano'ya her
  // bakista WS kapanir ve calisan claude oturumu olur.
  const [oturumlar, setOturumlar] = useState<Oturum[]>([]);
  const [aktifGrupId, setAktifGrupId] = useState<string | null>(null);
  const [aktifOturumId, setAktifOturumId] = useState<string | null>(null);
  const [simdi, setSimdi] = useState(() => Date.now());
  // Onceki calismada acik kalmis oturumlar: geri yukleme teklifi (bir kez).
  const [oncekiler, setOncekiler] = useState<OncekiOturum[]>([]);
  const [sonOturumlar, setSonOturumlar] = useState<Record<string, SonOturum>>({});

  const ucusta = useRef(false);
  const sonOkuma = useRef(0);
  // Her terminalin App'e actigi dar yuzey (kapatma onayi icin cocuk surec sorgusu).
  const oturumApileri = useRef(new Map<string, OturumApi>());
  const onKayit = useCallback((id: string, api: OturumApi | null) => {
    if (api) oturumApileri.current.set(id, api);
    else oturumApileri.current.delete(id);
  }, []);

  // --- Ayarlar: kenar cubugu + yazi boyutu kalici (~/.kokpit/ayarlar.json, main yazar) ---
  useEffect(() => {
    let iptal = false;
    void window.kokpit.ayarGetir().then((a) => {
      if (iptal) return;
      setKenarAcik(a.kenarAcik);
      setYaziBoyutu(a.yaziBoyutu);
      ayarHazir.current = true;
    });
    return () => {
      iptal = true;
    };
  }, []);
  useEffect(() => {
    if (!ayarHazir.current) return;
    void window.kokpit.ayarKaydet({ kenarAcik, yaziBoyutu });
  }, [kenarAcik, yaziBoyutu]);

  const yaziBoyutuDegistir = useCallback((fark: number | null) => {
    setYaziBoyutu((b) =>
      fark === null
        ? YAZI_BOYUTU.varsayilan
        : Math.min(YAZI_BOYUTU.enCok, Math.max(YAZI_BOYUTU.enAz, b + fark))
    );
  }, []);

  // Tek sayac: acik oturum varsa surelerin ilerlemesi icin saniyede bir tik.
  useEffect(() => {
    if (!oturumlar.some((o) => o.durumu === 'acik')) return;
    const t = setInterval(() => setSimdi(Date.now()), 1000);
    return () => clearInterval(t);
  }, [oturumlar]);

  const tazele = useCallback(async (sebep: 'acilis' | 'odak' | 'elle') => {
    if (ucusta.current) return;
    if (sebep === 'odak' && Date.now() - sonOkuma.current < ODAK_ASGARI_ARALIK_MS) return;

    ucusta.current = true;
    setYukleniyor(true);
    try {
      const sonuc = await window.kokpit.durumGetir();
      if (sonuc.veri) {
        setDurum(sonuc.veri);
        setHata(null);
      } else {
        setHata(sonuc.hata + (sonuc.stderr ? '\n' + sonuc.stderr : ''));
        setDurum(null);
      }
      sonOkuma.current = Date.now();
    } finally {
      ucusta.current = false;
      setYukleniyor(false);
    }
  }, []);

  // Tazeleme karari (A-04): acilista + pencere odaga gelince + elle. Dosya izleyici YOK.
  useEffect(() => {
    void tazele('acilis');
    const odak = () => void tazele('odak');
    window.addEventListener('focus', odak);
    return () => window.removeEventListener('focus', odak);
  }, [tazele]);

  const yeniId = (p: Pick<Proje, 'ad'>) =>
    p.ad + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);

  // --- Oturum defteri: acilis/kapanis main'e bildirilir, "son oturum" oradan okunur ---
  const sonlariYenile = useCallback(() => {
    void window.kokpit.defterSonlar().then(setSonOturumlar);
  }, []);
  useEffect(() => {
    sonlariYenile();
    void window.kokpit.defterOncekiler().then((liste) => {
      if (liste.length > 0) setOncekiler(liste);
    });
  }, [sonlariYenile]);
  // Ayni oturum icin iki 'kapandi' yazilmasin (kullanici kapatti + kabuk bitti).
  const defterKapananlar = useRef(new Set<string>());
  const defterKapandi = useCallback(
    (id: string, sebep: 'kullanici' | 'kabuk', kod?: number | null) => {
      if (defterKapananlar.current.has(id)) return;
      defterKapananlar.current.add(id);
      window.kokpit.defterOlay({ olay: 'kapandi', id, kod: kod ?? null, sebep });
      sonlariYenile();
    },
    [sonlariYenile]
  );

  /** Yeni sekme: kendi grubunda tek bolme. `devam` geri yukleme (claude --continue). */
  const sekmeAc = useCallback((p: Pick<Proje, 'ad' | 'yol'>, devam = false) => {
    const id = yeniId(p);
    const grupId = 'g-' + id;
    window.kokpit.defterOlay({ olay: 'acildi', id, ad: p.ad, yol: p.yol });
    setOturumlar((o) => [
      ...o,
      {
        id,
        ad: p.ad,
        yol: p.yol,
        durumu: 'baglaniyor',
        baslangic: Date.now(),
        grupId,
        oran: 1,
        devam,
      },
    ]);
    setAktifGrupId(grupId);
    setAktifOturumId(id);
    // Kenar terminale gecerken otomatik daralir; alani terminale birakir (Ctrl+B geri acar).
    setGorunum('terminal');
    setKenarAcik(false);
  }, []);

  /** Bolme: aktif sekmenin icine yan yana ikinci (ucuncu...) terminal. */
  const bolmeAc = useCallback(
    (p: Proje) => {
      if (!aktifGrupId) {
        sekmeAc(p);
        return;
      }
      const id = yeniId(p);
      window.kokpit.defterOlay({ olay: 'acildi', id, ad: p.ad, yol: p.yol });
      setOturumlar((o) => {
        const grup = o.filter((x) => x.grupId === aktifGrupId);
        const yeniOran = 1 / (grup.length + 1);
        const olcek = 1 - yeniOran;
        return [
          ...o.map((x) => (x.grupId === aktifGrupId ? { ...x, oran: x.oran * olcek } : x)),
          {
            id,
            ad: p.ad,
            yol: p.yol,
            durumu: 'baglaniyor' as OturumDurumu,
            baslangic: Date.now(),
            grupId: aktifGrupId,
            oran: yeniOran,
          },
        ];
      });
      setAktifOturumId(id);
    },
    [aktifGrupId, sekmeAc]
  );

  /**
   * Verilen oturumlari kapatir ve odagi tutarli birakir.
   *
   * ONEMLI: hesap `setOturumlar` guncelleyicisinin ICINDE yapilmaz. Guncelleyici saf
   * olmali; React onu (StrictMode'da ve concurrent modda) birden fazla kez cagirabilir,
   * ve icine konan setState'ler yan etki olur. Once yeni durum burada hesaplanir,
   * sonra tum setter'lar bir kez cagrilir.
   */
  const kapat = useCallback(
    (idler: string[]) => {
      const kume = new Set(idler);
      const kapanan = oturumlar.filter((x) => kume.has(x.id));
      if (kapanan.length === 0) return;

      const kalan = oturumlar.filter((x) => !kume.has(x.id));
      const etkilenenGruplar = new Set(kapanan.map((x) => x.grupId));
      for (const x of kapanan) defterKapandi(x.id, 'kullanici');

      // Etkilenen gruplarda kalan bolmeler bosalan payi paylasir.
      const yeni = kalan.map((x) => {
        if (!etkilenenGruplar.has(x.grupId)) return x;
        const kardesler = kalan.filter((y) => y.grupId === x.grupId);
        const toplam = kardesler.reduce((t, y) => t + y.oran, 0) || 1;
        return { ...x, oran: x.oran / toplam };
      });

      setOturumlar(yeni);

      // Odak: once ayni grupta kalan bir bolme, yoksa son grup, o da yoksa Pano.
      const aktifSilindi = aktifOturumId !== null && kume.has(aktifOturumId);
      if (!aktifSilindi) return;

      const ayniGrupta = aktifGrupId ? yeni.filter((x) => x.grupId === aktifGrupId) : [];
      if (ayniGrupta.length > 0) {
        setAktifOturumId(ayniGrupta[ayniGrupta.length - 1].id);
        return;
      }
      const sonraki = yeni.length > 0 ? yeni[yeni.length - 1] : null;
      setAktifGrupId(sonraki ? sonraki.grupId : null);
      setAktifOturumId(sonraki ? sonraki.id : null);
      if (!sonraki) {
        setGorunum('pano');
        setKenarAcik(true);
      }
    },
    [oturumlar, aktifOturumId, aktifGrupId, defterKapandi]
  );

  const oturumDurumu = useCallback(
    (id: string, durumu: OturumDurumu, mesaj?: string) => {
      setOturumlar((o) => o.map((x) => (x.id === id ? { ...x, durumu, mesaj } : x)));
      if (durumu === 'bitti') {
        const kod = mesaj ? Number(/çıkış kodu (-?\d+)/.exec(mesaj)?.[1]) : NaN;
        defterKapandi(id, 'kabuk', Number.isInteger(kod) ? kod : null);
      }
    },
    [defterKapandi]
  );

  const geriYukle = useCallback(() => {
    const liste = oncekiler;
    setOncekiler([]);
    for (const o of liste) sekmeAc(o, true);
  }, [oncekiler, sekmeAc]);

  const grubaGit = useCallback((grupId: string, oturumId?: string) => {
    setAktifGrupId(grupId);
    if (oturumId) setAktifOturumId(oturumId);
    setGorunum('terminal');
    setKenarAcik(false);
  }, []);

  /**
   * Zil: claude bitti ya da soru soruyor. Kullanici o an o bolmeye bakiyorsa hicbir sey
   * yapilmaz; bakmiyorsa rozet, pencere odakta degilse Windows bildirimi.
   */
  const onZil = useCallback(
    (id: string) => {
      const o = oturumlar.find((x) => x.id === id);
      if (!o) return;
      const bakiyor =
        document.hasFocus() && gorunum === 'terminal' && aktifGrupId === o.grupId;
      if (bakiyor) return;
      setOturumlar((liste) => liste.map((x) => (x.id === id ? { ...x, dikkat: true } : x)));
      if (!document.hasFocus() && 'Notification' in window) {
        const goster = () => {
          const b = new Notification(o.ad, {
            body: 'Oturum dikkat bekliyor — claude bitti ya da soru soruyor.',
            tag: 'kokpit-' + id,
          });
          b.onclick = () => {
            void window.kokpit.pencereOdakla();
            grubaGit(o.grupId, o.id);
          };
        };
        if (Notification.permission === 'granted') goster();
        else if (Notification.permission !== 'denied') {
          void Notification.requestPermission().then((izin) => izin === 'granted' && goster());
        }
      }
    },
    [oturumlar, gorunum, aktifGrupId, grubaGit]
  );

  // Rozet, kullanici o bolmeye BAKINCA duser: aktif grup + terminal gorunumu + pencere odakta.
  useEffect(() => {
    const temizle = () => {
      if (!document.hasFocus() || gorunum !== 'terminal' || !aktifGrupId) return;
      setOturumlar((liste) =>
        liste.some((x) => x.dikkat && x.grupId === aktifGrupId)
          ? liste.map((x) => (x.grupId === aktifGrupId && x.dikkat ? { ...x, dikkat: false } : x))
          : liste
      );
    };
    temizle();
    window.addEventListener('focus', temizle);
    return () => window.removeEventListener('focus', temizle);
  }, [gorunum, aktifGrupId, oturumlar]);

  /**
   * Kapatma onayi. Kabugun altinda hala bir surec (claude) varsa sor: PTY oldurulunce
   * claude SIGHUP alir, SessionEnd hook'u calismaz ve oturum beyne dusmez.
   */
  const canliCocuklar = useCallback(
    async (idler: string[]) => {
      const sonuc: { ad: string; cocuklar: string[] }[] = [];
      await Promise.all(
        idler.map(async (id) => {
          const o = oturumlar.find((x) => x.id === id);
          const api = oturumApileri.current.get(id);
          if (!o || o.durumu !== 'acik' || !api) return;
          const cocuklar = await api.cocuklar();
          if (cocuklar.length > 0) sonuc.push({ ad: o.ad, cocuklar });
        })
      );
      return sonuc;
    },
    [oturumlar]
  );

  const kapatmaOnayi = useCallback(
    async (idler: string[]) => {
      const canli = await canliCocuklar(idler);
      if (canli.length === 0) return true;
      const adlar = canli.map((c) => c.ad + ' (' + c.cocuklar.join(', ') + ')').join(', ');
      return window.kokpit.onayla({
        baslik: 'Oturumu kapat',
        mesaj:
          canli.length === 1
            ? canli[0].ad + ' oturumunda hâlâ bir süreç çalışıyor.'
            : canli.length + ' oturumda hâlâ süreç çalışıyor.',
        ayrinti:
          'Çalışan: ' +
          adlar +
          '.\n\nKapatmak süreci keser; claude\'un SessionEnd hook\'u çalışmaz ve bu oturum ikinci beyne düşmez. Önce /exit ile çıkmak güvenli yol.',
        onayla: 'Yine de kapat',
      });
    },
    [canliCocuklar]
  );

  const oturumKapat = useCallback(
    (id: string) => {
      void kapatmaOnayi([id]).then((tamam) => tamam && kapat([id]));
    },
    [kapat, kapatmaOnayi]
  );

  /**
   * Sekmenin tamami. Tek tek `oturumKapat` cagirmak YANLIS olurdu: hepsi ayni tick'te
   * ayni `oturumlar` degerini gorur ve yalnizca sonuncusu uygulanirdi.
   */
  const grupKapat = useCallback(
    (grupId: string) => {
      const idler = oturumlar.filter((o) => o.grupId === grupId).map((o) => o.id);
      void kapatmaOnayi(idler).then((tamam) => tamam && kapat(idler));
    },
    [kapat, kapatmaOnayi, oturumlar]
  );

  // Uygulama kapatilirken de ayni koruma. Main 'kapanis:sor' gonderir, cevap 'kapanis:onay'.
  useEffect(() => {
    return window.kokpit.kapanisSorulunca(() => {
      const acik = oturumlar.filter((o) => o.durumu === 'acik').map((o) => o.id);
      void kapatmaOnayi(acik).then((tamam) => tamam && window.kokpit.kapanisOnayla());
    });
  }, [oturumlar, kapatmaOnayi]);

  // Gruplar olusturulma sirasini korur.
  const gruplar = useMemo(() => {
    const harita = new Map<string, Oturum[]>();
    for (const o of oturumlar) {
      const dizi = harita.get(o.grupId);
      if (dizi) dizi.push(o);
      else harita.set(o.grupId, [o]);
    }
    return [...harita.entries()].map(([id, uyeler]) => ({ id, uyeler }));
  }, [oturumlar]);

  const siraliProjeler = durum
    ? [...durum.projeler].sort((a, b) => {
        const ai = a.asama ? ASAMA_SIRA.indexOf(a.asama) : -1;
        const bi = b.asama ? ASAMA_SIRA.indexOf(b.asama) : -1;
        return bi - ai || (b.guncellendi ?? '').localeCompare(a.guncellendi ?? '');
      })
    : [];

  const aktifOturum = oturumlar.find((o) => o.id === aktifOturumId) ?? null;

  // --- Klavye: bir terminal uygulamasinin asgarisi ---
  useEffect(() => {
    const tus = (e: KeyboardEvent) => {
      if (!e.ctrlKey || e.altKey) return;
      if (e.key === 'b' || e.key === 'B') {
        // Claude Code'un kendi Ctrl+B'si var (arka plana at). Odak terminaldeyse tus onundur;
        // kenar cubugu icin baslik cubugundaki dugme ya da terminal disindan Ctrl+B kalir.
        if ((e.target as HTMLElement | null)?.closest('.xterm')) return;
        e.preventDefault();
        setKenarAcik((a) => !a);
      } else if (e.key === '1') {
        e.preventDefault();
        setGorunum('pano');
      } else if (e.key === '2') {
        e.preventDefault();
        setGorunum('terminal');
      } else if (e.shiftKey && (e.key === 'W' || e.key === 'w') && aktifOturumId) {
        // Ctrl+Shift+W bolmeyi kapatir. Ctrl+W terminalin kendisine ait, ona dokunulmaz.
        e.preventDefault();
        oturumKapat(aktifOturumId);
      } else if (e.key === 'Tab') {
        // Ctrl+Tab / Ctrl+Shift+Tab: sekme dongusu.
        if (gruplar.length < 2) return;
        e.preventDefault();
        const i = gruplar.findIndex((g) => g.id === aktifGrupId);
        const hedef = gruplar[(i + (e.shiftKey ? -1 : 1) + gruplar.length) % gruplar.length];
        grubaGit(hedef.id, hedef.uyeler[0].id);
      } else if (
        (e.key === '=' || e.key === '+' || e.key === '-' || e.key === '0') &&
        (e.target as HTMLElement | null)?.closest('.xterm')
      ) {
        // Yazi boyutu yalniz terminal odaktayken; uygulama zoom'u kilitli kalir.
        e.preventDefault();
        yaziBoyutuDegistir(e.key === '0' ? null : e.key === '-' ? -1 : 1);
      }
    };
    window.addEventListener('keydown', tus);
    return () => window.removeEventListener('keydown', tus);
  }, [aktifOturumId, oturumKapat, gruplar, aktifGrupId, grubaGit, yaziBoyutuDegistir]);

  // --- Bolme ayiricisi surukleme ---
  const surukleRef = useRef<{ solId: string; sagId: string; x: number; genislik: number } | null>(
    null
  );

  /** Iki komsu bolme arasindaki payi `fark` kadar (grubun orani cinsinden) kaydirir. */
  const oranKaydir = useCallback((solId: string, sagId: string, fark: number) => {
    setOturumlar((o) => {
      const sol = o.find((x) => x.id === solId);
      const sag = o.find((x) => x.id === sagId);
      if (!sol || !sag) return o;
      const toplam = sol.oran + sag.oran;
      const enAz = ASGARI_ORAN * toplam;
      const yeniSol = Math.min(Math.max(sol.oran + fark, enAz), toplam - enAz);
      if (yeniSol === sol.oran) return o;
      return o.map((x) =>
        x.id === solId
          ? { ...x, oran: yeniSol }
          : x.id === sagId
            ? { ...x, oran: toplam - yeniSol }
            : x
      );
    });
  }, []);

  useEffect(() => {
    const hareket = (e: MouseEvent) => {
      const s = surukleRef.current;
      if (!s) return;
      oranKaydir(s.solId, s.sagId, (e.clientX - s.x) / s.genislik);
      surukleRef.current = { ...s, x: e.clientX };
    };
    const birak = () => {
      if (!surukleRef.current) return;
      surukleRef.current = null;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    window.addEventListener('mousemove', hareket);
    window.addEventListener('mouseup', birak);
    return () => {
      window.removeEventListener('mousemove', hareket);
      window.removeEventListener('mouseup', birak);
    };
  }, [oranKaydir]);

  const surukleBasla = (e: React.MouseEvent<HTMLDivElement>, solId: string, sagId: string) => {
    const kap = e.currentTarget.parentElement;
    surukleRef.current = {
      solId,
      sagId,
      x: e.clientX,
      genislik: kap ? kap.getBoundingClientRect().width : window.innerWidth,
    };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  return (
    <div className="flex h-dvh gap-3 p-3">
      {/* ---- Sol kenar: terminale gecince daralir, Ctrl+B geri acar ---- */}
      <aside
        className={
          // Genislik BILEREK anime edilmiyor: blur'lu bir yuzeyin boyutunu anime etmek her karede
          // yeniden blur + ana alanda layout + xterm fit + PTY resize demek (DESIGN.md kurali).
          'cam halka relative flex shrink-0 flex-col overflow-hidden rounded-base bg-cam ' +
          (kenarAcik ? 'w-56' : 'w-14')
        }
      >
        <div className={'py-4 ' + (kenarAcik ? 'px-4' : 'px-0 text-center')}>
          <p className="enstruman text-sm font-semibold tracking-tight text-metin">
            {kenarAcik ? 'Kokpit' : 'K'}
          </p>
          {kenarAcik && (
            <p className="mt-0.5 text-xs text-metin-soluk">
              {durum ? new Date(durum.olculdu).toLocaleTimeString('tr-TR') + ' ölçümü' : 'okunuyor'}
            </p>
          )}
        </div>

        <nav className="px-2">
          <button
            type="button"
            onClick={() => setGorunum('pano')}
            title="Pano (Ctrl+1)"
            aria-label="Pano"
            aria-current={gorunum === 'pano' ? 'page' : undefined}
            className={
              'flex w-full cursor-pointer items-center gap-2.5 rounded-kontrol px-2.5 py-2 text-sm transition-colors duration-[180ms] ' +
              (kenarAcik ? '' : 'justify-center ') +
              (gorunum === 'pano'
                ? 'bg-yuzey text-metin'
                : 'text-metin-ikincil hover:bg-yuzey hover:text-metin')
            }
          >
            <LayoutDashboard className="size-4 shrink-0" aria-hidden="true" />
            {kenarAcik && 'Pano'}
          </button>
          <button
            type="button"
            onClick={() => setGorunum('terminal')}
            title="Terminaller (Ctrl+2)"
            aria-label="Terminaller"
            aria-current={gorunum === 'terminal' ? 'page' : undefined}
            className={
              'mt-1 flex w-full cursor-pointer items-center gap-2.5 rounded-kontrol px-2.5 py-2 text-sm transition-colors duration-[180ms] ' +
              (kenarAcik ? '' : 'justify-center ') +
              (gorunum === 'terminal'
                ? 'bg-yuzey text-metin'
                : 'text-metin-ikincil hover:bg-yuzey hover:text-metin')
            }
          >
            <TerminalSquare className="size-4 shrink-0" aria-hidden="true" />
            {kenarAcik && 'Terminaller'}
            {kenarAcik && oturumlar.length > 0 && (
              <span className="enstruman ml-auto text-xs text-metin-soluk">{oturumlar.length}</span>
            )}
          </button>
        </nav>

        {kenarAcik && <p className="etiket mt-6 px-4">Projeler</p>}
        <ul
          aria-label="Projeler"
          className={'min-h-0 flex-1 overflow-y-auto px-2 pb-3 ' + (kenarAcik ? 'mt-1' : 'mt-4')}
        >
          {siraliProjeler.map((p) => {
            const oturum = oturumlar.find((o) => o.yol === p.yol && o.durumu === 'acik');
            const dikkat = oturumlar.some((o) => o.yol === p.yol && o.dikkat);
            return (
              <li key={p.ad}>
                <button
                  type="button"
                  onClick={() => (oturum ? grubaGit(oturum.grupId, oturum.id) : sekmeAc(p))}
                  title={oturum ? p.ad + ' — açık oturuma git' : p.ad + ' klasöründe oturum aç'}
                  aria-label={oturum ? p.ad + ' — açık oturuma git' : p.ad + ' klasöründe oturum aç'}
                  className={
                    'group flex w-full cursor-pointer items-center gap-2 rounded-kontrol px-2.5 py-1.5 text-left transition-colors duration-[180ms] hover:bg-yuzey ' +
                    (kenarAcik ? '' : 'justify-center')
                  }
                >
                  {kenarAcik ? (
                    <span
                      className={
                        'size-1.5 shrink-0 rounded-full ' +
                        (dikkat
                          ? noktaSinifi({ durumu: 'acik', dikkat: true })
                          : oturum
                            ? 'bg-aksan'
                            : 'bg-kenar-guclu')
                      }
                      aria-hidden="true"
                    />
                  ) : (
                    // Daraltilmisken nokta hangi proje oldugunu soylemiyor; bas harf soyluyor.
                    <span
                      className={
                        'enstruman relative text-xs ' + (oturum ? 'text-aksan' : 'text-metin-soluk')
                      }
                      aria-hidden="true"
                    >
                      {p.ad.charAt(0).toUpperCase()}
                    </span>
                  )}
                  {kenarAcik && (
                    <>
                      <span className="enstruman truncate text-xs text-metin-ikincil group-hover:text-metin">
                        {p.ad}
                      </span>
                      {!oturum && (
                        <Plus
                          className="ml-auto size-3.5 shrink-0 text-transparent group-hover:text-metin-soluk"
                          aria-hidden="true"
                        />
                      )}
                    </>
                  )}
                </button>
              </li>
            );
          })}
        </ul>

        {kenarAcik && durum && (
          <div className="border-t border-kenar px-4 py-3">
            <p className="etiket">Bilgi tabanı</p>
            <p className="enstruman mt-1 text-xs text-metin-ikincil">
              {durum.beyin.makale}
              <span className="font-arayuz text-metin-soluk"> makale · </span>
              {durum.beyin.baglanti}
              <span className="font-arayuz text-metin-soluk"> bağlantı</span>
            </p>
          </div>
        )}
      </aside>

      {/* ---- Ana alan ---- */}
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <header className="halka relative flex shrink-0 items-center justify-between gap-4 rounded-base bg-yuzey px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setKenarAcik((a) => !a)}
              title={
                (kenarAcik ? 'Kenar çubuğunu daralt' : 'Kenar çubuğunu genişlet') + ' (Ctrl+B)'
              }
              aria-label={kenarAcik ? 'Kenar çubuğunu daralt' : 'Kenar çubuğunu genişlet'}
              aria-expanded={kenarAcik}
              className="shrink-0 cursor-pointer rounded-kontrol border border-kenar p-1.5 text-metin-soluk transition-colors duration-[180ms] hover:border-kenar-guclu hover:text-metin"
            >
              <PanelLeft className="size-4" aria-hidden="true" />
            </button>
            <h1 className="shrink-0 text-sm font-medium text-metin">
              {gorunum === 'pano' ? 'Pano' : (aktifOturum?.ad ?? 'Terminaller')}
            </h1>
            {gorunum === 'pano' && durum && (
              <span className="enstruman text-xs text-metin-soluk">
                {durum.projeler.length} proje
              </span>
            )}
            {gorunum === 'terminal' && aktifOturum && (
              <span className="enstruman truncate text-xs text-metin-soluk">{aktifOturum.yol}</span>
            )}
          </div>
          <button
            type="button"
            onClick={() => void tazele('elle')}
            disabled={yukleniyor}
            className="inline-flex shrink-0 cursor-pointer items-center gap-2 rounded-kontrol border border-kenar px-3 py-1.5 text-xs text-metin-ikincil transition-colors duration-[180ms] hover:border-kenar-guclu hover:text-metin disabled:opacity-50"
          >
            <RefreshCw
              className={'size-3.5 ' + (yukleniyor ? 'animate-spin' : '')}
              aria-hidden="true"
            />
            {yukleniyor ? 'Okunuyor' : 'Tazele'}
          </button>
        </header>

        {/* Pano: gizlenir, sokulmez — tazeleme durumu korunur. */}
        <main
          className={
            (gorunum === 'pano' ? 'block' : 'hidden') + ' min-h-0 flex-1 overflow-y-auto pr-1'
          }
        >
          {oncekiler.length > 0 && (
            <GeriYuklemeSeridi oncekiler={oncekiler} onYukle={geriYukle} onYoksay={() => setOncekiler([])} />
          )}
          {hata && (
            <div role="alert" className="mb-5 rounded-base border border-hata/40 bg-hata/10 p-4">
              <p className="flex items-center gap-2 text-sm font-medium text-hata-metin">
                <AlertTriangle className="size-4" aria-hidden="true" />
                Durum okunamadı
              </p>
              <p className="mt-1 text-xs text-metin-ikincil">
                durum.py çalıştırılamadı. Ayrıntı için ~/.kokpit/kokpit.log dosyasına bak.
              </p>
              <pre className="enstruman mt-2 whitespace-pre-wrap text-xs text-metin-soluk">
                {hata}
              </pre>
            </div>
          )}
          {durum && (
            <Pano
              durum={durum}
              oturumlar={oturumlar}
              sonOturumlar={sonOturumlar}
              simdi={simdi}
              onBaslat={sekmeAc}
              onOturumaGit={(id) => {
                const o = oturumlar.find((x) => x.id === id);
                if (o) grubaGit(o.grupId, o.id);
              }}
            />
          )}
        </main>

        {/* Terminaller: sekmeler + yan yana bolmeler. Hepsi mount kalir, biri gorunur. */}
        <section
          className={
            (gorunum === 'terminal' ? 'flex' : 'hidden') +
            ' halka relative min-h-0 flex-1 flex-col overflow-hidden rounded-base bg-yuzey'
          }
        >
          <div className="cam flex shrink-0 items-center gap-2 border-b border-kenar bg-cam px-2 py-1.5">
            <div
              role="tablist"
              aria-label="Açık sekmeler"
              onKeyDown={(e) => {
                // Sekme deseni: sol/sag ok komsu sekmeye gecer. Tab sirasi bozulmaz.
                if (!aktifGrupId || gruplar.length < 2) return;
                const i = gruplar.findIndex((g) => g.id === aktifGrupId);
                let hedef: number;
                if (e.key === 'ArrowLeft') hedef = (i - 1 + gruplar.length) % gruplar.length;
                else if (e.key === 'ArrowRight') hedef = (i + 1) % gruplar.length;
                else if (e.key === 'Home') hedef = 0;
                else if (e.key === 'End') hedef = gruplar.length - 1;
                else return;
                e.preventDefault();
                const g = gruplar[hedef];
                grubaGit(g.id, g.uyeler[0].id);
                document.getElementById('sekme-' + g.id)?.focus();
              }}
              className="flex min-w-0 flex-1 gap-1 overflow-x-auto"
            >
              {gruplar.map((g) => {
                const secili = g.id === aktifGrupId;
                const ilk = g.uyeler[0];
                const etiket = g.uyeler.length > 1 ? ilk.ad + ' +' + (g.uyeler.length - 1) : ilk.ad;
                const dikkat = g.uyeler.some((o) => o.dikkat);
                const nokta = dikkat
                  ? noktaSinifi({ durumu: 'acik', dikkat: true })
                  : g.uyeler.some((o) => o.durumu === 'acik')
                    ? 'bg-aksan'
                    : g.uyeler.some((o) => o.durumu === 'baglaniyor')
                      ? 'animate-pulse bg-dikkat'
                      : g.uyeler.some((o) => o.durumu === 'hata')
                        ? 'bg-hata'
                        : 'bg-metin-soluk';
                return (
                  <div
                    key={g.id}
                    className={
                      'flex shrink-0 items-center gap-2 rounded-kontrol border px-2.5 py-1.5 transition-colors duration-[180ms] ' +
                      (secili
                        ? 'border-kenar-guclu bg-yuzey-guclu'
                        : 'border-transparent hover:bg-yuzey')
                    }
                  >
                    <button
                      type="button"
                      role="tab"
                      id={'sekme-' + g.id}
                      aria-selected={secili}
                      aria-controls={'panel-' + g.id}
                      onClick={() => grubaGit(g.id, ilk.id)}
                      title={dikkat ? etiket + ' — dikkat bekliyor' : undefined}
                      className="flex cursor-pointer items-center gap-2"
                    >
                      <span className={'size-1.5 shrink-0 rounded-full ' + nokta} aria-hidden="true" />
                      {dikkat && <span className="sr-only">dikkat bekliyor</span>}
                      <span
                        className={
                          'enstruman text-xs ' + (secili ? 'text-metin' : 'text-metin-ikincil')
                        }
                      >
                        {etiket}
                      </span>
                      {g.uyeler.length === 1 && ilk.durumu === 'acik' && (
                        <span className="enstruman text-xs text-metin-soluk">
                          {sureMetni(Math.floor((simdi - ilk.baslangic) / 1000))}
                        </span>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => grupKapat(g.id)}
                      aria-label={etiket + ' sekmesini kapat'}
                      className="cursor-pointer rounded text-metin-soluk transition-colors duration-[180ms] hover:text-metin"
                    >
                      <X className="size-3.5" aria-hidden="true" />
                    </button>
                  </div>
                );
              })}
            </div>

            <div className="flex shrink-0 items-center gap-1">
              {aktifGrupId && (
                <ProjeSecici
                  projeler={siraliProjeler}
                  ikon={SplitSquareHorizontal}
                  baslik="Yana böl"
                  onSec={bolmeAc}
                />
              )}
              <ProjeSecici
                projeler={siraliProjeler}
                ikon={Plus}
                baslik="Yeni sekme"
                onSec={sekmeAc}
              />
            </div>
          </div>

          {gruplar.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
              {oncekiler.length > 0 && (
                <div className="mb-3 w-full max-w-xl text-left">
                  <GeriYuklemeSeridi
                    oncekiler={oncekiler}
                    onYukle={geriYukle}
                    onYoksay={() => setOncekiler([])}
                  />
                </div>
              )}
              <TerminalSquare className="size-8 text-metin-soluk" aria-hidden="true" />
              <p className="text-sm text-metin-ikincil">Açık oturum yok.</p>
              <p className="max-w-[46ch] text-xs text-metin-soluk">
                Soldaki listeden bir proje seç; o klasörde bir claude oturumu açılır. Aynı sekmede
                yan yana ikinci bir terminal için sağ üstteki böl düğmesini kullan.
              </p>
            </div>
          ) : (
            <div className="relative min-h-0 flex-1">
              {gruplar.map((g) => (
                <div
                  key={g.id}
                  role="tabpanel"
                  id={'panel-' + g.id}
                  aria-labelledby={'sekme-' + g.id}
                  className={(g.id === aktifGrupId ? 'flex' : 'hidden') + ' absolute inset-0 m-2'}
                >
                  {g.uyeler.map((o, i) => (
                    <Fragment key={o.id}>
                      {i > 0 && (
                        <div
                          role="separator"
                          aria-orientation="vertical"
                          aria-label={g.uyeler[i - 1].ad + ' / ' + o.ad + ' bölme genişliği'}
                          aria-valuenow={Math.round(g.uyeler[i - 1].oran * 100)}
                          aria-valuemin={Math.round(ASGARI_ORAN * 100)}
                          aria-valuemax={100 - Math.round(ASGARI_ORAN * 100)}
                          tabIndex={0}
                          onMouseDown={(e) => surukleBasla(e, g.uyeler[i - 1].id, o.id)}
                          onKeyDown={(e) => {
                            // Fareyle surukleme klavyede ok tuslariyla: her basim %5.
                            const solId = g.uyeler[i - 1].id;
                            if (e.key === 'ArrowLeft') oranKaydir(solId, o.id, -0.05);
                            else if (e.key === 'ArrowRight') oranKaydir(solId, o.id, 0.05);
                            else return;
                            e.preventDefault();
                          }}
                          className="group w-2 shrink-0 cursor-col-resize rounded-sm focus-visible:outline-offset-0"
                        >
                          <div className="mx-auto h-full w-px bg-kenar transition-colors duration-[180ms] group-hover:bg-aksan group-focus-visible:bg-aksan" />
                        </div>
                      )}
                      <div
                        className="flex min-w-0 flex-col"
                        style={{ flexBasis: o.oran * 100 + '%' }}
                      >
                        {g.uyeler.length > 1 && (
                          <div
                            className={
                              'flex shrink-0 items-center justify-between gap-2 rounded-t-kontrol border-b px-2 py-1 ' +
                              (o.id === aktifOturumId
                                ? 'border-kenar-guclu bg-yuzey-guclu'
                                : 'border-kenar bg-yuzey')
                            }
                          >
                            <button
                              type="button"
                              onClick={() => setAktifOturumId(o.id)}
                              className="flex min-w-0 cursor-pointer items-center gap-2"
                            >
                              <span
                                className={'size-1.5 shrink-0 rounded-full ' + noktaSinifi(o)}
                                aria-hidden="true"
                              />
                              {o.dikkat && <span className="sr-only">dikkat bekliyor</span>}
                              <span className="enstruman truncate text-xs text-metin-ikincil">
                                {o.ad}
                              </span>
                              {o.durumu === 'acik' && (
                                <span className="enstruman text-xs text-metin-soluk">
                                  {sureMetni(Math.floor((simdi - o.baslangic) / 1000))}
                                </span>
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={() => oturumKapat(o.id)}
                              aria-label={o.ad + ' bölmesini kapat'}
                              className="cursor-pointer rounded text-metin-soluk transition-colors duration-[180ms] hover:text-metin"
                            >
                              <X className="size-3.5" aria-hidden="true" />
                            </button>
                          </div>
                        )}
                        {o.mesaj && (
                          <p
                            role="status"
                            className={
                              'shrink-0 border-b px-2 py-1 text-xs ' +
                              (o.durumu === 'hata'
                                ? 'border-hata/40 bg-hata/10 text-hata-metin'
                                : 'border-kenar bg-yuzey text-metin-ikincil')
                            }
                          >
                            {o.mesaj}
                          </p>
                        )}
                        <div
                          onMouseDown={() => setAktifOturumId(o.id)}
                          onFocus={() => setAktifOturumId(o.id)}
                          className="min-h-0 flex-1 overflow-hidden rounded-kontrol bg-terminal p-2"
                        >
                          <TerminalOturumu
                            id={o.id}
                            yol={o.yol}
                            gorunur={g.id === aktifGrupId}
                            devam={o.devam}
                            yaziBoyutu={yaziBoyutu}
                            onDurum={oturumDurumu}
                            onZil={onZil}
                            onKayit={onKayit}
                          />
                        </div>
                      </div>
                    </Fragment>
                  ))}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
