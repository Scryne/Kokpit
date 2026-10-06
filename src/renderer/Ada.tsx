import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';
import { ArrowDownFromLine, ArrowUpToLine, Check, ChevronDown, CornerDownLeft, RefreshCw } from 'lucide-react';
import type {
  AdaKipi,
  AdaOturumu,
  AdaProjesi,
  DisOturum,
  EtkinlikAnlik,
  Limit,
  LimitDurumu,
  Limitler,
  GonderIstegi,
  HizliKomut,
  OturumEtkinligi,
  SoruAyrintisi,
  SoruCevabi,
} from './types';
import { DurumIsareti, etkinlikCumlesi, sifirlanmaMetni } from './Etkinlik';
import { sureMetni } from './parcalar';
import { AdaGoz, gozPozu, type GozHali } from './AdaGoz';

// Ada: Kokpit arka plandayken ekranin ust ortasindaki serit (electron/ada.cjs).
// Kapali: tek satirlik hap — en onemli tek sey. Acik: oturum basina satir + limitler.
// Acilir: imlec uzerine gelince, odak icindeyken (yazi kutusu, Ctrl+Alt+Shift+A) ya da bir
// oturum "bitti/seni bekliyor" dediginde 5 sn (Coucou'nun "notch'tan bakma" ani; ses yok).
//
// v2.3: ada cevap da verir. v2.4: cok sorulu sorular, claude'un son sozu, klavye, "Gördüm".
// v2.5: hapta Ada'nin gozu (AdaGoz.tsx), kenarinda 5 saatlik limit, alt ajan noktalari, uyku.
// v2.6, masaustu ajani: Ada hep gorunur, oturum yokken de. Hapta iki limit (5 saat + hafta, oturumsuz
// yoklamadan), Kokpit disinda acilan claude oturumlari ("Kokpit dışında") ve "Görev ver": proje +
// metin -> Kokpit arka planda yeni oturum acar, metin claude'un ilk mesaji olur.
// Sira sende olan oturumun (bitti / seni bekliyor) altinda: claude soru sorduysa sorular ve
// secenekleri, bittiyse son sozu + hizli komutlar + yanit kutusu. Gonderim main uzerinden ana
// penceredeki PTY'ye gider; Kokpit one gelmez.
//
// v2.7, saklanma: kartin basliginda "Kenara sakla" -> Ada ust kenarin arkasina cekilir, yalniz cenesi
// (AdaCene) gorunur; imlec ustunde SARKMA_MS durunca kart kenardan sarkar, ayrilinca geri cekilir.
// Tam ekran uygulama ondeyken (main: kip 'sinema') pencere gizlidir; seni bekleyen varsa yalniz cene.
// Saklanmisken "bitti/seni bekliyor" kendiliginden acmaz (5 sn bakis yok): cene amber yanar, o kadar.
// Hap baslik satirindan suruklenir (main pencereyi imlecle tasir), merkeze yakinsa ortaya oturur.
//
// Pencere saydam, bu yuzden zemin kendi tonunu tasir (ada-zemin, ~%92 opak): arkada ne
// olursa olsun metin okunur. backdrop-filter yok — saydam pencerede masaustunu bulaniklastiramaz.

const BAKIS_MS = 5000;
/** Soru ekrani PreToolUse hook'undan sonra cizilir; rakam ondan once giderse girdi kutusuna duser. */
const SORU_HAZIR_MS = 800;
const CIP_SAYISI = 3;
/** Kanca bir an sonra gelir; bu surede durum degismediyse (oturum kapali, yazilamadi) eylemler geri gelir. */
const GONDERILDI_MS = 15_000;

/** Bitti anindaki sevinc (gulen gozler + tek zipla) bu kadar surer, sonra sakin "bitti". */
const SEVINC_MS = 8000;
/** Hicbir oturumda bu kadar olay yoksa Ada uyur; ilk olayda uyanir. */
const UYKU_MS = 30 * 60 * 1000;
/** SubagentStop kacarsa alt ajan noktasi bu kadar sessizlikten sonra duser (etkinlik.cjs ile ayni). */
const ALT_AJAN_MS = 15 * 60 * 1000;

const SIRA: Record<OturumEtkinligi['durum'], number> = { bekliyor: 0, calisiyor: 1, bitti: 2, bosta: 3, kapandi: 4 };
/** Gorev gonderildi bildirimi bu kadar kalir; oturum satiri zaten listede belirir. */
const GOREV_BILDIRIM_MS = 6000;
/**
 * Saklanmis Ada'nin cenesi imlec bu kadar ustunde durunca sarkar. Cene ekranin ust kenarinda; tarayici
 * sekmesine giderken imlec ondan gecer, gecmek acmasin (niyetli bakis).
 */
const SARKMA_MS = 380;
/** Bu kadar (px) yatay kayan basma surukleme sayilir; altinda tiklamadir. */
const SURUKLE_ESIK_PX = 5;

/**
 * Sifirlanma ani gectiyse pencere yenilendi: kullanim sifirdan baslar. Sonraki olcum (oturumun
 * statusline'i ya da 5 dakikalik yoklama) gercek degeri getirir.
 */
function etkinYuzde(l: Limit | null | undefined, simdi: number) {
  if (!l) return null;
  return l.sifirlanma && l.sifirlanma <= simdi ? 0 : l.yuzde;
}

function siraSende(e: OturumEtkinligi | null) {
  return e?.durum === 'bekliyor' || e?.durum === 'bitti';
}

/** Sira sende olan oturumun ne zamandir bekledigi (durum degisiminden beri). */
function bekleme(e: OturumEtkinligi, simdi: number) {
  return sureMetni(Math.max(0, Math.floor((simdi - (e.durumZamani ?? e.degisti)) / 1000)));
}

/**
 * Ada odak almaz (focusable: false), tiklama bir yazi kutusuna odak veremez. Once main pencereyi
 * odaklanabilir yapar (ada.odak), sonra kutu elle odaklanir.
 */
function odakIste(el: HTMLElement | null) {
  window.kokpit.adaOdak(true);
  setTimeout(() => el?.focus(), 60);
}

export default function Ada() {
  const [liste, setListe] = useState<AdaOturumu[]>([]);
  const [anlik, setAnlik] = useState<EtkinlikAnlik | null>(null);
  const [komutlar, setKomutlar] = useState<HizliKomut[]>([]);
  const [uzerinde, setUzerinde] = useState(false);
  const [odakta, setOdakta] = useState(false);
  const [bakis, setBakis] = useState(false);
  const [simdi, setSimdi] = useState(() => Date.now());
  // Gonderilen oturumlar: durum degisene kadar "gönderildi" yazar (kanca bir an sonra gelir).
  const [gonderilen, setGonderilen] = useState<Record<string, number>>({});
  // Klavye kisayolu: kart acildiktan SONRA ilk eylem odaklanir (kapaliyken eylemler cizilmez).
  const [klavyeIstegi, setKlavyeIstegi] = useState(0);
  const bakisZamani = useRef<ReturnType<typeof setTimeout> | null>(null);
  const kart = useRef<HTMLDivElement>(null);
  const listeRef = useRef(liste);
  listeRef.current = liste;
  const anlikRef = useRef(anlik);
  anlikRef.current = anlik;
  // Goz: her gonderimde bir kez bas sallar; imlec kartin ustundeyken gozler onu izler.
  const [onay, setOnay] = useState(0);
  const [takip, setTakip] = useState<{ x: number; y: number } | null>(null);
  const takipKare = useRef(0);
  const gozRef = useRef<HTMLSpanElement>(null);
  // v2.6: gorev hedefleri ve Kokpit disindaki oturumlar (main yayinlar).
  const [projeler, setProjeler] = useState<AdaProjesi[]>([]);
  const [dis, setDis] = useState<DisOturum[]>([]);
  const disRef = useRef(dis);
  // Uyku saati oturum yokken Ada'nin acildigi andan sayar.
  const [acilis] = useState(() => Date.now());
  // v2.7: normal | sakli | sinema (main belirler). Sakli/sinemada kapali Ada yalniz cenedir.
  const [kip, setKip] = useState<AdaKipi>('normal');
  const sarkmaZamani = useRef<ReturnType<typeof setTimeout> | null>(null);
  const surukleme = useRef<{ sx: number; aktif: boolean; kare: number } | null>(null);
  const tiklamaYut = useRef(false);
  const [surukleniyor, setSurukleniyor] = useState(false);

  const bak = useCallback(() => {
    setBakis(true);
    if (bakisZamani.current) clearTimeout(bakisZamani.current);
    bakisZamani.current = setTimeout(() => setBakis(false), BAKIS_MS);
  }, []);

  useEffect(() => {
    void window.kokpit.etkinlikAnlik().then(setAnlik);
    void window.kokpit.komutlarGetir().then(setKomutlar);
    const k1 = window.kokpit.etkinlikDinle(setAnlik);
    const k2 = window.kokpit.adaListeDinle(setListe);
    const k3 = window.kokpit.sinyalDinle(bak);
    const k5 = window.kokpit.adaProjelerDinle(setProjeler);
    const k7 = window.kokpit.adaAyarDinle((a) => setKip(a.kip ?? 'normal'));
    // Dis oturum seni beklemeye gecince Kokpit oturumundaki gibi 5 sn acilir.
    const k6 = window.kokpit.adaDisDinle((l) => {
      const once = new Map(disRef.current.map((d) => [d.pid, d.durum]));
      if (l.some((d) => d.durum === 'bekliyor' && once.get(d.pid) !== 'bekliyor' && once.has(d.pid))) bak();
      disRef.current = l;
      setDis(l);
    });
    const k4 = window.kokpit.adaKlavyeDinle(({ anaOdakta }) => {
      if (anaOdakta) {
        // Kokpit zaten onde (ada gizli): kisayol sirasi gelen oturuma orada goturur.
        const oturumlar = anlikRef.current?.oturumlar ?? {};
        const sirali = [...listeRef.current].sort(
          (a, b) => SIRA[oturumlar[a.id]?.durum ?? 'bosta'] - SIRA[oturumlar[b.id]?.durum ?? 'bosta']
        );
        const hedef = sirali.find((o) => siraSende(oturumlar[o.id] ?? null)) ?? sirali[0];
        if (hedef) window.kokpit.adaGit(hedef.id);
        return;
      }
      void window.kokpit.komutlarGetir().then(setKomutlar);
      setOdakta(true);
      setKlavyeIstegi((n) => n + 1);
    });
    const t = setInterval(() => setSimdi(Date.now()), 1000);
    return () => {
      k1();
      k2();
      k3();
      k4();
      k5();
      k6();
      k7();
      clearInterval(t);
      if (sarkmaZamani.current) clearTimeout(sarkmaZamani.current);
    };
  }, [bak]);

  useEffect(() => {
    if (klavyeIstegi === 0) return;
    const id = requestAnimationFrame(() => {
      const hedef = kart.current?.querySelector<HTMLElement>('[data-eylem]:not(:disabled)') ?? kart.current?.querySelector<HTMLElement>('button');
      hedef?.focus();
    });
    return () => cancelAnimationFrame(id);
  }, [klavyeIstegi]);

  const fare = useCallback((icinde: boolean) => {
    setUzerinde(icinde);
    if (!icinde) setTakip(null);
    if (icinde) void window.kokpit.komutlarGetir().then(setKomutlar);
    window.kokpit.adaFare(icinde);
  }, []);

  /**
   * Cene: imlec gelince tiklamalar hemen Ada'nin (cene tiklanir), kart ise SARKMA_MS sonra sarkar.
   * Imlec once ayrilirsa hicbir sey acilmaz.
   */
  const ceneFare = useCallback(
    (icinde: boolean) => {
      if (sarkmaZamani.current) clearTimeout(sarkmaZamani.current);
      sarkmaZamani.current = null;
      if (!icinde) return fare(false);
      window.kokpit.adaFare(true);
      sarkmaZamani.current = setTimeout(() => fare(true), SARKMA_MS);
    },
    [fare]
  );

  /** Kenara sakla / geri getir. Kart hemen kapanir; imlec karttan ayrilmis sayilir. */
  const saklaDegistir = useCallback(
    (istek: boolean) => {
      window.kokpit.adaSakla(istek);
      if (sarkmaZamani.current) clearTimeout(sarkmaZamani.current);
      setBakis(false);
      (document.activeElement as HTMLElement | null)?.blur();
      fare(false);
    },
    [fare]
  );

  // Surukleme: baslik satirinda basili tutup yatay kaydirinca main pencereyi imlecle tasir.
  const surukleBasla = (ev: ReactPointerEvent<HTMLButtonElement>) => {
    if (ev.button !== 0) return;
    surukleme.current = { sx: ev.screenX, aktif: false, kare: 0 };
  };
  const surukleHareket = (ev: ReactPointerEvent<HTMLButtonElement>) => {
    const s = surukleme.current;
    if (!s) return;
    if (!s.aktif) {
      if (Math.abs(ev.screenX - s.sx) < SURUKLE_ESIK_PX) return;
      s.aktif = true;
      ev.currentTarget.setPointerCapture(ev.pointerId);
      setSurukleniyor(true);
      window.kokpit.adaTasi('basla');
    }
    if (s.kare) return;
    s.kare = requestAnimationFrame(() => {
      s.kare = 0;
      window.kokpit.adaTasi('surukle');
    });
  };
  const surukleBit = (ev: ReactPointerEvent<HTMLButtonElement>) => {
    const s = surukleme.current;
    surukleme.current = null;
    if (!s?.aktif) return;
    if (s.kare) cancelAnimationFrame(s.kare);
    window.kokpit.adaTasi('surukle');
    window.kokpit.adaTasi('bit');
    tiklamaYut.current = true; // birakmanin ardindan gelen click Kokpit'i acmasin
    setSurukleniyor(false);
    if (ev.currentTarget.hasPointerCapture(ev.pointerId)) ev.currentTarget.releasePointerCapture(ev.pointerId);
  };

  const gonder = useCallback((istek: GonderIstegi) => {
    window.kokpit.adaGonder(istek);
    setGonderilen((g) => ({ ...g, [istek.id]: Date.now() }));
    setOnay((n) => n + 1);
    // Gonderdikten sonra odak birakilir: ada isini yapti, Scryne kaldigi yere doner.
    (document.activeElement as HTMLElement | null)?.blur();
  }, []);

  const gorevGonder = useCallback((g: { ad: string; metin: string }) => {
    window.kokpit.adaGorev(g);
    setOnay((n) => n + 1);
  }, []);

  const satirlar = liste
    .map((o) => ({ o, e: anlik?.oturumlar[o.id] ?? null }))
    .sort((a, b) => SIRA[a.e?.durum ?? 'bosta'] - SIRA[b.e?.durum ?? 'bosta']);

  const bekleyen = satirlar.filter((x) => x.e?.durum === 'bekliyor');
  const calisan = satirlar.filter((x) => x.e?.durum === 'calisiyor');
  const biten = satirlar.filter((x) => x.e?.durum === 'bitti' && x.o.dikkat);
  const disBekleyen = dis.filter((d) => d.durum === 'bekliyor');
  const disCalisan = dis.filter((d) => d.durum === 'calisiyor');
  const ilk = bekleyen[0] ?? calisan[0] ?? biten[0] ?? null;
  // Uyku: hicbir oturum (Kokpit'in ya da disaridaki) calismiyor/beklemiyor ve en son olay UYKU_MS'den eski.
  const sonOlay = Math.max(
    acilis,
    ...satirlar.map(({ o, e }) => e?.degisti ?? o.baslangic ?? simdi),
    ...dis.map((d) => d.degisti ?? d.baslangic ?? acilis)
  );
  const uyku =
    !bekleyen.length && !calisan.length && !disBekleyen.length && !disCalisan.length && simdi - sonOlay > UYKU_MS;
  const sessizlik = uyku ? sureMetni(Math.floor((simdi - sonOlay) / 1000)) : null;
  const toplam = satirlar.length + dis.length;
  const ozet = bekleyen.length
    ? bekleyen[0].o.ad + ' seni bekliyor' + (bekleyen.length > 1 ? ' +' + (bekleyen.length - 1) : '')
    : calisan.length
      ? calisan[0].o.ad + ' · ' + etkinlikCumlesi(calisan[0].e!, simdi)
      : biten.length
        ? biten[0].o.ad + ' bitti' + (biten.length > 1 ? ' +' + (biten.length - 1) : '')
        : disBekleyen.length
          ? disBekleyen[0].ad + ' seni bekliyor · Kokpit dışında'
          : disCalisan.length
            ? disCalisan[0].ad + ' çalışıyor · Kokpit dışında'
            : uyku
              ? (toplam ? toplam + ' oturum · ' : '') + sessizlik + ' sessiz'
              : toplam
                ? toplam + ' oturum · hazır'
                : 'Hazır';
  // Hapta bekleme suresi: "seni bekliyor" ne zamandir? (calisan oturumun suresi cumlesinde)
  const ozetSure = bekleyen.length ? bekleme(bekleyen[0].e!, simdi) : !calisan.length && biten.length ? bekleme(biten[0].e!, simdi) : null;
  // Gozun hali: soru > yeni biten (kisa sevinc) > calisan > bitti > uyku > bosta.
  const taze = satirlar.find(({ e }) => e?.durum === 'bitti' && simdi - (e.durumZamani ?? e.degisti) < SEVINC_MS);
  const gozHali: GozHali = bekleyen.length || disBekleyen.length
    ? 'bekliyor'
    : taze
      ? 'mutlu'
      : calisan.length || disCalisan.length
        ? 'calisiyor'
        : biten.length && !uyku
          ? 'bitti'
          : uyku
            ? 'uyku'
            : 'bosta';
  const altSayisi = satirlar.reduce(
    (n, { e }) => n + Object.values(e?.altlar ?? {}).filter((a) => simdi - a.t < ALT_AJAN_MS).length,
    0
  );
  const l = anlik?.limitler;
  const bes = etkinYuzde(l?.besSaat, simdi);
  const haf = etkinYuzde(l?.hafta, simdi);
  const saklandi = kip !== 'normal';
  // Saklanmisken kendiliginden bakis yok: Scryne gizledi, cene amber yanar ama kart acilmaz.
  const genis = uzerinde || odakta || (bakis && !saklandi);
  const soruVar = bekleyen.some((x) => x.e?.soruAyrinti?.cevaplanabilir);

  if (saklandi && !genis) {
    const bekliyor = gozHali === 'bekliyor';
    return (
      <div className="flex justify-center">
        <button
          type="button"
          className="ada-cene-alan cursor-pointer"
          onMouseEnter={() => ceneFare(true)}
          onMouseLeave={() => ceneFare(false)}
          // Tik beklemeden sarkitir.
          onClick={() => {
            if (sarkmaZamani.current) clearTimeout(sarkmaZamani.current);
            fare(true);
          }}
          aria-label={'Ada saklı: ' + ozet + '. Açmak için tıkla'}
          title={ozet}
        >
          <span className="ada-cene" data-hal={bekliyor ? 'bekliyor' : gozHali === 'uyku' ? 'uyku' : undefined}>
            <i />
            <i />
          </span>
        </button>
      </div>
    );
  }

  return (
    <div className={'flex justify-center ' + (saklandi ? '' : 'pt-1.5') + (surukleniyor ? ' ada-surukleniyor' : '')}>
      <div
        ref={kart}
        onMouseEnter={() => fare(true)}
        onMouseLeave={() => fare(false)}
        onPointerMove={(ev) => {
          // Gozler imleci izler (en fazla ~1,6 px); kare basina bir guncelleme.
          if (takipKare.current) return;
          const x = ev.clientX;
          const y = ev.clientY;
          takipKare.current = requestAnimationFrame(() => {
            takipKare.current = 0;
            const r = gozRef.current?.getBoundingClientRect();
            if (!r) return;
            const dx = x - (r.left + r.width / 2);
            const dy = y - (r.top + r.height / 2);
            const sinirla = (v: number, m: number) => Math.max(-m, Math.min(m, v));
            setTakip({ x: Math.round(sinirla(dx / 40, 1.6) * 10) / 10, y: Math.round(sinirla(dy / 40, 1.1) * 10) / 10 });
          });
        }}
        onFocus={() => {
          // Odak almayan pencerede de oge DOM odagi alabilir; o "klavye ada'da" demek degil.
          if (document.hasFocus()) setOdakta(true);
        }}
        onBlur={() => {
          // Karar bir an sonra: cevap verilince odakli oge DOM'dan kalkar ve odak bir sonraki
          // soruya gecer (rAF). O arada birakilsaydi pencere odagi da giderdi. Odak hala kartin
          // icindeyse birakma; disari ciktiysa (Esc, gonderim, baska pencere) ada odak almaz olur.
          setTimeout(() => {
            const a = document.activeElement;
            if (document.hasFocus() && a && a !== document.body && kart.current?.contains(a)) return;
            setOdakta(false);
            window.kokpit.adaOdak(false);
          }, 80);
        }}
        onKeyDown={(ev) => {
          if (ev.key === 'Escape' && !(ev.target instanceof HTMLInputElement && ev.target.value)) {
            ev.preventDefault();
            (document.activeElement as HTMLElement | null)?.blur();
          }
        }}
        className={
          'ada-kart halka relative overflow-hidden text-metin ' +
          (genis ? 'ada-acik w-[440px] rounded-2xl' : 'rounded-full') +
          (saklandi ? ' ada-sarkan' : '')
        }
      >
        <div className="flex items-center">
        <button
          type="button"
          data-ada-ana
          // Sirasi gelen oturum yoksa Kokpit'in kendisi one gelir (bos kimlik). Surukleme bittiyse yutulur.
          onClick={() => {
            if (tiklamaYut.current) {
              tiklamaYut.current = false;
              return;
            }
            window.kokpit.adaGit(ilk ? ilk.o.id : '');
          }}
          onPointerDown={surukleBasla}
          onPointerMove={surukleHareket}
          onPointerUp={surukleBit}
          onPointerCancel={surukleBit}
          title="Tıkla: Kokpit'e git · Sürükle: yerini değiştir"
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 py-2 pl-3.5 pr-3.5 text-left text-xs"
        >
          <span ref={gozRef} className="-my-1 -ml-1 flex">
            <AdaGoz hal={gozHali} poz={gozPozu(calisan[0]?.e ?? null, simdi)} altSayisi={altSayisi} onay={onay} takip={takip} />
          </span>
          {/* Metin degisince (arac, durum) yumusak gecis. Sayilar anahtar disi: sayan sure her saniye metni yeniden dogurup titretiyordu. */}
          <span
            key={ozet.replace(/\d+/g, '#')}
            className={
              'ada-metin min-w-0 truncate ' +
              (bekleyen.length || disBekleyen.length ? 'text-dikkat-metin' : uyku || !toplam ? 'text-metin-ikincil' : 'text-metin')
            }
          >
            {ozet}
          </span>
          {altSayisi > 0 && <span className="sr-only">, {altSayisi} alt ajan çalışıyor</span>}
          {ozetSure && <span className="enstruman shrink-0 text-metin-soluk">{ozetSure}</span>}
          {(bes !== null || haf !== null) && (
            <span className="enstruman ml-auto flex shrink-0 gap-2 pl-2 text-metin-soluk">
              {bes !== null && (
                <span title="5 saatlik limit" className={bes >= 80 ? 'text-dikkat-metin' : undefined}>
                  5s %{Math.round(bes)}
                </span>
              )}
              {haf !== null && (
                <span title="Haftalık limit" className={haf >= 80 ? 'text-dikkat-metin' : undefined}>
                  hafta %{Math.round(haf)}
                </span>
              )}
            </span>
          )}
        </button>
        {/* Kenara sakla / geri getir: yalniz acik kartta (kapali hap kompakt kalir). Sinemada yok:
            orada Ada kendiliginden cekildi, tam ekran bitince yerine doner. */}
        {genis && kip !== 'sinema' && (
          <button
            type="button"
            onClick={() => saklaDegistir(kip === 'normal')}
            aria-label={kip === 'normal' ? 'Kenara sakla' : 'Geri getir'}
            title={(kip === 'normal' ? 'Kenara sakla' : 'Geri getir') + ' (Ctrl+Alt+Shift+G)'}
            className="mr-2 shrink-0 cursor-pointer rounded-kontrol p-1 text-metin-soluk transition-colors duration-[120ms] hover:bg-yuzey-guclu hover:text-metin"
          >
            {kip === 'normal' ? (
              <ArrowUpToLine className="size-3.5" aria-hidden="true" />
            ) : (
              <ArrowDownFromLine className="size-3.5" aria-hidden="true" />
            )}
          </button>
        )}
        </div>

        {!genis && bes !== null && <LimitKenari kart={kart} yuzde={bes} />}
        {genis && (
          <div className="max-h-[440px] overflow-y-auto border-t border-kenar px-1.5 pb-1.5 pt-1">
            {toplam === 0 && <p className="px-2 py-1.5 text-xs text-metin-soluk">Açık claude oturumu yok.</p>}
            <ul aria-label="Kokpit oturumları" hidden={satirlar.length === 0}>
              {satirlar.map(({ o, e }) => (
                <AdaSatiri
                  key={o.id}
                  o={o}
                  e={e}
                  simdi={simdi}
                  komutlar={komutlar}
                  gonderildi={
                    gonderilen[o.id] !== undefined &&
                    e !== null &&
                    e.degisti <= gonderilen[o.id] &&
                    simdi - gonderilen[o.id] < GONDERILDI_MS
                  }
                  onGonder={gonder}
                />
              ))}
            </ul>
            {dis.length > 0 && <DisOturumlar dis={dis} simdi={simdi} ayrac={satirlar.length > 0} />}
            {projeler.length > 0 && <GorevKutusu projeler={projeler} onGonder={gorevGonder} />}
            <AdaLimitler l={l ?? null} durum={anlik?.limitDurumu} simdi={simdi} />
          </div>
        )}
        {/* Klavye ipucu kaydirma alaninin disinda: uzun listede de gorunsun. */}
        {genis && odakta && (
          <p className="border-t border-kenar px-3.5 py-1 text-[0.6875rem] text-metin-soluk">
            {soruVar && (
              <>
                <span className="enstruman">1–4</span> seçer ·{' '}
              </>
            )}
            <span className="enstruman">Tab</span> gezinir · <span className="enstruman">Esc</span> bırakır
          </p>
        )}
      </div>
    </div>
  );
}

function AdaSatiri({
  o,
  e,
  simdi,
  komutlar,
  gonderildi,
  onGonder,
}: {
  o: AdaOturumu;
  e: OturumEtkinligi | null;
  simdi: number;
  komutlar: HizliKomut[];
  gonderildi: boolean;
  onGonder: (istek: GonderIstegi) => void;
}) {
  const sende = siraSende(e);
  const s = e?.durum === 'bekliyor' ? e.soruAyrinti ?? null : null;
  return (
    <li>
      <button
        type="button"
        onClick={() => window.kokpit.adaGit(o.id)}
        className="grid w-full cursor-pointer grid-cols-[0.75rem_6.5rem_minmax(0,1fr)_auto] items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition-colors duration-[120ms] hover:bg-yuzey-guclu"
      >
        <DurumIsareti durum={e?.durum ?? 'bosta'} />
        <span className="enstruman truncate text-metin">{o.ad}</span>
        <span className={'truncate ' + (e?.durum === 'bekliyor' ? 'text-dikkat-metin' : 'text-metin-ikincil')}>
          {/* Soru asagida tam haliyle duruyor; satir tekrar etmesin, basligi yeter. */}
          {s
            ? 'Seni bekliyor' + (s.sorular.length > 1 ? ' · ' + s.sorular.length + ' soru' : s.sorular[0]?.baslik ? ' · ' + s.sorular[0].baslik : '')
            : e
              ? etkinlikCumlesi(e, simdi)
              : 'Hazır'}
        </span>
        {/* Sira sendeyse: ne zamandir bekliyor. Degilse: oturum ne zamandir acik. */}
        <span className="enstruman text-metin-soluk" title={sende ? 'Sıra sende' : 'Oturum süresi'}>
          {e && sende ? bekleme(e, simdi) : o.baslangic ? sureMetni(Math.floor((simdi - o.baslangic) / 1000)) : ''}
        </span>
      </button>
      {sende && e && (
        <div className="space-y-1.5 px-2 pb-2 pl-[1.75rem]">
          {e.durum === 'bitti' && e.sonSoz && <SonSoz metin={e.sonSoz} yeni={o.dikkat} />}
          {gonderildi ? (
            <p role="status" className="text-xs text-metin-soluk">
              Gönderildi, claude'a iletiliyor.
            </p>
          ) : e.durum === 'bekliyor' ? (
            s ? (
              <SoruFormu key={e.soruZamani ?? e.degisti} ad={o.ad} id={o.id} s={s} damga={e.soruZamani ?? e.degisti} onGonder={onGonder} />
            ) : (
              // Izin istemi / elicitation gibi secenegi bilinmeyen beklemeler: yazmak riskli, terminale.
              <p className="text-xs text-metin-soluk">Cevabı terminalde ver: satıra tıkla.</p>
            )
          ) : (
            <BittiEylemleri ad={o.ad} id={o.id} dikkat={o.dikkat} komutlar={komutlar} onGonder={onGonder} />
          )}
        </div>
      )}
    </li>
  );
}

/**
 * Turun son sozu (Stop hook'unun last_assistant_message'i). Yeni (bakilmamis) ise dort satir,
 * bakildiysa bir satir; "Tamamı" kaydirilabilir tam metni acar. Duz metin: markdown cizilmez.
 */
function SonSoz({ metin, yeni }: { metin: string; yeni: boolean }) {
  const [tam, setTam] = useState(false);
  const kisa = metin.length <= 120 && !metin.includes('\n');
  return (
    <div className="text-xs">
      <p
        className={
          'whitespace-pre-line break-words text-metin-ikincil ' +
          (tam ? 'max-h-56 overflow-y-auto pr-1' : yeni ? 'line-clamp-4' : 'line-clamp-1')
        }
      >
        {/* Kisa gorunumde paragraf boslugu dort satirin yarisini yiyordu (ekran-ada); tamami acikken kalir. */}
        {tam ? metin : metin.replace(/\n{2,}/g, '\n')}
      </p>
      {!kisa && (
        <button
          type="button"
          onClick={() => setTam((x) => !x)}
          aria-expanded={tam}
          className="cursor-pointer text-metin-soluk underline decoration-kenar-guclu underline-offset-2 transition-colors duration-[120ms] hover:text-metin"
        >
          {tam ? 'Daralt' : 'Tamamı'}
        </button>
      )}
    </div>
  );
}

/** Bitti: ilk uc hizli komut, yanit kutusu ve (bakilmamissa) "Gördüm". */
function BittiEylemleri({
  ad,
  id,
  dikkat,
  komutlar,
  onGonder,
}: {
  ad: string;
  id: string;
  dikkat: boolean;
  komutlar: HizliKomut[];
  onGonder: (istek: GonderIstegi) => void;
}) {
  return (
    <>
      {(komutlar.length > 0 || dikkat) && (
        <div role="group" aria-label={ad + ' hızlı komutlar'} className="flex flex-wrap items-center gap-1">
          {komutlar.slice(0, CIP_SAYISI).map((k) => (
            <button
              key={k.ad}
              type="button"
              data-eylem
              onClick={() => onGonder({ id, tur: 'metin', metin: k.metin })}
              title={k.metin}
              className="cursor-pointer rounded-full border border-kenar px-2.5 py-0.5 text-xs text-metin-ikincil transition-colors duration-[120ms] hover:border-kenar-guclu hover:text-metin"
            >
              {k.ad}
            </button>
          ))}
          {dikkat && (
            <button
              type="button"
              onClick={() => window.kokpit.adaGordum(id)}
              title="Bitti işaretini kaldır; oturuma bir şey gönderilmez"
              aria-label={ad + ': gördüm, bitti işaretini kaldır'}
              className="ml-auto cursor-pointer px-1 text-xs text-metin-soluk transition-colors duration-[120ms] hover:text-metin"
            >
              Gördüm
            </button>
          )}
        </div>
      )}
      <YanitKutusu
        placeholder={ad + ' oturumuna yaz'}
        etiket={ad + ' oturumuna mesaj'}
        onGonder={(m) => onGonder({ id, tur: 'metin', metin: m })}
      />
    </>
  );
}

/**
 * claude'un sorusu (AskUserQuestion). Tek soru: secenek tiklaninca hemen gider (claude'un kendi
 * davranisi: rakam secip gonderir). Cok soru: her soruya bir cevap secilir ya da yazilir, sonra
 * "Gönder" tum diziyi gonderir. Rakam tusu (1–4) odaktaki sorunun secenegini secer.
 * Coklu secim / secenegi olmayan soru: terminale yonlendirilir.
 */
function SoruFormu({
  ad,
  id,
  s,
  damga,
  onGonder,
}: {
  ad: string;
  id: string;
  s: SoruAyrintisi;
  damga: number;
  onGonder: (istek: GonderIstegi) => void;
}) {
  const n = s.sorular.length;
  const [cevaplar, setCevaplar] = useState<(SoruCevabi | null)[]>(() => s.sorular.map(() => null));
  const [yazilan, setYazilan] = useState<number | null>(null);
  const kok = useRef<HTMLDivElement>(null);
  // Kendi zamanlayicisi: saniyelik saate baglansaydi dugmeler 800 ms yerine 1,8 sn'ye kadar kapali
  // kalabiliyordu (test-ui'da kararsizlik olarak goruldu).
  const [hazir, setHazir] = useState(() => Date.now() - damga >= SORU_HAZIR_MS);
  useEffect(() => {
    if (hazir) return;
    const t = setTimeout(() => setHazir(true), Math.max(0, damga + SORU_HAZIR_MS - Date.now()));
    return () => clearTimeout(t);
  }, [damga, hazir]);

  if (!s.cevaplanabilir) {
    return (
      <p className="text-xs text-metin-soluk">
        {s.coklu ? 'Çoklu seçim' : 'Seçeneksiz soru'}; terminalden cevapla: satıra tıkla.
      </p>
    );
  }

  const tamam = cevaplar.every((c) => c !== null);
  const gonder = (liste: SoruCevabi[]) => onGonder({ id, tur: 'cevap', cevaplar: liste, damga });
  /** Cevap verildi: tek soruysa gider; cok soruda sonraki sorunun ilk secenegine odak gecer. */
  const cevapla = (i: number, c: SoruCevabi) => {
    if (n === 1) return gonder([c]);
    setCevaplar((l) => l.map((x, j) => (j === i ? c : x)));
    setYazilan(null);
    // Klavyeyle cevaplaniyorsa odak sonraki soruya gecer; fareyle (pencere odaksiz) dokunulmaz.
    if (!document.hasFocus()) return;
    requestAnimationFrame(() => {
      const sonraki = kok.current?.querySelector<HTMLElement>(`[data-soru="${i + 1}"] [data-eylem]`);
      (sonraki ?? kok.current?.querySelector<HTMLElement>('[data-gonder]'))?.focus();
    });
  };

  return (
    <div ref={kok} className="grid gap-2">
      {s.sorular.map((q, i) => {
        const c = cevaplar[i];
        return (
          <div
            key={i}
            role="group"
            data-soru={i}
            aria-label={ad + (n > 1 ? ' soru ' + (i + 1) + ': ' : ' sorusu: ') + q.soru}
            className="grid gap-1"
            onKeyDown={(ev) => {
              if (ev.target instanceof HTMLInputElement || ev.ctrlKey || ev.altKey || ev.metaKey) return;
              const k = Number(ev.key);
              if (hazir && Number.isInteger(k) && k >= 1 && k <= q.secenekler.length) {
                ev.preventDefault();
                cevapla(i, k - 1);
              }
            }}
          >
            <p className="text-xs text-metin">
              {n > 1 && q.baslik && <span className="etiket mr-1.5">{q.baslik}</span>}
              {q.soru}
            </p>
            {q.secenekler.map((sec, j) => {
              const secili = c === j;
              return (
                <button
                  key={j}
                  type="button"
                  data-eylem
                  disabled={!hazir}
                  aria-pressed={n > 1 ? secili : undefined}
                  onClick={() => cevapla(i, j)}
                  title={sec.aciklama || sec.etiket}
                  className={
                    'flex w-full cursor-pointer items-baseline gap-2 rounded-lg border px-2 py-1 text-left text-xs transition-colors duration-[120ms] hover:border-kenar-guclu hover:bg-yuzey-guclu disabled:cursor-default disabled:opacity-60 ' +
                    (secili ? 'border-kenar-guclu bg-yuzey-guclu' : 'border-kenar')
                  }
                >
                  <span className="enstruman w-3 shrink-0 text-metin-soluk">
                    {secili ? <Check className="inline size-3 text-metin" aria-hidden="true" /> : j + 1}
                  </span>
                  <span className="shrink-0 text-metin">{sec.etiket}</span>
                  {sec.aciklama && <span className="min-w-0 truncate text-metin-soluk">{sec.aciklama}</span>}
                </button>
              );
            })}
            {/* Serbest cevap: tek soruda kutu hep acik; cok soruda "Kendi cevabın" satiri kutuyu acar. */}
            {n === 1 || yazilan === i ? (
              <YanitKutusu
                placeholder="Kendi cevabın"
                etiket={ad + (n > 1 ? ' soru ' + (i + 1) : ' sorusu') + ': kendi cevabın'}
                disabled={!hazir}
                kendiliginden={n > 1}
                baslangic={typeof c === 'string' ? c : ''}
                onGonder={(m) => cevapla(i, m)}
                onVazgec={n > 1 ? () => setYazilan(null) : undefined}
              />
            ) : typeof c === 'string' ? (
              <button
                type="button"
                aria-pressed
                onClick={() => setYazilan(i)}
                title="Cevabı düzenle"
                className="flex w-full cursor-pointer items-baseline gap-2 rounded-lg border border-kenar-guclu bg-yuzey-guclu px-2 py-1 text-left text-xs"
              >
                <Check className="inline size-3 shrink-0 text-metin" aria-hidden="true" />
                <span className="min-w-0 truncate text-metin">{c}</span>
              </button>
            ) : (
              <button
                type="button"
                disabled={!hazir}
                onClick={() => setYazilan(i)}
                className="w-fit cursor-pointer px-2 text-left text-xs text-metin-soluk transition-colors duration-[120ms] hover:text-metin disabled:cursor-default disabled:opacity-60"
              >
                Kendi cevabın…
              </button>
            )}
          </div>
        );
      })}
      {n > 1 && (
        <div className="flex items-center justify-between gap-2">
          <span className="enstruman text-xs text-metin-soluk" aria-live="polite">
            {cevaplar.filter((x) => x !== null).length}/{n}
          </span>
          <button
            type="button"
            data-gonder
            disabled={!tamam || !hazir}
            onClick={() => tamam && gonder(cevaplar as SoruCevabi[])}
            className="cursor-pointer rounded-kontrol bg-birincil px-3 py-1 text-xs font-medium text-birincil-uzeri transition-colors duration-[120ms] hover:bg-metin-ikincil disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cevapları gönder
          </button>
        </div>
      )}
    </div>
  );
}

/** Tek satirlik yazi kutusu: Enter gonderir, Esc once metni sonra odagi birakir. */
function YanitKutusu({
  placeholder,
  etiket,
  disabled,
  kendiliginden,
  baslangic = '',
  onGonder,
  onVazgec,
}: {
  placeholder: string;
  etiket: string;
  disabled?: boolean;
  /** Acilir acilmaz odaklan (cok soruda "Kendi cevabın"a tiklandi). */
  kendiliginden?: boolean;
  baslangic?: string;
  onGonder: (metin: string) => void;
  onVazgec?: () => void;
}) {
  const [metin, setMetin] = useState(baslangic);
  const kutu = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (kendiliginden) odakIste(kutu.current);
  }, [kendiliginden]);
  const gonder = () => {
    const m = metin.trim();
    if (!m) return;
    onGonder(m);
    setMetin('');
  };
  return (
    <form
      onSubmit={(ev) => {
        ev.preventDefault();
        gonder();
      }}
      className="flex items-center gap-1 rounded-lg border border-kenar bg-terminal/60 pr-1 focus-within:border-kenar-guclu"
    >
      <input
        ref={kutu}
        type="text"
        data-eylem
        value={metin}
        onChange={(ev) => setMetin(ev.target.value)}
        onMouseDown={(ev) => {
          if (document.activeElement !== ev.currentTarget) odakIste(ev.currentTarget);
        }}
        onKeyDown={(ev) => {
          if (ev.key === 'Escape' && metin) {
            ev.preventDefault();
            ev.stopPropagation();
            setMetin('');
          } else if (ev.key === 'Escape' && onVazgec) {
            ev.stopPropagation();
            onVazgec();
          }
        }}
        disabled={disabled}
        maxLength={2000}
        placeholder={placeholder}
        aria-label={etiket}
        spellCheck={false}
        className="cercevesiz-odak min-w-0 flex-1 bg-transparent px-2 py-1 text-xs text-metin placeholder:text-metin-soluk"
      />
      <button
        type="submit"
        disabled={!metin.trim()}
        aria-label="Gönder"
        title="Gönder (Enter)"
        className="shrink-0 cursor-pointer rounded p-0.5 text-metin-soluk transition-colors duration-[120ms] hover:text-metin disabled:cursor-default disabled:opacity-40"
      >
        <CornerDownLeft className="size-3.5" aria-hidden="true" />
      </button>
    </form>
  );
}

const DIS_DURUM: Record<DisOturum['durum'], string> = { calisiyor: 'Çalışıyor', bekliyor: 'Seni bekliyor', hazir: 'Hazır' };

/**
 * Kokpit disinda acilmis claude oturumlari (terminal, VS Code). Salt okunur: Kokpit onlara yazamaz
 * (PTY'leri baskasinin), yalniz ne yaptiklarini gosterir. Tam yol satirin title'inda.
 */
function DisOturumlar({ dis, simdi, ayrac }: { dis: DisOturum[]; simdi: number; ayrac: boolean }) {
  return (
    <section aria-label="Kokpit dışındaki claude oturumları" className={ayrac ? 'mt-1 border-t border-kenar pt-1' : ''}>
      <p className="etiket px-2 pb-0.5 pt-1">Kokpit dışında</p>
      <ul>
        {dis.map((d) => (
          <li
            key={d.pid}
            title={d.yol}
            className="grid grid-cols-[0.75rem_6.5rem_minmax(0,1fr)_auto] items-center gap-2 px-2 py-1.5 text-xs"
          >
            <DurumIsareti durum={d.durum === 'hazir' ? 'bosta' : d.durum} />
            <span className="enstruman truncate text-metin-ikincil">{d.ad}</span>
            <span className={'truncate ' + (d.durum === 'bekliyor' ? 'text-dikkat-metin' : 'text-metin-soluk')}>
              {DIS_DURUM[d.durum]}
            </span>
            <span className="enstruman text-metin-soluk" title="Bu durumda geçen süre">
              {d.degisti ? sureMetni(Math.max(0, Math.floor((simdi - d.degisti) / 1000))) : ''}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

const GRUP_ADI: Record<string, string> = { aktif: 'aktif', kullanimda: 'kullanımda', vault: 'Aria' };
const SECILI_PROJE = 'ada-gorev-proje';

/**
 * Gorev ver: proje + metin. Kokpit o projede arka planda yeni bir claude oturumu acar, metin ilk
 * mesaj olur; oturum yukarida satir olarak belirir ve Ada'dan izlenir. Proje secici yerel bir
 * <select> degil: odak almayan saydam pencerede acilir liste guvenilmez, satir icinde liste acilir.
 * Arsiv projeleri listede yok (eski projelere donulmuyor).
 */
function GorevKutusu({
  projeler,
  onGonder,
}: {
  projeler: AdaProjesi[];
  onGonder: (g: { ad: string; metin: string }) => void;
}) {
  const hedefler = projeler.filter((p) => p.grup !== 'arsiv');
  const [secili, setSecili] = useState(() => {
    try {
      return localStorage.getItem(SECILI_PROJE) ?? '';
    } catch {
      return '';
    }
  });
  const [listeAcik, setListeAcik] = useState(false);
  const [bildirim, setBildirim] = useState<string | null>(null);
  useEffect(() => {
    if (!bildirim) return;
    const t = setTimeout(() => setBildirim(null), GOREV_BILDIRIM_MS);
    return () => clearTimeout(t);
  }, [bildirim]);
  const p = hedefler.find((x) => x.ad === secili) ?? hedefler[0];
  if (!p) return null;
  const sec = (ad: string) => {
    setSecili(ad);
    setListeAcik(false);
    try {
      localStorage.setItem(SECILI_PROJE, ad);
    } catch {
      /* depolama kapali: secim bu oturumda kalir */
    }
  };
  return (
    <section aria-label="Görev ver" className="mt-1 border-t border-kenar px-2 pb-1 pt-2">
      <div className="mb-1.5 flex items-center gap-2 text-xs">
        <span className="etiket">Görev ver</span>
        <button
          type="button"
          aria-expanded={listeAcik}
          aria-label={'Proje: ' + p.ad + '. Değiştir'}
          onClick={() => setListeAcik((x) => !x)}
          className="ml-auto flex cursor-pointer items-center gap-1 rounded-full border border-kenar px-2 py-0.5 text-metin-ikincil transition-colors duration-[120ms] hover:border-kenar-guclu hover:text-metin"
        >
          <span className="enstruman">{p.ad}</span>
          <ChevronDown className={'size-3 transition-transform duration-[120ms] ' + (listeAcik ? 'rotate-180' : '')} aria-hidden="true" />
        </button>
      </div>
      {listeAcik && (
        <ul aria-label="Proje seç" className="mb-1.5 max-h-36 overflow-y-auto rounded-lg border border-kenar p-0.5">
          {hedefler.map((x) => (
            <li key={x.ad}>
              <button
                type="button"
                aria-pressed={x.ad === p.ad}
                onClick={() => sec(x.ad)}
                className={
                  'flex w-full cursor-pointer items-baseline justify-between gap-2 rounded px-2 py-1 text-left text-xs transition-colors duration-[120ms] hover:bg-yuzey-guclu ' +
                  (x.ad === p.ad ? 'bg-yuzey-guclu' : '')
                }
              >
                <span className="enstruman truncate text-metin">{x.ad}</span>
                <span className="shrink-0 text-metin-soluk">{GRUP_ADI[x.grup] ?? x.grup}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {bildirim ? (
        <p role="status" className="py-1 text-xs text-metin-soluk">
          {bildirim}
        </p>
      ) : (
        <YanitKutusu
          placeholder={p.ad + ' için ne yapılsın?'}
          etiket={p.ad + ' projesinde yeni oturuma görev'}
          onGonder={(m) => {
            onGonder({ ad: p.ad, metin: m });
            setBildirim(p.ad + ' oturumu açılıyor, görev ilk mesaj olarak gidiyor.');
            (document.activeElement as HTMLElement | null)?.blur();
          }}
        />
      )}
    </section>
  );
}

/** Ölçüm satiri: ne zaman, hangi kaynaktan; yoklama son kez basarisizsa neden. */
function olcumMetni(l: Limitler, durum: LimitDurumu | undefined, simdi: number) {
  const gecen = simdi - l.olculdu;
  const ne =
    gecen < 60_000
      ? 'az önce ölçüldü'
      : 'ölçüldü ' + new Date(l.olculdu).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  const ek =
    durum === 'token-eski'
      ? ' · claude açılınca tazelenir'
      : durum === 'hata'
        ? ' · son yoklama başarısız'
        : durum === 'token-yok'
          ? ' · claude girişi bulunamadı'
          : '';
  return ne + ek;
}

function AdaLimitler({ l, durum, simdi }: { l: Limitler | null; durum: LimitDurumu | undefined; simdi: number }) {
  const [donuyor, setDonuyor] = useState(false);
  const tazele = () => {
    window.kokpit.adaLimitTazele();
    setDonuyor(true);
    setTimeout(() => setDonuyor(false), 1200);
  };
  const tazeleDugmesi = (
    <button
      type="button"
      onClick={tazele}
      aria-label="Limitleri tazele"
      title="Limitleri tazele"
      className="ml-auto shrink-0 cursor-pointer rounded p-0.5 text-metin-soluk transition-colors duration-[120ms] hover:text-metin"
    >
      <RefreshCw className={'size-3 ' + (donuyor ? 'ada-donus' : '')} aria-hidden="true" />
    </button>
  );
  if (!l || (!l.besSaat && !l.hafta)) {
    return (
      <p className="mt-1 flex items-center gap-1 border-t border-kenar px-2 pt-1.5 text-xs text-metin-soluk">
        {durum === 'token-yok' ? 'Limit okunamadı: claude girişi bulunamadı.' : durum === 'token-eski' ? 'Limit, claude açılınca okunur.' : 'Limit ölçülüyor…'}
        {tazeleDugmesi}
      </p>
    );
  }
  return (
    <div className="mt-1 border-t border-kenar px-2 pt-1.5 text-xs">
      <div className="flex gap-4">
        {l.besSaat && <AdaLimit ad="5 saat" l={l.besSaat} simdi={simdi} />}
        {l.hafta && <AdaLimit ad="Hafta" l={l.hafta} simdi={simdi} />}
      </div>
      <p className="mt-1 flex items-center gap-1 text-[0.6875rem] text-metin-soluk">
        <span>{olcumMetni(l, durum, simdi)}</span>
        {tazeleDugmesi}
      </p>
    </div>
  );
}

function AdaLimit({ ad, l, simdi }: { ad: string; l: Limit; simdi: number }) {
  const y = Math.max(0, Math.min(100, Math.round(etkinYuzde(l, simdi) ?? 0)));
  const sifir = sifirlanmaMetni(l.sifirlanma, simdi);
  return (
    <div className="min-w-0 flex-1">
      <div className="flex items-center gap-2">
        <span className="shrink-0 text-metin-soluk">{ad}</span>
        <span
          role="meter"
          aria-label={ad + ' limiti'}
          aria-valuenow={y}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuetext={'%' + y + (sifir ? ', ' + sifir : '')}
          className="h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-kenar-guclu"
        >
          <span
            className={'block h-full rounded-full ' + (y >= 95 ? 'bg-hata' : y >= 80 ? 'bg-dikkat' : 'bg-metin-ikincil')}
            style={{ width: y + '%' }}
          />
        </span>
        <span className={'enstruman shrink-0 ' + (y >= 80 ? 'text-dikkat-metin' : 'text-metin')}>%{y}</span>
      </div>
      {sifir && <p className="mt-0.5 text-[0.6875rem] text-metin-soluk">{sifir}</p>}
    </div>
  );
}

/**
 * Hapin kenari 5 saatlik limitle dolar: ust ortadan baslar, saat yonunde ilerler. Hapin icinde
 * zaten "5s %42" yaziyor; kenar onu bakmadan okunur yapar. %80'de amber, %95'te kirmizi (kenardaki
 * limit olcerleriyle ayni esikler). Kart acikken (koseli kart) cizilmez: orada limit cubuklari var.
 */
function LimitKenari({ kart, yuzde }: { kart: RefObject<HTMLDivElement | null>; yuzde: number }) {
  const [boyut, setBoyut] = useState<{ w: number; h: number } | null>(null);
  useEffect(() => {
    const el = kart.current;
    if (!el) return;
    const olc = () => setBoyut({ w: el.offsetWidth, h: el.offsetHeight });
    olc();
    const g = new ResizeObserver(olc);
    g.observe(el);
    return () => g.disconnect();
  }, [kart]);
  if (!boyut || boyut.w < 40) return null;
  const y = Math.max(0, Math.min(100, yuzde));
  const i = 0.75;
  const { w, h } = boyut;
  const r = h / 2 - i;
  // Stadyum: ust orta -> sag ust -> sag yay -> alt -> sol yay -> ust orta.
  const d = `M ${w / 2} ${i} H ${w - h / 2} A ${r} ${r} 0 0 1 ${w - h / 2} ${h - i} H ${h / 2} A ${r} ${r} 0 0 1 ${h / 2} ${i} Z`;
  const renk = y >= 95 ? 'var(--color-hata)' : y >= 80 ? 'var(--color-dikkat)' : 'rgb(195 200 209 / 0.55)';
  return (
    <svg className="ada-kenar" width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      <path d={d} pathLength={100} stroke={renk} strokeDasharray={`${y} 100`} />
    </svg>
  );
}
