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

export interface Beyin {
  son_log: string | null;
  son_log_gun: number | null;
  derleyici_son_durum: string | null;
  islenmemis_loglar: string[];
  health_hata: string | null;
  health_yas_gun: number | null;
  makale: number;
  baglanti: number;
  threads: { baslik: string }[];
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

export interface PtyBilgi {
  port: number;
  token: string;
}

export type PtyBilgiSonuc =
  | { bilgi: PtyBilgi; hata?: undefined }
  | { hata: string; bilgi?: undefined };

declare global {
  interface Window {
    kokpit: {
      durumGetir: () => Promise<DurumSonuc>;
      logYolu: () => Promise<string>;
      klasorAc: (yol: string) => Promise<boolean>;
      ptyBilgi: () => Promise<PtyBilgiSonuc>;
    };
  }
}
