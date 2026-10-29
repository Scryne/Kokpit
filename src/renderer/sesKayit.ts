// v3.1, Ada'nin kulagi: mikrofon -> 16 kHz mono PCM -> WAV (whisper'in istedigi bicim; ffmpeg gerekmez).
// Konusma bitince kendiliginden durur: ilk 300 ms ortamin gurultusunu olcer, esigin ustu "konusuyor",
// konustuktan sonra SESSIZLIK_MS boyunca esik alti "bitti". Hic konusulmazsa vazgecer (bos kayit gitmez).

const SESSIZLIK_MS = 1400;
const AZAMI_MS = 30_000;
const SESSIZ_BASLANGIC_MS = 7000;
const TABAN_MS = 300;
const ORNEK_HIZI = 16000;

export type Kayit = { durdur: () => void; iptal: () => void };

function wavYap(parcalar: Float32Array[], hiz: number): ArrayBuffer {
  const n = parcalar.reduce((t, p) => t + p.length, 0);
  const tampon = new ArrayBuffer(44 + n * 2);
  const v = new DataView(tampon);
  const yaz = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i));
  };
  yaz(0, 'RIFF');
  v.setUint32(4, 36 + n * 2, true);
  yaz(8, 'WAVE');
  yaz(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, hiz, true);
  v.setUint32(28, hiz * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  yaz(36, 'data');
  v.setUint32(40, n * 2, true);
  let o = 44;
  for (const p of parcalar) {
    for (let i = 0; i < p.length; i++, o += 2) {
      const s = Math.max(-1, Math.min(1, p[i]));
      v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    }
  }
  return tampon;
}

/**
 * Kaydi baslatir. `bitti` bir kez cagrilir: konusma varsa WAV, yoksa (iptal ya da sessizlik) null.
 * @throws mikrofon acilamazsa (izin yok, aygit yok)
 */
export async function kayitBaslat(cb: { seviye: (s: number) => void; bitti: (wav: ArrayBuffer | null) => void }): Promise<Kayit> {
  const akis = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  });
  const ctx = new AudioContext({ sampleRate: ORNEK_HIZI });
  const kaynak = ctx.createMediaStreamSource(akis);
  // ScriptProcessor eskidi ama AudioWorklet modulu CSP'de ayri bir betik kaynagi isterdi; 2048 ornek
  // (128 ms) seviye gostergesi ve sessizlik icin yeterli.
  const islem = ctx.createScriptProcessor(2048, 1, 1);
  const parcalar: Float32Array[] = [];
  const t0 = performance.now();
  let sonSes = 0;
  let konustu = false;
  let taban = 0;
  let tabanN = 0;
  let bitti = false;

  const kapat = (gonder: boolean) => {
    if (bitti) return;
    bitti = true;
    islem.onaudioprocess = null;
    islem.disconnect();
    kaynak.disconnect();
    akis.getTracks().forEach((t) => t.stop());
    void ctx.close();
    cb.seviye(0);
    cb.bitti(gonder && konustu ? wavYap(parcalar, ctx.sampleRate) : null);
  };

  islem.onaudioprocess = (ev) => {
    if (bitti) return;
    const veri = new Float32Array(ev.inputBuffer.getChannelData(0));
    parcalar.push(veri);
    let t = 0;
    for (let i = 0; i < veri.length; i++) t += veri[i] * veri[i];
    const rms = Math.sqrt(t / veri.length);
    const gecen = performance.now() - t0;
    if (gecen < TABAN_MS) {
      taban += rms;
      tabanN++;
    }
    // Esik: ortam gurultusunun 3 kati, 0,015-0,06 arasi (hemen konusmaya baslayan da kesilmesin).
    const esik = Math.min(0.06, Math.max(0.015, (tabanN ? taban / tabanN : 0) * 3));
    if (rms > esik) {
      konustu = true;
      sonSes = gecen;
    }
    cb.seviye(Math.min(1, rms / 0.12));
    if (konustu && gecen - sonSes > SESSIZLIK_MS) kapat(true);
    else if (!konustu && gecen > SESSIZ_BASLANGIC_MS) kapat(false);
    else if (gecen > AZAMI_MS) kapat(true);
  };
  kaynak.connect(islem);
  islem.connect(ctx.destination);
  return { durdur: () => kapat(true), iptal: () => kapat(false) };
}

// --- v3.2: eller serbest ("Ada, ...") ---
// Mikrofon surekli acik, ama metne yalniz KISA konusma parcalari gider: ortam gurultusunun uzerinde baslayip
// SEGMENT_SESSIZLIK_MS sessizlikle biten, UYANMA_EN_AZ..UYANMA_AZAMI_MS uzunlugunda parca. Video/muzik gibi
// kesintisiz ses azami sureyi asar ve atilir (GPU'ya hic gitmez). Parca main'de whisper'a gider; "Ada" ile
// baslamiyorsa metin hicbir yere yazilmaz (log dahil). Gurultu tabani kayan ortalamayla izlenir.
const SEGMENT_SESSIZLIK_MS = 700;
const UYANMA_EN_AZ_MS = 350;
const UYANMA_AZAMI_MS = 6500;
const ON_TAMPON = 3; // konusmanin basi kesilmesin: esikten onceki 3 blok (~380 ms) parcaya katilir

export type UyanmaDinleyici = { durdur: () => void; duraklat: (d: boolean) => void };

export async function uyanmaBaslat(cb: { parca: (wav: ArrayBuffer) => void }): Promise<UyanmaDinleyici> {
  const akis = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  });
  const ctx = new AudioContext({ sampleRate: ORNEK_HIZI });
  const kaynak = ctx.createMediaStreamSource(akis);
  const islem = ctx.createScriptProcessor(2048, 1, 1);
  const blokMs = (2048 / ctx.sampleRate) * 1000;
  let taban = 0.01;
  let duraklat = false;
  let bitti = false;
  let parcalar: Float32Array[] = [];
  const once: Float32Array[] = [];
  let konusuyor = false;
  let sure = 0;
  let sessiz = 0;
  let asti = false;

  islem.onaudioprocess = (ev) => {
    if (bitti || duraklat) return;
    const veri = new Float32Array(ev.inputBuffer.getChannelData(0));
    let t = 0;
    for (let i = 0; i < veri.length; i++) t += veri[i] * veri[i];
    const rms = Math.sqrt(t / veri.length);
    const esik = Math.min(0.08, Math.max(0.02, taban * 3.2));
    if (!konusuyor) {
      // Taban yalniz sessizken guncellenir (yavas: ~5 sn).
      taban = taban * 0.97 + rms * 0.03;
      once.push(veri);
      if (once.length > ON_TAMPON) once.shift();
      if (rms > esik) {
        konusuyor = true;
        parcalar = [...once];
        sure = parcalar.length * blokMs;
        sessiz = 0;
        asti = false;
      }
      return;
    }
    parcalar.push(veri);
    sure += blokMs;
    if (sure > UYANMA_AZAMI_MS) asti = true; // uzun ses (video, muzik, uzun konusma): atilacak
    if (rms > esik) sessiz = 0;
    else sessiz += blokMs;
    if (sessiz >= SEGMENT_SESSIZLIK_MS) {
      const konusmaMs = sure - sessiz;
      konusuyor = false;
      once.length = 0;
      if (!asti && konusmaMs >= UYANMA_EN_AZ_MS) cb.parca(wavYap(parcalar, ctx.sampleRate));
      parcalar = [];
    }
  };
  kaynak.connect(islem);
  islem.connect(ctx.destination);
  return {
    durdur: () => {
      if (bitti) return;
      bitti = true;
      islem.onaudioprocess = null;
      islem.disconnect();
      kaynak.disconnect();
      akis.getTracks().forEach((tr) => tr.stop());
      void ctx.close();
    },
    duraklat: (d) => {
      duraklat = d;
      if (d) {
        konusuyor = false;
        parcalar = [];
        once.length = 0;
      }
    },
  };
}

/** mp3 baytlarini calar; bitince URL birakilir. */
export function sesCal(mp3: Uint8Array): Promise<void> {
  return new Promise((coz) => {
    const url = URL.createObjectURL(new Blob([mp3 as BlobPart], { type: 'audio/mpeg' }));
    const a = new Audio(url);
    const bit = () => {
      URL.revokeObjectURL(url);
      coz();
    };
    a.onended = bit;
    a.onerror = bit;
    a.play().catch(bit);
  });
}
