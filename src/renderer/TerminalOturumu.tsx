import { useEffect, useRef, useState } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import type { OturumDurumu } from './types';

interface Props {
  id: string;
  yol: string;
  gorunur: boolean;
  onDurum: (id: string, durumu: OturumDurumu, mesaj?: string) => void;
}

/**
 * Bir PTY oturumu. KRITIK: bu bilesen oturum kapatilana kadar UNMOUNT EDILMEZ.
 * Gorunmedigi zaman gizlenir, sokulmez — yoksa Pano'ya her bakista WS kapanir,
 * PTY olur ve calisan claude oturumu kaybolur. Oturum listesi App'te yasar.
 */
/** Bosluk/tirnak iceren yol kabuga tek arguman olarak gitsin (Windows Terminal de boyle yapar). */
function yolTirnakla(yol: string) {
  return /[\s"']/.test(yol) ? '"' + yol.replace(/"/g, '\\"') + '"' : yol;
}

export default function TerminalOturumu({ id, yol, gorunur, onDurum }: Props) {
  const kutuRef = useRef<HTMLDivElement>(null);
  const [birakiliyor, setBirakiliyor] = useState(false);
  const termRef = useRef<XTerm | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const onDurumRef = useRef(onDurum);
  onDurumRef.current = onDurum;

  useEffect(() => {
    const kutu = kutuRef.current;
    if (!kutu) return;
    let kapandi = false;

    const term = new XTerm({
      fontFamily: "'JetBrains Mono Variable', ui-monospace, Consolas, monospace",
      fontSize: 13,
      lineHeight: 1.2,
      cursorBlink: true,
      allowProposedApi: true,
      scrollback: 5000,
      // Terminal BILEREK opak (DESIGN.md: "cam degil, delik").
      theme: {
        background: '#06080F',
        foreground: '#e9edf4',
        cursor: '#9cc4e4',
        cursorAccent: '#06080F',
        selectionBackground: 'rgba(156,196,228,0.26)',
      },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);

    // Uygulamanin kendi kisayollari xterm'e ULASMAZ; yoksa hem claude'a kontrol karakteri
    // gider hem uygulama tepki verir (xterm keydown'i stopPropagation yapmaz, olculdu).
    // Ctrl+B bilerek listede DEGIL: Claude Code onu kullaniyor, terminal odaktayken onun.
    term.attachCustomKeyEventHandler((e) => {
      if (!e.ctrlKey || e.altKey) return true;
      if (e.key === '1' || e.key === '2') return false;
      if (e.shiftKey && (e.key === 'W' || e.key === 'w')) return false;
      return true;
    });

    term.open(kutu);
    termRef.current = term;
    fitRef.current = fit;

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

      ws.onopen = () => {
        ws.send(
          JSON.stringify({ t: 'ac', cwd: yol, komut: 'claude', cols: term.cols, rows: term.rows })
        );
      };
      ws.onmessage = (ev) => {
        const m = JSON.parse(ev.data as string);
        if (m.t === 'hazir') {
          onDurumRef.current(id, 'acik');
          if (gorunur) term.focus();
        } else if (m.t === 'veri') term.write(m.d);
        else if (m.t === 'bitti') {
          onDurumRef.current(id, 'bitti', 'Oturum kapandı (çıkış kodu ' + m.kod + ')');
        } else if (m.t === 'hata') onDurumRef.current(id, 'hata', m.mesaj);
      };
      ws.onerror = () => {
        if (!kapandi) onDurumRef.current(id, 'hata', 'Terminal sunucusuna bağlanılamadı');
      };
      ws.onclose = () => {
        if (!kapandi) onDurumRef.current(id, 'bitti');
      };

      term.onData((d) => {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ t: 'veri', d }));
      });
    })();

    return () => {
      kapandi = true;
      gozlemci.disconnect();
      if (olcumKaresi) cancelAnimationFrame(olcumKaresi);
      try {
        wsRef.current?.close();
      } catch {
        /* zaten kapali */
      }
      term.dispose();
      termRef.current = null;
    };
    // id/yol degismez; oturum bir kez kurulur ve kapatilana kadar yasar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        term?.focus();
      } catch {
        /* olcum basarisiz, sonraki resize duzeltir */
      }
    }, 0);
    return () => clearTimeout(zaman);
  }, [gorunur]);

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
        ' h-full w-full rounded-kontrol ' +
        (birakiliyor ? 'outline-2 outline-dashed outline-aksan/70 -outline-offset-2' : '')
      }
    >
      <div ref={kutuRef} className="h-full w-full overflow-hidden" />
    </div>
  );
}
