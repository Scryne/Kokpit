import { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Brain,
  CheckCircle2,
  MessageSquareText,
  RotateCcw,
  ShieldCheck,
} from 'lucide-react';
import type { Durum, GunButcesi, NobetProjesi, SaglikNobeti } from './types';
import { envanterMetni, gunMetni } from './parcalar';

interface Props {
  durum: Durum;
  /** Kokpit'te acik oturumlarin klasorleri: o klasorun oturumu geri doldurulmaz. */
  acikYollar: string[];
  /** Vault'ta claude oturumu ac ("Aria ile konus"). */
  onVaultOturumu: () => void;
  /** Geri doldurma sonrasi durum.py'yi yeniden oku. */
  onTazele: () => void;
}

type Seviye = 'iyi' | 'dikkat' | 'kotu';

const SEVIYE_NOKTA: Record<Seviye, string> = {
  iyi: 'bg-metin-ikincil',
  dikkat: 'bg-dikkat',
  kotu: 'bg-hata',
};

/** Boru zincirinin bir halkasi: ad, olculmus deger, tek satir aciklama, seviye. */
function Halka({
  ad,
  deger,
  alt,
  seviye,
  son = false,
}: {
  ad: string;
  deger: string;
  alt: string;
  seviye: Seviye;
  son?: boolean;
}) {
  return (
    <>
      <div className="min-w-0 flex-1 px-4 py-3">
        <p className="etiket flex items-center gap-2">
          <span className={'size-1.5 shrink-0 rounded-full ' + SEVIYE_NOKTA[seviye]} aria-hidden="true" />
          {ad}
          <span className="sr-only">
            {seviye === 'iyi' ? '(iyi)' : seviye === 'dikkat' ? '(dikkat)' : '(sorun)'}
          </span>
        </p>
        <p className={'enstruman mt-1.5 text-xl leading-none ' + (seviye === 'kotu' ? 'text-hata-metin' : seviye === 'dikkat' ? 'text-dikkat-metin' : 'text-metin')}>
          {deger}
        </p>
        <p className="mt-1.5 truncate text-xs text-metin-soluk">{alt}</p>
      </div>
      {!son && (
        <ArrowRight className="size-3.5 shrink-0 self-center text-metin-soluk/60" aria-hidden="true" />
      )}
    </>
  );
}

// Butce serileri: celik mavisi + teal. Gumus aksan grafikte kullanilamaz (akromatik:
// dataviz validator'da lightness band ve chroma floor FAIL). Bu cift 2026-10-03'te #16181c
// yuzeyinde dogrulandi: lightness band, chroma, CVD ΔE 15.3, normal 17.7, kontrast 3:1 — gecti.
const SERI = [
  { anahtar: 'yeni_girdi', ad: 'Yeni girdi', renk: '#5b8def' },
  { anahtar: 'cikti', ad: 'Çıktı', renk: '#0d9488' },
] as const;

function tk(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return Math.round(n / 1_000) + 'k';
  return String(n);
}

/** Kapsayicinin piksel genisligi; grafik viewBox esnetmek yerine gercek olcuyle cizilir. */
function useGenislik<T extends HTMLElement>(ref: React.RefObject<T | null>) {
  const [genislik, setGenislik] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const g = new ResizeObserver(([giris]) => setGenislik(Math.round(giris.contentRect.width)));
    g.observe(el);
    return () => g.disconnect();
  }, [ref]);
  return genislik;
}

/** Eksen tavani: 1-2-5 katlari (4.5M -> 5M) ki izgara cizgileri okunur sayilara otursun. */
function guzelTavan(n: number) {
  if (n <= 0) return 1;
  const us = Math.pow(10, Math.floor(Math.log10(n)));
  for (const k of [1, 2, 2.5, 5, 10]) if (k * us >= n) return k * us;
  return 10 * us;
}

/** Ustu yuvarlak, tabana oturan cubuk (dataviz: veri ucu 4 px yuvarlak, taban duz). */
function cubukYolu(x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h);
  if (h <= 0) return '';
  return (
    `M ${x} ${y + h} V ${y + rr} a ${rr} ${rr} 0 0 1 ${rr} -${rr} ` +
    `h ${w - 2 * rr} a ${rr} ${rr} 0 0 1 ${rr} ${rr} V ${y + h} Z`
  );
}

/**
 * Yedi gunluk token cubuklari. Piksel uzayinda cizilir (viewBox esnetilince yazilar yatay
 * yayilip cubuklar hantallasiyordu — 2026-09-21 ekran goruntusu). Tek eksen, iki seri yan
 * yana, ince cubuk, sessiz izgara, hover basligi, ekran okuyucu icin tablo.
 */
function ButceGrafigi({ gunler }: { gunler: Record<string, GunButcesi> }) {
  const kapRef = useRef<HTMLDivElement>(null);
  const W = useGenislik(kapRef);
  const sirali = Object.entries(gunler).sort(([a], [b]) => a.localeCompare(b));
  if (sirali.length === 0) return <p className="text-xs text-metin-soluk">7 günde kayıt yok.</p>;

  const H = 150;
  const SOL = 40; // y etiketleri
  const ALT = 22; // gun etiketleri
  const UST = 8;
  const enCok = Math.max(...sirali.flatMap(([, g]) => SERI.map((s) => g[s.anahtar] ?? 0)));
  const tavan = guzelTavan(enCok);
  const plotW = Math.max(0, W - SOL - 8);
  const plotH = H - UST - ALT;
  const grup = sirali.length > 0 ? plotW / sirali.length : 0;
  const cubuk = Math.max(4, Math.min(22, Math.floor(grup * 0.28)));
  const ara = 3;
  const ikiliW = SERI.length * cubuk + (SERI.length - 1) * ara;
  const y = (v: number) => UST + plotH - (v / tavan) * plotH;
  const izgara = [tavan / 2, tavan];

  return (
    <figure className="m-0">
      <div ref={kapRef} className="w-full">
        {W > 0 && (
          <svg
            width={W}
            height={H}
            className="block"
            role="img"
            aria-label={'Son ' + sirali.length + ' günün token kullanımı, gün başına yeni girdi ve çıktı'}
            fontFamily="'JetBrains Mono Variable', ui-monospace, monospace"
            fontSize="10"
          >
            {/* Sessiz izgara: iki cizgi, sol etiket. */}
            {izgara.map((v) => (
              <g key={v}>
                <line
                  x1={SOL}
                  x2={W - 8}
                  y1={y(v)}
                  y2={y(v)}
                  stroke="rgba(244,244,245,0.08)"
                  strokeWidth="1"
                />
                <text x={SOL - 6} y={y(v) + 3.5} textAnchor="end" fill="#a3a9b3">
                  {tk(v)}
                </text>
              </g>
            ))}
            <line x1={SOL} x2={W - 8} y1={UST + plotH} y2={UST + plotH} stroke="rgba(244,244,245,0.16)" strokeWidth="1" />
            {sirali.map(([gun, g], i) => {
              const x0 = SOL + i * grup + (grup - ikiliW) / 2;
              return (
                <g key={gun}>
                  <title>{gun}: {SERI.map((s) => s.ad + ' ' + tk(g[s.anahtar] ?? 0)).join(' · ')}</title>
                  {/* Hover hedefi cubuktan genis: butun gun sutunu. */}
                  <rect x={SOL + i * grup} y={UST} width={grup} height={plotH} fill="transparent" />
                  {SERI.map((s, j) => {
                    const v = g[s.anahtar] ?? 0;
                    const h = (v / tavan) * plotH;
                    return (
                      <path
                        key={s.anahtar}
                        d={cubukYolu(x0 + j * (cubuk + ara), y(v), cubuk, h, 4)}
                        fill={s.renk}
                      />
                    );
                  })}
                  <text x={SOL + i * grup + grup / 2} y={H - 6} textAnchor="middle" fill="#a3a9b3">
                    {gun.slice(5).replace('-', '.')}
                  </text>
                </g>
              );
            })}
          </svg>
        )}
      </div>
      <figcaption className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-metin-soluk">
        {SERI.map((s) => (
          <span key={s.anahtar} className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-sm" style={{ background: s.renk }} aria-hidden="true" />
            {s.ad}
          </span>
        ))}
        <span className="ml-auto">
          en yüksek gün <span className="enstruman">{tk(enCok)}</span>
        </span>
      </figcaption>
      {/* Ekran okuyucu ve kopyalama icin ayni veri tablo olarak (dataviz: tablo gorunumu sart). */}
      <table className="sr-only">
        <caption>Gün başına token</caption>
        <thead>
          <tr>
            <th scope="col">Gün</th>
            {SERI.map((s) => (
              <th key={s.anahtar} scope="col">{s.ad}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sirali.map(([gun, g]) => (
            <tr key={gun}>
              <th scope="row">{gun}</th>
              {SERI.map((s) => (
                <td key={s.anahtar}>{g[s.anahtar] ?? 0}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

/** CI hucresi: yesil sakin, kirmizi dikkat; bilgi olmayan durumlar soluk. */
function CiHucresi({ ci }: { ci: NobetProjesi['ci'] }) {
  if (!ci) return <span className="text-metin-soluk">—</span>;
  if (ci.durum === 'yesil')
    return (
      <span className="text-metin-ikincil">
        yeşil <span className="enstruman text-metin-soluk">· {ci.dal} · {ci.son?.slice(5)}</span>
      </span>
    );
  if (ci.durum === 'kirmizi')
    return (
      <span className="text-hata-metin">
        kırmızı{ci.is ? ' · ' + ci.is : ''}
        {ci.url && (
          <button
            type="button"
            onClick={() => void window.kokpit.linkAc(ci.url!)}
            className="ml-1.5 cursor-pointer underline decoration-dotted underline-offset-2 hover:text-metin"
          >
            koşuyu aç
          </button>
        )}
      </span>
    );
  return <span className="text-metin-soluk">{ci.durum}</span>;
}

function DependabotHucresi({ d }: { d: NobetProjesi['dependabot'] }) {
  if (!d) return <span className="text-metin-soluk">—</span>;
  if (d.durum !== 'okundu') return <span className="text-metin-soluk">{d.durum}</span>;
  const acik = Object.entries(d.acik ?? {}).filter(([, n]) => n > 0);
  if (acik.length === 0) return <span className="text-metin-ikincil">açık yok</span>;
  const ciddi = (d.acik?.critical ?? 0) + (d.acik?.high ?? 0) > 0;
  return (
    <span className={ciddi ? 'text-dikkat-metin' : 'text-metin-ikincil'}>
      {acik.map(([s, n]) => n + ' ' + s).join(', ')}
    </span>
  );
}

function ModelHucresi({ m }: { m: NobetProjesi['modeller'] }) {
  if (!m || m.length === 0) return <span className="text-metin-soluk">—</span>;
  return (
    <ul className="space-y-0.5">
      {m.map((x) => (
        <li
          key={x.saglayici + x.model}
          title={x.neden}
          className={
            x.durum === 'OLU' ? 'text-hata-metin' : x.durum === 'yasiyor' ? 'text-metin-ikincil' : 'text-dikkat-metin'
          }
        >
          <span className="enstruman">{x.model.split('/').pop()}</span> ·{' '}
          {x.durum === 'yasiyor' ? 'yaşıyor' : x.durum === 'OLU' ? 'ÖLÜ' : x.durum}
        </li>
      ))}
    </ul>
  );
}

/**
 * Saglik nobeti (saglik.py, haftalik): CI, Dependabot, AI modelleri. Kokpit calistirmaz,
 * yalniz son kosuyu gosterir. Nobet 8 gunden eskiyse zamanlanmis gorev calismiyor demektir.
 */
function NobetBolumu({ s }: { s: SaglikNobeti | null | undefined }) {
  if (!s) {
    return (
      <section className="halka relative rounded-base bg-yuzey px-5 py-4">
        <h2 className="etiket">Sağlık nöbeti</h2>
        <p className="mt-2 text-sm text-metin-ikincil">
          Nöbet hiç koşmamış. Vault'ta <span className="enstruman">python .claude/scripts/saglik.py</span>{' '}
          çalıştır ya da ScryneOS-Saglik görevine bak.
        </p>
      </section>
    );
  }
  const yas = Math.max(0, Math.floor((Date.now() / 1000 - s.ts) / 86_400));
  const bayat = yas > 8;
  return (
    <section className="halka relative rounded-base bg-yuzey">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-kenar px-5 py-3">
        <h2 className="etiket flex items-center gap-2">
          <ShieldCheck className="size-3.5" aria-hidden="true" />
          Sağlık nöbeti
        </h2>
        <span className={'text-xs ' + (bayat ? 'text-dikkat-metin' : 'text-metin-soluk')}>
          son koşu <span className="enstruman">{s.tarih}</span> ({gunMetni(yas)})
          {bayat && ' · haftalık görev çalışmıyor olabilir'}
        </span>
      </div>
      {s.alarmlar.length > 0 ? (
        <ul className="space-y-1 border-b border-kenar px-5 py-3">
          {s.alarmlar.map((a) => (
            <li key={a} className="flex items-start gap-2 text-sm text-dikkat-metin">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              {a}
            </li>
          ))}
        </ul>
      ) : (
        <p className="flex items-center gap-2 border-b border-kenar px-5 py-3 text-sm text-metin-ikincil">
          <CheckCircle2 className="size-4 text-metin-soluk" aria-hidden="true" />
          Alarm yok.
        </p>
      )}
      <table className="w-full text-left text-xs">
        <caption className="sr-only">Nöbetteki projelerin CI, bağımlılık ve model durumu</caption>
        <thead>
          <tr className="border-b border-kenar">
            <th scope="col" className="etiket px-5 py-2 font-normal">Proje</th>
            <th scope="col" className="etiket px-3 py-2 font-normal">CI</th>
            <th scope="col" className="etiket px-3 py-2 font-normal">Dependabot</th>
            <th scope="col" className="etiket px-5 py-2 font-normal">AI modelleri</th>
          </tr>
        </thead>
        <tbody>
          {s.projeler.map((p) => (
            <tr key={p.ad} className="border-b border-kenar align-top last:border-b-0">
              <th scope="row" className="px-5 py-2 font-normal">
                <span className="enstruman text-sm text-metin">{p.ad}</span>
                {p.envanter && (
                  <span className="block text-metin-soluk">{envanterMetni(p.envanter)}</span>
                )}
              </th>
              <td className="px-3 py-2">
                <CiHucresi ci={p.ci} />
              </td>
              <td className="px-3 py-2">
                <DependabotHucresi d={p.dependabot} />
              </td>
              <td className="px-5 py-2">
                <ModelHucresi m={p.modeller} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

/** Geri doldurma sonucunun insan dili. Betik `sonuc: <durum>` satiri basar (flush_kapsama.py). */
function doldurmaMetni(sonuc: string) {
  if (sonuc === 'ok:appended') return 'günlüğe düştü ✓';
  if (sonuc.startsWith('ok')) return 'kalıcı değer yok, normal';
  if (sonuc === 'red:taze') return 'son 30 dk içinde yazılmış; açık olabilir';
  if (sonuc === 'red:kisa') return 'çok kısa oturum';
  if (sonuc === 'red:transcript-yok') return 'transcript bulunamadı';
  return 'başarısız: ' + sonuc;
}

export default function Saglik({ durum, acikYollar, onVaultOturumu, onTazele }: Props) {
  const b = durum.beyin;
  const k = b.kapsama;
  // Geri doldurma: oturum -> 'calisiyor' | sonuc. Ayni anda birden fazla istenebilir; main
  // kuyruga alir (her biri bir model cagrisi).
  const [doldurma, setDoldurma] = useState<Record<string, string>>({});
  const projeYolu = (proje: string) =>
    proje === 'vault'
      ? durum.vault
      : durum.projeler.find((p) => p.yol.split(/[\\/]/).pop() === proje)?.yol;
  const doldur = async (session: string, proje: string) => {
    setDoldurma((d) => ({ ...d, [session]: 'calisiyor' }));
    const r = await window.kokpit.beyinDoldur(session, proje);
    setDoldurma((d) => ({ ...d, [session]: r.sonuc }));
    // Basarida satir listeden duser (tazeleme); sonuc bu şeritte kalir.
    setSonDoldurma(proje + ' · ' + session.slice(0, 8) + ': ' + doldurmaMetni(r.sonuc));
    if (r.tamam) onTazele();
  };
  const [sonDoldurma, setSonDoldurma] = useState<string | null>(null);
  const gunler = durum.butce.gunler ?? {};
  const tip = durum.butce.tip ?? {};
  const hookPayi = (() => {
    const o = tip.oturum?.yeni_girdi ?? 0;
    const h = tip.hook?.yeni_girdi ?? 0;
    return o + h > 0 ? Math.round((h / (o + h)) * 100) : 0;
  })();

  const logSeviye: Seviye = (b.son_log_gun ?? 99) <= 1 ? 'iyi' : (b.son_log_gun ?? 99) <= 3 ? 'dikkat' : 'kotu';
  const flushSeviye: Seviye = !k ? 'dikkat' : k.dusmemis.length === 0 ? 'iyi' : k.dusmemis.length <= 2 ? 'dikkat' : 'kotu';
  const derleyiciSeviye: Seviye =
    b.derleyici_son_durum === 'ok' && b.islenmemis_loglar.length === 0
      ? 'iyi'
      : b.derleyici_son_durum === 'ok'
        ? 'dikkat'
        : 'kotu';
  const hookSeviye: Seviye = b.health_hata && (b.health_yas_gun ?? 99) <= 1 ? 'dikkat' : 'iyi';

  return (
    <div className="space-y-6">
      {/* Boru zinciri: gunluk -> flush -> derleyici -> bilgi tabani. Tek satir, oklu. */}
      <section aria-label="Beyin boru zinciri" className="halka relative flex items-stretch overflow-hidden rounded-base bg-yuzey">
        <Halka
          ad="Günlük"
          deger={gunMetni(b.son_log_gun) ?? '—'}
          alt={
            b.son_log
              ? b.son_log + (b.log_sayisi !== undefined ? ' · ' + b.log_sayisi + ' dosya' : '')
              : 'günlük yok'
          }
          seviye={logSeviye}
        />
        <Halka
          ad="Flush"
          deger={k ? String(k.dusmemis.length) : '—'}
          alt={
            k
              ? k.dusmemis.length === 0
                ? k.toplam + ' oturumun hepsi beyne düştü (' + k.pencere_gun + ' gün)'
                : k.dusmemis.length + ' / ' + k.toplam + ' oturum düşmedi (' + k.pencere_gun + ' gün)'
              : 'kapsama ölçülmedi — durum.py eski'
          }
          seviye={flushSeviye}
        />
        <Halka
          ad="Derleyici"
          deger={b.derleyici_son_durum ?? '—'}
          alt={
            b.islenmemis_loglar.length > 0
              ? b.islenmemis_loglar.length + ' işlenmemiş log'
              : 'tüm loglar işlendi'
          }
          seviye={derleyiciSeviye}
        />
        <Halka
          ad="Bilgi tabanı"
          deger={String(b.makale)}
          alt={b.baglanti + ' bağlantı · ' + b.threads.length + ' açık thread'}
          seviye="iyi"
          son
        />
      </section>

      {/* Dusmemis oturumlar: bu sayfanin varlik sebebi. */}
      <section className="halka relative rounded-base bg-yuzey">
        <div className="flex items-center justify-between gap-4 border-b border-kenar px-5 py-3">
          <h2 className="etiket shrink-0 whitespace-nowrap">Beyne düşmemiş oturumlar</h2>
          {hookSeviye === 'dikkat' && (
            // Hata metni uzun olabilir (yol iceren Errno); tek satirda kirpilir, tamami title'da.
            <span
              className="inline-flex min-w-0 items-center gap-1.5 text-xs text-dikkat-metin"
              title={'hook hatası' + (b.health_bilesen ? ' (' + b.health_bilesen + ')' : '') + ': ' + b.health_hata}
            >
              <AlertTriangle className="size-3.5 shrink-0" aria-hidden="true" />
              <span className="shrink-0">hook hatası{b.health_bilesen ? ' (' + b.health_bilesen + ')' : ''}:</span>
              <span className="enstruman min-w-0 truncate">{b.health_hata}</span>
            </span>
          )}
        </div>
        {!k || k.dusmemis.length === 0 ? (
          <p className="flex items-center gap-2 px-5 py-4 text-sm text-metin-ikincil">
            <CheckCircle2 className="size-4 text-metin-soluk" aria-hidden="true" />
            {k
              ? 'Son ' + k.pencere_gun + ' günün ' + k.toplam + ' oturumu da günlüğe düştü.'
              : 'Kapsama verisi yok.'}
          </p>
        ) : (
          <table className="w-full text-left">
            <caption className="sr-only">Günlüğe düşmemiş oturumlar</caption>
            <thead>
              <tr className="border-b border-kenar">
                <th scope="col" className="etiket px-5 py-2 font-normal">Proje</th>
                <th scope="col" className="etiket px-3 py-2 font-normal">Gün</th>
                <th scope="col" className="etiket px-3 py-2 text-right font-normal">Mesaj</th>
                <th scope="col" className="etiket px-3 py-2 font-normal">Flush</th>
                <th scope="col" className="etiket px-3 py-2 font-normal">Oturum</th>
                <th scope="col" className="etiket px-5 py-2 text-right font-normal">
                  <span className="sr-only">Eylem</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {k.dusmemis.map((r) => {
                const d = doldurma[r.session];
                const yol = projeYolu(r.proje);
                // Kokpit'te o klasorde acik oturum varsa doldurma yok: acik bir oturumu erken
                // doldurmak ozeti yarim birakir, gercek SessionEnd'de ikinci kez yazilir.
                const acik = !!yol && acikYollar.includes(yol);
                return (
                  <tr key={r.session} className="border-b border-kenar last:border-b-0">
                    <td className="enstruman px-5 py-2 text-sm text-metin">{r.proje}</td>
                    <td className="enstruman px-3 py-2 text-xs text-metin-ikincil">{r.gun ?? '—'}</td>
                    <td className="enstruman px-3 py-2 text-right text-xs text-metin-ikincil">{r.mesaj}</td>
                    <td className="enstruman px-3 py-2 text-xs text-dikkat-metin">{r.flush}</td>
                    <td className="enstruman px-3 py-2 text-xs text-metin-soluk">{r.session.slice(0, 8)}</td>
                    <td className="px-5 py-2 text-right text-xs">
                      {d === 'calisiyor' ? (
                        <span role="status" className="text-metin-soluk">
                          dolduruluyor, ~1 dk…
                        </span>
                      ) : d && !d.startsWith('ok') ? (
                        <span className="text-dikkat-metin">{doldurmaMetni(d)}</span>
                      ) : (
                        <button
                          type="button"
                          disabled={acik}
                          onClick={() => void doldur(r.session, r.proje)}
                          title={
                            acik
                              ? 'Bu klasörde Kokpit\'te açık oturum var; önce onu kapat'
                              : 'Oturumu şimdi özetleyip günlüğe düşür (model çağrısı, ~1 dk)'
                          }
                          className="inline-flex cursor-pointer items-center gap-1.5 rounded-kontrol border border-kenar px-2.5 py-1 text-metin-ikincil transition-colors duration-[180ms] hover:border-kenar-guclu hover:text-metin disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <RotateCcw className="size-3.5" aria-hidden="true" />
                          Geri doldur
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {sonDoldurma && (
          <p role="status" className="border-t border-kenar px-5 py-2.5 text-xs text-metin-ikincil">
            Son geri doldurma: {sonDoldurma}
          </p>
        )}
      </section>

      <NobetBolumu s={durum.saglik} />

      {/* Butce + Aria: yan yana, esit degil — butce genis, Aria dar. */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <section className="halka relative rounded-base bg-yuzey px-5 py-4">
          <h2 className="etiket">Bütçe · 7 gün</h2>
          <p className="mt-1 mb-3 text-xs text-metin-soluk">
            Cache okuması sayılmaz (tekrar ölçer, tüketim değil). Hook artıkları yeni girdinin{' '}
            <span className="enstruman">%{hookPayi}</span>'i.
          </p>
          <ButceGrafigi gunler={gunler} />
        </section>

        <section className="halka relative flex flex-col rounded-base bg-yuzey px-5 py-4">
          <h2 className="etiket">İlişkisel katman</h2>
          <p className="mt-2 text-sm text-metin-ikincil">
            Son vault oturumu{' '}
            <span className="enstruman text-metin">
              {k?.son_vault_oturumu_gun === null || k?.son_vault_oturumu_gun === undefined
                ? '—'
                : gunMetni(k.son_vault_oturumu_gun)}
            </span>
          </p>
          <p className="mt-1 text-xs text-metin-soluk">
            Threads ve Last-Session yalnız vault oturumunda güncellenir; proje oturumları
            günlüğe düşer ama ilişkisel katmana dokunmaz. Bir haftayı geçince bayatlar.
          </p>
          <button
            type="button"
            onClick={onVaultOturumu}
            className="mt-4 inline-flex cursor-pointer items-center justify-center gap-2 rounded-kontrol bg-birincil px-3 py-2 text-sm font-medium text-birincil-uzeri transition-colors duration-[180ms] hover:bg-metin-ikincil"
          >
            <MessageSquareText className="size-4" aria-hidden="true" />
            Aria ile konuş
          </button>
          <p className="mt-2 text-center text-xs text-metin-soluk">vault klasöründe claude açar</p>
        </section>
      </div>

      {/* Thread'ler: baslik + Status satiri. */}
      <section className="halka relative rounded-base bg-yuzey">
        <h2 className="etiket flex items-center gap-2 border-b border-kenar px-5 py-3">
          <Brain className="size-3.5" aria-hidden="true" />
          Açık thread'ler
        </h2>
        <ul className="divide-y divide-kenar">
          {b.threads.map((t) => (
            <li key={t.baslik} className="px-5 py-2.5">
              <p className="text-sm text-metin">
                <span aria-hidden="true">{t.isaret ? t.isaret + ' ' : ''}</span>
                {t.baslik}
              </p>
              {t.durum && (
                <p className="mt-0.5 truncate text-xs text-metin-soluk">{t.durum.replace(/^[^A-Za-zÇĞİÖŞÜçğıöşü]+/, '')}</p>
              )}
            </li>
          ))}
          {b.threads.length === 0 && (
            <li className="px-5 py-3 text-sm text-metin-soluk">Açık thread yok.</li>
          )}
        </ul>
      </section>
    </div>
  );
}
