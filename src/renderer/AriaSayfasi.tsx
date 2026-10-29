import { Fragment, memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BookMarked, BrainCircuit, Check, ChevronDown, History, Lightbulb, Mic, Moon, Plus, RefreshCw, Send, Square, TerminalSquare, Volume2, VolumeX, Waypoints, X } from 'lucide-react';
import type { AriaDurumu, AriaMesaji, AriaNotu, AriaOnerisi, AriaOturumu, HafizaAgi } from './types';
import SinyalHalkasi, { HAL_ADI, type HalkaHali } from './SinyalHalkasi';
import { kayitBaslat, mikrofonHatasi, type Kayit } from './sesKayit';
import { mdCiz } from './md';
import HafizaPaneli from './HafizaPaneli';
import AriaAgi, { aracDugumleri, type AgKumanda } from './AriaAgi';

// v3.3, Aria sayfasi (Ctrl+7): Scryne'in ikinci beyniyle sohbet. Sohbetin kendisi main'de (electron/aria.cjs, vault'ta
// kalici claude oturumu); burada cizim, mikrofon ve sesli cevap. Ustte sinyal halkasi (Aria'nin yuzu), altta sohbet,
// en altta yazi kutusu. DESIGN.md: yeni renk yok; Aria'nin metni duz `metin`, Scryne'inki `yuzey-guclu` zeminde;
// arac izi ve sureler mono soluk (olculmus deger); "hafizaya yazdi" `aksan` (etkilesimli bir iz, Hafiza paneline gider).

const SESLI_ANAHTAR = 'kokpit.aria.sesli';
const PANEL_ANAHTAR = 'kokpit.aria.panel';
const AG_ANAHTAR = 'kokpit.aria.ag';
const AG_TAZELIK = 5 * 60_000;

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
  // v3.3 Faz 61: hafiza paneli (sagda). Genis ekranda varsayilan acik; secim kalici.
  const [panel, setPanel] = useState(() => {
    try {
      const k = localStorage.getItem(PANEL_ANAHTAR);
      return k === null ? window.innerWidth >= 1280 : k === '1';
    } catch {
      return true;
    }
  });
  const [acilacak, setAcilacak] = useState<{ yol: string; t: number } | null>(null);
  // v3.4: Aria'nin agi (vault not grafigi). Genis ekranda varsayilan acik; secim kalici. Acikken hafiza paneli agin
  // ustunde cekmece olur (ag sayfanin sag yarisi).
  const [agGoster, setAgGoster] = useState(() => {
    try {
      const k = localStorage.getItem(AG_ANAHTAR);
      return k === null ? window.innerWidth >= 1100 : k === '1';
    } catch {
      return true;
    }
  });
  const [cekmece, setCekmece] = useState(false); // ag acikken hafiza paneli (cekmece); notu tiklayinca acilir
  const [ag, setAg] = useState<HafizaAgi | null>(null);
  const agRef = useRef<HafizaAgi | null>(null);
  agRef.current = ag;
  const agZamani = useRef(0);
  const agKumanda = useRef<AgKumanda | null>(null);
  const agYukle = useCallback(async (taze = false) => {
    agZamani.current = Date.now();
    setAg(await window.kokpit.hafizaAg(taze));
  }, []);
  useEffect(() => {
    if (gorunur && agGoster && (!agRef.current || Date.now() - agZamani.current > AG_TAZELIK)) void agYukle();
  }, [gorunur, agGoster, agYukle]);
  // v3.3 Faz 62: Aria'nin onerileri (kart). Ana kaynak main; burada cizim ve karar.
  const [oneriler, setOneriler] = useState<AriaOnerisi[]>([]);
  useEffect(() => {
    void window.kokpit.ariaOneriler().then(setOneriler);
  }, []);
  // v3.3 Faz 63: gunluk not ("fark ettiklerim"). Ayar kapaliyken de elle istenebilir.
  const [not, setNot] = useState<AriaNotu | null>(null);
  const [notYaziyor, setNotYaziyor] = useState(false);
  const [notAyar, setNotAyar] = useState(false);
  const [notAcik, setNotAcik] = useState(true);
  useEffect(() => {
    void window.kokpit.ariaNot().then(setNot);
    void window.kokpit.ariaNotAyar().then(setNotAyar);
  }, []);
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
        if (o.tur === 'not') {
          setNotYaziyor(o.durum === 'yaziyor');
          if (o.durum === 'hazir' && o.not) setNot(o.not);
          if (o.durum === 'hazir' && o.hata) setHata(o.hata);
          return;
        }
        if (o.tur === 'oneri') {
          setOneriler((l) => (l.some((k) => k.id === o.oneri.id) ? l.map((k) => (k.id === o.oneri.id ? o.oneri : k)) : [...l, o.oneri]));
          return;
        }
        if (o.tur === 'durum') setDurum(o.durum);
        else if (o.tur === 'hata') setHata(o.metin);
        else if (o.tur === 'mesaj') {
          setEskiGun(null);
          setMesajlar((l) => [...l, o.mesaj, { id: o.ariaId, rol: 'aria', metin: '', t: Date.now(), akiyor: true, araclar: [] }]);
          if (o.mesaj.kaynak === 'ses' && sesliRef.current) sesliCevapBekleyen.current.add(o.ariaId);
          // Cagrisim: sorunun hafizada eslestigi notlar soluk yanar (arama eslesmesi; Aria'nin okudugu degil).
          void window.kokpit.hafizaAra(o.mesaj.metin).then((r) => {
            const idler = r.slice(0, 6).map((x) => x.yol.replace(/\.md$/, ''));
            if (idler.length) agKumanda.current?.ates(idler, 'cagrisim', idler.length + ' not');
          });
        } else if (o.tur === 'parca') {
          setMesajlar((l) => l.map((m) => (m.id === o.id ? { ...m, metin: o.metin } : m)));
        } else if (o.tur === 'arac') {
          setMesajlar((l) => l.map((m) => (m.id === o.id ? { ...m, araclar: [...(m.araclar ?? []), o.arac], hafiza: o.hafiza } : m)));
          const a = agRef.current;
          if (a) {
            const h = aracDugumleri(o.arac, a.dugumler, a.vault);
            agKumanda.current?.ates(h.idler, h.tur, h.etiket);
          }
        } else if (o.tur === 'bitti') {
          // Aria hafizaya yazdiysa ag tazelenir (yeni not / yeni bag yerinde belirir).
          if (o.hafiza?.length && agRef.current) void agYukle(true);
          setMesajlar((l) =>
            l.map((m) =>
              m.id === o.id ? { ...m, metin: o.metin, akiyor: false, kesildi: o.kesildi, hata: o.hata ?? undefined, sureMs: o.sureMs, araclar: o.araclar, hafiza: o.hafiza } : m
            )
          );
          if (sesliCevapBekleyen.current.delete(o.id) && o.metin && !o.kesildi) void konus(o.metin);
        }
      }),
    [konus, agYukle]
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

  // Mikrofon izni beklerken ikinci tik ikinci kaydi, cozulurken yeni kayit eski STT'nin durumunu bozmasin.
  const dinlemeRef = useRef(dinleme);
  dinlemeRef.current = dinleme;
  const dinle = useCallback(async () => {
    if (kayit.current) return kayit.current.durdur();
    if (dinlemeRef.current !== 'yok') return;
    window.kokpit.sesHazirla();
    setHata(null);
    setDinleme('dinliyor');
    dinlemeRef.current = 'dinliyor';
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
          void window.kokpit
            .sesMetin(wav)
            .then((r) => {
              if ('hata' in r) setHata(r.hata);
              else void gonder(r.metin, 'ses');
            })
            .catch((e: Error) => setHata('Ses çözülemedi: ' + e.message))
            .finally(() => setDinleme('yok'));
        },
      });
    } catch (e) {
      kayit.current = null;
      setDinleme('yok');
      setHata(mikrofonHatasi(e));
    }
  }, [gonder]);
  // Sayfadan cikinca (baska sayfa) suren kayit durur: mikrofon arka planda acik kalmasin.
  useEffect(() => {
    if (!gorunur) kayit.current?.iptal();
  }, [gorunur]);
  useEffect(() => () => kayit.current?.iptal(), []);
  // Aria'nin agindaki amber halka: onay bekleyen onerilerin projeleri. Icerige gore sabit dizi (her render'da yeni dizi
  // agin cizim etkisini her tusta yeniden tetikliyordu).
  const bekleyenAnahtar = oneriler.filter((k) => k.durum === 'bekliyor' && k.proje).map((k) => k.proje!).join('|');
  const bekleyenProjeler = useMemo(() => (bekleyenAnahtar ? bekleyenAnahtar.split('|') : []), [bekleyenAnahtar]);

  const agGosterRef = useRef(agGoster);
  agGosterRef.current = agGoster;
  // Sabit geri cagirim: mesaj satirlari memo'lu, her render'da yeni fonksiyon onlari yeniden cizerdi.
  const hafizadaAc = useCallback((yol: string) => {
    if (agGosterRef.current) setCekmece(true);
    else setPanel(true);
    setAcilacak({ yol, t: Date.now() });
  }, []);

  const hafizadanSor = (onek: string) => {
    setMetin(onek);
    requestAnimationFrame(() => kutu.current?.focus());
  };

  const mesgul = durum !== 'bosta';
  const hal: HalkaHali =
    dinleme === 'dinliyor' ? 'dinliyor' : konusuyor ? 'konusuyor' : hata ? 'hata' : dinleme === 'cozuluyor' ? 'dusunuyor' : durum;
  const sonArac = [...mesajlar].reverse().find((m) => m.akiyor)?.araclar?.slice(-1)[0];
  const halMetni =
    hal === 'arac' && sonArac ? 'Bakıyor: ' + sonArac.ad + (sonArac.hedef ? ' · ' + sonArac.hedef : '') : hal === 'bosta' && oturum ? HAL_ADI.bosta : HAL_ADI[hal];

  return (
    <div className="flex h-full min-h-0 gap-4" data-aria-sayfasi>
    <div className={'flex min-h-0 min-w-0 flex-col ' + (agGoster ? 'w-[min(40rem,44%)] shrink-0' : 'flex-1')}>
      <header className="relative flex shrink-0 items-start gap-3 pb-2">
        <div className="flex min-w-0 flex-1 flex-col items-center">
          <SinyalHalkasi hal={hal} seviye={seviye} boyut={mesajlar.length || agGoster ? 128 : 208} etkin={gorunur} />
          {/* Durum metni gorunur ama surekli duyurulmaz (her arac degisiminde okunuyordu); hata ayri, tek duyuru. */}
          <p data-aria-hal={hal} className={'mt-1 max-w-full truncate px-2 text-xs ' + (hal === 'hata' ? 'text-hata-metin' : 'text-metin-soluk')} title={hata ?? halMetni}>
            {hata ?? halMetni}
          </p>
          <span className="sr-only" role="status">
            {hata ?? (hal === 'bosta' ? '' : HAL_ADI[hal])}
          </span>
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
            data-hafiza-dugme
            onClick={() => {
              if (agGoster) return setCekmece((x) => !x);
              const yeni = !panel;
              setPanel(yeni);
              try {
                localStorage.setItem(PANEL_ANAHTAR, yeni ? '1' : '0');
              } catch {
                /* depolama kapali */
              }
            }}
            aria-pressed={agGoster ? cekmece : panel}
            title="Aria'nın hafızası"
            className={'cursor-pointer rounded-kontrol p-1.5 hover:bg-yuzey hover:text-metin ' + ((agGoster ? cekmece : panel) ? 'text-metin' : 'text-metin-soluk')}
          >
            <BrainCircuit className="size-4" aria-hidden="true" />
            <span className="sr-only">Hafıza paneli</span>
          </button>
          <button
            type="button"
            data-ag-dugme
            onClick={() => {
              const yeni = !agGoster;
              setAgGoster(yeni);
              try {
                localStorage.setItem(AG_ANAHTAR, yeni ? '1' : '0');
              } catch {
                /* depolama kapali */
              }
            }}
            aria-pressed={agGoster}
            title="Hafıza ağı: Aria çalışırken notlar yanar"
            className={'cursor-pointer rounded-kontrol p-1.5 hover:bg-yuzey hover:text-metin ' + (agGoster ? 'text-metin' : 'text-metin-soluk')}
          >
            <Waypoints className="size-4" aria-hidden="true" />
            <span className="sr-only">Hafıza ağı</span>
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
          <GunlukNot
            not={not}
            yaziyor={notYaziyor}
            ayar={notAyar}
            acik={notAcik}
            onAcik={setNotAcik}
            onYaz={() => void window.kokpit.ariaNotYaz()}
            onAyar={async () => setNotAyar(await window.kokpit.ariaNotAyar(!notAyar))}
          />
          {mesajlar.length === 0 && (
            <div className="pt-2 text-center text-sm text-metin-soluk">
              <p>Hafızamız bende. Sor, anlat, ya da bir iş ver.</p>
              <p className="mt-1 text-xs">Mikrofonla da konuşabilirsin; her yerden: Ada'ya "Ada, …" de.</p>
            </div>
          )}
          {mesajlar.map((m) => (
            <Fragment key={m.id}>
              {m.rol === 'sen' ? (
                <SenMesaji m={m} />
              ) : (
                <>
                  <AriaMesajiSatiri
                    m={m}
                    onHafiza={hafizadaAc}
                  />
                  {oneriler
                    .filter((k) => k.mesajId === m.id)
                    .map((k) => (
                      <OneriKarti key={k.id} k={k} />
                    ))}
                </>
              )}
            </Fragment>
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
          placeholder={dinleme === 'dinliyor' ? 'Dinliyorum…' : dinleme === 'cozuluyor' ? 'Anlıyorum…' : "Aria'ya yaz"}
          title="Enter gönderir, Shift+Enter yeni satır"
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
    {agGoster ? (
      <div className="halka relative min-h-0 min-w-0 flex-1 overflow-hidden rounded-base bg-terminal/60">
        <AriaAgi
          cekmece={cekmece}
          ag={ag}
          hal={hal}
          bekleyen={bekleyenProjeler}
          gorunur={gorunur}
          kumanda={agKumanda}
          onSec={(yol) => {
            setCekmece(true);
            setAcilacak({ yol, t: Date.now() });
          }}
        />
        {cekmece && (
          <div
            className="absolute bottom-0 right-0 top-11 z-20 flex w-[22rem] max-w-[85%] flex-col rounded-tl-base border-l border-t border-kenar bg-yuzey-guclu p-3 pt-8"
            data-ag-cekmece
            onKeyDown={(e) => {
              if (e.key === 'Escape') setCekmece(false);
            }}
          >
            <button
              type="button"
              onClick={() => setCekmece(false)}
              aria-label="Hafıza çekmecesini kapat"
              title="Kapat (Esc)"
              className="absolute right-1.5 top-1.5 z-10 cursor-pointer rounded-kontrol p-1 text-metin-soluk hover:bg-yuzey hover:text-metin"
            >
              <X className="size-3.5" aria-hidden="true" />
            </button>
            <HafizaPaneli acilacak={acilacak} onSor={hafizadanSor} />
          </div>
        )}
      </div>
    ) : (
      panel && (
        <div className="halka relative flex min-h-0 w-[22rem] shrink-0 flex-col rounded-base bg-yuzey p-3">
          <HafizaPaneli acilacak={acilacak} onSor={hafizadanSor} />
        </div>
      )
    )}
    </div>
  );
}

/** Gunun notu: Aria'nin kendiliginden fark ettikleri (ayar acikken her gun brifingle). Bugunun degilse soluk tarih. */
function GunlukNot({
  not,
  yaziyor,
  ayar,
  acik,
  onAcik,
  onYaz,
  onAyar,
}: {
  not: AriaNotu | null;
  yaziyor: boolean;
  ayar: boolean;
  acik: boolean;
  onAcik: (a: boolean) => void;
  onYaz: () => void;
  onAyar: () => void;
}) {
  return (
    <section aria-label="Aria'nın fark ettikleri" data-aria-not className="halka relative rounded-base bg-yuzey px-3.5 py-2.5 text-sm">
      <div className="flex items-center gap-2">
        <Lightbulb className="size-3.5 text-metin-soluk" aria-hidden="true" />
        <button type="button" onClick={() => onAcik(!acik)} aria-expanded={acik} className="etiket flex cursor-pointer items-center gap-1 hover:text-metin">
          Fark ettiklerim
          <ChevronDown className={'size-3 transition-transform duration-[120ms] ' + (acik ? '' : '-rotate-90')} aria-hidden="true" />
        </button>
        {not && <span className="enstruman text-xs text-metin-soluk">{not.gun}</span>}
        <span className="ml-auto flex items-center gap-2 text-xs">
          <label className="flex cursor-pointer items-center gap-1.5 text-metin-soluk hover:text-metin" title="Her gün ilk brifingle birlikte Aria bir not yazar (limit harcar)">
            <input type="checkbox" checked={ayar} onChange={onAyar} className="accent-[var(--color-aksan)]" />
            her gün
          </label>
          <button type="button" data-aria-not-yaz disabled={yaziyor} onClick={onYaz} title="Şimdi düşün" className="flex cursor-pointer items-center gap-1 rounded-kontrol border border-kenar px-2 py-0.5 text-metin-ikincil hover:border-kenar-guclu hover:text-metin disabled:cursor-wait disabled:opacity-60">
            <RefreshCw className={'size-3 ' + (yaziyor ? 'animate-spin motion-reduce:animate-none' : '')} aria-hidden="true" />
            {yaziyor ? 'Düşünüyor' : 'Şimdi düşün'}
          </button>
        </span>
      </div>
      {acik && (
        <div className="mt-1.5 text-metin-ikincil">
          {not ? mdCiz(not.metin) : <p className="text-xs text-metin-soluk">Henüz not yok. "Şimdi düşün" ile Aria Kokpit'i ve hafızayı okuyup fark ettiklerini yazar.</p>}
        </div>
      )}
    </section>
  );
}

const ONERI_BASLIK: Record<AriaOnerisi['tur'], string> = { gorev: 'Görev ver', gece: 'Gece vardiyasına ekle', mesaj: 'Oturuma yaz' };

/** Aria'nin onerisi: Scryne onaylamadan hicbir sey yapilmaz. Renk yok; onay birincil gumus, vazgec cerceve. */
function OneriKarti({ k }: { k: AriaOnerisi }) {
  const [bekliyor, setBekliyor] = useState(false);
  const [tamami, setTamami] = useState(false);
  const [kararHatasi, setKararHatasi] = useState<string | null>(null);
  const karar = async (onay: boolean) => {
    setBekliyor(true);
    setKararHatasi(null);
    try {
      const r = await window.kokpit.ariaOneriKarar(k.id, onay);
      if (r && 'hata' in r && r.hata) setKararHatasi(r.hata);
    } catch (e) {
      setKararHatasi((e as Error).message);
    } finally {
      // IPC hata verse de dugmeler kilitli kalmaz.
      setBekliyor(false);
    }
  };
  const uzun = k.metin.length > 360 || k.metin.split('\n').length > 6;
  const Ikon = k.tur === 'gece' ? Moon : TerminalSquare;
  return (
    <div data-aria-oneri={k.durum} className="halka relative ml-0 max-w-xl rounded-base bg-yuzey-guclu px-3.5 py-2.5 text-sm">
      <p className="flex items-center gap-2 text-xs">
        <Ikon className="size-3.5 text-metin-soluk" aria-hidden="true" />
        <span className="etiket">Öneri · {ONERI_BASLIK[k.tur]}</span>
        <span className="enstruman text-metin">{k.proje ?? k.oturum}</span>
        {k.kip === 'paralel' && <span className="text-metin-soluk">paralel dal</span>}
      </p>
      {/* Onaylanacak metnin tamami okunabilir olmali: kesilen kisim gorulmeden onaylanmasin. */}
      <p className={'mt-1.5 whitespace-pre-wrap break-words text-metin-ikincil ' + (tamami ? '' : 'line-clamp-6')}>{k.metin}</p>
      {uzun && (
        <button type="button" onClick={() => setTamami((x) => !x)} aria-expanded={tamami} className="mt-1 cursor-pointer text-xs text-aksan-metin underline decoration-kenar-guclu underline-offset-2 hover:text-metin">
          {tamami ? 'Kısalt' : 'Tamamını göster'}
        </button>
      )}
      {kararHatasi && <p className="mt-1 text-xs text-hata-metin">{kararHatasi}</p>}
      {k.durum === 'bekliyor' ? (
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            data-oneri-onayla
            disabled={bekliyor}
            onClick={() => void karar(true)}
            className="flex cursor-pointer items-center gap-1 rounded-kontrol bg-birincil px-2.5 py-1 text-xs font-medium text-birincil-uzeri hover:opacity-90 disabled:opacity-50"
          >
            <Check className="size-3.5" aria-hidden="true" /> Onayla
          </button>
          <button
            type="button"
            disabled={bekliyor}
            onClick={() => void karar(false)}
            className="flex cursor-pointer items-center gap-1 rounded-kontrol border border-kenar px-2.5 py-1 text-xs text-metin-ikincil hover:border-kenar-guclu hover:text-metin disabled:opacity-50"
          >
            <X className="size-3.5" aria-hidden="true" /> Vazgeç
          </button>
        </div>
      ) : (
        <p className={'mt-1.5 text-xs ' + (k.durum === 'hata' ? 'text-hata-metin' : 'text-metin-soluk')}>
          {k.durum === 'uygulaniyor' ? 'Uygulanıyor…' : k.durum === 'onaylandi' ? 'Onaylandı' : k.durum === 'reddedildi' ? 'Vazgeçildi' : 'Uygulanamadı'}
          {k.sonuc ? ' · ' + k.sonuc : ''}
        </p>
      )}
    </div>
  );
}

// memo: yazi kutusuna her tus, mikrofon seviyesi ve akis parcasi butun mesajlari (ve markdown cizimini) yeniden
// calistiriyordu; mesaj nesnesi degismedikce satir yeniden cizilmez.
const SenMesaji = memo(function SenMesaji({ m }: { m: AriaMesaji }) {
  return (
    <div className="flex justify-end" data-aria-mesaj="sen">
      <div className="max-w-[80%] whitespace-pre-wrap break-words rounded-base bg-yuzey-guclu px-3.5 py-2 text-sm text-metin">
        {m.kaynak === 'ses' && <Mic className="mr-1.5 inline size-3 text-metin-soluk" aria-label="sesle" />}
        {m.metin}
      </div>
    </div>
  );
});

const AriaMesajiSatiri = memo(function AriaMesajiSatiri({ m, onHafiza }: { m: AriaMesaji; onHafiza: (yol: string) => void }) {
  const araclar = m.araclar ?? [];
  const cizim = useMemo(() => (m.metin ? mdCiz(m.metin, m.akiyor ? <span className="aria-imlec" aria-hidden="true" /> : undefined) : null), [m.metin, m.akiyor]);
  return (
    <div className="text-sm leading-relaxed text-metin-ikincil" data-aria-mesaj="aria" data-akiyor={m.akiyor ? '' : undefined}>
      {araclar.length > 0 && (
        <p className="enstruman mb-1 truncate text-[0.6875rem] text-metin-soluk" title={araclar.map((a) => a.ad + (a.hedef ? ' ' + a.hedef : '')).join('\n')}>
          {araclar.slice(-4).map((a, i) => (
            <Fragment key={i}>
              {i > 0 && ' · '}
              {a.ad}
              {a.hedef && <span className="text-metin-soluk"> {a.hedef}</span>}
            </Fragment>
          ))}
          {araclar.length > 4 && ' · +' + (araclar.length - 4)}
        </p>
      )}
      {m.metin ? (
        <div className="break-words text-metin">{cizim}</div>
      ) : m.akiyor ? (
        <p className="text-metin-soluk">…</p>
      ) : null}
      {(m.hafiza?.length ?? 0) > 0 && (
        <p className="mt-1.5 flex items-center gap-1.5 text-xs text-aksan-metin" data-aria-hafiza>
          <BookMarked className="size-3.5" aria-hidden="true" />
          Hafızaya yazdı:{' '}
          {m.hafiza!.map((h, i) => (
            <Fragment key={h}>
              {i > 0 && ', '}
              <button type="button" onClick={() => onHafiza(h)} className="enstruman cursor-pointer underline decoration-kenar-guclu underline-offset-2 hover:text-metin" title={h}>
                {h.split('/').pop()}
              </button>
            </Fragment>
          ))}
        </p>
      )}
      {(m.kesildi || m.hata || (m.sureMs && !m.akiyor)) && (
        <p className="enstruman mt-1 text-[0.6875rem] text-metin-soluk">
          {m.hata ? <span className="text-hata-metin">{m.hata}</span> : m.kesildi ? 'kesildi' : (m.sureMs! / 1000).toFixed(1).replace('.', ',') + ' sn'}
        </p>
      )}
    </div>
  );
});
