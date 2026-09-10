// Uc yerin (vite.config.ts, electron/config.cjs, scripts/start.cjs) paylastigi sabitler.
// Ayri ayri yazilinca uyusmazlik SESSIZ bir hataya donusuyor: Vite bir portta dinler,
// Electron baskasini yukler, pencere bos acilir ve hicbir yerde hata gorunmez.
module.exports = {
  DEV_PORT: 5173,
};
