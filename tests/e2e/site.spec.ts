import { expect, test, type Page } from '@playwright/test';

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
