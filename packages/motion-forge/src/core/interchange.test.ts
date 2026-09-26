// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { importSVG, exportReact } from './interchange';
import { createPreset, presetCatalog } from '../presets';
import { parseDocument } from './schema';
import { renderSVG } from './render';
import { sampleDocument } from './sample';

describe('interchange', () => {
  it('imports grouped shapes with inherited paints and ordered transforms', () => {
    const result = importSVG('<svg xmlns="http://www.w3.org/2000/svg" viewBox="10 20 400 300"><title>Shape</title><g fill="#123456" transform="translate(30 40) rotate(45) scale(2)"><rect x="8" y="9" width="50" height="70" rx="3"/><circle cx="100" cy="90" r="12"/></g></svg>');
    expect(result.success).toBe(true); if (!result.success) return;
    expect(result.document.name).toBe('Shape'); expect(result.document.width).toBe(400);
    const rect = result.document.nodes.find(n => n.type === 'rect')!;
    expect(rect).toMatchObject({ x: 8, y: 9, width: 50, height: 70, radius: 3, fill: '#123456' });
    const ancestors = []; let parent = rect.parentId;
    while (parent) { const node = result.document.nodes.find(n => n.id === parent)!; ancestors.push(node); parent = node.parentId; }
    expect(ancestors.map(n => n.name)).toEqual(['g', 'scale transform', 'rotate transform', 'translate transform', 'svg', 'ViewBox origin']);
    expect(result.document.nodes[0]).toMatchObject({ x: -10, y: -20 });
  });
  it.each(['<script>alert(1)</script>', '<foreignObject/>', '<image href="https://example.com/a.png"/>', '<rect width="10" height="20" onclick="evil()"/>', '<rect width="10" height="20" style="filter:blur(2px)"/>', '<path transform="skewX(30)" d="M0 0 L20 20"/>'])('rejects unsupported content: %s', content => {
    const result = importSVG(`<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">${content}</svg>`);
    expect(result.success).toBe(false); expect(result.issues.some(i => i.severity === 'error')).toBe(true);
  });
  it('returns explicit diagnostics for malformed XML and external entities', () => {
    expect(importSVG('<svg><g></svg>').success).toBe(false);
    expect(importSVG('<!DOCTYPE svg SYSTEM "file:///etc/passwd"><svg/>').success).toBe(false);
  });
  it('warns about cap normalization and preserves text as text', () => {
    const result = importSVG('<svg width="100" height="100"><path d="M0 0L20 20" stroke="red"/><text x="3" y="8">&lt;hello&gt;</text></svg>');
    expect(result.success).toBe(true); expect(result.issues[0]?.severity).toBe('warning');
    if (result.success) expect(renderSVG(result.document)).toContain('&lt;hello&gt;');
  });
  it('validates export data, including caller-supplied frames', () => {
    const doc = createPreset('scout'); const frame = sampleDocument(doc, 0); frame.halo!.fill = 'url(https://example.com/track)';
    expect(() => renderSVG(doc, { frame })).toThrow();
    const invalid = structuredClone(doc); invalid.nodes[0]!.fontFamily = 'serif" onload="evil()' as 'serif';
    expect(() => renderSVG(invalid)).toThrow();
  });
  it('all original presets validate, round-trip and sample over their full timeline', () => {
    for (const item of presetCatalog) {
      const doc = createPreset(item.id); expect(parseDocument(JSON.parse(JSON.stringify(doc)))).toEqual(doc);
      for (const state of doc.states) { const clip = doc.clips.find(c => c.id === state.clipId)!; for (let time = 0; time <= clip.duration; time += 37) { const frame = sampleDocument(doc, time, { state: state.id }); expect(Object.values(frame).every(n => Number.isFinite(n.x) && Number.isFinite(n.y) && n.opacity >= 0 && n.opacity <= 1)).toBe(true); } }
      expect(exportReact(doc)).toContain('parseDocument('); expect(renderSVG(doc)).toContain('xmlns="http://www.w3.org/2000/svg"');
    }
  });
});
