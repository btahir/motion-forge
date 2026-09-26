import { expect, test } from '@playwright/test';

test('rendered routes hydrate without browser errors and interactive examples respond', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  for (const route of ['/', '/examples/', '/docs/api/', '/docs/format/', '/docs/interchange/', '/docs/agents/', '/docs/performance/']) { await page.goto(route); await page.waitForLoadState('networkidle'); await expect(page.locator('h1')).toBeVisible(); }
  await page.goto('/examples/'); await page.getByRole('button', { name: 'Pause Scout animation' }).click();
  const scout = page.locator('[data-node-id="scout"]'); const paused = await scout.getAttribute('transform'); await page.waitForTimeout(150); expect(await scout.getAttribute('transform')).toBe(paused);
  await page.getByRole('button', { name: 'Say hello' }).click(); await expect.poll(() => scout.getAttribute('transform')).not.toBe(paused);
  await page.getByRole('button', { name: 'Make it happen' }).click(); await expect.poll(() => page.locator('[data-node-id="check"]').getAttribute('stroke-dashoffset')).toBe('0');
  await page.getByRole('slider', { name: 'Intensity' }).focus(); await page.keyboard.press('End'); await expect(page.locator('[data-node-id="needle"]')).toHaveAttribute('transform', /rotate\(135\)/);
  expect(errors).toEqual([]);
});

test('reduced motion stops autoplay while preserving application input', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' }); await page.goto('/examples/');
  const scout = page.locator('[data-node-id="scout"]'); const value = await scout.getAttribute('transform'); await page.waitForTimeout(200); expect(await scout.getAttribute('transform')).toBe(value);
  await page.getByRole('slider', { name: 'Intensity' }).focus(); await page.keyboard.press('Home'); await expect(page.locator('[data-node-id="needle"]')).toHaveAttribute('transform', /rotate\(-135\)/);
});

test('supported transformed SVG imports remain editable with accurate canvas dragging', async ({ page }) => {
  await page.goto('/studio/');
  await page.locator('input[type=file]').setInputFiles({ name: 'nested.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><g transform="translate(250 50) rotate(90) scale(2)"><rect x="10" y="20" width="50" height="40" fill="#ee7148"/></g></svg>') });
  await expect(page.getByText('Imported SVG as editable layers.')).toBeVisible();
  const rect = page.locator('.mf-artboard rect[data-node-id]'); const before = (await rect.boundingBox())!;
  await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2); await page.mouse.down(); await page.mouse.move(before.x + before.width / 2 + 32, before.y + before.height / 2 + 24, { steps: 4 }); await page.mouse.up();
  const after = (await rect.boundingBox())!; expect(after.x - before.x).toBeCloseTo(32, 0); expect(after.y - before.y).toBeCloseTo(24, 0);
  await page.getByRole('button', { name: 'Undo', exact: true }).click(); const restored = (await rect.boundingBox())!; expect(restored.x).toBeCloseTo(before.x, 1); expect(restored.y).toBeCloseTo(before.y, 1);
});

test('input conditions authored in Studio cause state transitions', async ({ page }) => {
  await page.goto('/studio/'); await page.getByRole('button', { name: 'New', exact: true }).click(); await page.getByRole('button', { name: 'Interact', exact: true }).click(); await page.getByRole('button', { name: 'Add state', exact: true }).click();
  await page.getByRole('button', { name: 'Inputs', exact: true }).click(); await page.getByRole('button', { name: 'Input', exact: true }).click(); await page.getByRole('button', { name: 'States', exact: true }).click();
  await page.getByText('Add transition', { exact: true }).click(); await page.getByRole('combobox', { name: 'To state', exact: true }).selectOption('idle'); await page.getByRole('combobox', { name: 'Trigger', exact: true }).selectOption('input'); await page.getByRole('combobox', { name: 'Input', exact: true }).selectOption('input-1'); await page.getByRole('combobox', { name: 'Operator', exact: true }).selectOption('gte'); await page.getByRole('textbox', { name: 'Condition value' }).fill('80'); await page.getByRole('button', { name: 'Create transition' }).click();
  await page.getByRole('button', { name: 'Inputs', exact: true }).click(); await page.getByRole('slider', { name: 'Preview Input 1' }).focus(); await page.keyboard.press('End'); await expect(page.locator('.mf-canvas-footer')).toContainText('Idle');
});
