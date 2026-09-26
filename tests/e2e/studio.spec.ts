import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
async function number(page: Page, name: string, value: string) { const field = page.getByRole('spinbutton', { name, exact: true }); await field.fill(value); await field.press('Enter'); }
async function exportJSON(page: Page) { await page.getByRole('combobox', { name: 'Export format' }).selectOption('json'); const waiting = page.waitForEvent('download'); await page.getByRole('button', { name: 'Export', exact: true }).click(); const download = await waiting; return JSON.parse(await readFile((await download.path())!, 'utf8')); }

test('creates, animates, undoes, recovers and reopens an editable document', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/studio/'); await page.getByRole('button', { name: 'New', exact: true }).click();
  await page.getByRole('button', { name: 'Add rect', exact: true }).click();
  await number(page, 'X', '100'); await page.getByRole('button', { name: 'Add key', exact: true }).click();
  await page.getByRole('slider', { name: 'Seek animation' }).focus(); await page.keyboard.press('End');
  await number(page, 'X ◇', '300');
  let doc = await exportJSON(page);
  expect(doc.nodes).toHaveLength(1); expect(doc.clips[0].tracks[0].keyframes.map((f: { time: number; value: number }) => [f.time, f.value])).toEqual([[0, 100], [3000, 300]]);
  await page.getByRole('button', { name: 'Undo', exact: true }).click(); doc = await exportJSON(page); expect(doc.clips[0].tracks[0].keyframes).toHaveLength(1);
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(page.getByText('Saved on this device', { exact: true })).toBeVisible();
  await page.reload(); await expect(page.getByText('Recovered your local document.')).toBeVisible();
  doc = await exportJSON(page); expect(doc.clips[0].tracks[0].keyframes).toHaveLength(2);
  await page.getByRole('button', { name: 'New', exact: true }).click();
  await page.locator('input[type=file]').setInputFiles({ name: 'roundtrip.forge.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(doc)) });
  await expect(page.getByText('Opened roundtrip.forge.json')).toBeVisible(); expect(await exportJSON(page)).toEqual(doc);
  expect(errors).toEqual([]);
});

test('canvas dragging, keyboard nudging, locking and hierarchy survive export', async ({ page }) => {
  await page.goto('/studio/'); await page.getByRole('button', { name: 'New', exact: true }).click(); await page.getByRole('button', { name: 'Add rect', exact: true }).click();
  const shape = page.locator('.mf-artboard [data-node-id="rect-1"]'); const box = (await shape.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down(); await page.mouse.move(box.x + box.width / 2 + 50, box.y + box.height / 2 + 20, { steps: 5 }); await page.mouse.up();
  let doc = await exportJSON(page); expect(doc.nodes[0].x).toBeGreaterThan(340); expect(doc.nodes[0].y).toBeGreaterThan(255);
  await page.getByRole('button', { name: 'Undo', exact: true }).click(); doc = await exportJSON(page); expect(doc.nodes[0].x).toBe(340); expect(doc.nodes[0].y).toBe(255);
  await page.locator('.mf-stage').focus(); await page.keyboard.press('ArrowRight'); doc = await exportJSON(page); expect(doc.nodes[0].x).toBe(341);
  await page.getByRole('button', { name: 'Lock Rect', exact: true }).click(); await page.locator('.mf-stage').focus(); await page.keyboard.press('ArrowRight'); doc = await exportJSON(page); expect(doc.nodes[0].x).toBe(341); expect(doc.nodes[0].locked).toBe(true);
});

test('authors states, inputs, transitions and bindings; exports the live SVG frame', async ({ page }) => {
  await page.goto('/studio/'); await page.getByRole('button', { name: 'New', exact: true }).click(); await page.getByRole('button', { name: 'Add rect', exact: true }).click(); await page.getByRole('button', { name: 'Interact', exact: true }).click();
  await page.getByRole('button', { name: 'Add state', exact: true }).click();
  await page.getByRole('button', { name: 'Inputs', exact: true }).click(); await page.getByRole('button', { name: 'Input', exact: true }).click();
  await page.getByText('Bind selected layer', { exact: true }).click(); await page.getByRole('combobox', { name: 'Numeric input', exact: true }).selectOption('input-1'); await page.getByRole('button', { name: 'Create binding' }).click();
  await page.getByRole('slider', { name: 'Preview Input 1' }).focus(); await page.keyboard.press('End');
  const boundShape = page.locator('.mf-artboard [data-node-id="rect-1"]'); await expect(boundShape).toHaveAttribute('transform', /translate\(100 255\)/);
  await page.getByRole('button', { name: 'States', exact: true }).click(); await page.getByText('Add transition', { exact: true }).click(); await page.getByRole('combobox', { name: 'To state', exact: true }).selectOption('idle'); await page.getByRole('button', { name: 'Create transition', exact: true }).click();
  const doc = await exportJSON(page); expect(doc.states).toHaveLength(2); expect(doc.inputs).toHaveLength(1); expect(doc.bindings[0]).toMatchObject({ nodeId: 'rect-1', property: 'x', from: 0, to: 100 }); expect(doc.transitions[0].trigger).toEqual({ type: 'event', event: 'activate' });
  await page.getByRole('combobox', { name: 'Export format' }).selectOption('svg'); const pending = page.waitForEvent('download'); await page.getByRole('button', { name: 'Export', exact: true }).click(); const svg = await readFile((await (await pending).path())!, 'utf8'); expect(svg).toContain('translate(100 255)'); expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
});

test('rejects unsupported imports without replacing the current work', async ({ page }) => {
  await page.goto('/studio/'); const before = await exportJSON(page);
  await page.locator('input[type=file]').setInputFiles({ name: 'unsafe.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg><script>alert(1)</script></svg>') });
  await expect(page.getByRole('alert')).toContainText('Unsupported <script>'); expect(await exportJSON(page)).toEqual(before);
});

test('home, docs, examples and Studio have no serious accessibility violations', async ({ page }) => {
  for (const route of ['/', '/docs/', '/examples/', '/studio/']) {
    await page.goto(route); await page.waitForLoadState('networkidle');
    const audit = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(audit.violations.map(v => ({ id: v.id, impact: v.impact, nodes: v.nodes.map(n => n.target) })), route).toEqual([]);
  }
});

test('PNG export contains rendered pixels at the requested dimensions', async ({ page }) => {
  await page.goto('/studio/'); await page.getByRole('button', { name: 'New', exact: true }).click(); await page.getByRole('button', { name: 'Add rect', exact: true }).click();
  await page.getByRole('combobox', { name: 'Export format' }).selectOption('png'); const pending = page.waitForEvent('download'); await page.getByRole('button', { name: 'Export', exact: true }).click(); const bytes = await readFile((await (await pending).path())!);
  expect(bytes.subarray(1, 4).toString()).toBe('PNG'); expect(bytes.readUInt32BE(16)).toBe(800); expect(bytes.readUInt32BE(20)).toBe(600);
  const pixel = await page.evaluate(async base64 => { const image = new Image(); image.src = `data:image/png;base64,${base64}`; await image.decode(); const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height; const ctx = canvas.getContext('2d')!; ctx.drawImage(image, 0, 0); return [...ctx.getImageData(400, 300, 1, 1).data]; }, bytes.toString('base64'));
  expect(pixel).toEqual([238, 113, 72, 255]);
});

test('malformed recovery data remains untouched until a new document is chosen', async ({ page }) => {
  await page.goto('/'); await page.evaluate(() => localStorage.setItem('motion-forge:studio:v1', '{broken'));
  await page.goto('/studio/'); await expect(page.getByRole('alert')).toContainText('Recovery failed');
  await page.getByRole('button', { name: 'Add rect', exact: true }).click(); await page.waitForTimeout(550);
  expect(await page.evaluate(() => localStorage.getItem('motion-forge:studio:v1'))).toBe('{broken');
  await page.getByRole('button', { name: 'New', exact: true }).click(); await expect(page.getByText('Saved on this device', { exact: true })).toBeVisible();
  expect(JSON.parse((await page.evaluate(() => localStorage.getItem('motion-forge:studio:v1')))!)).toMatchObject({ name: 'Untitled animation', nodes: [] });
});

test('keyframe easing and time edits are real and reject duplicate times atomically', async ({ page }) => {
  await page.goto('/studio/'); await page.getByRole('button', { name: 'y keyframe at 1600 milliseconds', exact: true }).click();
  await page.getByRole('combobox', { name: 'Easing', exact: true }).selectOption('custom-spring'); await number(page, 'damping', '12'); await number(page, 'Time · ms', '1400');
  const doc = await exportJSON(page); expect(doc.clips[0].tracks[0].keyframes[1]).toMatchObject({ time: 1400, easing: { type: 'spring', damping: 12 } });
  await number(page, 'Time · ms', '0'); await expect(page.getByRole('alert')).toContainText('unique, ascending'); expect(await exportJSON(page)).toEqual(doc);
});

test('phone layout keeps artboard and authoring controls reachable without page overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto('/studio/');
  const artboard = await page.locator('.mf-artboard').boundingBox(); expect(artboard!.width).toBeGreaterThan(280);
  await page.getByRole('button', { name: 'Add ellipse', exact: true }).click(); await number(page, 'Radius X', '75');
  const doc = await exportJSON(page); expect(doc.nodes.at(-1)).toMatchObject({ type: 'ellipse', rx: 75 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const audit = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze(); expect(audit.violations.map(v => v.id)).toEqual([]);
});
