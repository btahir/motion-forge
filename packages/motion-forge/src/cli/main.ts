import { readFile, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { DocumentError, getJSONSchema, parseJSON, type ForgeDocument } from '../core/schema';
import { renderSVG } from '../core/render';
import { sampleDocument, type InputValues } from '../core/sample';
import { createPreset, presetCatalog, type PresetId } from '../presets';

export const help = `Motion Forge — portable interactive animation\n\nUsage: motion-forge <command> [file] [options]\n\n  validate <file>    Validate JSON structure and references\n  inspect <file>     Summarize nodes, clips, states and inputs\n  sample <file>      Return a deterministic JSON frame\n  render <file>      Write a standalone SVG to stdout or --output\n  schema            Print the format's structural JSON Schema\n  preset <name>     Print scout, made-it or signal as editable JSON\n\nOptions:\n  --time <ms>        Sample time (default: 0, clamped to the clip)\n  --state <id>       State to sample (default: initial state)\n  --inputs <json>    Numeric or boolean input values\n  --output <file>    Write result to a file (default: stdout)\n  --help            Show this guide\n  --version         Print package version\n\nUse - for JSON on stdin. Results and errors are machine-readable JSON,\nexcept render (SVG), help and version. Exit: 0 success; 1 invalid document;\n2 usage, IO or runtime error. No network, tokens or account required.\n`;
export type CLIHost = { read: (path: string) => Promise<string>; write: (path: string, data: string) => Promise<void>; stdout: (text: string) => void; stderr: (text: string) => void };
const outputJSON = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;
export async function runCLI(argv: string[], host: CLIHost): Promise<number> {
  try {
    const { values, positionals } = parseArgs({ args: argv, allowPositionals: true, strict: true, options: { time: { type: 'string' }, state: { type: 'string' }, inputs: { type: 'string' }, output: { type: 'string' }, help: { type: 'boolean' }, version: { type: 'boolean' } } });
    if (values.help || !positionals.length && !values.version) { host.stdout(help); return 0; }
    if (values.version) { host.stdout('0.1.0\n'); return 0; }
    const [command, file] = positionals;
    if (!['validate', 'inspect', 'sample', 'render', 'schema', 'preset'].includes(command!)) throw new Error(`Unknown command: ${command}`);
    if (positionals.length > 2 || ((command === 'schema') && file)) throw new Error('Unexpected positional argument');
    if (command !== 'schema' && !file) throw new Error(`${command} requires ${command === 'preset' ? 'a preset name' : 'a JSON file or - for stdin'}`);
    if (!['sample', 'render'].includes(command!) && (values.time || values.state || values.inputs)) throw new Error('--time, --state and --inputs apply only to sample or render');
    let result: string;
    if (command === 'schema') result = outputJSON(getJSONSchema());
    else if (command === 'preset') {
      if (!presetCatalog.some(p => p.id === file)) throw new Error(`Unknown preset: ${file}. Choose scout, made-it or signal.`);
      result = outputJSON(createPreset(file as PresetId));
    } else {
      const doc = parseJSON(await host.read(file!));
      if (command === 'validate') result = outputJSON({ ok: true, version: doc.version, name: doc.name });
      else if (command === 'inspect') result = outputJSON({ ok: true, ...inspect(doc) });
      else {
        const time = values.time === undefined ? 0 : Number(values.time);
        if (!Number.isFinite(time) || time < 0 || values.time?.trim() === '') throw new Error('--time must be a non-negative finite number');
        const inputs: InputValues = {};
        if (values.inputs) {
          const raw: unknown = JSON.parse(values.inputs);
          if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('--inputs must be a JSON object');
          for (const [id, value] of Object.entries(raw)) {
            const input = doc.inputs.find(i => i.id === id);
            if (!input) throw new Error(`Unknown input: ${id}`);
            if (typeof value !== (input.type === 'number' ? 'number' : 'boolean') || typeof value === 'number' && !Number.isFinite(value)) throw new Error(`Wrong type for input: ${id}`);
            inputs[id] = value as number | boolean;
          }
        }
        result = command === 'render' ? `${renderSVG(doc, { time, state: values.state, inputs })}\n` : outputJSON({ ok: true, frame: sampleDocument(doc, time, { state: values.state, inputs }) });
      }
    }
    if (values.output) await host.write(values.output, result); else host.stdout(result);
    return 0;
  } catch (error) {
    const validation = error instanceof DocumentError;
    host.stderr(outputJSON({ ok: false, error: validation ? 'invalid_document' : 'command_error', message: error instanceof Error ? error.message : String(error), ...(validation ? { issues: error.issues } : {}) }));
    return validation ? 1 : 2;
  }
}
function inspect(doc: ForgeDocument) {
  return { name: doc.name, version: doc.version, dimensions: { width: doc.width, height: doc.height }, nodes: doc.nodes.map(n => ({ id: n.id, name: n.name, type: n.type, parentId: n.parentId })), clips: doc.clips.map(c => ({ id: c.id, name: c.name, duration: c.duration, tracks: c.tracks.length, keyframes: c.tracks.reduce((n, t) => n + t.keyframes.length, 0) })), states: doc.states, initialState: doc.initialState, inputs: doc.inputs, transitions: doc.transitions, bindings: doc.bindings };
}
export const nodeHost: CLIHost = {
  read: async path => {
    if (path !== '-') { const value = await readFile(path, 'utf8'); return value; }
    const chunks: Buffer[] = []; let size = 0;
    for await (const chunk of process.stdin) { size += chunk.length; if (size > 5_000_000) throw new Error('stdin exceeds 5 MB'); chunks.push(Buffer.from(chunk)); }
    return Buffer.concat(chunks).toString('utf8');
  },
  write: (path, data) => writeFile(path, data, 'utf8'),
  stdout: text => { process.stdout.write(text); }, stderr: text => { process.stderr.write(text); },
};
