import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { check, formatReport } from '../core/check';
import { loadScene, type Scene } from '../core/scene';
import { renderSVG } from '../core/render';
import { Player } from '../core/player';
import { contactSheet, parseScript, rasterize, recordFrames, recordGIF, recordStrip, type RecordOptions } from '../node/preview';
import { formatColor } from '../core/color';
import { startDevServer } from './dev';
import { serveMCP } from './mcp';
import { inspectTree } from './inspect';
import { TEMPLATE } from './template';
import { listPresets, skillDir, VERSION, type PresetInfo } from './paths';

interface Args {
  _: string[];
  flags: Record<string, string[]>;
}
function parseArgs(argv: string[]): Args {
  const out: Args = { _: [], flags: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a.startsWith('--')) {
      const [k, inline] = a.slice(2).split(/=(.*)/s);
      const next = argv[i + 1];
      const value = inline ?? (['help', 'version', 'json', 'strict', 'force'].includes(k!) ? 'true' : next !== undefined && !next.startsWith('--') ? (i++, next) : 'true');
      (out.flags[k!] ??= []).push(value);
    } else if (a === '-h') (out.flags.help ??= []).push('true');
    else out._.push(a);
  }
  return out;
}
const flag = (a: Args, k: string) => a.flags[k]?.[a.flags[k]!.length - 1];
const num = (a: Args, k: string) => (flag(a, k) === undefined ? undefined : Number(flag(a, k)));

function parseInputs(items: string[] | undefined): Record<string, number | boolean> {
  const out: Record<string, number | boolean> = {};
  for (const item of items ?? []) {
    if (item.includes('@')) continue;
    const [k, v] = item.split('=');
    if (!k || v === undefined) throw new UsageError(`--set expects name=value, got "${item}"`);
    out[k] = v === 'true' ? true : v === 'false' ? false : Number(v);
  }
  return out;
}

class UsageError extends Error {}

function readSource(file: string): string {
  if (file === '-') return readFileSync(0, 'utf8');
  if (!existsSync(file)) throw new UsageError(`No such file: ${file}`);
  return readFileSync(file, 'utf8');
}

function defaultOut(file: string, suffix: string): string {
  const dir = join(tmpdir(), 'motion-forge');
  mkdirSync(dir, { recursive: true });
  return join(dir, `${file === '-' ? 'stdin' : basename(file, extname(file))}${suffix}`);
}

function loadOrFail(file: string, src: string): Scene {
  const scene = loadScene(src);
  const errors = scene.diagnostics.filter(d => d.level === 'error');
  if (errors.length) {
    process.stderr.write(formatReport(check(scene), file) + '\n');
    throw new ExitError(1);
  }
  return scene;
}
class ExitError extends Error {
  constructor(readonly code: number) {
    super(`exit ${code}`);
  }
}

const HELP = `motion-forge ${VERSION} — interactive animations as plain text, with eyes for agents

Create
  new <file.svg> [--from <preset>]      Start a Motion SVG (working template, or a copy of a preset)
  add <preset...> [--dir motion]        Copy presets into your project
  list [--json]                         Browse the preset library (events, inputs, emits)
  init [--dir .]                        Install the agent skill (.claude/skills) and AGENTS.md notes

Verify (use these after every edit)
  check <file> [--json] [--strict]      Validate and lint; strict also fails on warnings
  preview <file> [--out f.png]          Contact sheet: every state over time, every event/toggle flow,
          [--frames 8] [--state s]      and input sweeps. Open the PNG and look at it.
          [--set k=v] [--cell 200] [--bg '#0b1020']   (--bg: preview on your app's background)
  record <file> [--out f.png|gif|mp4]   Play the real state machine with a script. Prints an event log;
          [--send event@ms]             .png (default) is a grid of frames you can read, .gif/.mp4 for people.
          [--set input=value@ms] [--state s] [--duration ms] [--fps 30] [--width 480] [--cells 12] [--bg color]
  render <file> [--time ms] [--state s] [--set k=v] [--out f.svg|f.png] [--width px]
  sample <file> [--state s] [--time ms] [--set k=v]   Exact property values at a moment (JSON)
  inspect <file> [--json]               Element tree with ids, classes, bounds and what animates

Learn and connect
  docs                                  Print the complete format reference
  dev <file> [--port 4777]              Live preview with controls; reloads when the file changes
  mcp                                   Run as an MCP server (stdio) for Claude, Cursor, Codex…

Files are plain SVG: they render anywhere, and play with <motion-forge> or motion-forge/react.`;

function commandHelp(command: string): string | undefined {
  const lines = HELP.split('\n');
  const start = lines.findIndex(l => l.startsWith(`  ${command} `) || l === `  ${command}`);
  if (start < 0) return;
  const out = [lines[start]!];
  for (let i = start + 1; i < lines.length && /^ {10}/.test(lines[i]!); i++) out.push(lines[i]!);
  return `Usage:\n${out.join('\n')}`;
}

export async function main(argv: string[]): Promise<number> {
  const args = parseArgs(argv);
  const [command, ...rest] = args._;
  try {
    if (!command || command === 'help' || flag(args, 'help')) {
      const specific = command && command !== 'help' ? commandHelp(command) : rest[0] ? commandHelp(rest[0]) : undefined;
      process.stdout.write((specific ?? HELP) + '\n');
      return 0;
    }
    if (command === '--version' || command === 'version' || flag(args, 'version')) {
      process.stdout.write(VERSION + '\n');
      return 0;
    }
    switch (command) {
      case 'check': {
        const file = rest[0];
        if (!file) throw new UsageError('Usage: motion-forge check <file.svg>');
        const report = check(readSource(file));
        process.stdout.write((flag(args, 'json') ? JSON.stringify(report, null, 2) : formatReport(report, file)) + '\n');
        return report.ok && (!flag(args, 'strict') || report.counts.warnings === 0) ? 0 : 1;
      }
      case 'preview': {
        const file = rest[0];
        if (!file) throw new UsageError('Usage: motion-forge preview <file.svg> [--out sheet.png]');
        const scene = loadOrFail(file, readSource(file));
        const states = args.flags.state;
        const sheet = contactSheet(scene, { frames: num(args, 'frames'), cell: num(args, 'cell'), states, inputs: parseInputs(args.flags.set), name: file === '-' ? undefined : basename(file), background: flag(args, 'bg') });
        const out = flag(args, 'out') ?? defaultOut(file, '.preview.png');
        writeFileSync(out, out.endsWith('.svg') ? sheet.svg : sheet.png);
        const warnings = check(scene).diagnostics.filter(d => d.level === 'warning');
        process.stdout.write(`Wrote ${out}\n${sheet.rows.map(r => `  ${r.title}`).join('\n')}\n${warnings.length ? `${warnings.length} lint warning(s): run motion-forge check ${file}\n` : ''}Open the image to review every state.\n`);
        return 0;
      }
      case 'record': {
        const file = rest[0];
        if (!file) throw new UsageError('Usage: motion-forge record <file.svg> [--out anim.gif] [--send event@ms] [--set input=value@ms]');
        const scene = loadOrFail(file, readSource(file));
        const script = parseScript([...(args.flags.send ?? []), ...(args.flags.set ?? []).filter(s => s.includes('@'))]);
        for (const s of script) {
          if (s.send && !scene.events.has(s.send)) process.stderr.write(`warning: no state handles event "${s.send}"\n`);
          if (s.set && !scene.inputs.has(s.set[0])) process.stderr.write(`warning: unknown input "${s.set[0]}"\n`);
        }
        const out = flag(args, 'out') ?? defaultOut(file, '.png');
        const opts = { state: flag(args, 'state'), duration: num(args, 'duration'), fps: num(args, 'fps'), width: num(args, 'width'), inputs: parseInputs(args.flags.set), script, background: flag(args, 'bg') };
        let log: string[];
        if (out.endsWith('.mp4') || out.endsWith('.webm')) log = await recordVideo(scene, opts, out);
        else if (out.endsWith('.gif')) {
          const res = recordGIF(scene, opts);
          writeFileSync(out, res.gif);
          log = res.log;
        } else {
          const res = recordStrip(scene, { ...opts, cells: num(args, 'cells') });
          writeFileSync(out, res.png);
          log = res.log;
        }
        process.stdout.write(`Wrote ${out}\n${log.map(l => '  ' + l).join('\n')}\n${out.endsWith('.png') ? 'The image is a grid of frames over time; open it to review the flow.\n' : ''}`);
        return 0;
      }
      case 'render': {
        const file = rest[0];
        if (!file) throw new UsageError('Usage: motion-forge render <file.svg> [--time ms] [--state s] [--out frame.png]');
        const scene = loadOrFail(file, readSource(file));
        const svg = renderSVG(scene, { state: flag(args, 'state'), time: num(args, 'time'), inputs: parseInputs(args.flags.set), width: num(args, 'width') });
        const out = flag(args, 'out');
        if (!out) process.stdout.write(svg + '\n');
        else {
          writeFileSync(out, out.endsWith('.png') ? rasterize(svg, num(args, 'width') ?? Math.max(scene.width, 400)).png : svg);
          process.stdout.write(`Wrote ${out}\n`);
        }
        return 0;
      }
      case 'inspect': {
        const file = rest[0];
        if (!file) throw new UsageError('Usage: motion-forge inspect <file.svg>');
        const scene = loadScene(readSource(file));
        const result = inspectTree(scene);
        process.stdout.write((flag(args, 'json') ? JSON.stringify(result.json, null, 2) : result.text) + '\n');
        return 0;
      }
      case 'sample': {
        const file = rest[0];
        if (!file) throw new UsageError('Usage: motion-forge sample <file.svg> --state s --time ms');
        const scene = loadOrFail(file, readSource(file));
        const player = new Player(scene, { hold: flag(args, 'state') !== undefined, state: flag(args, 'state'), inputs: parseInputs(args.flags.set) });
        player.seek(num(args, 'time') ?? 0);
        const out: Record<string, Record<string, unknown>> = {};
        for (const [k, props] of player.frame()) {
          const el = scene.elements[k]!;
          const name = el.attrs.id ? `#${el.attrs.id}` : el.attrs.class ? `${el.name}.${el.attrs.class.trim().split(/\s+/).join('.')}[${k}]` : `${el.name}[${k}]`;
          const kinds = scene.touched.get(k);
          out[name] = Object.fromEntries([...props].map(([p, v]) => [p, typeof v === 'number' ? Math.round(v * 1000) / 1000 : kinds?.get(p) === 'color' ? formatColor(v as [number, number, number, number]) : typeof v === 'object' && v && 'd' in v ? v.d : v]));
        }
        process.stdout.write(JSON.stringify({ state: player.state, time: player.time, values: out }, null, 2) + '\n');
        return 0;
      }
      case 'new': {
        const file = rest[0];
        if (!file) throw new UsageError('Usage: motion-forge new <file.svg> [--from preset]');
        if (existsSync(file) && !flag(args, 'force')) throw new UsageError(`${file} exists (use --force to overwrite)`);
        const from = flag(args, 'from');
        let content = TEMPLATE;
        if (from) {
          const p = listPresets().find(p => p.name === from);
          if (!p) throw new UsageError(`Unknown preset "${from}". Run motion-forge list.`);
          content = readFileSync(p.file, 'utf8');
        }
        mkdirSync(dirname(resolve(file)), { recursive: true });
        writeFileSync(file, content);
        process.stdout.write(`Created ${file}\nNext: edit it, then motion-forge check ${file} && motion-forge preview ${file}\n`);
        return 0;
      }
      case 'add': {
        if (!rest.length) throw new UsageError('Usage: motion-forge add <preset...> [--dir motion]');
        const dir = flag(args, 'dir') ?? 'motion';
        mkdirSync(dir, { recursive: true });
        const presets = listPresets();
        for (const name of rest) {
          const p = presets.find(p => p.name === name);
          if (!p) throw new UsageError(`Unknown preset "${name}". Available: ${presets.map(p => p.name).join(', ')}`);
          const out = join(dir, `${p.name}.svg`);
          if (existsSync(out) && !flag(args, 'force')) {
            process.stdout.write(`Skipped ${out} (exists; --force to overwrite)\n`);
            continue;
          }
          writeFileSync(out, readFileSync(p.file, 'utf8'));
          process.stdout.write(`Added ${out}${p.events.length ? `  events: ${p.events.join(', ')}` : ''}${p.inputs.length ? `  inputs: ${p.inputs.join(', ')}` : ''}\n`);
        }
        return 0;
      }
      case 'list': {
        const presets = listPresets();
        if (flag(args, 'json')) process.stdout.write(JSON.stringify(presets.map(({ file: _f, ...p }) => p), null, 2) + '\n');
        else {
          const byCat = new Map<string, PresetInfo[]>();
          for (const p of presets) byCat.set(p.category, [...(byCat.get(p.category) ?? []), p]);
          for (const [cat, items] of byCat) {
            process.stdout.write(`\n${cat}\n`);
            for (const p of items) process.stdout.write(`  ${p.name.padEnd(16)} ${p.title}\n${' '.repeat(19)}${[p.events.length && `send: ${p.events.join(', ')}`, p.inputs.length && `inputs: ${p.inputs.join(', ')}`, p.emits.length && `emits: ${p.emits.join(', ')}`].filter(Boolean).join(' · ') || 'no events or inputs'}\n`);
          }
          process.stdout.write(`\n${presets.length} presets. Copy one: motion-forge add <name> --dir src/motion\n`);
        }
        return 0;
      }
      case 'docs': {
        process.stdout.write(readFileSync(join(skillDir, 'reference.md'), 'utf8'));
        return 0;
      }
      case 'init': {
        const root = resolve(flag(args, 'dir') ?? '.');
        const target = join(root, '.claude/skills/motion-forge');
        mkdirSync(target, { recursive: true });
        for (const f of readdirSync(skillDir)) writeFileSync(join(target, f), readFileSync(join(skillDir, f)));
        const agents = join(root, 'AGENTS.md');
        const note = `\n## Animations\n\nInteractive animations are Motion SVG files (plain SVG + a motion JSON block). Read .claude/skills/motion-forge/SKILL.md before creating or editing one. Verify with \`npx motion-forge check <file>\` and look at \`npx motion-forge preview <file>\` before finishing.\n`;
        const existing = existsSync(agents) ? readFileSync(agents, 'utf8') : '';
        if (!existing.includes('motion-forge')) writeFileSync(agents, existing + note);
        process.stdout.write(`Installed skill → ${target}\n${existing.includes('motion-forge') ? 'AGENTS.md already mentions motion-forge' : `Updated ${agents}`}\nMCP (optional): add { "command": "npx", "args": ["motion-forge", "mcp"] } to your agent's MCP config.\n`);
        return 0;
      }
      case 'dev': {
        const file = rest[0];
        if (!file) throw new UsageError('Usage: motion-forge dev <file.svg> [--port 4777]');
        await startDevServer(resolve(file), num(args, 'port') ?? 4777);
        return await new Promise<number>(() => {});
      }
      case 'mcp':
        await serveMCP();
        return 0;
      default:
        throw new UsageError(`Unknown command "${command}". Run motion-forge --help.`);
    }
  } catch (e) {
    if (e instanceof ExitError) return e.code;
    if (e instanceof UsageError) {
      process.stderr.write(e.message + '\n');
      return 2;
    }
    process.stderr.write(`motion-forge: ${(e as Error).stack ?? e}\n`);
    return 2;
  }
}

async function recordVideo(scene: Scene, opts: RecordOptions, out: string): Promise<string[]> {
  let proc: ReturnType<typeof spawn> | undefined;
  let failed: Error | undefined;
  let log: string[] = [];
  const fps = opts.fps ?? 30;
  const done = new Promise<void>((res, rej) => {
    const start = (w: number, h: number) => {
      proc = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${w}x${h}`, '-r', String(fps), '-i', '-', '-vf', 'pad=ceil(iw/2)*2:ceil(ih/2)*2', ...(out.endsWith('.webm') ? ['-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '32'] : ['-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-movflags', '+faststart']), out], { stdio: ['pipe', 'inherit', 'inherit'] });
      proc.on('error', err => {
        failed = new UsageError(`Could not run ffmpeg (${err.message}). Install ffmpeg or record a .gif instead.`);
        rej(failed);
      });
      proc.on('close', code => (code === 0 ? res() : rej(failed ?? new Error(`ffmpeg exited with ${code}`))));
    };
    try {
      log = recordFrames(scene, { background: '#ffffff', ...opts, fps }, (rgba, w, h, i) => {
        if (i === 0) start(w, h);
        if (!failed) proc!.stdin!.write(Buffer.from(rgba));
      }).log;
      proc?.stdin?.end();
    } catch (e) {
      rej(e);
    }
  });
  await done;
  return log;
}
