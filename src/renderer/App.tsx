import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  LayoutDashboard,
  PanelLeft,
  Plus,
  RefreshCw,
  SplitSquareHorizontal,
  TerminalSquare,
  X,
} from 'lucide-react';
import type { Durum, Oturum, OturumDurumu, Proje } from './types';
import Pano from './Pano';
import ProjeSecici from './ProjeSecici';
import TerminalOturumu from './TerminalOturumu';
import { ASAMA_SIRA, sureMetni } from './parcalar';

// durum.py her cagrida ~500 ms'lik bir Python sureci demek. Iki koruma:
// - ayni anda tek istek (StrictMode'un cift effect'ini de yutar)
// - odak olayi bu araliktan sik tazeleyemez (alt-tab firtinasi)
const ODAK_ASGARI_ARALIK_MS = 30_000;
const ASGARI_ORAN = 0.15;

type Gorunum = 'pano' | 'terminal';

export default function App() {
  const [durum, setDurum] = useState<Durum | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [gorunum, setGorunum] = useState<Gorunum>('pano');
  const [kenarAcik, setKenarAcik] = useState(true);

  // Oturumlar BURADA yasar. Gorunum degisince unmount olmazlar, yoksa Pano'ya her
  // bakista WS kapanir ve calisan claude oturumu olur.
  const [oturumlar, setOturumlar] = useState<Oturum[]>([]);
  const [aktifGrupId, setAktifGrupId] = useState<string | null>(null);
  const [aktifOturumId, setAktifOturumId] = useState<string | null>(null);
  const [simdi, setSimdi] = useState(() => Date.now());

  const ucusta = useRef(false);
  const sonOkuma = useRef(0);

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

  const yeniId = (p: Proje) =>
    p.ad + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);

  /** Yeni sekme: kendi grubunda tek bolme. */
  const sekmeAc = useCallback((p: Proje) => {
    const id = yeniId(p);
    const grupId = 'g-' + id;
    setOturumlar((o) => [
      ...o,
      { id, ad: p.ad, yol: p.yol, durumu: 'baglaniyor', baslangic: Date.now(), grupId, oran: 1 },
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
    [oturumlar, aktifOturumId, aktifGrupId]
  );

  const oturumKapat = useCallback((id: string) => kapat([id]), [kapat]);

  /**
   * Sekmenin tamami. Tek tek `oturumKapat` cagirmak YANLIS olurdu: hepsi ayni tick'te
   * ayni `oturumlar` degerini gorur ve yalnizca sonuncusu uygulanirdi.
   */
  const grupKapat = useCallback(
    (grupId: string) => kapat(oturumlar.filter((o) => o.grupId === grupId).map((o) => o.id)),
    [kapat, oturumlar]
  );

  const oturumDurumu = useCallback((id: string, durumu: OturumDurumu, mesaj?: string) => {
    setOturumlar((o) => o.map((x) => (x.id === id ? { ...x, durumu, mesaj } : x)));
  }, []);

  const grubaGit = useCallback((grupId: string, oturumId?: string) => {
    setAktifGrupId(grupId);
    if (oturumId) setAktifOturumId(oturumId);
    setGorunum('terminal');
    setKenarAcik(false);
  }, []);

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
      }
    };
    window.addEventListener('keydown', tus);
    return () => window.removeEventListener('keydown', tus);
  }, [aktifOturumId, oturumKapat]);

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
                        'size-1.5 shrink-0 rounded-full ' + (oturum ? 'bg-aksan' : 'bg-kenar-guclu')
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
                const nokta = g.uyeler.some((o) => o.durumu === 'acik')
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
                      className="flex cursor-pointer items-center gap-2"
                    >
                      <span className={'size-1.5 shrink-0 rounded-full ' + nokta} aria-hidden="true" />
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
                                className={
                                  'size-1.5 shrink-0 rounded-full ' +
                                  (o.durumu === 'acik'
                                    ? 'bg-aksan'
                                    : o.durumu === 'baglaniyor'
                                      ? 'animate-pulse bg-dikkat'
                                      : o.durumu === 'hata'
                                        ? 'bg-hata'
                                        : 'bg-metin-soluk')
                                }
                                aria-hidden="true"
                              />
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
                            onDurum={oturumDurumu}
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
