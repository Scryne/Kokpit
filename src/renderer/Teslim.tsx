import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpFromLine, FolderOpen, GitBranch, GitCommitHorizontal, GitFork, GitMerge, Globe, Lock, Moon, RefreshCw, Sparkles, TerminalSquare, Trash2, X } from 'lucide-react';
import type { ParalelAgac, Proje, TeslimDetayi, TeslimFarki } from './types';
import { sureMetni } from './parcalar';

// v3.2, Teslim sayfasi (Ctrl+6): disari cikmayi bekleyen her sey tek yerde. Solda push bekleyen ya da
// commit edilmemis degisikligi olan projeler (durum.py), sagda secilenin giden commit'leri, kirli dosyalari ve
// diff'i. Push her zaman onayli; public depoda once yayin kapisi (main, teslim.cjs). DESIGN.md: tablo, kart
// degil; mono = olculmus deger (hash, sayi, dal); renk yalniz sende olan sey (noreply olmayan e-posta, kapi).
// Diff satirlari boyanmaz: eklenen metin rengi + ince zemin, silinen soluk (etkinlik seridinin +/- kurali).

/** Noreply olmayan commit e-postasi public depoda kisisel veri sizdirir (Kurallar, 2026-09-27). */
const NOREPLY = /@users\.noreply\.github\.com$/i;

function canli(p: Proje) {
  const e = p.envanter ?? '';
  return !e || e.startsWith('🟢') || e.startsWith('✅');
}

export function teslimBekleyenler(projeler: Proje[]) {
  return projeler
    .filter((p) => p.git && ((p.git.ahead ?? 0) > 0 || p.git.kirli > 0))
    .sort((a, b) => Number(canli(b)) - Number(canli(a)) || (b.git!.ahead ?? 0) - (a.git!.ahead ?? 0) || b.git!.kirli - a.git!.kirli);
}

function onceMetni(ms: number | null, simdi: number) {
  if (!ms) return '—';
  return sureMetni(Math.max(0, Math.round((simdi - ms) / 1000))) + ' önce';
}

export default function Teslim({
  projeler,
  simdi,
  onTazele,
  onClaude,
  onAgacaGit,
  onGece,
  geceAktif,
}: {
  projeler: Proje[];
  simdi: number;
  onTazele: () => Promise<void>;
  /** Projede commit icin claude oturumu (gorev metniyle) acar. */
  onClaude: (p: Pick<Proje, 'ad' | 'yol'>, gorev: string) => void;
  /** Paralel agacin oturumuna gider (yoksa acar). */
  onAgacaGit: (a: ParalelAgac) => void;
  /** Gece vardiyasi kutusunu acar. */
  onGece: () => void;
  geceAktif: boolean;
}) {
  const liste = useMemo(() => teslimBekleyenler(projeler), [projeler]);
  const [secili, setSecili] = useState<string | null>(null);
  const [detay, setDetay] = useState<TeslimDetayi | null>(null);
  const [okunuyor, setOkunuyor] = useState(false);
  const [fark, setFark] = useState<{ baslik: string; f: TeslimFarki } | null>(null);
  const [pushDurumu, setPushDurumu] = useState<{ yol: string; metin: string; tamam: boolean | null } | null>(null);
  const [tazeleniyor, setTazeleniyor] = useState(false);
  // v3.2: paralel agaclar (Faz 54). Sayfa her acildiginda ve her eylemden sonra okunur.
  const [agaclar, setAgaclar] = useState<ParalelAgac[]>([]);
  const [agacSonucu, setAgacSonucu] = useState<{ yol: string; metin: string; tamam: boolean | null } | null>(null);
  const agaclariOku = useCallback(async () => setAgaclar(await window.kokpit.paralelListe()), []);
  useEffect(() => {
    void agaclariOku();
  }, [agaclariOku]);
  // Suren agac eylemi: ayni anda ikinci eylem (cift tik) baslamaz; dugmeler pasif.
  const [agacMesgul, setAgacMesgul] = useState<string | null>(null);
  const agacEylemi = async (a: ParalelAgac, tur: 'birlestir' | 'at') => {
    if (agacMesgul) return;
    setAgacMesgul(a.yol);
    setAgacSonucu({ yol: a.yol, metin: tur === 'birlestir' ? 'Birleştiriliyor…' : 'Siliniyor…', tamam: null });
    try {
      const r = tur === 'birlestir' ? await window.kokpit.paralelBirlestir(a.yol) : await window.kokpit.paralelAt(a.yol);
      setAgacSonucu({ yol: a.yol, metin: r.iptal ? 'Vazgeçildi.' : r.cikti || (r.tamam ? 'Tamam.' : 'Olmadı.'), tamam: r.iptal ? null : r.tamam });
      if (r.tamam) void onTazele();
    } catch (e) {
      setAgacSonucu({ yol: a.yol, metin: 'Olmadı: ' + (e as Error).message, tamam: false });
    } finally {
      setAgacMesgul(null);
      await agaclariOku();
    }
  };

  const seciliProje = liste.find((p) => p.yol === secili) ?? liste[0] ?? null;

  // Yalniz SON istenen projenin cevabi yazilir: A'dan B'ye gecerken A'nin gec gelen detayi B'nin basliginin altina
  // (ve B'ye push eden dugmenin yanina) dusmesin.
  const istenenYol = useRef<string | null>(null);
  const oku = useCallback(async (yol: string) => {
    istenenYol.current = yol;
    setOkunuyor(true);
    try {
      const d = await window.kokpit.teslimDetay(yol);
      if (istenenYol.current === yol) setDetay(d);
    } catch (e) {
      if (istenenYol.current === yol) setDetay({ hata: 'Okunamadı: ' + (e as Error).message });
    } finally {
      if (istenenYol.current === yol) setOkunuyor(false);
    }
  }, []);

  useEffect(() => {
    setFark(null);
    // Secim degisince eski projenin detayi hemen kalkar (yukleniyor gosterilir).
    setDetay(null);
    if (seciliProje) void oku(seciliProje.yol);
    // Yalniz secim degisince; liste her durum tazelemesinde yeniden kurulur.
  }, [seciliProje?.yol, oku]);

  const farkAc = async (baslik: string, istek: { commit: string } | { dosya: string }) => {
    if (!seciliProje) return;
    const yol = seciliProje.yol;
    setFark({ baslik, f: { metin: 'Okunuyor…', kesildi: false } });
    const f = await window.kokpit.teslimFark(yol, istek).catch((e: Error) => ({ hata: e.message }));
    // Bu arada baska projeye ya da baska diff'e gecildiyse yazilmaz.
    if (istenenYol.current === yol) setFark((eski) => (eski && eski.baslik === baslik ? { baslik, f } : eski));
  };

  const push = async () => {
    if (!seciliProje) return;
    setPushDurumu({ yol: seciliProje.yol, metin: 'Hazırlanıyor: yayın kapısı ve onay…', tamam: null });
    const r = await window.kokpit.teslimPush(seciliProje.yol);
    setPushDurumu({ yol: seciliProje.yol, metin: r.iptal ? 'Vazgeçildi.' : r.cikti || (r.tamam ? 'Push edildi.' : 'Push başarısız.'), tamam: r.iptal ? null : r.tamam });
    if (r.tamam) {
      await oku(seciliProje.yol);
      void onTazele();
    }
  };

  const d = detay && 'hata' in detay ? null : detay;
  const sahte = d ? d.commitler.filter((c) => d.gorunurluk !== 'private' && !NOREPLY.test(c.eposta)) : [];

  return (
    <div className="space-y-4">
      <section aria-label="Teslim özeti" className="halka relative flex flex-wrap items-center gap-x-8 gap-y-3 rounded-base bg-yuzey px-5 py-4">
        <div>
          <p className="etiket">Push bekleyen</p>
          <p className="enstruman mt-1 text-2xl leading-none text-metin">{liste.reduce((n, p) => n + (p.git?.ahead ?? 0), 0)}</p>
        </div>
        <div>
          <p className="etiket">Kirli proje</p>
          <p className="enstruman mt-1 text-2xl leading-none text-metin">{liste.filter((p) => (p.git?.kirli ?? 0) > 0).length}</p>
        </div>
        <p className="max-w-[46ch] text-xs text-metin-soluk">
          Push her zaman onay ister. Public depoda önce yayın kapısı (tüm geçmiş + çalışma ağacı) taranır.
        </p>
        <button
          type="button"
          onClick={onGece}
          className="ml-auto flex cursor-pointer items-center gap-1.5 rounded-kontrol border border-kenar px-2.5 py-1 text-xs text-metin-ikincil transition-colors duration-[120ms] hover:border-kenar-guclu hover:text-metin"
        >
          <Moon className="size-3.5" aria-hidden="true" />
          Gece vardiyası{geceAktif ? ' · açık' : ''}
        </button>
        <button
          type="button"
          disabled={tazeleniyor}
          onClick={() => {
            setTazeleniyor(true);
            void Promise.all([onTazele(), agaclariOku()])
              .then(() => seciliProje && oku(seciliProje.yol))
              .finally(() => setTazeleniyor(false));
          }}
          className="flex cursor-pointer items-center gap-1.5 rounded-kontrol border border-kenar px-2.5 py-1 text-xs text-metin-ikincil transition-colors duration-[120ms] hover:border-kenar-guclu hover:text-metin disabled:cursor-wait disabled:opacity-60"
        >
          <RefreshCw className={'size-3.5 ' + (tazeleniyor ? 'animate-spin motion-reduce:animate-none' : '')} aria-hidden="true" />
          {tazeleniyor ? 'Okunuyor' : 'Tazele'}
        </button>
      </section>

      {agaclar.length > 0 && (
        <section aria-label="Paralel dallar" data-paralel-dallar className="halka relative overflow-hidden rounded-base bg-yuzey">
          <p className="etiket flex items-center gap-2 border-b border-kenar px-4 py-2">
            <GitFork className="size-3.5 text-metin-soluk" aria-hidden="true" />
            Paralel dallar · {agaclar.length}
          </p>
          <table className="w-full text-sm">
            <tbody>
              {agaclar.map((a) => (
                <tr key={a.yol} data-agac={a.ad} className="border-b border-kenar align-top last:border-0">
                  <td className="px-4 py-2">
                    <span className="enstruman text-metin">{a.proje}</span>
                    <span className="enstruman text-metin-ikincil">/{a.ad}</span>
                    {a.gece && <span className="ml-2 text-xs text-metin-soluk">gece vardiyası</span>}
                    <span className="enstruman block text-xs text-metin-soluk">
                      {a.dal} ← {a.taban} · {onceMetni(a.olusturuldu, simdi)}
                    </span>
                    {agacSonucu?.yol === a.yol && (
                      <pre role="status" className={'enstruman mt-1 max-h-32 overflow-auto whitespace-pre-wrap text-xs ' + (agacSonucu.tamam === false ? 'text-hata-metin' : 'text-metin-ikincil')}>
                        {agacSonucu.metin}
                      </pre>
                    )}
                  </td>
                  <td className="enstruman whitespace-nowrap px-2 py-2 text-xs">
                    <span className="text-metin" title="Tabana göre yeni commit">{a.ileride} commit</span>
                    {a.dosya > 0 && (
                      <span className="block text-metin-soluk">
                        {a.dosya} dosya <span className="text-metin">+{a.arti}</span> −{a.eksi}
                      </span>
                    )}
                    {a.kirli > 0 && <span className="block text-dikkat-metin" title="Commit edilmemiş: birleştirmeden önce commit gerek">±{a.kirli} kirli</span>}
                    {a.geride > 0 && <span className="block text-metin-soluk" title="Taban dal bu arada ilerledi">taban ↑{a.geride}</span>}
                  </td>
                  <td className="px-4 py-2">
                    <span className="flex flex-wrap justify-end gap-1.5">
                      <button type="button" onClick={() => onAgacaGit(a)} title="Bu ağacın claude oturumu" className="flex cursor-pointer items-center gap-1 rounded-kontrol border border-kenar px-2 py-0.5 text-xs text-metin-ikincil hover:border-kenar-guclu hover:text-metin">
                        <TerminalSquare className="size-3.5" aria-hidden="true" /> Oturum
                      </button>
                      <button
                        type="button"
                        onClick={async () => setFark({ baslik: a.proje + '/' + a.ad + ': ' + a.taban + '...' + a.dal, f: await window.kokpit.paralelFark(a.yol) })}
                        className="cursor-pointer rounded-kontrol border border-kenar px-2 py-0.5 text-xs text-metin-ikincil hover:border-kenar-guclu hover:text-metin"
                      >
                        Diff
                      </button>
                      <button
                        type="button"
                        data-agac-birlestir
                        disabled={a.ileride === 0 || a.kirli > 0 || agacMesgul !== null}
                        title={a.kirli > 0 ? 'Önce commit edilmemiş değişiklikleri commit et' : a.ileride === 0 ? 'Birleştirilecek commit yok' : a.dal + ' → ' + a.taban + ' (--no-ff)'}
                        onClick={() => void agacEylemi(a, 'birlestir')}
                        className="flex cursor-pointer items-center gap-1 rounded-kontrol bg-birincil px-2.5 py-0.5 text-xs font-medium text-birincil-uzeri hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <GitMerge className="size-3.5" aria-hidden="true" /> Birleştir
                      </button>
                      <button
                        type="button"
                        data-agac-at
                        disabled={agacMesgul !== null}
                        onClick={() => void agacEylemi(a, 'at')}
                        aria-label={a.proje + '/' + a.ad + ' ağacını ve dalını sil'}
                        title="Ağacı ve dalı sil (onay ister)"
                        className="cursor-pointer rounded-kontrol border border-kenar p-1 text-metin-soluk hover:border-kenar-guclu hover:text-metin"
                      >
                        <Trash2 className="size-3.5" aria-hidden="true" />
                      </button>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {fark && agaclar.length > 0 && liste.length === 0 && <FarkGorunumu key={fark.baslik} baslik={fark.baslik} f={fark.f} onKapat={() => setFark(null)} />}

      {liste.length === 0 ? (
        <p className="text-sm text-metin-soluk">Teslim bekleyen bir şey yok: push bekleyen commit ya da commit edilmemiş değişiklik yok.</p>
      ) : (
        <div className="grid grid-cols-[17rem_minmax(0,1fr)] items-start gap-4">
          <nav aria-label="Teslim bekleyen projeler" className="halka relative overflow-hidden rounded-base bg-yuzey">
            <ul>
              {liste.map((p) => {
                const sec = p.yol === seciliProje?.yol;
                return (
                  <li key={p.yol} className="border-b border-kenar last:border-0">
                    <button
                      type="button"
                      data-teslim-proje={p.ad}
                      aria-current={sec ? 'true' : undefined}
                      onClick={() => {
                        setSecili(p.yol);
                        setPushDurumu(null);
                      }}
                      className={
                        'flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-sm transition-colors duration-[120ms] ' +
                        (sec ? 'bg-yuzey-guclu' : 'hover:bg-yuzey-guclu/60')
                      }
                    >
                      <span className={'enstruman min-w-0 flex-1 truncate ' + (canli(p) ? 'text-metin' : 'text-metin-soluk')}>{p.ad}</span>
                      {(p.git?.ahead ?? 0) > 0 && <span className="enstruman text-xs text-metin" title="Push bekleyen commit">↑{p.git!.ahead}</span>}
                      {(p.git?.kirli ?? 0) > 0 && <span className="enstruman text-xs text-metin-soluk" title="Commit edilmemiş dosya">±{p.git!.kirli}</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>

          <section aria-label={(seciliProje?.ad ?? '') + ' teslim ayrıntısı'} className="min-w-0 space-y-4">
            {okunuyor && !d && <p className="text-sm text-metin-soluk">Okunuyor…</p>}
            {detay && 'hata' in detay && <p role="status" className="text-sm text-hata-metin">Okunamadı: {detay.hata}</p>}
            {d && seciliProje && (
              <>
                <header className="halka relative flex flex-wrap items-center gap-x-4 gap-y-2 rounded-base bg-yuzey px-4 py-3">
                  <span className="enstruman text-base text-metin">{seciliProje.ad}</span>
                  <span className="enstruman flex items-center gap-1.5 text-xs text-metin-ikincil">
                    <GitBranch className="size-3.5 text-metin-soluk" aria-hidden="true" />
                    {d.dal ?? 'detached'}
                    <span className="text-metin-soluk">→ {d.uzak ?? (d.remote ? 'uzak dal yok' : 'yerel')}</span>
                    {d.geride > 0 && <span className="text-dikkat-metin" title="Uzakta yeni commit var; önce çek">↓{d.geride}</span>}
                  </span>
                  {d.github && (
                    <span className="enstruman flex items-center gap-1.5 text-xs text-metin-soluk" title={d.remote ?? undefined}>
                      {d.gorunurluk === 'private' ? <Lock className="size-3.5" aria-hidden="true" /> : <Globe className="size-3.5" aria-hidden="true" />}
                      {d.github.sahip}/{d.github.depo} · {d.gorunurluk === 'bilinmiyor' ? 'görünürlük bilinmiyor' : d.gorunurluk}
                    </span>
                  )}
                  <span className="ml-auto flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => void window.kokpit.klasorAc(seciliProje.yol)}
                      aria-label={seciliProje.ad + ' klasörünü aç'}
                      title="Klasörü aç"
                      className="cursor-pointer rounded-kontrol border border-kenar p-1.5 text-metin-soluk transition-colors duration-[120ms] hover:border-kenar-guclu hover:text-metin"
                    >
                      <FolderOpen className="size-3.5" aria-hidden="true" />
                    </button>
                    {d.dosyalar.length > 0 && (
                      <button
                        type="button"
                        onClick={() =>
                          onClaude(
                            seciliProje,
                            'Teslim: commit edilmemiş değişiklikleri (git status) incele ve anlamlı, küçük commit(ler) at. ' +
                              'Ilgisiz ya da yarım değişiklik varsa commit etme, bana söyle. Push ETME.'
                          )
                        }
                        title="Bu projede claude açılır ve değişiklikleri inceleyip commit eder (push etmez)"
                        className="flex cursor-pointer items-center gap-1.5 rounded-kontrol border border-kenar px-2.5 py-1 text-xs text-metin-ikincil transition-colors duration-[120ms] hover:border-kenar-guclu hover:text-metin"
                      >
                        <Sparkles className="size-3.5" aria-hidden="true" />
                        Claude commit etsin
                      </button>
                    )}
                    {(d.ileride > 0 || (!d.uzak && d.remote && d.commitler.length > 0)) && (
                      <button
                        type="button"
                        data-teslim-push
                        disabled={pushDurumu?.yol === seciliProje.yol && pushDurumu.tamam === null && pushDurumu.metin.startsWith('Hazırlanıyor')}
                        onClick={() => void push()}
                        className="flex cursor-pointer items-center gap-1.5 rounded-kontrol bg-birincil px-3 py-1 text-xs font-medium text-birincil-uzeri transition-opacity duration-[120ms] hover:opacity-90 disabled:cursor-wait disabled:opacity-60"
                      >
                        <ArrowUpFromLine className="size-3.5" aria-hidden="true" />
                        {d.uzak ? 'Push et' : 'Yayınla (yeni uzak dal)'}
                      </button>
                    )}
                  </span>
                </header>

                {pushDurumu?.yol === seciliProje.yol && (
                  <pre
                    role="status"
                    className={
                      'enstruman max-h-40 overflow-auto whitespace-pre-wrap rounded-base border px-3 py-2 text-xs ' +
                      (pushDurumu.tamam === false ? 'border-hata/40 bg-hata/10 text-hata-metin' : 'border-kenar bg-yuzey text-metin-ikincil')
                    }
                  >
                    {pushDurumu.metin}
                  </pre>
                )}

                {sahte.length > 0 && (
                  <p role="status" className="rounded-base border border-dikkat/30 bg-dikkat/10 px-4 py-2 text-xs text-metin">
                    {sahte.length} commit noreply olmayan e-postayla (<span className="enstruman">{[...new Set(sahte.map((c) => c.eposta))].join(', ')}</span>): public depoda
                    kişisel veri olarak yayılır.
                  </p>
                )}

                {d.commitler.length > 0 && (
                  <section aria-label="Commit'ler" className="halka relative overflow-hidden rounded-base bg-yuzey">
                    <p className="etiket border-b border-kenar px-4 py-2">{d.uzak ? 'Push bekleyen · ' + d.commitler.length : 'Son commit’ler (uzak dal yok)'}</p>
                    <table className="w-full text-sm">
                      <tbody>
                        {d.commitler.map((c) => (
                          <tr key={c.tam} className="border-b border-kenar last:border-0">
                            <td className="w-20 px-4 py-1.5">
                              <button
                                type="button"
                                onClick={() => void farkAc(c.kisa + ' ' + c.konu, { commit: c.tam })}
                                className="enstruman flex cursor-pointer items-center gap-1.5 text-xs text-metin-ikincil hover:text-metin"
                                aria-label={c.kisa + ' commit diff’ini aç'}
                              >
                                <GitCommitHorizontal className="size-3.5 text-metin-soluk" aria-hidden="true" />
                                {c.kisa}
                              </button>
                            </td>
                            <td className="w-full max-w-0 px-2 py-1.5">
                              <button type="button" onClick={() => void farkAc(c.kisa + ' ' + c.konu, { commit: c.tam })} className="block w-full cursor-pointer truncate text-left text-metin hover:underline" title={c.konu}>
                                {c.konu}
                              </button>
                            </td>
                            <td className={'enstruman whitespace-nowrap px-2 py-1.5 text-xs ' + (sahte.includes(c) ? 'text-dikkat-metin' : 'text-metin-soluk')} title={c.yazar + ' <' + c.eposta + '>'}>
                              {NOREPLY.test(c.eposta) ? 'noreply' : c.eposta}
                            </td>
                            <td className="enstruman whitespace-nowrap px-4 py-1.5 text-right text-xs text-metin-soluk">{onceMetni(c.zaman, simdi)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </section>
                )}

                {d.dosyalar.length > 0 && (
                  <section aria-label="Commit edilmemiş dosyalar" className="halka relative overflow-hidden rounded-base bg-yuzey">
                    <p className="etiket border-b border-kenar px-4 py-2">Commit edilmemiş · {d.dosyalar.length}</p>
                    <ul className="max-h-72 overflow-y-auto">
                      {d.dosyalar.map((f) => (
                        <li key={f.yol} className="border-b border-kenar last:border-0">
                          <button
                            type="button"
                            onClick={() => void farkAc(f.yol, { dosya: f.yol })}
                            className="flex w-full cursor-pointer items-center gap-3 px-4 py-1.5 text-left text-sm hover:bg-yuzey-guclu/60"
                          >
                            <span className="enstruman w-6 shrink-0 text-xs text-metin-soluk" title={DURUM_ADI[f.durum.trim()[0]] ?? f.durum}>
                              {f.durum.trim() || '?'}
                            </span>
                            <span className="enstruman min-w-0 flex-1 truncate text-metin" title={f.yol}>{f.yol}</span>
                            {f.arti !== null && (
                              <span className="enstruman shrink-0 text-xs">
                                <span className="text-metin">+{f.arti}</span> <span className="text-metin-soluk">−{f.eksi}</span>
                              </span>
                            )}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                {fark && <FarkGorunumu key={fark.baslik} baslik={fark.baslik} f={fark.f} onKapat={() => setFark(null)} />}
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

const DURUM_ADI: Record<string, string> = {
  M: 'Değişti',
  A: 'Eklendi',
  D: 'Silindi',
  R: 'Yeniden adlandırıldı',
  C: 'Kopyalandı',
  U: 'Çakışma',
  '?': 'İzlenmiyor (yeni)',
};

/** Diff: satir basina sinif. Boyama yok (DESIGN.md): eklenen metin + ince zemin, silinen soluk. */
export function FarkGorunumu({ baslik, f, onKapat }: { baslik: string; f: TeslimFarki; onKapat: () => void }) {
  // Buyuk diff (400 KB ~ 10 bin satir) satir basina bir dugum uretiyordu: once ilk 2.000 satir, istenirse tamami.
  const [hepsi, setHepsi] = useState(false);
  const tumu = 'hata' in f ? [] : f.metin.split('\n');
  const SINIR = 2000;
  const satirlar = hepsi ? tumu : tumu.slice(0, SINIR);
  return (
    <section aria-label={'Diff: ' + baslik} data-teslim-fark className="halka relative overflow-hidden rounded-base bg-terminal">
      <div className="flex items-center gap-2 border-b border-kenar bg-yuzey px-4 py-2">
        <span className="enstruman min-w-0 flex-1 truncate text-xs text-metin-ikincil" title={baslik}>{baslik}</span>
        {'kesildi' in f && f.kesildi && <span className="text-xs text-metin-soluk">400 KB'ta kesildi</span>}
        <button type="button" onClick={onKapat} aria-label="Diff'i kapat" className="cursor-pointer rounded p-0.5 text-metin-soluk hover:text-metin">
          <X className="size-3.5" aria-hidden="true" />
        </button>
      </div>
      {'hata' in f ? (
        <p className="px-4 py-3 text-sm text-hata-metin">{f.hata}</p>
      ) : (
        <pre className="enstruman max-h-[32rem] overflow-auto py-2 text-xs leading-relaxed">
          {satirlar.map((s, i) => (
            <div key={i} className={'whitespace-pre px-4 ' + satirSinifi(s)}>
              {s || ' '}
            </div>
          ))}
          {!hepsi && tumu.length > SINIR && (
            <button type="button" onClick={() => setHepsi(true)} className="mx-4 my-2 cursor-pointer rounded-kontrol border border-kenar px-2.5 py-1 font-sans text-xs text-metin-ikincil hover:border-kenar-guclu hover:text-metin">
              Kalan {(tumu.length - SINIR).toLocaleString('tr-TR')} satırı göster
            </button>
          )}
        </pre>
      )}
    </section>
  );
}

function satirSinifi(s: string) {
  if (s.startsWith('diff --git') || s.startsWith('yeni dosya:')) return 'mt-2 border-t border-kenar pt-2 text-metin';
  if (s.startsWith('+++') || s.startsWith('---') || s.startsWith('index ')) return 'text-metin-soluk';
  if (s.startsWith('@@')) return 'text-metin-ikincil';
  if (s.startsWith('+')) return 'bg-yuzey-guclu text-metin';
  if (s.startsWith('-')) return 'text-metin-soluk';
  return 'text-metin-ikincil';
}
