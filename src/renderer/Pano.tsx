import { FolderOpen, Play, TerminalSquare } from 'lucide-react';
import type { Durum, Oturum, Proje } from './types';
import { AsamaRozeti, GitDurumu, Ilerleme, Olcum, gunMetni, sureMetni } from './parcalar';

interface Props {
  durum: Durum;
  oturumlar: Oturum[];
  simdi: number;
  onBaslat: (p: Proje) => void;
  onOturumaGit: (id: string) => void;
}

export default function Pano({ durum, oturumlar, simdi, onBaslat, onOturumaGit }: Props) {
  const projeler = durum.projeler;
  const kirliToplam = projeler.reduce((t, p) => t + (p.git?.kirli ?? 0), 0);
  const acikOturum = oturumlar.filter((o) => o.durumu === 'acik');
  const aktifProjeler = projeler.filter((p) => p.asama && p.asama !== 'tamamlandi');
  const logGun = durum.beyin.son_log_gun;

  const oturumBul = (p: Proje) => oturumlar.find((o) => o.yol === p.yol && o.durumu === 'acik');

  return (
    <div className="space-y-6">
      {/* Olcum seridi: dort sayi, hepsi bir bakista. */}
      <section aria-label="Ölçümler" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Olcum
          etiket="Aktif proje"
          deger={aktifProjeler.length}
          alt={projeler.length + ' proje izleniyor'}
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
          <tbody>
            {projeler.map((p) => {
              const oturum = oturumBul(p);
              const dikkat = oturumlar.some((o) => o.yol === p.yol && o.dikkat);
              const sirada = p.roadmap?.sirada;
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
                  </th>
                  <td className="px-3 py-3">
                    <AsamaRozeti asama={p.asama} />
                  </td>
                  <td className="px-3 py-3">
                    <Ilerleme p={p} />
                  </td>
                  <td className="hidden max-w-[26ch] px-3 py-3 xl:table-cell">
                    {sirada ? (
                      <span className="block truncate text-xs text-metin-ikincil">
                        <span className="enstruman text-metin">Faz {sirada.no}</span> {sirada.ad}
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
                          className="inline-flex cursor-pointer items-center gap-1.5 rounded-kontrol border border-kenar px-2.5 py-1.5 text-xs text-metin-ikincil transition-colors duration-[180ms] hover:border-kenar-guclu hover:text-metin"
                        >
                          <Play className="size-3.5" aria-hidden="true" />
                          Aç
                        </button>
                      )}
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
