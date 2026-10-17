import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { Gallery } from './dev/Gallery';
import './styles/base.css';
import './styles/ui.css';
import './dev/gallery.css';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

const path = window.location.pathname;

createRoot(root).render(<StrictMode>{path.startsWith('/dev') ? <Gallery path={path} /> : <App />}</StrictMode>);
