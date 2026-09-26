import { Home } from './pages/Home';
import { Playground } from './pages/Playground';
import { Docs } from './pages/Docs';
import { Footer, Nav } from './components/Chrome';

export function App({ path }: { path: string }) {
  const route = path.replace(/\/+$/, '/') || '/';
  const page = route.startsWith('/playground') ? <Playground /> : route.startsWith('/docs') ? <Docs /> : route === '/' || route === '/index.html' ? <Home /> : <NotFound />;
  return (
    <>
      <Nav route={route} />
      {page}
      <Footer />
    </>
  );
}

function NotFound() {
  return (
    <main className="wrap notfound">
      <h1>Nothing moves here.</h1>
      <p>
        That page doesn’t exist. Try the <a href="/">home page</a>, the <a href="/playground/">playground</a> or the <a href="/docs/">docs</a>.
      </p>
    </main>
  );
}
