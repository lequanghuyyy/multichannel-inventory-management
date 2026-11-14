import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import './app/styles.css';
import { AuthProvider } from './features/auth/AuthProvider';
import { RealtimeProvider } from './features/realtime/RealtimeProvider';

const element = document.getElementById('root');
if (!element) throw new Error('Root element is missing');
createRoot(element).render(<StrictMode><AuthProvider><RealtimeProvider><App /></RealtimeProvider></AuthProvider></StrictMode>);
