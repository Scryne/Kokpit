import { useRef, useState, type DragEvent } from 'react';
import { CornerDownRight, ExternalLink, FileText, Folder, FolderOpen, Link2, X } from 'lucide-react';
import type { RafOgesi } from '../types';
import { IkonDugme, SayfaBos } from './ortak';

// v4.0 Raf: dosya/baglantiyi gecici tutma yeri. Yol renderer'a gelmez; eylemler kimlikle main'e gider
// (electron/raf.cjs). Ada'ya birakilan dosya normalde ek tepsisine gider; bu sayfa acikken birakma
// burada yakalanir ve stopPropagation ile Ada.tsx'in kendi birakma isleyicisine ulasmaz.

function kabulEder(ev: DragEvent) {
  const t = Array.from(ev.dataTransfer.types);
  return t.includes('Files') || t.includes('text/uri-list') || t.includes('text/plain');
}

/** Bayt -> "1,2 MB" (Turkce ondalik virgul; Gezgin gibi 1024 tabani). */
export function boyutMetni(b: number) {
  if (!Number.isFinite(b) || b < 0) return '';
  if (b < 1024) return b + ' B';
  const birim = ['KB', 'MB', 'GB', 'TB'];
  let n = b / 1024;
  let i = 0;
  while (n >= 1024 && i < birim.length - 1) {
    n /= 1024;
    i++;
  }
  return n.toLocaleString('tr-TR', { maximumFractionDigits: n < 10 ? 1 : 0 }) + ' ' + birim[i];
}

function hostAdi(adres: string | undefined) {
  if (!adres) return 'bağlantı';
  try {
    return new URL(adres).host || adres;
  } catch {
    return adres;
  }
}

function Onizleme({ o }: { o: RafOgesi }) {
  if (o.onizleme) {
    return (
      <img
        src={o.onizleme}
        alt=""
        draggable={false}
        className={'size-8 shrink-0 rounded-rozet border border-kenar object-cover ' + (o.var ? '' : 'opacity-50')}
      />
    );
  }
  const Ikon = o.tur === 'klasor' ? Folder : o.tur === 'baglanti' ? Link2 : FileText;
  return (
    <span className="flex size-8 shrink-0 items-center justify-center rounded-rozet bg-yuzey-guclu text-metin-soluk">
      <Ikon className="size-3.5" aria-hidden="true" />
    </span>
  );
}

function RafSatiri({ o, oturumVar }: { o: RafOgesi; oturumVar: boolean }) {
  const baglanti = o.tur === 'baglanti';
  const surukle = o.var && !baglanti;
  return (
    <li
      data-raf={o.id}
      draggable={surukle}
      onDragStart={
        surukle
          ? (ev) => {
              // HTML suruklemesi iptal; isletim sistemi suruklemesini main baslatir (webContents.startDrag).
              ev.preventDefault();
              window.kokpit.rafSurukle(o.id);
            }
          : undefined
      }
      title={surukle ? o.ad + '\nSürükle: başka bir uygulamaya bırak' : o.ad}
      className={
        'flex min-w-0 items-center gap-2 rounded-lg px-1 py-1 transition-colors duration-[120ms] hover:bg-yuzey-guclu/60 ' +
        (surukle ? 'cursor-grab' : '')
      }
    >
      <Onizleme o={o} />
      <div className="min-w-0 flex-1">
        <p className={'truncate ' + (o.var ? 'text-metin' : 'text-metin-soluk line-through decoration-kenar-guclu')}>{o.ad}</p>
        <p className="truncate text-metin-soluk">
          {!o.var ? (
            'taşınmış ya da silinmiş'
          ) : baglanti ? (
            <span className="enstruman">{hostAdi(o.adres)}</span>
          ) : o.tur === 'klasor' ? (
            'klasör'
          ) : o.boyut !== null ? (
            <span className="enstruman">{boyutMetni(o.boyut)}</span>
          ) : (
            'dosya'
          )}
        </p>
      </div>
      <div className="flex shrink-0 items-center">
        <IkonDugme etiket={'Aç: ' + o.ad} ipucu="Aç" disabled={!o.var} onClick={() => window.kokpit.rafAc(o.id)}>
          <ExternalLink className="size-3.5" aria-hidden="true" />
        </IkonDugme>
        {!baglanti && (
          <IkonDugme etiket={"Gezgin'de göster: " + o.ad} ipucu="Gezgin'de göster" disabled={!o.var} onClick={() => window.kokpit.rafGoster(o.id)}>
            <FolderOpen className="size-3.5" aria-hidden="true" />
          </IkonDugme>
        )}
        {!baglanti && (
          <IkonDugme
            etiket={'Oturuma ekle: ' + o.ad}
            ipucu={oturumVar ? 'Oturuma ekle' : 'Açık claude oturumu yok'}
            disabled={!o.var || !oturumVar}
            onClick={() => window.kokpit.rafOturuma(o.id)}
          >
            <CornerDownRight className="size-3.5" aria-hidden="true" />
          </IkonDugme>
        )}
        <IkonDugme etiket={'Raftan çıkar: ' + o.ad} ipucu="Raftan çıkar" onClick={() => window.kokpit.rafSil([o.id])}>
          <X className="size-3.5" aria-hidden="true" />
        </IkonDugme>
      </div>
    </li>
  );
}

export function RafSayfasi({ raf, oturumVar }: { raf: RafOgesi[]; oturumVar: boolean }) {
  const [uzerinde, setUzerinde] = useState(false);
  // dragenter/leave alt ogelerde de tetiklenir; sayac olmadan cerceve her alt ogede yanip soner.
  const derinlik = useRef(0);

  const ustune = (ev: DragEvent<HTMLElement>) => {
    if (!kabulEder(ev)) return;
    ev.preventDefault();
    ev.stopPropagation();
    ev.dataTransfer.dropEffect = 'copy';
  };

  return (
    <section
      aria-label="Raf"
      data-ada-sayfa="raf"
      onDragEnter={(ev) => {
        if (!kabulEder(ev)) return;
        ev.preventDefault();
        ev.stopPropagation();
        derinlik.current += 1;
        setUzerinde(true);
      }}
      onDragOver={ustune}
      onDragLeave={(ev) => {
        if (!kabulEder(ev)) return;
        ev.stopPropagation();
        derinlik.current = Math.max(0, derinlik.current - 1);
        if (derinlik.current === 0) setUzerinde(false);
      }}
      onDrop={(ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        derinlik.current = 0;
        setUzerinde(false);
        const dosyalar = Array.from(ev.dataTransfer.files);
        if (dosyalar.length > 0) {
          const yollar = dosyalar.map((f) => window.kokpit.dosyaYolu(f)).filter((y) => !!y);
          if (yollar.length > 0) window.kokpit.rafEkle(yollar);
          return;
        }
        // uri-list'te '#' ile baslayan satirlar yorumdur; ilk gercek adres alinir.
        const ham = ev.dataTransfer.getData('text/uri-list') || ev.dataTransfer.getData('text/plain');
        const adres = ham
          .split(/\r?\n/)
          .map((s) => s.trim())
          .find((s) => s && !s.startsWith('#'));
        if (adres && /^https?:\/\//i.test(adres)) window.kokpit.rafBaglanti(adres);
      }}
      className={
        'min-h-28 rounded-lg px-2 py-1.5 text-xs ' + (uzerinde ? 'outline-1 -outline-offset-2 outline-dashed outline-aksan/70' : '')
      }
    >
      <div className="mb-1 flex items-center gap-2 px-0.5">
        <span className="etiket">Raf</span>
        <span className="enstruman text-metin-soluk">{raf.length}</span>
        {uzerinde ? (
          <span role="status" className="ml-auto py-0.5 text-metin-ikincil">
            Bırak: rafa eklenir
          </span>
        ) : (
          raf.length >= 2 && (
            <button
              type="button"
              onClick={() => window.kokpit.rafSil('hepsi')}
              className="ml-auto cursor-pointer rounded px-1 py-0.5 text-metin-soluk transition-colors duration-[120ms] hover:text-metin"
            >
              Hepsini çıkar
            </button>
          )
        )}
      </div>
      {raf.length === 0 ? (
        <SayfaBos>
          Raf boş. Bir dosyayı ya da bağlantıyı buraya sürükle; sonra başka bir yere sürükleyebilir ya da bir oturuma ekleyebilirsin.
        </SayfaBos>
      ) : (
        <ul aria-label="Raftaki öğeler">
          {raf.map((o) => (
            <RafSatiri key={o.id} o={o} oturumVar={oturumVar} />
          ))}
        </ul>
      )}
    </section>
  );
}
