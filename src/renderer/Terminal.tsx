import { useEffect, useRef, useState } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

type Durumu = 'baglaniyor' | 'acik' | 'bitti' | 'hata';

interface Props {
  ad: string;
  yol: string;
  onKapat: () => void;
}

export default function Terminal({ ad, yol, onKapat }: Props) {
  const kutuRef = useRef<HTMLDivElement>(null);
  const [durumu, setDurumu] = useState<Durumu>('baglaniyor');
  const [mesaj, setMesaj] = useState<string | null>(null);
  const [baslangic] = useState(() => Date.now());
  const [gecen, setGecen] = useState(0);

  useEffect(() => {
    const sayac = setInterval(() => setGecen(Math.floor((Date.now() - baslangic) / 1000)), 1000);
    return () => clearInterval(sayac);
  }, [baslangic]);

  useEffect(() => {
    const kutu = kutuRef.current;
    if (!kutu) return;

    let ws: WebSocket | null = null;
    let kapandi = false;

    const term = new XTerm({
      fontFamily: 'ui-monospace, Consolas, "Cascadia Mono", monospace',
      fontSize: 13,
      lineHeight: 1.2,
      cursorBlink: true,
      allowProposedApi: true,
      // Cam panelin arkasi gorunsun diye: seffaf zemin acikca istenmeli.
      allowTransparency: true,
      theme: {
        background: 'rgba(0,0,0,0)',
        foreground: '#d6d3e8',
        cursor: '#c4b5fd',
        selectionBackground: 'rgba(139,124,246,0.35)',
      },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(kutu);
    fit.fit();

    const boyutGonder = () => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ t: 'boyut', cols: term.cols, rows: term.rows }));
      }
    };

    const gozlemci = new ResizeObserver(() => {
      try { fit.fit(); boyutGonder(); } catch { /* olcum sirasinda gizlenmis olabilir */ }
    });
    gozlemci.observe(kutu);

    void (async () => {
      const sonuc = await window.kokpit.ptyBilgi();
      if (kapandi) return;
      if (!sonuc.bilgi) {
        setDurumu('hata');
        setMesaj(sonuc.hata ?? 'PTY sunucusu başlatılamadı');
        return;
      }

      const { port, token } = sonuc.bilgi;
      ws = new WebSocket('ws://127.0.0.1:' + port + '/?token=' + token);

      ws.onopen = () => {
        ws?.send(
          JSON.stringify({ t: 'ac', cwd: yol, komut: 'claude', cols: term.cols, rows: term.rows })
        );
      };
      ws.onmessage = (ev) => {
        const m = JSON.parse(ev.data as string);
        if (m.t === 'hazir') { setDurumu('acik'); term.focus(); }
        else if (m.t === 'veri') term.write(m.d);
        else if (m.t === 'bitti') {
          setDurumu('bitti');
          setMesaj('Oturum kapandı (çıkış kodu ' + m.kod + ')');
        } else if (m.t === 'hata') { setDurumu('hata'); setMesaj(m.mesaj); }
      };
      ws.onerror = () => { if (!kapandi) { setDurumu('hata'); setMesaj('Terminal sunucusuna bağlanılamadı'); } };
      ws.onclose = () => { if (!kapandi) setDurumu((d) => (d === 'acik' ? 'bitti' : d)); };

      term.onData((d) => {
        if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ t: 'veri', d }));
      });
    })();

    return () => {
      kapandi = true;
      gozlemci.disconnect();
      try { ws?.close(); } catch { /* zaten kapali */ }
      term.dispose();
    };
  }, [yol]);

  const sure =
    gecen < 60 ? gecen + ' sn' : Math.floor(gecen / 60) + ' dk ' + (gecen % 60) + ' sn';

  return (
    <div className="flex h-full flex-col">
      <header className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onKapat}
            className="rounded-lg border border-white/10 px-3 py-1.5 text-sm text-white/70 hover:bg-white/10 hover:text-white/90"
          >
            ← Pano
          </button>
          <div>
            <h2 className="text-base font-semibold text-white/95">{ad}</h2>
            <p className="text-xs text-white/45">{yol}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span
            className={
              'inline-block size-2 rounded-full ' +
              (durumu === 'acik'
                ? 'bg-emerald-400'
                : durumu === 'baglaniyor'
                  ? 'animate-pulse bg-amber-300'
                  : durumu === 'hata'
                    ? 'bg-red-400'
                    : 'bg-white/30')
            }
          />
          <span className="text-white/60">
            {durumu === 'acik'
              ? sure + ' açık'
              : durumu === 'baglaniyor'
                ? 'bağlanıyor…'
                : durumu === 'hata'
                  ? 'hata'
                  : 'kapandı'}
          </span>
        </div>
      </header>

      {mesaj && (
        <p
          className={
            'mb-2 rounded-lg border px-3 py-2 text-xs ' +
            (durumu === 'hata'
              ? 'border-red-400/30 bg-red-500/10 text-red-200'
              : 'border-white/10 bg-white/5 text-white/60')
          }
        >
          {mesaj}
        </p>
      )}

      <div className="min-h-0 flex-1 overflow-hidden rounded-2xl border border-white/10 bg-black/45 p-3 backdrop-blur-xl">
        <div ref={kutuRef} className="h-full w-full" />
      </div>
    </div>
  );
}
