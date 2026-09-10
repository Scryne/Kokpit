import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

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
  // Electron dosyayi file:// ile yukleyecek -> mutlak yol olmaz
  base: './',
  server: { port: 5173, strictPort: true },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // Hicbir varlik data: URI olarak gomulmez.
    // Vite kucuk dosyalari varsayilan olarak gomuyordu; gomulen font alt kumesi
    // uretimdeki `font-src 'self'` politikasina takilip ENGELLENIYORDU (dev'de
    // `data:` izinli oldugu icin gorunmuyordu). Politikayi gevsetmek yerine gommeyi
    // kapatiyoruz: her varlik app:// uzerinden, CSP basligiyla servis edilsin.
    assetsInlineLimit: 0,
  },
});
