import { useEffect, useMemo, useRef, useState } from 'react';
import { check, loadScene, Player, renderFrameTree, serializeXML, prefixIds, type CheckReport } from 'motion-forge';
import { Live } from '../components/Live';
import { CopyButton } from '../components/Code';
import { presetByName, presets } from '../presets';

const DEFAULT = 'scout';
const MAX_SOURCE = 2_000_000;
const DRAFT_KEY = 'motion-forge:playground-draft:v1';

async function pack(text: string): Promise<string> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  let bin = '';
  bytes.forEach(b => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
async function unpack(code: string): Promise<string> {
  if (code.length > MAX_SOURCE) throw new Error('This share link is too large. Open the SVG file instead.');
  const bin = atob(code.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_SOURCE) throw new Error('Shared SVG exceeds the 2 MB limit.');
      chunks.push(value);
    }
  } finally { await reader.cancel(); }
  const combined = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { combined.set(chunk, offset); offset += chunk.length; }
  return new TextDecoder().decode(combined);
}

function Filmstrip({ source, report }: { source: string; report: CheckReport }) {
  const scene = useMemo(() => loadScene(source), [source]);
  const states = report.summary.states;
  const [pick, setPick] = useState(0);
  const st = states[Math.min(pick, states.length - 1)];
  const frames = useMemo(() => {
    if (!st || !scene.ok) return [];
    const player = new Player(scene, { hold: true });
    player.goto(st.name, { layer: st.layer });
    const rs = scene.layers.find(l => l.name === st.layer)?.states.get(st.name);
    const span = rs ? (rs.loop === Infinity ? rs.duration : rs.completeAt) : 0;
    const n = span > 0 ? 8 : 1;
    return Array.from({ length: n }, (_, i) => {
      const t = n === 1 ? span : rs!.loop === Infinity ? (span * i) / n : (span * i) / (n - 1);
      player.seek(t, st.layer);
      const tree = renderFrameTree(scene, player.frame(), { width: 120 });
      prefixIds(tree, `fs${i}-`);
      tree.attrs.width = '100%';
      tree.attrs.height = '100%';
      return { t: Math.round(t), svg: serializeXML(tree) };
    });
  }, [scene, st]);
  if (!states.length) return <p className="muted">Add states to see frames.</p>;
  return (
    <div className="filmstrip">
      <div className="filmstrip-tabs">
        {states.map((s, i) => (
          <button key={`${s.layer}/${s.name}`} className={i === pick ? 'on' : ''} onClick={() => setPick(i)}>
            {s.layer !== 'main' ? `${s.layer}/` : ''}
            {s.name}
          </button>
        ))}
      </div>
      <div className="frames">
        {frames.map(f => (
          <figure key={f.t}>
            <div dangerouslySetInnerHTML={{ __html: f.svg }} />
            <figcaption>{f.t}ms</figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}

export function Playground() {
  const [source, setSource] = useState(() => presetByName(DEFAULT)?.source ?? presets[0]?.source ?? '');
  const [live, setLive] = useState(source);
  const [presetName, setPresetName] = useState(DEFAULT);
  const [tab, setTab] = useState<'check' | 'frames'>('check');
  const [shareUrl, setShareUrl] = useState('');
  const [shareCopied, setShareCopied] = useState(false);
  const [notice, setNotice] = useState('');
  const [ready, setReady] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const editorHost = useRef<HTMLDivElement>(null);
  const editor = useRef<{ set(text: string): void } | undefined>(undefined);
  const latest = useRef(source);
  latest.current = source;
  const report = useMemo(() => check(live), [live]);

  // Load from URL hash.
  useEffect(() => {
    let revision = 0;
    const apply = async () => {
      const own = ++revision;
      const hash = new URLSearchParams(location.hash.slice(1));
      const name = hash.get('preset');
      const src = hash.get('src');
      let text: string | undefined;
      if (src) {
        try { text = await unpack(src); }
        catch (e) { if (own === revision) setNotice(`Could not open share link: ${(e as Error).message}`); }
      }
      else if (name && presetByName(name)) {
        text = presetByName(name)!.source;
        setPresetName(name);
      } else if (!location.hash) {
        try {
          const draft = localStorage.getItem(DRAFT_KEY);
          if (draft && draft.length <= MAX_SOURCE) { text = draft; setNotice('Restored your local draft.'); setPresetName(''); }
        } catch { /* Storage may be disabled. Editing still works. */ }
      }
      if (own !== revision) return;
      if (text) {
        setSource(text);
        setLive(text);
        editor.current?.set(text);
      }
      setReady(true);
    };
    void apply();
    addEventListener('hashchange', apply);
    return () => { revision++; removeEventListener('hashchange', apply); };
  }, []);

  useEffect(() => {
    setShareUrl('');
    setShareCopied(false);
    if (!ready || source.length > MAX_SOURCE) return;
    const timer = setTimeout(() => { try { localStorage.setItem(DRAFT_KEY, source); } catch { /* Optional local persistence. */ } }, 500);
    return () => clearTimeout(timer);
  }, [source, ready]);

  // Debounce the live preview.
  useEffect(() => {
    const t = setTimeout(() => setLive(source), 250);
    return () => clearTimeout(t);
  }, [source]);

  // CodeMirror (client only).
  useEffect(() => {
    let destroyed = false;
    let view: import('@codemirror/view').EditorView | undefined;
    void (async () => {
      const [{ EditorView, keymap, lineNumbers, highlightActiveLine, drawSelection }, { EditorState }, { xml }, { defaultKeymap, history, historyKeymap, indentWithTab }, { syntaxHighlighting, HighlightStyle, bracketMatching }, { tags }] = await Promise.all([
        import('@codemirror/view'),
        import('@codemirror/state'),
        import('@codemirror/lang-xml'),
        import('@codemirror/commands'),
        import('@codemirror/language'),
        import('@lezer/highlight'),
      ]);
      if (destroyed || !editorHost.current) return;
      const style = HighlightStyle.define([
        { tag: tags.tagName, color: 'var(--t-tag)' },
        { tag: tags.attributeName, color: 'var(--t-attr)' },
        { tag: tags.attributeValue, color: 'var(--t-str)' },
        { tag: tags.comment, color: 'var(--t-com)', fontStyle: 'italic' },
        { tag: [tags.angleBracket, tags.bracket], color: 'var(--t-punc)' },
      ]);
      editorHost.current.replaceChildren();
      view = new EditorView({
        parent: editorHost.current,
        state: EditorState.create({
          doc: latest.current,
          extensions: [
            lineNumbers(),
            history(),
            drawSelection(),
            highlightActiveLine(),
            bracketMatching(),
            xml(),
            syntaxHighlighting(style),
            keymap.of([indentWithTab, ...defaultKeymap, ...historyKeymap]),
            EditorView.lineWrapping,
            EditorView.contentAttributes.of({ 'aria-label': 'Motion SVG source' }),
            EditorView.updateListener.of(u => {
              if (u.docChanged) setSource(u.state.doc.toString());
            }),
          ],
        }),
      });
      view.scrollDOM.tabIndex = 0;
      view.scrollDOM.setAttribute('aria-label', 'Scrollable source code');
      editor.current = { set: text => view!.dispatch({ changes: { from: 0, to: view!.state.doc.length, insert: text } }) };
    })();
    return () => {
      destroyed = true;
      view?.destroy();
      editor.current = undefined;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const choose = (name: string) => {
    const p = presetByName(name);
    if (!p) return;
    setPresetName(name);
    setSource(p.source);
    setLive(p.source);
    setNotice('');
    editor.current?.set(p.source);
    history.replaceState(null, '', `#preset=${name}`);
  };

  const share = async () => {
    try {
      if (source.length > MAX_SOURCE) throw new Error('SVG exceeds the 2 MB limit.');
      const url = `${location.origin}/playground/#src=${await pack(source)}`;
      if (latest.current !== source) return;
      history.replaceState(null, '', url);
      setShareUrl(url);
      try { await navigator.clipboard.writeText(url); setShareCopied(true); }
      catch { setShareCopied(false); }
    } catch (e) { setNotice(`Could not share: ${(e as Error).message}`); }
  };

  const openFile = async (file?: File) => {
    if (!file) return;
    try {
      if (file.size > MAX_SOURCE) throw new Error('SVG exceeds the 2 MB limit.');
      const text = await file.text();
      setPresetName(''); setSource(text); setLive(text); editor.current?.set(text);
      setNotice(`Opened ${file.name}. Changes save locally in this browser.`);
      history.replaceState(null, '', location.pathname);
    } catch (e) { setNotice(`Could not open file: ${(e as Error).message}`); }
    if (fileInput.current) fileInput.current.value = '';
  };

  const download = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([source], { type: 'image/svg+xml' }));
    a.download = `${presetName || 'animation'}.svg`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  const icon = { error: '✖', warning: '▲', info: '·' } as const;
  return (
    <main className="playground">
      <h1 className="sr-only">Motion SVG playground</h1>
      <div className="pg-bar">
        <label className="pg-select">
          <span>Preset</span>
          <select value={presetName} onChange={e => choose(e.target.value)}>
            <option value="" disabled>Custom SVG</option>
            {presets.map(p => (
              <option key={p.name} value={p.name}>
                {p.title} ({p.name})
              </option>
            ))}
          </select>
        </label>
        <div className="pg-actions">
          <span className={`pg-status ${report.ok ? 'ok' : 'bad'}`}>{report.ok ? `valid · ${report.counts.warnings} warnings` : `${report.counts.errors} errors`}</span>
          <input ref={fileInput} type="file" accept=".svg,image/svg+xml" hidden aria-label="Open SVG file" onChange={e => void openFile(e.target.files?.[0])}/>
          <button className="btn small" onClick={() => fileInput.current?.click()}>Open SVG</button>
          <button className="btn small" onClick={download}>
            Download .svg
          </button>
          <button className="btn small primary" onClick={() => void share()}>
            {shareUrl ? shareCopied ? 'Link copied' : 'Link ready' : 'Share link'}
          </button>
        </div>
      </div>
      {(notice || shareUrl) && <div className="pg-notice" role="status">{notice}{shareUrl && <label>Share URL <input aria-label="Share URL" readOnly value={shareUrl} onFocus={e => e.target.select()} /></label>}</div>}
      <div className="pg-grid">
        <section className="pg-editor" aria-label="Source">
          <div ref={editorHost} className="cm-host">
            <textarea aria-label="Motion SVG source" value={source} onChange={e => setSource(e.target.value)} spellCheck={false} />
          </div>
        </section>
        <section className="pg-preview" aria-label="Preview">
          {report.ok ? <Live key={live} source={live} transport className="pg-live" /> : <div className="pg-broken">Fix the errors to see it move. The last valid version isn’t kept on purpose, so what you see always matches the file.</div>}
          <div className="pg-tabs">
            <button className={tab === 'check' ? 'on' : ''} onClick={() => setTab('check')}>
              Check
            </button>
            <button className={tab === 'frames' ? 'on' : ''} onClick={() => setTab('frames')}>
              Frames
            </button>
            <CopyButton text={`npx motion-forge check ${presetName || 'file'}.svg && npx motion-forge preview ${presetName || 'file'}.svg`} label="Copy CLI" />
          </div>
          {tab === 'check' ? (
            <div className="diagnostics">
              {report.diagnostics.length === 0 && <p className="muted">No problems. {report.summary.states.length} states, {report.summary.inputs.length} inputs, {report.summary.events.length} events.</p>}
              {report.diagnostics.map((d, i) => (
                <div key={i} className={`diag ${d.level}`}>
                  <span className="lvl">{icon[d.level]}</span>
                  <div>
                    <p>
                      {d.at && <code>{d.at}</code>} {d.message}
                    </p>
                    {d.hint && <p className="hint">{d.hint}</p>}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <Filmstrip source={live} report={report} />
          )}
        </section>
      </div>
    </main>
  );
}
