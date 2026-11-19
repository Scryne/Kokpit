import { useCallback, useEffect, useId, useState, type FormEvent } from 'react';
import { Check, KeyRound, RefreshCw, Trash2, TriangleAlert } from 'lucide-react';
import type { UstaGorunum, UstaIsler, UstaSonuc } from './types';

// v4.1 Usta: Opus'un kod islerini devrettigi OpenCode Go iscisi (scripts/usta.py). Bu bolum yalniz anahtari,
// modeli ve isci gunlugunu yonetir; terminal sekmelerine dokunmaz (ana oturumlar Claude'da kalir).
// Anahtar buradan main'e tek yonlu gider: kaydedince alan bosaltilir, geri yalniz son dort karakter gelir.

const DUGME =
  'flex cursor-pointer items-center gap-1.5 rounded-kontrol border border-kenar px-2.5 py-1 text-xs text-metin-ikincil transition-colors duration-[120ms] hover:border-kenar-guclu hover:text-metin disabled:cursor-not-allowed disabled:opacity-50';
const GIRDI =
  'enstruman w-full min-w-0 rounded-kontrol border border-kenar bg-terminal px-2.5 py-1.5 text-xs text-metin outline-none placeholder:text-metin-soluk focus-visible:border-aksan';

const KARAR: Record<string, string> = { kabul: 'kabul', 'duzeltip-kabul': 'düzeltip kabul', ret: 'ret' };

function zaman(iso: string | null | undefined) {
  if (!iso) return '';
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return '';
  return t.toLocaleString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function sure(sn: number) {
  if (sn < 60) return sn + ' sn';
  const dk = Math.round(sn / 60);
  return dk < 60 ? dk + ' dk' : Math.floor(dk / 60) + ' sa ' + (dk % 60) + ' dk';
}

function Dogrulama({ g }: { g: UstaGorunum }) {
  if (!g.dogrulama) return null;
  const { durum, zaman: z } = g.dogrulama;
  if (durum === 'gecerli') {
    return (
      <span className="flex items-center gap-1 text-metin-ikincil">
        <Check className="size-3.5" aria-hidden="true" />
        Doğrulandı · {zaman(z)}
      </span>
    );
  }
  return (
    <span className={'flex items-center gap-1 ' + (durum === 'gecersiz' ? 'text-hata-metin' : 'text-dikkat-metin')}>
      <TriangleAlert className="size-3.5" aria-hidden="true" />
      {durum === 'gecersiz' ? 'OpenCode anahtarı reddetti' : 'Doğrulanamadı: OpenCode’a ulaşılamadı'} · {zaman(z)}
    </span>
  );
}

function ModelSecici({
  etiket,
  aciklama,
  deger,
  modeller,
  mesgul,
  onSec,
}: {
  etiket: string;
  aciklama: string;
  deger: string;
  modeller: { id: string; ad: string }[];
  mesgul: boolean;
  onSec: (id: string) => void;
}) {
  const kimlik = useId();
  // Liste henuz cekilmediyse ya da secili model listede yoksa secim yine gorunur kalsin.
  const secenekler = modeller.some((m) => m.id === deger) ? modeller : [{ id: deger, ad: deger }, ...modeller];
  return (
    <div className="min-w-0">
      <label htmlFor={kimlik} className="block text-xs text-metin">
        {etiket}
      </label>
      <p id={kimlik + '-a'} className="mb-1 text-xs text-metin-soluk">
        {aciklama}
      </p>
      <select
        id={kimlik}
        value={deger}
        disabled={mesgul}
        aria-describedby={kimlik + '-a'}
        onChange={(e) => onSec(e.target.value)}
        className="enstruman w-full min-w-0 cursor-pointer rounded-kontrol border border-kenar bg-yuzey px-2 py-1.5 text-xs text-metin outline-none focus-visible:border-aksan disabled:cursor-not-allowed disabled:opacity-50"
      >
        {secenekler.map((m) => (
          <option key={m.id} value={m.id}>
            {m.ad === m.id ? m.id : `${m.ad} (${m.id})`}
          </option>
        ))}
      </select>
    </div>
  );
}

function Gunluk({ veri, onYenile }: { veri: UstaIsler | null; onYenile: () => void }) {
  return (
    <section aria-label="Usta günlüğü" className="min-w-0">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <h3 className="etiket">Günlük</h3>
        <button type="button" onClick={onYenile} className={DUGME} title="Günlüğü yeniden oku">
          <RefreshCw className="size-3.5" aria-hidden="true" />
          Yenile
        </button>
      </div>
      {veri && veri.ozet.length > 0 && (
        <ul className="mb-2 flex flex-wrap gap-1.5" aria-label="Model bazında sonuçlar">
          {veri.ozet.map((o) => {
            const karar = o.kabul + o.duzeltip + o.ret;
            return (
              <li key={o.model} className="enstruman rounded-kontrol border border-kenar px-2 py-1 text-xs text-metin-ikincil">
                <span className="text-metin">{o.model}</span> · {o.is} iş
                {karar > 0 && (
                  <>
                    {' '}· kabul {o.kabul}
                    {o.duzeltip > 0 && <>, düzeltip {o.duzeltip}</>}
                    {o.ret > 0 && <>, ret {o.ret}</>}
                  </>
                )}
                {o.is > 0 && <> · ort. {(o.tur / o.is).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} tur</>}
              </li>
            );
          })}
        </ul>
      )}
      {!veri || veri.isler.length === 0 ? (
        <p className="text-xs text-metin-soluk">
          Henüz iş yok. Opus bir işi ustaya devrettiğinde burada görünür: model, tur sayısı, kabul testleri ve karar.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[34rem] text-left text-xs">
            <thead className="text-metin-soluk">
              <tr className="border-b border-kenar">
                <th scope="col" className="py-1 pr-3 font-normal">İş</th>
                <th scope="col" className="py-1 pr-3 font-normal">Model</th>
                <th scope="col" className="py-1 pr-3 font-normal">Tur</th>
                <th scope="col" className="py-1 pr-3 font-normal">Testler</th>
                <th scope="col" className="py-1 pr-3 font-normal">Değişiklik</th>
                <th scope="col" className="py-1 font-normal">Karar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-kenar">
              {veri.isler.map((i) => (
                <tr key={i.id} className="align-top">
                  <td className="w-full max-w-0 py-1.5 pr-3">
                    <span className="block truncate text-metin" title={i.baslik}>
                      {i.baslik || i.id}
                    </span>
                    <span className="text-metin-soluk">
                      {i.proje} · {zaman(i.baslangic)}
                    </span>
                  </td>
                  <td className="enstruman whitespace-nowrap py-1.5 pr-3 text-metin-ikincil">{i.model}</td>
                  <td className="whitespace-nowrap py-1.5 pr-3 text-metin-ikincil">
                    {i.tur} · {sure(i.sureSn)}
                  </td>
                  <td className={'whitespace-nowrap py-1.5 pr-3 ' + (i.kabulGecti === false ? 'text-hata-metin' : 'text-metin-ikincil')}>
                    {i.calisiyor ? 'çalışıyor…' : i.kabulGecti === null ? '—' : i.kabulGecti ? 'geçti' : 'kaldı'}
                  </td>
                  <td className="enstruman whitespace-nowrap py-1.5 pr-3 text-metin-ikincil">
                    {i.degisiklik ? (
                      <>
                        {i.degisiklik.dosya} dosya
                        <span className="block">
                          +{i.degisiklik.ekleme} −{i.degisiklik.silme}
                        </span>
                      </>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="whitespace-nowrap py-1.5 text-metin-ikincil">{i.karar ? KARAR[i.karar] : 'bekliyor'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default function UstaAyari() {
  const [g, setG] = useState<UstaGorunum | null>(null);
  const [isler, setIsler] = useState<UstaIsler | null>(null);
  const [anahtar, setAnahtar] = useState('');
  const [degistir, setDegistir] = useState(false);
  const [mesgul, setMesgul] = useState<string | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const [bilgi, setBilgi] = useState<string | null>(null);
  const [url, setUrl] = useState('');
  const kimlik = useId();

  const isleriOku = useCallback(() => void window.kokpit.ustaIsler().then(setIsler).catch(() => setIsler(null)), []);

  useEffect(() => {
    void window.kokpit.ustaGetir().then((v) => {
      setG(v);
      setUrl(v.baseUrl);
      // Ilk acilista model listesi yoksa kendiliginden cek (uc anahtarsiz listeler, token harcamaz).
      if (v.modeller.length === 0) void window.kokpit.ustaModeller().then((s) => s.ok && setG(s.gorunum));
    });
    isleriOku();
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') isleriOku();
    }, 15000);
    return () => clearInterval(t);
  }, [isleriOku]);

  async function calistir(ad: string, is: () => Promise<UstaSonuc>, basari?: string) {
    setMesgul(ad);
    setHata(null);
    setBilgi(null);
    try {
      const s = await is();
      setG(s.gorunum);
      setUrl(s.gorunum.baseUrl);
      if (s.ok) {
        if (basari) setBilgi(basari);
      } else setHata(s.hata || 'İşlem tamamlanamadı.');
      return s.ok;
    } catch {
      setHata('Kokpit ana süreci cevap vermedi.');
      return false;
    } finally {
      setMesgul(null);
    }
  }

  async function kaydet(e: FormEvent) {
    e.preventDefault();
    const deger = anahtar.trim();
    if (!deger) return;
    const ok = await calistir('anahtar', () => window.kokpit.ustaAnahtarKaydet(deger), 'Anahtar kaydedildi.');
    if (ok) {
      setAnahtar('');
      setDegistir(false);
    }
  }

  const anahtarFormu = !g?.anahtarVar || degistir;

  return (
    <section aria-labelledby={kimlik + '-baslik'} className="halka relative rounded-base bg-yuzey p-4 xl:col-span-2">
      <div className="mb-3">
        <h2 id={kimlik + '-baslik'} className="flex items-center gap-2 text-sm font-medium text-metin">
          <KeyRound className="size-4 text-metin-soluk" aria-hidden="true" />
          Usta · OpenCode Go
        </h2>
        <p className="mt-0.5 max-w-prose text-xs text-metin-ikincil">
          Opus kodlama işini brifleyip ustaya devreder, usta ayrı bir worktree’de yazar, Opus inceleyip alır. Ana oturumlar
          Claude’da kalır; burada yalnız ustanın anahtarı ve modeli var.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-4">
          <section aria-label="API anahtarı">
            <h3 className="etiket mb-1.5">Anahtar</h3>
            {g && g.anahtarVar && !degistir && (
              <div className="space-y-2 text-xs">
                <p className="enstruman text-metin">
                  Kayıtlı ••••{g.ipucu}
                  <span className="ml-2 font-sans text-metin-soluk">{zaman(g.kaydedildi)}</span>
                </p>
                <Dogrulama g={g} />
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    disabled={mesgul !== null}
                    onClick={() => void calistir('sina', () => window.kokpit.ustaAnahtarSina(), 'Anahtar geçerli.')}
                    className={DUGME}
                  >
                    <RefreshCw className={'size-3.5' + (mesgul === 'sina' ? ' motion-safe:animate-spin' : '')} aria-hidden="true" />
                    Yeniden doğrula
                  </button>
                  <button type="button" disabled={mesgul !== null} onClick={() => setDegistir(true)} className={DUGME}>
                    Değiştir
                  </button>
                  <button
                    type="button"
                    disabled={mesgul !== null}
                    onClick={() => void calistir('sil', () => window.kokpit.ustaAnahtarSil(), 'Anahtar silindi.')}
                    className={DUGME + ' hover:text-hata-metin'}
                  >
                    <Trash2 className="size-3.5" aria-hidden="true" />
                    Anahtarı sil
                  </button>
                </div>
              </div>
            )}
            {g && anahtarFormu && (
              <form onSubmit={(e) => void kaydet(e)} className="space-y-1.5">
                <label htmlFor={kimlik + '-anahtar'} className="sr-only">
                  OpenCode Go API anahtarı
                </label>
                <div className="flex gap-1.5">
                  <input
                    id={kimlik + '-anahtar'}
                    type="password"
                    autoComplete="off"
                    spellCheck={false}
                    value={anahtar}
                    maxLength={500}
                    onChange={(e) => setAnahtar(e.target.value)}
                    placeholder="OpenCode Go anahtarı"
                    aria-describedby={kimlik + '-anahtar-a'}
                    aria-invalid={hata && mesgul === null && anahtar ? true : undefined}
                    className={GIRDI}
                  />
                  <button
                    type="submit"
                    disabled={!anahtar.trim() || mesgul !== null}
                    className="shrink-0 cursor-pointer rounded-kontrol bg-birincil px-3 py-1.5 text-xs font-medium text-birincil-uzeri transition-colors duration-[120ms] hover:bg-metin-ikincil disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {mesgul === 'anahtar' ? 'Doğrulanıyor…' : 'Kaydet'}
                  </button>
                </div>
                <p id={kimlik + '-anahtar-a'} className="text-xs text-metin-soluk">
                  Kaydetmeden önce OpenCode’a sorulur (token harcamaz). Windows hesabına bağlı şifreyle saklanır; ekrana bir
                  daha gelmez.
                </p>
                {degistir && (
                  <button
                    type="button"
                    onClick={() => {
                      setDegistir(false);
                      setAnahtar('');
                      setHata(null);
                    }}
                    className="cursor-pointer text-xs text-metin-ikincil underline-offset-2 hover:text-metin hover:underline"
                  >
                    Vazgeç
                  </button>
                )}
              </form>
            )}
          </section>

          <section aria-label="Modeller" className="space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <h3 className="etiket">Model</h3>
              <button
                type="button"
                disabled={mesgul !== null || !g}
                onClick={() => void calistir('liste', () => window.kokpit.ustaModeller(), 'Model listesi güncellendi.')}
                className={DUGME}
                title={g?.modellerZamani ? 'Son: ' + zaman(g.modellerZamani) : undefined}
              >
                <RefreshCw className={'size-3.5' + (mesgul === 'liste' ? ' motion-safe:animate-spin' : '')} aria-hidden="true" />
                Listeyi yenile
              </button>
            </div>
            {g && (
              <>
                <ModelSecici
                  etiket="Kod yazan model"
                  aciklama="Opus başka model belirtmezse usta bununla çalışır."
                  deger={g.model}
                  modeller={g.modeller}
                  mesgul={mesgul !== null}
                  onSec={(id) => void calistir('model', () => window.kokpit.ustaAyar({ model: id }))}
                />
                <ModelSecici
                  etiket="Hafif model"
                  aciklama="Claude Code’un arka plan çağrıları (başlık, özet) için."
                  deger={g.hafifModel}
                  modeller={g.modeller}
                  mesgul={mesgul !== null}
                  onSec={(id) => void calistir('model', () => window.kokpit.ustaAyar({ hafifModel: id }))}
                />
              </>
            )}
          </section>

          {g && (
            <details className="text-xs">
              <summary className="cursor-pointer text-metin-ikincil hover:text-metin">
                Uç adresi {g.varsayilanUrl ? '(varsayılan)' : '(değiştirildi)'}
              </summary>
              <form
                className="mt-1.5 flex gap-1.5"
                onSubmit={(e) => {
                  e.preventDefault();
                  void calistir('url', () => window.kokpit.ustaAyar({ baseUrl: url.trim() }), 'Uç adresi kaydedildi.');
                }}
              >
                <label htmlFor={kimlik + '-url'} className="sr-only">
                  Anthropic biçimli uç adresi
                </label>
                <input
                  id={kimlik + '-url'}
                  type="url"
                  value={url}
                  maxLength={500}
                  spellCheck={false}
                  onChange={(e) => setUrl(e.target.value)}
                  className={GIRDI}
                />
                <button type="submit" disabled={mesgul !== null || url.trim() === g.baseUrl} className={DUGME + ' shrink-0'}>
                  Kaydet
                </button>
                {!g.varsayilanUrl && (
                  <button
                    type="button"
                    disabled={mesgul !== null}
                    onClick={() => void calistir('url', () => window.kokpit.ustaAyar({ baseUrl: '' }), 'Varsayılan uca dönüldü.')}
                    className={DUGME + ' shrink-0'}
                  >
                    Varsayılan
                  </button>
                )}
              </form>
            </details>
          )}

          <div aria-live="polite" className="min-h-4 text-xs">
            {hata && (
              <p role="alert" className="text-hata-metin">
                {hata}
              </p>
            )}
            {!hata && bilgi && <p className="text-metin-ikincil">{bilgi}</p>}
          </div>
        </div>

        <Gunluk veri={isler} onYenile={isleriOku} />
      </div>
    </section>
  );
}
