import { useState, type ReactNode } from 'react';

type Lang = 'xml' | 'json' | 'sh' | 'tsx' | 'text';

const esc = (s: string) => s.replace(/[&<>]/g, c => (c === '&' ? '&amp;' : c === '<' ? '&lt;' : '&gt;'));

/** Tiny, dependency-free highlighter good enough for docs snippets. */
export function highlight(code: string, lang: Lang): string {
  if (lang === 'text') return esc(code);
  if (lang === 'sh')
    return code
      .split('\n')
      .map(line => (line.startsWith('#') ? `<span class="t-com">${esc(line)}</span>` : esc(line).replace(/^(\$ |&gt; )?(npx|npm|pnpm|motion-forge|node)\b/, (_m, p = "", cmd) => `${p}<span class="t-kw">${cmd}</span>`).replace(/(--[\w-]+)/g, '<span class="t-attr">$1</span>')))
      .join('\n');
  const tokens: string[] = [];
  // Placeholders use private-use characters so later passes (numbers, words) can't match them.
  const hold = (html: string) => `\uE000${String.fromCharCode(0xe100 + tokens.push(html) - 1)}\uE001`;
  let s = code;
  if (lang === 'xml') {
    s = s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, (_, body: string) => hold(`<span class="t-punc">&lt;![CDATA[</span>${highlight(body, 'json')}<span class="t-punc">]]&gt;</span>`));
    s = s.replace(/<!--[\s\S]*?-->/g, m => hold(`<span class="t-com">${esc(m)}</span>`));
    s = s.replace(/<\/?[\w:-]+|\/?>/g, m => hold(`<span class="t-tag">${esc(m)}</span>`));
    s = s.replace(/([\w:-]+)(=)("[^"]*")/g, (_, a, e, v) => hold(`<span class="t-attr">${esc(a)}</span>${e}<span class="t-str">${esc(v)}</span>`));
  } else {
    s = s.replace(/\/\/.*$/gm, m => hold(`<span class="t-com">${esc(m)}</span>`));
    s = s.replace(/"(?:[^"\\]|\\.)*"(\s*:)?/g, (m, colon) => hold(`<span class="${colon ? 't-key' : 't-str'}">${esc(colon ? m.slice(0, -colon.length) : m)}</span>${colon ?? ''}`));
    s = s.replace(/'(?:[^'\\]|\\.)*'|`[^`]*`/g, m => hold(`<span class="t-str">${esc(m)}</span>`));
    s = s.replace(/\b(import|from|export|const|return|true|false|function|await|new|default)\b/g, m => hold(`<span class="t-kw">${m}</span>`));
    s = s.replace(/<\/?[A-Za-z][\w.-]*|\/?>/g, m => hold(`<span class="t-tag">${esc(m)}</span>`));
    s = s.replace(/-?\b\d+\.?\d*\b/g, m => hold(`<span class="t-num">${m}</span>`));
  }
  return esc(s).replace(/\uE000([\uE100-\uF8FF])\uE001/g, (_, c: string) => tokens[c.charCodeAt(0) - 0xe100]!);
}

export function Code({ code, lang = 'text', title, className = '', copy = true }: { code: string; lang?: Lang; title?: ReactNode; className?: string; copy?: boolean }) {
  return (
    <figure className={`code ${className}`}>
      {(title || copy) && (
        <figcaption>
          <span>{title}</span>
          {copy && <CopyButton text={code} />}
        </figcaption>
      )}
      <pre>
        <code dangerouslySetInnerHTML={{ __html: highlight(code, lang) }} />
      </pre>
    </figure>
  );
}

export function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="copy"
      onClick={() => {
        void navigator.clipboard
          ?.writeText(text)
          .then(() => {
            setDone(true);
            setTimeout(() => setDone(false), 1400);
          })
          .catch(() => undefined);
      }}
    >
      {done ? 'Copied' : label}
    </button>
  );
}

export function Command({ cmd }: { cmd: string }) {
  return (
    <div className="command">
      <span className="prompt">$</span>
      <code>{cmd}</code>
      <CopyButton text={cmd} />
    </div>
  );
}
