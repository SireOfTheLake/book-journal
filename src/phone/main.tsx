import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import './phone.css';
import { FeaturesProvider } from '../features/FeaturesContext';
import { SyncProvider } from '../sync/SyncContext';
import App from './App';
import { supabaseCoverSource, topUpCovers } from './covers';
import { PhoneDbProvider } from './PhoneDb';

// The pictures table stays in the cloud; covers come through their own download (see covers.ts).
const SKIP_PULL = ['image'];
const afterSync = (client: Parameters<typeof supabaseCoverSource>[0]) => topUpCovers(supabaseCoverSource(client));

// Stay upright where the phone allows it (Android does; iPhone ignores this, so phone.css covers the screen when turned sideways).
try { void (screen.orientation as unknown as { lock?(o: string): Promise<void> }).lock?.('portrait')?.catch(() => undefined); } catch { /* not supported */ }

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HashRouter>
      <PhoneDbProvider>
        <SyncProvider skipPull={SKIP_PULL} afterSync={afterSync}>
          <FeaturesProvider>
            <App />
          </FeaturesProvider>
        </SyncProvider>
      </PhoneDbProvider>
    </HashRouter>
  </React.StrictMode>,
);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('./sw.js').catch(() => undefined); });
}
