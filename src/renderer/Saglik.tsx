import { AlertTriangle, ArrowRight, Brain, CheckCircle2, MessageSquareText } from 'lucide-react';
import type { Durum, GunButcesi } from './types';
import { gunMetni } from './parcalar';

interface Props {
  durum: Durum;
  /** Vault'ta claude oturumu ac ("Aria ile konus"). */
  onVaultOturumu: () => void;
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

// Butce serileri: DESIGN.md aksani + teal. dataviz validator ile koyu yuzeyde dogrulandi
// (2026-09-21): lightness band, chroma, CVD ΔE 30+, kontrast 3:1 — hepsi gecti.
const SERI = [
  { anahtar: 'yeni_girdi', ad: 'Yeni girdi', renk: '#8b5cf6' },
  { anahtar: 'cikti', ad: 'Çıktı', renk: '#0d9488' },
] as const;

function tk(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return Math.round(n / 1_000) + 'k';
  return String(n);
}

/** Yedi gunluk token cubuklari: gun basina iki seri yan yana, tek eksen, hover basligi. */
function ButceGrafigi({ gunler }: { gunler: Record<string, GunButcesi> }) {
  const sirali = Object.entries(gunler).sort(([a], [b]) => a.localeCompare(b));
  if (sirali.length === 0) return <p className="text-xs text-metin-soluk">7 günde kayıt yok.</p>;
  const enCok = Math.max(1, ...sirali.flatMap(([, g]) => SERI.map((s) => g[s.anahtar] ?? 0)));
  const H = 96;
  const genislik = 100 / sirali.length;
  return (
    <figure className="m-0">
      <svg
        viewBox={`0 0 100 ${H + 18}`}
        preserveAspectRatio="none"
        className="block h-36 w-full"
        role="img"
        aria-label={'Son ' + sirali.length + ' günün token kullanımı, gün başına yeni girdi ve çıktı'}
      >
        {sirali.map(([gun, g], i) => {
          const x0 = i * genislik;
          const ic = genislik * 0.7;
          const bar = ic / SERI.length;
          return (
            <g key={gun}>
              <title>
                {gun}: {SERI.map((s) => s.ad + ' ' + tk(g[s.anahtar] ?? 0)).join(' · ')}
              </title>
              {SERI.map((s, j) => {
                const v = g[s.anahtar] ?? 0;
                const h = (v / enCok) * H;
                return (
                  <rect
                    key={s.anahtar}
                    x={x0 + genislik * 0.15 + j * bar + 0.4}
                    y={H - h}
                    width={Math.max(0.5, bar - 0.8)}
                    height={h}
                    rx={0.8}
                    fill={s.renk}
                  />
                );
              })}
              <text
                x={x0 + genislik / 2}
                y={H + 12}
                textAnchor="middle"
                fontSize="5"
                fill="#86868f"
                fontFamily="JetBrains Mono Variable, ui-monospace, monospace"
              >
                {gun.slice(5)}
              </text>
            </g>
          );
        })}
        <line x1="0" y1={H} x2="100" y2={H} stroke="rgba(244,244,245,0.16)" strokeWidth="0.4" />
      </svg>
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
    </figure>
  );
}

export default function Saglik({ durum, onVaultOturumu }: Props) {
  const b = durum.beyin;
  const k = b.kapsama;
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
          alt={b.son_log ? b.son_log + ' · ' + (b as { log_sayisi?: number }).log_sayisi + ' dosya' : 'günlük yok'}
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
          <h2 className="etiket">Beyne düşmemiş oturumlar</h2>
          {hookSeviye === 'dikkat' && (
            <span className="inline-flex items-center gap-1.5 text-xs text-dikkat-metin">
              <AlertTriangle className="size-3.5" aria-hidden="true" />
              hook hatası: <span className="enstruman">{b.health_hata}</span>
              {b.health_bilesen && <span className="text-metin-soluk">({b.health_bilesen})</span>}
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
                <th scope="col" className="etiket px-5 py-2 font-normal">Oturum</th>
              </tr>
            </thead>
            <tbody>
              {k.dusmemis.map((r) => (
                <tr key={r.session} className="border-b border-kenar last:border-b-0">
                  <td className="enstruman px-5 py-2 text-sm text-metin">{r.proje}</td>
                  <td className="enstruman px-3 py-2 text-xs text-metin-ikincil">{r.gun ?? '—'}</td>
                  <td className="enstruman px-3 py-2 text-right text-xs text-metin-ikincil">{r.mesaj}</td>
                  <td className="enstruman px-3 py-2 text-xs text-dikkat-metin">{r.flush}</td>
                  <td className="enstruman px-5 py-2 text-xs text-metin-soluk">{r.session.slice(0, 8)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {k && k.dusmemis.length > 0 && (
          <p className="border-t border-kenar px-5 py-2.5 text-xs text-metin-soluk">
            Geri doldurma: vault'ta{' '}
            <span className="enstruman text-metin-ikincil">
              python .claude/scripts/flush_kapsama.py --proje {k.dusmemis[0].proje === 'vault' ? '' : k.dusmemis[0].proje} --doldur
            </span>
          </p>
        )}
      </section>

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
