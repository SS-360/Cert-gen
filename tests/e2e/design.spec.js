import { test, expect } from '@playwright/test';
import { readFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { PDFDocument, PDFName, PDFDict, decodePDFRawStream } from 'pdf-lib';

async function sample(page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Open sample project' }).click();
  await expect(page.locator('.field-sample')).toHaveCount(3);
  await expect(page.locator('#editor-canvas')).toHaveAttribute('data-render-state', 'ready');
  await page.evaluate(() => document.fonts.ready);
}
async function shot(page, name) {
  if (!process.env.CERTGEN_QA_DIR) return;
  await mkdir(process.env.CERTGEN_QA_DIR, { recursive: true });
  await page.screenshot({ path: join(process.env.CERTGEN_QA_DIR, name), fullPage: true });
}
async function pdfDownload(page) {
  await page.getByRole('button', { name: 'Add recipients', exact: true }).click();
  await page.getByRole('button', { name: 'Preview certificates', exact: true }).click();
  await expect(page.locator('#preview-canvas')).toBeVisible();
  const waiting = page.waitForEvent('download');
  await page.getByRole('button', { name: 'PDF', exact: true }).click();
  return readFile(await (await waiting).path());
}

test('Font samples, search, categories, and genuine bold italic fonts update field text and PDFs', async ({ page }) => {
  const errors = []; page.on('pageerror', (error) => errors.push(error.message));
  await sample(page);
  await expect(page.locator('.selected .field-sample')).toHaveText('Sample Participant');
  await page.getByLabel('Field sample text', { exact: true }).fill('Sample, not a recipient');
  await expect(page.locator('.selected .field-sample')).toHaveText('Sample, not a recipient');
  await page.getByRole('button', { name: 'Field font', exact: true }).click();
  await page.getByRole('button', { name: 'Cursive', exact: true }).click();
  await expect(page.locator('.font-option')).toHaveCount(7);
  await expect(page.getByRole('button', { name: 'Use Great Vibes', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'All', exact: true }).click();
  await page.getByLabel('Search fonts', { exact: true }).fill('Poppins');
  await expect(page.locator('.font-option')).toHaveCount(1);
  await page.getByRole('button', { name: 'Use Poppins', exact: true }).click();
  await page.getByLabel('Field font style', { exact: true }).selectOption('boldItalic');
  await expect(page.getByRole('button', { name: 'Field font', exact: true })).toHaveAttribute('value', 'Poppins');
  await expect(page.getByLabel('Field font style', { exact: true })).toHaveValue('boldItalic');
  await expect(page.locator('#editor-canvas')).toHaveAttribute('data-render-state', 'ready');
  await page.getByLabel('Field text colour', { exact: true }).fill('#7B4DFF');
  await page.getByLabel('Field text colour', { exact: true }).press('Tab');
  const bytes = await pdfDownload(page);
  const pdf = await PDFDocument.load(bytes);
  const fonts = pdf.getPage(0).node.Resources().lookup(PDFName.of('Font'), PDFDict);
  expect(fonts.values().map((ref) => pdf.context.lookup(ref).get(PDFName.of('BaseFont'))?.toString()).join(' ')).toContain('Poppins-BoldItalic');
  const stream = pdf.getPage(0).node.Contents();
  const contents = Array.from({ length: stream.size() }, (_, i) => new TextDecoder().decode(decodePDFRawStream(pdf.context.lookup(stream.get(i))).decode())).join(' ');
  expect(contents).toContain('0.4823529411764706 0.30196078431372547 1 rg');
  const text = await page.evaluate(async (encoded) => {
    const pdfjs = await import('/node_modules/pdfjs-dist/build/pdf.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc = '/node_modules/pdfjs-dist/build/pdf.worker.min.mjs';
    const doc = await pdfjs.getDocument({ data: Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0)) }).promise;
    const text = (await (await doc.getPage(1)).getTextContent()).items.map((item) => item.str).join(' ');
    await doc.loadingTask.destroy(); return text;
  }, bytes.toString('base64'));
  expect(text).toContain('Sample Participant'); expect(text).not.toContain('Sample, not a recipient');
  expect(errors).toEqual([]);
});

test('Colour wheel, brightness, hex, native picker and screen eyedropper stay synchronized', async ({ page }) => {
  await page.addInitScript(() => { window.EyeDropper = class { async open() { return { sRGBHex: '#e54b6a' }; } }; });
  await sample(page);
  await page.getByRole('button', { name: 'Open colour wheel' }).click();
  const wheel = page.locator('#color-wheel');
  const bounds = await wheel.boundingBox();
  await wheel.click({ position: { x: bounds.width * .8, y: bounds.height * .5 } });
  const changed = await page.locator('#picker-hex').inputValue();
  expect(changed).not.toBe('#142D4E');
  await wheel.press('ArrowRight');
  await page.locator('#color-brightness').fill('70');
  await page.locator('#picker-hex').fill('#245CFF');
  await page.locator('#picker-hex').press('Tab');
  await expect(page.getByLabel('Field text colour', { exact: true })).toHaveValue('#245CFF');
  await expect(page.getByRole('button', { name: 'Open colour wheel' })).toHaveCSS('background-color', 'rgb(36, 92, 255)');
  await page.locator('#native-color').evaluate((input) => { input.value = '#14805e'; input.dispatchEvent(new Event('input', { bubbles: true })); });
  await expect(page.locator('#picker-hex')).toHaveValue('#14805E');
  await page.getByRole('button', { name: 'Pick from screen', exact: true }).click();
  await expect(page.locator('#picker-hex')).toHaveValue('#E54B6A');
  await shot(page, 'certgen-colour-desktop.png');
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page.getByLabel('Field text colour', { exact: true })).toHaveValue('#E54B6A');
  await page.getByLabel('Field text colour', { exact: true }).fill('badhex');
  await page.getByLabel('Field text colour', { exact: true }).press('Tab');
  expect(await page.getByLabel('Field text colour', { exact: true }).evaluate((input) => input.validity.valid)).toBe(false);
  await expect(page.getByRole('button', { name: 'Open colour wheel' })).toHaveCSS('background-color', 'rgb(229, 75, 106)');
});

test('Font browser and pixel logo render clearly; sample text toggle works', async ({ page }) => {
  await sample(page);
  await expect(page.locator('#certgen-mark img')).toBeVisible();
  expect(await page.locator('#certgen-mark img').evaluate((img) => img.complete && img.naturalWidth === 96)).toBe(true);
  await shot(page, 'certgen-editor-final.png');
  await page.getByLabel('Show sample text').uncheck();
  await expect(page.locator('.field-sample')).toHaveCount(0);
  await page.getByLabel('Show sample text').check();
  await expect(page.locator('.field-sample')).toHaveCount(3);
  await page.getByRole('button', { name: 'Field font', exact: true }).click();
  await page.getByRole('button', { name: 'Cursive', exact: true }).click();
  await expect(page.locator('.font-option.font-loaded')).not.toHaveCount(0);
  await page.evaluate(() => document.fonts.ready);
  await shot(page, 'certgen-fonts-desktop.png');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Choose a font' })).not.toBeVisible();
});

test('Font and colour dialogs work at mobile width without page overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await sample(page);
  await page.getByRole('button', { name: 'Field font', exact: true }).click();
  await page.getByLabel('Search fonts', { exact: true }).fill('Allura');
  await page.getByRole('button', { name: 'Use Allura', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Field font', exact: true })).toHaveAttribute('value', 'Allura');
  await page.getByRole('button', { name: 'Open colour wheel' }).click();
  await page.locator('#picker-hex').fill('#7B4DFF');
  await page.locator('#picker-hex').press('Tab');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await shot(page, 'certgen-colour-mobile.png');
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await page.getByRole('button', { name: 'Field font', exact: true }).click();
  await page.getByRole('button', { name: 'Cursive', exact: true }).click();
  await shot(page, 'certgen-fonts-mobile.png');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
