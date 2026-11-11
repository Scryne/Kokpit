import { useId, useState, type ReactNode } from 'react';
import type { AdaAyarlari, AdaSayfaKimligi } from '../types';

// v4.0 Ada ayarlari. Tek kaynak main (electron/ayarlar.cjs): her degisiklik adaAyarYaz ile gider, yeni
// durum prop olarak geri gelir; iyimser guncelleme yok (ana penceredeki Ayarlar ayni nesneyi yamalar,
// iki yerde ayri kopya tutulursa birbirini ezer).

export const SAYFA_ADI: Record<AdaSayfaKimligi, string> = {
  medya: 'Medya',
  odak: 'Odak',
  liste: 'Liste',
  takvim: 'Takvim',
  sistem: 'Sistem',
  hava: 'Hava',
  raf: 'Raf',
};

const SAYFA_SIRASI: AdaSayfaKimligi[] = ['medya', 'odak', 'liste', 'takvim', 'sistem', 'hava', 'raf'];

/**
 * Acma-kapama satiri. Renk yok: durum topuzun konumu + ray tonuyla okunur. Acikken topuz koyu
 * (`aksan-uzeri`): acik ray `metin-ikincil` ustunde `metin` topuz ~1,4:1 kalip seciliyordu.
 */
export function Anahtar({
  ad,
  aciklama,
  acik,
  onDegis,
  disabled,
}: {
  ad: string;
  aciklama?: ReactNode;
  acik: boolean;
  onDegis: (yeni: boolean) => void;
  disabled?: boolean;
}) {
  const kimlik = useId();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={acik}
      aria-labelledby={kimlik + '-ad'}
      aria-describedby={aciklama ? kimlik + '-aciklama' : undefined}
      disabled={disabled}
      onClick={() => onDegis(!acik)}
      className={
        'flex w-full min-w-0 items-center gap-3 rounded-lg px-1.5 py-1 text-left text-xs transition-colors duration-[120ms] ' +
        (disabled ? 'cursor-default opacity-50' : 'cursor-pointer hover:bg-yuzey-guclu/60')
      }
    >
      <span className="min-w-0 flex-1">
        <span id={kimlik + '-ad'} className="block truncate text-metin">
          {ad}
        </span>
        {aciklama && (
          <span
            id={kimlik + '-aciklama'}
            className="block truncate text-metin-soluk"
            title={typeof aciklama === 'string' ? aciklama : undefined}
          >
            {aciklama}
          </span>
        )}
      </span>
      <span
        aria-hidden="true"
        className={'relative h-4 w-7 shrink-0 rounded-full transition-colors duration-[120ms] ' + (acik ? 'bg-metin-ikincil' : 'bg-kenar-guclu')}
      >
        <span
          className={
            'absolute left-0.5 top-0.5 size-3 rounded-full transition-transform duration-[120ms] ' +
            (acik ? 'translate-x-3 bg-aksan-uzeri' : 'bg-metin-soluk')
          }
        />
      </span>
    </button>
  );
}

function Bolum({ ad, ilk, children }: { ad: string; ilk?: boolean; children: ReactNode }) {
  const kimlik = useId();
  return (
    <div role="group" aria-labelledby={kimlik} className={ilk ? 'pb-1.5' : 'border-t border-kenar py-1.5'}>
      <p id={kimlik} className="etiket mb-0.5 px-1.5">
        {ad}
      </p>
      {children}
    </div>
  );
}

export function AyarSayfasi({ ayar }: { ayar: AdaAyarlari | null }) {
  const [hata, setHata] = useState<string | null>(null);

  if (!ayar) {
    return (
      <section aria-label="Ayarlar" data-ada-sayfa="ayar" className="px-2 py-1.5 text-xs">
        <p role="status" className="px-1 py-3 text-metin-soluk">
          Ayarlar yükleniyor…
        </p>
      </section>
    );
  }

  const yaz = (yama: Parameters<typeof window.kokpit.adaAyarYaz>[0]) => {
    setHata(null);
    window.kokpit.adaAyarYaz(yama).catch(() => setHata('Ayar kaydedilemedi. Bir daha dene; sürerse Kokpit loguna bak.'));
  };
  const sesYok = (
    <>
      Ses kurulu değil: <span className="enstruman">npm run ses:kur</span>
    </>
  );
  const konum = ayar.havaKonum;

  return (
    <section aria-label="Ayarlar" data-ada-sayfa="ayar" className="px-2 py-1.5 text-xs">
      {hata && (
        <p role="status" className="mb-1 px-1.5 text-hata-metin">
          {hata}
        </p>
      )}

      <Bolum ad="Sayfalar" ilk>
        <div className="grid grid-cols-2 gap-x-2">
          {SAYFA_SIRASI.map((k) => {
            const acik = !!ayar.sayfalar?.[k];
            return <Anahtar key={k} ad={SAYFA_ADI[k]} acik={acik} onDegis={() => yaz({ sayfalar: { [k]: !acik } })} />;
          })}
        </div>
        <p className="mt-0.5 px-1.5 text-metin-soluk">Kapalı sayfa arka planda çalışmaz.</p>
      </Bolum>

      <Bolum ad="Görünüm">
        <Anahtar
          ad="Minimal hap"
          aciklama="Sakinken yalnız göz ve canlı göstergeler"
          acik={ayar.minimal}
          onDegis={(v) => yaz({ minimal: v })}
        />
        <Anahtar ad="Kokpit öndeyken de göster" acik={ayar.hep} onDegis={(v) => yaz({ hep: v })} />
        <Anahtar
          ad="Tam ekranda çekil"
          aciklama="Video, oyun ya da sunumda gizlenir"
          acik={ayar.tamEkran}
          onDegis={(v) => yaz({ tamEkran: v })}
        />
      </Bolum>

      <Bolum ad="Ses">
        <Anahtar
          ad="Sesli bildirim"
          aciklama={ayar.ses?.tts ? 'Oturum bekleyince ya da bitince adını söyler' : sesYok}
          acik={ayar.sesli}
          disabled={!ayar.ses?.tts}
          onDegis={(v) => yaz({ sesli: v })}
        />
        <Anahtar
          ad="Eller serbest"
          aciklama={ayar.ses?.stt ? "'Ada, …' diye seslen; mikrofon sürekli açık kalır" : sesYok}
          acik={ayar.uyanma}
          disabled={!ayar.ses?.stt}
          onDegis={(v) => yaz({ uyanma: v })}
        />
      </Bolum>

      <Bolum ad="Gün">
        <Anahtar
          ad="Günün brifingi"
          aciklama="Günün ilk açılışında vade, bot ve bekleyenleri özetler"
          acik={ayar.brifing}
          onDegis={(v) => yaz({ brifing: v })}
        />
        <Anahtar
          ad="Şarkı sözleri"
          aciklama="Çalan parçanın adı lrclib.net'e gider"
          acik={ayar.sozler}
          onDegis={(v) => yaz({ sozler: v })}
        />
      </Bolum>

      <Bolum ad="Hava">
        <div className="flex min-w-0 items-center gap-2 px-1.5 py-1">
          <span className="min-w-0 flex-1 truncate">
            {konum ? (
              <>
                <span className="text-metin">{konum.ad}</span>
                {(konum.bolge || konum.ulke) && (
                  <span className="text-metin-soluk"> · {[konum.bolge, konum.ulke].filter(Boolean).join(', ')}</span>
                )}
              </>
            ) : (
              <span className="text-metin-soluk">Seçilmedi</span>
            )}
          </span>
          {konum && (
            <button
              type="button"
              onClick={() => yaz({ havaKonum: null })}
              title="Hava konumunu kaldır"
              className="shrink-0 cursor-pointer rounded px-1 py-0.5 text-metin-soluk transition-colors duration-[120ms] hover:text-metin"
            >
              Kaldır
            </button>
          )}
        </div>
        <p className="px-1.5 text-metin-soluk">Şehri Hava sayfasından seç.</p>
      </Bolum>
    </section>
  );
}
