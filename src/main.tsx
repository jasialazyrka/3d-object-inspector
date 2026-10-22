import { createRoot } from 'react-dom/client';

import { App } from './app/App';
import './app/styles.css';
import { installSeam } from './testing/seam';

// Installed during bootstrap, before the first render, so E2E can wait on the seam itself.
installSeam(import.meta.env.MODE);

const container = document.getElementById('root');
if (container === null) throw new Error('#root is missing from the document');

createRoot(container).render(<App />);
