import { hydrateRoot, createRoot } from 'react-dom/client';
import { App } from './App';
import './site.css';

const root = document.getElementById('root')!;
const app = <App path={location.pathname} />;
if (root.dataset.rendered) hydrateRoot(root, app);
else createRoot(root).render(app);
