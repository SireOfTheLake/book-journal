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
