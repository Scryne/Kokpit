import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Boxes,
  ChevronRight,
  History,
  Inbox,
  LayoutDashboard,
  PanelLeft,
  Plus,
  RefreshCw,
  SplitSquareHorizontal,
  TerminalSquare,
  X,
} from 'lucide-react';
import type {
  Durum,
  EtkinlikAnlik,
  OturumEtkinligi,
  OncekiOturum,
  Oturum,
  OturumBaglami,
  OturumDurumu,
  Proje,
  SonOturum,
} from './types';
import Pano from './Pano';
import Saglik from './Saglik';
import Envanter from './Envanter';
import NotKutusu from './NotKutusu';
import ProjeSecici from './ProjeSecici';
import TerminalOturumu, { type OturumApi } from './TerminalOturumu';
import KomutPaleti, { type Komut } from './KomutPaleti';
import { DurumIsareti, EtkinlikSeridi, LimitGostergesi, etkinlikCumlesi } from './Etkinlik';
import {
  BeyinKaydiRozeti,
  GRUP_BASLIK,
  projeGruplari,
  sureMetni,
  tokenMetni,
} from './parcalar';

// durum.py her cagrida ~2 sn'lik bir Python sureci demek (09-29 olcumu). Iki koruma:
// - ayni anda tek istek (StrictMode'un cift effect'ini de yutar)
// - odak olayi bu araliktan sik tazeleyemez (alt-tab firtinasi)
const ODAK_ASGARI_ARALIK_MS = 30_000;
const ASGARI_ORAN = 0.15;
const YAZI_BOYUTU = { enAz: 9, enCok: 28, varsayilan: 13 };

/** Oturum noktasinin rengi: kapaniyor > dikkat > acik > baglaniyor > hata > bitti. */
function noktaSinifi(o: Pick<Oturum, 'durumu' | 'dikkat' | 'kapaniyor'>) {
  if (o.kapaniyor) return 'animate-pulse bg-dikkat';
  if (o.dikkat) return 'bg-dikkat ring-2 ring-dikkat/30';
  if (o.durumu === 'acik') return 'bg-aksan';
  if (o.durumu === 'baglaniyor') return 'animate-pulse bg-dikkat';
  if (o.durumu === 'hata') return 'bg-hata';
  return 'bg-metin-soluk';
}

type Gorunum = 'pano' | 'terminal' | 'saglik' | 'envanter';
const GORUNUM_BASLIK: Record<Gorunum, string> = {
  pano: 'Pano',
  terminal: 'Terminaller',
  saglik: 'Sağlık',
  envanter: 'Envanter',
};

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
  // Proje listelerinde arsiv grubu (olduğu gibi / donduruldu / birakildi) acik mi. Kalici.
  const [arsivAcik, setArsivAcik] = useState(false);
  const [paletAcik, setPaletAcik] = useState(false);
  // Acik oturumlarin bağlam buyuklugu (transcript'ten, 20 sn'de bir).
  const [baglamlar, setBaglamlar] = useState<Record<string, OturumBaglami | null>>({});
  // Kanca koprusu (electron/kanca.cjs): oturum etkinligi, limitler, statusline baglami.
  const [etkinlik, setEtkinlik] = useState<EtkinlikAnlik>({ oturumlar: {}, baglamlar: {}, limitler: null });
  const etkinlikRef = useRef(etkinlik);
  etkinlikRef.current = etkinlik;
  // Ada (Kokpit arka plandayken ust ortadaki serit) acik mi; komut paletinden degisir.
  const [adaAcik, setAdaAcik] = useState(true);
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
  // Inbox notu (Ctrl+Shift+N) ve kaydedildi bildirimi (4 sn).
  const [notAcik, setNotAcik] = useState(false);
  const [notBildirimi, setNotBildirimi] = useState<string | null>(null);
  useEffect(() => {
    if (!notBildirimi) return;
    const t = setTimeout(() => setNotBildirimi(null), 4000);
    return () => clearTimeout(t);
  }, [notBildirimi]);

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
      setArsivAcik(a.arsivAcik === true);
      setAdaAcik(a.ada !== false);
      ayarHazir.current = true;
    });
    return () => {
      iptal = true;
    };
  }, []);
  useEffect(() => {
    if (!ayarHazir.current) return;
    void window.kokpit.ayarKaydet({ kenarAcik, yaziBoyutu, arsivAcik });
  }, [kenarAcik, yaziBoyutu, arsivAcik]);

  useEffect(() => {
    void window.kokpit.etkinlikAnlik().then(setEtkinlik);
    return window.kokpit.etkinlikDinle(setEtkinlik);
  }, []);

  // Genel kisayol (Ctrl+Alt+Shift+N, Kokpit arka plandayken de): main pencereyi one getirir,
  // burada not kutusu acilir.
  useEffect(() => window.kokpit.notAcSorulunca(() => setNotAcik(true)), []);

  const yaziBoyutuDegistir = useCallback((fark: number | null) => {
    setYaziBoyutu((b) =>
      fark === null
        ? YAZI_BOYUTU.varsayilan
        : Math.min(YAZI_BOYUTU.enCok, Math.max(YAZI_BOYUTU.enAz, b + fark))
    );
  }, []);

  // Tek sayac: acik oturum varsa sureler icin saniyede bir, yoksa dakikada bir tik.
  // (Eskiden oturum yokken hic tiklemiyordu; gece acik kalan Kokpit'te "son oturum: bugün"
  // ertesi gun de bugün diyordu.)
  const oturumAcik = oturumlar.some((o) => o.durumu === 'acik');
  useEffect(() => {
    setSimdi(Date.now());
    const t = setInterval(() => setSimdi(Date.now()), oturumAcik ? 1000 : 60_000);
    return () => clearInterval(t);
  }, [oturumAcik]);

  // Bağlam yoklamasi: yalniz acik oturum varken ve pencere gorunurken, 20 sn'de bir.
  // Okuma transcript'in son 512 KB'i (~3 ms); claude'un yazdigi dosyaya dokunmaz.
  const acikOturumAnahtari = oturumlar
    .filter((o) => o.durumu === 'acik')
    .map((o) => o.id)
    .join('|');
  useEffect(() => {
    if (!acikOturumAnahtari) {
      setBaglamlar({});
      return;
    }
    let iptal = false;
    const yokla = () => {
      if (document.visibilityState !== 'visible') return;
      const liste = oturumlarRef.current
        .filter((o) => o.durumu === 'acik')
        .map((o) => ({ id: o.id, yol: o.yol, baslangic: o.baslangic }));
      void window.kokpit.oturumBaglami(liste).then((b) => {
        if (!iptal) setBaglamlar(b);
      });
    };
    yokla();
    const t = setInterval(yokla, 20_000);
    return () => {
      iptal = true;
      clearInterval(t);
    };
  }, [acikOturumAnahtari]);

  // Async akislar (diyalog, guvenli cikis) saniyeler surer; bittiklerinde o anki listeye
  // bakmalari gerekir, akisin basladigi andaki kapanisa degil.
  const oturumlarRef = useRef(oturumlar);
  oturumlarRef.current = oturumlar;
  const aktifOturumRef = useRef(aktifOturumId);
  aktifOturumRef.current = aktifOturumId;
  const aktifGrupRef = useRef(aktifGrupId);
  aktifGrupRef.current = aktifGrupId;

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
  // "Beyne dusuyor..." durumundaki bir oturum varken 30 sn'de bir yeniden bak; flush
  // arka planda ~1 dk surer. Bekleyen yoksa yoklama yok.
  useEffect(() => {
    if (!Object.values(sonOturumlar).some((s) => s.beyin === 'bekliyor')) return;
    const t = setInterval(sonlariYenile, 30_000);
    return () => clearInterval(t);
  }, [sonOturumlar, sonlariYenile]);
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
   * ONEMLI: guncelleyicinin icine setState/yan etki konmaz; React onu (StrictMode'da ve
   * concurrent modda) birden fazla kez cagirabilir. Liste SAF bir fonksiyonla, o anki
   * duruma karsi guncellenir (async bir akistan saniyeler sonra cagrilsa da arada gelen
   * degisiklikler ezilmez); odak ve defter yan etkileri disarida bir kez yapilir.
   */
  const kapat = useCallback(
    (idler: string[]) => {
      const kume = new Set(idler);
      const simdiki = oturumlarRef.current;
      const kapanan = simdiki.filter((x) => kume.has(x.id));
      if (kapanan.length === 0) return;

      const etkilenenGruplar = new Set(kapanan.map((x) => x.grupId));
      for (const x of kapanan) defterKapandi(x.id, 'kullanici');

      // Etkilenen gruplarda kalan bolmeler bosalan payi paylasir.
      const cikar = (liste: Oturum[]) => {
        const kalan = liste.filter((x) => !kume.has(x.id));
        return kalan.map((x) => {
          if (!etkilenenGruplar.has(x.grupId)) return x;
          const kardesler = kalan.filter((y) => y.grupId === x.grupId);
          const toplam = kardesler.reduce((t, y) => t + y.oran, 0) || 1;
          return { ...x, oran: x.oran / toplam };
        });
      };
      setOturumlar(cikar);
      const yeni = cikar(simdiki);

      // Odak: once ayni grupta kalan bir bolme, yoksa son grup, o da yoksa Pano.
      const aktifOturumId = aktifOturumRef.current;
      const aktifGrupId = aktifGrupRef.current;
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
    [defterKapandi]
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
   *
   * Iki kaynak: kanca koprusunun sinyali ('bitti' / 'bekliyor', sebebi bilir) ve xterm zili
   * ('zil', sebebi bilmez). Kopru o oturumu goruyorsa zil yok sayilir; yoksa ikisi birden
   * cift rozet ve cift bildirim uretirdi. Kopru kurulamadiysa zil eskisi gibi calisir.
   */
  const onZil = useCallback(
    (id: string, sebep: 'bitti' | 'bekliyor' | 'zil', e?: OturumEtkinligi) => {
      const o = oturumlar.find((x) => x.id === id);
      if (!o) return;
      const kopru = e ?? etkinlikRef.current.oturumlar[id];
      if (sebep === 'zil' && kopru) return;
      const bakiyor =
        document.hasFocus() && gorunum === 'terminal' && aktifGrupId === o.grupId;
      if (bakiyor) return;
      setOturumlar((liste) => liste.map((x) => (x.id === id ? { ...x, dikkat: true } : x)));
      if (!document.hasFocus() && 'Notification' in window) {
        const goster = () => {
          const baslik =
            sebep === 'bekliyor' ? o.ad + ' seni bekliyor' : sebep === 'bitti' ? o.ad + ' bitti' : o.ad;
          const b = new Notification(baslik, {
            body: kopru
              ? etkinlikCumlesi(kopru, Date.now())
              : 'Oturum dikkat bekliyor — claude bitti ya da soru soruyor.',
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
  const onZilRef = useRef(onZil);
  onZilRef.current = onZil;
  const onZilXterm = useCallback((id: string) => onZilRef.current(id, 'zil'), []);
  useEffect(() => window.kokpit.sinyalDinle((s) => onZilRef.current(s.id, s.sinyal, s.durum)), []);

  // Adaya acik oturumlar: adlar burada yasar, ada yalniz kimlikle etkinligi eslestirir.
  useEffect(() => {
    window.kokpit.adaListe(
      oturumlar
        .filter((o) => o.durumu === 'acik' || o.durumu === 'baglaniyor')
        .map((o) => ({ id: o.id, ad: o.ad, baslangic: o.baslangic, dikkat: o.dikkat === true }))
    );
  }, [oturumlar]);
  // Adadan tiklama: main pencereyi one getirdi, burada o oturuma gecilir.
  useEffect(
    () =>
      window.kokpit.oturumaGitDinle((id) => {
        const o = oturumlarRef.current.find((x) => x.id === id);
        if (o) grubaGit(o.grupId, o.id);
      }),
    [grubaGit]
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
   * Kapatma korumasi. Kabugun altinda hala bir surec (claude) varsa kullaniciya sorulur.
   * PTY'yi oldurmek claude'u keser ve SessionEnd hook'u CALISMAZ: oturum beyne dusmez
   * (olculdu 2026-09-29; o gun vault oturumu 01baf5c3 bu yoldan kayboldu). Varsayilan yol
   * "Guvenli kapat": claude'a cikis tuslari gider, kendi kapanmasi beklenir.
   */
  const canliOturumlar = useCallback(async (idler: string[]) => {
    const sonuc: { id: string; ad: string; cocuklar: string[] | null }[] = [];
    await Promise.all(
      idler.map(async (id) => {
        const o = oturumlarRef.current.find((x) => x.id === id);
        const api = oturumApileri.current.get(id);
        if (!o || o.durumu !== 'acik' || !api) return;
        const cocuklar = await api.cocuklar();
        // Sorgu cevapsiz kaldiysa "calisiyor olabilir": sormadan kapatmak yerine sor.
        if (cocuklar === null) console.warn('[kapatma] süreç sorgusu yanıtsız: ' + o.ad);
        if (cocuklar === null || cocuklar.length > 0) sonuc.push({ id, ad: o.ad, cocuklar });
      })
    );
    return sonuc;
  }, []);

  const kapatmaSor = useCallback(
    async (
      canli: { ad: string; cocuklar: string[] | null }[],
      uygulama: boolean
    ): Promise<'guvenli' | 'zorla' | 'iptal'> => {
      const tanim = (c: { cocuklar: string[] | null }) =>
        c.cocuklar === null
          ? 'çalışan süreç okunamadı'
          : c.cocuklar.some((a) => /claude/i.test(a))
            ? 'claude çalışıyor'
            : c.cocuklar.join(', ') + ' çalışıyor';
      const liste =
        canli.length > 1 ? canli.map((c) => '• ' + c.ad + ': ' + tanim(c)).join('\n') + '\n\n' : '';
      const secim = await window.kokpit.sec({
        baslik: uygulama ? "Kokpit'i kapat" : 'Oturumu kapat',
        mesaj:
          canli.length === 1
            ? canli[0].ad + ': ' + tanim(canli[0]) + '.'
            : canli.length + ' oturumda süreç çalışıyor.',
        ayrinti:
          liste +
          "Güvenli kapat: claude'a çıkış tuşları gider (Esc, Ctrl+C ×2) ve kendi kapanması beklenir. " +
          "SessionEnd hook'u çalışır, oturum beyne düşer. Birkaç saniye, proje hook'uyla bir dakikaya kadar sürebilir.\n\n" +
          'Zorla kapat: süreç hemen kesilir. SessionEnd çalışmaz, oturum beyne düşmez.' +
          (uygulama ? '\n\nİki yolda da açık oturumlar bir sonraki açılışta geri yüklenebilir.' : ''),
        dugmeler: ['Güvenli kapat', 'Zorla kapat', 'Vazgeç'],
      });
      if (secim === 0) console.info('[kapatma] güvenli kapat: ' + canli.map((c) => c.ad).join(', '));
      if (secim === 1) console.info('[kapatma] zorla kapat: ' + canli.map((c) => c.ad).join(', '));
      return secim === 0 ? 'guvenli' : secim === 1 ? 'zorla' : 'iptal';
    },
    []
  );

  /**
   * Guvenli cikis: her oturum paralel. `kaldir` true ise temiz cikan bolme hemen kapanir
   * (sekme kapatma); false ise yerinde kalir (uygulama kapanisi: defterde acik kalsin ki bir
   * sonraki acilista geri yukleme teklif edilsin). Hepsi temiz ciktiysa true.
   */
  const guvenliKapat = useCallback(
    async (idler: string[], kaldir: boolean) => {
      const kume = new Set(idler);
      setOturumlar((l) =>
        l.map((x) => (kume.has(x.id) ? { ...x, kapaniyor: true, mesaj: undefined } : x))
      );
      const sonuclar = await Promise.all(
        idler.map(async (id) => {
          const api = oturumApileri.current.get(id);
          const temiz = api ? await api.guvenliCik() : true;
          if (temiz && kaldir) {
            kapat([id]);
          } else {
            setOturumlar((l) =>
              l.map((x) =>
                x.id === id
                  ? {
                      ...x,
                      kapaniyor: false,
                      mesaj: temiz
                        ? undefined
                        : "claude 90 sn içinde kapanmadı. Terminalde /exit yaz ya da sekmeyi zorla kapat.",
                    }
                  : x
              )
            );
          }
          return temiz;
        })
      );
      return sonuclar.every(Boolean);
    },
    [kapat]
  );

  /**
   * Bolme/sekme kapatma. Bir sekmenin tum bolmeleri TEK cagriyla gelir: tek tek kapatmak
   * her birine ayri diyalog acardi.
   */
  const oturumlariKapat = useCallback(
    (idler: string[]) => {
      void (async () => {
        // Guvenli cikisi suren bolmede ikinci X: zorla kapatma istegi.
        if (idler.some((id) => oturumlarRef.current.find((x) => x.id === id)?.kapaniyor)) {
          const tamam = await window.kokpit.onayla({
            baslik: 'Zorla kapat',
            mesaj: 'claude hâlâ kapanıyor.',
            ayrinti:
              "SessionEnd hook'u çalışıyor olabilir. Şimdi kapatırsan oturum beyne düşmeyebilir.",
            onayla: 'Zorla kapat',
          });
          if (tamam) kapat(idler);
          return;
        }
        const canli = await canliOturumlar(idler);
        if (canli.length === 0) {
          kapat(idler);
          return;
        }
        const secim = await kapatmaSor(canli, false);
        if (secim === 'iptal') return;
        if (secim === 'zorla') {
          kapat(idler);
          return;
        }
        const canliIdler = new Set(canli.map((c) => c.id));
        kapat(idler.filter((id) => !canliIdler.has(id)));
        await guvenliKapat([...canliIdler], true);
      })();
    },
    [canliOturumlar, kapatmaSor, guvenliKapat, kapat]
  );

  const oturumKapat = useCallback((id: string) => oturumlariKapat([id]), [oturumlariKapat]);
  const grupKapat = useCallback(
    (grupId: string) =>
      oturumlariKapat(oturumlarRef.current.filter((o) => o.grupId === grupId).map((o) => o.id)),
    [oturumlariKapat]
  );

  // Uygulama kapanisi. Main 'kapanis:sor' gonderir; renderer hemen 'alindi' der (main'in 3 sn
  // bekcisi durur), sonra kullanicinin kararina gore 'onay' ya da 'iptal'.
  useEffect(() => {
    return window.kokpit.kapanisSorulunca(() => {
      window.kokpit.kapanisAlindi();
      void (async () => {
        const acik = oturumlarRef.current.filter((o) => o.durumu === 'acik').map((o) => o.id);
        const canli = await canliOturumlar(acik);
        if (canli.length === 0) {
          window.kokpit.kapanisOnayla();
          return;
        }
        const secim = await kapatmaSor(canli, true);
        if (secim === 'iptal') {
          window.kokpit.kapanisIptal();
          return;
        }
        if (secim === 'zorla') {
          window.kokpit.kapanisOnayla();
          return;
        }
        // Kullanici kapanisi izleyebilsin.
        setGorunum('terminal');
        if (await guvenliKapat(canli.map((c) => c.id), false)) {
          window.kokpit.kapanisOnayla();
          return;
        }
        const yine = await window.kokpit.onayla({
          baslik: "Kokpit'i kapat",
          mesaj: 'Bazı oturumlar kapanmadı.',
          ayrinti: 'claude 90 sn içinde çıkmadı. Yine de kapatırsan bu oturumlar beyne düşmeyebilir.',
          onayla: 'Yine de kapat',
        });
        if (yine) window.kokpit.kapanisOnayla();
        else window.kokpit.kapanisIptal();
      })();
    });
  }, [canliOturumlar, kapatmaSor, guvenliKapat]);

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

  // Secicilerde de ayni sira: aktif, kullanimda, arsiv.
  const siraliProjeler = useMemo(
    () => projeGruplari(durum?.projeler ?? []).flatMap((g) => g.projeler),
    [durum]
  );

  const aktifOturum = oturumlar.find((o) => o.id === aktifOturumId) ?? null;

  // Gorunen dikkat: zil rozeti (bakinca duser) VEYA kanca koprusunde "seni bekliyor" durumu
  // (cevaplanana kadar surer — bakmak soruyu cevaplamaz). Yalniz gosterim; rozet mantigi
  // `oturumlar` uzerinde kalir.
  const gorunenOturumlar = useMemo(
    () =>
      oturumlar.map((o) =>
        !o.dikkat && etkinlik.oturumlar[o.id]?.durum === 'bekliyor' ? { ...o, dikkat: true } : o
      ),
    [oturumlar, etkinlik]
  );

  // Saglik rozeti: beyne dusmemis oturum + saglik nobeti alarmi.
  const saglikSayisi = (() => {
    const dusmemis = durum?.beyin.kapsama?.dusmemis.length ?? 0;
    const alarm = durum?.saglik?.alarmlar.length ?? 0;
    const parca = [];
    if (dusmemis) parca.push(dusmemis + ' oturum beyne düşmedi');
    if (alarm) parca.push(alarm + ' sağlık nöbeti alarmı');
    return { toplam: dusmemis + alarm, baslik: parca.join(' · ') };
  })();

  // Komut paleti icerigi: sayfalar, projeler (ac / git / klasor), eylemler.
  const komutlar = useMemo<Komut[]>(() => {
    const k: Komut[] = [
      { id: 's-pano', grup: 'Sayfa', baslik: 'Pano', ipucu: 'Ctrl+1', calistir: () => setGorunum('pano') },
      { id: 's-term', grup: 'Sayfa', baslik: 'Terminaller', ipucu: 'Ctrl+2', calistir: () => setGorunum('terminal') },
      { id: 's-saglik', grup: 'Sayfa', baslik: 'Sağlık', ipucu: 'Ctrl+3', calistir: () => setGorunum('saglik') },
      { id: 's-env', grup: 'Sayfa', baslik: 'Envanter', ipucu: 'Ctrl+4', calistir: () => setGorunum('envanter') },
    ];
    for (const p of siraliProjeler) {
      const acik = oturumlar.find((o) => o.yol === p.yol && o.durumu === 'acik');
      k.push(
        acik
          ? { id: 'g-' + p.ad, grup: 'Git', baslik: p.ad, ipucu: 'açık oturum', calistir: () => grubaGit(acik.grupId, acik.id) }
          : { id: 'a-' + p.ad, grup: 'Aç', baslik: p.ad, calistir: () => sekmeAc(p) }
      );
    }
    if (durum) {
      k.push({
        id: 'a-vault',
        grup: 'Aç',
        baslik: 'Aria ile konuş (vault)',
        ipucu: 'claude oturumu',
        calistir: () => sekmeAc({ ad: 'ScryneOS', yol: durum.vault }),
      });
    }
    if (oncekiler.length > 0) {
      k.push({ id: 'e-geri', grup: 'Eylem', baslik: 'Önceki oturumları geri yükle', ipucu: oncekiler.length + ' oturum', calistir: () => geriYukle() });
    }
    k.push(
      { id: 'e-not', grup: 'Eylem', baslik: "Inbox'a not", ipucu: 'Ctrl+Shift+N', calistir: () => setNotAcik(true) },
      { id: 'e-tazele', grup: 'Eylem', baslik: 'Durumu tazele', calistir: () => void tazele('elle') },
      { id: 'e-kenar', grup: 'Eylem', baslik: 'Kenar çubuğunu aç/kapat', ipucu: 'Ctrl+B', calistir: () => setKenarAcik((a) => !a) },
      { id: 'e-arsiv', grup: 'Eylem', baslik: arsivAcik ? 'Arşivi gizle' : 'Arşivi göster', calistir: () => setArsivAcik((a) => !a) },
      {
        id: 'e-ada',
        grup: 'Eylem',
        baslik: adaAcik ? "Ada'yı kapat" : "Ada'yı aç",
        ipucu: 'arka plandaki şerit',
        calistir: () => {
          const yeni = !adaAcik;
          setAdaAcik(yeni);
          window.kokpit.adaAyar(yeni);
        },
      }
    );
    for (const p of siraliProjeler) {
      k.push({ id: 'k-' + p.ad, grup: 'Klasör', baslik: p.ad, ipucu: 'Gezgin', calistir: () => void window.kokpit.klasorAc(p.yol) });
    }
    return k;
  }, [siraliProjeler, oturumlar, durum, oncekiler, arsivAcik, adaAcik, grubaGit, sekmeAc, geriYukle, tazele]);

  // Bağlam: statusline'dan (kesin, her turda) varsa o; yoksa transcript yoklamasi (20 sn).
  const baglamOku = (id: string) => {
    const ds = etkinlik.baglamlar[id];
    if (ds) return { token: ds.token, yuzde: ds.yuzde, model: ds.model, kaynak: 'durum-satiri' as const };
    const t = baglamlar[id];
    return t ? { token: t.token, yuzde: null, model: t.model, kaynak: 'transcript' as const } : null;
  };
  const aktifBaglam = aktifOturum ? baglamOku(aktifOturum.id) : null;

  // Pencere basligi Alt+Tab'da hangi projede oldugunu soyler; dikkat bekleyen varsa sayar.
  useEffect(() => {
    const dikkat = oturumlar.filter((o) => o.dikkat).length;
    const on = dikkat > 0 ? '(' + dikkat + ') ' : '';
    const yer = gorunum === 'terminal' && aktifOturum ? aktifOturum.ad : GORUNUM_BASLIK[gorunum];
    document.title = on + 'Kokpit — ' + yer;
  }, [gorunum, aktifOturum, oturumlar]);

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
      } else if (e.key === '3') {
        e.preventDefault();
        setGorunum('saglik');
      } else if (e.key === '4') {
        e.preventDefault();
        setGorunum('envanter');
      } else if (e.shiftKey && (e.key === 'P' || e.key === 'p')) {
        // Ctrl+Shift+P: komut paleti. Ctrl+K degil: claude'da satir sonuna kadar siler.
        e.preventDefault();
        setPaletAcik(true);
      } else if (e.shiftKey && (e.key === 'N' || e.key === 'n')) {
        // Ctrl+Shift+N: Inbox'a not. Kutu acikken tekrar basmak kapatmaz.
        e.preventDefault();
        setNotAcik(true);
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
          <button
            type="button"
            onClick={() => setGorunum('saglik')}
            title="Sağlık (Ctrl+3)"
            aria-label="Sağlık"
            aria-current={gorunum === 'saglik' ? 'page' : undefined}
            className={
              'mt-1 flex w-full cursor-pointer items-center gap-2.5 rounded-kontrol px-2.5 py-2 text-sm transition-colors duration-[180ms] ' +
              (kenarAcik ? '' : 'justify-center ') +
              (gorunum === 'saglik'
                ? 'bg-yuzey text-metin'
                : 'text-metin-ikincil hover:bg-yuzey hover:text-metin')
            }
          >
            <Activity className="size-4 shrink-0" aria-hidden="true" />
            {kenarAcik && 'Sağlık'}
            {kenarAcik && saglikSayisi.toplam > 0 && (
              <span className="enstruman ml-auto text-xs text-dikkat-metin" title={saglikSayisi.baslik}>
                {saglikSayisi.toplam}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setGorunum('envanter')}
            title="Envanter (Ctrl+4)"
            aria-label="Envanter"
            aria-current={gorunum === 'envanter' ? 'page' : undefined}
            className={
              'mt-1 flex w-full cursor-pointer items-center gap-2.5 rounded-kontrol px-2.5 py-2 text-sm transition-colors duration-[180ms] ' +
              (kenarAcik ? '' : 'justify-center ') +
              (gorunum === 'envanter'
                ? 'bg-yuzey text-metin'
                : 'text-metin-ikincil hover:bg-yuzey hover:text-metin')
            }
          >
            <Boxes className="size-4 shrink-0" aria-hidden="true" />
            {kenarAcik && 'Envanter'}
            {kenarAcik &&
              durum &&
              durum.envanter.drift_kayitsiz.length + durum.envanter.drift_hayalet.length > 0 && (
                <span
                  className="enstruman ml-auto text-xs text-dikkat-metin"
                  title="CLAUDE.md drift"
                >
                  {durum.envanter.drift_kayitsiz.length + durum.envanter.drift_hayalet.length}
                </span>
              )}
          </button>
        </nav>

        {/* Projeler, envanter grubuna gore. Arsiv (olduğu gibi / donduruldu / birakildi)
            varsayilan kapali: Scryne 09-29'da eski projelere donmeme karari verdi, 15 satirin
            10'u her gun gozun onunde duruyordu. */}
        <div className={'min-h-0 flex-1 overflow-y-auto px-2 pb-3 ' + (kenarAcik ? 'mt-4' : 'mt-4')}>
          {projeGruplari(durum?.projeler ?? []).map(({ grup, projeler }) => {
            const arsiv = grup === 'arsiv';
            const gorunur = !arsiv || arsivAcik;
            return (
              <div key={grup} className={kenarAcik ? 'mb-3' : 'mb-2 border-b border-kenar pb-2 last:border-b-0'}>
                {kenarAcik &&
                  (arsiv ? (
                    <button
                      type="button"
                      onClick={() => setArsivAcik((a) => !a)}
                      aria-expanded={arsivAcik}
                      aria-controls="kenar-arsiv"
                      className="etiket flex w-full cursor-pointer items-center gap-1.5 rounded-kontrol px-2.5 py-1 text-left transition-colors duration-[180ms] hover:text-metin-ikincil"
                    >
                      <ChevronRight
                        className={'size-3 shrink-0 ' + (arsivAcik ? 'rotate-90' : '')}
                        aria-hidden="true"
                      />
                      {GRUP_BASLIK[grup]}
                      <span className="enstruman ml-auto">{projeler.length}</span>
                    </button>
                  ) : (
                    <p className="etiket px-2.5 py-1">{GRUP_BASLIK[grup]}</p>
                  ))}
                {gorunur && (
                  <ul aria-label={GRUP_BASLIK[grup] + ' projeler'} id={arsiv ? 'kenar-arsiv' : undefined}>
                    {projeler.map((p) => {
                      const oturum = oturumlar.find((o) => o.yol === p.yol && o.durumu === 'acik');
                      const dikkat = gorunenOturumlar.some((o) => o.yol === p.yol && o.dikkat);
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
                                  'enstruman relative text-xs ' +
                                  (oturum ? 'text-aksan' : 'text-metin-soluk')
                                }
                                aria-hidden="true"
                              >
                                {p.ad.charAt(0).toUpperCase()}
                              </span>
                            )}
                            {kenarAcik && (
                              <>
                                <span
                                  className={
                                    'enstruman truncate text-xs group-hover:text-metin ' +
                                    (arsiv ? 'text-metin-soluk' : 'text-metin-ikincil')
                                  }
                                >
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
                )}
              </div>
            );
          })}
        </div>

        {kenarAcik && etkinlik.limitler && (
          <div className="border-t border-kenar px-4 py-3">
            <LimitGostergesi limitler={etkinlik.limitler} simdi={simdi} />
          </div>
        )}

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
              {gorunum === 'terminal' ? (aktifOturum?.ad ?? 'Terminaller') : GORUNUM_BASLIK[gorunum]}
            </h1>
            {gorunum === 'pano' && durum && (
              <span className="enstruman text-xs text-metin-soluk">
                {durum.projeler.length} proje
              </span>
            )}
            {gorunum === 'terminal' && aktifOturum && (
              <span className="enstruman truncate text-xs text-metin-soluk">{aktifOturum.yol}</span>
            )}
            {gorunum === 'terminal' && aktifBaglam && (
              <span
                className="enstruman shrink-0 rounded-rozet border border-kenar px-2 py-0.5 text-xs text-metin-ikincil"
                title={
                  'Bağlam: son turda modele giden ' +
                  aktifBaglam.token.toLocaleString('tr-TR') +
                  ' token' +
                  (aktifBaglam.model ? ' (' + aktifBaglam.model + ')' : '') +
                  (aktifBaglam.kaynak === 'durum-satiri'
                    ? '. Durum satırından, her turda.'
                    : ". 20 sn'de bir transcript'ten okunur.")
                }
              >
                bağlam {tokenMetni(aktifBaglam.token)}
                {aktifBaglam.yuzde !== null && ' · %' + Math.round(aktifBaglam.yuzde)}
              </span>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {notBildirimi && (
              <span role="status" className="text-xs text-metin-soluk">
                {notBildirimi}
              </span>
            )}
            <button
              type="button"
              onClick={() => setNotAcik(true)}
              title="Inbox'a not (Ctrl+Shift+N)"
              aria-label="Inbox'a not"
              className="shrink-0 cursor-pointer rounded-kontrol border border-kenar p-1.5 text-metin-soluk transition-colors duration-[180ms] hover:border-kenar-guclu hover:text-metin"
            >
              <Inbox className="size-4" aria-hidden="true" />
            </button>
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
          </div>
        </header>

        <KomutPaleti acik={paletAcik} komutlar={komutlar} onKapat={() => setPaletAcik(false)} />

        <NotKutusu
          acik={notAcik}
          kaynak={gorunum === 'terminal' && aktifOturum ? aktifOturum.ad : null}
          onKapat={() => setNotAcik(false)}
          onKaydedildi={() => {
            setNotAcik(false);
            setNotBildirimi("Not Inbox'a düştü");
          }}
        />

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
              oturumlar={gorunenOturumlar}
              sonOturumlar={sonOturumlar}
              simdi={simdi}
              arsivAcik={arsivAcik}
              onArsivDegistir={() => setArsivAcik((a) => !a)}
              onSaglik={() => setGorunum('saglik')}
              onBaslat={sekmeAc}
              onOturumaGit={(id) => {
                const o = oturumlar.find((x) => x.id === id);
                if (o) grubaGit(o.grupId, o.id);
              }}
            />
          )}
        </main>

        <section
          aria-label="Sağlık"
          className={(gorunum === 'saglik' ? 'block' : 'hidden') + ' min-h-0 flex-1 overflow-y-auto pr-1'}
        >
          {durum && (
            <Saglik
              durum={durum}
              acikYollar={oturumlar.filter((o) => o.durumu === 'acik').map((o) => o.yol)}
              onVaultOturumu={() => sekmeAc({ ad: 'ScryneOS', yol: durum.vault })}
              onTazele={() => void tazele('elle')}
            />
          )}
        </section>

        <section
          aria-label="Envanter"
          className={(gorunum === 'envanter' ? 'block' : 'hidden') + ' min-h-0 flex-1 overflow-y-auto pr-1'}
        >
          {durum && <Envanter durum={durum} />}
        </section>

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
                const dikkat = g.uyeler.some(
                  (o) => o.dikkat || etkinlik.oturumlar[o.id]?.durum === 'bekliyor'
                );
                const kapaniyor = g.uyeler.some((o) => o.kapaniyor);
                const calisiyor = g.uyeler.some((o) => etkinlik.oturumlar[o.id]?.durum === 'calisiyor');
                const nokta = kapaniyor
                  ? 'animate-pulse bg-dikkat'
                  : dikkat
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
                      {calisiyor && !dikkat && !kapaniyor ? (
                        <DurumIsareti durum="calisiyor" />
                      ) : (
                        <span className={'size-1.5 shrink-0 rounded-full ' + nokta} aria-hidden="true" />
                      )}
                      {dikkat && <span className="sr-only">dikkat bekliyor</span>}
                      {calisiyor && <span className="sr-only">çalışıyor</span>}
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
                                  {baglamOku(o.id) && ' · ' + tokenMetni(baglamOku(o.id)!.token)}
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
                        {o.kapaniyor && (
                          <p
                            role="status"
                            className="flex shrink-0 items-center gap-2 border-b border-kenar bg-yuzey px-2 py-1 text-xs text-metin-ikincil"
                          >
                            <span
                              className="size-1.5 shrink-0 animate-pulse rounded-full bg-dikkat"
                              aria-hidden="true"
                            />
                            <span className="min-w-0 flex-1 truncate">
                              Güvenli kapatılıyor: SessionEnd hook'u bekleniyor, bir dakikaya
                              kadar sürebilir.
                            </span>
                            <button
                              type="button"
                              onClick={() => oturumKapat(o.id)}
                              className="shrink-0 cursor-pointer rounded-kontrol border border-kenar px-2 py-0.5 text-metin-soluk transition-colors duration-[180ms] hover:border-kenar-guclu hover:text-metin"
                            >
                              Zorla kapat
                            </button>
                          </p>
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
                            {o.durumu === 'bitti' && sonOturumlar[o.yol] && (
                              <>
                                {' · '}
                                <BeyinKaydiRozeti kaydi={sonOturumlar[o.yol].beyin} />
                              </>
                            )}
                          </p>
                        )}
                        {o.durumu === 'acik' && etkinlik.oturumlar[o.id] && (
                          <EtkinlikSeridi e={etkinlik.oturumlar[o.id]} simdi={simdi} />
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
                            onZil={onZilXterm}
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
