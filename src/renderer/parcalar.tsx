import {
  AlertTriangle,
  CheckCircle2,
  CircleOff,
  FileCheck2,
  GitBranch,
  Hammer,
  Lightbulb,
  Map as MapIcon,
  PauseCircle,
  ScanSearch,
  Snowflake,
  type LucideIcon,
} from 'lucide-react';
import type { BeyinKaydi, Proje } from './types';

/** Uzerinde calisilan asamalar, akisin sirasiyla. */
export const AKTIF_ASAMALAR = ['fikir', 'denetim', 'finalizasyon', 'roadmap', 'uygulama'];

export function aktifMi(p: Pick<Proje, 'asama'>) {
  return !!p.asama && AKTIF_ASAMALAR.includes(p.asama);
}

/**
 * Liste sirasi: once uzerinde calisilanlar (akista en ilerideki ustte: uygulama > roadmap >
 * ... > fikir), sonra tamamlananlar, sonra dondurulanlar, en sonda sistem disi. Esitlikte
 * son guncellenen / son commit'i yeni olan ustte. (Eskiden `tamamlandi` en ustteydi ve tek
 * aktif proje uc bitmis projenin altinda kaliyordu; tablo ise hic siralanmiyordu.)
 */
function siraAnahtari(p: Proje) {
  if (p.asama && AKTIF_ASAMALAR.includes(p.asama)) return AKTIF_ASAMALAR.length - AKTIF_ASAMALAR.indexOf(p.asama);
  if (p.asama === 'tamamlandi') return -1;
  if (p.asama) return -2; // donduruldu ve bilinmeyenler
  return -3; // sistem disi
}

export function projeSirala(projeler: Proje[]) {
  return [...projeler].sort(
    (a, b) =>
      siraAnahtari(b) - siraAnahtari(a) ||
      (b.guncellendi ?? '').localeCompare(a.guncellendi ?? '') ||
      (a.git?.son_commit_gun ?? 9999) - (b.git?.son_commit_gun ?? 9999) ||
      a.ad.localeCompare(b.ad, 'tr')
  );
}

export type ProjeGrubu = 'aktif' | 'kullanimda' | 'arsiv';

export const GRUP_BASLIK: Record<ProjeGrubu, string> = {
  aktif: 'Aktif',
  kullanimda: 'Kullanımda',
  arsiv: 'Arşiv',
};

/**
 * Proje-Envanteri.md durumu varsa o belirler (Scryne 09-29: eski projelere donulmez, "olduğu
 * gibi"): 🟢 aktif, ✅ kullanimda, geri kalan her sey (⏸️ ⛔ 🛑) arsiv. Envanterde yoksa
 * (yeni proje henuz eklenmediyse) state.json asamasi: akistaysa aktif, tamamlandiysa
 * kullanimda, gerisi arsiv.
 */
export function projeGrubu(p: Proje): ProjeGrubu {
  const e = p.envanter;
  if (e) {
    if (e.includes('🟢')) return 'aktif';
    if (e.includes('✅')) return 'kullanimda';
    return 'arsiv';
  }
  if (aktifMi(p)) return 'aktif';
  if (p.asama === 'tamamlandi') return 'kullanimda';
  return 'arsiv';
}

/** Gruplara ayrilmis, her grup kendi icinde `projeSirala` sirasinda. Bos grup donmez. */
export function projeGruplari(projeler: Proje[]) {
  const sirali = projeSirala(projeler);
  return (['aktif', 'kullanimda', 'arsiv'] as ProjeGrubu[])
    .map((grup) => ({ grup, projeler: sirali.filter((p) => projeGrubu(p) === grup) }))
    .filter((g) => g.projeler.length > 0);
}

/** Envanter hucresinin bas isaretinden sonraki metni ("⏸️ olduğu gibi — bitmedi" -> "olduğu gibi — bitmedi"). */
export function envanterMetni(e: string) {
  return e.replace(/^[^A-Za-zÇĞİÖŞÜçğıöşü0-9]+/, '').trim();
}

/** Token sayisi kisa: 369440 -> "369k", 1.2M. */
export function tokenMetni(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1_000) return Math.round(n / 1_000) + 'k';
  return String(n);
}

export const ASAMA_IKON: Record<string, LucideIcon> = {
  fikir: Lightbulb,
  denetim: ScanSearch,
  finalizasyon: FileCheck2,
  roadmap: MapIcon,
  uygulama: Hammer,
  tamamlandi: CheckCircle2,
  donduruldu: Snowflake,
};

/** Roadmap basliklarindaki Markdown isaretleri (`**`, `__`, `` ` ``) duz metin alanda gorunmesin. */
export function duzMetin(s: string) {
  return s.replace(/\*\*|__|`/g, '').trim();
}

/** Iki an arasindaki TAKVIM gunu farki (24 saat degil): dun 23:00 -> bugun 08:00 = "dün". */
export function takvimGunFarki(once: number, simdi: number) {
  const gun = (t: number) => {
    const d = new Date(t);
    return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86_400_000;
  };
  return Math.max(0, Math.round(gun(simdi) - gun(once)));
}

export function gunMetni(gun: number | null | undefined) {
  if (gun === null || gun === undefined) return null;
  if (gun === 0) return 'bugün';
  if (gun === 1) return 'dün';
  return gun + ' gün önce';
}

export function sureMetni(saniye: number) {
  if (saniye < 60) return saniye + ' sn';
  const dk = Math.floor(saniye / 60);
  if (dk < 60) return dk + ' dk';
  return Math.floor(dk / 60) + ' sa ' + (dk % 60) + ' dk';
}

/** Asama rozeti: ikon + metin. Renk tek basina anlam tasimaz (DESIGN.md). */
export function AsamaRozeti({ asama, yedek }: { asama: Proje['asama']; yedek?: string }) {
  // state.json yoksa envanter durumu ("olduğu gibi") "sistem dışı"ndan daha cok sey soyler.
  const Ikon = asama ? (ASAMA_IKON[asama] ?? CircleOff) : yedek ? PauseCircle : CircleOff;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-rozet border border-kenar px-2 py-1">
      <Ikon className="size-3.5 shrink-0 text-metin-soluk" aria-hidden="true" />
      <span className="text-xs whitespace-nowrap text-metin-ikincil">{asama ?? yedek ?? 'sistem dışı'}</span>
    </span>
  );
}

/** Git durumu. "Temiz"in rengi yoktur; sadece mudahale gerektiren sey isaretlenir. */
export function GitDurumu({ p }: { p: Proje }) {
  const g = p.git;
  if (!g) return null;
  return (
    <span className="inline-flex items-center gap-3 text-xs whitespace-nowrap">
      <span className="inline-flex items-center gap-1.5 text-metin-ikincil">
        <GitBranch className="size-3.5 shrink-0 text-metin-soluk" aria-hidden="true" />
        <span className="enstruman">{g.branch ?? '—'}</span>
      </span>
      {g.kirli > 0 ? (
        <span className="inline-flex items-center gap-1.5 text-dikkat-metin">
          <AlertTriangle className="size-3.5 shrink-0" aria-hidden="true" />
          <span className="enstruman">{g.kirli}</span>
          <span className="text-metin-ikincil">kirli</span>
        </span>
      ) : (
        <span className="text-metin-soluk">temiz</span>
      )}
    </span>
  );
}

/**
 * Roadmap ilerlemesi: sayi asil, olcek ikincil. Yuzde gosterilmez.
 * Faz basina bir isaret ancak sayilabilir oldugunda bilgi tasir; 32 faz 32 nokta
 * uretip serit haline geliyordu. Esigin ustunde tek olcum cubuguna dusuluyor.
 */
const ISARET_ESIGI = 12;

export function Ilerleme({ p }: { p: Proje }) {
  const r = p.roadmap;
  if (!r || r.toplam === 0) return <span className="text-xs text-metin-soluk">roadmap yok</span>;
  const oran = r.tamamlandi / r.toplam;
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap">
      <span className="enstruman text-sm text-metin">
        {r.tamamlandi}
        <span className="text-metin-soluk">/{r.toplam}</span>
      </span>
      {r.toplam <= ISARET_ESIGI ? (
        <span className="flex gap-0.5" aria-hidden="true">
          {Array.from({ length: r.toplam }, (_, i) => (
            <span
              key={i}
              className={
                'h-1 w-1.5 rounded-full ' + (i < r.tamamlandi ? 'bg-metin-ikincil' : 'bg-kenar')
              }
            />
          ))}
        </span>
      ) : (
        <span className="block h-1 w-14 overflow-hidden rounded-full bg-kenar" aria-hidden="true">
          <span
            className="block h-full rounded-full bg-metin-ikincil"
            style={{ width: Math.round(oran * 100) + '%' }}
          />
        </span>
      )}
    </span>
  );
}

/** Kapanan oturumun beyne dusme durumu: kisa metin + ton. Renk tek basina anlam tasimaz. */
export const BEYIN_KAYDI_METIN: Record<
  BeyinKaydi,
  { metin: string; sinif: string; aciklama: string }
> = {
  dustu: { metin: 'beyne düştü ✓', sinif: 'text-metin-ikincil', aciklama: 'Oturum günlüğe yazıldı.' },
  bekliyor: { metin: 'beyne düşüyor…', sinif: 'text-metin-soluk', aciklama: 'Flush çalışıyor ya da hook henüz tetiklenmedi.' },
  dusmedi: { metin: 'beyne düşmedi', sinif: 'text-dikkat-metin', aciklama: 'Flush hiç tetiklenmedi; Sağlık sayfasından geri doldur.' },
  bos: { metin: 'kısa oturum', sinif: 'text-metin-soluk', aciklama: 'Kalıcı değer bulunmadı; günlüğe girmedi, normal.' },
  hata: { metin: 'flush hatası', sinif: 'text-hata-metin', aciklama: 'Özetleme başarısız; beyin-doktor çalıştır.' },
  yok: { metin: 'transcript yok', sinif: 'text-metin-soluk', aciklama: 'claude bu oturumda hiç konuşma açmadı.' },
};

export function BeyinKaydiRozeti({ kaydi }: { kaydi: BeyinKaydi }) {
  const k = BEYIN_KAYDI_METIN[kaydi];
  return (
    <span className={'text-xs ' + k.sinif} title={k.aciklama}>
      {k.metin}
    </span>
  );
}

/** Panonun ust seridindeki tek olcum. Buyuk sayi mono, etiket kucuk. */
export function Olcum({
  etiket,
  deger,
  alt,
  vurgu = false,
}: {
  etiket: string;
  deger: string | number;
  alt?: string | null;
  vurgu?: boolean;
}) {
  return (
    <div className="halka relative rounded-base bg-yuzey px-4 py-3">
      <p className="etiket">{etiket}</p>
      <p
        className={
          'enstruman mt-1.5 text-2xl leading-none ' + (vurgu ? 'text-dikkat-metin' : 'text-metin')
        }
      >
        {deger}
      </p>
      {alt && <p className="mt-1.5 truncate text-xs text-metin-soluk">{alt}</p>}
    </div>
  );
}
