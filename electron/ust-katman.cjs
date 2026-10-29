// Ust katman bekcisi (v2.8): Ada gercekten her pencerenin ustunde mi?
// Scryne 2026-10-06: "Ada sadece masaustunde gorunuyor, her uygulamada gorunsun." Olculdu: Ada'nin
// WS_EX_TOPMOST bayragi acikken Windows z-sirasinda onu topmost olmayan pencerelerin (Kokpit'in kendi
// ana penceresi dahil) altina koymustu; bayrak dogru, yer yanlis. SetWindowPos(HWND_TOPMOST) yeniden
// basilinca hemen ustte. Electron'un kendi islemleri (gizle/goster, kucult/geri, odak, setBounds) ayri
// ayri denendi, hicbiri dusurmedi: dusus disaridan (Windows ya da baska surec). Bu yuzden sebebi
// tahmin etmek yerine sonucu yoklayip duzeltiyoruz ve ustteki pencerenin sinifini logluyoruz.
//
// Kural: topmost bir pencerenin ustunde topmost OLMAYAN gorunur bir pencere olamaz. Varsa Ada dusmustur.
// Baska bir topmost pencere (Gorev Yoneticisi "her zaman ustte" gibi) Ada'nin ustundeyse mesru; onunla
// yarismayiz. Karar saf fonksiyonda (dustuMu), Win32 ayri (kontrolEt): test:ada karari Win32'siz sinar.

const { log } = require('./log.cjs');

const GW_HWNDPREV = 3;
const GWL_EXSTYLE = -20;
const WS_EX_TOPMOST = 0x8;
const HWND_TOPMOST = -1;
// SWP_NOSIZE | SWP_NOMOVE | SWP_NOACTIVATE | SWP_NOOWNERZORDER: yalniz z-sirasi, odak calmaz.
const SWP_BAYRAK = 0x1 | 0x2 | 0x10 | 0x200;
const YURUME_SINIRI = 256;

/**
 * @param {{ gorunur: boolean, ustte: boolean }[]} ustundekiler Ada'nin ustundeki pencereler (yakindan uzaga)
 * @returns {number} ilk sucluyu gosteren indis; -1 = Ada yerinde
 */
function dustuMu(ustundekiler) {
  return ustundekiler.findIndex((p) => p.gorunur && !p.ustte);
}

let win32 = null;
let yuklenemedi = false;
let ardisikHata = 0;

function yukle() {
  if (win32 || yuklenemedi) return win32;
  if (process.platform !== 'win32') {
    yuklenemedi = true;
    return null;
  }
  try {
    const koffi = require('koffi');
    const u = koffi.load('user32.dll');
    const k = koffi.load('kernel32.dll');
    win32 = {
      onceki: u.func('void* __stdcall GetWindow(void* hWnd, uint32 uCmd)'),
      stil: u.func('int32 __stdcall GetWindowLongW(void* hWnd, int nIndex)'),
      gorunur: u.func('bool __stdcall IsWindowVisible(void* hWnd)'),
      sinif: u.func('int __stdcall GetClassNameW(void* hWnd, _Out_ uint16_t* lpClassName, int nMaxCount)'),
      yerlestir: u.func('bool __stdcall SetWindowPos(void* hWnd, intptr_t after, int X, int Y, int cx, int cy, uint32 uFlags)'),
      // Teshis: ustteki pencerenin sureci (sinif adi tek basina uygulamayi soylemiyordu: 10-06..21
      // arasi 68 dusus "WinUIDesktopWin32WindowClass", hangi WinUI uygulamasi oldugu belirsiz).
      surecNo: u.func('uint32 __stdcall GetWindowThreadProcessId(void* hWnd, _Out_ uint32_t* lpdwProcessId)'),
      surecAc: k.func('void* __stdcall OpenProcess(uint32 dwDesiredAccess, bool bInheritHandle, uint32 dwProcessId)'),
      surecYolu: k.func('bool __stdcall QueryFullProcessImageNameW(void* hProcess, uint32 dwFlags, _Out_ uint16_t* lpExeName, _Inout_ uint32_t* lpdwSize)'),
      kapat: k.func('bool __stdcall CloseHandle(void* hObject)'),
    };
  } catch (e) {
    yuklenemedi = true;
    log('ust katman bekcisi kurulamadi (Ada dusse de geri cekilmeyecek): ' + e.message);
  }
  return win32;
}

function sinifAdi(w, h) {
  const ad = new Uint16Array(64);
  const n = w.sinif(h, ad, 64);
  return n > 0 ? String.fromCharCode(...ad.subarray(0, n)) : '?';
}

/** Pencerenin surecinin exe adi (ornek "PowerToys.Settings.exe"); okunamazsa ''. Yalniz log aninda. */
function surecAdi(w, h) {
  try {
    const no = [0];
    w.surecNo(h, no);
    if (!no[0]) return '';
    const PROCESS_QUERY_LIMITED_INFORMATION = 0x1000;
    const s = w.surecAc(PROCESS_QUERY_LIMITED_INFORMATION, false, no[0]);
    if (!s) return '';
    try {
      const yol = new Uint16Array(260);
      const boy = [260];
      if (!w.surecYolu(s, 0, yol, boy)) return '';
      const tam = String.fromCharCode(...yol.subarray(0, boy[0]));
      return tam.slice(tam.lastIndexOf('\\') + 1);
    } finally {
      w.kapat(s);
    }
  } catch {
    return '';
  }
}

/**
 * Ada'nin ustundekileri yurur; topmost olmayan gorunur bir pencere bulursa Ada'yi topmost bandinin
 * tepesine geri koyar.
 * @param {Buffer | null} adaTutamaci getNativeWindowHandle()
 * @returns {{ dustu: false } | { dustu: true, duzeldi: boolean, ustteki: string } | null} okunamazsa null
 */
function kontrolEt(adaTutamaci) {
  const w = yukle();
  if (!w || !adaTutamaci || adaTutamaci.length < 8) return null;
  try {
    const ada = adaTutamaci.readBigUInt64LE(0);
    const ustundekiler = [];
    const tutamaclar = [];
    let p = w.onceki(ada, GW_HWNDPREV);
    for (let i = 0; p && i < YURUME_SINIRI; i++) {
      const ustte = (w.stil(p, GWL_EXSTYLE) & WS_EX_TOPMOST) !== 0;
      const gorunur = w.gorunur(p);
      ustundekiler.push({ gorunur, ustte });
      tutamaclar.push(p);
      // Ilk sucluda dur: geri kalani karari degistirmez.
      if (gorunur && !ustte) break;
      p = w.onceki(p, GW_HWNDPREV);
    }
    ardisikHata = 0;
    const i = dustuMu(ustundekiler);
    if (i < 0) return { dustu: false };
    const surec = surecAdi(w, tutamaclar[i]);
    const ustteki = sinifAdi(w, tutamaclar[i]) + (surec ? ' (' + surec + ')' : '');
    const duzeldi = w.yerlestir(ada, HWND_TOPMOST, 0, 0, 0, 0, SWP_BAYRAK);
    return { dustu: true, duzeldi, ustteki };
  } catch (e) {
    log('ust katman okunamadi: ' + e.message);
    // Tek seferlik hata araci kapatmaz; 5 ardisik hatada user32 devre disi (her 600 ms'de log yazmasin).
    if (++ardisikHata >= 5) {
      win32 = null;
      yuklenemedi = true;
      log('win32 devre disi (5 ardisik hata)');
    }
    return null;
  }
}

module.exports = { dustuMu, kontrolEt };
