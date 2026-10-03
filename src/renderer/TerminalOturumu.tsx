import { useEffect, useRef, useState } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { SearchAddon } from '@xterm/addon-search';
import { Unicode11Addon } from '@xterm/addon-unicode11';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { WebglAddon } from '@xterm/addon-webgl';
import { ChevronDown, ChevronUp, X } from 'lucide-react';
import '@xterm/xterm/css/xterm.css';
import type { OturumDurumu } from './types';

/** App'in bir oturuma dokunabildigi dar yuzey (kapatma onayi ve guvenli cikis). */
export interface OturumApi {
  /**
   * Kabugun altinda calisan sureclerin adlari (ornegin claude.exe). `null` = bilinmiyor
   * (sorgu basarisiz / zaman asimi); cagiran bunu "calisiyor olabilir" diye ele alir.
   */
  cocuklar: () => Promise<string[] | null>;
  /** claude'a cikis tuslarini gonderir, SessionEnd bitene kadar bekler. Temiz ciktiysa true. */
  guvenliCik: () => Promise<boolean>;
}

// Sunucu tarafi 90 sn bekliyor; ustune ag/olcum payi.
const COCUK_ZAMAN_ASIMI_MS = 8000;
const CIKIS_ZAMAN_ASIMI_MS = 100_000;

interface Props {
  id: string;
  yol: string;
  gorunur: boolean;
  /** Geri yukleme: claude --continue. */
  devam?: boolean;
  yaziBoyutu: number;
  onDurum: (id: string, durumu: OturumDurumu, mesaj?: string) => void;
  /** Terminal zili: claude bitti ya da soru soruyor. */
  onZil: (id: string) => void;
  onKayit: (id: string, api: OturumApi | null) => void;
}

/**
 * Uygulamanin kendi kisayollari xterm'e ULASMAZ; yoksa hem claude'a kontrol karakteri
 * gider hem uygulama tepki verir (xterm keydown'i stopPropagation yapmaz, olculdu).
 * Ctrl+B bilerek listede DEGIL: Claude Code onu kullaniyor, terminal odaktayken onun.
 * Ctrl+V de listede degil: xterm onu ^V olarak gonderir, Claude Code bununla panodaki
 * resmi yapistirir.
 */
function uygulamaninKisayolu(e: KeyboardEvent) {
  if (!e.ctrlKey || e.altKey) return false;
  if (e.key === 'Tab') return true;
  if (e.shiftKey) return ['W', 'w', 'N', 'n', 'P', 'p'].includes(e.key);
  return ['1', '2', '3', '4', '=', '+', '-', '0'].includes(e.key);
}

/** Bosluk/tirnak iceren yol kabuga tek arguman olarak gitsin (Windows Terminal de boyle yapar). */
function yolTirnakla(yol: string) {
  return /[\s"']/.test(yol) ? '"' + yol.replace(/"/g, '\\"') + '"' : yol;
}

const ARAMA_SUSLEME = {
  matchBackground: '#323a47',
  matchBorder: '#4a5566',
  matchOverviewRuler: '#c3cedb',
  activeMatchBackground: '#5d6b80',
  activeMatchBorder: '#c3cedb',
  activeMatchColorOverviewRuler: '#f3f5f8',
};

/**
 * Bir PTY oturumu. KRITIK: bu bilesen oturum kapatilana kadar UNMOUNT EDILMEZ.
 * Gorunmedigi zaman gizlenir, sokulmez — yoksa Pano'ya her bakista WS kapanir,
 * PTY olur ve calisan claude oturumu kaybolur. Oturum listesi App'te yasar.
 */
export default function TerminalOturumu({
  id,
  yol,
  gorunur,
  devam = false,
  yaziBoyutu,
  onDurum,
  onZil,
  onKayit,
}: Props) {
  const kutuRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<XTerm | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const aramaRef = useRef<SearchAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const onDurumRef = useRef(onDurum);
  onDurumRef.current = onDurum;
  const onZilRef = useRef(onZil);
  onZilRef.current = onZil;
  const onKayitRef = useRef(onKayit);
  onKayitRef.current = onKayit;
  const gorunurRef = useRef(gorunur);
  gorunurRef.current = gorunur;
  // Sunucuya sorulan sorularin bekleyen cevaplari, istek kimligine gore (cocuk, cik).
  // `kopuk`: baglanti koparsa cagrilir. Kopuk terminalde calisan surec kalmaz; cevap
  // beklemek yerine hemen "baglanti yok" sonucu verilir.
  const bekleyenRef = useRef(
    new Map<number, { cevap: (m: { adlar?: unknown; temiz?: unknown }) => void; kopuk: () => void }>()
  );
  const istekSira = useRef(0);

  const [birakiliyor, setBirakiliyor] = useState(false);
  const [aramaAcik, setAramaAcik] = useState(false);
  const [arama, setArama] = useState('');
  const aramaKutuRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const kutu = kutuRef.current;
    if (!kutu) return;
    let kapandi = false;

    const term = new XTerm({
      fontFamily: "'JetBrains Mono Variable', ui-monospace, Consolas, monospace",
      fontSize: yaziBoyutu,
      lineHeight: 1.2,
      cursorBlink: true,
      allowProposedApi: true,
      scrollback: 5000,
      // Terminal BILEREK opak (DESIGN.md: "cam degil, delik").
      theme: {
        background: '#07080a',
        foreground: '#e9edf4',
        cursor: '#d3dbe5',
        cursorAccent: '#07080a',
        selectionBackground: 'rgba(195,206,219,0.24)',
      },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    // Emoji ve kutu cizimi genislikleri: claude TUI'si ikisini de kullanir, Unicode 6
    // tablosuyla imlec kayiyordu.
    term.loadAddon(new Unicode11Addon());
    term.unicode.activeVersion = '11';
    const aramaEklentisi = new SearchAddon();
    term.loadAddon(aramaEklentisi);
    aramaRef.current = aramaEklentisi;
    // Link tiklamasi renderer'dan disari cikmaz; main http(s) dogrulayip tarayiciya verir.
    term.loadAddon(new WebLinksAddon((_e, uri) => void window.kokpit.linkAc(uri)));

    term.attachCustomKeyEventHandler((e) => {
      if (e.type !== 'keydown') return !uygulamaninKisayolu(e);
      if (uygulamaninKisayolu(e)) return false;
      if (!e.ctrlKey || e.altKey) return true;
      // Ctrl+Shift+F: bu terminalde ara.
      if (e.shiftKey && (e.key === 'F' || e.key === 'f')) {
        e.preventDefault();
        setAramaAcik(true);
        setTimeout(() => aramaKutuRef.current?.select(), 0);
        return false;
      }
      // Ctrl+Shift+C kopyala; Ctrl+C secim VARKEN kopyalar (Windows Terminal davranisi),
      // secim yokken ^C olarak claude'a gider.
      if ((e.key === 'C' || e.key === 'c') && (e.shiftKey || term.hasSelection())) {
        if (term.hasSelection()) {
          void navigator.clipboard.writeText(term.getSelection());
          term.clearSelection();
        }
        e.preventDefault();
        return false;
      }
      // Ctrl+Shift+V: tarayicinin paste olayi zaten xterm'e ulasiyor; dokunma.
      return true;
    });

    term.open(kutu);
    termRef.current = term;
    fitRef.current = fit;

    // WebGL: claude TUI'si cok cizim yapar, DOM/canvas renderer'da kaydirma takiliyordu.
    // Baglam kaybinda eklenti kendini soker, xterm canvas'a geri duser.
    try {
      const webgl = new WebglAddon();
      webgl.onContextLoss(() => {
        console.warn('[terminal] webgl baglami kayboldu, canvas renderer');
        webgl.dispose();
      });
      term.loadAddon(webgl);
      console.info('[terminal] webgl renderer aktif');
    } catch (e) {
      console.warn('[terminal] webgl yuklenemedi, canvas renderer: ' + String(e));
    }

    // Sag tik: yapistir (Windows Terminal davranisi).
    const sagTik = (e: MouseEvent) => {
      e.preventDefault();
      void navigator.clipboard.readText().then((metin) => {
        if (metin) term.paste(metin);
      });
    };
    kutu.addEventListener('contextmenu', sagTik);

    term.onBell(() => onZilRef.current(id));

    // PTY'ye boyut yalnizca DEGISINCE gider. Ayirici suruklenirken ResizeObserver her
    // mousemove'da tetikleniyor; sutun/satir sayisi ayniyken resize gondermek claude
    // TUI'sini bosuna yeniden cizdiriyordu.
    let sonCols = -1;
    let sonRows = -1;
    const boyutGonder = () => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      if (term.cols === sonCols && term.rows === sonRows) return;
      sonCols = term.cols;
      sonRows = term.rows;
      ws.send(JSON.stringify({ t: 'boyut', cols: term.cols, rows: term.rows }));
    };

    // Olcum kare basina en fazla bir kez: pes pese RO tetiklemeleri tek fit'e iner.
    let olcumKaresi = 0;
    const gozlemci = new ResizeObserver(() => {
      if (olcumKaresi) return;
      olcumKaresi = requestAnimationFrame(() => {
        olcumKaresi = 0;
        // Gizliyken olcum 0 doner ve satir sayisi bozulur.
        if (!kutu.offsetParent) return;
        try {
          fit.fit();
          boyutGonder();
        } catch {
          /* olcum sirasinda gizlenmis olabilir */
        }
      });
    });
    gozlemci.observe(kutu);

    /**
     * Sunucuya kimlikli bir soru sorar. Baglanti yoksa `bagliDegil`, zaman asiminda
     * `zamanAsimi` doner — ikisi ayri: baglantisiz terminalde calisan surec yoktur, zaman
     * asiminda ise bilinmez.
     */
    const sor = <T,>(
      t: 'cocuk' | 'cik',
      ms: number,
      coz: (m: { adlar?: unknown; temiz?: unknown }) => T,
      bagliDegil: T,
      zamanAsimi: T
    ) =>
      new Promise<T>((bitir) => {
        const ws = wsRef.current;
        if (!ws || ws.readyState !== WebSocket.OPEN) {
          bitir(bagliDegil);
          return;
        }
        const n = ++istekSira.current;
        const zaman = setTimeout(() => {
          if (bekleyenRef.current.delete(n)) bitir(zamanAsimi);
        }, ms);
        bekleyenRef.current.set(n, {
          cevap: (m) => {
            clearTimeout(zaman);
            bitir(coz(m));
          },
          kopuk: () => {
            clearTimeout(zaman);
            bitir(bagliDegil);
          },
        });
        ws.send(JSON.stringify({ t, n }));
      });

    onKayitRef.current(id, {
      cocuklar: () =>
        sor<string[] | null>(
          'cocuk',
          COCUK_ZAMAN_ASIMI_MS,
          (m) => (Array.isArray(m.adlar) ? (m.adlar as string[]) : null),
          [],
          null
        ),
      // Baglanti yoksa kabuk da yok: cikacak bir sey kalmamis, temiz sayilir.
      guvenliCik: () =>
        sor<boolean>('cik', CIKIS_ZAMAN_ASIMI_MS, (m) => m.temiz === true, true, false),
    });

    void (async () => {
      // Font yarisi: fit() yedek fontun hucre olculeriyle calisirsa satir sayisi yanlis
      // hesaplanir ve TUI kayar. Once fontu bekle, sonra olc.
      try {
        await document.fonts.load('13px "JetBrains Mono Variable"');
        await document.fonts.ready;
      } catch {
        /* font API yoksa yedek olculerle devam */
      }
      if (kapandi) return;
      try {
        fit.fit();
      } catch {
        /* gizliyse sonra olculecek */
      }

      const sonuc = await window.kokpit.ptyBilgi();
      if (kapandi) return;
      if (!sonuc.bilgi) {
        onDurumRef.current(id, 'hata', sonuc.hata ?? 'PTY sunucusu başlatılamadı');
        return;
      }

      const { port, token } = sonuc.bilgi;
      const ws = new WebSocket('ws://127.0.0.1:' + port + '/?token=' + token);
      wsRef.current = ws;

      let acildi = false;
      ws.onopen = () => {
        acildi = true;
        ws.send(
          JSON.stringify({
            t: 'ac',
            cwd: yol,
            komut: devam ? 'claude-devam' : 'claude',
            // Kanca koprusu bu kimlikle olaylari sekmeye baglar (KOKPIT_OTURUM).
            oturum: id,
            cols: term.cols,
            rows: term.rows,
          })
        );
      };
      // Son durum (bitti/hata) bir kez bildirilir. `bitti` mesajindan hemen sonra sunucu
      // soketi kapatiyor; onclose ikinci kez 'bitti' bildirince mesaj satiri ("Oturum
      // kapandi · beyne dustu") siliniyordu. onerror'dan sonraki onclose da hatayi eziyordu.
      let sonBildirildi = false;
      const sonDurum = (durumu: 'bitti' | 'hata', mesaj?: string) => {
        if (sonBildirildi || kapandi) return;
        sonBildirildi = true;
        onDurumRef.current(id, durumu, mesaj);
      };
      ws.onmessage = (ev) => {
        let m;
        try {
          m = JSON.parse(ev.data as string);
        } catch {
          return;
        }
        if (m.t === 'hazir') {
          onDurumRef.current(id, 'acik');
          if (gorunurRef.current) term.focus();
        } else if (m.t === 'veri') term.write(m.d);
        else if (m.t === 'bitti') sonDurum('bitti', 'Oturum kapandı (çıkış kodu ' + m.kod + ')');
        else if (m.t === 'hata') sonDurum('hata', m.mesaj);
        else if (m.t === 'cocuklar' || m.t === 'cikis') {
          const b = bekleyenRef.current.get(m.n);
          bekleyenRef.current.delete(m.n);
          b?.cevap(m);
        }
      };
      const bekleyenleriKopar = () => {
        for (const b of bekleyenRef.current.values()) b.kopuk();
        bekleyenRef.current.clear();
      };
      ws.onerror = () =>
        sonDurum(
          'hata',
          ws.readyState === WebSocket.CONNECTING || !acildi
            ? 'Terminal sunucusuna bağlanılamadı'
            : 'Terminal sunucusuyla bağlantı koptu'
        );
      ws.onclose = () => {
        bekleyenleriKopar();
        sonDurum('bitti', 'Terminal bağlantısı kapandı');
      };

      term.onData((d) => {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ t: 'veri', d }));
      });
    })();

    return () => {
      kapandi = true;
      onKayitRef.current(id, null);
      // Bekleyen sorular askida kalmasin: bilesen gidince baglanti da gider.
      for (const b of bekleyenRef.current.values()) b.kopuk();
      bekleyenRef.current.clear();
      gozlemci.disconnect();
      if (olcumKaresi) cancelAnimationFrame(olcumKaresi);
      kutu.removeEventListener('contextmenu', sagTik);
      try {
        wsRef.current?.close();
      } catch {
        /* zaten kapali */
      }
      term.dispose();
      termRef.current = null;
      aramaRef.current = null;
    };
    // id/yol degismez; oturum bir kez kurulur ve kapatilana kadar yasar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Yazi boyutu tum terminallerde ortak; degisince yeniden olc.
  useEffect(() => {
    const term = termRef.current;
    if (!term || term.options.fontSize === yaziBoyutu) return;
    term.options.fontSize = yaziBoyutu;
    if (kutuRef.current?.offsetParent) {
      try {
        fitRef.current?.fit();
      } catch {
        /* sonraki resize duzeltir */
      }
    }
  }, [yaziBoyutu]);

  // Gizliden gorunure gecerken yeniden olc: display:none iken xterm olcemez.
  useEffect(() => {
    if (!gorunur) return;
    const zaman = setTimeout(() => {
      try {
        fitRef.current?.fit();
        const ws = wsRef.current;
        const term = termRef.current;
        if (ws && term && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ t: 'boyut', cols: term.cols, rows: term.rows }));
        }
        if (!aramaAcik) term?.focus();
      } catch {
        /* olcum basarisiz, sonraki resize duzeltir */
      }
    }, 0);
    return () => clearTimeout(zaman);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gorunur]);

  // Arama metni degisince artimli ara; kapaninca susleme temizlenir, odak terminale doner.
  useEffect(() => {
    const a = aramaRef.current;
    if (!a) return;
    if (!aramaAcik) {
      a.clearDecorations();
      return;
    }
    if (arama) a.findNext(arama, { incremental: true, decorations: ARAMA_SUSLEME });
    else a.clearDecorations();
  }, [arama, aramaAcik]);

  const aramaKapat = () => {
    setAramaAcik(false);
    termRef.current?.focus();
  };
  const sonraki = () => aramaRef.current?.findNext(arama, { decorations: ARAMA_SUSLEME });
  const onceki = () => aramaRef.current?.findPrevious(arama, { decorations: ARAMA_SUSLEME });

  /**
   * Dosya birakma: yol(lar) terminale yazilir, tipki Windows Terminal'e surukler gibi.
   * Claude Code yapistirilan resim yolunu kendisi taniyor; burada yalnizca yol gider.
   * `File.path` yok (Electron 32+); yol preload'daki webUtils'ten geliyor.
   */
  const birak = (e: React.DragEvent) => {
    e.preventDefault();
    setBirakiliyor(false);
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const yollar = [...e.dataTransfer.files]
      .map((d) => window.kokpit.dosyaYolu(d))
      .filter((y) => y.length > 0)
      .map(yolTirnakla);
    if (yollar.length === 0) return;
    ws.send(JSON.stringify({ t: 'veri', d: yollar.join(' ') + ' ' }));
    termRef.current?.focus();
  };

  return (
    <div
      onDragOver={(e) => {
        if (![...e.dataTransfer.types].includes('Files')) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        if (!birakiliyor) setBirakiliyor(true);
      }}
      onDragLeave={(e) => {
        // Cocuk elemanlar arasinda gecis de dragleave uretir; yalnizca kutudan cikinca kapat.
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setBirakiliyor(false);
      }}
      onDrop={birak}
      className={
        (gorunur ? 'block' : 'hidden') +
        ' relative h-full w-full rounded-kontrol ' +
        (birakiliyor ? 'outline-2 outline-dashed outline-aksan/70 -outline-offset-2' : '')
      }
    >
      {aramaAcik && (
        <div
          role="search"
          className="halka absolute top-1 right-3 z-10 flex items-center gap-1 rounded-kontrol bg-yuzey-guclu px-1.5 py-1 shadow-lg shadow-black/40"
        >
          <input
            ref={aramaKutuRef}
            type="text"
            value={arama}
            onChange={(e) => setArama(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                if (e.shiftKey) onceki();
                else sonraki();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                aramaKapat();
              }
            }}
            placeholder="Terminalde ara"
            aria-label="Terminalde ara"
            spellCheck={false}
            className="enstruman w-48 bg-transparent px-1.5 text-xs text-metin outline-none placeholder:text-metin-soluk"
          />
          <button
            type="button"
            onClick={onceki}
            aria-label="Önceki eşleşme (Shift+Enter)"
            title="Önceki (Shift+Enter)"
            className="cursor-pointer rounded p-0.5 text-metin-soluk hover:text-metin"
          >
            <ChevronUp className="size-3.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={sonraki}
            aria-label="Sonraki eşleşme (Enter)"
            title="Sonraki (Enter)"
            className="cursor-pointer rounded p-0.5 text-metin-soluk hover:text-metin"
          >
            <ChevronDown className="size-3.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={aramaKapat}
            aria-label="Aramayı kapat (Escape)"
            title="Kapat (Escape)"
            className="cursor-pointer rounded p-0.5 text-metin-soluk hover:text-metin"
          >
            <X className="size-3.5" aria-hidden="true" />
          </button>
        </div>
      )}
      <div ref={kutuRef} className="h-full w-full overflow-hidden" />
    </div>
  );
}
