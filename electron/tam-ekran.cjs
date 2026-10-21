// Tam ekran algisi (v2.7): on plandaki pencere Ada'nin ekranini tamamen kapliyor mu?
// YouTube'u tam ekran izlerken, oyunda, sunumda Ada kendiliginden cekilir (Scryne 2026-10-06: "YouTube
// izlerken orada kaliyor"). Windows'ta topmost pencere tarayicinin tam ekraninin da ustunde kalir;
// Electron'un baska uygulamalarin penceresini gosteren bir API'si yok, bu yuzden user32 koffi ile
// (N-API, on derlenmis; derleyici gerekmez).
//
// Karar saf fonksiyonda (tamEkranMi), Win32 okumasi ayri (oku): test:ada karari Win32'siz sinar.
// SHQueryUserNotificationState kullanilmadi: sistem geneli bir cevap verir, ikinci ekrandaki tam ekran
// videoda da birincil ekrandaki Ada'yi gizlerdi.

const { log } = require('./log.cjs');

const MASAUSTU_SINIFLARI = new Set(['Progman', 'WorkerW', 'Shell_TrayWnd', 'Shell_SecondaryTrayWnd']);
// Kabugun ekrani bir an kaplayan katmanlari: Alt+Tab ve Gorev gorunumu (Win11 XAML adasi), Baslat /
// Arama / bildirim merkezi (CoreWindow). Bunlar "tam ekran uygulama" degil; on planda kalsalar da Ada
// cekilmez. Taninmayan baska bir gecici katman icin asil koruma asagidaki giris gecikmesi.
const KABUK_KATMANLARI = new Set(['XamlExplorerHostIslandWindow', 'MultitaskingViewFrame', 'Windows.UI.Core.CoreWindow', 'ForegroundStaging']);

/**
 * Sinemaya giris icin tam ekran bu kadar KESINTISIZ surmeli; cikis hemen. 2026-10-06..21 gercek log:
 * 149 sinemanin 93'u 2,5 sn'den kisaydi (46'si tek yoklama, 0,6 sn) -> Ada her Alt+Tab'da kaybolup
 * geri geliyordu. Gercek tam ekran (video, oyun, sunum) saniyelerce surer; 2 sn gecikme gorunmez.
 */
const SINEMA_GIRIS_MS = 2000;

/**
 * Yoklama adimi: anlik okuma (`tam`) -> kararli sinema durumu. Saf; test:ada sinar.
 * @param {{ sinema: boolean, aday: number | null }} d onceki durum (aday: tam ekranin ilk goruldugu an)
 * @param {boolean} tam bu yoklamada on plan tam ekran mi
 * @param {number} simdi
 * @returns {{ sinema: boolean, aday: number | null }}
 */
function sinemaAdimi(d, tam, simdi, girisMs = SINEMA_GIRIS_MS) {
  if (!tam) return { sinema: false, aday: null };
  if (d.sinema) return d;
  const aday = d.aday ?? simdi;
  return { sinema: simdi - aday >= girisMs, aday };
}

/**
 * @param {{ sol: number, ust: number, sag: number, alt: number } | null} pencere on plan pencerenin dikdortgeni
 * @param {{ sol: number, ust: number, sag: number, alt: number } | null} ekran o pencerenin ekrani (rcMonitor)
 * @param {{ sinif?: string, buyuk?: boolean, ayniEkran?: boolean }} ek
 *   sinif: pencere sinifi (masaustu tam ekrandir ama "tam ekran uygulama" degil);
 *   buyuk: IsZoomed — gorev cubugu otomatik gizliyken buyutulmus pencere de ekrani kaplar (-8 px tasar);
 *   ayniEkran: pencere Ada'nin ekraninda mi (ikinci ekrandaki tam ekran Ada'yi ilgilendirmez)
 */
function tamEkranMi(pencere, ekran, ek = {}) {
  if (!pencere || !ekran) return false;
  if (ek.ayniEkran === false || ek.buyuk) return false;
  if (ek.sinif && (MASAUSTU_SINIFLARI.has(ek.sinif) || KABUK_KATMANLARI.has(ek.sinif))) return false;
  // Tam ekran pencere ekrani tam kaplar; bir pikselden fazla tasan cerceve buyutulmus penceredir.
  return (
    pencere.sol <= ekran.sol &&
    pencere.ust <= ekran.ust &&
    pencere.sag >= ekran.sag &&
    pencere.alt >= ekran.alt &&
    ekran.sol - pencere.sol <= 1 &&
    ekran.ust - pencere.ust <= 1
  );
}

let win32 = null;
let yuklenemedi = false;

function yukle() {
  if (win32 || yuklenemedi) return win32;
  if (process.platform !== 'win32') {
    yuklenemedi = true;
    return null;
  }
  try {
    const koffi = require('koffi');
    const u = koffi.load('user32.dll');
    const RECT = koffi.struct('KOKPIT_RECT', { left: 'long', top: 'long', right: 'long', bottom: 'long' });
    const MONITORINFO = koffi.struct('KOKPIT_MONITORINFO', {
      cbSize: 'uint32',
      rcMonitor: RECT,
      rcWork: RECT,
      dwFlags: 'uint32',
    });
    win32 = {
      RECT,
      MONITORINFO,
      on: u.func('void* __stdcall GetForegroundWindow()'),
      dikdortgen: u.func('bool __stdcall GetWindowRect(void* hWnd, _Out_ KOKPIT_RECT* lpRect)'),
      ekran: u.func('void* __stdcall MonitorFromWindow(void* hwnd, uint32 dwFlags)'),
      ekranBilgi: u.func('bool __stdcall GetMonitorInfoW(void* hMonitor, _Inout_ KOKPIT_MONITORINFO* lpmi)'),
      buyuk: u.func('bool __stdcall IsZoomed(void* hWnd)'),
      sinif: u.func('int __stdcall GetClassNameW(void* hWnd, _Out_ uint16_t* lpClassName, int nMaxCount)'),
      adres: (h) => (h ? koffi.address(h) : 0n),
    };
  } catch (e) {
    yuklenemedi = true;
    log('tam ekran algisi kurulamadi (Ada tam ekranda cekilmeyecek): ' + e.message);
  }
  return win32;
}

const dortgen = (r) => ({ sol: r.left, ust: r.top, sag: r.right, alt: r.bottom });

const YOK = Object.freeze({ tam: false, sinif: '' });

/**
 * On plandaki pencere Ada'nin ekraninda tam ekran mi? Okunamazsa tam: false (Ada gorunur kalir).
 * `sinif`: on plan pencerenin sinifi (teshis logu: hangi uygulama Ada'yi cekti).
 * @param {Buffer | null} adaTutamaci Ada penceresinin HWND'si (getNativeWindowHandle)
 * @returns {{ tam: boolean, sinif: string }}
 */
function oku(adaTutamaci) {
  const w = yukle();
  if (!w) return YOK;
  try {
    const h = w.on();
    if (!h) return YOK;
    const r = {};
    if (!w.dikdortgen(h, r)) return YOK;
    const MONITOR_DEFAULTTONEAREST = 2;
    const m = w.ekran(h, MONITOR_DEFAULTTONEAREST);
    const mi = { cbSize: 40, rcMonitor: {}, rcWork: {}, dwFlags: 0 };
    if (!m || !w.ekranBilgi(m, mi)) return YOK;
    let ayniEkran = true;
    if (adaTutamaci && adaTutamaci.length >= 8) {
      const adaH = adaTutamaci.readBigUInt64LE(0);
      if (w.adres(h) === adaH) return YOK;
      // Ada'nin ekrani: HWND tamponu koffi'ye isaretci olarak gecer.
      const adaM = w.ekran(adaTutamaci.readBigUInt64LE(0), MONITOR_DEFAULTTONEAREST);
      ayniEkran = !adaM || w.adres(adaM) === w.adres(m);
    }
    const ad = new Uint16Array(64);
    const n = w.sinif(h, ad, 64);
    const sinif = n > 0 ? String.fromCharCode(...ad.subarray(0, n)) : '';
    return { tam: tamEkranMi(dortgen(r), dortgen(mi.rcMonitor), { sinif, buyuk: w.buyuk(h), ayniEkran }), sinif };
  } catch (e) {
    log('tam ekran okunamadi: ' + e.message);
    yuklenemedi = true;
    return YOK;
  }
}

module.exports = { tamEkranMi, sinemaAdimi, oku, SINEMA_GIRIS_MS };
