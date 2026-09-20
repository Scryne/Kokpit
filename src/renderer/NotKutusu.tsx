import { useEffect, useRef, useState } from 'react';
import { Inbox } from 'lucide-react';

interface Props {
  acik: boolean;
  /** Notun kaynagi: aktif proje adi (terminaldeyken) ya da null. */
  kaynak: string | null;
  onKapat: () => void;
  onKaydedildi: (dosya: string) => void;
}

/**
 * Inbox'a hizli not (Ctrl+Shift+N). Yerel <dialog>: odak tuzagi ve Escape tarayicidan
 * gelir, elle yazilmaz. Enter kaydeder, Shift+Enter satir ekler.
 */
export default function NotKutusu({ acik, kaynak, onKapat, onKaydedildi }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const alanRef = useRef<HTMLTextAreaElement>(null);
  const [metin, setMetin] = useState('');
  const [hata, setHata] = useState<string | null>(null);
  const [kaydediliyor, setKaydediliyor] = useState(false);

  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (acik && !d.open) {
      d.showModal();
      setTimeout(() => alanRef.current?.focus(), 0);
    } else if (!acik && d.open) {
      d.close();
    }
  }, [acik]);

  const kaydet = async () => {
    if (kaydediliyor) return;
    setKaydediliyor(true);
    setHata(null);
    const sonuc = await window.kokpit.notEkle(metin, kaynak);
    setKaydediliyor(false);
    if (sonuc.hata) {
      setHata(sonuc.hata);
      return;
    }
    setMetin('');
    onKaydedildi(sonuc.dosya ?? '');
  };

  return (
    <dialog
      ref={dialogRef}
      onClose={onKapat}
      onCancel={(e) => {
        e.preventDefault();
        onKapat();
      }}
      aria-labelledby="not-baslik"
      className="halka m-auto w-[min(36rem,calc(100vw-2rem))] rounded-base bg-yuzey-guclu p-0 text-metin shadow-2xl shadow-black/60 backdrop:bg-black/50"
    >
      <form
        method="dialog"
        onSubmit={(e) => {
          e.preventDefault();
          void kaydet();
        }}
        className="p-5"
      >
        <h2 id="not-baslik" className="flex items-center gap-2 text-sm font-medium">
          <Inbox className="size-4 text-metin-soluk" aria-hidden="true" />
          Inbox'a not
          {kaynak && <span className="enstruman text-xs text-metin-soluk">· {kaynak}</span>}
        </h2>
        <textarea
          ref={alanRef}
          value={metin}
          onChange={(e) => setMetin(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void kaydet();
            }
          }}
          rows={4}
          placeholder="Aklına geleni yaz; vault'ta 📥 000-Inbox/Dump/ altına bugünün dosyasına eklenir."
          aria-describedby="not-ipucu"
          aria-invalid={hata ? true : undefined}
          className="mt-3 w-full resize-none rounded-kontrol border border-kenar bg-terminal px-3 py-2 text-sm text-metin outline-none placeholder:text-metin-soluk focus-visible:border-aksan"
        />
        <div className="mt-2 flex items-center justify-between gap-3">
          <p id="not-ipucu" className="text-xs text-metin-soluk">
            Enter kaydeder · Shift+Enter satır · Esc vazgeç
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onKapat}
              className="cursor-pointer rounded-kontrol border border-kenar px-3 py-1.5 text-xs text-metin-ikincil transition-colors duration-[180ms] hover:border-kenar-guclu hover:text-metin"
            >
              Vazgeç
            </button>
            <button
              type="submit"
              disabled={kaydediliyor || !metin.trim()}
              className="cursor-pointer rounded-kontrol bg-birincil px-3 py-1.5 text-xs font-medium text-birincil-uzeri transition-colors duration-[180ms] hover:bg-metin-ikincil disabled:cursor-not-allowed disabled:opacity-50"
            >
              {kaydediliyor ? 'Yazılıyor' : 'Inbox\'a düş'}
            </button>
          </div>
        </div>
        {hata && (
          <p role="alert" className="mt-2 text-xs text-hata-metin">
            Not yazılamadı: {hata}
          </p>
        )}
      </form>
    </dialog>
  );
}
