import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { createRequire } from 'node:module';

const { DEV_PORT } = createRequire(import.meta.url)('./kokpit.config.cjs');

/**
 * Vite uretim ciktisina `crossorigin` ekliyor; bu, ozel `app://` semamizda
 * istekleri CORS kipine sokuyor. Ayni origin oldugu icin gecmesi beklenir ama
 * bu projede "gecmesi beklenir" varsayimlari uc kez sessizce patladi.
 * Bilinmeyeni kaldiriyoruz: uretim HTML'inden ozniteligi cikar.
 */
const crossoriginKaldir = {
  name: 'kokpit-crossorigin-kaldir',
  apply: 'build' as const,
  transformIndexHtml(html: string) {
    return html.replace(/\s+crossorigin(=(["'])[^"']*\2)?/g, '');
  },
};

export default defineConfig({
  plugins: [react(), tailwindcss(), crossoriginKaldir],
  // Uretimde varliklar app://kokpit/ altindan gorece yollarla cozulur.
  base: './',
  server: { port: DEV_PORT, strictPort: true },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // Hicbir varlik data: URI olarak gomulmez.
    // Vite kucuk dosyalari varsayilan olarak gomuyordu; gomulen font alt kumesi
    // uretimdeki `font-src 'self'` politikasina takilip ENGELLENIYORDU (dev'de
    // `data:` izinli oldugu icin gorunmuyordu). Politikayi gevsetmek yerine gommeyi
    // kapatiyoruz: her varlik app:// uzerinden, CSP basligiyla servis edilsin.
    assetsInlineLimit: 0,
    // Yerel masaustu uygulamasi: paket diskten yuklenir, ag uzerinden inmez. 500 kB
    // uyarisi (xterm + webgl) burada bilgi tasimiyor, her build'de gurultu uretiyordu.
    chunkSizeWarningLimit: 2000,
  },
});
