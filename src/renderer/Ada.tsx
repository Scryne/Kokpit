import { useCallback, useEffect, useRef, useState } from 'react';
import { CornerDownLeft } from 'lucide-react';
import type { AdaOturumu, EtkinlikAnlik, GonderIstegi, HizliKomut, OturumEtkinligi } from './types';
import { DurumIsareti, etkinlikCumlesi } from './Etkinlik';
import { sureMetni } from './parcalar';

// Ada: Kokpit arka plandayken ekranin ust ortasindaki serit (electron/ada.cjs).
// Kapali: tek satirlik hap — en onemli tek sey. Acik: oturum basina satir + limitler.
// Acilir: imlec uzerine gelince, ya da bir oturum "bitti/seni bekliyor" dediginde 5 sn
// (Coucou'nun "notch'tan bakma" ani; burada sessiz, ses yok).
//
// v2.3: ada artik cevap da verir. Sira sende olan oturumun (bitti / seni bekliyor) altinda:
// claude soru sorduysa secenekleri (rakam tusuyla secilir, olculdu), degilse hizli komutlar ve
// bir yanit kutusu. Gonderim main uzerinden ana penceredeki PTY'ye gider; Kokpit one gelmez.
//
// Pencere saydam, bu yuzden zemin kendi tonunu tasir (ada-zemin, ~%92 opak): arkada ne
// olursa olsun metin okunur. backdrop-filter yok — saydam pencerede masaustunu bulaniklastiramaz.

const BAKIS_MS = 5000;
/** Soru ekrani PreToolUse hook'undan sonra cizilir; rakam ondan once giderse girdi kutusuna duser. */
const SORU_HAZIR_MS = 800;
const CIP_SAYISI = 3;

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

export default function Ada() {
  const [liste, setListe] = useState<AdaOturumu[]>([]);
  const [anlik, setAnlik] = useState<EtkinlikAnlik | null>(null);
  const [komutlar, setKomutlar] = useState<HizliKomut[]>([]);
  const [uzerinde, setUzerinde] = useState(false);
  const [yaziyor, setYaziyor] = useState(false);
  const [bakis, setBakis] = useState(false);
  const [simdi, setSimdi] = useState(() => Date.now());
  // Gonderilen oturumlar: durum degisene kadar "gönderildi" yazar (kanca bir an sonra gelir).
  const [gonderilen, setGonderilen] = useState<Record<string, number>>({});
  const bakisZamani = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    const t = setInterval(() => setSimdi(Date.now()), 1000);
    return () => {
      k1();
      k2();
      k3();
      clearInterval(t);
    };
  }, []);

  const fare = useCallback((icinde: boolean) => {
    setUzerinde(icinde);
    if (icinde) void window.kokpit.komutlarGetir().then(setKomutlar);
    window.kokpit.adaFare(icinde);
  }, []);

  const gonder = useCallback((istek: GonderIstegi) => {
    window.kokpit.adaGonder(istek);
    setGonderilen((g) => ({ ...g, [istek.id]: Date.now() }));
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
        ? biten[0].o.ad + ' bitti'
        : satirlar.length + ' oturum · hazır';
  const l = anlik?.limitler;
  const genis = uzerinde || bakis || yaziyor;

  return (
    <div className="flex justify-center pt-1.5">
      <div
        onMouseEnter={() => fare(true)}
        onMouseLeave={() => fare(false)}
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
          {l?.besSaat && (
            <span className="enstruman ml-auto shrink-0 pl-2 text-metin-soluk" title="5 saatlik limit">
              5s %{Math.round(l.besSaat.yuzde)}
            </span>
          )}
        </button>

        {genis && (
          <div className="max-h-[440px] overflow-y-auto border-t border-kenar px-1.5 pb-1.5 pt-1">
            <ul aria-label="Kokpit oturumları">
              {satirlar.map(({ o, e }) => {
                const siraSende = e?.durum === 'bekliyor' || e?.durum === 'bitti';
                // Kanca bir an sonra gelir; 15 sn icinde durum degismediyse (oturum kapali, yazilamadi) eylemler geri gelir.
                const gonderildi =
                  gonderilen[o.id] !== undefined && e !== null && e.degisti <= gonderilen[o.id] && simdi - gonderilen[o.id] < 15_000;
                return (
                  <li key={o.id}>
                    <button
                      type="button"
                      onClick={() => window.kokpit.adaGit(o.id)}
                      className="grid w-full cursor-pointer grid-cols-[0.75rem_6.5rem_minmax(0,1fr)_auto] items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition-colors duration-[120ms] hover:bg-yuzey-guclu"
                    >
                      <DurumIsareti durum={e?.durum ?? 'bosta'} />
                      <span className="enstruman truncate text-metin">{o.ad}</span>
                      <span className={'truncate ' + (e?.durum === 'bekliyor' ? 'text-dikkat-metin' : 'text-metin-ikincil')}>
                        {/* Soru asagida tam haliyle duruyor; satir tekrar etmesin, basligi yeter. */}
                        {e?.durum === 'bekliyor' && e.soruAyrinti
                          ? 'Seni bekliyor' + (e.soruAyrinti.baslik ? ' · ' + e.soruAyrinti.baslik : '')
                          : e
                            ? etkinlikCumlesi(e, simdi)
                            : 'Hazır'}
                      </span>
                      <span className="enstruman text-metin-soluk">
                        {o.baslangic ? sureMetni(Math.floor((simdi - o.baslangic) / 1000)) : ''}
                      </span>
                    </button>
                    {siraSende && e && (
                      gonderildi ? (
                        <p role="status" className="px-2 pb-1.5 pl-[1.75rem] text-xs text-metin-soluk">
                          Gönderildi, claude'a iletiliyor.
                        </p>
                      ) : (
                        <AdaEylemleri
                          ad={o.ad}
                          id={o.id}
                          e={e}
                          simdi={simdi}
                          komutlar={komutlar}
                          onGonder={gonder}
                          onYaziyor={setYaziyor}
                        />
                      )
                    )}
                  </li>
                );
              })}
            </ul>
            {l && (l.besSaat || l.hafta) && (
              <div className="mt-1 flex gap-4 border-t border-kenar px-2 pt-1.5 text-xs">
                {l.besSaat && <AdaLimit ad="5 saat" yuzde={l.besSaat.yuzde} />}
                {l.hafta && <AdaLimit ad="Hafta" yuzde={l.hafta.yuzde} />}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Sira sende olan oturumun altindaki eylemler. Soru varsa secenekler (tek soru, tekli secim);
 * coklu/sekmeli soruysa yalniz "terminalde cevapla". Soru yoksa hizli komut cipleri.
 * Her ikisinde de bir yanit kutusu: soruda "kendi cevabin", degilse duz mesaj.
 */
function AdaEylemleri({
  ad,
  id,
  e,
  simdi,
  komutlar,
  onGonder,
  onYaziyor,
}: {
  ad: string;
  id: string;
  e: OturumEtkinligi;
  simdi: number;
  komutlar: HizliKomut[];
  onGonder: (istek: GonderIstegi) => void;
  onYaziyor: (yaziyor: boolean) => void;
}) {
  const [metin, setMetin] = useState('');
  const kutu = useRef<HTMLInputElement>(null);
  const s = e.durum === 'bekliyor' ? e.soruAyrinti ?? null : null;
  const soruHazir = simdi - e.degisti >= SORU_HAZIR_MS;

  const kutuyuBirak = () => {
    onYaziyor(false);
    window.kokpit.adaOdak(false);
  };
  const metniGonder = () => {
    const m = metin.trim();
    if (!m) return;
    if (s?.cevaplanabilir) onGonder({ id, tur: 'secim', secim: 'diger', metin: m, damga: e.degisti });
    else onGonder({ id, tur: 'metin', metin: m });
    setMetin('');
    kutuyuBirak();
  };

  // Izin istemi / elicitation gibi secenegi bilinmeyen beklemeler: yazmak riskli, terminale.
  if (e.durum === 'bekliyor' && !s) {
    return (
      <p className="px-2 pb-1.5 pl-[1.75rem] text-xs text-metin-soluk">Cevabı terminalde ver: satıra tıkla.</p>
    );
  }

  return (
    <div className="space-y-1.5 px-2 pb-2 pl-[1.75rem]">
      {s && !s.cevaplanabilir && (
        <p className="text-xs text-metin-soluk">
          {s.soruSayisi > 1 ? s.soruSayisi + ' soru var' : 'Çoklu seçim'}; terminalden cevapla: satıra tıkla.
        </p>
      )}

      {s?.cevaplanabilir && (
        <div role="group" aria-label={ad + ' sorusu: ' + s.soru} className="grid gap-1">
          <p className="text-xs text-metin">{s.soru}</p>
          {s.secenekler.map((sec, i) => (
            <button
              key={i}
              type="button"
              disabled={!soruHazir}
              onClick={() => onGonder({ id, tur: 'secim', secim: i, damga: e.degisti })}
              title={sec.aciklama || sec.etiket}
              className="flex w-full cursor-pointer items-baseline gap-2 rounded-lg border border-kenar px-2 py-1 text-left text-xs transition-colors duration-[120ms] hover:border-kenar-guclu hover:bg-yuzey-guclu disabled:cursor-default disabled:opacity-60"
            >
              <span className="enstruman shrink-0 text-metin-soluk">{i + 1}</span>
              <span className="shrink-0 text-metin">{sec.etiket}</span>
              {sec.aciklama && <span className="min-w-0 truncate text-metin-soluk">{sec.aciklama}</span>}
            </button>
          ))}
        </div>
      )}

      {!s && komutlar.length > 0 && (
        <div role="group" aria-label={ad + ' hızlı komutlar'} className="flex flex-wrap gap-1">
          {komutlar.slice(0, CIP_SAYISI).map((k) => (
            <button
              key={k.ad}
              type="button"
              onClick={() => onGonder({ id, tur: 'metin', metin: k.metin })}
              title={k.metin}
              className="cursor-pointer rounded-full border border-kenar px-2.5 py-0.5 text-xs text-metin-ikincil transition-colors duration-[120ms] hover:border-kenar-guclu hover:text-metin"
            >
              {k.ad}
            </button>
          ))}
        </div>
      )}

      {(!s || s.cevaplanabilir) && (
        <form
          onSubmit={(ev) => {
            ev.preventDefault();
            metniGonder();
          }}
          className="flex items-center gap-1 rounded-lg border border-kenar bg-terminal/60 pr-1 focus-within:border-kenar-guclu"
        >
          <input
            ref={kutu}
            type="text"
            value={metin}
            onChange={(ev) => setMetin(ev.target.value)}
            onMouseDown={() => {
              // Ada odak almaz (focusable: false), tiklama kutuya odak veremez. Once main
              // pencereyi odaklanabilir yapar (ada.odak), sonra kutu elle odaklanir.
              onYaziyor(true);
              window.kokpit.adaOdak(true);
              setTimeout(() => kutu.current?.focus(), 60);
            }}
            onFocus={() => onYaziyor(true)}
            onBlur={kutuyuBirak}
            onKeyDown={(ev) => {
              if (ev.key === 'Escape') {
                setMetin('');
                (ev.target as HTMLInputElement).blur();
              }
            }}
            disabled={!!s && !soruHazir}
            maxLength={2000}
            placeholder={s ? 'Kendi cevabın' : ad + ' oturumuna yaz'}
            aria-label={s ? ad + ' sorusuna kendi cevabın' : ad + ' oturumuna mesaj'}
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
      )}
    </div>
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
