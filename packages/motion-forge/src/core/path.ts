/** Validates the command/number grammar of the supported SVG path string. */
export function validPath(data: string): boolean {
  if (!data.trim()) return true;
  const token = /[MmLlHhVvCcSsQqTtAaZz]|[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/g;
  const tokens: string[] = []; let end = 0, match: RegExpExecArray | null;
  while ((match = token.exec(data))) { if (!/^[\s,]*$/.test(data.slice(end, match.index))) return false; tokens.push(match[0]); end = token.lastIndex; }
  if (!/^[\s,]*$/.test(data.slice(end)) || !/^[Mm]$/.test(tokens[0] ?? '')) return false;
  const arity: Record<string, number> = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 };
  let i = 0;
  while (i < tokens.length) {
    const command = tokens[i++]!.toUpperCase(); if (!Object.hasOwn(arity, command)) return false;
    const count = arity[command]!; if (count === 0) continue;
    let groups = 0;
    while (i < tokens.length && !/^[A-Za-z]$/.test(tokens[i]!)) {
      if (i + count > tokens.length) return false;
      const args = tokens.slice(i, i + count).map(Number);
      if (args.some(n => !Number.isFinite(n) || Math.abs(n) > 1e6)) return false;
      if (command === 'A' && (args[0]! < 0 || args[1]! < 0 || ![0, 1].includes(args[3]!) || ![0, 1].includes(args[4]!))) return false;
      i += count; groups++;
    }
    if (!groups) return false;
  }
  return true;
}
