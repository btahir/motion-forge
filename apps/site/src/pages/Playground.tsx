import { useEffect, useMemo, useRef, useState } from 'react';
import { check, loadScene, Player, renderFrameTree, serializeXML, prefixIds, type CheckReport } from 'motion-forge';
import { Live } from '../components/Live';
import { CopyButton } from '../components/Code';
import { presetByName, presets } from '../presets';

const DEFAULT = 'scout';

async function pack(text: string): Promise<string> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  let bin = '';
  bytes.forEach(b => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
async function unpack(code: string): Promise<string> {
  const bin = atob(code.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Response(stream).text();
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
  const editorHost = useRef<HTMLDivElement>(null);
  const editor = useRef<{ set(text: string): void } | undefined>(undefined);
  const latest = useRef(source);
  latest.current = source;
  const report = useMemo(() => check(live), [live]);

  // Load from URL hash.
  useEffect(() => {
    const apply = async () => {
      const hash = new URLSearchParams(location.hash.slice(1));
      const name = hash.get('preset');
      const src = hash.get('src');
      let text: string | undefined;
      if (src) text = await unpack(src).catch(() => undefined);
      else if (name && presetByName(name)) {
        text = presetByName(name)!.source;
        setPresetName(name);
      }
      if (text) {
        setSource(text);
        setLive(text);
        editor.current?.set(text);
      }
    };
    void apply();
    addEventListener('hashchange', apply);
    return () => removeEventListener('hashchange', apply);
  }, []);

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
            EditorView.updateListener.of(u => {
              if (u.docChanged) setSource(u.state.doc.toString());
            }),
          ],
        }),
      });
      editor.current = { set: text => view!.dispatch({ changes: { from: 0, to: view!.state.doc.length, insert: text } }) };
    })();
    return () => {
      destroyed = true;
      view?.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const choose = (name: string) => {
    const p = presetByName(name);
    if (!p) return;
    setPresetName(name);
    setSource(p.source);
    setLive(p.source);
    editor.current?.set(p.source);
    history.replaceState(null, '', `#preset=${name}`);
  };

  const share = async () => {
    const url = `${location.origin}/playground/#src=${await pack(source)}`;
    history.replaceState(null, '', url);
    setShareUrl(url);
    void navigator.clipboard?.writeText(url).catch(() => undefined);
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
      <div className="pg-bar">
        <label className="pg-select">
          <span>Preset</span>
          <select value={presetName} onChange={e => choose(e.target.value)}>
            {presets.map(p => (
              <option key={p.name} value={p.name}>
                {p.title} ({p.name})
              </option>
            ))}
          </select>
        </label>
        <div className="pg-actions">
          <span className={`pg-status ${report.ok ? 'ok' : 'bad'}`}>{report.ok ? `valid · ${report.counts.warnings} warnings` : `${report.counts.errors} errors`}</span>
          <button className="btn small" onClick={download}>
            Download .svg
          </button>
          <button className="btn small primary" onClick={() => void share()}>
            {shareUrl ? 'Link copied' : 'Share link'}
          </button>
        </div>
      </div>
      <div className="pg-grid">
        <section className="pg-editor" aria-label="Source">
          <div ref={editorHost} className="cm-host">
            <textarea aria-label="Motion SVG source" value={source} onChange={e => setSource(e.target.value)} spellCheck={false} />
          </div>
        </section>
        <section className="pg-preview" aria-label="Preview">
          {report.ok ? <Live key={live} source={live} className="pg-live" /> : <div className="pg-broken">Fix the errors to see it move. The last valid version isn’t kept on purpose, so what you see always matches the file.</div>}
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
