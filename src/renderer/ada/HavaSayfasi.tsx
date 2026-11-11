import { useEffect, useRef, useState, type JSX } from 'react';
import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudMoon,
  CloudRain,
  CloudRainWind,
  CloudSnow,
  CloudSun,
  Moon,
  RefreshCw,
  Sun,
  type LucideIcon,
} from 'lucide-react';
import type { HavaDurumu, HavaKonumu, HavaSonucu } from '../types';
import { AdaGirdi, IkonDugme } from './ortak';

// Ada'nin hava sayfasi (v4.0). Veri main'de (hava.cjs, open-meteo); sayfa yalniz ister ve cizer. Konum
// ayarlarda yasar (AdaAyarlari.havaKonum) ve prop olarak gelir.

const YENILE_MS = 10 * 60 * 1000;
// Bu kadar taze bir sonuc varsa konum prop'u degisince yeniden istenmez (konum secimi sonucu zaten getirdi).
const TAZE_MS = 2 * 60 * 1000;

/** WMO kodu -> ikon + Turkce metin. */
function havaEsle(kod: number, gunduz: boolean): { ikon: LucideIcon; metin: string } {
  if (kod === 0) return { ikon: gunduz ? Sun : Moon, metin: 'Açık' };
  if (kod === 1 || kod === 2) return { ikon: gunduz ? CloudSun : CloudMoon, metin: 'Parçalı bulutlu' };
  if (kod === 3) return { ikon: Cloud, metin: 'Kapalı' };
  if (kod === 45 || kod === 48) return { ikon: CloudFog, metin: 'Sisli' };
  if (kod >= 51 && kod <= 57) return { ikon: CloudDrizzle, metin: 'Çisenti' };
  if (kod >= 61 && kod <= 67) return { ikon: CloudRain, metin: 'Yağmurlu' };
  if (kod >= 71 && kod <= 77) return { ikon: CloudSnow, metin: 'Karlı' };
  if (kod >= 80 && kod <= 82) return { ikon: CloudRainWind, metin: 'Sağanak' };
  if (kod === 85 || kod === 86) return { ikon: CloudSnow, metin: 'Kar sağanağı' };
  if (kod >= 95 && kod <= 99) return { ikon: CloudLightning, metin: 'Gök gürültülü' };
  return { ikon: Cloud, metin: 'Bulutlu' };
}

export function havaMetni(kod: number): string {
  return havaEsle(kod, true).metin;
}

export function HavaIkonu({ kod, gunduz, className }: { kod: number; gunduz: boolean; className?: string }): JSX.Element {
  const Ikon = havaEsle(kod, gunduz).ikon;
  return <Ikon className={className ?? 'size-3.5'} aria-hidden="true" />;
}

function konumAnahtari(k: HavaKonumu | null): string | null {
  return k ? k.enlem.toFixed(4) + ',' + k.boylam.toFixed(4) : null;
}

/** Tam sayi derece; eksi isareti tipografik (mono'da hizali). */
function derece(n: number) {
  return String(Math.round(n)).replace('-', '−') + '°';
}

function yerelGun(t: Date) {
  const iki = (n: number) => String(n).padStart(2, '0');
  return t.getFullYear() + '-' + iki(t.getMonth() + 1) + '-' + iki(t.getDate());
}

const kisaGun = new Intl.DateTimeFormat('tr-TR', { weekday: 'short' });
const saatBicim = new Intl.DateTimeFormat('tr-TR', { hour: '2-digit', minute: '2-digit' });
const tarihBicim = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short' });

function gunAdi(gun: string, simdi: Date) {
  const bugun = yerelGun(simdi);
  if (gun === bugun) return 'Bugün';
  const yarin = new Date(simdi.getFullYear(), simdi.getMonth(), simdi.getDate() + 1);
  if (gun === yerelGun(yarin)) return 'Yarın';
  const [y, a, g] = gun.split('-').map(Number);
  if (!y || !a || !g) return gun;
  return kisaGun.format(new Date(y, a - 1, g));
}

type Kayit = { anahtar: string; s: HavaSonucu };

export function HavaSayfasi({ konum }: { konum: HavaKonumu | null }): JSX.Element {
  // Secim yapildi ama ayarlar yayini henuz gelmedi: o arada secilen konum gecerli.
  const [secilen, setSecilen] = useState<HavaKonumu | null>(null);
  const etkin = konum ?? secilen;
  const anahtar = konumAnahtari(etkin);

  const [kayit, setKayit] = useState<Kayit | null>(null);
  const [yukleniyor, setYukleniyor] = useState(false);
  const [degistir, setDegistir] = useState(false);
  const [donuyor, setDonuyor] = useState(false);

  const kayitRef = useRef<Kayit | null>(null);
  kayitRef.current = kayit;
  const anahtarRef = useRef(anahtar);
  anahtarRef.current = anahtar;
  const istekNo = useRef(0);
  const canli = useRef(true);
  useEffect(() => {
    canli.current = true;
    return () => {
      canli.current = false;
    };
  }, []);

  // Gec gelen cevap: arada konum degistiyse ya da daha yeni bir istek atildiysa atilir.
  const getir = (taze: boolean) => {
    const a = anahtarRef.current;
    if (!a) return;
    const no = ++istekNo.current;
    setYukleniyor(true);
    const bitir = (s: HavaSonucu) => {
      if (!canli.current || no !== istekNo.current || anahtarRef.current !== a) return;
      setKayit({ anahtar: a, s });
      setYukleniyor(false);
    };
    window.kokpit.havaGetir(taze).then(bitir, () => bitir({ hata: 'Hava alınamadı.' }));
  };

  useEffect(() => {
    if (!anahtar) return;
    const k = kayitRef.current;
    const taze = k && k.anahtar === anahtar && 'olculdu' in k.s && Date.now() - k.s.olculdu < TAZE_MS;
    if (!taze) getir(false);
    const t = setInterval(() => {
      if (!document.hidden) getir(false);
    }, YENILE_MS);
    return () => clearInterval(t);
    // getir ref'lerden okur; yalniz konum degisince yeniden kurulur.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anahtar]);

  // Tek turluk donus: sinif kalkmazsa ikinci tiklamada animasyon tekrar oynamaz.
  useEffect(() => {
    if (!donuyor) return;
    const t = setTimeout(() => setDonuyor(false), 650);
    return () => clearTimeout(t);
  }, [donuyor]);

  const s = kayit && kayit.anahtar === anahtar ? kayit.s : null;
  const konumYok = !etkin || (s !== null && 'konumYok' in s);

  if (konumYok || degistir) {
    return (
      <section aria-label="Hava" data-ada-sayfa="hava" className="px-2 py-1.5 text-xs">
        <SehirSecimi
          vazgec={degistir && !konumYok ? () => setDegistir(false) : null}
          onSecildi={(k, sonuc) => {
            setSecilen(k);
            const a = konumAnahtari(k)!;
            // Prop gelmeden de dogru konum gorunsun; anahtarRef bir sonraki cizimde guncellenir.
            anahtarRef.current = a;
            istekNo.current++;
            setKayit({ anahtar: a, s: sonuc });
            setYukleniyor(false);
            setDegistir(false);
          }}
        />
      </section>
    );
  }

  const ustSatir = (
    <div className="flex min-w-0 shrink-0 items-center gap-1">
      <span className="max-w-[9rem] truncate text-metin-soluk" title={konumUzun(etkin!)}>
        {etkin!.ad}
      </span>
      <button
        type="button"
        onClick={() => setDegistir(true)}
        className="cursor-pointer rounded-kontrol px-1 py-1 text-metin-soluk underline decoration-kenar-guclu underline-offset-2 transition-colors duration-[120ms] hover:text-metin"
      >
        Değiştir
      </button>
      <IkonDugme
        etiket="Havayı tazele"
        onClick={() => {
          setDonuyor(true);
          getir(true);
        }}
        disabled={yukleniyor && !donuyor}
      >
        <RefreshCw className={'size-3.5 ' + (donuyor ? 'ada-donus' : '')} aria-hidden="true" />
      </IkonDugme>
    </div>
  );

  if (!s) {
    return (
      <section aria-label="Hava" data-ada-sayfa="hava" className="px-2 py-1.5 text-xs">
        <div className="flex items-center gap-2">
          <p role="status" className="min-w-0 flex-1 text-metin-soluk">
            Hava alınıyor…
          </p>
          {ustSatir}
        </div>
      </section>
    );
  }

  if ('hata' in s) {
    return (
      <section aria-label="Hava" data-ada-sayfa="hava" className="px-2 py-1.5 text-xs">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1 space-y-1.5">
            <p role="status" className="text-hata-metin">
              {s.hata}
            </p>
            <button
              type="button"
              onClick={() => getir(true)}
              disabled={yukleniyor}
              className="cursor-pointer rounded-full border border-kenar px-2.5 py-0.5 text-xs text-metin-ikincil transition-colors duration-[120ms] hover:border-kenar-guclu hover:text-metin disabled:cursor-default disabled:opacity-40"
            >
              Yeniden dene
            </button>
          </div>
          {ustSatir}
        </div>
      </section>
    );
  }

  if ('konumYok' in s) return <section aria-label="Hava" data-ada-sayfa="hava" />; // yukarida yakalanir

  return <HavaGovdesi h={s} ustSatir={ustSatir} />;
}

function konumUzun(k: HavaKonumu) {
  return [k.ad, k.bolge, k.ulke].filter(Boolean).join(', ');
}

function HavaGovdesi({ h, ustSatir }: { h: HavaDurumu; ustSatir: JSX.Element }) {
  const simdi = new Date();
  const saatlik = h.saatlik.slice(0, 8);
  const gunluk = h.gunluk.slice(0, 5);
  // Aralik cubugu haftanin genel en dusuk/en yuksegine gore konumlanir: gunler birbirine kiyasla okunur.
  const gMin = Math.min(...gunluk.map((g) => g.enDusuk));
  const gMax = Math.max(...gunluk.map((g) => g.enYuksek));
  const aralik = gMax - gMin || 1;
  const durum = havaMetni(h.kod);
  const olcum = new Date(h.olculdu);
  const olcumMetni =
    (yerelGun(olcum) === yerelGun(simdi) ? '' : tarihBicim.format(olcum) + ' ') + saatBicim.format(olcum);

  return (
    <section aria-label="Hava" data-ada-sayfa="hava" className="px-2 py-1.5 text-xs">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2.5">
            <span className="enstruman text-3xl leading-none text-metin" aria-label={'Şu an ' + derece(h.sicaklik)}>
              {derece(h.sicaklik)}
            </span>
            <HavaIkonu kod={h.kod} gunduz={h.gunduz} className="size-7 shrink-0 text-metin-ikincil" />
            <span className="min-w-0 truncate text-metin-ikincil">{durum}</span>
          </div>
        </div>
        {ustSatir}
      </div>
      <p className="enstruman mt-2 truncate text-metin-soluk">
        hissedilen <span className="text-metin-ikincil">{derece(h.hissedilen)}</span>
        {' · '}rüzgar <span className="text-metin-ikincil">{Math.round(h.ruzgar)}</span> km/sa
        {' · '}nem <span className="text-metin-ikincil">%{Math.round(h.nem)}</span>
      </p>

      {saatlik.length > 0 && (
        <ol aria-label="Saatlik tahmin" className="mt-3 grid grid-cols-8 border-t border-kenar pt-2.5">
          {saatlik.map((x) => {
            const t = new Date(x.t);
            const saat = t.getHours();
            // Saatlik veride gunduz/gece yok; ikon icin kaba bir gunduz araligi.
            const gunduz = saat >= 6 && saat < 20;
            const metin = havaMetni(x.kod);
            return (
              <li
                key={x.t}
                title={String(saat).padStart(2, '0') + ':00 · ' + metin + (x.yagis >= 30 ? ' · yağış %' + Math.round(x.yagis) : '')}
                className="flex flex-col items-center gap-1"
              >
                <span className="enstruman text-[0.6875rem] text-metin-soluk">{String(saat).padStart(2, '0')}</span>
                <HavaIkonu kod={x.kod} gunduz={gunduz} className="size-3.5 text-metin-ikincil" />
                <span className="sr-only">{metin}</span>
                <span className="enstruman text-metin">{derece(x.sicaklik)}</span>
                <span className="enstruman h-3.5 text-[0.625rem] leading-3.5 text-metin-soluk">
                  {x.yagis >= 30 ? '%' + Math.round(x.yagis) : ''}
                </span>
              </li>
            );
          })}
        </ol>
      )}

      {gunluk.length > 0 && (
        <table className="mt-2 w-full border-t border-kenar text-xs">
          <caption className="sr-only">Beş günlük tahmin</caption>
          <tbody>
            {gunluk.map((g) => {
              const sol = ((g.enDusuk - gMin) / aralik) * 100;
              const gen = Math.max(2, ((g.enYuksek - g.enDusuk) / aralik) * 100);
              return (
                <tr key={g.gun}>
                  <th scope="row" className="w-12 py-1 text-left font-normal text-metin-ikincil">
                    {gunAdi(g.gun, simdi)}
                  </th>
                  <td className="w-5 py-1">
                    <HavaIkonu kod={g.kod} gunduz className="size-3.5 text-metin-ikincil" />
                    <span className="sr-only">{havaMetni(g.kod)}</span>
                  </td>
                  <td className="enstruman w-9 py-1 text-[0.6875rem] text-metin-soluk">
                    {g.yagis >= 30 ? '%' + Math.round(g.yagis) : ''}
                  </td>
                  <td className="enstruman w-9 py-1 text-right text-metin-soluk">
                    <span className="sr-only">en düşük </span>
                    {derece(g.enDusuk)}
                  </td>
                  <td className="px-2.5 py-1" aria-hidden="true">
                    <span className="relative block h-1 rounded-full bg-kenar">
                      <span
                        className="absolute inset-y-0 rounded-full bg-metin-ikincil"
                        style={{ left: sol + '%', width: Math.min(gen, 100 - sol) + '%' }}
                      />
                    </span>
                  </td>
                  <td className="enstruman w-9 py-1 text-right text-metin">
                    <span className="sr-only">en yüksek </span>
                    {derece(g.enYuksek)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {h.bayat && <p className="mt-2 text-[0.6875rem] text-metin-soluk">Ağ yok: {olcumMetni} ölçümü gösteriliyor.</p>}
    </section>
  );
}

function SehirSecimi({
  vazgec,
  onSecildi,
}: {
  vazgec: (() => void) | null;
  onSecildi: (k: HavaKonumu, sonuc: HavaSonucu) => void;
}) {
  const [sonuclar, setSonuclar] = useState<HavaKonumu[] | null>(null);
  const [araniyor, setAraniyor] = useState(false);
  const [seciliyor, setSeciliyor] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const aramaNo = useRef(0);
  const canli = useRef(true);
  useEffect(() => {
    canli.current = true;
    return () => {
      canli.current = false;
    };
  }, []);

  const ara = (sorgu: string) => {
    const no = ++aramaNo.current;
    setAraniyor(true);
    setHata(null);
    const bitir = (l: HavaKonumu[] | null) => {
      if (!canli.current || no !== aramaNo.current) return;
      setAraniyor(false);
      if (l) setSonuclar(l);
      else setHata('Arama yapılamadı. Bağlantıyı denetleyip yeniden dene.');
    };
    window.kokpit.havaAra(sorgu).then((l) => bitir(Array.isArray(l) ? l : []), () => bitir(null));
  };

  const sec = (k: HavaKonumu) => {
    setSeciliyor(true);
    setHata(null);
    window.kokpit.havaKonumSec(k).then(
      (s) => {
        if (!canli.current) return;
        setSeciliyor(false);
        onSecildi(k, s);
      },
      () => {
        if (!canli.current) return;
        setSeciliyor(false);
        setHata('Konum kaydedilemedi. Yeniden dene.');
      },
    );
  };

  return (
    <div className="space-y-2">
      <div className="flex items-start gap-2">
        <p className="min-w-0 flex-1 leading-relaxed text-metin-ikincil">
          Hava durumu için bir şehir seç. Yalnız şehrin koordinatı open-meteo.com'a gider.
        </p>
        {vazgec && (
          <button
            type="button"
            onClick={vazgec}
            className="shrink-0 cursor-pointer px-1 text-metin-soluk transition-colors duration-[120ms] hover:text-metin"
          >
            Vazgeç
          </button>
        )}
      </div>
      <AdaGirdi placeholder="Şehir ara" etiket="Şehir ara" onGonder={ara} temizle={false} disabled={araniyor || seciliyor} />
      {araniyor ? (
        <p role="status" className="px-1 text-metin-soluk">
          Aranıyor…
        </p>
      ) : hata ? (
        <p role="status" className="px-1 text-hata-metin">
          {hata}
        </p>
      ) : sonuclar && sonuclar.length === 0 ? (
        <p role="status" className="px-1 text-metin-soluk">
          Bulunamadı. Başka bir yazımla dene.
        </p>
      ) : sonuclar ? (
        <ul aria-label="Arama sonuçları" className="space-y-0.5">
          {sonuclar.map((k) => {
            const alt = [k.bolge, k.ulke].filter(Boolean).join(' · ');
            return (
              <li key={k.enlem + ',' + k.boylam + ',' + k.ad}>
                <button
                  type="button"
                  onClick={() => sec(k)}
                  disabled={seciliyor}
                  className="flex w-full min-w-0 cursor-pointer items-baseline gap-2 rounded-lg px-2 py-1.5 text-left transition-colors duration-[120ms] hover:bg-yuzey-guclu disabled:cursor-default disabled:opacity-40"
                >
                  <span className="shrink-0 text-metin">{k.ad}</span>
                  {alt && <span className="min-w-0 truncate text-metin-soluk">{alt}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
