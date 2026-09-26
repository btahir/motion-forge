import { expect, it } from 'vitest';
import { runCLI, type CLIHost } from './main';
import { createPreset } from '../presets';
function fixture(source = JSON.stringify(createPreset('signal'))) {
  const stdout: string[] = [], stderr: string[] = [], files = new Map<string, string>();
  const host: CLIHost = { read: async () => source, write: async (path, data) => { files.set(path, data); }, stdout: text => { stdout.push(text); }, stderr: text => { stderr.push(text); } };
  return { host, stdout, stderr, files };
}
it('validates and inspects with machine-readable output', async () => {
  const f = fixture(); expect(await runCLI(['validate', 'a.json'], f.host)).toBe(0); expect(JSON.parse(f.stdout[0]!)).toMatchObject({ ok: true, name: 'Signal' });
  await runCLI(['inspect', 'a.json'], f.host); expect(JSON.parse(f.stdout[1]!).inputs[0].id).toBe('intensity');
});
it('samples inputs and writes an actual standalone SVG', async () => {
  const f = fixture(); await runCLI(['sample', '-', '--inputs', '{"intensity":100}'], f.host);
  expect(JSON.parse(f.stdout[0]!).frame.needle.rotation).toBe(135);
  expect(await runCLI(['render', '-', '--output', 'out.svg'], f.host)).toBe(0); expect(f.files.get('out.svg')).toContain('<svg xmlns=');
});
it('uses distinct document and command error exit codes', async () => {
  const f = fixture('{invalid'); expect(await runCLI(['validate', '-'], f.host)).toBe(1); expect(JSON.parse(f.stderr[0]!)).toMatchObject({ ok: false, error: 'invalid_document' });
  expect(await runCLI(['nope'], f.host)).toBe(2); expect(await runCLI(['sample', '-', '--unknown'], f.host)).toBe(2);
});
it.each([['--time', 'NaN'], ['--inputs', '{"missing":2}'], ['--inputs', '{"intensity":true}'], ['--state', 'missing']])('rejects invalid options %s %s', async (key, value) => { expect(await runCLI(['sample', '-', key, value], fixture().host)).toBe(2); });
it('exports the schema and editable presets without IO or network', async () => {
  const f = fixture(); expect(await runCLI(['schema'], f.host)).toBe(0); expect(JSON.parse(f.stdout[0]!)).toHaveProperty('properties');
  expect(await runCLI(['preset', 'scout'], f.host)).toBe(0); expect(JSON.parse(f.stdout[1]!).name).toBe('Scout');
});
