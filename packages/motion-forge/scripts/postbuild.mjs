import { chmod, readFile, writeFile } from 'node:fs/promises';

const cli = new URL('../dist/cli.js', import.meta.url);
const body = await readFile(cli, 'utf8');
if (!body.startsWith('#!')) await writeFile(cli, '#!/usr/bin/env node\n' + body);
await chmod(cli, 0o755);
const react = new URL('../dist/react.js', import.meta.url);
const r = await readFile(react, 'utf8');
if (!r.startsWith('"use client"')) await writeFile(react, '"use client";\n' + r);

// Ship the root README (with package-relative links) and license.
const rootReadme = await readFile(new URL('../../../README.md', import.meta.url), 'utf8');
await writeFile(
  new URL('../README.md', import.meta.url),
  rootReadme
    .replaceAll('packages/motion-forge/skills/', 'skills/')
    .replaceAll('packages/motion-forge/presets', 'presets')
    .replaceAll('](docs/media/', '](https://raw.githubusercontent.com/btahir/motion-forge/main/docs/media/')
    .replaceAll('](docs/size.json)', '](https://github.com/btahir/motion-forge/blob/main/docs/size.json)')
    .replaceAll('](STATUS.md)', '](https://github.com/btahir/motion-forge/blob/main/STATUS.md)')
    .replaceAll('](LICENSE)', '](LICENSE)'),
);
await writeFile(new URL('../LICENSE', import.meta.url), await readFile(new URL('../../../LICENSE', import.meta.url)));
