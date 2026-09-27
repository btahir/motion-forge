// Packs motion-forge, installs the tarball into a clean project, and exercises every entry
// point the way a user (or their agent) would. Run after `pnpm build`.
import { mkdtemp, readdir, rm, stat, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';

const root = resolve(import.meta.dirname, '..');
const temp = await mkdtemp(join(tmpdir(), 'motion-forge-consumer-'));
const run = (cmd, args, cwd = temp) => execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, NO_COLOR: '1' } });
try {
  run('pnpm', ['--filter', 'motion-forge', 'pack', '--pack-destination', temp], root);
  const tarball = (await readdir(temp)).find(f => f.endsWith('.tgz'));
  assert(tarball, 'tarball created');
  const listing = run('tar', ['-tzf', join(temp, tarball)]);
  assert(!/src\//.test(listing), 'no TypeScript sources in the package');
  assert(!/\.test\./.test(listing), 'no tests in the package');
  await writeFile(join(temp, 'package.json'), JSON.stringify({ name: 'consumer', private: true, type: 'module' }));
  run('npm', ['install', '--no-audit', '--no-fund', join(temp, tarball), 'react@19', 'react-dom@19', 'typescript@5.9', '@types/react@19', '@types/react-dom@19', '@types/node@22']);
  const pkg = join(temp, 'node_modules/motion-forge');
  const manifest = JSON.parse(await readFile(join(pkg, 'package.json'), 'utf8'));
  for (const target of Object.values(manifest.exports)) {
    const paths = typeof target === 'string' ? [target] : Object.values(target);
    for (const p of paths) if (!p.includes('*')) await stat(resolve(pkg, p));
  }
  for (const f of ['skills/motion-forge/SKILL.md', 'skills/motion-forge/reference.md', 'README.md', 'LICENSE']) await stat(join(pkg, f));
  const presets = (await readdir(join(pkg, 'presets'))).filter(f => f.endsWith('.svg'));
  assert(presets.length >= 10, `presets shipped (${presets.length})`);

  await writeFile(
    join(temp, 'smoke.mjs'),
    `import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadScene, Player, renderSVG, check } from 'motion-forge';
import { contactSheet } from 'motion-forge/node';
import { MotionForge } from 'motion-forge/react';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
const src = readFileSync(new URL('./node_modules/motion-forge/presets/${presets[0]}', import.meta.url), 'utf8');
const scene = loadScene(src);
assert.equal(scene.ok, true);
assert.equal(check(src).ok, true);
const p = new Player(scene); p.advance(500);
assert.match(renderSVG(scene), /<svg/);
assert.ok(contactSheet(scene, { frames: 3, cell: 80 }).png.length > 1000);
assert.match(renderToString(createElement(MotionForge, { svg: src })), /<svg/);
console.log('smoke ok');`,
  );
  assert.equal(run('node', ['smoke.mjs']).trim(), 'smoke ok');

  // Check declarations through the packed public exports, not workspace aliases.
  await writeFile(join(temp, 'consumer.tsx'), `import { createRef } from 'react';
import { MotionForge, type MotionForgeHandle } from 'motion-forge/react';
import { loadScene, mount, Player } from 'motion-forge';
import { recordStrip, type ScriptStep } from 'motion-forge/node';
import { defineMotionForge } from 'motion-forge/element';
const scene = loadScene('<svg viewBox="0 0 10 10"/>');
const steps: ScriptStep[] = [{ at: 0, set: ['progress', 1] }];
recordStrip(scene, { script: steps });
new Player(scene).setReducedMotion(true);
defineMotionForge();
const instance = mount(document.createElement('div'), scene);
instance.destroy();
const ref = createRef<MotionForgeHandle>();
const element = <MotionForge ref={ref} svg="<svg/>" inputs={{ progress: 1 }} onError={error => console.error(error.message)} />;
void element;
`);
  run(join(temp, 'node_modules/.bin/tsc'), ['--noEmit', '--strict', '--module', 'NodeNext', '--moduleResolution', 'NodeNext', '--target', 'ES2022', '--jsx', 'react-jsx', 'consumer.tsx']);

  // The CLI as an agent would call it.
  const cli = join(temp, 'node_modules/.bin/motion-forge');
  run(cli, ['add', presets[0].replace('.svg', ''), '--dir', 'motion']);
  assert.match(run(cli, ['check', `motion/${presets[0]}`]), /0 errors/);
  assert.match(run(cli, ['preview', `motion/${presets[0]}`, '--out', 'sheet.png']), /Wrote sheet.png/);
  assert.match(run(cli, ['docs']), /Motion SVG reference/);
  run(cli, ['init']);
  await stat(join(temp, '.claude/skills/motion-forge/SKILL.md'));
  const size = (await stat(join(temp, tarball))).size;
  console.log(`Package verified: ${tarball} (${(size / 1024).toFixed(0)} KB packed, ${presets.length} presets), ESM + types + React SSR + node API + CLI.`);
} finally {
  await rm(temp, { recursive: true, force: true });
}
