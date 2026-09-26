import { mkdtemp, readFile, writeFile, rm, readdir, stat, cp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
const root = resolve(import.meta.dirname, '..');
const temp = await mkdtemp(join(tmpdir(), 'motion-forge-consumer-'));
const run = (cmd, args, cwd = temp) => execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, NO_COLOR: '1' } });
try {
  run('pnpm', ['--filter', 'motion-forge', 'pack', '--pack-destination', temp], root);
  const tarball = (await readdir(temp)).find(f => f.endsWith('.tgz')); assert(tarball);
  await writeFile(join(temp, 'package.json'), JSON.stringify({ name: 'external-consumer', private: true, type: 'module' }));
  run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', join(temp, tarball), 'react@19', 'react-dom@19', '@types/react@19', '@types/react-dom@19', 'typescript@5.9']);
  const installed = join(temp, 'node_modules/motion-forge');
  for (const f of ['dist/core.js', 'dist/core.cjs', 'dist/react.js', 'dist/studio.js', 'dist/studio.css', 'dist/cli.js', 'schema/document.schema.json', 'skills/motion-forge/SKILL.md', 'README.md', 'LICENSE', 'docs/api.md']) await stat(join(installed, f));
  const manifest = JSON.parse(await readFile(join(installed, 'package.json'), 'utf8'));
  for (const [key, value] of Object.entries(manifest.exports)) {
    if (typeof value === 'string') await stat(resolve(installed, value));
    else for (const group of Object.values(value)) for (const path of Object.values(group)) await stat(resolve(installed, path));
    assert(!key.includes('internal'));
  }
  await writeFile(join(temp, 'smoke.mjs'), `import assert from 'node:assert/strict';
import { ForgePlayer, renderSVG, parseDocument } from 'motion-forge';
import { createPreset } from 'motion-forge/presets';
import { MotionForge } from 'motion-forge/react';
import { ForgeStudio } from 'motion-forge/studio';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
const doc = createPreset('scout'); const player = new ForgePlayer(doc, { autoplay: true }); player.advance(800);
assert.equal(player.getSnapshot().time, 800); assert(renderSVG(doc).includes('<svg'));
assert(renderToString(createElement(MotionForge, { document: doc })).includes('data-node-id="visor"'));
assert.equal(typeof ForgeStudio, 'function'); assert.equal(parseDocument(doc).name, 'Scout'); player.dispose();
console.log('ESM, React SSR, Studio import: passed');`);
  console.log(run('node', ['smoke.mjs']).trim());
  await writeFile(join(temp, 'smoke.cjs'), `const assert = require('node:assert/strict'); const core = require('motion-forge'); const react = require('motion-forge/react'); const studio = require('motion-forge/studio'); const {createPreset}=require('motion-forge/presets'); assert(core.renderSVG(createPreset('signal')).includes('needle')); assert(react.MotionForge); assert.equal(typeof studio.ForgeStudio,'function'); console.log('CJS exports: passed');`);
  console.log(run('node', ['smoke.cjs']).trim());
  await cp(resolve(root, 'examples/react/App.tsx'), join(temp, 'App.tsx'));
  await writeFile(join(temp, 'consumer.tsx'), `import { createElement } from 'react'; import { ForgeStudio } from 'motion-forge/studio'; import { createPreset } from 'motion-forge/presets'; import { ForgePlayer, renderSVG } from 'motion-forge'; import 'motion-forge/studio.css'; const doc=createPreset('scout'); const p=new ForgePlayer(doc); renderSVG(doc,{frame:p.getSnapshot().frame}); createElement(ForgeStudio,{initialDocument:doc,storageKey:false});`);
  await writeFile(join(temp, 'tsconfig.json'), JSON.stringify({ compilerOptions: { target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext', jsx: 'react-jsx', strict: true, noEmit: true, skipLibCheck: false, lib: ['ES2022', 'DOM'] }, include: ['*.tsx'] }));
  run(join(temp, 'node_modules/.bin/tsc'), ['--noEmit']); console.log('External TypeScript and README-style React example: passed');
  const cli = join(temp, 'node_modules/.bin/motion-forge');
  run(cli, ['preset', 'scout', '--output', 'scout.json']); assert(JSON.parse(run(cli, ['validate', 'scout.json'])).ok); assert(JSON.parse(run(cli, ['inspect', 'scout.json'])).nodes.length > 0);
  run(cli, ['render', 'scout.json', '--time', '800', '--output', 'scout.svg']); assert((await readFile(join(temp, 'scout.svg'), 'utf8')).startsWith('<svg'));
  assert(JSON.parse(run(cli, ['sample', 'scout.json', '--time', '800'])).ok); assert(JSON.parse(run(cli, ['schema'])).properties);
  console.log('Installed CLI and emitted files: passed');
  for (const version of ['18']) { run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', `react@${version}`, `react-dom@${version}`, `@types/react@${version}`, `@types/react-dom@${version}`]); run(join(temp, 'node_modules/.bin/tsc'), ['--noEmit']); console.log(`React ${version}: ${run('node', ['smoke.mjs']).trim()}`); }
  const visit = async path => { for (const entry of await readdir(path, { withFileTypes: true })) { const file = join(path, entry.name); if (entry.isDirectory()) await visit(file); else if (/\.(?:js|cjs|ts|cts|json|map|md)$/.test(entry.name)) { const text = await readFile(file, 'utf8'); assert(!text.includes('/Users/') && !text.includes('/home/'), `Private absolute path in ${file}`); assert(!/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(text), `Private key in ${file}`); } } };
  await visit(installed);
  console.log(`Packed artifact: ${(await stat(join(temp, tarball))).size} bytes. Export/file checks and basic private-path/secret scan passed.`);
} catch (error) { if (error.stderr) process.stderr.write(error.stderr); if (error.stdout) process.stderr.write(error.stdout); throw error; }
finally { await rm(temp, { recursive: true, force: true }); }
