import { Fragment, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { BookMarked, History, Mic, Plus, Send, Square, Volume2, VolumeX } from 'lucide-react';
import type { AriaDurumu, AriaMesaji, AriaOturumu } from './types';
import SinyalHalkasi, { HAL_ADI, type HalkaHali } from './SinyalHalkasi';
import { kayitBaslat, type Kayit } from './sesKayit';

// v3.3, Aria sayfasi (Ctrl+7): Scryne'in ikinci beyniyle sohbet. Sohbetin kendisi main'de (electron/aria.cjs, vault'ta
// kalici claude oturumu); burada cizim, mikrofon ve sesli cevap. Ustte sinyal halkasi (Aria'nin yuzu), altta sohbet,
// en altta yazi kutusu. DESIGN.md: yeni renk yok; Aria'nin metni duz `metin`, Scryne'inki `yuzey-guclu` zeminde;
// arac izi ve sureler mono soluk (olculmus deger); "hafizaya yazdi" `aksan` (etkilesimli bir iz, Hafiza paneline gider).

const SESLI_ANAHTAR = 'kokpit.aria.sesli';

/** Hafif markdown -> React (HTML enjeksiyonu yok): kod blogu, liste, baslik, **kalin**, `kod`, [baglanti](url). */
export function mdCiz(metin: string, son?: ReactNode): ReactNode[] {
  const cikti: ReactNode[] = [];
  const bloklar = metin.split(/```[\w-]*\n?/);
  bloklar.forEach((blok, bi) => {
    if (bi % 2 === 1) {
      cikti.push(
        <pre key={'k' + bi} className="enstruman my-2 overflow-x-auto rounded-kontrol bg-terminal px-3 py-2 text-xs text-metin-ikincil">
          {blok.replace(/\n$/, '')}
        </pre>
      );
      return;
    }
    const satirlar = blok.split('\n');
    let liste: { sirali: boolean; ogeler: string[] } | null = null;
    const listeyiBosalt = (k: string) => {
      if (!liste) return;
      const L = liste.sirali ? 'ol' : 'ul';
      cikti.push(
        <L key={k} className={(liste.sirali ? 'list-decimal' : 'list-disc') + ' my-1.5 space-y-0.5 pl-5 marker:text-metin-soluk'}>
          {liste.ogeler.map((o, i) => (
            <li key={i}>{satirIci(o)}</li>
          ))}
        </L>
      );
      liste = null;
    };
    satirlar.forEach((s, i) => {
      const anahtar = bi + '-' + i;
      const madde = /^\s*[-*•]\s+(.*)$/.exec(s);
      const sira = /^\s*\d+[.)]\s+(.*)$/.exec(s);
      if (madde || sira) {
        const sirali = !!sira;
        if (liste && liste.sirali !== sirali) listeyiBosalt('l' + anahtar);
        if (!liste) liste = { sirali, ogeler: [] };
        liste.ogeler.push((madde ?? sira)![1]);
        return;
      }
      listeyiBosalt('l' + anahtar);
      const baslik = /^#{1,6}\s+(.*)$/.exec(s);
      const sonSatir = bi === bloklar.length - 1 && satirlar.slice(i + 1).every((x) => !x.trim());
      if (baslik) cikti.push(<p key={anahtar} className="mt-2 font-medium text-metin">{satirIci(baslik[1])}{sonSatir && son}</p>);
      else if (s.trim()) cikti.push(<p key={anahtar} className="my-1">{satirIci(s)}{sonSatir && son}</p>);
    });
    listeyiBosalt('son' + bi);
  });
  return cikti;
}

function satirIci(s: string): ReactNode[] {
  const parcalar: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\(https?:\/\/[^)\s]+\))/g;
  let son = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(s))) {
    if (m.index > son) parcalar.push(s.slice(son, m.index));
    const p = m[0];
    if (p.startsWith('**')) parcalar.push(<strong key={i++} className="font-semibold text-metin">{p.slice(2, -2)}</strong>);
    else if (p.startsWith('`')) parcalar.push(<code key={i++} className="enstruman rounded bg-yuzey-guclu px-1 py-px text-[0.85em] text-metin-ikincil">{p.slice(1, -1)}</code>);
    else {
      const mm = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(p)!;
      parcalar.push(
        <button key={i++} type="button" onClick={() => void window.kokpit.linkAc(mm[2])} className="cursor-pointer text-aksan-metin underline decoration-kenar-guclu underline-offset-2 hover:text-metin">
          {mm[1]}
        </button>
      );
    }
    son = m.index + p.length;
  }
  if (son < s.length) parcalar.push(s.slice(son));
  return parcalar;
}

/** mp3'u calar ve genligini (0..1) bildirir: halka konusurken sesle titrer. */
async function konusVeOlc(mp3: Uint8Array, seviye: (s: number) => void): Promise<void> {
  const ctx = new AudioContext();
  try {
    const tampon = await ctx.decodeAudioData(mp3.slice().buffer);
    const kaynak = ctx.createBufferSource();
    kaynak.buffer = tampon;
    const analiz = ctx.createAnalyser();
    analiz.fftSize = 512;
    kaynak.connect(analiz);
    analiz.connect(ctx.destination);
    const veri = new Uint8Array(analiz.fftSize);
    let kare = 0;
    const olc = () => {
      analiz.getByteTimeDomainData(veri);
      let t = 0;
      for (let i = 0; i < veri.length; i++) {
        const v = (veri[i] - 128) / 128;
        t += v * v;
      }
      seviye(Math.min(1, Math.sqrt(t / veri.length) * 4));
      kare = requestAnimationFrame(olc);
    };
    await new Promise<void>((coz) => {
      kaynak.onended = () => coz();
      kaynak.start();
      olc();
    });
    cancelAnimationFrame(kare);
  } finally {
    seviye(0);
    void ctx.close();
  }
}

export default function AriaSayfasi({ gorunur }: { gorunur: boolean }) {
  const [mesajlar, setMesajlar] = useState<AriaMesaji[]>([]);
  const [durum, setDurum] = useState<AriaDurumu>('bosta');
  const [oturum, setOturum] = useState<AriaOturumu | null>(null);
  const [gecmisAcik, setGecmisAcik] = useState(false);
  const [gunler, setGunler] = useState<AriaOturumu[]>([]);
  const [eskiGun, setEskiGun] = useState<AriaOturumu | null>(null); // gecmis bir gune bakiliyor (salt okuma)
  const [metin, setMetin] = useState('');
  const [dinleme, setDinleme] = useState<'yok' | 'dinliyor' | 'cozuluyor'>('yok');
  const [seviye, setSeviye] = useState(0);
  const [konusuyor, setKonusuyor] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const [sesli, setSesli] = useState(() => {
    try {
      return localStorage.getItem(SESLI_ANAHTAR) === '1';
    } catch {
      return false;
    }
  });
  const kayit = useRef<Kayit | null>(null);
  const liste = useRef<HTMLDivElement>(null);
  const kutu = useRef<HTMLTextAreaElement>(null);
  const sesliCevapBekleyen = useRef(new Set<string>());
  const sesliRef = useRef(sesli);
  sesliRef.current = sesli;

  const yukle = useCallback(async (id?: string) => {
    const g = await window.kokpit.ariaGecmis(id);
    setMesajlar(g.mesajlar);
    setOturum(g.oturum);
  }, []);

  useEffect(() => {
    void yukle();
    void window.kokpit.ariaDurum().then((d) => setDurum(d.durum));
  }, [yukle]);

  // Sayfa gorunur olunca Aria isinir: ilk mesajda oturum acilisi (~2 sn) beklenmesin.
  useEffect(() => {
    if (gorunur) window.kokpit.ariaIsit();
  }, [gorunur]);

  const konus = useCallback(async (m: string) => {
    const b = await window.kokpit.ariaKonus(m);
    if (!b) return;
    setKonusuyor(true);
    try {
      await konusVeOlc(b, setSeviye);
    } finally {
      setKonusuyor(false);
    }
  }, []);

  useEffect(
    () =>
      window.kokpit.ariaDinle((o) => {
        if (o.tur === 'durum') setDurum(o.durum);
        else if (o.tur === 'hata') setHata(o.metin);
        else if (o.tur === 'mesaj') {
          setEskiGun(null);
          setMesajlar((l) => [...l, o.mesaj, { id: o.ariaId, rol: 'aria', metin: '', t: Date.now(), akiyor: true, araclar: [] }]);
          if (o.mesaj.kaynak === 'ses' && sesliRef.current) sesliCevapBekleyen.current.add(o.ariaId);
        } else if (o.tur === 'parca') {
          setMesajlar((l) => l.map((m) => (m.id === o.id ? { ...m, metin: o.metin } : m)));
        } else if (o.tur === 'arac') {
          setMesajlar((l) => l.map((m) => (m.id === o.id ? { ...m, araclar: [...(m.araclar ?? []), o.arac], hafiza: o.hafiza } : m)));
        } else if (o.tur === 'bitti') {
          setMesajlar((l) =>
            l.map((m) =>
              m.id === o.id ? { ...m, metin: o.metin, akiyor: false, kesildi: o.kesildi, hata: o.hata ?? undefined, sureMs: o.sureMs, araclar: o.araclar, hafiza: o.hafiza } : m
            )
          );
          if (sesliCevapBekleyen.current.delete(o.id) && o.metin && !o.kesildi) void konus(o.metin);
        }
      }),
    [konus]
  );

  // Yeni mesajda en alta kay (kullanici yukari kaydirdiysa zorlamaz: 120 px esik).
  useEffect(() => {
    const el = liste.current;
    if (!el) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 160) el.scrollTop = el.scrollHeight;
  }, [mesajlar]);

  const gonder = useCallback(
    async (m: string, kaynak: 'yazi' | 'ses' = 'yazi') => {
      const t = m.trim();
      if (!t) return;
      setHata(null);
      if (eskiGun) {
        await yukle();
        setEskiGun(null);
      }
      setMetin('');
      await window.kokpit.ariaGonder(t, kaynak);
    },
    [eskiGun, yukle]
  );

  const dinle = useCallback(async () => {
    if (kayit.current) return kayit.current.durdur();
    window.kokpit.sesHazirla();
    setDinleme('dinliyor');
    try {
      kayit.current = await kayitBaslat({
        seviye: setSeviye,
        bitti: (wav) => {
          kayit.current = null;
          setSeviye(0);
          if (!wav) {
            setDinleme('yok');
            return;
          }
          setDinleme('cozuluyor');
          void window.kokpit.sesMetin(wav).then((r) => {
            setDinleme('yok');
            if ('hata' in r) setHata(r.hata);
            else void gonder(r.metin, 'ses');
          });
        },
      });
    } catch {
      kayit.current = null;
      setDinleme('yok');
      setHata('Mikrofon açılamadı');
    }
  }, [gonder]);

  const mesgul = durum !== 'bosta';
  const hal: HalkaHali =
    dinleme === 'dinliyor' ? 'dinliyor' : konusuyor ? 'konusuyor' : hata ? 'hata' : dinleme === 'cozuluyor' ? 'dusunuyor' : durum;
  const sonArac = [...mesajlar].reverse().find((m) => m.akiyor)?.araclar?.slice(-1)[0];
  const halMetni =
    hal === 'arac' && sonArac ? 'Bakıyor: ' + sonArac.ad + (sonArac.hedef ? ' · ' + sonArac.hedef : '') : hal === 'bosta' && oturum ? HAL_ADI.bosta : HAL_ADI[hal];

  return (
    <div className="flex h-full min-h-0 flex-col" data-aria-sayfasi>
      <header className="relative flex shrink-0 items-start gap-3 pb-2">
        <div className="flex min-w-0 flex-1 flex-col items-center">
          <SinyalHalkasi hal={hal} seviye={seviye} boyut={mesajlar.length ? 128 : 208} />
          <p data-aria-hal={hal} className={'mt-1 text-xs ' + (hal === 'hata' ? 'text-hata-metin' : 'text-metin-soluk')} aria-live="polite">
            {hata ?? halMetni}
          </p>
        </div>
        <div className="absolute right-0 top-0 flex items-center gap-1">
          <button
            type="button"
            onClick={() => {
              const yeni = !sesli;
              setSesli(yeni);
              try {
                localStorage.setItem(SESLI_ANAHTAR, yeni ? '1' : '0');
              } catch {
                /* depolama kapali */
              }
            }}
            aria-pressed={sesli}
            title={sesli ? 'Sesle sorduğunda Aria sesli cevaplar' : 'Sesli cevap kapalı'}
            className="cursor-pointer rounded-kontrol p-1.5 text-metin-soluk hover:bg-yuzey hover:text-metin"
          >
            {sesli ? <Volume2 className="size-4" aria-hidden="true" /> : <VolumeX className="size-4" aria-hidden="true" />}
            <span className="sr-only">Sesli cevap</span>
          </button>
          <button
            type="button"
            onClick={async () => {
              setGunler(await window.kokpit.ariaOturumlar());
              setGecmisAcik((x) => !x);
            }}
            aria-expanded={gecmisAcik}
            title="Önceki günlerin sohbetleri"
            className="cursor-pointer rounded-kontrol p-1.5 text-metin-soluk hover:bg-yuzey hover:text-metin"
          >
            <History className="size-4" aria-hidden="true" />
            <span className="sr-only">Geçmiş</span>
          </button>
          <button
            type="button"
            onClick={() => {
              window.kokpit.ariaYeni();
              setMesajlar([]);
              setOturum(null);
              setEskiGun(null);
            }}
            title="Yeni sohbet (bugünün sohbeti kapanır, hafızaya düşer)"
            className="cursor-pointer rounded-kontrol p-1.5 text-metin-soluk hover:bg-yuzey hover:text-metin"
          >
            <Plus className="size-4" aria-hidden="true" />
            <span className="sr-only">Yeni sohbet</span>
          </button>
        </div>
      </header>

      {gecmisAcik && (
        <nav aria-label="Önceki sohbetler" className="halka relative mx-auto mb-2 w-full max-w-3xl overflow-hidden rounded-base bg-yuzey-guclu">
          <ul className="max-h-56 overflow-y-auto">
            {gunler.map((g) => (
              <li key={g.id} className="border-b border-kenar last:border-0">
                <button
                  type="button"
                  onClick={async () => {
                    setGecmisAcik(false);
                    const s = await window.kokpit.ariaGecmis(g.id);
                    setMesajlar(s.mesajlar);
                    setOturum(s.oturum);
                    setEskiGun(gunler[0]?.id === g.id ? null : g);
                  }}
                  className="flex w-full cursor-pointer items-baseline gap-3 px-3 py-1.5 text-left text-sm hover:bg-yuzey"
                >
                  <span className="enstruman shrink-0 text-xs text-metin-soluk">{g.gun}</span>
                  <span className="min-w-0 truncate text-metin-ikincil">{g.baslik ?? '(boş)'}</span>
                </button>
              </li>
            ))}
            {gunler.length === 0 && <li className="px-3 py-2 text-sm text-metin-soluk">Henüz sohbet yok.</li>}
          </ul>
        </nav>
      )}

      <div ref={liste} className="min-h-0 flex-1 overflow-y-auto" data-aria-sohbet>
        <div className="mx-auto w-full max-w-3xl space-y-4 px-1 pb-4">
          {eskiGun && (
            <p className="text-center text-xs text-metin-soluk">
              <span className="enstruman">{eskiGun.gun}</span> sohbeti (salt okuma). Yazınca bugünün sohbetine dönülür.
            </p>
          )}
          {mesajlar.length === 0 && (
            <div className="pt-2 text-center text-sm text-metin-soluk">
              <p>Hafızamız bende. Sor, anlat, ya da bir iş ver.</p>
              <p className="mt-1 text-xs">Mikrofonla da konuşabilirsin; her yerden: Ada'ya "Ada, …" de.</p>
            </div>
          )}
          {mesajlar.map((m) => (
            <Fragment key={m.id}>{m.rol === 'sen' ? <SenMesaji m={m} /> : <AriaMesajiSatiri m={m} />}</Fragment>
          ))}
        </div>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void gonder(metin);
        }}
        className="mx-auto flex w-full max-w-3xl shrink-0 items-end gap-2 pt-2"
      >
        <textarea
          ref={kutu}
          value={metin}
          onChange={(e) => setMetin(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void gonder(metin);
            }
          }}
          rows={Math.min(6, Math.max(1, metin.split('\n').length))}
          placeholder={dinleme === 'dinliyor' ? 'Dinliyorum…' : dinleme === 'cozuluyor' ? 'Anlıyorum…' : "Aria'ya yaz (Enter gönderir, Shift+Enter satır)"}
          aria-label="Aria'ya mesaj"
          data-aria-kutu
          className="halka min-h-[2.5rem] flex-1 resize-none rounded-base border border-kenar bg-terminal/60 px-3 py-2 text-sm text-metin placeholder:text-metin-soluk"
        />
        <button
          type="button"
          onClick={() => void dinle()}
          aria-pressed={dinleme === 'dinliyor'}
          aria-label={dinleme === 'dinliyor' ? 'Dinlemeyi bitir' : 'Sesle konuş'}
          title="Sesle konuş"
          className={'cursor-pointer rounded-base border border-kenar p-2.5 hover:border-kenar-guclu ' + (dinleme === 'dinliyor' ? 'text-metin' : 'text-metin-soluk')}
        >
          <Mic className="size-4" aria-hidden="true" />
        </button>
        {mesgul ? (
          <button
            type="button"
            data-aria-kes
            onClick={() => void window.kokpit.ariaKes()}
            aria-label="Durdur"
            title="Aria'yı durdur"
            className="cursor-pointer rounded-base border border-kenar-guclu p-2.5 text-metin hover:bg-yuzey"
          >
            <Square className="size-4" aria-hidden="true" />
          </button>
        ) : (
          <button
            type="submit"
            disabled={!metin.trim()}
            aria-label="Gönder"
            className="cursor-pointer rounded-base bg-birincil p-2.5 text-birincil-uzeri hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Send className="size-4" aria-hidden="true" />
          </button>
        )}
      </form>
    </div>
  );
}

function SenMesaji({ m }: { m: AriaMesaji }) {
  return (
    <div className="flex justify-end" data-aria-mesaj="sen">
      <div className="max-w-[80%] whitespace-pre-wrap break-words rounded-base bg-yuzey-guclu px-3.5 py-2 text-sm text-metin">
        {m.kaynak === 'ses' && <Mic className="mr-1.5 inline size-3 text-metin-soluk" aria-label="sesle" />}
        {m.metin}
      </div>
    </div>
  );
}

function AriaMesajiSatiri({ m }: { m: AriaMesaji }) {
  const araclar = m.araclar ?? [];
  return (
    <div className="text-sm leading-relaxed text-metin-ikincil" data-aria-mesaj="aria" data-akiyor={m.akiyor ? '' : undefined}>
      {araclar.length > 0 && (
        <p className="enstruman mb-1 truncate text-[0.6875rem] text-metin-soluk" title={araclar.map((a) => a.ad + (a.hedef ? ' ' + a.hedef : '')).join('\n')}>
          {araclar.slice(-4).map((a, i) => (
            <Fragment key={i}>
              {i > 0 && ' · '}
              {a.ad}
              {a.hedef && <span className="text-metin-soluk/80"> {a.hedef}</span>}
            </Fragment>
          ))}
          {araclar.length > 4 && ' · +' + (araclar.length - 4)}
        </p>
      )}
      {m.metin ? (
        <div className="break-words text-metin">{mdCiz(m.metin, m.akiyor ? <span className="aria-imlec" aria-hidden="true" /> : undefined)}</div>
      ) : m.akiyor ? (
        <p className="text-metin-soluk">…</p>
      ) : null}
      {(m.hafiza?.length ?? 0) > 0 && (
        <p className="mt-1.5 flex items-center gap-1.5 text-xs text-aksan-metin" data-aria-hafiza>
          <BookMarked className="size-3.5" aria-hidden="true" />
          Hafızaya yazdı: <span className="enstruman">{m.hafiza!.map((h) => h.split('/').pop()).join(', ')}</span>
        </p>
      )}
      {(m.kesildi || m.hata || (m.sureMs && !m.akiyor)) && (
        <p className="enstruman mt-1 text-[0.6875rem] text-metin-soluk">
          {m.hata ? <span className="text-hata-metin">{m.hata}</span> : m.kesildi ? 'kesildi' : (m.sureMs! / 1000).toFixed(1).replace('.', ',') + ' sn'}
        </p>
      )}
    </div>
  );
}
