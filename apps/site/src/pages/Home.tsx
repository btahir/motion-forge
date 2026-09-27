import { useState } from 'react';
import { Live } from '../components/Live';
import { Code, Command, CopyButton } from '../components/Code';
import { categories, presetByName, presets } from '../presets';
import loop from '../generated/loop.json';
import size from '../../../../docs/size.json';
import syncCloud from '../showcase/sync-cloud.svg?raw';
import streakPlant from '../showcase/streak-plant.svg?raw';
import addButton from '../showcase/add-button.svg?raw';
import likeExample from '../../../../examples/like.svg?raw';

const SHOWCASE = [
  {
    source: syncCloud,
    bg: '#0b1020',
    prompt: 'Our file-sync app needs a hero animation for the empty dashboard: a little cloud character that floats and blinks, looks toward the mouse, and when sync starts it holds a spinning sync arrow; when sync finishes it does a happy bounce with a checkmark. Sync progress (0-100) should show as a ring around it. Make it on-brand.',
    stats: '5 visual iterations · ~6 minutes · 0 errors, 0 warnings',
  },
  {
    source: streakPlant,
    bg: '#fff8ec',
    prompt: 'A watering-streak widget: a plant in a pot whose growth reflects the streak days (0-30): at 0 it’s a seed, it sprouts, gets leaves, and at 30 it blooms with a flower. When the user waters, a watering can tilts in, water drops fall, and the plant does a happy wiggle.',
    stats: '4 checks, 2 previews, 2 records · 0 errors, 0 warnings',
  },
  {
    source: addButton,
    bg: '#fff8ec',
    prompt: 'Also a small ‘add to garden’ button icon: a plus that morphs into a check when clicked, with a little leaf burst.',
    stats: '5 checks, 2 previews, 3 records · 0 errors, 0 warnings',
  },
];

const kb = (n: number) => `${Math.round(n / 100) / 10} KB`;
const runtimeGz = size.results['web component (motion-forge/element)'].gzip;

const HERO_FALLBACK = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240"><title>Motion Forge</title><circle id="c" cx="120" cy="120" r="50" fill="#ff5a1f"/><metadata type="application/motion+json"><![CDATA[{"states":{"idle":{"duration":2000,"loop":true,"animate":{"#c":{"scale":[1,1.1,1]}}}}}]]></metadata></svg>`;


const FEATURES: [string, string][] = [
  ['State machines', 'Named states, events, conditions over inputs, one-shots with “next”, and parallel layers. Every switch blends from what’s on screen.'],
  ['Real motion', 'Springs fitted to your timing, 20+ easings, stagger, delays, ping-pong loops, anticipation and overshoot.'],
  ['Morph anything', 'Path morphing between shapes with different point counts, stroke drawing, polygon and color morphs in OKLab.'],
  ['Live data', 'Inputs bind straight to properties with ranges, multi-stop maps and text templates. Smoothing makes data glide.'],
  ['Interactions in the file', 'Click, hover, press, pointer-follow, drag and scroll-into-view. No host code; keyboard access included.'],
  ['Start with SVG', 'Use supported vector artwork from Figma, Illustrator or icon sets. Scripts, external URLs and unsupported elements are removed with diagnostics.'],
  ['Accessible by default', 'Titles become labels, click targets become buttons, and prefers-reduced-motion freezes loops.'],
  ['Runs everywhere', `A ${kb(runtimeGz)} web component, a React component with SSR, or a vanilla mount(). Shadow DOM keeps page CSS out.`],
];

const cmp = (name: string) => (size as { compare?: Record<string, { gzip: number }> }).compare?.[name]?.gzip ?? 0;

const COMPARE: { row: string; mf: string; lottie: string; rive: string; css: string }[] = [
  { row: 'Source format', mf: 'SVG + JSON text', lottie: 'Lottie JSON / dotLottie', rive: 'RML text; .riv runtime files', css: 'CSS / JS code' },
  { row: 'Interactive states', mf: 'Built in', lottie: 'dotLottie extension', rive: 'Built in', css: 'Hand-written' },
  { row: 'Agent authoring', mf: 'Text, skill, CLI and MCP', lottie: 'JSON tooling and player APIs', rive: 'RML and CLI', css: 'CSS / JS in your project' },
  { row: 'Visual verification', mf: 'Lint, state/flow sheets, scripted recordings', lottie: 'Player / browser tooling', rive: 'CLI capture, simulated inputs and script tests', css: 'Browser tooling' },
  { row: 'Web runtime (gzip, JS + wasm)', mf: kb(runtimeGz), lottie: `${kb(cmp('lottie-web (full)'))} lottie-web; ${kb(cmp('@lottiefiles/dotlottie-web (state machines)'))} dotLottie`, rive: `${kb(cmp('@rive-app/canvas'))} @rive-app/canvas`, css: 'Native CSS; JS library size varies' },
  { row: 'Editor', mf: 'Your editor + live playground', lottie: 'After Effects / Lottie Creator', rive: 'Rive editor or CLI', css: 'Your editor' },
  { row: 'License', mf: 'MIT, format and runtime', lottie: 'MIT runtime', rive: 'MIT runtime, closed editor', css: '—' },
];

export function Home() {
  const hero = presetByName('scout') ?? presets[0];
  const [filter, setFilter] = useState<string>('all');
  const shown = presets.filter(p => filter === 'all' || p.category === filter);
  return (
    <main>
      <section className="hero wrap">
        <div className="hero-copy">
          <p className="eyebrow">Open-source · MIT · for coding agents and the people who direct them</p>
          <h1>
            Animations your agent can <em>write</em>, <em>see</em>, and <em>ship</em>.
          </h1>
          <p className="lede">
            Motion Forge makes interactive animation plain text: an SVG plus a small JSON state machine. Agents write it, the CLI renders frames and interaction flows, and a {kb(runtimeGz)} runtime plays it on the web, with springs, morphs, clicks, hovers and live data.
          </p>
          <Command cmd="npx motion-forge init" />
          <div className="hero-actions">
            <a className="btn primary" href="/playground/">
              Open the playground
            </a>
            <a className="btn" href="#presets">
              Browse {presets.length} presets
            </a>
          </div>
        </div>
        <div className="hero-art">
          <Live source={hero?.source ?? HERO_FALLBACK} className="hero-live" label={hero?.title} />
          <p className="hero-hint">Live. Move your pointer, click, and try the controls. This file is {hero ? `${(hero.source.length / 1024).toFixed(1)} KB of text` : 'plain text'}.</p>
        </div>
      </section>

      <section className="band">
        <div className="wrap">
          <div className="section-head">
            <p className="eyebrow">The loop</p>
            <h2>Writing motion is only half the job. Make it easy to check.</h2>
            <p>
              A model can’t watch a timeline. So every Motion SVG comes with tools that turn motion into things a model can read: structured diagnostics, a map of the artwork, and contact sheets of every state over time.
            </p>
          </div>
          <ol className="loop">
            <li>
              <span className="step">1 · write</span>
              <h3>Plain SVG, plus intent</h3>
              <p>States, keyframes, inputs and interactions in JSON inside the SVG. This complete like button is two states, one input and a click. Click the heart to run this exact file.</p>
              <div className="try">
                <Live source={likeExample} label="Like button" />
              </div>
              <Code code={likeExample.trimEnd()} lang="xml" title="like.svg" />
            </li>
            <li>
              <span className="step">2 · check</span>
              <h3>Errors a model can act on</h3>
              <p>Paths, “did you mean”, and motion lint: loop seams, clipping, dead states, no-op tracks.</p>
              <Code code={`$ npx motion-forge check ${loop.file}\n${loop.check}`} lang="text" title="real output" />
            </li>
            <li>
              <span className="step">3 · see</span>
              <h3>Every state, frame by frame</h3>
              <p>
                <code>preview</code> renders a contact sheet the agent reads as an image. <code>record</code> plays scripted clicks and data into a GIF or MP4.
              </p>
              <a className="sheet" href={loop.sheet}>
                <img src={loop.sheet} alt={`Contact sheet generated by motion-forge preview for ${loop.file}`} loading="lazy" />
              </a>
            </li>
            <li>
              <span className="step">4 · ship</span>
              <h3>Drop it in</h3>
              <p>One tag or one component. Events and inputs are the API.</p>
              <Code
                code={`<script type="module" src="https://cdn.jsdelivr.net/npm/motion-forge/dist/element.js"></script>\n<motion-forge src="/like.svg"></motion-forge>\n\n// React\n<MotionForge svg={like} inputs={{ liked }} />`}
                lang="xml"
                title="anywhere"
              />
            </li>
          </ol>
        </div>
      </section>

      <section className="wrap">
        <div className="section-head">
          <p className="eyebrow">One prompt, no presets</p>
          <h2>What a fresh agent made with just the skill and the CLI.</h2>
          <p>
            We gave new agents a user’s request and nothing else: no presets to copy, only <code>SKILL.md</code>, the reference and the CLI. These are their files, unedited, running live. Each agent checked, previewed and recorded its way to done.
          </p>
        </div>
        <div className="showcase">
          {SHOWCASE.map(item => (
            <article key={item.prompt} className="show">
              <div style={{ ['--show-bg' as string]: item.bg }} className="show-stage">
                <Live source={item.source} />
              </div>
              <div className="show-body">
                <p className="eyebrow">The prompt</p>
                <blockquote>“{item.prompt}”</blockquote>
                <p className="muted small">{item.stats}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="wrap" id="presets">
        <div className="section-head">
          <p className="eyebrow">Presets</p>
          <h2>Start from something good.</h2>
          <p>
            Every preset is a single editable file, authored with the same loop your agent uses. Copy one with <code>npx motion-forge add &lt;name&gt;</code>, then ask your agent to make it yours.
          </p>
        </div>
        <div className="filters" role="tablist" aria-label="Preset categories">
          {['all', ...categories].map(c => (
            <button key={c} role="tab" aria-selected={filter === c} className={filter === c ? 'on' : ''} onClick={() => setFilter(c)}>
              {c}
            </button>
          ))}
        </div>
        <div className="grid">
          {shown.map(p => (
            <article key={p.name} className="card">
              <Live source={p.source} label={p.title} />
              <div className="card-body">
                <div className="card-title">
                  <h3>{p.title}</h3>
                  <span className="tag">{p.category}</span>
                </div>
                <p>{p.description}</p>
                <div className="card-actions">
                  <code className="add">npx motion-forge add {p.name}</code>
                  <CopyButton text={`npx motion-forge add ${p.name}`} />
                  <a href={`/playground/#preset=${p.name}`}>Edit</a>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="band">
        <div className="wrap">
          <div className="section-head">
            <p className="eyebrow">What’s in a file</p>
            <h2>Everything is declared. Nothing is hidden in code.</h2>
          </div>
          <div className="features">
            {FEATURES.map(([t, d]) => (
              <div key={t} className="feature">
                <h3>{t}</h3>
                <p>{d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="wrap">
        <div className="section-head">
          <p className="eyebrow">Where it fits</p>
          <h2>An open, text-first alternative for interactive UI motion.</h2>
          <p>Several tools now support agent authoring and interactive animation. Choose Motion Forge when you want ordinary SVG artwork, an MIT toolchain, and a compact web runtime, with no account required.</p>
        </div>
        <div className="table-scroll">
          <table className="compare">
            <thead>
              <tr>
                <th>Capability</th>
                <th>Motion Forge</th>
                <th>Lottie</th>
                <th>Rive</th>
                <th>CSS / JS libraries</th>
              </tr>
            </thead>
            <tbody>
              {COMPARE.map(r => (
                <tr key={r.row}>
                  <th scope="row">{r.row}</th>
                  <td className="mf">{r.mf}</td>
                  <td>{r.lottie}</td>
                  <td>{r.rive}</td>
                  <td>{r.css}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="footnote">Download sizes measured {size.measured} with <code>pnpm size:compare</code> from pinned npm packages; not a rendering-performance benchmark. See <a href="https://rive.app/docs/cli/overview">Rive’s CLI and RML</a> and <a href="https://docs.lottiefiles.com/en/format/dotlottie/interactivity">dotLottie interactivity</a>. Motion Forge doesn’t import Lottie or Rive files.</p>
      </section>

      <section className="band start">
        <div className="wrap start-inner">
          <div className="section-head">
            <p className="eyebrow">Get started</p>
            <h2>Give your agent the skill.</h2>
            <p>
              <code>init</code> installs the skill for Claude Code and a note in <code>AGENTS.md</code> that Cursor, Codex and others read. Then just ask: “add a like button that pops”, “make our mascot wave when the upload finishes”.
            </p>
          </div>
          <div className="start-code">
            <Code code={`# in your project\nnpx motion-forge init\nnpm i motion-forge\n\n# the loop your agent runs\nnpx motion-forge add like --dir src/motion\nnpx motion-forge check src/motion/like.svg\nnpx motion-forge preview src/motion/like.svg\nnpx motion-forge record src/motion/like.svg --set liked=true@400`} lang="sh" title="terminal" />
            <Code code={`{\n  "mcpServers": {\n    "motion-forge": { "command": "npx", "args": ["motion-forge", "mcp"] }\n  }\n}`} lang="json" title="MCP (Claude Desktop, Cursor, Windsurf…)" />
          </div>
        </div>
      </section>
    </main>
  );
}
