import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const watchErrors = (page: Page) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => {
    if (m.type() === 'error' && !/fonts\.g/.test(m.text())) errors.push(m.text());
  });
  return errors;
};

test('home: hero mascot reacts to events and the pointer', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('write');
  const hero = page.locator('.hero-live');
  const state = hero.locator('.live-state');
  await expect(state).toContainText('idle');
  await hero.getByRole('button', { name: /send wave/ }).click();
  await expect(state).not.toContainText(/^\s*idle\s*$/);
  const lookX = hero.locator('.live-input', { hasText: 'lookX' }).locator('output');
  const box = (await hero.locator('.live-stage svg').boundingBox())!;
  await page.mouse.move(box.x + box.width - 4, box.y + 10);
  await expect.poll(async () => Number(await lookX.textContent())).toBeGreaterThan(0.5);
  expect(errors).toEqual([]);
});

test('home: gallery cards are live and keyboard accessible', async ({ page }) => {
  await page.goto('/#presets');
  const card = page.locator('.card', { has: page.getByRole('heading', { name: 'Like', exact: true }) });
  await card.scrollIntoViewIfNeeded();
  const heart = card.locator('svg [role="button"]').first();
  await heart.focus();
  await page.keyboard.press('Enter');
  await expect(card.locator('.live-input', { hasText: 'liked' }).locator('input')).toBeChecked();
  await page.getByRole('tab', { name: 'loaders' }).click();
  await expect(page.locator('.card')).toHaveCount(await page.locator('.card .tag', { hasText: 'loaders' }).count());
});

test('playground: preview, diagnostics, frames and share links', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/playground/#preset=gauge');
  await expect(page.locator('.cm-content')).toContainText('Gauge');
  await expect(page.locator('.pg-status')).toContainText('valid');
  const value = page.locator('.pg-live .live-input', { hasText: 'value' }).locator('input');
  await value.fill('90');
  await expect(page.locator('.pg-live svg text').filter({ hasText: '%' }).first()).toContainText(/9\d%|8\d%/);
  await page.getByRole('button', { name: 'Frames' }).click();
  await expect(page.locator('.frames figure')).not.toHaveCount(0);
  await page.getByRole('button', { name: 'Share link' }).click();
  await expect(page).toHaveURL(/#src=/);
  const shared = page.url();
  await page.goto('/');
  await page.goto(shared);
  await expect(page.locator('.cm-content')).toContainText('Gauge');
  expect(errors).toEqual([]);
});

test('playground: broken source shows actionable errors', async ({ page }) => {
  await page.goto('/playground/#preset=like');
  await page.locator('.cm-content').click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.insertText('<svg viewBox="0 0 10 10"><rect id="box" width="5" height="5"/><metadata type="application/motion+json"><![CDATA[{"states":{"a":{"animate":{"#bx":{"rotate":[0,90]}}}}}]]></metadata></svg>');
  await expect(page.locator('.pg-status')).toContainText('1 errors');
  await expect(page.locator('.diag.error')).toContainText('Did you mean "#box"?');
});

test('docs render the reference with a table of contents', async ({ page }) => {
  await page.goto('/docs/');
  await expect(page.getByRole('heading', { level: 1, name: 'Motion SVG reference' })).toBeVisible();
  await page.locator('.docs-toc a', { hasText: 'Interactions' }).click();
  await expect(page).toHaveURL(/#interactions/);
});

test('reduced motion freezes loops', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/#presets');
  const card = page.locator('.card', { has: page.getByRole('heading', { name: 'Spinner' }) });
  await card.scrollIntoViewIfNeeded();
  const svg = card.locator('.live-stage svg');
  const before = await svg.innerHTML();
  await page.waitForTimeout(400);
  expect(await svg.innerHTML()).toBe(before);
});

test('phone layout has no horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const route of ['/', '/playground/', '/docs/']) {
    await page.goto(route);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, route).toBeLessThanOrEqual(1);
  }
});

test('playground: import, pause, scrub, inspect events and restore a draft', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/playground/');
  const stage = (await page.locator('.pg-live .live-stage').boundingBox())!;
  const artwork = (await page.locator('.pg-live .live-stage svg').boundingBox())!;
  expect(artwork.y + artwork.height).toBeLessThanOrEqual(stage.y + stage.height);
  await page.locator('input[type=file]').setInputFiles({ name: 'review.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg viewBox="0 0 100 100"><title>Imported review</title><circle id="c" cx="50" cy="50" r="10"/><metadata type="application/motion+json">{"transition":0,"states":{"idle":{"duration":1000,"loop":true,"animate":{"#c":{"rotate":[0,360]}},"on":{"go":"done"}},"done":{"animate":{"#c":{"fill":"#ff0000"}}}}}</metadata></svg>') });
  await expect(page.locator('.cm-content')).toContainText('Imported review');
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.getByRole('slider', { name: 'Animation time' }).fill('500');
  await expect(page.locator('.timeline output')).toContainText('500 / 1000ms');
  const shape = page.locator('.pg-live svg [id$="c"]');
  await expect(shape).toHaveAttribute('transform', /rotate\(180\)/);
  await page.waitForTimeout(200);
  await expect(shape).toHaveAttribute('transform', /rotate\(180\)/);
  await page.getByRole('button', { name: 'send go' }).click();
  await page.locator('.event-log summary').click();
  await expect(page.locator('.event-log')).toContainText('idle → done');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('motion-forge:playground-draft:v1'))).toContain('Imported review');
  await page.reload();
  await expect(page.locator('.cm-content')).toContainText('Imported review');
  expect(errors).toEqual([]);
});

test('playground: malformed share links show a recoverable error', async ({ page }) => {
  await page.goto('/playground/#src=bad');
  await expect(page.locator('.pg-notice')).toContainText('Could not open share link');
  await expect(page.locator('.cm-content')).toBeVisible();
});

test('runtime follows changes to reduced-motion preferences without remounting', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/playground/#preset=spinner');
  const svg = page.locator('.pg-live svg');
  await expect(svg).toBeVisible();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.waitForTimeout(100);
  const still = await svg.innerHTML();
  await page.waitForTimeout(200);
  expect(await svg.innerHTML()).toBe(still);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect.poll(() => svg.innerHTML()).not.toBe(still);
});

test('public pages pass automated accessibility checks in both themes', async ({ page }) => {
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
    for (const route of ['/', '/playground/', '/docs/']) {
      await page.goto(route);
      if (route === '/playground/') await page.locator('.cm-content').waitFor();
      const results = await new AxeBuilder({ page }).analyze();
      expect(results.violations.map(v => ({ id: v.id, targets: v.nodes.map(n => n.target) })), `${colorScheme} ${route}`).toEqual([]);
    }
  }
});
