export const REPO = 'https://github.com/btahir/motion-forge';

export function Logo() {
  return (
    <svg className="logo-mark" viewBox="0 0 32 32" aria-hidden="true">
      <rect x="2" y="2" width="28" height="28" rx="9" fill="var(--ink)" />
      <path d="M9 21 L9 11 L16 17 L23 11 L23 21" fill="none" stroke="var(--ember)" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Nav({ route }: { route: string }) {
  const link = (href: string, label: string) => (
    <a href={href} aria-current={route.startsWith(href) && (href !== '/' || route === '/') ? 'page' : undefined}>
      {label}
    </a>
  );
  return (
    <header className="nav">
      <div className="wrap nav-inner">
        <a className="brand" href="/">
          <Logo />
          <span>motion forge</span>
        </a>
        <nav aria-label="Main">
          {link('/#presets', 'Presets')}
          {link('/playground/', 'Playground')}
          {link('/docs/', 'Docs')}
          <a href={REPO} className="gh">
            GitHub
          </a>
        </nav>
      </div>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="footer">
      <div className="wrap footer-inner">
        <div>
          <a className="brand" href="/">
            <Logo />
            <span>motion forge</span>
          </a>
          <p>Interactive animation as plain text. MIT licensed.</p>
        </div>
        <div className="footer-links">
          <a href="/docs/">Format reference</a>
          <a href="/playground/">Playground</a>
          <a href="/llms.txt">llms.txt</a>
          <a href="/presets.json">presets.json</a>
          <a href={REPO}>Source</a>
        </div>
      </div>
    </footer>
  );
}
