import { mkdir, writeFile, readFile, copyFile, chmod } from 'node:fs/promises';
import { getJSONSchema } from '../dist/core.js';
await mkdir(new URL('../schema/', import.meta.url), { recursive: true });
await writeFile(new URL('../schema/document.schema.json', import.meta.url), JSON.stringify(getJSONSchema(), null, 2) + '\n');
await copyFile(new URL('../src/studio/studio.css', import.meta.url), new URL('../dist/studio.css', import.meta.url));
for (const name of ['react.js', 'react.cjs', 'studio.js', 'studio.cjs']) {
  const path = new URL(`../dist/${name}`, import.meta.url);
  await writeFile(path, '"use client";\n' + await readFile(path, 'utf8'));
}
await chmod(new URL('../dist/cli.js', import.meta.url), 0o755);
const { cp } = await import('node:fs/promises');
await cp(new URL('../../../docs/', import.meta.url), new URL('../docs/', import.meta.url), { recursive: true });
for (const name of ['LICENSE', 'CHANGELOG.md', 'CONTRIBUTING.md', 'SECURITY.md', 'SUPPORT.md', 'THIRD_PARTY.md', 'DEPLOYMENT.md', 'RELEASE.md', 'STATUS.md']) await copyFile(new URL(`../../../${name}`, import.meta.url), new URL(`../${name}`, import.meta.url));
const readme = (await readFile(new URL('../../../README.md', import.meta.url), 'utf8')).replaceAll('packages/motion-forge/skills/', 'skills/');
await writeFile(new URL('../README.md', import.meta.url), readme);
