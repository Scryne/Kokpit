import { useEffect, useRef } from 'react';
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
export default function TerminalOturumu({ id, yol, gorunur, onDurum }: Props) {
  const kutuRef = useRef<HTMLDivElement>(null);
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
    term.open(kutu);
    termRef.current = term;
    fitRef.current = fit;

    const boyutGonder = () => {
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ t: 'boyut', cols: term.cols, rows: term.rows }));
      }
    };

    const gozlemci = new ResizeObserver(() => {
      // Gizliyken olcum 0 doner ve satir sayisi bozulur.
      if (!kutu.offsetParent) return;
      try {
        fit.fit();
        boyutGonder();
      } catch {
        /* olcum sirasinda gizlenmis olabilir */
      }
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

  return (
    <div className={(gorunur ? 'block' : 'hidden') + ' h-full w-full'}>
      <div ref={kutuRef} className="h-full w-full overflow-hidden" />
    </div>
  );
}
