import { useRef, useState } from 'react';
import { MotionForge, type MotionForgeHandle } from 'motion-forge/react';
import { createPreset } from 'motion-forge/presets';
const scout = createPreset('scout');
const signal = createPreset('signal');
export default function App() {
  const player = useRef<MotionForgeHandle>(null);
  const [intensity, setIntensity] = useState(62);
  return <main>
    <h1>A little more alive.</h1>
    <MotionForge ref={player} document={scout} title="A friendly explorer" style={{ maxWidth: 420 }}/>
    <button onClick={() => player.current?.send('wave')}>Say hello</button>
    <button onClick={() => player.current?.pause()}>Pause</button>
    <button onClick={() => player.current?.play()}>Play</button>
    <MotionForge document={signal} inputs={{ intensity }} title={`Intensity: ${intensity} out of 100`} style={{ maxWidth: 420 }}/>
    <label>Intensity <input type="range" min={0} max={100} value={intensity} onChange={event => setIntensity(Number(event.target.value))}/></label>
  </main>;
}
