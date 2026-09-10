import { useCallback, useEffect, useRef, useState } from 'react';
import type { Durum, Proje } from './types';
import Terminal from './Terminal';

// durum.py her cagrida ~500 ms'lik bir Python sureci demek. Iki koruma:
// - ayni anda tek istek (StrictMode'un cift effect'ini de yutar)
// - odak olayi bu araliktan sik tazeleyemez (alt-tab firtinasi)
const ODAK_ASGARI_ARALIK_MS = 30_000;

const ASAMA_SIRA = ['fikir', 'denetim', 'finalizasyon', 'roadmap', 'uygulama', 'tamamlandi'];

function asamaRengi(asama: Proje['asama']) {
  if (!asama) return 'text-amber-300/90 bg-amber-400/10 border-amber-300/25';
  if (asama === 'tamamlandi') return 'text-emerald-300 bg-emerald-400/10 border-emerald-300/25';
  if (asama === 'uygulama') return 'text-violet-200 bg-violet-400/15 border-violet-300/30';
  return 'text-sky-200 bg-sky-400/10 border-sky-300/25';
}

function gunMetni(gun: number | null | undefined) {
  if (gun === null || gun === undefined) return null;
  if (gun === 0) return 'bugün';
  if (gun === 1) return 'dün';
  return gun + ' gün önce';
}

function ProjeKarti({ p, onBaslat }: { p: Proje; onBaslat: (p: Proje) => void }) {
  const r = p.roadmap;
  const yuzde = r && r.toplam > 0 ? Math.round((r.tamamlandi / r.toplam) * 100) : 0;
  const g = p.git;

  return (
    <article className="relative rounded-2xl border border-white/10 bg-white/[0.055] p-5 backdrop-blur-xl shadow-[0_1px_0_0_rgb(255_255_255/0.08)_inset]">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-white/95">{p.ad}</h2>
          {r?.sirada && (
            <p className="mt-1 text-sm text-white/55">
              Sırada: Faz {r.sirada.no} — {r.sirada.ad}
            </p>
          )}
        </div>
        <span className={'shrink-0 rounded-full border px-2.5 py-1 text-xs ' + asamaRengi(p.asama)}>
          {p.asama ?? 'sistem dışı'}
        </span>
      </header>

      {r && r.toplam > 0 && (
        <div className="mt-4">
          <div className="flex items-baseline justify-between text-xs text-white/50">
            <span>Roadmap</span>
            <span className="tabular-nums">
              {r.tamamlandi}/{r.toplam} faz
            </span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-gradient-to-r from-violet-400 to-sky-400"
              style={{ width: yuzde + '%' }}
            />
          </div>
        </div>
      )}

      {g && (
        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <div>
            <dt className="text-xs text-white/45">Branch</dt>
            <dd className="text-white/80">{g.branch ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-xs text-white/45">Çalışma alanı</dt>
            <dd className={g.kirli > 0 ? 'text-amber-300' : 'text-emerald-300/90'}>
              {g.kirli > 0 ? g.kirli + ' dosya kirli' : 'temiz'}
            </dd>
          </div>
          <div className="col-span-2">
            <dt className="text-xs text-white/45">Son commit</dt>
            <dd className="truncate text-white/70" title={g.son_commit ?? undefined}>
              {g.son_commit ?? '—'}
              {gunMetni(g.son_commit_gun) && (
                <span className="text-white/40"> · {gunMetni(g.son_commit_gun)}</span>
              )}
            </dd>
          </div>
        </dl>
      )}

      <footer className="mt-5 flex items-center gap-2">
        <button
          type="button"
          onClick={() => onBaslat(p)}
          title={p.yol + ' klasöründe claude oturumu açar'}
          className="rounded-lg border border-violet-300/30 bg-violet-400/15 px-3.5 py-2 text-sm font-medium text-violet-100 hover:bg-violet-400/25"
        >
          Başlat
        </button>
        <button
          type="button"
          onClick={() => window.kokpit.klasorAc(p.yol)}
          className="rounded-lg border border-white/10 px-3.5 py-2 text-sm text-white/70 hover:bg-white/10 hover:text-white/90"
        >
          Klasörü aç
        </button>
      </footer>
    </article>
  );
}

export default function App() {
  const [durum, setDurum] = useState<Durum | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [terminalProje, setTerminalProje] = useState<Proje | null>(null);

  const ucusta = useRef(false);
  const sonOkuma = useRef(0);

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

  const siraliProjeler = durum
    ? [...durum.projeler].sort((a, b) => {
        const ai = a.asama ? ASAMA_SIRA.indexOf(a.asama) : -1;
        const bi = b.asama ? ASAMA_SIRA.indexOf(b.asama) : -1;
        return bi - ai || a.ad.localeCompare(b.ad, 'tr');
      })
    : [];

  // Faz 2: tek terminal. Sekmeler Faz 4'un isi.
  if (terminalProje) {
    return (
      <>
        <div className="zemin-mesh" />
        <div className="relative z-10 h-dvh p-6">
          <Terminal
            ad={terminalProje.ad}
            yol={terminalProje.yol}
            onKapat={() => setTerminalProje(null)}
          />
        </div>
      </>
    );
  }

  return (
    <>
      <div className="zemin-mesh" />
      <div className="relative z-10 mx-auto max-w-6xl px-6 py-8">
        <header className="mb-8 flex items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-white">Kokpit</h1>
            <p className="mt-1 text-sm text-white/50">
              {durum
                ? durum.projeler.length +
                  ' proje · ölçüldü ' +
                  new Date(durum.olculdu).toLocaleTimeString('tr-TR')
                : 'durum okunuyor…'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void tazele('elle')}
            disabled={yukleniyor}
            className="rounded-lg border border-white/15 bg-white/[0.08] px-4 py-2 text-sm text-white/85 backdrop-blur-xl hover:bg-white/[0.14] disabled:opacity-50"
          >
            {yukleniyor ? 'Okunuyor…' : 'Tazele'}
          </button>
        </header>

        {hata && (
          <div className="mb-6 rounded-xl border border-red-400/30 bg-red-500/10 p-4 text-sm text-red-200">
            <p className="font-medium">Durum okunamadı.</p>
            <pre className="mt-2 whitespace-pre-wrap text-xs text-red-200/80">{hata}</pre>
          </div>
        )}

        <section className="grid gap-4 sm:grid-cols-2">
          {siraliProjeler.map((p) => (
            <ProjeKarti key={p.ad} p={p} onBaslat={setTerminalProje} />
          ))}
        </section>

        {durum && (
          <section className="mt-8 rounded-2xl border border-white/10 bg-white/[0.04] p-5 backdrop-blur-xl">
            <h2 className="text-sm font-medium text-white/80">Beyin</h2>
            <div className="mt-3 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
              <div>
                <div className="text-xs text-white/45">Son log</div>
                <div className="text-white/80">
                  {durum.beyin.son_log ?? '—'}
                  <span className="text-white/40"> · {gunMetni(durum.beyin.son_log_gun) ?? '—'}</span>
                </div>
              </div>
              <div>
                <div className="text-xs text-white/45">Derleyici</div>
                <div className="text-white/80">{durum.beyin.derleyici_son_durum ?? '—'}</div>
              </div>
              <div>
                <div className="text-xs text-white/45">Bilgi tabanı</div>
                <div className="tabular-nums text-white/80">
                  {durum.beyin.makale} makale · {durum.beyin.baglanti} bağlantı
                </div>
              </div>
              <div>
                <div className="text-xs text-white/45">Açık thread</div>
                <div className="tabular-nums text-white/80">{durum.beyin.threads?.length ?? 0}</div>
              </div>
            </div>
          </section>
        )}
      </div>
    </>
  );
}
