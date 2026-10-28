import { AlertTriangle, ArrowRight, CalendarClock, ExternalLink, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import type { BotIsi, BotNobeti, Vade } from './types';
import { sureMetni } from './parcalar';

// v3.0: bot nobeti (Botlar sayfasi, Pano seridi) ve vade seridi. Veri durum.py'den: vadeler `--json`'da,
// nobet `--nobet` ile ayri (gorev sorgusu + GitHub API; 5 dk'da bir, onbellekli). DESIGN.md: renk yalniz
// sende olan sey icin; dusen bot ve bugunku vade amber, gerisi bicimle okunur. Mono = olculmus deger.

const HAL_ADI: Record<BotIsi['hal'], string> = {
  dustu: 'Düştü',
  gecikti: 'Gecikti',
  bilinmiyor: 'Bilinmiyor',
  saglikli: 'Sağlıklı',
};

function HalIsareti({ hal }: { hal: BotIsi['hal'] }) {
  const sinif =
    hal === 'dustu'
      ? 'bg-dikkat ring-2 ring-dikkat/30'
      : hal === 'gecikti'
        ? 'border border-dikkat'
        : hal === 'bilinmiyor'
          ? 'border border-dashed border-metin-soluk'
          : 'bg-metin-ikincil';
  return <span className={'size-1.5 shrink-0 rounded-full ' + sinif} aria-hidden="true" />;
}

function onceMetni(iso: string | null, simdi: number) {
  if (!iso) return '—';
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '—';
  const s = Math.round((simdi - t) / 1000);
  return s < 0 ? sureMetni(-s) + ' sonra' : sureMetni(s) + ' önce';
}

function sonrakiMetni(iso: string | null, simdi: number) {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t) || t < simdi) return null;
  return sureMetni(Math.round((t - simdi) / 1000)) + ' sonra';
}

function siklikMetni(saat: number | null) {
  if (!saat) return null;
  if (saat < 1) return Math.round(saat * 60) + ' dakikada bir';
  if (saat < 24) return Math.round(saat) + ' saatte bir';
  if (saat === 24) return 'günde bir';
  if (saat === 168) return 'haftada bir';
  return Math.round(saat / 24) + ' günde bir';
}

/** Dusen/geciken isler: Pano'nun ustunde tek serit. Yalniz varken. */
export function BotSeridi({ nobet, onBotlar }: { nobet: BotNobeti | null; onBotlar: () => void }) {
  const sorunlu = (nobet?.isler ?? []).filter((x) => x.hal === 'dustu' || x.hal === 'gecikti');
  if (sorunlu.length === 0) return null;
  return (
    <section
      aria-label="Bot nöbeti: sorunlu işler"
      className="halka relative flex flex-wrap items-center gap-x-4 gap-y-2 rounded-base border border-dikkat/30 bg-dikkat/10 px-4 py-3"
    >
      <AlertTriangle className="size-4 shrink-0 text-dikkat-metin" aria-hidden="true" />
      <ul className="min-w-0 flex-1 space-y-0.5 text-sm text-metin">
        {sorunlu.map((x) => (
          <li key={x.proje + x.ad} className="truncate">
            <span className="enstruman">{x.proje}</span> · {x.ad} {x.hal === 'dustu' ? 'düştü' : 'gecikti'}
            {x.ayrinti && <span className="text-metin-ikincil">: {x.ayrinti}</span>}
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={onBotlar}
        className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-kontrol border border-kenar px-2.5 py-1 text-xs text-metin-ikincil transition-colors duration-[120ms] hover:border-kenar-guclu hover:text-metin"
      >
        Botlar <ArrowRight className="size-3.5" aria-hidden="true" />
      </button>
    </section>
  );
}

/** Not metnindeki `kod` parcalari mono (mono = olculmus deger / komut); ters tirnak gosterilmez. */
export function VadeMetni({ metin }: { metin: string }) {
  const parcalar = metin.split('`');
  return (
    <>
      {parcalar.map((p, i) => (i % 2 === 1 ? <span key={i} className="enstruman">{p}</span> : p))}
    </>
  );
}

export function vadeEtiketi(v: Vade) {
  const saat = v.saat ? ' ' + v.saat : '';
  if (v.kalan_gun < 0) return -v.kalan_gun + ' gün geçti';
  if (v.kalan_gun === 0) return 'bugün' + saat;
  if (v.kalan_gun === 1) return 'yarın' + saat;
  const [, a, g] = v.tarih.split('-');
  return g + '.' + a + saat + ' · ' + v.kalan_gun + ' gün';
}

const VADE_UFKU_GUN = 7;

/** Pano'nun ustunde: gecikmis, bugun ve bu hafta. Hafta bossa yalniz siradaki tek satir. */
export function VadeSeridi({ vadeler }: { vadeler: Vade[] | undefined }) {
  const liste = vadeler ?? [];
  if (liste.length === 0) return null;
  const yakin = liste.filter((v) => v.kalan_gun <= VADE_UFKU_GUN);
  const sonra = liste.filter((v) => v.kalan_gun > VADE_UFKU_GUN);
  const gosterilen = yakin.length ? yakin : sonra.slice(0, 1);
  return (
    <section aria-label="Vadeler" className="halka relative rounded-base bg-yuzey px-4 py-3">
      <div className="flex items-start gap-4">
        <p className="etiket flex shrink-0 items-center gap-2 pt-0.5">
          <CalendarClock className="size-3.5 text-metin-soluk" aria-hidden="true" />
          {yakin.length ? 'Bu hafta' : 'Sıradaki'}
        </p>
        <ul className="min-w-0 flex-1 space-y-1 text-sm">
          {gosterilen.map((v) => {
            const acil = v.kalan_gun <= 1;
            return (
              <li key={v.proje + v.tarih + v.metin} className="flex min-w-0 items-baseline gap-3">
                <span className={'enstruman w-36 shrink-0 ' + (acil ? 'text-dikkat-metin' : 'text-metin-ikincil')}>{vadeEtiketi(v)}</span>
                <span className="min-w-0 truncate text-metin" title={v.metin.replace(/`/g, '')}>
                  <VadeMetni metin={v.metin} />
                </span>
                <span className="enstruman ml-auto shrink-0 text-xs text-metin-soluk">{v.proje}</span>
              </li>
            );
          })}
        </ul>
      </div>
      {yakin.length > 0 && sonra.length > 0 && (
        <p className="mt-2 pl-[6.25rem] text-xs text-metin-soluk" title={sonra.map((v) => v.tarih + ' · ' + v.proje + ' · ' + v.metin).join('\n')}>
          sonra {sonra.length} vade daha · ilki {vadeEtiketi(sonra[0])}
        </p>
      )}
    </section>
  );
}

/** Botlar sayfasi (Ctrl+5): her otomatik isin son kosusu, sikligi, hali. */
export default function Botlar({ nobet, simdi, onTazele }: { nobet: BotNobeti | null; simdi: number; onTazele: () => Promise<void> }) {
  const [tazeleniyor, setTazeleniyor] = useState(false);
  const isler = nobet?.isler ?? [];
  const sayac = (h: BotIsi['hal']) => isler.filter((x) => x.hal === h).length;
  return (
    <div className="space-y-6">
      <section aria-label="Nöbet özeti" className="halka relative flex flex-wrap items-center gap-x-8 gap-y-3 rounded-base bg-yuzey px-5 py-4">
        {(['dustu', 'gecikti', 'saglikli'] as const).map((h) => (
          <div key={h}>
            <p className="etiket">{HAL_ADI[h]}</p>
            <p className={'enstruman mt-1 text-2xl leading-none ' + (h !== 'saglikli' && sayac(h) > 0 ? 'text-dikkat-metin' : 'text-metin')}>{sayac(h)}</p>
          </div>
        ))}
        <div className="ml-auto flex items-center gap-3 text-xs text-metin-soluk">
          {nobet?.olculdu && <span className="enstruman">ölçüldü {onceMetni(nobet.olculdu, simdi)}</span>}
          <button
            type="button"
            disabled={tazeleniyor}
            onClick={() => {
              setTazeleniyor(true);
              void onTazele().finally(() => setTazeleniyor(false));
            }}
            className="flex cursor-pointer items-center gap-1.5 rounded-kontrol border border-kenar px-2.5 py-1 text-metin-ikincil transition-colors duration-[120ms] hover:border-kenar-guclu hover:text-metin disabled:cursor-wait disabled:opacity-60"
          >
            <RefreshCw className={'size-3.5 ' + (tazeleniyor ? 'animate-spin motion-reduce:animate-none' : '')} aria-hidden="true" />
            {tazeleniyor ? 'Okunuyor' : 'Tazele'}
          </button>
        </div>
      </section>

      {nobet?.hata && (
        <p role="status" className="rounded-base border border-dikkat/30 bg-dikkat/10 px-4 py-2.5 text-sm text-metin">
          Nöbet okunamadı ({nobet.hata}).{isler.length ? ' Gösterilen son başarılı ölçüm.' : ''}
        </p>
      )}

      {!nobet && <p className="text-sm text-metin-soluk">Nöbet okunuyor…</p>}

      {nobet && isler.length === 0 && !nobet.hata && (
        <p className="text-sm text-metin-soluk">
          Bildirilmiş otomatik iş yok. Bir proje kendi işlerini <span className="enstruman">.claude/nobet.json</span> dosyasında bildirir.
        </p>
      )}

      {isler.length > 0 && (
        <section aria-label="Otomatik işler" className="halka relative overflow-hidden rounded-base bg-yuzey">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-kenar text-left">
                <th scope="col" className="etiket px-4 py-2.5 font-normal">Hal</th>
                <th scope="col" className="etiket px-2 py-2.5 font-normal">Proje · iş</th>
                <th scope="col" className="etiket px-2 py-2.5 font-normal">Son koşu</th>
                <th scope="col" className="etiket px-2 py-2.5 font-normal">Sıklık</th>
                <th scope="col" className="etiket px-4 py-2.5 font-normal">Ayrıntı</th>
              </tr>
            </thead>
            <tbody>
              {isler.map((x) => {
                const sonraki = sonrakiMetni(x.sonraki, simdi);
                return (
                  <tr key={x.proje + x.ad} data-bot-hal={x.hal} className="border-b border-kenar last:border-0">
                    <td className="px-4 py-2.5">
                      <span className="flex items-center gap-2">
                        <HalIsareti hal={x.hal} />
                        <span className={x.hal === 'dustu' || x.hal === 'gecikti' ? 'text-dikkat-metin' : 'text-metin-ikincil'}>{HAL_ADI[x.hal]}</span>
                      </span>
                    </td>
                    <td className="px-2 py-2.5">
                      <span className="enstruman text-metin">{x.proje}</span>
                      <span className="text-metin-ikincil"> · {x.ad}</span>
                    </td>
                    <td className="enstruman whitespace-nowrap px-2 py-2.5 text-metin-ikincil" title={x.son ?? undefined}>
                      {onceMetni(x.son, simdi)}
                      {sonraki && <span className="block text-xs text-metin-soluk">sıradaki {sonraki}</span>}
                    </td>
                    <td className="whitespace-nowrap px-2 py-2.5 text-metin-soluk">{siklikMetni(x.siklik_saat) ?? (x.tur === 'engel' ? 'engel dosyası' : 'sürekli')}</td>
                    <td className="max-w-[28rem] px-4 py-2.5">
                      <span className="block truncate text-metin" title={x.ayrinti}>
                        {x.ayrinti || (x.sayac ? x.sayac.ad + ': ' + x.sayac.deger : '')}
                      </span>
                      <span className="enstruman flex items-center gap-1 text-xs text-metin-soluk">
                        <span className="truncate">{x.kaynak}</span>
                        {x.url && (
                          <a
                            href={x.url}
                            target="_blank"
                            rel="noreferrer"
                            aria-label={x.proje + ' son koşusunu GitHub’da aç'}
                            className="shrink-0 text-metin-soluk hover:text-metin"
                          >
                            <ExternalLink className="size-3" aria-hidden="true" />
                          </a>
                        )}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
