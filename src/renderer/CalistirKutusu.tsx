import { useEffect, useRef, useState } from 'react';
import { Play } from 'lucide-react';

interface Props {
  /** Komutu sorulan proje; null iken kapali. */
  proje: { ad: string; yol: string } | null;
  /** Kutu neden acildi: tarif bulunamadi ya da komut degistiriliyor (onceki komut dolu gelir). */
  neden: string | null;
  baslangic: string;
  onKapat: () => void;
  onKaydedildi: (komut: string) => void;
}

/**
 * Calistirma komutu sorusu. package.json'dan bulunamayan projede (Python, compose...) komut bir
 * kez yazilir, ~/.kokpit/calistir.json'a kaydedilir; Kokpit sonra hep onu kullanir. Yerel
 * <dialog>: odak tuzagi ve Escape tarayicidan gelir (not kutusuyla ayni desen).
 */
export default function CalistirKutusu({ proje, neden, baslangic, onKapat, onKaydedildi }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const kutuRef = useRef<HTMLInputElement>(null);
  const [komut, setKomut] = useState('');
  const [hata, setHata] = useState<string | null>(null);

  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (proje && !d.open) {
      setKomut(baslangic);
      setHata(null);
      d.showModal();
      setTimeout(() => kutuRef.current?.select(), 0);
    } else if (!proje && d.open) {
      d.close();
    }
  }, [proje, baslangic]);

  const kaydet = async () => {
    if (!proje || !komut.trim()) return;
    const tamam = await window.kokpit.calistirKaydet(proje.yol, komut);
    if (!tamam) {
      setHata('Komut kaydedilemedi. Tek satır ve en fazla 500 karakter olmalı.');
      return;
    }
    onKaydedildi(komut.trim());
  };

  return (
    <dialog
      ref={dialogRef}
      onClose={onKapat}
      onCancel={(e) => {
        e.preventDefault();
        onKapat();
      }}
      aria-labelledby="calistir-baslik"
      className="halka m-auto w-[min(36rem,calc(100vw-2rem))] rounded-base bg-bg-base p-0 text-metin shadow-2xl shadow-black/60 backdrop:bg-black/50"
    >
      <form
        method="dialog"
        onSubmit={(e) => {
          e.preventDefault();
          void kaydet();
        }}
        className="bg-yuzey-guclu p-5"
      >
        <h2 id="calistir-baslik" className="flex items-center gap-2 text-sm font-medium">
          <Play className="size-4 text-metin-soluk" aria-hidden="true" />
          {proje?.ad} nasıl çalıştırılır?
        </h2>
        <p id="calistir-ipucu" className="mt-1.5 text-xs text-metin-ikincil">
          {neden ? neden + '. ' : ''}Uygulamayı açan komutu bir kez yaz; Kokpit bu projede hep onu kullanır. Komut
          proje klasöründe, ayrı bir bölmede çalışır.
        </p>
        <input
          ref={kutuRef}
          type="text"
          value={komut}
          onChange={(e) => setKomut(e.target.value)}
          placeholder="ör. uv run uvicorn app.main:app --port 8000"
          aria-label="Çalıştırma komutu"
          aria-describedby="calistir-ipucu"
          aria-invalid={hata ? true : undefined}
          maxLength={500}
          spellCheck={false}
          className="enstruman mt-3 w-full rounded-kontrol border border-kenar bg-terminal px-3 py-2 text-sm text-metin outline-none placeholder:text-metin-soluk focus-visible:border-aksan"
        />
        <div className="mt-2 flex items-center justify-between gap-3">
          <p className="enstruman truncate text-xs text-metin-soluk" title={proje?.yol}>
            ~/.kokpit/calistir.json
          </p>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={onKapat}
              className="cursor-pointer rounded-kontrol border border-kenar px-3 py-1.5 text-xs text-metin-ikincil transition-colors duration-[180ms] hover:border-kenar-guclu hover:text-metin"
            >
              Vazgeç
            </button>
            <button
              type="submit"
              disabled={!komut.trim()}
              className="cursor-pointer rounded-kontrol bg-birincil px-3 py-1.5 text-xs font-medium text-birincil-uzeri transition-colors duration-[180ms] hover:bg-metin-ikincil disabled:cursor-not-allowed disabled:opacity-50"
            >
              Kaydet ve çalıştır
            </button>
          </div>
        </div>
        {hata && (
          <p role="alert" className="mt-2 text-xs text-hata-metin">
            {hata}
          </p>
        )}
      </form>
    </dialog>
  );
}
