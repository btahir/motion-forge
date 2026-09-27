import { useEffect, useMemo, useRef, useState } from 'react';
import { MotionForge, type MotionForgeHandle } from 'motion-forge/react';
import { loadScene } from 'motion-forge';

/** A live Motion SVG with auto-generated controls for its events, inputs and states. */
export function Live({ source, controls = true, transport = false, className = '', label }: { source: string; controls?: boolean; transport?: boolean; className?: string; label?: string }) {
  const handle = useRef<MotionForgeHandle>(null);
  const scene = useMemo(() => loadScene(source), [source]);
  const inputs = [...scene.inputs.values()];
  const [state, setState] = useState(scene.layers[0]?.initial ?? '');
  const [values, setValues] = useState<Record<string, number | boolean>>(() => Object.fromEntries(inputs.map(i => [i.name, i.type === 'boolean' ? !!i.default : i.default])));
  const [lastEmit, setLastEmit] = useState<string>();
  const [playing, setPlaying] = useState(true);
  const [time, setTime] = useState(0);
  const [log, setLog] = useState<string[]>([]);
  const current = scene.layers[0]?.states.get(state);
  const duration = current ? current.loop === Infinity ? current.duration : current.completeAt : 0;
  useEffect(() => {
    const sync = () => {
      const instance = handle.current?.instance;
      if (!instance) return;
      setState(instance.state);
      if (transport) { setTime(instance.player.time); setPlaying(instance.playing); }
    };
    sync();
    if (!transport) return;
    const timer = setInterval(sync, 100);
    return () => clearInterval(timer);
  }, [source, transport]);

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
            if (transport && e.type !== 'input') {
              const message = e.type === 'statechange' ? `${e.layer}: ${e.from} → ${e.to}` : e.type === 'emit' ? `emit ${e.name}` : `${e.layer}: ${e.state} complete`;
              const ms = Math.round(handle.current?.instance?.player.elapsed ?? 0);
              setLog(previous => [...previous.slice(-11), `${ms}ms · ${message}`]);
            }
          }}
        />
      </div>
      {controls && (
        <div className="live-controls">
          {transport && <div className="transport" aria-label="Playback controls">
            <div className="live-row">
              <button className="chip-btn" onClick={() => { if (playing) handle.current?.pause(); else handle.current?.play(); setPlaying(!playing); }}>{playing ? 'Pause' : 'Play'}</button>
              <button className="chip-btn" onClick={() => { handle.current?.goto(state); handle.current?.instance?.seek(0); setTime(0); setPlaying(false); }}>Restart</button>
              <label>State <select aria-label="Playback state" value={state} onChange={e => { handle.current?.goto(e.target.value); handle.current?.instance?.seek(0); setTime(0); setPlaying(false); }}>
                {[...(scene.layers[0]?.states.keys() ?? [])].map(name => <option key={name} value={name}>{name}</option>)}
              </select></label>
            </div>
            <label className="timeline"><span>Time</span><input aria-label="Animation time" type="range" min={0} max={duration || 1} step={1} disabled={!duration} value={duration ? current?.loop === Infinity ? time % duration : Math.min(time, duration) : 0} onChange={e => { const ms = Number(e.target.value); handle.current?.instance?.seek(ms); setTime(ms); setPlaying(false); }}/><output>{Math.round(duration && current?.loop === Infinity ? time % duration : Math.min(time, duration))} / {Math.round(duration)}ms</output></label>
            <p className="transport-note">Scrub the main state; Play resumes the full state machine.</p>
          </div>}
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
          {transport && <details className="event-log"><summary>Event log ({log.length})</summary>{log.length ? <ol>{log.map((line, i) => <li key={i}>{line}</li>)}</ol> : <p>Trigger an event or change an input to see state transitions.</p>}</details>}
        </div>
      )}
    </div>
  );
}
