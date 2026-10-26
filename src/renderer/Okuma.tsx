import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Markdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ArrowLeft, CheckCheck, ExternalLink, RefreshCw, Search, Sun } from 'lucide-react';
import type { OkumaBolumu, OkumaTema, Proje, ProjeOzeti, VaultNotu } from './types';
import { AsamaRozeti, Ilerleme, envanterMetni } from './parcalar';
import {
  baglantiHedefleri,
  onbilgiAyir,
  rehypeBasliklar,
  remarkWiki,
  slug,
  urlSuzgeci,
  zamanMetni,
  type BaslikOgesi,
} from './okuma-md';

// Okuma sayfasi (v2.9): vault'un dar kesimini (Companion, daily, knowledge, proje notlari) okuma
// dostu gosterir. Salt okur; yazdigi tek sey "bu notu okudum" (main, ~/.kokpit/okuma.json).
// Dosya izleyici yok (A-04): sayfa gorununce, pencere odaga gelince ve elle tazelenir.

const BOLUMLER: { id: OkumaBolumu; ad: string }[] = [
  { id: 'akis', ad: 'Akış' },
  { id: 'companion', ad: 'Companion' },
  { id: 'gunluk', ad: 'Günlük' },
  { id: 'bilgi', ad: 'Bilgi' },
  { id: 'projeler', ad: 'Projeler' },
];

interface AcikNot {
  yol: string;
  ham: string;
  mtime: number;
  baslik: string;
}

/** Geri yigininda bir konum; yol null = Projeler ozeti. */
interface Konum {
  yol: string | null;
  kaydirma: number;
}

type Cozum = { yol: string; cipa: string | null } | null;

interface Props {
  /** Sayfa gorunur mu (gizliyken okuma ve odak tazelemesi yapilmaz). */
  aktif: boolean;
  tema: OkumaTema;
  onTema: (t: OkumaTema) => void;
  /** durum.py projeleri: proje ozetinde asama ve roadmap icin. */
  projeler: Proje[];
  onOkunmamis: (n: number) => void;
  /** Disaridan bolum acma istegi (Pano'daki "okunmamis" satiri); n her istekte artar. */
  istek: { bolum: OkumaBolumu; n: number } | null;
}

function cozumAnahtari(s: string) {
  try {
    return decodeURIComponent(s).trim();
  } catch {
    return s.trim();
  }
}

/** Daily dosyalarinin basligi "Günlük Log: 2026-10-16" yerine okunur tarih. */
function listeBasligi(n: VaultNotu) {
  const m = /^daily\/(\d{4})-(\d{2})-(\d{2})\.md$/.exec(n.yol);
  if (!m) return n.baslik;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', weekday: 'long' });
}

/** Vault klasor adlarindaki emoji arayuze basilmaz (DESIGN.md: emoji yasak). */
function yolMetni(yol: string) {
  return yol
    .replace(/\.md$/, '')
    .replace(/[\p{Extended_Pictographic}\uFE0F]\s*/gu, '');
}

function OkunmamisNokta({ var: varMi }: { var: boolean }) {
  return varMi ? (
    <span className="mt-[0.45rem] size-1.5 shrink-0 rounded-full bg-aksan">
      <span className="sr-only">okunmamış</span>
    </span>
  ) : (
    <span className="mt-[0.45rem] size-1.5 shrink-0" aria-hidden="true" />
  );
}

export default function Okuma({ aktif, tema, onTema, projeler, onOkunmamis, istek }: Props) {
  const [bolum, setBolum] = useState<OkumaBolumu>('akis');
  const [notlar, setNotlar] = useState<VaultNotu[] | null>(null);
  const [ozetler, setOzetler] = useState<ProjeOzeti[] | null>(null);
  const [acik, setAcik] = useState<AcikNot | null>(null);
  const [gecmis, setGecmis] = useState<Konum[]>([]);
  const [filtre, setFiltre] = useState('');
  const [cozumler, setCozumler] = useState<Record<string, Cozum>>({});
  const [basliklar, setBasliklar] = useState<BaslikOgesi[]>([]);
  const [okunmamis, setOkunmamis] = useState(0);
  const [uyari, setUyari] = useState<string | null>(null);
  const [yukleniyor, setYukleniyor] = useState(false);

  const makaleRef = useRef<HTMLDivElement>(null);
  // Bekleyen kaydirma: not ya da ozet cizilince baslik kimligine ya da (geri donuste) eski
  // konuma gidilir. Bekleyen yoksa dokunulmaz: odakta tazeleme okuma yerini sifirlamasin.
  const hedefRef = useRef<{ cipa: string | null; kaydirma: number } | null>(null);
  const basliklarRef = useRef<BaslikOgesi[]>([]);
  const yuklemeNo = useRef(0);
  const onOkunmamisRef = useRef(onOkunmamis);
  onOkunmamisRef.current = onOkunmamis;

  useEffect(() => {
    if (!uyari) return;
    const t = setTimeout(() => setUyari(null), 5000);
    return () => clearTimeout(t);
  }, [uyari]);

  const sayiYenile = useCallback(async () => {
    const n = await window.kokpit.vaultOkunmamis();
    setOkunmamis(n);
    onOkunmamisRef.current(n);
  }, []);

  const listeYukle = useCallback(
    async (b: OkumaBolumu) => {
      const no = ++yuklemeNo.current;
      setYukleniyor(true);
      try {
        if (b === 'projeler') {
          const o = await window.kokpit.vaultProjeler();
          if (no === yuklemeNo.current) setOzetler(o);
        } else {
          const l = b === 'akis' ? await window.kokpit.vaultAkis(60) : await window.kokpit.vaultListe(b);
          if (no === yuklemeNo.current) setNotlar(l);
        }
        await sayiYenile();
      } finally {
        if (no === yuklemeNo.current) setYukleniyor(false);
      }
    },
    [sayiYenile]
  );

  const tazele = useCallback(async () => {
    await window.kokpit.vaultTazele();
    await listeYukle(bolum);
  }, [bolum, listeYukle]);

  // Gorunur oldugunda ve bolum degisince oku; gorunurken pencere odaga gelince tazele.
  useEffect(() => {
    if (!aktif) return;
    void tazele();
    const odak = () => void tazele();
    window.addEventListener('focus', odak);
    return () => window.removeEventListener('focus', odak);
  }, [aktif, tazele]);

  // Okunmamis sayisi sayfa gizliyken de lazim (nav rozeti, Pano): acilista bir kez.
  useEffect(() => {
    void sayiYenile();
  }, [sayiYenile]);

  const okunduIsaretle = useCallback(
    (yol: string) => {
      const sondur = (n: VaultNotu) => (n.yol === yol ? { ...n, okunmamis: false } : n);
      setNotlar((l) => l && l.map(sondur));
      setOzetler((l) => l && l.map((p) => ({ ...p, notlar: p.notlar.map(sondur) })));
      void sayiYenile();
    },
    [sayiYenile]
  );

  const notAc = useCallback(
    async (yol: string, cipa: string | null = null, gecmiseEkle = true, kaydirma = 0) => {
      const r = await window.kokpit.vaultOku(yol);
      if (r.hata !== undefined) {
        setUyari(r.hata);
        return;
      }
      if (gecmiseEkle) {
        const simdiki: Konum | null = acik
          ? { yol: acik.yol, kaydirma: makaleRef.current?.scrollTop ?? 0 }
          : bolum === 'projeler'
            ? { yol: null, kaydirma: makaleRef.current?.scrollTop ?? 0 }
            : null;
        if (simdiki && simdiki.yol !== r.yol) setGecmis((g) => [...g.slice(-30), simdiki]);
      }
      hedefRef.current = { cipa, kaydirma };
      setAcik({ yol: r.yol, ham: r.ham, mtime: r.mtime, baslik: r.baslik });

      // Baglantilar onceden cozulur: okuma alaninda olmayan hedef soluk metin olarak cizilir.
      const hedefler = baglantiHedefleri(onbilgiAyir(r.ham).govde);
      void Promise.all(hedefler.map((h) => window.kokpit.vaultCozumle(h, r.yol).then((c) => [cozumAnahtari(h), c] as const))).then(
        (ciftler) => setCozumler(Object.fromEntries(ciftler))
      );
      if (r.okunmamis) {
        await window.kokpit.vaultOkundu(r.yol, r.mtime);
        okunduIsaretle(r.yol);
      }
    },
    [acik, bolum, okunduIsaretle]
  );

  const geri = useCallback(() => {
    const son = gecmis[gecmis.length - 1];
    if (!son) return;
    setGecmis((g) => g.slice(0, -1));
    if (son.yol === null) {
      hedefRef.current = { cipa: null, kaydirma: son.kaydirma };
      setAcik(null);
      setBolum('projeler');
    } else {
      void notAc(son.yol, null, false, son.kaydirma);
    }
  }, [gecmis, notAc]);

  // Alt+Sol: geri (tarayici gibi). Yalniz sayfa gorunurken.
  useEffect(() => {
    if (!aktif) return;
    const tus = (e: KeyboardEvent) => {
      if (e.altKey && e.key === 'ArrowLeft') {
        e.preventDefault();
        geri();
      }
    };
    window.addEventListener('keydown', tus);
    return () => window.removeEventListener('keydown', tus);
  }, [aktif, geri]);

  const bolumSec = useCallback(
    (b: OkumaBolumu) => {
      setFiltre('');
      if (b !== bolum) setNotlar(null);
      setBolum(b);
      // Projeler bolumu okuma sutununda ozeti gosterir; acik not geri yigininda kalir.
      if (b === 'projeler' && acik) {
        setGecmis((g) => [...g.slice(-30), { yol: acik.yol, kaydirma: makaleRef.current?.scrollTop ?? 0 }]);
        hedefRef.current = { cipa: null, kaydirma: 0 };
        setAcik(null);
      }
    },
    [acik, bolum]
  );

  const sonIstek = useRef(0);
  useEffect(() => {
    if (!istek || istek.n === sonIstek.current) return;
    sonIstek.current = istek.n;
    bolumSec(istek.bolum);
  }, [istek, bolumSec]);

  const kaydir = (id: string) => {
    const el = makaleRef.current?.querySelector<HTMLElement>('#' + CSS.escape(id));
    el?.scrollIntoView({ block: 'start' });
  };

  const baglantiAc = useCallback(
    async (hedef: string) => {
      if (!acik) return;
      const anahtar = cozumAnahtari(hedef);
      const c = anahtar in cozumler ? cozumler[anahtar] : await window.kokpit.vaultCozumle(hedef, acik.yol);
      if (!c) {
        setUyari('Bu not okuma alanında değil: ' + anahtar);
        return;
      }
      if (c.yol === acik.yol) {
        if (c.cipa) kaydir(slug(c.cipa));
        return;
      }
      void notAc(c.yol, c.cipa);
    },
    [acik, cozumler, notAc]
  );

  const onbilgi = useMemo(() => (acik ? onbilgiAyir(acik.ham) : null), [acik]);
  const rehypeEklentileri = useMemo(
    () => [[rehypeBasliklar, { toplayici: (b: BaslikOgesi[]) => (basliklarRef.current = b) }]] as never,
    []
  );
  const remarkEklentileri = useMemo(() => [remarkGfm, remarkWiki] as never, []);

  const bilesenler = useMemo<Components>(
    () => ({
      a: ({ href, children }) => {
        if (!href) return <span>{children}</span>;
        if (/^(https?:|mailto:)/i.test(href)) {
          return (
            <a
              href={href}
              title={href}
              onClick={(e) => {
                e.preventDefault();
                void window.kokpit.linkAc(href);
              }}
            >
              {children}
              <ExternalLink className="ml-0.5 inline size-3 align-baseline opacity-70" aria-hidden="true" />
            </a>
          );
        }
        if (href.startsWith('#')) {
          return (
            <a
              href={href}
              onClick={(e) => {
                e.preventDefault();
                kaydir(slug(cozumAnahtari(href.slice(1))));
              }}
            >
              {children}
            </a>
          );
        }
        const hedef = href.startsWith('wiki:') ? href.slice(5) : href;
        const anahtar = cozumAnahtari(hedef);
        if (anahtar in cozumler && cozumler[anahtar] === null) {
          return (
            <span className="kirik-link" title={'Okuma alanında yok: ' + anahtar}>
              {children}
            </span>
          );
        }
        return (
          <a
            href={'#' + anahtar}
            onClick={(e) => {
              e.preventDefault();
              void baglantiAc(hedef);
            }}
          >
            {children}
          </a>
        );
      },
      table: ({ children }) => (
        <div className="okuma-tablo">
          <table>{children}</table>
        </div>
      ),
      img: ({ alt }) => <span className="text-sm text-metin-soluk">[görsel: {alt || 'adsız'}]</span>,
    }),
    [cozumler, baglantiAc]
  );

  const gorunenNotlar = useMemo(() => {
    if (!notlar) return null;
    const f = filtre.trim().toLocaleLowerCase('tr-TR');
    return f ? notlar.filter((n) => listeBasligi(n).toLocaleLowerCase('tr-TR').includes(f)) : notlar;
  }, [notlar, filtre]);

  const projeSiralisi = useMemo(() => {
    if (!ozetler) return null;
    const sonEtkinlik = (p: ProjeOzeti) =>
      Math.max(
        p.sonOturum ? new Date(p.sonOturum.tarih + 'T' + p.sonOturum.saat.padStart(5, '0')).getTime() : 0,
        p.notlar[0]?.mtime ?? 0
      );
    return ozetler
      .filter((p) => p.sonOturum || p.notlar.length > 0)
      .map((p) => ({ p, son: sonEtkinlik(p) }))
      .sort((a, b) => b.son - a.son);
  }, [ozetler]);

  // Acilan not ya da ozet cizildikten sonra: basliklari al, bekleyen kaydirmayi uygula.
  useEffect(() => {
    setBasliklar(
      acik
        ? basliklarRef.current
        : bolum === 'projeler' && projeSiralisi
          ? projeSiralisi.map(({ p }) => ({ id: slug('proje-' + p.ad), metin: p.ad, seviye: 2 }))
          : []
    );
    const bekleyen = hedefRef.current;
    const kap = makaleRef.current;
    if (!bekleyen || !kap) return;
    if (bekleyen.cipa) {
      const el = kap.querySelector<HTMLElement>('#' + CSS.escape(slug(bekleyen.cipa)));
      if (el) {
        hedefRef.current = null;
        el.scrollIntoView({ block: 'start' });
        return;
      }
      if (!acik && bolum === 'projeler' && !projeSiralisi) return; // ozet henuz gelmedi
    }
    hedefRef.current = null;
    kap.scrollTop = bekleyen.kaydirma;
  }, [acik, bolum, projeSiralisi]);

  const acikTema = tema === 'acik';
  const bolumAdi = BOLUMLER.find((b) => b.id === bolum)?.ad ?? '';
  const govdedeH1 = onbilgi ? /^#\s/m.test(onbilgi.govde) : false;
  const etiketler = onbilgi?.alanlar.tags;
  const tarihAlani = onbilgi
    ? (onbilgi.alanlar.updated ?? onbilgi.alanlar.modified ?? onbilgi.alanlar.created)
    : undefined;

  let liste: ReactNode;
  if (bolum === 'projeler') {
    liste = !projeSiralisi ? (
      <p className="px-3 py-2 text-sm text-metin-soluk">Okunuyor…</p>
    ) : (
      <ul className="space-y-0.5">
        {projeSiralisi.map(({ p, son }) => (
          <li key={p.ad}>
            <button
              type="button"
              onClick={() => {
                if (acik) {
                  hedefRef.current = { cipa: 'proje-' + p.ad, kaydirma: 0 };
                  setAcik(null);
                } else kaydir(slug('proje-' + p.ad));
              }}
              className="flex w-full cursor-pointer items-baseline gap-2 rounded-kontrol px-3 py-2 text-left transition-colors duration-[120ms] hover:bg-yuzey-guclu"
            >
              <span className="enstruman min-w-0 flex-1 truncate text-sm text-metin">{p.ad}</span>
              <span className="enstruman shrink-0 text-xs text-metin-soluk">{son ? zamanMetni(son) : ''}</span>
            </button>
          </li>
        ))}
      </ul>
    );
  } else if (!gorunenNotlar) {
    liste = <p className="px-3 py-2 text-sm text-metin-soluk">Okunuyor…</p>;
  } else if (gorunenNotlar.length === 0) {
    liste = (
      <p className="px-3 py-2 text-sm text-metin-soluk">
        {filtre ? 'Bu başlıkla not yok.' : 'Bu bölümde not yok.'}
      </p>
    );
  } else {
    const ogeler: ReactNode[] = [];
    let sonGrup = '';
    for (const n of gorunenNotlar) {
      if (bolum !== 'akis' && n.grup !== sonGrup) {
        sonGrup = n.grup;
        ogeler.push(
          <li key={'g-' + n.grup} className="etiket px-3 pt-4 pb-1 first:pt-1">
            {n.grup}
          </li>
        );
      }
      const secili = acik?.yol === n.yol;
      ogeler.push(
        <li key={n.yol}>
          <button
            type="button"
            onClick={() => void notAc(n.yol)}
            aria-current={secili ? 'true' : undefined}
            className={
              'flex w-full cursor-pointer items-start gap-2 rounded-kontrol px-3 py-2 text-left transition-colors duration-[120ms] ' +
              (secili ? 'bg-yuzey-guclu' : 'hover:bg-yuzey-guclu')
            }
          >
            <OkunmamisNokta var={n.okunmamis} />
            <span className="min-w-0 flex-1">
              <span className={'line-clamp-2 text-sm ' + (n.okunmamis || secili ? 'text-metin' : 'text-metin-ikincil')}>
                {listeBasligi(n)}
              </span>
              <span className="mt-0.5 block text-xs text-metin-soluk">
                {bolum === 'akis' && n.grup ? n.grup + ' · ' : ''}
                {/* Gunlukte tarih basliktadir; altta yalniz son yazim saati. */}
                <span className="enstruman">
                  {bolum === 'gunluk'
                    ? 'son kayıt ' + new Date(n.mtime).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
                    : zamanMetni(n.mtime)}
                </span>
              </span>
            </span>
          </button>
        </li>
      );
    }
    liste = <ul className="space-y-0.5">{ogeler}</ul>;
  }

  let icerik: ReactNode;
  if (acik && onbilgi) {
    icerik = (
      <>
        <div className="mb-6 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-metin-soluk">
          {gecmis.length > 0 && (
            <button
              type="button"
              onClick={geri}
              title="Geri (Alt+Sol)"
              className="inline-flex cursor-pointer items-center gap-1 rounded-kontrol border border-kenar px-2 py-1 text-metin-ikincil transition-colors duration-[120ms] hover:border-kenar-guclu hover:text-metin"
            >
              <ArrowLeft className="size-3.5" aria-hidden="true" />
              Geri
            </button>
          )}
          <span className="enstruman min-w-0 truncate" title={yolMetni(acik.yol)}>
            {yolMetni(acik.yol)}
          </span>
          <span>
            değişti <span className="enstruman">{zamanMetni(acik.mtime)}</span>
          </span>
          {typeof onbilgi.alanlar.type === 'string' && <span>{onbilgi.alanlar.type}</span>}
        </div>
        <div className="okuma-metin">
          {!govdedeH1 && <h1>{acik.baslik}</h1>}
          <Markdown
            remarkPlugins={remarkEklentileri}
            rehypePlugins={rehypeEklentileri}
            components={bilesenler}
            urlTransform={urlSuzgeci}
          >
            {onbilgi.govde}
          </Markdown>
        </div>
        {(Array.isArray(etiketler) && etiketler.length > 0) || typeof tarihAlani === 'string' ? (
          <div className="mt-10 flex flex-wrap items-center gap-2 border-t border-kenar pt-4 text-xs text-metin-soluk">
            {Array.isArray(etiketler) &&
              etiketler.map((t) => (
                <span key={t} className="rounded-rozet border border-kenar px-2 py-0.5">
                  {t}
                </span>
              ))}
            {typeof tarihAlani === 'string' && (
              <span className="enstruman ml-auto">{tarihAlani.slice(0, 10)}</span>
            )}
          </div>
        ) : null}
      </>
    );
  } else if (bolum === 'projeler') {
    icerik = (
      <div className="okuma-metin">
        <h1>Projelerde en son ne oldu</h1>
        <p className="text-metin-ikincil">
          Son 30 günün günlüğündeki oturum kayıtları ve proje klasöründe en son değişen notlar. En
          yeni hareket en üstte.
        </p>
        {projeSiralisi?.map(({ p }) => (
          <ProjeBlogu
            key={p.ad}
            ozet={p}
            proje={projeler.find((x) => x.ad === p.ad) ?? null}
            onAc={(yol, cipa) => void notAc(yol, cipa)}
          />
        ))}
        {projeSiralisi && ozetler && projeSiralisi.length < ozetler.length && (
          <p className="text-sm text-metin-soluk">
            Kaydı olmayan projeler:{' '}
            {ozetler
              .filter((o) => !projeSiralisi.some((x) => x.p.ad === o.ad))
              .map((o) => o.ad)
              .join(', ')}
            .
          </p>
        )}
      </div>
    );
  } else {
    icerik = (
      <div className="flex h-full min-h-[50vh] flex-col items-center justify-center text-center">
        <p className="font-okuma text-lg text-metin">
          {okunmamis > 0 ? okunmamis + ' okunmamış not var.' : 'Okunmamış not yok.'}
        </p>
        <p className="mt-1 text-sm text-metin-soluk">Soldan bir not seç. Okunmamış notların yanında nokta var.</p>
      </div>
    );
  }

  return (
    <div
      data-tema={acikTema ? 'acik' : undefined}
      className={
        'halka relative flex h-full min-h-0 flex-col overflow-hidden rounded-base ' +
        (acikTema ? 'okuma-kagit' : 'bg-yuzey')
      }
    >
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-kenar px-3 py-2">
        <nav aria-label="Okuma bölümleri" className="flex flex-wrap gap-1">
          {BOLUMLER.map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => bolumSec(b.id)}
              aria-current={bolum === b.id ? 'page' : undefined}
              className={
                'inline-flex cursor-pointer items-center gap-1.5 rounded-kontrol px-3 py-1.5 text-sm transition-colors duration-[180ms] ' +
                (bolum === b.id ? 'bg-yuzey-guclu text-metin' : 'text-metin-ikincil hover:bg-yuzey-guclu hover:text-metin')
              }
            >
              {b.ad}
              {b.id === 'akis' && okunmamis > 0 && (
                <span className="enstruman text-xs text-aksan-metin" aria-label={okunmamis + ' okunmamış'}>
                  {okunmamis}
                </span>
              )}
            </button>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-1">
          {bolum === 'akis' && okunmamis > 0 && (
            <button
              type="button"
              onClick={() => {
                void window.kokpit.vaultHepsiOkundu().then(() => listeYukle('akis'));
              }}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-kontrol px-2.5 py-1.5 text-xs text-metin-ikincil transition-colors duration-[120ms] hover:bg-yuzey-guclu hover:text-metin"
            >
              <CheckCheck className="size-3.5" aria-hidden="true" />
              Hepsini okundu say
            </button>
          )}
          <button
            type="button"
            onClick={() => void tazele()}
            title="Notları yeniden oku"
            aria-label="Notları yeniden oku"
            className="cursor-pointer rounded-kontrol p-2 text-metin-soluk transition-colors duration-[120ms] hover:bg-yuzey-guclu hover:text-metin"
          >
            <RefreshCw className={'size-4' + (yukleniyor ? ' opacity-50' : '')} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => onTema(acikTema ? 'koyu' : 'acik')}
            aria-pressed={acikTema}
            title={acikTema ? 'Koyu okumaya geç' : 'Aydınlık okumaya geç'}
            className={
              'inline-flex cursor-pointer items-center gap-1.5 rounded-kontrol border px-2.5 py-1.5 text-xs transition-colors duration-[120ms] ' +
              (acikTema
                ? 'border-kenar-guclu bg-yuzey-guclu text-metin'
                : 'border-transparent text-metin-ikincil hover:bg-yuzey-guclu hover:text-metin')
            }
          >
            <Sun className="size-4" aria-hidden="true" />
            Aydınlık
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="flex w-72 shrink-0 flex-col border-r border-kenar">
          {bolum !== 'projeler' && (
            <label className="relative mx-3 mt-3 block">
              <span className="sr-only">{bolumAdi} içinde başlık ara</span>
              <Search
                className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-metin-soluk"
                aria-hidden="true"
              />
              <input
                type="search"
                value={filtre}
                onChange={(e) => setFiltre(e.target.value)}
                placeholder="Başlıkta ara"
                className="w-full rounded-kontrol border border-kenar bg-transparent py-1.5 pr-2 pl-8 text-sm text-metin placeholder:text-metin-soluk focus:border-kenar-guclu focus:outline-none"
              />
            </label>
          )}
          <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">{liste}</div>
        </div>

        <div ref={makaleRef} className="relative min-w-0 flex-1 overflow-y-auto">
          {uyari && (
            <p
              role="status"
              className="sticky top-0 z-10 border-b border-kenar bg-yuzey-guclu px-6 py-2 text-sm text-metin-ikincil"
            >
              {uyari}
            </p>
          )}
          <article aria-label={acik ? acik.baslik : bolumAdi} className="mx-auto max-w-[68ch] px-8 pt-8 pb-16">
            {icerik}
          </article>
        </div>

        {basliklar.length >= 3 && (acik || bolum === 'projeler') && (
          <nav
            aria-label="Bu nottaki başlıklar"
            className="hidden w-56 shrink-0 overflow-y-auto border-l border-kenar px-3 py-6 min-[1600px]:block"
          >
            <p className="etiket mb-2 px-2">Başlıklar</p>
            <ul className="space-y-0.5">
              {basliklar.map((b) => (
                <li key={b.id}>
                  <button
                    type="button"
                    onClick={() => kaydir(b.id)}
                    className={
                      'block w-full cursor-pointer truncate rounded-kontrol px-2 py-1 text-left text-xs transition-colors duration-[120ms] hover:bg-yuzey-guclu hover:text-metin ' +
                      (b.seviye <= 2 ? 'text-metin-ikincil' : 'pl-4 text-metin-soluk')
                    }
                    title={b.metin}
                  >
                    {b.metin}
                  </button>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </div>
    </div>
  );
}

function ProjeBlogu({
  ozet,
  proje,
  onAc,
}: {
  ozet: ProjeOzeti;
  proje: Proje | null;
  onAc: (yol: string, cipa: string | null) => void;
}) {
  const s = ozet.sonOturum;
  return (
    <section className="border-t border-kenar pt-6">
      <h2 id={slug('proje-' + ozet.ad)} className="!mt-0 flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="enstruman">{ozet.ad}</span>
        {proje && (
          <span className="font-arayuz text-sm font-normal">
            <AsamaRozeti asama={proje.asama} yedek={proje.envanter ? envanterMetni(proje.envanter) : undefined} />
          </span>
        )}
        {proje?.roadmap && proje.roadmap.toplam > 0 && (
          <span className="font-arayuz text-sm font-normal">
            <Ilerleme p={proje} />
          </span>
        )}
      </h2>
      {s ? (
        <>
          <p className="text-sm text-metin-soluk">
            Son oturum{' '}
            <a
              href={'#' + s.yol}
              onClick={(e) => {
                e.preventDefault();
                onAc(s.yol, s.baslik);
              }}
            >
              <span className="enstruman">
                {new Date(s.tarih + 'T00:00').toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })} {s.saat}
              </span>
            </a>
          </p>
          {s.baglam[0] && <p>{s.baglam[0]}</p>}
          {s.kararlar.length > 0 && (
            <>
              <h3>Kararlar</h3>
              <ul>
                {s.kararlar.map((k, i) => (
                  <li key={i}>{k}</li>
                ))}
              </ul>
            </>
          )}
          {s.yapilacaklar.length > 0 && (
            <>
              <h3>Yapılacaklar</h3>
              <ul>
                {s.yapilacaklar.map((k, i) => (
                  <li key={i}>{k}</li>
                ))}
              </ul>
            </>
          )}
        </>
      ) : (
        <p className="text-sm text-metin-soluk">Son 30 günün günlüğünde bu projeye ait oturum yok.</p>
      )}
      {ozet.notlar.length > 0 && (
        <>
          <h3>Son notlar</h3>
          <ul className="!list-none !pl-0">
            {ozet.notlar.map((n) => (
              <li key={n.yol} className="flex items-start gap-2">
                <OkunmamisNokta var={n.okunmamis} />
                <a
                  href={'#' + n.yol}
                  onClick={(e) => {
                    e.preventDefault();
                    onAc(n.yol, null);
                  }}
                  className="min-w-0 flex-1"
                >
                  {n.baslik}
                </a>
                <span className="enstruman shrink-0 text-xs text-metin-soluk">{zamanMetni(n.mtime)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
