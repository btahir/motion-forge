import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { check, formatReport } from '../core/check';
import { renderSVG } from '../core/render';
import { loadScene } from '../core/scene';
import { contactSheet, parseScript, rasterize, recordGIF, recordStrip } from '../node/preview';
import { inspectTree } from './inspect';
import { listPresets, skillDir, VERSION } from './paths';

type Json = Record<string, unknown>;
const source = {
  type: 'object',
  properties: {
    path: { type: 'string', description: 'Path to a Motion SVG file' },
    svg: { type: 'string', description: 'Motion SVG source (instead of path)' },
  },
};
const TOOLS = [
  { name: 'motion_docs', description: 'The complete Motion SVG format reference. Read it before writing or editing a Motion SVG.', inputSchema: { type: 'object', properties: {} } },
  { name: 'motion_presets', description: 'List ready-made Motion SVG presets (loaders, toggles, feedback, characters, data widgets). Returns names, events and inputs.', inputSchema: { type: 'object', properties: {} } },
  { name: 'motion_preset_source', description: 'Get the source of a preset to adapt or save into the project.', inputSchema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] } },
  { name: 'motion_check', description: 'Validate and lint a Motion SVG: errors, motion warnings (loop seams, clipping, static channels), states, events and inputs.', inputSchema: source },
  { name: 'motion_inspect', description: 'Element tree with ids, classes and bounds, plus which properties are animated.', inputSchema: source },
  {
    name: 'motion_preview',
    description: 'Render a contact sheet image: each state sampled over time, plus sweeps of bound inputs. Look at it after every change.',
    inputSchema: { ...source, properties: { ...source.properties, frames: { type: 'number' }, states: { type: 'array', items: { type: 'string' } }, inputs: { type: 'object' } } },
  },
  {
    name: 'motion_render',
    description: 'Render one frame as a PNG image at a state and time.',
    inputSchema: { ...source, properties: { ...source.properties, state: { type: 'string' }, time: { type: 'number' }, inputs: { type: 'object' }, width: { type: 'number' } } },
  },
  {
    name: 'motion_record',
    description: 'Play the real state machine with scripted events/inputs. Returns an event log and an image grid of frames over time (or writes a GIF if out ends in .gif). Script items: "event@ms" or "input=value@ms".',
    inputSchema: { ...source, properties: { ...source.properties, script: { type: 'array', items: { type: 'string' } }, state: { type: 'string' }, duration: { type: 'number' }, out: { type: 'string' } } },
  },
];

function readSource(args: Json): string {
  if (typeof args.svg === 'string') return args.svg;
  if (typeof args.path === 'string') {
    const p = resolve(args.path);
    if (!existsSync(p)) throw new Error(`No such file: ${p}`);
    return readFileSync(p, 'utf8');
  }
  throw new Error('Provide "path" or "svg"');
}

async function call(name: string, args: Json): Promise<{ content: Json[]; isError?: boolean }> {
  const text = (t: string) => ({ type: 'text', text: t });
  const image = (png: Buffer) => ({ type: 'image', data: png.toString('base64'), mimeType: 'image/png' });
  switch (name) {
    case 'motion_docs':
      return { content: [text(readFileSync(join(skillDir, 'reference.md'), 'utf8'))] };
    case 'motion_presets':
      return { content: [text(JSON.stringify(listPresets().map(({ file: _f, ...p }) => p), null, 2))] };
    case 'motion_preset_source': {
      const p = listPresets().find(p => p.name === args.name);
      if (!p) return { content: [text(`Unknown preset. Available: ${listPresets().map(p => p.name).join(', ')}`)], isError: true };
      return { content: [text(readFileSync(p.file, 'utf8'))] };
    }
    case 'motion_check': {
      const report = check(readSource(args));
      return { content: [text(formatReport(report, typeof args.path === 'string' ? args.path : 'input'))], isError: !report.ok };
    }
    case 'motion_inspect':
      return { content: [text(inspectTree(loadScene(readSource(args))).text)] };
    case 'motion_preview': {
      const scene = loadScene(readSource(args));
      if (!scene.ok) return { content: [text(formatReport(check(scene)))], isError: true };
      const sheet = contactSheet(scene, { frames: args.frames as number | undefined, states: args.states as string[] | undefined, inputs: args.inputs as Record<string, number> | undefined });
      return { content: [text(sheet.rows.map(r => r.title).join('\n')), image(sheet.png)] };
    }
    case 'motion_render': {
      const scene = loadScene(readSource(args));
      const svg = renderSVG(scene, { state: args.state as string | undefined, time: args.time as number | undefined, inputs: args.inputs as Record<string, number> | undefined });
      return { content: [image(rasterize(svg, (args.width as number) ?? Math.max(400, scene.width)).png)] };
    }
    case 'motion_record': {
      const scene = loadScene(readSource(args));
      if (!scene.ok) return { content: [text(formatReport(check(scene)))], isError: true };
      const dir = join(tmpdir(), 'motion-forge');
      mkdirSync(dir, { recursive: true });
      const out = typeof args.out === 'string' ? resolve(args.out) : join(dir, `record-${Date.now()}.png`);
      const opts = { state: args.state as string | undefined, duration: args.duration as number | undefined, script: parseScript((args.script as string[]) ?? []) };
      if (out.endsWith('.gif')) {
        const res = recordGIF(scene, opts);
        writeFileSync(out, res.gif);
        return { content: [text(`Wrote ${out}\n${res.log.join('\n')}`)] };
      }
      const strip = recordStrip(scene, opts);
      return { content: [text(strip.log.join('\n')), image(strip.png)] };
    }
  }
  return { content: [text(`Unknown tool ${name}`)], isError: true };
}

/** Minimal MCP server over stdio (newline-delimited JSON-RPC 2.0). */
export async function serveMCP(): Promise<void> {
  const send = (msg: Json) => process.stdout.write(JSON.stringify(msg) + '\n');
  const rl = createInterface({ input: process.stdin });
  for await (const line of rl) {
    if (!line.trim()) continue;
    let msg: Json;
    try {
      msg = JSON.parse(line);
    } catch {
      send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
      continue;
    }
    const { id, method, params } = msg as { id?: number | string; method: string; params?: Json };
    if (id === undefined) continue; // notifications
    try {
      if (method === 'initialize') {
        send({ jsonrpc: '2.0', id, result: { protocolVersion: (params?.protocolVersion as string) ?? '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'motion-forge', version: VERSION }, instructions: 'Motion Forge creates interactive animations as Motion SVG files. Call motion_docs first, then write files, and verify with motion_check and motion_preview (look at the image) after every edit.' } });
      } else if (method === 'tools/list') send({ jsonrpc: '2.0', id, result: { tools: TOOLS } });
      else if (method === 'tools/call') send({ jsonrpc: '2.0', id, result: await call(String(params?.name), (params?.arguments as Json) ?? {}) });
      else if (method === 'ping') send({ jsonrpc: '2.0', id, result: {} });
      else send({ jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } });
    } catch (e) {
      send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: (e as Error).message }], isError: true } });
    }
  }
}
