import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';
import { ThemeProvider } from './lib/theme';
import { RealtimeProvider } from './lib/realtime';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <RealtimeProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </RealtimeProvider>
    </ThemeProvider>
  </React.StrictMode>
);
