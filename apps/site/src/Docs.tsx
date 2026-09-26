import { Marked } from 'marked';
import guides from '../../../docs/manifest.json';
const markdown = import.meta.glob('../../../docs/*.md', { eager: true, query: '?raw', import: 'default' }) as Record<string, string>;
const parser = new Marked({ async: false, gfm: true });
const content = new Map(guides.map(guide => {
  const source = markdown[`../../../docs/${guide.file}.md`]!;
  const html = parser.parse(source, { async: false }).replace(/href="\.\/([\w-]+)\.md"/g, (_match, name: string) => `href="/docs/${guides.find(g => g.file === name)?.slug ? `${guides.find(g => g.file === name)!.slug}/` : ''}"`);
  return [guide.slug, html];
}));
export function Docs({ path }: { path: string }) {
  const slug = path.replace(/^\/docs\/?/, '').replace(/\/$/, '');
  const guide = guides.find(g => g.slug === slug);
  return <main className="docs-page"><aside aria-label="Documentation navigation"><span className="eyebrow">DOCUMENTATION</span>{guides.map(g => <a key={g.slug} href={`/docs/${g.slug ? `${g.slug}/` : ''}`} aria-current={guide === g ? 'page' : undefined}>{g.title}</a>)}<a href="/llms-full.txt">Plain-text reference ↗</a></aside><article className="markdown">{guide ? <><div className="doc-kicker"><span className="eyebrow">MOTION FORGE / {guide.title.toUpperCase()}</span><a href={`/docs/${guide.file}.md`}>View Markdown ↗</a></div><div dangerouslySetInnerHTML={{ __html: content.get(slug)! }}/><div className="doc-end"><span>Built from the same source as the plain-text agent reference.</span><a href="/studio/">Try it in Studio →</a></div></> : <><h1>Page not found.</h1><p>Choose a guide from the documentation menu.</p></>}</article></main>;
}
