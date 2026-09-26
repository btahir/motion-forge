import { marked } from 'marked';
import reference from '../../../../packages/motion-forge/skills/motion-forge/reference.md?raw';
import skill from '../../../../packages/motion-forge/skills/motion-forge/SKILL.md?raw';
import { highlight } from '../components/Code';

const renderer = new marked.Renderer();
renderer.code = ({ text, lang }) => {
  const l = lang === 'xml' || lang === 'html' ? 'xml' : lang === 'sh' || lang === 'bash' ? 'sh' : lang === 'jsonc' || lang === 'json' || lang === 'js' || lang === 'tsx' ? 'json' : 'text';
  return `<figure class="code"><pre><code>${highlight(text, l as 'xml')}</code></pre></figure>`;
};
const slug = (s: string) => s.toLowerCase().replace(/<[^>]+>/g, '').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '');
renderer.heading = ({ tokens, depth }) => {
  const text = marked.Parser.parseInline(tokens);
  return `<h${depth} id="${slug(text)}">${text}</h${depth}>`;
};

const refHtml = marked.parse(reference, { renderer, async: false }) as string;
const skillBody = skill.replace(/^---[\s\S]*?---\s*/, '');
const skillHtml = marked.parse(skillBody, { renderer, async: false }) as string;
const toc = [...reference.matchAll(/^(##|###) (.+)$/gm)].map(m => ({ depth: m[1]!.length, text: m[2]!, id: slug(m[2]!) }));

export function Docs() {
  return (
    <main className="wrap docs">
      <aside className="docs-toc">
        <p className="eyebrow">Reference</p>
        <nav>
          {toc.map(t => (
            <a key={t.id} href={`#${t.id}`} className={`d${t.depth}`}>
              {t.text}
            </a>
          ))}
          <a href="#agent-workflow" className="d2">
            Agent workflow (skill)
          </a>
        </nav>
        <p className="muted small">
          Machine-readable: <a href="/llms.txt">llms.txt</a> · <a href="/llms-full.txt">llms-full.txt</a> · <a href="/reference.md">reference.md</a>
        </p>
      </aside>
      <article className="prose">
        <div dangerouslySetInnerHTML={{ __html: refHtml }} />
        <hr />
        <h1 id="agent-workflow">Agent workflow</h1>
        <p className="muted">This is the skill that <code>npx motion-forge init</code> installs. It’s written for coding agents, and it doubles as a good checklist for humans.</p>
        <div dangerouslySetInnerHTML={{ __html: skillHtml }} />
      </article>
    </main>
  );
}
