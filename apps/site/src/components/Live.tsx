import { useMemo, useRef, useState } from 'react';
import { MotionForge, type MotionForgeHandle } from 'motion-forge/react';
import { loadScene } from 'motion-forge';

/** A live Motion SVG with auto-generated controls for its events, inputs and states. */
export function Live({ source, controls = true, className = '', label }: { source: string; controls?: boolean; className?: string; label?: string }) {
  const handle = useRef<MotionForgeHandle>(null);
  const scene = useMemo(() => loadScene(source), [source]);
  const inputs = [...scene.inputs.values()];
  const [state, setState] = useState(scene.layers[0]?.initial ?? '');
  const [values, setValues] = useState<Record<string, number | boolean>>(() => Object.fromEntries(inputs.map(i => [i.name, i.type === 'boolean' ? !!i.default : i.default])));
  const [lastEmit, setLastEmit] = useState<string>();

  return (
    <div className={`live ${className}`}>
      <div className="live-stage">
        <MotionForge
          ref={handle}
          svg={source}
          title={label}
          onEvent={e => {
            if (e.type === 'statechange' && e.layer === 'main') setState(e.to);
            if (e.type === 'input') setValues(v => ({ ...v, [e.name]: e.value }));
            if (e.type === 'emit') setLastEmit(e.name);
          }}
        />
      </div>
      {controls && (
        <div className="live-controls">
          <div className="live-state" aria-live="polite">
            <span className="dot" />
            {state}
            {lastEmit && <span className="emit">emit · {lastEmit}</span>}
          </div>
          {!!scene.events.size && (
            <div className="live-row">
              {[...scene.events].map(ev => (
                <button key={ev} type="button" className="chip-btn" onClick={() => handle.current?.send(ev)}>
                  send <b>{ev}</b>
                </button>
              ))}
            </div>
          )}
          {inputs.map(i =>
            i.type === 'boolean' ? (
              <label key={i.name} className="live-input bool">
                <span>{i.name}</span>
                <input type="checkbox" role="switch" checked={!!values[i.name]} onChange={e => handle.current?.set(i.name, e.target.checked)} />
              </label>
            ) : (
              <label key={i.name} className="live-input">
                <span>{i.name}</span>
                <input type="range" min={i.min} max={i.max} step={(i.max - i.min) / 200} value={Number(values[i.name])} onChange={e => handle.current?.set(i.name, Number(e.target.value))} />
                <output>{Number(values[i.name]).toFixed(i.max - i.min >= 10 ? 0 : 2)}</output>
              </label>
            ),
          )}
        </div>
      )}
    </div>
  );
}
