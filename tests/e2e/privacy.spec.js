import { test, expect } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';
import { readFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

test('New fields start unnamed and require a user-provided name', async ({ page }) => {
  const pdf = await PDFDocument.create(); pdf.addPage();
  await page.goto('/');
  await page.locator('#template-input').setInputFiles({ name: 'your-template.pdf', mimeType: 'application/pdf', buffer: Buffer.from(await pdf.save()) });
  await page.locator('#template-next').click();
  await page.getByRole('button', { name: 'Add field', exact: true }).click();
  await expect(page.getByLabel('Field name', { exact: true })).toHaveValue('');
  await expect(page.locator('.selected .field-sample')).toHaveText('Sample text');
  await page.getByRole('button', { name: 'Add recipients', exact: true }).click();
  await expect(page.locator('#notice')).toContainText('Give each field a name');
  await page.getByLabel('Field name', { exact: true }).fill('Your label');
  await page.getByLabel('Field name', { exact: true }).press('Tab');
  await page.getByRole('button', { name: 'Add recipients', exact: true }).click();
  await expect(page.locator('#step-3')).toBeVisible();
});

test('Templates persist locally, exclude recipients, isolate profiles and can be deleted', async ({ page, browser }) => {
  const unsafeRequests = [], errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    if (!['GET', 'HEAD'].includes(request.method()) || !new URL(request.url()).hostname.match(/^(127\.0\.0\.1|localhost)$/)) unsafeRequests.push(request.url());
  });
  await page.goto('/');
  await expect(page).toHaveTitle(/CertGen/);
  await page.getByRole('button', { name: 'Open sample project' }).click();
  await page.locator('#custom-font-input').setInputFiles(fileURLToPath(new URL('../../public/fonts/NotoSans-Regular.ttf', import.meta.url)));
  await page.getByLabel('Field sample text', { exact: true }).fill('PRIVATE SAMPLE');
  await page.getByLabel('Field sample text', { exact: true }).press('Tab');
  await page.getByRole('button', { name: 'Add recipients', exact: true }).click();
  await page.locator('#data-input').setInputFiles({ name: 'private.csv', mimeType: 'text/csv', buffer: Buffer.from('Name\nPRIVATE RECIPIENT') });
  await page.getByRole('button', { name: 'Save layout' }).click();
  await expect(page.locator('#toast')).toContainText('saved in this browser only');
  const records = await page.evaluate(async () => (await import('/src/lib/template-store.js')).listTemplates());
  expect(records).toHaveLength(1);
  expect(records[0].bytes.length).toBeGreaterThan(100);
  expect(records[0].customFont.length).toBeGreaterThan(100);
  expect(records[0]).not.toHaveProperty('rows');
  expect(JSON.stringify(records[0].layout)).not.toContain('PRIVATE');
  await page.reload();
  await page.getByRole('button', { name: 'Load layout' }).click();
  await expect(page.locator('#saved-template-choice option')).toHaveCount(1);
  await page.getByRole('button', { name: 'Restore template', exact: true }).click();
  await expect(page.locator('#editor-canvas')).toHaveAttribute('data-render-state', 'ready');
  await expect(page.locator('.field-box')).toHaveCount(3);
  await expect(page.getByRole('button', { name: 'Field font', exact: true })).toHaveAttribute('value', 'Custom');
  await page.getByRole('button', { name: 'Add recipients', exact: true }).click();
  await expect(page.locator('#recipient-count')).toHaveText('0');
  const isolated = await browser.newContext();
  const other = await isolated.newPage(); await other.goto(page.url());
  await other.getByRole('button', { name: 'Load layout' }).click();
  await expect(other.locator('#saved-template-empty')).toBeVisible(); await isolated.close();
  await page.getByRole('button', { name: 'Save layout' }).click();
  await expect(page.locator('#toast')).toContainText('saved in this browser only');
  await page.getByRole('button', { name: 'Load layout' }).click();
  await expect(page.locator('#saved-template-choice option')).toHaveCount(1);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  if (process.env.CERTGEN_QA_DIR) {
    await mkdir(process.env.CERTGEN_QA_DIR, { recursive: true });
    await page.screenshot({ path: join(process.env.CERTGEN_QA_DIR, 'local-templates-mobile.png') });
  }
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Delete saved template', exact: true }).click();
  await expect(page.locator('#saved-template-empty')).toBeVisible();
  expect(unsafeRequests).toEqual([]); expect(errors).toEqual([]);
});

test('Production security policy allows local PDF/font rendering and exports', async ({ page }) => {
  const { headers } = JSON.parse(await readFile(new URL('../../vercel.json', import.meta.url), 'utf8'));
  // Vite dev needs an inline HMR bootstrap. Apply the production script policy only to a built preview.
  test.skip(!process.env.CERTGEN_PRODUCTION_QA, 'Run against the built static preview');
  await page.route('**/', async (route) => {
    const response = await route.fetch();
    await route.fulfill({ response, headers: { ...response.headers(), ...Object.fromEntries(headers[0].headers.map(({ key, value }) => [key, value])) } });
  });
  const errors = []; page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto('/');
  await page.getByRole('button', { name: 'Open sample project' }).click();
  await expect(page.locator('#editor-canvas')).toHaveAttribute('data-render-state', 'ready');
  await page.getByRole('button', { name: 'Add recipients', exact: true }).click();
  await page.getByRole('button', { name: 'Preview certificates', exact: true }).click();
  await page.getByRole('button', { name: 'Generate 3 certificates', exact: true }).click();
  await expect(page.locator('#download-results')).toContainText('3 certificates ready');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download ZIP (3)' }).click();
  expect((await download).suggestedFilename()).toMatch(/\.zip$/);
  expect(errors).toEqual([]);
});
