import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import Ada from './Ada';
import './index.css';

// Pencerenin herhangi bir yerine birakilan dosya sayfayi o dosyaya GOTURMESIN.
// Terminal kendi drop'unu isler; geri kalan her yer birakmayi yutar.
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => e.preventDefault());

// Ayni paket iki pencereye hizmet eder: ana pencere ve ada (electron/ada.cjs, #ada).
const adaMi = window.location.hash === '#ada';
if (adaMi) {
  document.documentElement.classList.add('ada');
  // Sayfa basligi pencere basligini ezer; ada odak aldiginda (Ctrl+Alt+Shift+A) Windows'ta ana
  // pencereyle ayni "Kokpit" adini tasimasin.
  document.title = 'Kokpit Ada';
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>{adaMi ? <Ada /> : <App />}</StrictMode>
);
