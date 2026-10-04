import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, CornerDownLeft } from 'lucide-react';
import type {
  AdaOturumu,
  EtkinlikAnlik,
  GonderIstegi,
  HizliKomut,
  OturumEtkinligi,
  SoruAyrintisi,
  SoruCevabi,
} from './types';
import { DurumIsareti, etkinlikCumlesi } from './Etkinlik';
import { sureMetni } from './parcalar';

// Ada: Kokpit arka plandayken ekranin ust ortasindaki serit (electron/ada.cjs).
// Kapali: tek satirlik hap — en onemli tek sey. Acik: oturum basina satir + limitler.
// Acilir: imlec uzerine gelince, odak icindeyken (yazi kutusu, Ctrl+Alt+Shift+A) ya da bir
// oturum "bitti/seni bekliyor" dediginde 5 sn (Coucou'nun "notch'tan bakma" ani; ses yok).
//
// v2.3: ada cevap da verir. v2.4: cok sorulu sorular, claude'un son sozu, klavye, "Gördüm".
// Sira sende olan oturumun (bitti / seni bekliyor) altinda: claude soru sorduysa sorular ve
// secenekleri, bittiyse son sozu + hizli komutlar + yanit kutusu. Gonderim main uzerinden ana
// penceredeki PTY'ye gider; Kokpit one gelmez.
//
// Pencere saydam, bu yuzden zemin kendi tonunu tasir (ada-zemin, ~%92 opak): arkada ne
// olursa olsun metin okunur. backdrop-filter yok — saydam pencerede masaustunu bulaniklastiramaz.

const BAKIS_MS = 5000;
/** Soru ekrani PreToolUse hook'undan sonra cizilir; rakam ondan once giderse girdi kutusuna duser. */
const SORU_HAZIR_MS = 800;
const CIP_SAYISI = 3;
/** Kanca bir an sonra gelir; bu surede durum degismediyse (oturum kapali, yazilamadi) eylemler geri gelir. */
const GONDERILDI_MS = 15_000;

const SIRA: Record<OturumEtkinligi['durum'], number> = { bekliyor: 0, calisiyor: 1, bitti: 2, bosta: 3, kapandi: 4 };

function Gosterge() {
  // public/kokpit.svg'nin 14 px'lik hali: tek yay + ibre.
  return (
    <svg viewBox="0 0 24 24" className="size-3.5 shrink-0" fill="none" aria-hidden="true">
      <path d="M6.5 17.5a7.5 7.5 0 1 1 11 0" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" className="text-metin-ikincil" />
      <path d="M12 12l3.2-4.4" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" className="text-metin" />
    </svg>
  );
}

function siraSende(e: OturumEtkinligi | null) {
  return e?.durum === 'bekliyor' || e?.durum === 'bitti';
}

/** Sira sende olan oturumun ne zamandir bekledigi (durum degisiminden beri). */
function bekleme(e: OturumEtkinligi, simdi: number) {
  return sureMetni(Math.max(0, Math.floor((simdi - e.degisti) / 1000)));
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

  useEffect(() => {
    void window.kokpit.etkinlikAnlik().then(setAnlik);
    void window.kokpit.komutlarGetir().then(setKomutlar);
    const k1 = window.kokpit.etkinlikDinle(setAnlik);
    const k2 = window.kokpit.adaListeDinle(setListe);
    const k3 = window.kokpit.sinyalDinle(() => {
      setBakis(true);
      if (bakisZamani.current) clearTimeout(bakisZamani.current);
      bakisZamani.current = setTimeout(() => setBakis(false), BAKIS_MS);
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
      clearInterval(t);
    };
  }, []);

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
    if (icinde) void window.kokpit.komutlarGetir().then(setKomutlar);
    window.kokpit.adaFare(icinde);
  }, []);

  const gonder = useCallback((istek: GonderIstegi) => {
    window.kokpit.adaGonder(istek);
    setGonderilen((g) => ({ ...g, [istek.id]: Date.now() }));
    // Gonderdikten sonra odak birakilir: ada isini yapti, Scryne kaldigi yere doner.
    (document.activeElement as HTMLElement | null)?.blur();
  }, []);

  const satirlar = liste
    .map((o) => ({ o, e: anlik?.oturumlar[o.id] ?? null }))
    .sort((a, b) => SIRA[a.e?.durum ?? 'bosta'] - SIRA[b.e?.durum ?? 'bosta']);
  if (satirlar.length === 0) return null;

  const bekleyen = satirlar.filter((x) => x.e?.durum === 'bekliyor');
  const calisan = satirlar.filter((x) => x.e?.durum === 'calisiyor');
  const biten = satirlar.filter((x) => x.e?.durum === 'bitti' && x.o.dikkat);
  const ilk = bekleyen[0] ?? calisan[0] ?? biten[0] ?? null;
  const ozetDurum: OturumEtkinligi['durum'] = bekleyen.length ? 'bekliyor' : calisan.length ? 'calisiyor' : 'bitti';
  const ozet = bekleyen.length
    ? bekleyen[0].o.ad + ' seni bekliyor' + (bekleyen.length > 1 ? ' +' + (bekleyen.length - 1) : '')
    : calisan.length
      ? calisan[0].o.ad + ' · ' + etkinlikCumlesi(calisan[0].e!, simdi)
      : biten.length
        ? biten[0].o.ad + ' bitti' + (biten.length > 1 ? ' +' + (biten.length - 1) : '')
        : satirlar.length + ' oturum · hazır';
  // Hapta bekleme suresi: "seni bekliyor" ne zamandir? (calisan oturumun suresi cumlesinde)
  const ozetSure = bekleyen.length ? bekleme(bekleyen[0].e!, simdi) : !calisan.length && biten.length ? bekleme(biten[0].e!, simdi) : null;
  const l = anlik?.limitler;
  const genis = uzerinde || bakis || odakta;
  const soruVar = bekleyen.some((x) => x.e?.soruAyrinti?.cevaplanabilir);

  return (
    <div className="flex justify-center pt-1.5">
      <div
        ref={kart}
        onMouseEnter={() => fare(true)}
        onMouseLeave={() => fare(false)}
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
          (genis ? 'ada-acik w-[440px] rounded-2xl' : 'rounded-full')
        }
      >
        <button
          type="button"
          onClick={() => ilk && window.kokpit.adaGit(ilk.o.id)}
          className="flex w-full cursor-pointer items-center gap-2.5 px-3.5 py-2 text-left text-xs"
        >
          <Gosterge />
          <DurumIsareti durum={ilk ? ozetDurum : 'bosta'} />
          <span className={'min-w-0 truncate ' + (bekleyen.length ? 'text-dikkat-metin' : 'text-metin')}>{ozet}</span>
          {ozetSure && <span className="enstruman shrink-0 text-metin-soluk">{ozetSure}</span>}
          {l?.besSaat && (
            <span className="enstruman ml-auto shrink-0 pl-2 text-metin-soluk" title="5 saatlik limit">
              5s %{Math.round(l.besSaat.yuzde)}
            </span>
          )}
        </button>

        {genis && (
          <div className="max-h-[440px] overflow-y-auto border-t border-kenar px-1.5 pb-1.5 pt-1">
            <ul aria-label="Kokpit oturumları">
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
            {l && (l.besSaat || l.hafta) && (
              <div className="mt-1 flex gap-4 border-t border-kenar px-2 pt-1.5 text-xs">
                {l.besSaat && <AdaLimit ad="5 saat" yuzde={l.besSaat.yuzde} />}
                {l.hafta && <AdaLimit ad="Hafta" yuzde={l.hafta.yuzde} />}
              </div>
            )}
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
              <SoruFormu key={e.degisti} ad={o.ad} id={o.id} s={s} damga={e.degisti} onGonder={onGonder} />
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

function AdaLimit({ ad, yuzde }: { ad: string; yuzde: number }) {
  const y = Math.max(0, Math.min(100, Math.round(yuzde)));
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <span className="shrink-0 text-metin-soluk">{ad}</span>
      <span
        role="meter"
        aria-label={ad + ' limiti'}
        aria-valuenow={y}
        aria-valuemin={0}
        aria-valuemax={100}
        className="h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-kenar-guclu"
      >
        <span
          className={'block h-full rounded-full ' + (y >= 95 ? 'bg-hata' : y >= 80 ? 'bg-dikkat' : 'bg-metin-ikincil')}
          style={{ width: y + '%' }}
        />
      </span>
      <span className={'enstruman shrink-0 ' + (y >= 80 ? 'text-dikkat-metin' : 'text-metin')}>%{y}</span>
    </div>
  );
}
