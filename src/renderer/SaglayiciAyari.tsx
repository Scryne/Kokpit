import { useLayoutEffect, useState, type ReactNode } from 'react';
import { Server } from 'lucide-react';
import type { Efor, SaglayiciGorunum, SaglayiciKimligi, SaglayiciYama } from './types';

type Anahtarli = 'anthropic' | 'opencode' | 'deepseek' | 'ozel';
type ModelAlani = 'model' | 'hafifModel' | 'altModel' | 'baglam';

interface Props {
  /** Ayarlar sayfasi gorunur mu. Gizlenince ya da yeniden gorununce form kayitli duruma doner. */
  aktif: boolean;
  gorunum: SaglayiciGorunum | null;
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
  {
    id: 'opencode',
    ad: 'OpenCode Go',
    aciklama: 'DeepSeek V4.1 Flash, OpenCode Go aboneliği.',
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

export const KUTU =
  'rounded-kontrol border border-kenar bg-terminal px-3 py-2 text-sm text-metin outline-none placeholder:text-metin-soluk focus-visible:border-aksan';
export const IPUCU = 'mt-1 text-xs text-metin-soluk';
export const DUGME =
  'cursor-pointer rounded-kontrol border border-kenar px-3 py-1.5 text-xs text-metin-ikincil transition-colors duration-[180ms] hover:border-kenar-guclu hover:text-metin disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-kenar disabled:hover:text-metin-ikincil';

const MIRAS_ANAHTAR = (
  <>
    Boşsa ortamdan miras alınan <span className="enstruman">ANTHROPIC_AUTH_TOKEN</span> kullanılır; yoksa
    sağlayıcı isteği reddeder.
  </>
);

/** Saglayici basina fark VERIDIR: ayni kod bes saglayiciyi de cizer. */
interface Kurulum {
  /** yok: Base URL alani yok; salt: preset'ten gelir, duzenlenmez; zorunlu: elle yazilir. */
  baseUrl: 'yok' | 'salt' | 'zorunlu';
  modelAlanlari: boolean;
  anahtarIpucu: ReactNode;
  yer: Partial<Record<ModelAlani, string>>;
  yardim?: ReactNode;
}

const KURULUM: Record<Anahtarli, Kurulum> = {
  anthropic: {
    baseUrl: 'yok',
    modelAlanlari: false,
    anahtarIpucu: (
      <>
        Opsiyonel. Boşsa oturum açmış hesap ya da kendi <span className="enstruman">ANTHROPIC_API_KEY</span>{' '}
        değerin kullanılır.
      </>
    ),
    yer: {},
  },
  opencode: {
    baseUrl: 'salt',
    modelAlanlari: true,
    anahtarIpucu: MIRAS_ANAHTAR,
    yer: {
      model: 'deepseek-v4.1-flash[1m]',
      hafifModel: 'deepseek-v4.1-flash',
      altModel: 'deepseek-v4.1-flash',
      baglam: '786432',
    },
    yardim: (
      <>
        Anahtarı opencode.ai Console'dan al (Go aboneliği olan workspace'ten). DeepSeek modelleri için
        Settings › Privacy › Regions ayarı <span className="text-metin">Global</span> olmalı.
      </>
    ),
  },
  deepseek: {
    baseUrl: 'salt',
    modelAlanlari: true,
    anahtarIpucu: MIRAS_ANAHTAR,
    yer: {
      model: 'deepseek-flash[1m]',
      hafifModel: 'deepseek-flash',
      altModel: 'deepseek-flash',
      baglam: '786432',
    },
  },
  ozel: {
    baseUrl: 'zorunlu',
    modelAlanlari: true,
    anahtarIpucu: MIRAS_ANAHTAR,
    yer: { baglam: '1000000' },
  },
};

const MODEL_ALANLARI: { alan: ModelAlani; son: string; etiket: string; ipucu: string }[] = [
  {
    alan: 'model',
    son: 'model',
    etiket: 'Ana model',
    ipucu: "Boş bırakılırsa model env'i yazılmaz; Claude Code'un varsayılan model adları sağlayıcıya gider.",
  },
  {
    alan: 'hafifModel',
    son: 'hafif',
    etiket: 'Hafif model',
    ipucu: 'Küçük işler (Haiku yuvası). Boşsa ana model kullanılır.',
  },
  {
    alan: 'altModel',
    son: 'alt',
    etiket: 'Alt ajan modeli',
    ipucu: 'Alt ajanlar. Boşsa hafif model, o da boşsa ana model kullanılır.',
  },
  {
    alan: 'baglam',
    son: 'baglam',
    etiket: 'Bağlam penceresi (token)',
    ipucu: '100000–1000000 arası. Boş = varsayılan.',
  },
];

/** Bir saglayicinin form durumu. `anahtar` diske hic inmemis, yazilmakta olan degerdir. */
interface AlanDurumu {
  baseUrl: string;
  model: string;
  hafifModel: string;
  altModel: string;
  baglam: string;
  anahtar: string;
  anahtarVar: boolean;
  anahtarSilindi: boolean;
}

interface Form {
  secili: SaglayiciKimligi;
  efor: Efor;
  alanlar: Record<Anahtarli, AlanDurumu>;
}

type Ham = {
  anahtarVar: boolean;
  baseUrl?: string;
  model?: string;
  hafifModel?: string;
  altModel?: string;
  baglam?: number;
};

const alanDurumu = (h?: Ham): AlanDurumu => ({
  baseUrl: h?.baseUrl ?? '',
  model: h?.model ?? '',
  hafifModel: h?.hafifModel ?? '',
  altModel: h?.altModel ?? '',
  baglam: h?.baglam && h.baglam > 0 ? String(h.baglam) : '',
  anahtar: '',
  anahtarVar: h?.anahtarVar ?? false,
  anahtarSilindi: false,
});

/** Kayitli gorunumden form: anahtar kutulari bos, durum "Kayitli/Yok". */
const formdan = (g: SaglayiciGorunum | null): Form => ({
  secili: g?.secili ?? 'varsayilan',
  efor: g?.efor ?? 'varsayilan',
  alanlar: {
    anthropic: alanDurumu(g?.anthropic),
    opencode: alanDurumu(g?.opencode),
    deepseek: alanDurumu(g?.deepseek),
    ozel: alanDurumu(g?.ozel),
  },
});

/** Bos = 0 (varsayilan); doluysa 100000..1000000 tam sayi. Gecersizse null. */
const baglamSayisi = (deger: string): number | null => {
  const t = deger.trim();
  if (t === '') return 0;
  const n = Number(t);
  return Number.isInteger(n) && n >= 100000 && n <= 1000000 ? n : null;
};

function Alan({
  id,
  etiket,
  deger,
  onDegis,
  ipucu,
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
  placeholder?: string;
  tip?: string;
  min?: number;
  max?: number;
  zorunlu?: boolean;
}) {
  const ipucuId = id + '-ipucu';
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
 * Model saglayicisi (v3.0; v3.2'de diyalogdan Ayarlar sayfasinin bolumune tasindi). Anahtar kutusu
 * her gorunumde bostur; kayitli anahtar yalniz "Kayıtlı" olarak gorunur ve renderer'a hic gelmez.
 *
 * KURAL: yazma, secme ve "Sil" yalniz yerel state'i degistirir; IPC/disk yazimi YOKTUR. Diske yalniz
 * "Kaydet" yazar (window.kokpit.saglayiciKaydet). "Vazgeç" formu kayitli duruma dondurur.
 *
 * Sayfa unmount edilmez (gizlenir): bu yuzden form, sayfa her gizlendiginde/gorundugunde kayitli
 * duruma sifirlanir; yazilmis ama kaydedilmemis bir anahtar gizli DOM'da beklemez.
 */
export default function SaglayiciAyari({ aktif, gorunum, onKaydedildi }: Props) {
  const [form, setForm] = useState<Form>(() => formdan(gorunum));
  const [hata, setHata] = useState<string | null>(null);
  const [mesaj, setMesaj] = useState<string | null>(null);
  const [kaydediliyor, setKaydediliyor] = useState(false);

  // Sayfa gorunurlugu degisince ya da kayitli gorunum degisince (ilk yukleme, Kaydet) form
  // kayitli duruma doner. Layout effect: yeniden gorunen sayfada eski anahtar bir kare bile cizilmez.
  useLayoutEffect(() => {
    setForm(formdan(gorunum));
    setKaydediliyor(false);
  }, [aktif, gorunum]);
  useLayoutEffect(() => {
    setHata(null);
    setMesaj(null);
  }, [aktif]);

  const degistir = (yeni: (f: Form) => Form) => {
    setMesaj(null);
    setForm(yeni);
  };
  const alanDegistir = (kimlik: Anahtarli, yama: Partial<AlanDurumu>) =>
    degistir((f) => ({ ...f, alanlar: { ...f.alanlar, [kimlik]: { ...f.alanlar[kimlik], ...yama } } }));

  const kirli = JSON.stringify(form) !== JSON.stringify(formdan(gorunum));
  const { secili, efor } = form;

  const anahtarAlani = (kimlik: Anahtarli) => {
    const a = form.alanlar[kimlik];
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
            {a.anahtarVar ? 'Kayıtlı' : 'Yok'}
          </span>
        </div>
        <div className="mt-1 flex gap-2">
          <input
            id={'saglayici-anahtar-' + kimlik}
            type="password"
            value={a.anahtar}
            onChange={(e) => alanDegistir(kimlik, { anahtar: e.target.value })}
            placeholder={a.anahtarVar ? 'Kayıtlı — değiştirmek için yaz' : 'API anahtarı'}
            autoComplete="off"
            spellCheck={false}
            aria-describedby={durumId + ' ' + ipucuId}
            className={'mt-0 min-w-0 flex-1 ' + KUTU}
          />
          {a.anahtarVar && (
            <button
              type="button"
              title="Kaydedince silinir"
              onClick={() => alanDegistir(kimlik, { anahtar: '', anahtarSilindi: true, anahtarVar: false })}
              className={DUGME + ' shrink-0'}
            >
              Sil
            </button>
          )}
        </div>
        <p id={ipucuId} className={IPUCU}>
          {KURULUM[kimlik].anahtarIpucu}
        </p>
      </div>
    );
  };

  const kaydet = async () => {
    if (kaydediliyor) return;
    setHata(null);
    setMesaj(null);

    const k = secili === 'varsayilan' ? null : KURULUM[secili];
    const a = secili === 'varsayilan' ? null : form.alanlar[secili];

    // Sunucu da reddeder; burada IPC'ye hic gitmeden ayni metni gosteriyoruz.
    if (k?.baseUrl === 'zorunlu' && a?.baseUrl.trim() === '') {
      setHata('Özel API için Base URL gerekli.');
      return;
    }

    // Yama yalniz secili saglayici icin kurulur; digerlerinin formdaki degerleri diske gitmez.
    const yama: SaglayiciYama = { secili, efor };
    const yamaSaglayici = yama as Record<string, unknown>;
    if (k && a && secili !== 'varsayilan') {
      const anahtar =
        a.anahtarSilindi && a.anahtar === ''
          ? { anahtarSil: true }
          : a.anahtar !== ''
            ? { anahtar: a.anahtar }
            : {};
      if (!k.modelAlanlari) {
        yamaSaglayici[secili] = anahtar;
      } else {
        const baglam = baglamSayisi(a.baglam);
        if (baglam === null) {
          setHata('Bağlam penceresi 100000 ile 1000000 arasında bir tam sayı olmalı.');
          return;
        }
        // Salt okunur Base URL preset'ten gelir ve duzenlenmez; yama gonderilmez.
        yamaSaglayici[secili] = {
          ...anahtar,
          ...(k.baseUrl === 'zorunlu' ? { baseUrl: a.baseUrl } : {}),
          model: a.model,
          hafifModel: a.hafifModel,
          altModel: a.altModel,
          baglam,
        };
      }
    }

    setKaydediliyor(true);
    const sonuc = await window.kokpit.saglayiciKaydet(yama);
    setKaydediliyor(false);
    if (!sonuc.ok) {
      setHata(sonuc.hata ?? 'Kaydedilemedi.');
      return;
    }
    setForm(formdan(sonuc.gorunum));
    onKaydedildi(sonuc.gorunum);
    setMesaj('Kaydedildi. Yalnız yeni açılan sekmelere uygulanır.');
  };

  const kurulum = secili === 'varsayilan' ? null : KURULUM[secili];
  const alan = secili === 'varsayilan' ? null : form.alanlar[secili];

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void kaydet();
      }}
      className="flex min-h-0 flex-1 flex-col"
    >
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="w-full max-w-2xl px-6 py-6">
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
                    (secili === s.id ? 'border-kenar-guclu bg-yuzey-guclu' : 'border-kenar hover:border-kenar-guclu')
                  }
                >
                  <input
                    type="radio"
                    name="saglayici-secim"
                    value={s.id}
                    checked={secili === s.id}
                    onChange={() => degistir((f) => ({ ...f, secili: s.id }))}
                    className="mt-0.5 accent-aksan [color-scheme:dark]"
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
              onChange={(e) => degistir((f) => ({ ...f, efor: e.target.value as Efor }))}
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
            {!kurulum || !alan || secili === 'varsayilan' ? (
              <p className="text-xs text-metin-soluk">
                Ortam değişkenleri olduğu gibi kalır; yalnızca seçilen efor uygulanır.
              </p>
            ) : (
              <>
                {kurulum.yardim && <p className="text-xs text-metin-ikincil">{kurulum.yardim}</p>}

                {kurulum.baseUrl === 'salt' && (
                  <div>
                    <p className="text-xs text-metin-ikincil">Base URL</p>
                    <p
                      className="enstruman mt-1 truncate rounded-kontrol border border-kenar bg-terminal px-3 py-2 text-xs text-metin-soluk"
                      title={alan.baseUrl}
                    >
                      {alan.baseUrl || 'Ayarlı değil'}
                    </p>
                  </div>
                )}
                {kurulum.baseUrl === 'zorunlu' && (
                  <Alan
                    id={'saglayici-' + secili + '-baseurl'}
                    etiket="Base URL (zorunlu)"
                    deger={alan.baseUrl}
                    onDegis={(baseUrl) => alanDegistir(secili, { baseUrl })}
                    ipucu="Anthropic-uyumlu servisin http/https adresi."
                    placeholder="https://gateway.example.com/anthropic"
                    tip="url"
                    zorunlu
                  />
                )}

                {anahtarAlani(secili)}

                {kurulum.modelAlanlari &&
                  MODEL_ALANLARI.map((m) => (
                    <Alan
                      key={m.alan}
                      id={'saglayici-' + secili + '-' + m.son}
                      etiket={m.etiket}
                      deger={alan[m.alan]}
                      onDegis={(deger) => alanDegistir(secili, { [m.alan]: deger })}
                      ipucu={m.ipucu}
                      placeholder={kurulum.yer[m.alan]}
                      tip={m.alan === 'baglam' ? 'number' : 'text'}
                      min={m.alan === 'baglam' ? 100000 : undefined}
                      max={m.alan === 'baglam' ? 1000000 : undefined}
                    />
                  ))}
              </>
            )}
          </div>
        </div>
      </div>

      <div className="shrink-0 border-t border-kenar">
        <div className="flex w-full max-w-2xl items-center justify-between gap-3 px-6 py-3">
          {hata ? (
            <p role="alert" className="min-w-0 text-xs text-hata-metin">
              {hata}
            </p>
          ) : mesaj ? (
            <p role="status" className="min-w-0 text-xs text-metin-ikincil">
              {mesaj}
            </p>
          ) : (
            <p className="enstruman truncate text-xs text-metin-soluk" title="~/.kokpit/saglayici.json">
              ~/.kokpit/saglayici.json
            </p>
          )}
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              disabled={!kirli}
              onClick={() => {
                setForm(formdan(gorunum));
                setHata(null);
                setMesaj(null);
              }}
              className={DUGME}
            >
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
      </div>
    </form>
  );
}
