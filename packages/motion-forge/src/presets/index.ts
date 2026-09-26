import { parseDocument, type DocumentInput, type ForgeDocument, type NodeInput, type Track, type AnimatedProperty } from '../core/schema';

const ink = '#222a28', orange = '#ee7148', cream = '#f6f3eb', mint = '#b8d8c4';
function track(nodeId: string, property: AnimatedProperty, values: [number, number | string][], easing: Track['keyframes'][number]['easing'] = 'ease-in-out'): Track {
  return { id: `${nodeId}-${property}`, nodeId, property, keyframes: values.map(([time, value]) => ({ time, value, easing })) };
}
const ellipse = (id: string, x: number, y: number, rx: number, ry: number, fill: string, extra: Partial<NodeInput> = {}): NodeInput => ({ id, name: id.replaceAll('-', ' '), type: 'ellipse', x, y, rx, ry, fill, ...extra });
const path = (id: string, d: string, fill: string, extra: Partial<NodeInput> = {}): NodeInput => ({ id, name: id.replaceAll('-', ' '), type: 'path', d, fill, ...extra });
const text = (id: string, label: string, x: number, y: number, fontSize: number, extra: Partial<NodeInput> = {}): NodeInput => ({ id, name: id, type: 'text', text: label, x, y, fontSize, fill: ink, ...extra });

function makeScout(): ForgeDocument {
  const nodes: NodeInput[] = [
    ellipse('halo', 320, 266, 186, 186, '#e5ebe0'),
    ellipse('shadow', 320, 453, 85, 12, '#d8dbce'),
    { id: 'scout', name: 'Scout · body', type: 'group', x: 320, y: 290 },
    path('left-boot', 'M -54 82 L -56 135 Q -56 145 -80 145 L -98 145 Q -106 145 -105 155 L -43 155 Q -34 155 -34 145 L -31 80 Z', ink, { parentId: 'scout' }),
    path('right-boot', 'M 31 80 L 34 145 Q 34 155 43 155 L 105 155 Q 106 145 98 145 L 80 145 Q 56 145 56 135 L 54 82 Z', ink, { parentId: 'scout' }),
    { id: 'left-arm', name: 'Left arm', type: 'group', parentId: 'scout', x: -83, y: 2, rotation: -12 },
    path('left-hand', 'M 0 0 Q -38 16 -28 61 Q -25 74 -13 72 Q -3 70 -7 58 Q -13 29 8 20 Z', orange, { parentId: 'left-arm', stroke: ink, strokeWidth: 3 }),
    { id: 'right-arm', name: 'Wave arm', type: 'group', parentId: 'scout', x: 83, y: 2, rotation: -15 },
    path('right-hand', 'M 0 0 Q 36 8 31 -26 L 31 -52 Q 31 -59 25 -59 Q 19 -59 19 -52 L 18 -38 L 17 -64 Q 17 -70 11 -70 Q 5 -70 5 -64 L 6 -37 L 2 -53 Q 0 -59 -5 -57 Q -10 -55 -8 -49 L -2 -20 Q 1 -9 -6 1 Z', orange, { parentId: 'right-arm', stroke: ink, strokeWidth: 3 }),
    { id: 'shell', name: 'Orange shell', type: 'rect', parentId: 'scout', x: -88, y: -98, width: 176, height: 202, radius: 65, fill: orange, stroke: ink, strokeWidth: 3 },
    { id: 'visor', name: 'Cream visor', type: 'rect', parentId: 'scout', x: -66, y: -62, width: 132, height: 89, radius: 36, fill: cream, stroke: ink, strokeWidth: 3 },
    ellipse('eye-left', -24, -23, 7, 12, ink, { parentId: 'scout' }),
    ellipse('eye-right', 24, -23, 7, 12, ink, { parentId: 'scout' }),
    path('smile', 'M -13 3 Q 0 14 13 3', 'none', { parentId: 'scout', stroke: ink, strokeWidth: 3 }),
    ellipse('badge', 0, 64, 14, 14, cream, { parentId: 'scout', stroke: ink, strokeWidth: 2 }),
    path('badge-star', 'M 0 -9 L 3 -3 L 9 0 L 3 3 L 0 9 L -3 3 L -9 0 L -3 -3 Z', orange, { parentId: 'scout', y: 64 }),
    path('spark-left', 'M 0 -13 L 4 -4 L 13 0 L 4 4 L 0 13 L -4 4 L -13 0 L -4 -4 Z', orange, { x: 139, y: 187 }),
    path('spark-right', 'M 0 -10 L 3 -3 L 10 0 L 3 3 L 0 10 L -3 3 L -10 0 L -3 -3 Z', ink, { x: 497, y: 328 }),
    ellipse('dot', 467, 157, 5, 5, ink),
    text('caption', 'SMALL CHARACTER. BIG PERSONALITY.', 320, 521, 11, { textAnchor: 'middle', fontFamily: 'monospace' }),
  ];
  return parseDocument({ version: 1, name: 'Scout', description: 'An original little explorer. Send wave to say hello.', width: 640, height: 560, background: cream, nodes,
    clips: [
      { id: 'breathe', name: 'Breathe', duration: 3200, tracks: [track('scout', 'y', [[0, 290], [1600, 281], [3200, 290]]), track('shadow', 'rx', [[0, 85], [1600, 72], [3200, 85]]), track('eye-left', 'ry', [[0, 12], [2400, 12], [2500, 1], [2600, 12], [3200, 12]]), track('eye-right', 'ry', [[0, 12], [2400, 12], [2500, 1], [2600, 12], [3200, 12]]), track('spark-left', 'rotation', [[0, 0], [3200, 180]], 'linear')] },
      { id: 'wave-clip', name: 'Hello there', duration: 1600, tracks: [track('right-arm', 'rotation', [[0, -15], [280, -60], [520, -25], [760, -60], [1000, -25], [1300, -50], [1600, -15]]), track('scout', 'rotation', [[0, 0], [400, -5], [1200, -5], [1600, 0]]), track('scout', 'y', [[0, 290], [450, 273], [1600, 290]]), track('spark-right', 'scaleX', [[0, 1], [800, 1.8], [1600, 1]]), track('spark-right', 'scaleY', [[0, 1], [800, 1.8], [1600, 1]])] },
    ], states: [{ id: 'idle', name: 'Idle', clipId: 'breathe', loop: true }, { id: 'waving', name: 'Waving', clipId: 'wave-clip' }], initialState: 'idle',
    transitions: [{ id: 'say-hello', from: 'idle', to: 'waving', trigger: { type: 'event', event: 'wave' }, duration: 180 }, { id: 'rest', from: 'waving', to: 'idle', trigger: { type: 'complete' }, duration: 240 }],
  });
}
function makeSuccess(): ForgeDocument {
  const nodes: NodeInput[] = [
    ellipse('outer', 320, 250, 164, 164, '#e7ecdf'),
    ellipse('ring', 320, 250, 125, 125, 'none', { stroke: '#ccdbcc', strokeWidth: 2, strokeDasharray: '3 10' }),
    { id: 'tile', name: 'Confirmation tile', type: 'rect', x: 230, y: 160, width: 180, height: 180, radius: 44, fill: ink, originX: 90, originY: 90 },
    path('check', 'M 277 251 L 306 280 L 365 220', 'none', { stroke: cream, strokeWidth: 14, strokeDasharray: '140', strokeDashoffset: 140 }),
    ...Array.from({ length: 8 }, (_, i): NodeInput => {
      const a = i * Math.PI / 4; return { id: `confetti-${i}`, name: `Confetti ${i + 1}`, type: 'rect', x: 320 + Math.cos(a) * 112, y: 250 + Math.sin(a) * 112, width: 9, height: 20, radius: 3, rotation: i * 45, fill: i % 2 ? orange : mint, opacity: 0 };
    }),
    text('success-title', 'A little moment of delight.', 320, 454, 24, { textAnchor: 'middle', fontWeight: '600' }),
    text('success-caption', 'SEND “CONFIRM” TO CELEBRATE', 320, 489, 11, { textAnchor: 'middle', fontFamily: 'monospace' }),
  ];
  return parseDocument({ version: 1, name: 'Made it', description: 'A spring-driven confirmation, with a tiny celebration.', width: 640, height: 560, background: cream, nodes,
    clips: [{ id: 'ready-clip', name: 'Ready', duration: 1000, tracks: [] }, { id: 'success-clip', name: 'Celebrate', duration: 1800, tracks: [
      track('check', 'strokeDashoffset', [[0, 140], [600, 0]], 'ease-out'), track('tile', 'fill', [[0, ink], [400, '#3a6b52']]),
      track('tile', 'scaleX', [[0, 0.8], [900, 1]], 'spring'), track('tile', 'scaleY', [[0, 0.8], [900, 1]], 'spring'),
      ...Array.from({ length: 8 }, (_, i) => { const a = i * Math.PI / 4; return [track(`confetti-${i}`, 'x', [[0, 320 + Math.cos(a) * 112], [1000, 320 + Math.cos(a) * 200]], 'ease-out'), track(`confetti-${i}`, 'y', [[0, 250 + Math.sin(a) * 112], [1000, 250 + Math.sin(a) * 200]], 'ease-out'), track(`confetti-${i}`, 'opacity', [[0, 0], [150, 1], [650, 1], [1100, 0]]), track(`confetti-${i}`, 'rotation', [[0, i * 45], [1100, i * 45 + 160]])]; }).flat(),
    ] }], states: [{ id: 'ready', name: 'Ready', clipId: 'ready-clip' }, { id: 'success', name: 'Success', clipId: 'success-clip' }], initialState: 'ready',
    transitions: [{ id: 'confirm', from: 'ready', to: 'success', trigger: { type: 'event', event: 'confirm' }, duration: 0 }, { id: 'again', from: 'success', to: 'ready', trigger: { type: 'event', event: 'reset' }, duration: 250 }],
  });
}
function makeDial(): ForgeDocument {
  const nodes: NodeInput[] = [
    ellipse('face', 320, 265, 192, 192, ink),
    ellipse('inner-ring', 320, 265, 162, 162, 'none', { stroke: '#48514b', strokeWidth: 1 }),
    ...Array.from({ length: 41 }, (_, i): NodeInput => { const a = (-225 + i * 6.75) * Math.PI / 180; const r = i % 5 === 0 ? 143 : 151; return { id: `tick-${i}`, name: `Tick ${i}`, type: 'line', x: 320 + Math.cos(a) * r, y: 265 + Math.sin(a) * r, x2: Math.cos(a) * (158 - r), y2: Math.sin(a) * (158 - r), stroke: i > 30 ? orange : '#89988c', strokeWidth: i % 5 === 0 ? 3 : 1 }; }),
    text('dial-label', 'INTENSITY', 320, 196, 11, { fill: '#b6c3b8', textAnchor: 'middle', fontFamily: 'monospace' }),
    { id: 'needle', name: 'Input-driven needle', type: 'group', x: 320, y: 265, rotation: -135 },
    path('pointer', 'M -5 12 L -2 -126 Q 0 -139 2 -126 L 5 12 Z', orange, { parentId: 'needle' }),
    ellipse('hub', 320, 265, 15, 15, cream), ellipse('hub-inner', 320, 265, 6, 6, orange),
    text('min', '0', 206, 387, 13, { fill: '#b6c3b8', textAnchor: 'middle', fontFamily: 'monospace' }),
    text('max', '100', 430, 387, 13, { fill: '#b6c3b8', textAnchor: 'middle', fontFamily: 'monospace' }),
    { id: 'bar-bg', name: 'Meter track', type: 'rect', x: 266, y: 343, width: 108, height: 6, radius: 3, fill: '#48514b' },
    { id: 'bar', name: 'Input-driven meter', type: 'rect', x: 266, y: 343, width: 54, height: 6, radius: 3, fill: orange },
    text('dial-caption', 'REAL DATA. REAL MOVEMENT.', 320, 521, 11, { textAnchor: 'middle', fontFamily: 'monospace' }),
  ];
  return parseDocument({ version: 1, name: 'Signal', description: 'An instrument that responds to your data. Adjust the intensity input.', width: 640, height: 560, background: cream, nodes,
    clips: [{ id: 'main', name: 'Still', duration: 2000, tracks: [] }], states: [{ id: 'idle', name: 'Listening', clipId: 'main' }], initialState: 'idle',
    inputs: [{ id: 'intensity', name: 'Intensity', type: 'number', min: 0, max: 100, default: 62 }],
    bindings: [{ id: 'needle-input', inputId: 'intensity', nodeId: 'needle', property: 'rotation', from: -135, to: 135 }, { id: 'bar-input', inputId: 'intensity', nodeId: 'bar', property: 'width', from: 0, to: 108 }],
  });
}
export type PresetId = 'scout' | 'made-it' | 'signal';
export const presetCatalog = [
  { id: 'scout', name: 'Scout', category: 'Character', description: 'A tiny explorer with a friendly wave.', event: 'wave' },
  { id: 'made-it', name: 'Made it', category: 'Interface', description: 'Turn a confirmation into a celebration.', event: 'confirm' },
  { id: 'signal', name: 'Signal', category: 'Data', description: 'An instrument connected to your data.', event: undefined },
] as const;
/** Returns a fresh editable document, never a shared mutable singleton. */
export function createPreset(id: PresetId): ForgeDocument {
  switch (id) { case 'scout': return makeScout(); case 'made-it': return makeSuccess(); case 'signal': return makeDial(); default: throw new Error(`Unknown preset: ${String(id)}`); }
}
export type { DocumentInput };
