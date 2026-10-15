import { test, expect } from '@playwright/test';
import { PDFDocument, StandardFonts, degrees, rgb } from 'pdf-lib';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

test.use({ deviceScaleFactor: 2 });
const browserErrors = new WeakMap();
test.beforeEach(async ({ page }) => {
  const errors = []; browserErrors.set(page, errors);
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', (error) => errors.push(error.message));
});
test.afterEach(async ({ page }) => {
  await expect(page).toHaveTitle(/CertGen/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
  await expect(page.locator('vite-error-overlay')).toHaveCount(0);
  expect(browserErrors.get(page), 'No browser console errors or uncaught exceptions').toEqual([]);
});

async function imageDigest(page, selector) {
  return page.locator(selector).evaluate(async (canvas) => {
    const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    const digest = await crypto.subtle.digest('SHA-256', pixels);
    return { width: canvas.width, height: canvas.height, cssWidth: canvas.getBoundingClientRect().width, cssHeight: canvas.getBoundingClientRect().height, sha256: [...new Uint8Array(digest)].map((n) => n.toString(16).padStart(2, '0')).join('') };
  });
}

async function editorReady(page) {
  await expect(page.locator('#editor-canvas')).toHaveAttribute('data-render-state', 'ready');
  await expect(page.locator('#editor-preview-status')).toHaveText('PDF-accurate text preview');
}

async function toEditor(page) {
  await page.getByRole('button', { name: 'Review & export', exact: true }).click();
  await page.getByRole('button', { name: 'Design fields', exact: true }).click();
  await editorReady(page);
}

async function saveCanvasEvidence(page, selector, name, phase) {
  if (!process.env.CERTGEN_QA_DIR) return;
  await mkdir(process.env.CERTGEN_QA_DIR, { recursive: true });
  // An element screenshot can include clipped ancestor UI for a tall, scrolling PDF.
  // Save the actual rendered canvas pixels, plus a separate viewport screenshot.
  const capture = await page.locator(selector).evaluate((canvas) => {
    const detail = document.createElement('canvas');
    detail.width = Math.round(canvas.width * .86); detail.height = Math.round(canvas.height * .18);
    detail.getContext('2d').drawImage(canvas, Math.round(canvas.width * .07), Math.round(canvas.height * .46), detail.width, detail.height, 0, 0, detail.width, detail.height);
    return { full: canvas.toDataURL('image/png').split(',')[1], detail: detail.toDataURL('image/png').split(',')[1] };
  });
  await writeFile(join(process.env.CERTGEN_QA_DIR, `${name}-${phase}.png`), Buffer.from(capture.full, 'base64'));
  if (name.startsWith('portrait')) await writeFile(join(process.env.CERTGEN_QA_DIR, `${name}-${phase}-detail.png`), Buffer.from(capture.detail, 'base64'));
  await page.screenshot({ path: join(process.env.CERTGEN_QA_DIR, `${name}-${phase}-ui.png`), fullPage: false });
}

async function comparePreviews(page, name, evidence = false) {
  await editorReady(page);
  const editor = await imageDigest(page, '#editor-canvas');
  if (evidence) await saveCanvasEvidence(page, '#editor-canvas', name, 'design');
  await page.getByRole('button', { name: 'Add recipients', exact: true }).click();
  await page.getByRole('button', { name: 'Preview certificates', exact: true }).click();
  await expect(page.locator('#preview-canvas')).toBeVisible();
  const exported = await imageDigest(page, '#preview-canvas');
  expect(exported, `${name}: visible dimensions and every rendered pixel must match`).toEqual(editor);
  if (evidence) await saveCanvasEvidence(page, '#preview-canvas', name, 'export');
  return editor;
}

async function chooseFont(page, name, style) {
  await page.getByRole('button', { name: 'Field font', exact: true }).click();
  await page.getByLabel('Search fonts', { exact: true }).fill(name);
  await page.getByRole('button', { name: `Use ${name}`, exact: true }).click();
  if (style) await page.getByLabel('Field font style', { exact: true }).selectOption(style);
  await editorReady(page);
}

test('Design and export are pixel-identical for font styles, alignments, multiline fit and linked zoom', async ({ page }) => {
  const errors = []; page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await page.getByRole('button', { name: 'Open sample project' }).click();
  await comparePreviews(page, 'cursive-default', true);
  for (const width of [850, 1920]) {
    await page.setViewportSize({ width, height: 1000 });
    await toEditor(page);
    await comparePreviews(page, `responsive-${width}`);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await toEditor(page);
  await chooseFont(page, 'Times Roman', 'bold');
  await page.getByRole('button', { name: 'Align left', exact: true }).click();
  await page.getByLabel('Template zoom').selectOption('1.5');
  await comparePreviews(page, 'times-bold-150');
  await expect(page.getByLabel('Preview zoom')).toHaveValue('1.5');
  await page.getByLabel('Preview zoom').selectOption('2');
  await expect(page.locator('#preview-canvas')).toBeVisible();
  const zoomedExport = await imageDigest(page, '#preview-canvas');
  await toEditor(page);
  await expect(page.getByLabel('Template zoom')).toHaveValue('2');
  expect(await imageDigest(page, '#editor-canvas')).toEqual(zoomedExport);
  await page.getByLabel('Template zoom').selectOption('1');
  await chooseFont(page, 'Poppins', 'boldItalic');
  await page.getByRole('button', { name: 'Align right', exact: true }).click();
  await comparePreviews(page, 'poppins-bold-italic-right');
  await page.getByRole('button', { name: 'Back to recipients', exact: true }).click();
  await page.locator('#data-input').setInputFiles({ name: 'long.csv', mimeType: 'text/csv', buffer: Buffer.from('Name\n"A VERY LONG PARTICIPANT NAME\nWITH A SECOND LINE"') });
  await page.getByRole('button', { name: 'Back to fields', exact: true }).click();
  await editorReady(page);
  await comparePreviews(page, 'multiline-auto-fit');
  await page.getByLabel('Preview recipient').selectOption('0');
  expect(errors).toEqual([]);
});

test('Portrait certificate fields match export at desktop and mobile with the actual point geometry', async ({ page }) => {
  const doc = await PDFDocument.create();
  const paper = doc.addPage([595.5, 850.07996]); paper.setCropBox(0, 7.82998, 595.5, 842.24998);
  const font = await doc.embedFont(StandardFonts.TimesRoman);
  paper.drawText('This is to certify that Mr. / Ms.', { x: 60, y: 415, font, size: 14 });
  for (const y of [412, 378, 344]) paper.drawLine({ start: { x: 65, y }, end: { x: 530, y }, color: rgb(0, 0, 0), thickness: .4 });
  const bytes = process.env.CERTGEN_QA_TEMPLATE ? await readFile(process.env.CERTGEN_QA_TEMPLATE) : Buffer.from(await doc.save());
  await page.goto('/');
  await page.locator('#template-input').setInputFiles({ name: 'sample-certificate.pdf', mimeType: 'application/pdf', buffer: bytes });
  await page.locator('#template-next').click();
  const configs = [
    { name: 'Name', x: 42.5, y: 49.5, width: 42, height: 4.3, size: 18 },
    { name: 'College', x: 12.5, y: 53.5, width: 75, height: 4.3, size: 20 },
    { name: 'Event', x: 32.5, y: 57.6, width: 30, height: 4.3, size: 20 },
  ];
  for (const item of configs) {
    await page.getByRole('button', { name: 'Add field', exact: true }).click();
    await page.getByLabel('Field name', { exact: true }).fill(item.name);
    await page.getByLabel('Field name', { exact: true }).press('Tab');
    await chooseFont(page, 'Times Roman', 'bold');
    await page.getByLabel('Field font size', { exact: true }).fill(String(item.size));
    await page.getByLabel('Field font size', { exact: true }).press('Tab');
    await page.getByText('Position & size', { exact: true }).click();
    for (const [label, value] of [['Field left position', item.x], ['Field top position', item.y], ['Field width', item.width], ['Field height', item.height]]) {
      await page.getByLabel(label, { exact: true }).fill(String(value));
      await page.getByLabel(label, { exact: true }).press('Tab');
    }
  }
  await page.getByRole('button', { name: 'Add recipients', exact: true }).click();
  await page.locator('#data-input').setInputFiles({ name: 'recipients.csv', mimeType: 'text/csv', buffer: Buffer.from('Name,College,Event\nSAMPLE PARTICIPANT,Sample institution,Sample event') });
  // Keep the event mapping explicit so this also checks imported field data.
  await page.getByLabel('Map Event to column').selectOption('Event');
  await page.getByRole('button', { name: 'Back to fields', exact: true }).click();
  await comparePreviews(page, 'portrait-desktop', true);
  await page.setViewportSize({ width: 390, height: 844 });
  await toEditor(page);
  await comparePreviews(page, 'portrait-mobile', true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('Rotated multi-page fields have the same size and baseline in both views', async ({ page }) => {
  const doc = await PDFDocument.create(); doc.addPage([842, 595]);
  const rotated = doc.addPage([700, 800]); rotated.setCropBox(30, 40, 400, 600); rotated.setRotation(degrees(90));
  await page.goto('/');
  await page.locator('#template-input').setInputFiles({ name: 'rotated.pdf', mimeType: 'application/pdf', buffer: Buffer.from(await doc.save()) });
  await page.locator('#template-next').click();
  await page.getByLabel('Template page').selectOption('1');
  await page.getByRole('button', { name: 'Add field', exact: true }).click();
  await page.getByLabel('Field name', { exact: true }).fill('Name');
  await page.getByLabel('Field name', { exact: true }).press('Tab');
  await page.getByRole('button', { name: 'Add recipients', exact: true }).click();
  await page.locator('#data-input').setInputFiles({ name: 'one.csv', mimeType: 'text/csv', buffer: Buffer.from('Name\nSample Participant') });
  await page.getByRole('button', { name: 'Preview certificates', exact: true }).click();
  await page.getByLabel('Preview page').selectOption('1');
  await expect(page.locator('#preview-canvas')).toBeVisible();
  const exported = await imageDigest(page, '#preview-canvas');
  await page.getByRole('button', { name: 'Design fields', exact: true }).click();
  await editorReady(page);
  expect(await imageDigest(page, '#editor-canvas')).toEqual(exported);
});

test('Rapid edits discard stale renders and design follows the selected export recipient', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Open sample project' }).click();
  await editorReady(page);
  for (const text of ['OLDER RENDER', 'ANOTHER SUPERSEDED RENDER', '']) await page.getByLabel('Field sample text', { exact: true }).fill(text);
  await page.getByLabel('Field sample text', { exact: true }).press('Tab');
  await editorReady(page);
  await comparePreviews(page, 'rapid-edits');
  await page.getByLabel('Preview recipient').selectOption('1');
  await expect(page.locator('#preview-canvas')).toBeVisible();
  const secondRecipient = await imageDigest(page, '#preview-canvas');
  await page.getByRole('button', { name: 'Design fields', exact: true }).click();
  await editorReady(page);
  await expect(page.locator('.selected .field-sample')).toHaveText('Example Participant');
  expect(await imageDigest(page, '#editor-canvas')).toEqual(secondRecipient);
});
