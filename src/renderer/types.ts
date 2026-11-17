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
   * Servis bolmesi (Calistir): claude degil, projenin kendi komutu (npm run dev...). Deftere
   * ve kapatma onayina girmez; kapaninca surec agaci oldurulur.
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
  /** Okuma sayfasinin temasi (v2.9); geri kalan Kokpit simdilik hep koyu. */
  okumaTema?: OkumaTema;
}

// --- Okuma sayfasi (electron/vault-okuyucu.cjs ile ayni sekil) ---

export type OkumaTema = 'koyu' | 'acik';
export type OkumaBolumu = 'akis' | 'companion' | 'gunluk' | 'bilgi' | 'projeler';

/** Ayarlar sayfasinin ic bolumleri (v3.2). */
export type AyarBolumu = 'saglayici' | 'gorunum' | 'komutlar';

export interface VaultNotu {
  /** Vault'a goreli, ileri egik cizgili yol. */
  yol: string;
  baslik: string;
  mtime: number;
  boyut: number;
  grup: string;
  okunmamis: boolean;
}

export type VaultOkuSonuc =
  | { yol: string; ham: string; mtime: number; baslik: string; okunmamis: boolean; hata?: undefined }
  | { hata: string };

export interface ProjeOturumu {
  tarih: string;
  saat: string;
  /** Oturumun yazildigi daily notu. */
  yol: string;
  /** Daily'deki baslik ("Oturum (11:15) — Kokpit"); okuyucu buna kaydirir. */
  baslik: string;
  baglam: string[];
  kararlar: string[];
  yapilacaklar: string[];
}

export interface ProjeOzeti {
  ad: string;
  envanter: string | null;
  klasor: string | null;
  sonOturum: ProjeOturumu | null;
  notlar: VaultNotu[];
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
  /** Hepsi tekli secim ve secenekli: rakam tuslariyla cevaplanabilir. */
  cevaplanabilir: boolean;
}

/** Projenin uygulamasini acan komut (electron/calistir.cjs). */
export type CalistirTarifi =
  | { komut: string; kaynak: 'ayar' | 'package.json'; neden?: undefined }
  | { komut: null; neden: string; kaynak?: undefined; /** Proje Kokpit'in kendisi: sorulmaz. */ kendisi?: boolean };

/** Oturuma tek tikla gonderilen hazir mesaj (~/.kokpit/komutlar.json). */
export interface HizliKomut {
  ad: string;
  metin: string;
}

/** Oturuma gonderme: duz mesaj, klavyeden yazilmis gibi PTY'ye gider. */
export interface GonderIstegi {
  id: string;
  tur: 'metin';
  metin: string;
}

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
  /** Acik sorunun dogdugu an; cevabin damgasi. */
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

/** Gece gorevi (electron/night.cjs): sekme basina durum, main yollar. */
export type NightTabState = 'working' | 'asked' | 'confirmed' | 'closed';
export interface NightView {
  /** Gece suruyor (bitmis ve kapanma bekleyen dahil): iptal dugmesi gorunur. */
  active: boolean;
  done: boolean;
  tabs: Record<string, NightTabState>;
}
export interface NightAction {
  type: 'ask' | 'nudge' | 'resume' | 'close';
  id: string;
  text?: string;
}
export interface NightResumeTab {
  ad: string;
  yol: string;
  claude: string | null;
}

/** Model saglayicisi (electron/saglayici.cjs). Anahtar renderer'a hic gelmez. */
export type SaglayiciKimligi = 'varsayilan' | 'anthropic' | 'opencode' | 'deepseek' | 'ozel';
export type Efor = 'varsayilan' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';
export interface SaglayiciGorunum {
  secili: SaglayiciKimligi;
  efor: Efor;
  anthropic: { anahtarVar: boolean };
  opencode: {
    baseUrl: string;
    anahtarVar: boolean;
    model: string;
    hafifModel: string;
    altModel: string;
    baglam: number;
  };
  deepseek: {
    baseUrl: string;
    anahtarVar: boolean;
    model: string;
    hafifModel: string;
    altModel: string;
    baglam: number;
  };
  ozel: {
    baseUrl: string;
    anahtarVar: boolean;
    model: string;
    hafifModel: string;
    altModel: string;
    baglam: number;
  };
}
/** Renderer yamasi: yalniz gonderilen alanlar degisir; anahtarSil anahtar'i siler. */
export interface SaglayiciYama {
  secili?: SaglayiciKimligi;
  efor?: Efor;
  /** Secili saglayicinin anahtarini siler (ust duzey kisayol). */
  anahtarSil?: boolean;
  anthropic?: { anahtar?: string; anahtarSil?: boolean };
  opencode?: {
    anahtar?: string;
    anahtarSil?: boolean;
    baseUrl?: string;
    model?: string;
    hafifModel?: string;
    altModel?: string;
    baglam?: number | null;
  };
  deepseek?: {
    anahtar?: string;
    anahtarSil?: boolean;
    baseUrl?: string;
    model?: string;
    hafifModel?: string;
    altModel?: string;
    baglam?: number | null;
  };
  ozel?: {
    anahtar?: string;
    anahtarSil?: boolean;
    baseUrl?: string;
    model?: string;
    hafifModel?: string;
    altModel?: string;
    baglam?: number | null;
  };
}
export interface SaglayiciKaydetSonucu {
  ok: boolean;
  gorunum: SaglayiciGorunum;
  hata?: string;
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
      saglayiciGetir: () => Promise<SaglayiciGorunum>;
      saglayiciKaydet: (yama: SaglayiciYama) => Promise<SaglayiciKaydetSonucu>;
      kapanisSorulunca: (cb: () => void) => () => void;
      kapanisAlindi: () => void;
      kapanisIptal: () => void;
      kapanisOnayla: () => void;
      defterOlay: (olay: DefterOlayi) => void;
      defterOncekiler: () => Promise<OncekiOturum[]>;
      defterSonlar: () => Promise<Record<string, SonOturum>>;
      notEkle: (metin: string, kaynak: string | null) => Promise<{ dosya?: string; hata?: string }>;
      notAcSorulunca: (cb: () => void) => () => void;
      vaultListe: (bolum: Exclude<OkumaBolumu, 'akis' | 'projeler'>) => Promise<VaultNotu[]>;
      vaultAkis: (n?: number) => Promise<VaultNotu[]>;
      vaultOku: (yol: string) => Promise<VaultOkuSonuc>;
      vaultCozumle: (hedef: string, kaynak: string | null) => Promise<{ yol: string; cipa: string | null } | null>;
      vaultProjeler: () => Promise<ProjeOzeti[]>;
      vaultOkundu: (yol: string, mtime: number) => Promise<boolean>;
      vaultHepsiOkundu: () => Promise<boolean>;
      vaultOkunmamis: () => Promise<number>;
      vaultTazele: () => Promise<void>;
      oturumBaglami: (
        liste: { id: string; yol: string; baslangic: number; claude?: string }[]
      ) => Promise<Record<string, OturumBaglami | null>>;
      beyinDoldur: (session: string, proje: string) => Promise<{ sonuc: string; tamam: boolean }>;
      etkinlikAnlik: () => Promise<EtkinlikAnlik>;
      etkinlikDinle: (cb: (a: EtkinlikAnlik) => void) => () => void;
      sinyalDinle: (cb: (s: EtkinlikSinyali) => void) => () => void;
      kimlikDinle: (cb: (k: { id: string; claude: string }) => void) => () => void;
      calistirTarif: (yol: string) => Promise<CalistirTarifi>;
      calistirKaydet: (yol: string, komut: string) => Promise<boolean>;
      komutlarGetir: () => Promise<HizliKomut[]>;
      komutlarDuzenle: () => Promise<boolean>;
      pencereOdakDinle: (cb: (odakta: boolean) => void) => () => void;
      nightToggle: (x: { id: string; on: boolean; name: string; claude?: string | null; resume?: boolean }) => void;
      nightCancel: () => void;
      nightResume: () => Promise<NightResumeTab[]>;
      nightStateListen: (cb: (v: NightView) => void) => () => void;
      nightActionListen: (cb: (a: NightAction) => void) => () => void;
    };
  }
}
