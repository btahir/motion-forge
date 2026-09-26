import { expect, it } from 'vitest';
import { validPath } from './path';
it.each(['M0 0L10 20Z', 'M.2-.5 C1 2 3 4 5 6s1 2 3 4', 'M0 0 A5 6 45 0 1 30 40', 'M0 0 10 20 30 40', 'm1e2 2E-1h3v4z', ''])('accepts path %s', d => expect(validPath(d)).toBe(true));
it.each(['L0 0', 'M0', 'M0 0L', 'M0 0C1 2', 'M0 0 A1 2 3 4 5 6 7', 'M0 0 A-1 2 0 0 1 3 4', 'M0 0e', 'M0 0 L1e999 2', 'M0 0Z4 5', 'M0 0L1 2<script>'])('rejects malformed path %s', d => expect(validPath(d)).toBe(false));
