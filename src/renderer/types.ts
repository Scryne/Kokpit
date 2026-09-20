// durum.py --json semasi (Faz 0'da diskte dogrulandi).
// Bu tipler Kokpit'in veri sahibi olmadiginin bildirimi: kaynak durum.py, burasi ayna.

export type Asama =
  | 'fikir' | 'denetim' | 'finalizasyon' | 'roadmap' | 'uygulama' | 'tamamlandi' | null;

export interface RoadmapSirada {
  no: string;
  ad: string;
  durum: string;
}

export interface Roadmap {
  dosya: string | null;
  toplam: number;
  tamamlandi: number;
  devam: number;
  bekleyen: number;
  sirada: RoadmapSirada | null;
}

export interface GitDurum {
  branch: string | null;
  kirli: number;
  upstream: string | null;
  ahead: number | null;
  behind: number | null;
  son_commit_gun: number | null;
  son_commit: string | null;
}

export interface Proje {
  ad: string;
  yol: string;
  sistemde: boolean;
  asama: Asama;
  guncellendi: string | null;
  roadmap: Roadmap | null;
  git: GitDurum | null;
  design: string | null;
  skills: string[];
}

/** Beyne dusmemis bir oturum (durum.py beyin.kapsama.dusmemis). */
export interface DusmemisOturum {
  proje: string;
  session: string;
  gun: string | null;
  mesaj: number;
  flush: string;
}

export interface Kapsama {
  pencere_gun: number;
  toplam: number;
  dusmemis: DusmemisOturum[];
  son_vault_oturumu_gun: number | null;
}

export interface Beyin {
  son_log: string | null;
  son_log_gun: number | null;
  log_sayisi?: number;
  derleyici_son_durum: string | null;
  islenmemis_loglar: string[];
  health_hata: string | null;
  health_bilesen?: string | null;
  health_yas_gun: number | null;
  makale: number;
  baglanti: number;
  threads: { baslik: string; durum?: string; isaret?: string }[];
  /** 2026-09-21'den itibaren durum.py veriyor; eski surumde yok. */
  kapsama?: Kapsama;
}

export interface Durum {
  olculdu: string;
  vault: string;
  projeler: Proje[];
  beyin: Beyin;
  envanter: Record<string, unknown>;
  butce: Record<string, unknown>;
}

export type DurumSonuc =
  | { veri: Durum; hata?: undefined }
  | { hata: string; stderr?: string; ham?: string; veri?: undefined };

export type OturumDurumu = 'baglaniyor' | 'acik' | 'bitti' | 'hata';

/**
 * Bir terminal oturumu = bir PTY = bir bolme (pane).
 * App seviyesinde yasar; gorunum degisince UNMOUNT EDILMEZ.
 * `grupId` ayni sekmede yan yana duran bolmeleri birbirine baglar,
 * `oran` o grup icindeki genislik payidir (toplami 1 olmak zorunda degil, normalize edilir).
 */
export interface Oturum {
  id: string;
  ad: string;
  yol: string;
  durumu: OturumDurumu;
  mesaj?: string;
  baslangic: number;
  grupId: string;
  oran: number;
  /** Zil caldi ve kullanici o sirada bakmiyordu: claude bitti ya da soru soruyor. */
  dikkat?: boolean;
  /** Geri yukleme: `claude --continue` ile acilir (onceki calismadan kalan oturum). */
  devam?: boolean;
}

export interface PtyBilgi {
  port: number;
  token: string;
}

export type PtyBilgiSonuc =
  | { bilgi: PtyBilgi; hata?: undefined }
  | { hata: string; bilgi?: undefined };

export type DefterOlayi =
  | { olay: 'acildi'; id: string; ad: string; yol: string }
  | { olay: 'kapandi'; id: string; kod?: number | null; sebep: 'kullanici' | 'kabuk' };

/** Onceki calismada acik kalmis oturum: geri yukleme teklifi. */
export interface OncekiOturum {
  ad: string;
  yol: string;
  baslangic: number;
}

/** Kapanan oturumun beyne dusme durumu (electron/beyin.cjs). */
export type BeyinKaydi = 'dustu' | 'bekliyor' | 'dusmedi' | 'bos' | 'hata' | 'yok';

export interface SonOturum {
  baslangic: number;
  bitis: number;
  sureSn: number;
  beyin: BeyinKaydi;
}

export interface Ayarlar {
  kenarAcik: boolean;
  yaziBoyutu: number;
}

declare global {
  interface Window {
    kokpit: {
      durumGetir: () => Promise<DurumSonuc>;
      logYolu: () => Promise<string>;
      klasorAc: (yol: string) => Promise<boolean>;
      ptyBilgi: () => Promise<PtyBilgiSonuc>;
      dosyaYolu: (dosya: File) => string;
      linkAc: (url: string) => Promise<boolean>;
      pencereOdakla: () => Promise<void>;
      onayla: (secenek: {
        baslik?: string;
        mesaj: string;
        ayrinti?: string;
        onayla?: string;
      }) => Promise<boolean>;
      ayarGetir: () => Promise<Ayarlar>;
      ayarKaydet: (yama: Partial<Ayarlar>) => Promise<Ayarlar>;
      kapanisSorulunca: (cb: () => void) => () => void;
      kapanisOnayla: () => void;
      defterOlay: (olay: DefterOlayi) => void;
      defterOncekiler: () => Promise<OncekiOturum[]>;
      defterSonlar: () => Promise<Record<string, SonOturum>>;
      notEkle: (metin: string, kaynak: string | null) => Promise<{ dosya?: string; hata?: string }>;
    };
  }
}
