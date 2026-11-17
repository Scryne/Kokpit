import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Server } from 'lucide-react';
import type { Efor, SaglayiciGorunum, SaglayiciKimligi, SaglayiciYama } from './types';

type Anahtarli = 'anthropic' | 'deepseek' | 'ozel';

interface Props {
  acik: boolean;
  gorunum: SaglayiciGorunum | null;
  onKapat: () => void;
  onKaydedildi: (gorunum: SaglayiciGorunum) => void;
}

const SAGLAYICILAR: { id: SaglayiciKimligi; ad: string; aciklama: string }[] = [
  {
    id: 'varsayilan',
    ad: 'Varsayılan (ortamdan miras)',
    aciklama: 'Bugünkü davranış: ortam değişkenleri olduğu gibi kalır.',
  },
  {
    id: 'anthropic',
    ad: 'Anthropic',
    aciklama: 'Claude hesabı/anahtarı; DeepSeek yönlendirmesi kaldırılır.',
  },
  { id: 'deepseek', ad: 'DeepSeek', aciklama: 'Anthropic-uyumlu endpoint.' },
  { id: 'ozel', ad: 'Özel API', aciklama: 'Başka bir Anthropic-uyumlu servis ya da gateway.' },
];

const EFORLAR: { deger: Efor; ad: string }[] = [
  { deger: 'varsayilan', ad: 'Varsayılan' },
  { deger: 'low', ad: 'Düşük (low)' },
  { deger: 'medium', ad: 'Orta (medium)' },
  { deger: 'high', ad: 'Yüksek (high)' },
  { deger: 'xhigh', ad: 'Çok yüksek (xhigh)' },
  { deger: 'max', ad: 'En yüksek (max)' },
];

const KUTU =
  'rounded-kontrol border border-kenar bg-terminal px-3 py-2 text-sm text-metin outline-none placeholder:text-metin-soluk focus-visible:border-aksan';
const IPUCU = 'mt-1 text-xs text-metin-soluk';
const DUGME =
  'cursor-pointer rounded-kontrol border border-kenar px-3 py-1.5 text-xs text-metin-ikincil transition-colors duration-[180ms] hover:border-kenar-guclu hover:text-metin';

function Alan({
  id,
  etiket,
  deger,
  onDegis,
  ipucu,
  ipucuId,
  placeholder,
  tip = 'text',
  min,
  max,
  zorunlu = false,
}: {
  id: string;
  etiket: string;
  deger: string;
  onDegis: (deger: string) => void;
  ipucu: string;
  ipucuId: string;
  placeholder?: string;
  tip?: string;
  min?: number;
  max?: number;
  zorunlu?: boolean;
}) {
  return (
    <div>
      <label htmlFor={id} className="text-xs text-metin-ikincil">
        {etiket}
      </label>
      <input
        id={id}
        type={tip}
        value={deger}
        onChange={(e) => onDegis(e.target.value)}
        placeholder={placeholder}
        aria-describedby={ipucuId}
        aria-required={zorunlu || undefined}
        required={zorunlu}
        min={min}
        max={max}
        spellCheck={false}
        className={'mt-1 w-full ' + KUTU}
      />
      <p id={ipucuId} className={IPUCU}>
        {ipucu}
      </p>
    </div>
  );
}

/**
 * Model sağlayıcısı (v3.0). Yerel <dialog>: odak tuzağı ve Escape tarayıcıdan gelir
 * (not kutusuyla aynı desen). Anahtar kutusu açılışta daima boştur; kayıtlı anahtar
 * yalnız "Kayıtlı" olarak görünür ve renderer'a hiç gelmez.
 *
 * KURAL: açma, yazma ve "Sil" yalnız yerel state'i değiştirir; IPC/disk yazımı YOKTUR.
 * Diske yalnız "Kaydet" yazar (window.kokpit.saglayiciKaydet). Vazgeç/Esc hiçbir şey yazmaz.
 */
export default function SaglayiciAyari({ acik, gorunum, onKapat, onKaydedildi }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [secili, setSecili] = useState<SaglayiciKimligi>('varsayilan');
  const [efor, setEfor] = useState<Efor>('varsayilan');
  const [anahtarlar, setAnahtarlar] = useState<Record<Anahtarli, string>>({
    anthropic: '',
    deepseek: '',
    ozel: '',
  });
  const [kayitli, setKayitli] = useState<Record<Anahtarli, boolean>>({
    anthropic: false,
    deepseek: false,
    ozel: false,
  });
  const [silindi, setSilindi] = useState<Record<Anahtarli, boolean>>({
    anthropic: false,
    deepseek: false,
    ozel: false,
  });
  const [dsBaseUrl, setDsBaseUrl] = useState('');
  const [ds, setDs] = useState({ model: '', hafifModel: '', altModel: '', baglam: '' });
  const [oz, setOz] = useState({ baseUrl: '', model: '', hafifModel: '', altModel: '', baglam: '' });
  const [hata, setHata] = useState<string | null>(null);
  const [kaydediliyor, setKaydediliyor] = useState(false);

  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (acik && !d.open) {
      const g = gorunum;
      setSecili(g?.secili ?? 'varsayilan');
      setEfor(g?.efor ?? 'varsayilan');
      setAnahtarlar({ anthropic: '', deepseek: '', ozel: '' });
      setSilindi({ anthropic: false, deepseek: false, ozel: false });
      setKayitli({
        anthropic: g?.anthropic.anahtarVar ?? false,
        deepseek: g?.deepseek.anahtarVar ?? false,
        ozel: g?.ozel.anahtarVar ?? false,
      });
      setDsBaseUrl(g?.deepseek.baseUrl ?? '');
      setDs({
        model: g?.deepseek.model ?? '',
        hafifModel: g?.deepseek.hafifModel ?? '',
        altModel: g?.deepseek.altModel ?? '',
        baglam: g && g.deepseek.baglam > 0 ? String(g.deepseek.baglam) : '',
      });
      setOz({
        baseUrl: g?.ozel.baseUrl ?? '',
        model: g?.ozel.model ?? '',
        hafifModel: g?.ozel.hafifModel ?? '',
        altModel: g?.ozel.altModel ?? '',
        baglam: g && g.ozel.baglam > 0 ? String(g.ozel.baglam) : '',
      });
      setHata(null);
      setKaydediliyor(false);
      d.showModal();
    } else if (!acik && d.open) {
      d.close();
    }
  }, [acik, gorunum]);

  const anahtarSil = (kimlik: Anahtarli) => {
    setAnahtarlar((a) => ({ ...a, [kimlik]: '' }));
    setSilindi((s) => ({ ...s, [kimlik]: true }));
    setKayitli((k) => ({ ...k, [kimlik]: false }));
  };

  const anahtarAlani = (kimlik: Anahtarli, ipucu: ReactNode) => {
    const durumId = 'saglayici-anahtar-durum-' + kimlik;
    const ipucuId = 'saglayici-anahtar-ipucu-' + kimlik;
    return (
      <div>
        <div className="flex items-baseline justify-between gap-2">
          <label htmlFor={'saglayici-anahtar-' + kimlik} className="text-xs text-metin-ikincil">
            Anahtar
          </label>
          <span
            id={durumId}
            data-anahtar-durum={kimlik}
            aria-live="polite"
            className="text-xs text-metin-soluk"
          >
            {kayitli[kimlik] ? 'Kayıtlı' : 'Yok'}
          </span>
        </div>
        <div className="mt-1 flex gap-2">
          <input
            id={'saglayici-anahtar-' + kimlik}
            type="password"
            value={anahtarlar[kimlik]}
            onChange={(e) => setAnahtarlar((a) => ({ ...a, [kimlik]: e.target.value }))}
            placeholder={kayitli[kimlik] ? 'Kayıtlı — değiştirmek için yaz' : 'API anahtarı'}
            autoComplete="off"
            spellCheck={false}
            aria-describedby={durumId + ' ' + ipucuId}
            className={'mt-0 min-w-0 flex-1 ' + KUTU}
          />
          {kayitli[kimlik] && (
            <button
              type="button"
              title="Kaydedince silinir"
              onClick={() => anahtarSil(kimlik)}
              className={DUGME + ' shrink-0'}
            >
              Sil
            </button>
          )}
        </div>
        <p id={ipucuId} className={IPUCU}>
          {ipucu}
        </p>
      </div>
    );
  };

  /** Bos = 0 (varsayilan); doluysa 100000..1000000 tam sayi. Gecersizse null. */
  const baglamSayisi = (deger: string): number | null => {
    const t = deger.trim();
    if (t === '') return 0;
    const n = Number(t);
    return Number.isInteger(n) && n >= 100000 && n <= 1000000 ? n : null;
  };

  const kaydet = async () => {
    if (kaydediliyor) return;
    setHata(null);

    // Sunucu da reddeder; burada IPC'ye hic gitmeden ayni metni gosteriyoruz.
    if (secili === 'ozel' && oz.baseUrl.trim() === '') {
      setHata('Özel API için Base URL gerekli.');
      return;
    }

    const anahtarYamasi = (kimlik: Anahtarli): { anahtar?: string; anahtarSil?: boolean } => {
      if (silindi[kimlik] && anahtarlar[kimlik] === '') return { anahtarSil: true };
      if (anahtarlar[kimlik] !== '') return { anahtar: anahtarlar[kimlik] };
      return {};
    };

    const yama: SaglayiciYama = { secili, efor };
    if (secili === 'anthropic') {
      yama.anthropic = anahtarYamasi('anthropic');
    } else if (secili === 'deepseek') {
      const baglam = baglamSayisi(ds.baglam);
      if (baglam === null) {
        setHata('Bağlam penceresi 100000 ile 1000000 arasında bir tam sayı olmalı.');
        return;
      }
      // Base URL DeepSeek preset'inden gelir ve burada duzenlenmez; yama gonderilmez.
      yama.deepseek = {
        ...anahtarYamasi('deepseek'),
        model: ds.model,
        hafifModel: ds.hafifModel,
        altModel: ds.altModel,
        baglam,
      };
    } else if (secili === 'ozel') {
      const baglam = baglamSayisi(oz.baglam);
      if (baglam === null) {
        setHata('Bağlam penceresi 100000 ile 1000000 arasında bir tam sayı olmalı.');
        return;
      }
      yama.ozel = {
        ...anahtarYamasi('ozel'),
        baseUrl: oz.baseUrl,
        model: oz.model,
        hafifModel: oz.hafifModel,
        altModel: oz.altModel,
        baglam,
      };
    }

    setKaydediliyor(true);
    const sonuc = await window.kokpit.saglayiciKaydet(yama);
    setKaydediliyor(false);
    if (!sonuc.ok) {
      setHata(sonuc.hata ?? 'Kaydedilemedi.');
      return;
    }
    onKaydedildi(sonuc.gorunum);
  };

  return (
    <dialog
      ref={dialogRef}
      onClose={onKapat}
      onCancel={(e) => {
        e.preventDefault();
        onKapat();
      }}
      aria-labelledby="saglayici-baslik"
      className="halka m-auto w-[min(36rem,calc(100vw-2rem))] rounded-base bg-bg-base p-0 text-metin shadow-2xl shadow-black/60 backdrop:bg-black/50"
    >
      <form
        method="dialog"
        onSubmit={(e) => {
          e.preventDefault();
          void kaydet();
        }}
        className="flex max-h-[min(80vh,44rem)] flex-col bg-yuzey-guclu"
      >
        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          <h2 id="saglayici-baslik" className="flex items-center gap-2 text-sm font-medium">
            <Server className="size-4 text-metin-soluk" aria-hidden="true" />
            Model sağlayıcısı
          </h2>
          <p className="mt-1.5 text-xs text-metin-ikincil">
            Yeni açılan oturumlara uygulanır; açık sekmeler eski bağlantıyla devam eder.
          </p>

          <fieldset className="mt-4">
            <legend className="etiket">Sağlayıcı</legend>
            <div className="mt-2 space-y-2">
              {SAGLAYICILAR.map((s) => (
                <label
                  key={s.id}
                  className={
                    'flex cursor-pointer items-start gap-2.5 rounded-kontrol border px-3 py-2 transition-colors duration-[180ms] ' +
                    (secili === s.id ? 'border-kenar-guclu bg-yuzey' : 'border-kenar hover:border-kenar-guclu')
                  }
                >
                  <input
                    type="radio"
                    name="saglayici-secim"
                    value={s.id}
                    checked={secili === s.id}
                    onChange={() => setSecili(s.id)}
                    className="mt-0.5 accent-aksan"
                  />
                  <span className="min-w-0">
                    <span className="block text-xs text-metin">{s.ad}</span>
                    <span className="block text-xs text-metin-soluk">{s.aciklama}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="mt-4">
            <label htmlFor="saglayici-efor" className="text-xs text-metin-ikincil">
              Efor
            </label>
            <select
              id="saglayici-efor"
              value={efor}
              onChange={(e) => setEfor(e.target.value as Efor)}
              aria-describedby="saglayici-efor-ipucu"
              className={'mt-1 w-full ' + KUTU}
            >
              {EFORLAR.map((e) => (
                <option key={e.deger} value={e.deger}>
                  {e.ad}
                </option>
              ))}
            </select>
            <p id="saglayici-efor-ipucu" className={IPUCU}>
              Model desteklemiyorsa Claude Code en yakın alt seviyeye düşer.
            </p>
          </div>

          <div className="mt-4 space-y-3 border-t border-kenar pt-4">
            {secili === 'varsayilan' && (
              <p className="text-xs text-metin-soluk">
                Ortam değişkenleri olduğu gibi kalır; yalnızca seçilen efor uygulanır.
              </p>
            )}

            {secili === 'anthropic' &&
              anahtarAlani(
                'anthropic',
                <>
                  Opsiyonel. Boşsa oturum açmış hesap ya da kendi{' '}
                  <span className="enstruman">ANTHROPIC_API_KEY</span> değerin kullanılır.
                </>
              )}

            {secili === 'deepseek' && (
              <>
                <div>
                  <p className="text-xs text-metin-ikincil">Base URL</p>
                  <p
                    className="enstruman mt-1 truncate rounded-kontrol border border-kenar bg-terminal px-3 py-2 text-xs text-metin-soluk"
                    title={dsBaseUrl}
                  >
                    {dsBaseUrl || 'Ayarlı değil'}
                  </p>
                </div>
                {anahtarAlani(
                  'deepseek',
                  <>
                    Boşsa ortamdan miras alınan{' '}
                    <span className="enstruman">ANTHROPIC_AUTH_TOKEN</span> kullanılır; yoksa sağlayıcı
                    isteği reddeder.
                  </>
                )}
                <Alan
                  id="saglayici-deepseek-model"
                  etiket="Ana model"
                  deger={ds.model}
                  onDegis={(model) => setDs((d) => ({ ...d, model }))}
                  ipucu="Boş bırakılırsa model env'i yazılmaz; Claude Code'un varsayılan model adları sağlayıcıya gider."
                  ipucuId="saglayici-deepseek-model-ipucu"
                  placeholder="deepseek-flash[1m]"
                />
                <Alan
                  id="saglayici-deepseek-hafif"
                  etiket="Hafif model"
                  deger={ds.hafifModel}
                  onDegis={(hafifModel) => setDs((d) => ({ ...d, hafifModel }))}
                  ipucu="Küçük işler (Haiku yuvası). Boşsa ana model kullanılır."
                  ipucuId="saglayici-deepseek-hafif-ipucu"
                  placeholder="deepseek-flash"
                />
                <Alan
                  id="saglayici-deepseek-alt"
                  etiket="Alt ajan modeli"
                  deger={ds.altModel}
                  onDegis={(altModel) => setDs((d) => ({ ...d, altModel }))}
                  ipucu="Alt ajanlar. Boşsa hafif model, o da boşsa ana model kullanılır."
                  ipucuId="saglayici-deepseek-alt-ipucu"
                  placeholder="deepseek-flash"
                />
                <Alan
                  id="saglayici-deepseek-baglam"
                  etiket="Bağlam penceresi (token)"
                  deger={ds.baglam}
                  onDegis={(baglam) => setDs((d) => ({ ...d, baglam }))}
                  ipucu="100000–1000000 arası. Boş = varsayılan."
                  ipucuId="saglayici-deepseek-baglam-ipucu"
                  placeholder="786432"
                  tip="number"
                  min={100000}
                  max={1000000}
                />
              </>
            )}

            {secili === 'ozel' && (
              <>
                <Alan
                  id="saglayici-ozel-baseurl"
                  etiket="Base URL (zorunlu)"
                  deger={oz.baseUrl}
                  onDegis={(baseUrl) => setOz((o) => ({ ...o, baseUrl }))}
                  ipucu="Anthropic-uyumlu servisin http/https adresi."
                  ipucuId="saglayici-ozel-baseurl-ipucu"
                  placeholder="https://gateway.example.com/anthropic"
                  tip="url"
                  zorunlu
                />
                {anahtarAlani(
                  'ozel',
                  <>
                    Boşsa ortamdan miras alınan{' '}
                    <span className="enstruman">ANTHROPIC_AUTH_TOKEN</span> kullanılır; yoksa sağlayıcı
                    isteği reddeder.
                  </>
                )}
                <Alan
                  id="saglayici-ozel-model"
                  etiket="Ana model"
                  deger={oz.model}
                  onDegis={(model) => setOz((o) => ({ ...o, model }))}
                  ipucu="Boş bırakılırsa model env'i yazılmaz; Claude Code'un varsayılan model adları sağlayıcıya gider."
                  ipucuId="saglayici-ozel-model-ipucu"
                />
                <Alan
                  id="saglayici-ozel-hafif"
                  etiket="Hafif model"
                  deger={oz.hafifModel}
                  onDegis={(hafifModel) => setOz((o) => ({ ...o, hafifModel }))}
                  ipucu="Küçük işler (Haiku yuvası). Boşsa ana model kullanılır."
                  ipucuId="saglayici-ozel-hafif-ipucu"
                />
                <Alan
                  id="saglayici-ozel-alt"
                  etiket="Alt ajan modeli"
                  deger={oz.altModel}
                  onDegis={(altModel) => setOz((o) => ({ ...o, altModel }))}
                  ipucu="Alt ajanlar. Boşsa hafif model, o da boşsa ana model kullanılır."
                  ipucuId="saglayici-ozel-alt-ipucu"
                />
                <Alan
                  id="saglayici-ozel-baglam"
                  etiket="Bağlam penceresi (token)"
                  deger={oz.baglam}
                  onDegis={(baglam) => setOz((o) => ({ ...o, baglam }))}
                  ipucu="100000–1000000 arası. Boş = varsayılan."
                  ipucuId="saglayici-ozel-baglam-ipucu"
                  placeholder="1000000"
                  tip="number"
                  min={100000}
                  max={1000000}
                />
              </>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-kenar px-5 py-3">
          <p className="enstruman truncate text-xs text-metin-soluk" title="~/.kokpit/saglayici.json">
            ~/.kokpit/saglayici.json
          </p>
          <div className="flex shrink-0 gap-2">
            <button type="button" onClick={onKapat} className={DUGME}>
              Vazgeç
            </button>
            <button
              type="submit"
              disabled={kaydediliyor}
              className="cursor-pointer rounded-kontrol bg-birincil px-3 py-1.5 text-xs font-medium text-birincil-uzeri transition-colors duration-[180ms] hover:bg-metin-ikincil disabled:cursor-not-allowed disabled:opacity-50"
            >
              {kaydediliyor ? 'Kaydediliyor' : 'Kaydet'}
            </button>
          </div>
        </div>
        {hata && (
          <p role="alert" className="px-5 pb-3 text-xs text-hata-metin">
            {hata}
          </p>
        )}
      </form>
    </dialog>
  );
}
