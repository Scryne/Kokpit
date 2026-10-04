import { AlertTriangle, ArrowRight, ChevronRight, FolderOpen, Play, TerminalSquare } from 'lucide-react';
import type { Durum, Oturum, Proje, SonOturum } from './types';
import {
  AsamaRozeti,
  BeyinKaydiRozeti,
  GRUP_BASLIK,
  GitDurumu,
  Ilerleme,
  Olcum,
  duzMetin,
  envanterMetni,
  gunMetni,
  projeGruplari,
  sureMetni,
  takvimGunFarki,
} from './parcalar';

interface Props {
  durum: Durum;
  oturumlar: Oturum[];
  /** Kokpit'in defterinden: yol -> son kapanan oturum. */
  sonOturumlar: Record<string, SonOturum>;
  simdi: number;
  arsivAcik: boolean;
  onArsivDegistir: () => void;
  onSaglik: () => void;
  onBaslat: (p: Proje) => void;
  /** Calistir: projenin uygulamasini servis bolmesinde acar (komut yoksa sorar). */
  onCalistir: (p: Proje) => void;
  /** Son konusmayi surdur (claude --resume <kimlik>). */
  onSurdur: (p: Proje, claudeId: string) => void;
  onOturumaGit: (id: string) => void;
}

export default function Pano({
  durum,
  oturumlar,
  sonOturumlar,
  simdi,
  arsivAcik,
  onArsivDegistir,
  onSaglik,
  onBaslat,
  onCalistir,
  onSurdur,
  onOturumaGit,
}: Props) {
  // Kenar cubuguyla ayni gruplar ve sira: aktif, kullanimda, arsiv.
  const gruplar = projeGruplari(durum.projeler);
  const projeler = durum.projeler;
  const kirliToplam = projeler.reduce((t, p) => t + (p.git?.kirli ?? 0), 0);
  // Servis bolmeleri (Calistir) claude oturumu sayilmaz; ayri gosterilir.
  const acikOturum = oturumlar.filter((o) => o.durumu === 'acik' && !o.servis);
  const sayi = (g: string) => gruplar.find((x) => x.grup === g)?.projeler.length ?? 0;
  const logGun = durum.beyin.son_log_gun;
  const alarmlar = durum.saglik?.alarmlar ?? [];

  const oturumBul = (p: Proje) => oturumlar.find((o) => o.yol === p.yol && o.durumu === 'acik' && !o.servis);
  const servisBul = (p: Proje) => oturumlar.find((o) => o.yol === p.yol && o.durumu === 'acik' && o.servis);

  return (
    <div className="space-y-6">
      {/* Saglik nobeti alarmi: yalniz varken, tek serit. Ayrinti Saglik sayfasinda. */}
      {alarmlar.length > 0 && (
        <section
          aria-label="Sağlık nöbeti alarmları"
          className="halka relative flex flex-wrap items-center gap-x-4 gap-y-2 rounded-base border border-dikkat/30 bg-dikkat/10 px-4 py-3"
        >
          <AlertTriangle className="size-4 shrink-0 text-dikkat-metin" aria-hidden="true" />
          <ul className="min-w-0 flex-1 space-y-0.5 text-sm text-metin">
            {alarmlar.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
          <button
            type="button"
            onClick={onSaglik}
            className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-kontrol border border-kenar px-3 py-1.5 text-xs text-metin-ikincil transition-colors duration-[180ms] hover:border-kenar-guclu hover:text-metin"
          >
            Sağlık nöbeti
            <ArrowRight className="size-3.5" aria-hidden="true" />
          </button>
        </section>
      )}

      {/* Olcum seridi: dort sayi, hepsi bir bakista. */}
      <section aria-label="Ölçümler" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Olcum
          etiket="Aktif proje"
          deger={sayi('aktif')}
          alt={sayi('kullanimda') + ' kullanımda · ' + sayi('arsiv') + ' arşivde'}
        />
        <Olcum
          etiket="Kirli dosya"
          deger={kirliToplam}
          alt={kirliToplam > 0 ? 'commit bekliyor' : 'tüm repolar temiz'}
          vurgu={kirliToplam > 0}
        />
        <Olcum
          etiket="Açık oturum"
          deger={acikOturum.length}
          alt={
            acikOturum.length > 0
              ? acikOturum
                  .map((o) => o.ad + ' ' + sureMetni(Math.floor((simdi - o.baslangic) / 1000)))
                  .join(' · ')
              : 'oturum yok'
          }
        />
        <Olcum
          etiket="Beyin logu"
          deger={gunMetni(logGun) ?? '—'}
          alt={durum.beyin.son_log ?? null}
          vurgu={(logGun ?? 0) > 2}
        />
      </section>

      {/* Proje tablosu: kart degil satir. Yogun, taranabilir, tek hizada. */}
      <section className="halka relative overflow-hidden rounded-base bg-yuzey">
        <table className="w-full text-left">
          <caption className="sr-only">Projelerin aşama, ilerleme ve git durumu</caption>
          <thead>
            <tr className="border-b border-kenar">
              <th scope="col" className="etiket px-4 py-2.5 font-normal">
                Proje
              </th>
              <th scope="col" className="etiket px-3 py-2.5 font-normal">
                Aşama
              </th>
              <th scope="col" className="etiket px-3 py-2.5 font-normal">
                Roadmap
              </th>
              <th scope="col" className="etiket hidden px-3 py-2.5 font-normal xl:table-cell">
                Sırada
              </th>
              <th scope="col" className="etiket px-3 py-2.5 font-normal">
                Git
              </th>
              <th scope="col" className="etiket px-4 py-2.5 text-right font-normal">
                Oturum
              </th>
            </tr>
          </thead>
          {gruplar.map(({ grup, projeler: liste }) => (
          <tbody key={grup} className="border-t border-kenar first-of-type:border-t-0">
            <tr className="border-b border-kenar">
              <th scope="rowgroup" colSpan={6} className="px-4 py-1.5 text-left font-normal">
                {grup === 'arsiv' ? (
                  <button
                    type="button"
                    onClick={onArsivDegistir}
                    aria-expanded={arsivAcik}
                    className="etiket inline-flex cursor-pointer items-center gap-1.5 transition-colors duration-[180ms] hover:text-metin-ikincil"
                  >
                    <ChevronRight
                      className={'size-3 shrink-0 ' + (arsivAcik ? 'rotate-90' : '')}
                      aria-hidden="true"
                    />
                    {GRUP_BASLIK[grup]} <span className="enstruman">{liste.length}</span>
                    <span className="font-arayuz normal-case tracking-normal">
                      {arsivAcik ? '' : '· olduğu gibi, dondurulan, bırakılan'}
                    </span>
                  </button>
                ) : (
                  <span className="etiket">
                    {GRUP_BASLIK[grup]} <span className="enstruman">{liste.length}</span>
                  </span>
                )}
              </th>
            </tr>
            {(grup !== 'arsiv' || arsivAcik) && liste.map((p) => {
              const oturum = oturumBul(p);
              const dikkat = oturumlar.some((o) => o.yol === p.yol && o.dikkat);
              const sirada = p.roadmap?.sirada;
              const son = sonOturumlar[p.yol];
              const sonGun = son ? takvimGunFarki(son.bitis, simdi) : null;
              return (
                <tr key={p.ad} className="border-b border-kenar last:border-b-0 hover:bg-yuzey-guclu">
                  <th scope="row" className="px-4 py-3 font-normal">
                    <span className="flex items-center gap-2">
                      <span
                        className={
                          'size-1.5 shrink-0 rounded-full ' +
                          (dikkat
                            ? 'bg-dikkat ring-2 ring-dikkat/30'
                            : oturum
                              ? 'bg-aksan'
                              : 'bg-transparent')
                        }
                        aria-hidden="true"
                      />
                      {dikkat && <span className="sr-only">dikkat bekliyor</span>}
                      <span className="enstruman text-sm font-medium text-metin">{p.ad}</span>
                    </span>
                    {son && !oturum && (
                      <span className="mt-0.5 block pl-3.5 text-xs text-metin-soluk">
                        son oturum{' '}
                        <span className="enstruman">
                          {gunMetni(sonGun)} · {sureMetni(son.sureSn)}
                          {son.ozet && son.ozet.dosya > 0 && (
                            <>
                              {' · '}
                              {son.ozet.dosya} dosya +{son.ozet.arti} −{son.ozet.eksi}
                            </>
                          )}
                        </span>{' '}
                        · <BeyinKaydiRozeti kaydi={son.beyin} />
                        {son.surdurulebilir && son.claude && (
                          <>
                            {' · '}
                            <button
                              type="button"
                              onClick={() => onSurdur(p, son.claude!)}
                              title="Son konuşmaya kaldığı yerden dön (claude --resume)"
                              aria-label={p.ad + ' son konuşmasını sürdür'}
                              className="cursor-pointer text-metin-ikincil underline decoration-kenar-guclu underline-offset-2 transition-colors duration-[180ms] hover:text-metin hover:decoration-metin-soluk"
                            >
                              Sürdür
                            </button>
                          </>
                        )}
                      </span>
                    )}
                  </th>
                  <td className="px-3 py-3">
                    <AsamaRozeti
                      asama={p.asama}
                      yedek={p.envanter ? envanterMetni(p.envanter).split(/\s[—(-]/)[0] : undefined}
                    />
                  </td>
                  <td className="px-3 py-3">
                    <Ilerleme p={p} />
                  </td>
                  <td className="hidden max-w-[26ch] px-3 py-3 xl:table-cell">
                    {sirada ? (
                      <span
                        className="block truncate text-xs text-metin-ikincil"
                        title={'Faz ' + sirada.no + ' ' + duzMetin(sirada.ad)}
                      >
                        <span className="enstruman text-metin">Faz {sirada.no}</span>{' '}
                        {duzMetin(sirada.ad)}
                      </span>
                    ) : (
                      <span className="text-xs text-metin-soluk">—</span>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <GitDurumu p={p} />
                  </td>
                  <td className="px-4 py-3">
                    <span className="flex items-center justify-end gap-2">
                      {oturum ? (
                        <button
                          type="button"
                          onClick={() => onOturumaGit(oturum.id)}
                          className="inline-flex cursor-pointer items-center gap-1.5 rounded-kontrol border border-kenar-guclu px-2.5 py-1.5 text-xs text-metin transition-colors duration-[180ms] hover:bg-yuzey-guclu"
                        >
                          <TerminalSquare className="size-3.5" aria-hidden="true" />
                          <span className="enstruman">
                            {sureMetni(Math.floor((simdi - oturum.baslangic) / 1000))}
                          </span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onBaslat(p)}
                          title={p.ad + ' klasöründe claude oturumu aç'}
                          className="inline-flex cursor-pointer items-center gap-1.5 rounded-kontrol border border-kenar px-2.5 py-1.5 text-xs text-metin-ikincil transition-colors duration-[180ms] hover:border-kenar-guclu hover:text-metin"
                        >
                          <TerminalSquare className="size-3.5" aria-hidden="true" />
                          Aç
                        </button>
                      )}
                      {(() => {
                        // Calistir: uygulamanin kendisi (dev sunucusu). Calisiyorsa adresi gorunur.
                        const s = servisBul(p);
                        return (
                          <button
                            type="button"
                            onClick={() => (s ? onOturumaGit(s.id) : onCalistir(p))}
                            aria-label={s ? p.ad + ' çalışıyor, bölmesine git' : p.ad + ' uygulamasını çalıştır'}
                            title={s ? (s.servis?.adres ?? 'çalışıyor') + ' · bölmeye git' : 'Uygulamayı çalıştır'}
                            className={
                              'inline-flex cursor-pointer items-center gap-1.5 rounded-kontrol border p-1.5 text-xs transition-colors duration-[180ms] ' +
                              (s
                                ? 'border-kenar-guclu text-metin hover:bg-yuzey-guclu'
                                : 'border-kenar text-metin-soluk hover:border-kenar-guclu hover:text-metin')
                            }
                          >
                            <Play className="size-3.5" aria-hidden="true" />
                            {s?.servis?.adres && (
                              <span className="enstruman pr-0.5">{s.servis.adres.replace(/^https?:\/\/(localhost|127\.0\.0\.1)/, '').replace(/\/$/, '')}</span>
                            )}
                          </button>
                        );
                      })()}
                      <button
                        type="button"
                        onClick={() => window.kokpit.klasorAc(p.yol)}
                        aria-label={p.ad + ' klasörünü aç'}
                        className="cursor-pointer rounded-kontrol border border-kenar p-1.5 text-metin-soluk transition-colors duration-[180ms] hover:border-kenar-guclu hover:text-metin"
                      >
                        <FolderOpen className="size-3.5" aria-hidden="true" />
                      </button>
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
          ))}
        </table>
      </section>

      {/* Beyin: olcum seridiyle ayni dil, ama ayri bir blok. */}
      <section className="halka relative rounded-base bg-yuzey px-5 py-4">
        <h2 className="etiket">Beyin</h2>
        <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
          <div>
            <dt className="text-xs text-metin-soluk">Derleyici</dt>
            <dd className="text-sm text-metin-ikincil">{durum.beyin.derleyici_son_durum ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-xs text-metin-soluk">İşlenmemiş log</dt>
            <dd className="enstruman text-sm text-metin-ikincil">
              {durum.beyin.islenmemis_loglar?.length ?? 0}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-metin-soluk">Bilgi tabanı</dt>
            <dd className="enstruman text-sm text-metin-ikincil">
              {durum.beyin.makale}
              <span className="font-arayuz text-metin-soluk"> makale · </span>
              {durum.beyin.baglanti}
              <span className="font-arayuz text-metin-soluk"> bağlantı</span>
            </dd>
          </div>
          <div>
            <dt className="text-xs text-metin-soluk">Açık thread</dt>
            <dd className="enstruman text-sm text-metin-ikincil">
              {durum.beyin.threads?.length ?? 0}
            </dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
