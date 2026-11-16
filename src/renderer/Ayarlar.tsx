import { useEffect, useState } from 'react';
import { FileCog, ScrollText } from 'lucide-react';
import type { AdaAyarlari } from './types';
import { Anahtar, AyarSayfasi } from './ada/AyarSayfasi';

// v4.0: Ayarlar (Ctrl+8). Bugune kadar ayarlar yalniz tepsi menusundeydi; kisayollari ve sesli komutlari
// hatirlamanin yolu README'ydi. Bu sayfa uc seyi tek yere toplar: Ada'nin ayarlari (Ada'nin kendi Ayarlar
// sayfasiyla AYNI bilesen ve ayni kayit: iki yuzey ayrismaz), kisayollar, sesli komutlar.
// Ayar main'de yasar (ada-sayfalar.cjs); buradan, Ada'dan ya da tepsiden degisen digerlerine yayinlanir.

const GENEL: [string, string][] = [
  ['Ctrl+Alt+Shift+K', "Kokpit'i çağır ya da gizle"],
  ['Ctrl+Alt+Shift+A', "Ada'ya klavyeyle git: sırası gelen oturuma cevap"],
  ['Ctrl+Alt+Shift+G', "Ada'yı kenara sakla ya da geri getir"],
  ['Ctrl+Alt+Shift+Space', 'Bas-konuş: Ada dinler'],
  ['Ctrl+Alt+Shift+S', "Ekran yakala, Ada'dan oturuma gönder"],
  ['Ctrl+Alt+Shift+C', "Seçili metni Ada'ya al"],
  ['Ctrl+Alt+Shift+N', "Inbox'a not"],
];
const ICERIDE: [string, string][] = [
  ['Ctrl+1 … 8', 'Pano, Terminaller, Sağlık, Envanter, Botlar, Teslim, Aria, Ayarlar'],
  ['Ctrl+Shift+P', 'Komut paleti'],
  ['Ctrl+Shift+T', 'Son kapatılan oturumu geri aç'],
  ['Ctrl+Shift+N', "Inbox'a not"],
];
const SESLI: [string, string][] = [
  ['“Kokpit’e yaz, testleri koş, gönder”', 'Notu o oturuma yollar'],
  ['“Durum ne?” · “Kokpit ne yaptı?”', 'Oturumları özetler'],
  ['“İkinci seçenek” · “Önerileni seç”', "claude'un sorusunu cevaplar"],
  ['“Müziği durdur” · “Sonraki şarkı”', 'Çalanı yönetir'],
  ['“25 dakika odak” · “Mola ver”', 'Odak sayacını başlatır'],
  ['“Listeye ekle: yarın rapor”', 'Yapılacaklara ekler'],
  ['“Hava nasıl?” · “Listede ne var?”', 'Sesli cevap verir'],
  ['“Günaydın Ada”', 'Günün brifingi'],
];

function Tablo({ baslik, satirlar, mono }: { baslik: string; satirlar: [string, string][]; mono: boolean }) {
  return (
    <section aria-label={baslik}>
      <h3 className="etiket mb-1.5">{baslik}</h3>
      <dl className="divide-y divide-kenar">
        {satirlar.map(([k, v]) => (
          <div key={k} className="flex items-baseline gap-4 py-1.5 text-sm">
            <dt className={(mono ? 'enstruman w-48 text-xs ' : 'w-64 ') + 'shrink-0 text-metin'}>{k}</dt>
            <dd className="min-w-0 text-metin-ikincil">{v}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export default function Ayarlar() {
  const [ayar, setAyar] = useState<AdaAyarlari | null>(null);
  const [log, setLog] = useState<string | null>(null);
  useEffect(() => {
    void window.kokpit.adaAyarlar().then((a) => a && setAyar(a));
    void window.kokpit.logYolu().then(setLog);
    return window.kokpit.adaAyarlarDinle(setAyar);
  }, []);

  return (
    <div className="grid items-start gap-4 pb-4 xl:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
      <section aria-label="Ada ayarları" className="halka relative rounded-base bg-yuzey p-3">
        <h2 className="mb-1 px-2 text-sm font-medium text-metin">Ada</h2>
        <div className="px-2">
          <Anahtar
            ad="Ada'yı göster"
            aciklama="Ekranın üst ortasındaki hap: oturumlar, limitler ve sayfalar"
            acik={ayar?.acik !== false}
            disabled={!ayar}
            onDegis={(acik) => void window.kokpit.adaAyarYaz({ acik })}
          />
        </div>
        {/* Ada'nin kendi Ayarlar sayfasiyla ayni bilesen: bir ayar iki yerde iki farkli sekilde anlatilmaz. */}
        <AyarSayfasi ayar={ayar} />
      </section>

      <div className="halka relative space-y-5 rounded-base bg-yuzey p-4">
        <Tablo baslik="Her yerden" satirlar={GENEL} mono />
        <Tablo baslik="Kokpit içinde" satirlar={ICERIDE} mono />
        <section aria-label="Sesli komutlar">
          <Tablo baslik="Ada'ya söyle" satirlar={SESLI} mono={false} />
          {ayar && !ayar.ses.stt && (
            <p className="mt-2 text-xs text-metin-soluk">
              Ses kurulu değil. Kurmak için proje klasöründe <span className="enstruman">npm run ses:kur</span>.
            </p>
          )}
        </section>
        <section aria-label="Dosyalar">
          <h3 className="etiket mb-1.5">Dosyalar</h3>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void window.kokpit.komutlarDuzenle()}
              title="Etkinlik şeridindeki ve Ada'daki hızlı komutlar (komutlar.json)"
              className="flex cursor-pointer items-center gap-2 rounded-kontrol border border-kenar px-3 py-1.5 text-sm text-metin-ikincil transition-colors duration-[120ms] hover:border-kenar-guclu hover:text-metin"
            >
              <FileCog className="size-4" aria-hidden="true" />
              Hızlı komutları düzenle
            </button>
            {log && (
              <button
                type="button"
                onClick={() => void window.kokpit.klasorAc(log)}
                title={log}
                className="flex cursor-pointer items-center gap-2 rounded-kontrol border border-kenar px-3 py-1.5 text-sm text-metin-ikincil transition-colors duration-[120ms] hover:border-kenar-guclu hover:text-metin"
              >
                <ScrollText className="size-4" aria-hidden="true" />
                Günlük dosyasını göster
              </button>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
