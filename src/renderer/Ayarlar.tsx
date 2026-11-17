import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ExternalLink, Minus, Moon, Palette, Plus, Sun, Zap } from 'lucide-react';
import type { AyarBolumu, OkumaTema, SaglayiciGorunum } from './types';
import SaglayiciAyari, { DUGME, IPUCU } from './SaglayiciAyari';

// Ayarlar sayfasi (v3.2): Kokpit'in kendi ayarlari tek yerde. Ic bolumler Okuma'daki desenle:
// ustte bolum rayi, disaridan sayacli `istek` ile bolum acma. Sayfa unmount edilmez (gizlenir).

const BOLUMLER: { id: AyarBolumu; ad: string }[] = [
  { id: 'saglayici', ad: 'Model sağlayıcısı' },
  { id: 'gorunum', ad: 'Görünüm' },
  { id: 'komutlar', ad: 'Hızlı komutlar' },
];

interface Props {
  /** Sayfa gorunur mu (saglayici formu gizlenince kayitli duruma doner). */
  aktif: boolean;
  /** Disaridan bolum acma istegi (palet, baslik rozeti); n her istekte artar. */
  istek: { bolum: AyarBolumu; n: number } | null;
  saglayici: SaglayiciGorunum | null;
  onSaglayiciKaydedildi: (g: SaglayiciGorunum) => void;
  yaziBoyutu: number;
  yaziSiniri: { enAz: number; enCok: number; varsayilan: number };
  /** fark: +1/-1; null = varsayilana don. App'teki kisayollarla ayni islev. */
  onYaziBoyutu: (fark: number | null) => void;
  okumaTema: OkumaTema;
  onOkumaTema: (t: OkumaTema) => void;
  arsivAcik: boolean;
  onArsivAcik: (acik: boolean) => void;
}

const SUTUN = 'w-full max-w-2xl px-6 py-6';
const SATIR = 'flex items-center justify-between gap-6 border-t border-kenar py-4 first:border-t-0';
const SEGMENT =
  'inline-flex cursor-pointer items-center gap-1.5 rounded-kontrol border px-2.5 py-1.5 text-xs transition-colors duration-[120ms] ';

function Baslik({ id, ikon, children }: { id: string; ikon: ReactNode; children: string }) {
  return (
    <h2 id={id} className="flex items-center gap-2 text-sm font-medium">
      {ikon}
      {children}
    </h2>
  );
}

export default function Ayarlar({
  aktif,
  istek,
  saglayici,
  onSaglayiciKaydedildi,
  yaziBoyutu,
  yaziSiniri,
  onYaziBoyutu,
  okumaTema,
  onOkumaTema,
  arsivAcik,
  onArsivAcik,
}: Props) {
  const [bolum, setBolum] = useState<AyarBolumu>('saglayici');

  const sonIstek = useRef(0);
  useEffect(() => {
    if (!istek || istek.n === sonIstek.current) return;
    sonIstek.current = istek.n;
    setBolum(istek.bolum);
  }, [istek]);

  const gorunur = (b: AyarBolumu) => (bolum === b ? 'flex' : 'hidden');

  return (
    <div className="halka relative flex h-full min-h-0 flex-col overflow-hidden rounded-base bg-yuzey">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-kenar px-3 py-2">
        <nav aria-label="Ayarlar bölümleri" className="flex flex-wrap gap-1">
          {BOLUMLER.map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => setBolum(b.id)}
              aria-current={bolum === b.id ? 'page' : undefined}
              className={
                'inline-flex cursor-pointer items-center gap-1.5 rounded-kontrol px-3 py-1.5 text-sm transition-colors duration-[180ms] ' +
                (bolum === b.id
                  ? 'bg-yuzey-guclu text-metin'
                  : 'text-metin-ikincil hover:bg-yuzey-guclu hover:text-metin')
              }
            >
              {b.ad}
            </button>
          ))}
        </nav>
      </div>

      {/* Saglayici formu gizlenince de mount kalir; ayni kural: sayfa gizlenince form sifirlanir. */}
      <div className={gorunur('saglayici') + ' min-h-0 flex-1 flex-col'}>
        <SaglayiciAyari aktif={aktif} gorunum={saglayici} onKaydedildi={onSaglayiciKaydedildi} />
      </div>

      <div className={gorunur('gorunum') + ' min-h-0 flex-1 flex-col overflow-y-auto'}>
        <div className={SUTUN}>
          <Baslik id="gorunum-baslik" ikon={<Palette className="size-4 text-metin-soluk" aria-hidden="true" />}>
            Görünüm
          </Baslik>
          <p className="mt-1.5 text-xs text-metin-ikincil">Değişiklik hemen uygulanır ve kendiliğinden kaydedilir.</p>

          <div className="mt-4" role="group" aria-labelledby="gorunum-baslik">
            <div className={SATIR}>
              <div className="min-w-0">
                <p id="yazi-boyutu-etiket" className="text-sm text-metin">
                  Terminal yazı boyutu
                </p>
                <p className={IPUCU}>Terminal odaktayken Ctrl+=, Ctrl+- ve Ctrl+0 ile de değişir.</p>
              </div>
              <div role="group" aria-labelledby="yazi-boyutu-etiket" className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => onYaziBoyutu(-1)}
                  disabled={yaziBoyutu <= yaziSiniri.enAz}
                  aria-label="Yazı boyutunu küçült"
                  title="Küçült"
                  className={DUGME + ' p-1.5'}
                >
                  <Minus className="size-3.5" aria-hidden="true" />
                </button>
                <span
                  data-yazi-boyutu={yaziBoyutu}
                  aria-live="polite"
                  className="enstruman w-14 text-center text-sm tabular-nums text-metin"
                >
                  {yaziBoyutu} px
                </span>
                <button
                  type="button"
                  onClick={() => onYaziBoyutu(1)}
                  disabled={yaziBoyutu >= yaziSiniri.enCok}
                  aria-label="Yazı boyutunu büyüt"
                  title="Büyüt"
                  className={DUGME + ' p-1.5'}
                >
                  <Plus className="size-3.5" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => onYaziBoyutu(null)}
                  disabled={yaziBoyutu === yaziSiniri.varsayilan}
                  className={DUGME}
                >
                  Sıfırla
                </button>
              </div>
            </div>

            <div className={SATIR}>
              <div className="min-w-0">
                <p id="okuma-tema-etiket" className="text-sm text-metin">
                  Okuma teması
                </p>
                <p className={IPUCU}>Yalnız Okuma sayfasını etkiler; diğer sayfalar koyu kalır.</p>
              </div>
              <div role="group" aria-labelledby="okuma-tema-etiket" className="flex shrink-0 gap-1">
                <button
                  type="button"
                  onClick={() => onOkumaTema('koyu')}
                  aria-pressed={okumaTema === 'koyu'}
                  className={
                    SEGMENT +
                    (okumaTema === 'koyu'
                      ? 'border-kenar-guclu bg-yuzey-guclu text-metin'
                      : 'border-kenar text-metin-ikincil hover:border-kenar-guclu hover:text-metin')
                  }
                >
                  <Moon className="size-3.5" aria-hidden="true" />
                  Koyu
                </button>
                <button
                  type="button"
                  onClick={() => onOkumaTema('acik')}
                  aria-pressed={okumaTema === 'acik'}
                  className={
                    SEGMENT +
                    (okumaTema === 'acik'
                      ? 'border-kenar-guclu bg-yuzey-guclu text-metin'
                      : 'border-kenar text-metin-ikincil hover:border-kenar-guclu hover:text-metin')
                  }
                >
                  <Sun className="size-3.5" aria-hidden="true" />
                  Aydınlık
                </button>
              </div>
            </div>

            <label className={SATIR + ' cursor-pointer'}>
              <span className="min-w-0">
                <span className="block text-sm text-metin">Arşivlenmiş projeleri göster</span>
                <span className={'block ' + IPUCU}>Kenar çubuğunda ve Pano'da Arşiv grubunu açar.</span>
              </span>
              <input
                type="checkbox"
                role="switch"
                checked={arsivAcik}
                onChange={(e) => onArsivAcik(e.target.checked)}
                className="size-4 shrink-0 cursor-pointer accent-aksan [color-scheme:dark]"
              />
            </label>
          </div>
        </div>
      </div>

      <div className={gorunur('komutlar') + ' min-h-0 flex-1 flex-col overflow-y-auto'}>
        <div className={SUTUN}>
          <Baslik id="komutlar-baslik" ikon={<Zap className="size-4 text-metin-soluk" aria-hidden="true" />}>
            Hızlı komutlar
          </Baslik>
          <p className="mt-1.5 text-xs text-metin-ikincil">
            Açık oturuma tek tıkla gönderilen hazır mesajlar, <span className="enstruman">komutlar.json</span>{' '}
            dosyasında tutulur.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void window.kokpit.komutlarDuzenle()}
              className={DUGME + ' inline-flex items-center gap-1.5'}
            >
              <ExternalLink className="size-3.5" aria-hidden="true" />
              Dosyayı aç
            </button>
            <p className="enstruman text-xs text-metin-soluk">~/.kokpit/komutlar.json</p>
          </div>
          <p className={IPUCU}>Kaydettikten sonra Kokpit'e dönünce yeniden okunur.</p>
        </div>
      </div>
    </div>
  );
}
