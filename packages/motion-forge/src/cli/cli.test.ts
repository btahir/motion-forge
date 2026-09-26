import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const CLI = join(__dirname, '../../dist/cli.js');
const run = (args: string[], input?: string) => {
  try {
    return { code: 0, out: execFileSync('node', [CLI, ...args], { encoding: 'utf8', input, stdio: ['pipe', 'pipe', 'pipe'] }) };
  } catch (e) {
    const err = e as { status: number; stdout: string; stderr: string };
    return { code: err.status, out: err.stdout + err.stderr };
  }
};
const dir = mkdtempSync(join(tmpdir(), 'mf-cli-'));

describe('cli', () => {
  it('creates a working file from the template', () => {
    const file = join(dir, 'new.svg');
    expect(run(['new', file]).code).toBe(0);
    const res = run(['check', file]);
    expect(res.code).toBe(0);
    expect(res.out).toContain('0 errors');
  });
  it('fails check with actionable errors and exit code 1', () => {
    const file = join(dir, 'bad.svg');
    writeFileSync(file, '<svg viewBox="0 0 10 10"><rect id="box" width="5" height="5"/><metadata type="application/motion+json"><![CDATA[{"states":{"a":{"animate":{"#bx":{"rotate":[0,90]}}}}}]]></metadata></svg>');
    const res = run(['check', file]);
    expect(res.code).toBe(1);
    expect(res.out).toContain('Did you mean "#box"?');
    const json = JSON.parse(run(['check', file, '--json']).out);
    expect(json.ok).toBe(false);
    expect(json.diagnostics[0].code).toBe('motion.no-match');
  });
  it('writes a contact sheet PNG and a GIF', () => {
    const file = join(dir, 'new.svg');
    const png = join(dir, 'sheet.png');
    expect(run(['preview', file, '--out', png]).code).toBe(0);
    expect(readFileSync(png).subarray(1, 4).toString()).toBe('PNG');
    const gif = join(dir, 'hop.gif');
    expect(run(['record', file, '--send', 'hop@200', '--duration', '800', '--width', '120', '--out', gif]).code).toBe(0);
    expect(readFileSync(gif).subarray(0, 3).toString()).toBe('GIF');
  });
  it('renders frames and reads stdin', () => {
    const svg = readFileSync(join(dir, 'new.svg'), 'utf8');
    const res = run(['render', '-', '--state', 'hop', '--time', '350'], svg);
    expect(res.code).toBe(0);
    expect(res.out).toMatch(/<svg[^>]*width="240"/);
    expect(res.out).not.toContain('metadata');
  });
  it('inspects the element tree with bounds', () => {
    const res = run(['inspect', join(dir, 'new.svg')]);
    expect(res.out).toMatch(/g#shape\s+\[80,84 80×80\]/);
  });
  it('installs the agent skill', () => {
    const proj = mkdtempSync(join(tmpdir(), 'mf-init-'));
    expect(run(['init', '--dir', proj]).code).toBe(0);
    expect(existsSync(join(proj, '.claude/skills/motion-forge/SKILL.md'))).toBe(true);
    expect(readFileSync(join(proj, 'AGENTS.md'), 'utf8')).toContain('motion-forge');
  });
  it('prints the reference with docs', () => {
    expect(run(['docs']).out).toContain('# Motion SVG reference');
  });
  it('speaks MCP over stdio', async () => {
    const proc = spawn('node', [CLI, 'mcp']);
    let buffer = '';
    const lines: string[] = [];
    proc.stdout.on('data', d => {
      buffer += String(d);
      let nl;
      while ((nl = buffer.indexOf('\n')) >= 0) {
        lines.push(buffer.slice(0, nl));
        buffer = buffer.slice(nl + 1);
      }
    });
    const send = (m: object) => proc.stdin.write(JSON.stringify(m) + '\n');
    send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } });
    send({ jsonrpc: '2.0', method: 'notifications/initialized' });
    send({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
    send({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'motion_preview', arguments: { path: join(dir, 'new.svg') } } });
    await new Promise<void>(res => {
      const t = setInterval(() => {
        if (lines.length >= 3) {
          clearInterval(t);
          res();
        }
      }, 20);
    });
    proc.kill();
    const byId = Object.fromEntries(lines.map(l => JSON.parse(l)).map(m => [m.id, m]));
    expect(byId[1].result.serverInfo.name).toBe('motion-forge');
    expect(byId[2].result.tools.map((t: { name: string }) => t.name)).toContain('motion_preview');
    expect(byId[3].result.content.some((c: { type: string }) => c.type === 'image')).toBe(true);
  }, 20000);
});
