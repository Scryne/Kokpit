import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { Vade, Yapilacak } from '../types';
import { VadeMetni } from '../Nobet';
import { IkonDugme } from './ortak';
import { AY_ADI, GUN_ADI, YapilacakSatiri, gunAnahtari, gunFarki, tarihCoz, tarihEtiketi, useBugun, yerelGun } from './ListeSayfasi';

// v4.0 Takvim: vadeler (proje notlarinin `vadeler` alani) + tarihli yapilacaklar tek ay izgarasinda.
// Isaretler bicimle ayrilir, renkle degil: vade dolu nokta, yapilacak bos halka. Amber yalniz gecikmis
// ya da bugunku vade (DESIGN.md: renk gorduysen bir sey seni bekliyor).
// Vadenin `kalan_gun`u durum.py'nin olctugu andan kalir (gece yarisini gecince bayatlar); fark burada
// `tarih`ten yeniden hesaplanir.

const SUTUN = ['Pt', 'Sa', 'Ça', 'Pe', 'Cu', 'Ct', 'Pa'];
const YAKLASAN_SAYI = 4;

interface GunKaydi {
  vadeler: Vade[];
  yapilacaklar: Yapilacak[];
}

interface Ay {
  y: number;
  m: number;
}

const ayOf = (d: Date): Ay => ({ y: d.getFullYear(), m: d.getMonth() });
const ayAyni = (a: Ay, b: Ay) => a.y === b.y && a.m === b.m;
const gunEkle = (anahtar: string, n: number) => {
  const d = tarihCoz(anahtar) ?? new Date();
  return gunAnahtari(new Date(d.getFullYear(), d.getMonth(), d.getDate() + n));
};

function hucreAdi(d: Date, kayit: number, bugun: boolean) {
  return (
    d.getDate() + ' ' + AY_ADI[d.getMonth()] + ' ' + GUN_ADI[d.getDay()] + (bugun ? ', bugün' : '') + ', ' + (kayit ? kayit + ' kayıt' : 'kayıt yok')
  );
}

export function TakvimSayfasi({ vadeler, liste }: { vadeler: Vade[]; liste: Yapilacak[] }) {
  const simdi = useBugun();
  const bugun = yerelGun(simdi);
  const [ay, setAy] = useState<Ay>(() => ayOf(new Date(simdi)));
  const [secili, setSecili] = useState(bugun);
  const hucreler = useRef(new Map<string, HTMLButtonElement>());
  const odakla = useRef(false);

  // Gece yarisi: secim ve gorunen ay "bugun"deyse yeni gune kaysin; kullanici baska gune gittiyse dokunma.
  const oncekiBugun = useRef(bugun);
  useEffect(() => {
    const eski = oncekiBugun.current;
    if (eski === bugun) return;
    oncekiBugun.current = bugun;
    setSecili((s) => (s === eski ? bugun : s));
    const eskiAy = ayOf(tarihCoz(eski) ?? new Date(simdi));
    setAy((a) => (ayAyni(a, eskiAy) ? ayOf(new Date(simdi)) : a));
  }, [bugun, simdi]);

  // Ok tusuyla secim degisince odak yeni hucreye gecsin (ay degistiyse hucre yeni cizimde dogar).
  useEffect(() => {
    if (!odakla.current) return;
    odakla.current = false;
    hucreler.current.get(secili)?.focus();
  }, [secili, ay]);

  const gunler = useMemo(() => {
    const m = new Map<string, GunKaydi>();
    const al = (k: string) => {
      let g = m.get(k);
      if (!g) m.set(k, (g = { vadeler: [], yapilacaklar: [] }));
      return g;
    };
    for (const v of vadeler) if (tarihCoz(v.tarih)) al(v.tarih).vadeler.push(v);
    for (const y of liste) if (y.tarih && tarihCoz(y.tarih)) al(y.tarih).yapilacaklar.push(y);
    return m;
  }, [vadeler, liste]);

  // Pazartesi baslangicli; yalniz gereken hafta sayisi kadar satir (4-6).
  const ilk = new Date(ay.y, ay.m, 1);
  const kayma = (ilk.getDay() + 6) % 7;
  const ayGunu = new Date(ay.y, ay.m + 1, 0).getDate();
  const hucreSayisi = Math.ceil((kayma + ayGunu) / 7) * 7;
  const haftalar: Date[][] = [];
  for (let i = 0; i < hucreSayisi; i++) {
    if (i % 7 === 0) haftalar.push([]);
    haftalar[haftalar.length - 1].push(new Date(ay.y, ay.m, 1 - kayma + i));
  }
  const gorunur = new Set(haftalar.flat().map(gunAnahtari));
  // Gezinme sirasi tek hucrede (roving tabindex): secili gorunurse o, degilse ayin biri.
  const sekmeHucresi = gorunur.has(secili) ? secili : gunAnahtari(ilk);
  const bugunAy = ayOf(new Date(simdi));

  const ayaGit = (yeni: Ay) => {
    setAy(yeni);
    // Secim hep gorunen ayda kalsin: bugunun ayinda bugun, degilse ayin biri.
    setSecili(ayAyni(yeni, bugunAy) ? bugun : gunAnahtari(new Date(yeni.y, yeni.m, 1)));
  };
  const kaydir = (n: number) => ayaGit(ayOf(new Date(ay.y, ay.m + n, 1)));

  const sec = (anahtar: string, odak: boolean) => {
    const d = tarihCoz(anahtar);
    if (!d) return;
    odakla.current = odak;
    setSecili(anahtar);
    const yeniAy = ayOf(d);
    if (!ayAyni(yeniAy, ay)) setAy(yeniAy);
  };

  const tus = (ev: KeyboardEvent<HTMLButtonElement>, anahtar: string) => {
    const adim: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    if (ev.key in adim) {
      ev.preventDefault();
      sec(gunEkle(anahtar, adim[ev.key]), true);
    } else if (ev.key === 'PageUp' || ev.key === 'PageDown') {
      ev.preventDefault();
      const d = tarihCoz(anahtar);
      if (!d) return;
      const n = ev.key === 'PageUp' ? -1 : 1;
      // Ayin gunu korunur, kisa ayda son gune kirpilir (31 Ocak -> 28 Subat).
      const son = new Date(d.getFullYear(), d.getMonth() + n + 1, 0).getDate();
      sec(gunAnahtari(new Date(d.getFullYear(), d.getMonth() + n, Math.min(d.getDate(), son))), true);
    }
  };

  const seciliKayit = gunler.get(secili);
  const seciliTarih = tarihCoz(secili);
  const seciliFark = gunFarki(secili, simdi) ?? 0;

  const yaklasan = useMemo(() => {
    const l: { tarih: string; vade?: Vade; y?: Yapilacak }[] = [];
    for (const v of vadeler) if ((gunFarki(v.tarih, simdi) ?? 0) > 0) l.push({ tarih: v.tarih, vade: v });
    for (const y of liste) if (y.tarih && !y.bitti && (gunFarki(y.tarih, simdi) ?? 0) > 0) l.push({ tarih: y.tarih, y });
    // Ayni gunde vade once: dis dunyanin tarihi, yapilacak kendi koydugun.
    l.sort((a, b) => (a.tarih < b.tarih ? -1 : a.tarih > b.tarih ? 1 : a.vade && !b.vade ? -1 : !a.vade && b.vade ? 1 : 0));
    return l.slice(0, YAKLASAN_SAYI);
  }, [vadeler, liste, simdi]);

  return (
    <section aria-label="Takvim" data-ada-sayfa="takvim" className="px-2 py-1.5 text-xs">
      <div className="mb-1 flex items-center gap-1 px-0.5">
        <span aria-live="polite" className="text-metin">
          {AY_ADI[ay.m]} <span className="enstruman">{ay.y}</span>
        </span>
        <span className="ml-auto flex items-center gap-0.5">
          <IkonDugme etiket="Önceki ay" onClick={() => kaydir(-1)}>
            <ChevronLeft className="size-3.5" aria-hidden="true" />
          </IkonDugme>
          {!ayAyni(ay, bugunAy) && (
            <button
              type="button"
              onClick={() => ayaGit(bugunAy)}
              className="cursor-pointer rounded-kontrol px-1.5 py-1 text-metin-soluk transition-colors duration-[120ms] hover:bg-yuzey-guclu hover:text-metin"
            >
              Bugün
            </button>
          )}
          <IkonDugme etiket="Sonraki ay" onClick={() => kaydir(1)}>
            <ChevronRight className="size-3.5" aria-hidden="true" />
          </IkonDugme>
        </span>
      </div>

      <div role="grid" aria-label={AY_ADI[ay.m] + ' ' + ay.y} className="select-none">
        <div role="row" className="grid grid-cols-7">
          {SUTUN.map((s) => (
            <span key={s} role="columnheader" className="etiket py-0.5 text-center">
              {s}
            </span>
          ))}
        </div>
        {haftalar.map((hafta) => (
          <div role="row" key={gunAnahtari(hafta[0])} className="grid grid-cols-7 gap-0.5 py-px">
            {hafta.map((d) => {
              const k = gunAnahtari(d);
              const kayit = gunler.get(k);
              const bu = d.getMonth() === ay.m;
              const bugunMu = k === bugun;
              const seciliMi = k === secili;
              const vadeVar = !!kayit && kayit.vadeler.length > 0;
              const vadeAcil = vadeVar && (gunFarki(k, simdi) ?? 1) <= 0;
              const yapVar = !!kayit && kayit.yapilacaklar.length > 0;
              const yapAcik = !!kayit && kayit.yapilacaklar.some((y) => !y.bitti);
              const sayi = (kayit?.vadeler.length ?? 0) + (kayit?.yapilacaklar.length ?? 0);
              return (
                <div role="gridcell" key={k} aria-selected={seciliMi}>
                  <button
                    ref={(el) => {
                      if (el) hucreler.current.set(k, el);
                      else hucreler.current.delete(k);
                    }}
                    type="button"
                    tabIndex={k === sekmeHucresi ? 0 : -1}
                    aria-label={hucreAdi(d, sayi, bugunMu)}
                    aria-current={bugunMu ? 'date' : undefined}
                    onClick={() => sec(k, false)}
                    onKeyDown={(ev) => tus(ev, k)}
                    className={
                      'flex h-7 w-full cursor-pointer flex-col items-center justify-center gap-0.5 rounded-rozet transition-colors duration-[120ms] ' +
                      (bugunMu
                        ? 'border border-kenar-guclu bg-yuzey-guclu text-metin '
                        : 'hover:bg-yuzey-guclu ' + (bu ? 'text-metin-ikincil ' : 'text-metin-soluk/50 ')) +
                      (seciliMi ? 'outline outline-1 -outline-offset-1 outline-aksan' : '')
                    }
                  >
                    <span className="enstruman leading-none">{d.getDate()}</span>
                    <span aria-hidden="true" className="flex h-1 items-center gap-0.5">
                      {vadeVar && <span className={'size-1 rounded-full ' + (vadeAcil ? 'bg-dikkat' : 'bg-metin-ikincil')} />}
                      {yapVar && (
                        <span className={'size-1 rounded-full border-[0.5px] ' + (yapAcik ? 'border-metin-ikincil' : 'border-metin-soluk/60')} />
                      )}
                    </span>
                  </button>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <div className="mt-2 border-t border-kenar pt-1.5" aria-label="Seçili gün" role="region">
        <p className="mb-0.5 px-0.5">
          <span className="etiket">
            {seciliTarih ? seciliTarih.getDate() + ' ' + AY_ADI[seciliTarih.getMonth()] + ' ' + GUN_ADI[seciliTarih.getDay()] : secili}
            {secili === bugun ? ' · bugün' : ''}
          </span>
        </p>
        {!seciliKayit || (seciliKayit.vadeler.length === 0 && seciliKayit.yapilacaklar.length === 0) ? (
          <p className="px-1.5 py-1 text-metin-soluk">Bu gün boş.</p>
        ) : (
          <>
            {seciliKayit.vadeler.length > 0 && (
              <ul aria-label="Vadeler">
                {seciliKayit.vadeler.map((v) => (
                  <VadeSatiri key={v.proje + v.tarih + (v.saat ?? '') + v.metin} v={v} fark={seciliFark} />
                ))}
              </ul>
            )}
            {seciliKayit.yapilacaklar.length > 0 && (
              <ul aria-label="Yapılacaklar">
                {seciliKayit.yapilacaklar.map((y) => (
                  <YapilacakSatiri key={y.id} y={y} simdi={simdi} tarihsiz />
                ))}
              </ul>
            )}
          </>
        )}
      </div>

      {secili === bugun && yaklasan.length > 0 && (
        <div className="mt-1.5 border-t border-kenar pt-1.5">
          <p className="etiket mb-0.5 px-0.5">Yaklaşan</p>
          <ul aria-label="Yaklaşan kayıtlar">
            {yaklasan.map((x) => {
              const metin = x.vade ? x.vade.metin : x.y!.metin;
              return (
                <li key={x.vade ? 'v' + x.vade.proje + x.tarih + x.vade.metin : 'y' + x.y!.id}>
                  <button
                    type="button"
                    onClick={() => sec(x.tarih, false)}
                    title={metin.replace(/`/g, '') + ' · o güne git'}
                    className="flex w-full min-w-0 cursor-pointer items-baseline gap-2 rounded-lg px-1.5 py-1 text-left transition-colors duration-[120ms] hover:bg-yuzey-guclu/60"
                  >
                    <span className="enstruman w-14 shrink-0 text-metin-ikincil">{tarihEtiketi(x.tarih, simdi).metin}</span>
                    <span aria-hidden="true" className="flex h-3 w-1.5 shrink-0 items-center">
                      {x.vade ? (
                        <span className="size-1.5 rounded-full bg-metin-ikincil" />
                      ) : (
                        <span className="size-1.5 rounded-full border border-metin-ikincil" />
                      )}
                    </span>
                    <span className="sr-only">{x.vade ? 'Vade: ' : 'Yapılacak: '}</span>
                    <span className="min-w-0 flex-1 truncate text-metin">{x.vade ? <VadeMetni metin={x.vade.metin} /> : metin}</span>
                    {x.vade && <span className="enstruman shrink-0 text-metin-soluk">{x.vade.proje}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}

/** Secili gunun vadesi: dolu nokta (takvimdeki isaretle ayni bicim), saat mono, proje sagda. */
function VadeSatiri({ v, fark }: { v: Vade; fark: number }) {
  const acil = fark <= 0;
  return (
    <li className="flex min-w-0 items-baseline gap-2 px-1.5 py-1">
      <span aria-hidden="true" className="flex h-3 w-4 shrink-0 items-center justify-center">
        <span className={'size-1.5 rounded-full ' + (acil ? 'bg-dikkat' : 'bg-metin-ikincil')} />
      </span>
      {fark < 0 ? (
        <span className="enstruman shrink-0 text-dikkat-metin">{-fark} gün geçti</span>
      ) : (
        v.saat && <span className={'enstruman shrink-0 ' + (acil ? 'text-dikkat-metin' : 'text-metin-ikincil')}>{v.saat}</span>
      )}
      <span className="min-w-0 flex-1 truncate text-metin" title={v.metin.replace(/`/g, '')}>
        <span className="sr-only">Vade: </span>
        <VadeMetni metin={v.metin} />
      </span>
      <span className="enstruman shrink-0 text-metin-soluk">{v.proje}</span>
    </li>
  );
}
