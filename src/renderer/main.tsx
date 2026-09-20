import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

// Pencerenin herhangi bir yerine birakilan dosya sayfayi o dosyaya GOTURMESIN.
// Terminal kendi drop'unu isler; geri kalan her yer birakmayi yutar.
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => e.preventDefault());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
