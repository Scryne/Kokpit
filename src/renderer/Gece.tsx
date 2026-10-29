import { useCallback, useEffect, useRef, useState } from 'react';
import { Moon, Play, Square, Trash2, X } from 'lucide-react';
import type { GeceGorevi, GeceVardiyasi, GonderIstegi, Oturum, Proje } from './types';
import { sureMetni } from './parcalar';

// v3.2, gece vardiyasi (electron/gece.cjs). Kosucu burada (ana pencere): oturumlari o acar, kanca halini o
// gorur. Her adimda main'e "ne yapilmali" sorulur (saf karar, test-ada), cevap sirayla uygulanir, kayit main'e
// yazilir. Gorev kendi paralel calisma agacinda acilir (Teslim'de birlestir/at). Vardiya surerken makine
// uyumaz (main: powerSaveBlocker), bitince Ada haber verir, sabah brifingi ozetler.

const ADIM_MS = 15_000;

function yeniKimlik() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

/** "01:30" -> bu andan sonraki ilk 01:30 (ms). */
export function sonrakiSaat(hhmm: string, simdi = Date.now()) {
  const [s, d] = hhmm.split(':').map(Number);
  const t = new Date(simdi);
  t.setHours(s, d, 0, 0);
  if (t.getTime() <= simdi) t.setDate(t.getDate() + 1);
  return t.getTime();
}

export function useGeceVardiyasi(o: {
  oturumlar: () => Oturum[];
  /** Yeni sekme (arka planda), kimligini doner. */
  sekmeAc: (p: Pick<Proje, 'ad' | 'yol'>, gorev: string) => string;
  gonder: (istek: GonderIstegi) => Promise<string | null>;
  yaz: (oturumId: string, veri: string) => boolean;
  /** v3.5: suresi dolan gorevin oturumunu guvenli kapatir (Esc'e cevap vermeyen claude kalmasin). */
  kapat: (oturumId: string) => void;
  /** v3.5: vardiya notlari Kokpit'in bildirim gecmisine de duser (Ada'nin hapi gecici). */
  not?: (metin: string) => void;
}) {
  const [gece, setGece] = useState<GeceVardiyasi | null>(null);
  const [durum, setDurum] = useState<string | null>(null);
  const geceRef = useRef(gece);
  geceRef.current = gece;
  const ortam = useRef(o);
  ortam.current = o;
  // Gece notu hem Ada'ya (main) hem Kokpit'in bildirim gecmisine.
  const geceNotu = (m: string) => {
    window.kokpit.geceNot(m);
    ortam.current.not?.(m);
  };

  useEffect(() => {
    void window.kokpit.geceOku().then(setGece);
  }, []);

  const kaydet = useCallback(async (v: GeceVardiyasi) => {
    // Ref de hemen guncellenir: ayni adimdaki sonraki yama render'i beklemeden en guncel kaydi gorur.
    geceRef.current = v;
    setGece(v); // iyimser: kutu hemen guncellenir
    const k = await window.kokpit.geceYaz(v);
    geceRef.current = k;
    setGece(k);
    return k;
  }, []);

  const guncelle = useCallback(
    async (degis: (v: GeceVardiyasi) => GeceVardiyasi) => {
      const v = geceRef.current ?? (await window.kokpit.geceOku());
      return kaydet(degis(v));
    },
    [kaydet]
  );

  const gorevGuncelle = (v: GeceVardiyasi, id: string, yama: Partial<GeceGorevi>): GeceVardiyasi => ({
    ...v,
    gorevler: v.gorevler.map((g) => (g.id === id ? { ...g, ...yama } : g)),
  });

  /**
   * Bir adim: kararlari al, uygula, kaydet. Her degisiklik o anki EN GUNCEL kayda yama olarak uygulanir (v3.5): adim
   * saniyeler suren await'ler icerir (git worktree add 120 sn'ye kadar); bu sirada basilan "Durdur" ya da Ada'nin
   * ekledigi gorev, adimin basta aldigi eski kopyayla ezilmesin.
   */
  const adim = useCallback(async () => {
    const oturumlar = ortam.current.oturumlar().map((x) => ({ id: x.id, durumu: x.durumu }));
    const eylemler = await window.kokpit.geceKarar(oturumlar);
    if (eylemler.length === 0) return;
    const guncel = async () => geceRef.current ?? (await window.kokpit.geceOku());
    const yamala = async (id: string, yama: Partial<GeceGorevi>) => kaydet(gorevGuncelle(await guncel(), id, yama));
    for (const e of eylemler) {
      if (e.tur === 'isaretle') {
        await yamala(e.id, { durum: e.durum, bitti: Date.now(), ...(e.neden ? { neden: e.neden } : {}), ...(e.ozet ? { ozet: e.ozet } : {}) });
        const g = (await guncel()).gorevler.find((x) => x.id === e.id);
        if (g) geceNotu('Gece: ' + g.proje + ' ' + (e.durum === 'bitti' ? 'bitti' : e.durum === 'takildi' ? 'takıldı' : e.durum === 'sure' ? 'süresi doldu' : 'açılamadı') + (e.neden ? ' (' + e.neden + ')' : ''));
      } else if (e.tur === 'cevapla') {
        const hata = await ortam.current.gonder(e.istek as GonderIstegi);
        const g = (await guncel()).gorevler.find((x) => x.id === e.id);
        await yamala(e.id, { cevaplanan: (g?.cevaplanan ?? 0) + 1, cevapDamga: e.istek.damga });
        if (hata) console.warn('[gece] cevap gitmedi: ' + hata);
      } else if (e.tur === 'kes') {
        ortam.current.yaz(e.oturumId, '\x1b');
      } else if (e.tur === 'kapat') {
        ortam.current.kapat(e.oturumId);
      } else if (e.tur === 'bekle') {
        setDurum(e.neden);
      } else if (e.tur === 'bitir') {
        const v = await guncel();
        const biten = v.gorevler.filter((g) => g.basladi && g.durum !== 'bekliyor');
        await kaydet({ ...v, aktif: false, son: Date.now(), baslaZamani: null });
        setDurum(null);
        geceNotu('Gece vardiyası bitti: ' + biten.filter((g) => g.durum === 'bitti').length + '/' + biten.length + ' görev tamam (' + e.neden + ')');
      } else if (e.tur === 'baslat') {
        // Karar alindiktan sonra vardiya durdurulduysa yeni gozetimsiz oturum acilmaz.
        if (!(await guncel()).aktif) return;
        const g = (await guncel()).gorevler.find((x) => x.id === e.id && x.durum === 'bekliyor');
        if (!g) continue;
        setDurum(null);
        const r = await window.kokpit.paralelAc(g.projeYol, 'gece');
        if ('hata' in r) {
          await yamala(g.id, { durum: 'hata', basladi: Date.now(), bitti: Date.now(), neden: r.hata });
          continue;
        }
        // Agac acildi: gorev hemen "calisiyor" olarak yazilir. Sonraki adim hata verirse sonraki tikte ayni gorev icin
        // ikinci agac (ve ikinci gozetimsiz claude) acilmasin.
        await yamala(g.id, { durum: 'calisiyor', basladi: Date.now(), agacYol: r.kayit.yol, agacAd: r.kayit.ad });
        try {
          const istem = await window.kokpit.geceIstem(g.metin, r.kayit.dal);
          if (!(await guncel()).aktif) {
            await yamala(g.id, { durum: 'iptal', bitti: Date.now(), neden: 'vardiya durduruldu' });
            return;
          }
          const id = ortam.current.sekmeAc({ ad: g.proje + '/' + r.kayit.ad, yol: r.kayit.yol }, istem);
          await yamala(g.id, { oturumId: id });
          geceNotu('Gece: ' + g.proje + ' başladı (' + r.kayit.dal + ')');
        } catch (h) {
          await yamala(g.id, { durum: 'hata', bitti: Date.now(), neden: 'oturum açılamadı: ' + (h as Error).message });
        }
      }
    }
  }, [kaydet]);

  // Kosucu: vardiya aktifken ADIM_MS'de bir. Makine uykusu main'de engellenir.
  const aktif = gece?.aktif === true;
  useEffect(() => {
    window.kokpit.geceUyanik(aktif);
    if (!aktif) return;
    let mesgul = false;
    const tik = async () => {
      if (mesgul) return;
      mesgul = true;
      try {
        await adim();
      } catch (e) {
        console.warn('[gece] adim: ' + (e as Error).message);
      } finally {
        mesgul = false;
      }
    };
    void tik();
    const t = setInterval(() => void tik(), ADIM_MS);
    return () => clearInterval(t);
  }, [aktif, adim]);

  return { gece, durum, guncelle };
}

const DURUM_ADI: Record<GeceGorevi['durum'], string> = {
  bekliyor: 'sırada',
  calisiyor: 'çalışıyor',
  bitti: 'bitti',
  takildi: 'takıldı',
  sure: 'süre doldu',
  hata: 'açılamadı',
  iptal: 'iptal',
};

/** Gece vardiyasi kutusu: kuyruk, baslangic saati, baslat/durdur. Yerel <dialog> (not kutusuyla ayni desen). */
export function GeceKutusu({
  acik,
  onKapat,
  gece,
  durum,
  guncelle,
  projeler,
  simdi,
}: {
  acik: boolean;
  onKapat: () => void;
  gece: GeceVardiyasi | null;
  durum: string | null;
  guncelle: (degis: (v: GeceVardiyasi) => GeceVardiyasi) => Promise<GeceVardiyasi>;
  projeler: Pick<Proje, 'ad' | 'yol'>[];
  simdi: number;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [proje, setProje] = useState('');
  const [metin, setMetin] = useState('');
  const [saat, setSaat] = useState('01:00');
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (acik && !d.open) d.showModal();
    else if (!acik && d.open) d.close();
  }, [acik]);
  useEffect(() => {
    if (!proje && projeler[0]) setProje(projeler[0].yol);
  }, [projeler, proje]);
  useEffect(() => {
    if (gece?.baslangic) setSaat(gece.baslangic);
  }, [gece?.baslangic]);

  const gorevler = gece?.gorevler ?? [];
  const sirada = gorevler.filter((g) => g.durum === 'bekliyor').length;
  const ekle = async () => {
    const p = projeler.find((x) => x.yol === proje);
    if (!p || !metin.trim()) return;
    await guncelle((v) => ({ ...v, gorevler: [...v.gorevler, { id: yeniKimlik(), proje: p.ad, projeYol: p.yol, metin: metin.trim().slice(0, 3000), durum: 'bekliyor' }] }));
    setMetin('');
  };

  return (
    <dialog
      ref={ref}
      onClose={onKapat}
      aria-labelledby="gece-baslik"
      data-gece-kutusu
      className="halka m-auto w-[min(44rem,calc(100vw-2rem))] rounded-base bg-bg-base p-0 text-metin backdrop:bg-black/50"
    >
      <div className="space-y-4 bg-yuzey-guclu p-5">
        <div className="flex items-center gap-2">
          <Moon className="size-4 text-metin-ikincil" aria-hidden="true" />
          <h2 id="gece-baslik" className="text-sm font-medium">Gece vardiyası</h2>
          {gece?.aktif && (
            <span className="enstruman text-xs text-metin-ikincil">
              {gece.baslaZamani && gece.baslaZamani > simdi
                ? 'başlıyor: ' + new Date(gece.baslaZamani).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
                : 'çalışıyor' + (durum ? ' · ' + durum : '')}
            </span>
          )}
          <button type="button" onClick={onKapat} aria-label="Kapat" className="ml-auto cursor-pointer rounded p-1 text-metin-soluk hover:text-metin">
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
        <p className="text-xs leading-relaxed text-metin-soluk">
          Görevler sırayla, her biri kendi paralel dalında çalışır. Soru gelirse önerilen seçenek seçilir; takılan görev atlanır;
          limit dolarsa beklenir. Push, silme ve dışarı mesaj yasak. Sonuçlar sabah brifingde ve Teslim sayfasında.
        </p>

        <ol aria-label="Gece görevleri" className="max-h-72 space-y-1.5 overflow-y-auto">
          {gorevler.length === 0 && <li className="text-sm text-metin-soluk">Sıra boş.</li>}
          {gorevler.map((g, i) => (
            <li key={g.id} data-gece-gorev={g.durum} className="flex items-start gap-3 rounded-kontrol border border-kenar px-3 py-2 text-sm">
              <span className="enstruman w-5 shrink-0 text-xs text-metin-soluk">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <p className="flex items-baseline gap-2">
                  <span className="enstruman text-metin">{g.proje}</span>
                  <span className={'text-xs ' + (g.durum === 'takildi' || g.durum === 'hata' || g.durum === 'sure' ? 'text-dikkat-metin' : 'text-metin-soluk')}>
                    {DURUM_ADI[g.durum]}
                    {g.basladi && (g.durum === 'calisiyor' ? ' · ' + sureMetni(Math.floor((simdi - g.basladi) / 1000)) : g.bitti ? ' · ' + sureMetni(Math.floor((g.bitti - g.basladi) / 1000)) : '')}
                    {g.agacAd ? ' · ' + g.agacAd : ''}
                  </span>
                </p>
                <p className="line-clamp-2 text-metin-ikincil" title={g.metin}>{g.metin}</p>
                {g.neden && <p className="text-xs text-dikkat-metin">{g.neden}</p>}
                {g.ozet && <p className="mt-1 line-clamp-3 whitespace-pre-line text-xs text-metin-soluk" title={g.ozet}>{g.ozet}</p>}
              </div>
              {g.durum === 'bekliyor' && (
                <button
                  type="button"
                  onClick={() => void guncelle((v) => ({ ...v, gorevler: v.gorevler.filter((x) => x.id !== g.id) }))}
                  aria-label={g.proje + ' görevini sıradan çıkar'}
                  className="cursor-pointer rounded p-1 text-metin-soluk hover:text-metin"
                >
                  <Trash2 className="size-3.5" aria-hidden="true" />
                </button>
              )}
            </li>
          ))}
        </ol>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void ekle();
          }}
          className="space-y-2"
        >
          <div className="flex gap-2">
            <select value={proje} onChange={(e) => setProje(e.target.value)} aria-label="Proje" className="enstruman rounded-kontrol border border-kenar bg-yuzey px-2 py-1.5 text-sm text-metin">
              {projeler.map((p) => (
                <option key={p.yol} value={p.yol}>
                  {p.ad}
                </option>
              ))}
            </select>
            <button type="submit" disabled={!metin.trim()} className="ml-auto cursor-pointer rounded-kontrol border border-kenar px-3 py-1.5 text-sm text-metin-ikincil hover:border-kenar-guclu hover:text-metin disabled:cursor-not-allowed disabled:opacity-50">
              Sıraya ekle
            </button>
          </div>
          <textarea
            value={metin}
            onChange={(e) => setMetin(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                void ekle();
              }
            }}
            rows={3}
            placeholder="Görev: ne yapılsın? (örn. Teslim sayfasına test yaz, eksik kenar durumlarını kapat)"
            aria-label="Gece görevi"
            className="halka w-full resize-y rounded-kontrol border border-kenar bg-terminal/60 px-3 py-2 text-sm text-metin placeholder:text-metin-soluk"
          />
        </form>

        <div className="flex flex-wrap items-center gap-3 border-t border-kenar pt-4">
          <label className="flex items-center gap-2 text-sm text-metin-ikincil">
            Başlangıç
            <input type="time" value={saat} onChange={(e) => setSaat(e.target.value)} className="enstruman rounded-kontrol border border-kenar bg-yuzey px-2 py-1 text-sm text-metin" />
          </label>
          <span className="enstruman text-xs text-metin-soluk">{sirada} görev sırada</span>
          {gece?.aktif ? (
            <button
              type="button"
              onClick={() => void guncelle((v) => ({ ...v, aktif: false, baslaZamani: null }))}
              className="ml-auto flex cursor-pointer items-center gap-1.5 rounded-kontrol border border-kenar px-3 py-1.5 text-sm text-metin hover:border-kenar-guclu"
            >
              <Square className="size-3.5" aria-hidden="true" />
              Vardiyayı durdur
            </button>
          ) : (
            <span className="ml-auto flex gap-2">
              <button
                type="button"
                disabled={sirada === 0}
                onClick={() => void guncelle((v) => ({ ...v, aktif: true, baslangic: null, baslaZamani: null }))}
                className="cursor-pointer rounded-kontrol border border-kenar px-3 py-1.5 text-sm text-metin-ikincil hover:border-kenar-guclu hover:text-metin disabled:cursor-not-allowed disabled:opacity-50"
              >
                Şimdi başlat
              </button>
              <button
                type="button"
                data-gece-baslat
                disabled={sirada === 0 || !/^\d{2}:\d{2}$/.test(saat)}
                onClick={() => void guncelle((v) => ({ ...v, aktif: true, baslangic: saat, baslaZamani: sonrakiSaat(saat) }))}
                className="flex cursor-pointer items-center gap-1.5 rounded-kontrol bg-birincil px-3 py-1.5 text-sm font-medium text-birincil-uzeri hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Play className="size-3.5" aria-hidden="true" />
                Başlat ({saat})
              </button>
            </span>
          )}
        </div>
      </div>
    </dialog>
  );
}
