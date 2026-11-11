// v4.0, Ada'nin Sistem sayfasi: CPU, bellek, GPU.
//
// CPU her zaman orneklenir (os.cpus() farki mikro saniyeler surer): sayfa acildiginda 60 olcumluk gecmis
// hazir olsun, grafik bos baslamasin. GPU (nvidia-smi alt sureci, ~100 ms) yalniz sayfa izlenirken.
// Yayin da yalniz izlenirken: kapali sayfaya IPC trafigi gitmez.

const os = require('os');
const { execFile } = require('child_process');

const GECMIS = 60;
const GPU_ARGUMAN = ['--query-gpu=name,utilization.gpu,memory.used,memory.total,temperature.gpu', '--format=csv,noheader,nounits'];
const MIB = 1024 * 1024;

/** Varsayilan GPU okuyucu: nvidia-smi ciktisi. ENOENT hatasi `code` ile doner (bir daha denenmez). */
function nvidiaSmi() {
  return new Promise((coz, reddet) => {
    execFile('nvidia-smi', GPU_ARGUMAN, { windowsHide: true, timeout: 3000 }, (hata, cikti) => {
      if (hata) reddet(hata);
      else coz(String(cikti));
    });
  });
}

/** CSV'nin ilk satiri (coklu GPU'da ilki). Bozuksa null. [N/A] sicaklik null olur. */
function gpuAyristir(cikti) {
  const satir = String(cikti || '')
    .split(/\r?\n/)
    .map((s) => s.trim())
    .find(Boolean);
  if (!satir) return null;
  const p = satir.split(',').map((s) => s.trim());
  if (p.length < 4 || !p[0]) return null;
  const yuzde = Number(p[1]);
  const kullanilan = Number(p[2]);
  const toplam = Number(p[3]);
  if (![yuzde, kullanilan, toplam].every(Number.isFinite)) return null;
  const sicaklik = p[4] !== undefined && p[4] !== '' && Number.isFinite(Number(p[4])) ? Number(p[4]) : null;
  return {
    ad: p[0].slice(0, 80),
    yuzde: Math.max(0, Math.min(100, yuzde)),
    bellekKullanilan: Math.max(0, kullanilan) * MIB,
    bellekToplam: Math.max(0, toplam) * MIB,
    sicaklik,
  };
}

function cpuOrnek(cpular) {
  let bos = 0;
  let toplam = 0;
  for (const c of cpular || []) {
    const t = c && c.times;
    if (!t) continue;
    bos += t.idle || 0;
    toplam += (t.user || 0) + (t.nice || 0) + (t.sys || 0) + (t.idle || 0) + (t.irq || 0);
  }
  return { bos, toplam };
}

/**
 * @param {{ yayin: (d: object) => void, aralikMs?: number, gpuAralikMs?: number,
 *   gpuKomutu?: () => Promise<string>, simdi?: () => number, cpular?: () => object[] }} s
 * @returns {{ izle: (acik: boolean) => void, anlik: () => object, kapat: () => void }}
 */
function kur({ yayin, aralikMs = 2000, gpuAralikMs = 4000, gpuKomutu = nvidiaSmi, simdi = Date.now, cpular = os.cpus } = {}) {
  let onceki = cpuOrnek(cpular());
  let cpu = 0;
  const gecmis = [];
  let gpu = null;
  let gpuYok = false;
  let gpuUcusta = false;
  let izleyen = 0;
  let gpuSaat = null;
  let kapali = false;
  let olculdu = simdi();

  function anlik() {
    const toplam = os.totalmem();
    return {
      cpu,
      bellek: { kullanilan: Math.max(0, toplam - os.freemem()), toplam },
      gpu: gpuYok ? null : gpu,
      gecmis: gecmis.slice(),
      olculdu,
    };
  }

  function yay() {
    if (kapali || izleyen <= 0 || !yayin) return;
    try {
      yayin(anlik());
    } catch {
      /* dinleyici hatasi olcumu durdurmaz */
    }
  }

  function ornekle() {
    if (kapali) return;
    const simdiki = cpuOrnek(cpular());
    const dt = simdiki.toplam - onceki.toplam;
    // Fark yoksa (cok kisa aralik) son deger korunur; negatif fark (cekirdek sayisi degisti) yok sayilir.
    if (dt > 0) {
      const y = 100 * (1 - (simdiki.bos - onceki.bos) / dt);
      cpu = Math.round(Math.max(0, Math.min(100, y)) * 10) / 10;
    }
    onceki = simdiki;
    gecmis.push(cpu);
    if (gecmis.length > GECMIS) gecmis.splice(0, gecmis.length - GECMIS);
    olculdu = simdi();
    yay();
  }

  function gpuOku() {
    if (kapali || gpuYok || gpuUcusta || izleyen <= 0) return;
    gpuUcusta = true;
    Promise.resolve()
      .then(() => gpuKomutu())
      .then(
        (cikti) => {
          gpu = gpuAyristir(cikti);
        },
        (hata) => {
          gpu = null;
          // nvidia-smi yok (NVIDIA disi ya da surucu yok): her 4 sn'de alt surec acmanin anlami yok.
          if (hata && hata.code === 'ENOENT') {
            gpuYok = true;
            if (gpuSaat) clearInterval(gpuSaat);
            gpuSaat = null;
          }
        }
      )
      .finally(() => {
        gpuUcusta = false;
        yay();
      });
  }

  const cpuSaat = setInterval(ornekle, Math.max(1, aralikMs));
  cpuSaat.unref?.();

  return {
    izle(acik) {
      if (kapali || typeof acik !== 'boolean') return;
      // Iki pencere ayni anda izleyebilir: sayac, biri kapaninca digerinin olcumu kesilmesin diye.
      izleyen = acik ? izleyen + 1 : Math.max(0, izleyen - 1);
      if (izleyen > 0 && !gpuSaat && !gpuYok) {
        gpuOku();
        gpuSaat = setInterval(gpuOku, Math.max(1, gpuAralikMs));
        gpuSaat.unref?.();
      }
      if (izleyen === 0 && gpuSaat) {
        clearInterval(gpuSaat);
        gpuSaat = null;
      }
      if (acik && izleyen === 1) yay();
    },
    anlik,
    kapat() {
      kapali = true;
      izleyen = 0;
      clearInterval(cpuSaat);
      if (gpuSaat) clearInterval(gpuSaat);
      gpuSaat = null;
    },
    /** Test icin: izleyen sayisi. */
    izleyenSayisi: () => izleyen,
  };
}

module.exports = { kur, gpuAyristir };
