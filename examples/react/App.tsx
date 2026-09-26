import { useRef, useState } from 'react';
import { MotionForge, type MotionForgeHandle } from 'motion-forge/react';
// With Vite (or any bundler that supports ?raw), import Motion SVG files as text.
import scout from 'motion-forge/presets/scout.svg?raw';
import gauge from 'motion-forge/presets/gauge.svg?raw';

export default function App() {
  const mascot = useRef<MotionForgeHandle>(null);
  const [load, setLoad] = useState(40);
  const [log, setLog] = useState<string[]>([]);
  return (
    <main>
      <h1>A little more alive.</h1>
      <MotionForge
        ref={mascot}
        svg={scout}
        style={{ maxWidth: 320 }}
        onStateChange={state => setLog(l => [...l, `scout → ${state}`])}
      />
      <button onClick={() => mascot.current?.send('wave')}>Say hello</button>
      <button onClick={() => mascot.current?.send('celebrate')}>Celebrate</button>

      <MotionForge svg={gauge} inputs={{ value: load }} style={{ maxWidth: 320 }} />
      <label>
        Load <input type="range" min={0} max={100} value={load} onChange={e => setLoad(Number(e.target.value))} />
      </label>
      <pre>{log.join('\n')}</pre>
    </main>
  );
}
