// durum.py --json semasi (Faz 0'da diskte dogrulandi).
// Bu tipler Kokpit'in veri sahibi olmadiginin bildirimi: kaynak durum.py, burasi ayna.

/**
 * state.json `asama` alani. durum.py degeri oldugu gibi aktarir; listede olmayan bir deger de
 * gelebilir (2026-09-25'te ScryneQuant 'donduruldu' ile geldi).
 */
export type Asama =
  | 'fikir' | 'denetim' | 'finalizasyon' | 'roadmap' | 'uygulama' | 'tamamlandi' | 'donduruldu'
  | (string & {}) | null;

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
  /** Proje-Envanteri.md durum hucresi ("🟢 aktif", "⏸️ olduğu gibi" ...); tabloda yoksa null. */
  envanter?: string | null;
}

/** Saglik nobeti (saglik.py yazar, durum.py yalniz okur): CI, Dependabot, AI modelleri. */
export interface NobetProjesi {
  ad: string;
  envanter?: string;
  repo?: string;
  ci?: { durum: string; dal?: string; son?: string; is?: string; url?: string; kac_gun?: number | null; neden?: string };
  dependabot?: { durum: string; acik?: Record<string, number> };
  modeller?: { saglayici: string; model: string; durum: string; neden?: string }[];
  alarmlar: string[];
}

export interface SaglikNobeti {
  ts: number;
  tarih: string;
  projeler: NobetProjesi[];
  alarmlar: string[];
}

/** Acik oturumun son turdaki bağlam buyuklugu (transcript'ten). */
export interface OturumBaglami {
  token: number;
  model: string;
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

export interface Envanter {
  global_skills: string[];
  vault_skills: string[];
  mcp_global: string[];
  mcp_proje: Record<string, string[]>;
  drift_kayitsiz: string[];
  drift_hayalet: string[];
}

export interface GunButcesi {
  yeni_girdi: number;
  cache_okuma: number;
  cikti: number;
  dusunme: number;
  mesaj: number;
}

export interface Butce {
  gunler: Record<string, GunButcesi>;
  tip: Record<string, GunButcesi>;
  oksuz: string[];
  hook_dizin: number;
  toplam_dizin: number;
  pencere_gun: number;
}

export interface Durum {
  olculdu: string;
  vault: string;
  projeler: Proje[];
  beyin: Beyin;
  envanter: Envanter;
  butce: Butce;
  /** Sağlık nöbetinin son koşusu; hiç koşmadıysa null/yok. */
  saglik?: SaglikNobeti | null;
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
  /** Geri yukleme / surdurme: `claude --resume <claude>` (kimlik yoksa `--continue`). */
  devam?: boolean;
  /** claude oturum kimligi (uuid): Kokpit verir (`--session-id`), defterde kalir (v2.3). */
  claude?: string;
  /** Guvenli cikis suruyor: claude'a cikis tuslari gitti, SessionEnd bekleniyor. */
  kapaniyor?: boolean;
  /**
   * Servis bolmesi (Calistir): claude degil, projenin kendi komutu (npm run dev...). Deftere,
   * ada'ya ve kapatma onayina girmez; kapaninca surec agaci oldurulur.
   */
  servis?: { komut: string; adres?: string };
}

export interface PtyBilgi {
  port: number;
  token: string;
}

export type PtyBilgiSonuc =
  | { bilgi: PtyBilgi; hata?: undefined }
  | { hata: string; bilgi?: undefined };

export type DefterOlayi =
  | { olay: 'acildi'; id: string; ad: string; yol: string; claude?: string }
  | { olay: 'kapandi'; id: string; kod?: number | null; sebep: 'kullanici' | 'kabuk' };

/** Onceki calismada acik kalmis oturum: geri yukleme teklifi. */
export interface OncekiOturum {
  ad: string;
  yol: string;
  baslangic: number;
  /** Varsa geri yukleme tam bu konusmayi acar (--resume). */
  claude?: string | null;
}

/** Kapanan oturumun beyne dusme durumu (electron/beyin.cjs). */
export type BeyinKaydi = 'dustu' | 'bekliyor' | 'dusmedi' | 'bos' | 'hata' | 'yok';

/** Kanca koprusunun kapanan oturum icin tuttugu ozet (defterde kalir). */
export interface OturumOzeti {
  turlar: number;
  araclar: number;
  dosya: number;
  arti: number;
  eksi: number;
}

export interface SonOturum {
  baslangic: number;
  bitis: number;
  sureSn: number;
  beyin: BeyinKaydi;
  ozet?: OturumOzeti | null;
  claude?: string | null;
  /** Konusma diskte var: `claude --resume` ile surdurulebilir. */
  surdurulebilir?: boolean;
}

export interface Ayarlar {
  kenarAcik: boolean;
  yaziBoyutu: number;
  arsivAcik: boolean;
  ada?: boolean;
}

// --- Kanca koprusu (electron/etkinlik.cjs ile ayni sekil) ---

export type EtkinlikDurumu = 'bosta' | 'calisiyor' | 'bekliyor' | 'bitti' | 'kapandi';

export interface EtkinlikAraci {
  ad: string;
  hedef: string;
  /** Alt ajanin araci (agent_id vardi). */
  alt: boolean;
  arti: number | null;
  eksi: number | null;
  basladi: number;
  /** null: arac hala calisiyor (PreToolUse geldi, PostToolUse gelmedi). */
  bitti: number | null;
}

/** AskUserQuestion'un sorulari (electron/etkinlik.cjs soruAyrintisi). */
export interface Soru {
  soru: string;
  baslik: string;
  secenekler: { etiket: string; aciklama: string }[];
}

export interface SoruAyrintisi {
  /** En fazla 4 soru, claude'un sirasiyla. */
  sorular: Soru[];
  coklu: boolean;
  soruSayisi: number;
  /** Hepsi tekli secim ve secenekli: Kokpit/ada'dan rakam tuslariyla cevaplanabilir. */
  cevaplanabilir: boolean;
}

/** Bir sorunun cevabi: secenegin sirasi ya da serbest metin ("Type something"). */
export type SoruCevabi = number | string;

/** Projenin uygulamasini acan komut (electron/calistir.cjs). */
export type CalistirTarifi =
  | { komut: string; kaynak: 'ayar' | 'package.json'; neden?: undefined }
  | { komut: null; neden: string; kaynak?: undefined; /** Proje Kokpit'in kendisi: sorulmaz. */ kendisi?: boolean };

/** Oturuma tek tikla gonderilen hazir mesaj (~/.kokpit/komutlar.json). */
export interface HizliKomut {
  ad: string;
  metin: string;
}

/**
 * Oturuma gonderme: duz mesaj ya da acik sorunun cevabi. `damga` sorunun kanca durumundaki
 * `degisti` ani: cevap gidene kadar soru degistiyse istek dusurulur (bayat cevap yok).
 */
export type GonderIstegi =
  | { id: string; tur: 'metin'; metin: string }
  | { id: string; tur: 'cevap'; cevaplar: SoruCevabi[]; damga: number };

export interface OturumEtkinligi {
  durum: EtkinlikDurumu;
  claudeOturumu: string | null;
  arac: EtkinlikAraci | null;
  soru: string | null;
  soruAyrinti?: SoruAyrintisi | null;
  /** Bitti iken turun son mesaji (Stop hook'unun last_assistant_message'i). */
  sonSoz?: string | null;
  /** `durum`un en son degistigi an ("ne zamandir bekliyor"). */
  durumZamani?: number;
  /** Acik sorunun dogdugu an; ada'dan cevabin damgasi. */
  soruZamani?: number | null;
  /** Calisan alt ajanlar (SubagentStart..SubagentStop). */
  altlar?: Record<string, { tur: string; t: number }>;
  turBasladi: number | null;
  sonTurSuresiMs: number | null;
  degisti: number;
  ozet: { araclar: number; dosyalar: string[]; arti: number; eksi: number; turlar: number };
  olaylar: { t: number; ad: string; hedef: string; alt: boolean; arti: number | null; eksi: number | null }[];
}

export interface Limit {
  yuzde: number;
  /** ms; claude'un verdigi sifirlanma ani. */
  sifirlanma: number | null;
}

export interface Limitler {
  besSaat: Limit | null;
  hafta: Limit | null;
  olculdu: number;
}

/** Statusline'dan gelen baglam: transcript yoklamasindan kesin ve aninda. */
export interface DurumSatiriBaglami {
  token: number;
  yuzde: number | null;
  boyut: number | null;
  model: string | null;
  olculdu: number;
}

export interface EtkinlikAnlik {
  oturumlar: Record<string, OturumEtkinligi>;
  baglamlar: Record<string, DurumSatiriBaglami>;
  limitler: Limitler | null;
}

export type EtkinlikSinyali = { id: string; sinyal: 'bitti' | 'bekliyor'; durum?: OturumEtkinligi };

/** Adaya giden oturum satiri (adlar ana pencerede yasar). */
export interface AdaOturumu {
  id: string;
  ad: string;
  baslangic: number | null;
  dikkat: boolean;
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
      /** Cok secenekli yerel diyalog; secilen dugmenin sirasi (son dugme = iptal). */
      sec: (secenek: {
        baslik?: string;
        mesaj: string;
        ayrinti?: string;
        dugmeler: string[];
      }) => Promise<number>;
      ayarGetir: () => Promise<Ayarlar>;
      ayarKaydet: (yama: Partial<Ayarlar>) => Promise<Ayarlar>;
      kapanisSorulunca: (cb: () => void) => () => void;
      kapanisAlindi: () => void;
      kapanisIptal: () => void;
      kapanisOnayla: () => void;
      defterOlay: (olay: DefterOlayi) => void;
      defterOncekiler: () => Promise<OncekiOturum[]>;
      defterSonlar: () => Promise<Record<string, SonOturum>>;
      notEkle: (metin: string, kaynak: string | null) => Promise<{ dosya?: string; hata?: string }>;
      notAcSorulunca: (cb: () => void) => () => void;
      oturumBaglami: (
        liste: { id: string; yol: string; baslangic: number; claude?: string }[]
      ) => Promise<Record<string, OturumBaglami | null>>;
      beyinDoldur: (session: string, proje: string) => Promise<{ sonuc: string; tamam: boolean }>;
      etkinlikAnlik: () => Promise<EtkinlikAnlik>;
      etkinlikDinle: (cb: (a: EtkinlikAnlik) => void) => () => void;
      sinyalDinle: (cb: (s: EtkinlikSinyali) => void) => () => void;
      adaListe: (liste: AdaOturumu[]) => void;
      adaAyar: (acik: boolean) => void;
      adaListeDinle: (cb: (l: AdaOturumu[]) => void) => () => void;
      adaFare: (icinde: boolean) => void;
      adaGit: (id: string) => void;
      oturumaGitDinle: (cb: (id: string) => void) => () => void;
      calistirTarif: (yol: string) => Promise<CalistirTarifi>;
      calistirKaydet: (yol: string, komut: string) => Promise<boolean>;
      komutlarGetir: () => Promise<HizliKomut[]>;
      komutlarDuzenle: () => Promise<boolean>;
      adaGonder: (istek: GonderIstegi) => void;
      adaOdak: (istek: boolean) => void;
      oturumaGonderDinle: (cb: (istek: GonderIstegi) => void) => () => void;
      adaGordum: (id: string) => void;
      oturumGordumDinle: (cb: (id: string) => void) => () => void;
      adaKlavyeDinle: (cb: (k: { anaOdakta: boolean }) => void) => () => void;
      pencereOdakDinle: (cb: (odakta: boolean) => void) => () => void;
    };
  }
}
