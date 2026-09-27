import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { check } from '../core/check';

const root = new URL('../../../../', import.meta.url);
const example = readFileSync(new URL('examples/like.svg', root), 'utf8');

describe('README example', () => {
  it('is examples/like.svg verbatim, so the code, GIF and contact sheet show the same file', () => {
    const readme = readFileSync(new URL('README.md', root), 'utf8');
    expect(readme).toContain('```xml\n' + example.trimEnd() + '\n```');
  });
  it('passes check with no warnings', () => {
    const report = check(example);
    expect(report.diagnostics.filter(d => d.level !== 'info')).toEqual([]);
  });
});
