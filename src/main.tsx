import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App';
import { DbProvider } from './db/DbContext';
import './theme/theme.css';
import { applyCachedTheme } from './theme/apply';
import { FeaturesProvider } from './features/FeaturesContext';
import { ThemeProvider } from './theme/ThemeContext';

// Show the saved colors at once, before the database has opened.
applyCachedTheme();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HashRouter>
      <DbProvider>
        <ThemeProvider>
          <FeaturesProvider>
            <App />
          </FeaturesProvider>
        </ThemeProvider>
      </DbProvider>
    </HashRouter>
  </React.StrictMode>,
);
