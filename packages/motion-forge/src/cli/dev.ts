import { createServer } from 'node:http';
import { existsSync, readFileSync, watch } from 'node:fs';
import { basename, join } from 'node:path';
import { packageRoot } from './paths';
import { escapeText } from '../core/xml';

const PAGE = (name: string) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeText(name)} · motion-forge dev</title>
<style>
:root{color-scheme:light dark;--bg:#f5f3ee;--panel:#fffdf9;--ink:#1d1a16;--muted:#6f6a61;--line:#e3ddd2;--accent:#ff5a1f}
@media (prefers-color-scheme:dark){:root{--bg:#141311;--panel:#1c1a17;--ink:#f3efe7;--muted:#a39d92;--line:#2e2b26}}
*{box-sizing:border-box}body{margin:0;font:14px/1.45 ui-sans-serif,system-ui,-apple-system,sans-serif;background:var(--bg);color:var(--ink);display:grid;grid-template-columns:1fr 320px;height:100vh}
main{display:grid;place-items:center;padding:32px;min-width:0}#stage{width:min(72vh,100%);background:repeating-conic-gradient(#0000 0 25%,#8881 0 50%) 0 0/20px 20px;border-radius:14px}
aside{border-left:1px solid var(--line);background:var(--panel);padding:18px;overflow:auto}h1{font-size:15px;margin:0 0 2px}h2{font:600 11px/1 ui-monospace,monospace;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin:22px 0 10px}
.row{display:flex;flex-wrap:wrap;gap:6px}button{font:inherit;border:1px solid var(--line);background:transparent;color:var(--ink);border-radius:8px;padding:6px 10px;cursor:pointer}button:hover{border-color:var(--accent)}button.on{background:var(--ink);color:var(--panel);border-color:var(--ink)}
label{display:grid;grid-template-columns:90px 1fr 44px;align-items:center;gap:8px;margin:6px 0;font-size:13px}input[type=range]{accent-color:var(--accent)}
pre{white-space:pre-wrap;font:12px/1.5 ui-monospace,monospace;color:var(--muted);margin:0}.err{color:#e5484d}.muted{color:var(--muted);font-size:12px}
</style></head><body><main><div id="stage"></div></main><aside><h1>${escapeText(name)}</h1><div class="muted" id="meta">watching for changes…</div>
<h2>Playback</h2><div class="row"><button id="play">Pause</button><button id="restart">Restart state</button></div>
<h2>States</h2><div class="row" id="states"></div><h2>Events</h2><div class="row" id="events"></div><h2>Inputs</h2><div id="inputs"></div><h2>Check</h2><pre id="report"></pre></aside>
<script src="/runtime.js"></script><script>
const $=id=>document.getElementById(id);let inst,values={};
async function load(){const src=await (await fetch('/file?'+Date.now())).text();const MF=window.MotionForge;
 if(inst){values=Object.assign({},inst.player.inputs);inst.destroy()}
 const report=MF.check(src);$('report').textContent=MF.formatReport(report,${JSON.stringify(name).replace(/</g, '\\u003c')});$('report').className=report.ok?'':'err';
 inst=MF.mount($('stage'),src,{inputs:values,reducedMotion:false,onEvent:()=>sync()});const vb=inst.scene.viewBox;$('stage').style.aspectRatio=vb.width+'/'+vb.height;
 $('meta').textContent=new Date().toLocaleTimeString()+' · '+(report.ok?'valid':report.counts.errors+' errors');build()}
function build(){const s=inst.scene;$('states').replaceChildren(...s.layers.flatMap(l=>[...l.states.keys()].map(n=>{const b=document.createElement('button');b.textContent=(l.name==='main'?'':l.name+'/')+n;b.dataset.state=n;b.dataset.layer=l.name;b.onclick=()=>{inst.player.goto(n,{layer:l.name,blend:250});inst.play();sync()};return b})));
 $('events').replaceChildren(...[...s.events].map(e=>{const b=document.createElement('button');b.textContent=e;b.onclick=()=>inst.send(e);return b}));if(!s.events.size)$('events').innerHTML='<span class="muted">none</span>';
 $('inputs').replaceChildren(...[...s.inputs.values()].map(i=>{const l=document.createElement('label');const v=document.createElement('span');const x=document.createElement('input');
  if(i.type==='boolean'){x.type='checkbox';x.checked=!!inst.get(i.name);x.onchange=()=>inst.set(i.name,x.checked)}else{x.type='range';x.min=i.min;x.max=i.max;x.step=(i.max-i.min)/200;x.value=inst.get(i.name);x.oninput=()=>{inst.set(i.name,+x.value);v.textContent=(+x.value).toFixed(i.max-i.min>=10?0:2)}}
  l.append(Object.assign(document.createElement('span'),{textContent:i.name}),x,v);v.textContent=i.type==='boolean'?'':(+inst.get(i.name)).toFixed(i.max-i.min>=10?0:2);l.dataset.input=i.name;return l}));if(!s.inputs.size)$('inputs').innerHTML='<span class="muted">none</span>';sync()}
function sync(){for(const b of $('states').children)b.classList.toggle('on',inst.player.stateOf(b.dataset.layer)===b.dataset.state);for(const l of $('inputs').children){const n=l.dataset.input;if(!n)continue;const x=l.querySelector('input');const v=inst.get(n);if(x.type==='checkbox')x.checked=!!v;else if(document.activeElement!==x)x.value=v}}
$('play').onclick=()=>{if(inst.playing){inst.pause();$('play').textContent='Play'}else{inst.play();$('play').textContent='Pause'}};$('restart').onclick=()=>{inst.player.seek(0);inst.play()};
new EventSource('/events').onmessage=()=>load();load();
</script></body></html>`;

export async function startDevServer(file: string, port: number): Promise<void> {
  if (!existsSync(file)) throw new Error(`No such file: ${file}`);
  const runtime = join(packageRoot, 'dist/browser.global.js');
  const clients = new Set<import('node:http').ServerResponse>();
  let timer: NodeJS.Timeout | undefined;
  watch(file, () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      for (const c of clients) c.write('data: change\n\n');
    }, 80);
  });
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (url.pathname === '/') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(PAGE(basename(file)));
    } else if (url.pathname === '/file') {
      res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
      res.end(readFileSync(file));
    } else if (url.pathname === '/runtime.js') {
      res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8' });
      res.end(readFileSync(runtime));
    } else if (url.pathname === '/events') {
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
      res.write(': connected\n\n');
      clients.add(res);
      req.on('close', () => clients.delete(res));
    } else {
      res.writeHead(404);
      res.end();
    }
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve());
  });
  process.stdout.write(`motion-forge dev → http://127.0.0.1:${port}  (watching ${basename(file)}; Ctrl+C to stop)\n`);
}
