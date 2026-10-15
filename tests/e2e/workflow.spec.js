import { test, expect } from '@playwright/test';
import { readFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';
import { PDFDocument, degrees } from 'pdf-lib';

async function downloadBytes(page, action) {
  const waiting = page.waitForEvent('download');
  await action();
  const download = await waiting;
  return { bytes: await readFile(await download.path()), filename: download.suggestedFilename() };
}

async function screenshot(page, name) {
  if (!process.env.CERTGEN_QA_DIR) return;
  await mkdir(process.env.CERTGEN_QA_DIR, { recursive: true });
  await page.screenshot({ path: join(process.env.CERTGEN_QA_DIR, name), fullPage: true });
}

async function openSample(page) {
  await page.goto('/');
  await expect(page).toHaveTitle(/CertGen/);
  await page.getByRole('button', { name: 'Open sample project' }).click();
  await expect(page.locator('#step-2')).toBeVisible();
  await expect(page.locator('.field-box')).toHaveCount(3);
}

async function toExport(page) {
  await page.getByRole('button', { name: 'Add recipients', exact: true }).click();
  await expect(page.locator('#step-3')).toBeVisible();
  await page.getByRole('button', { name: 'Preview certificates', exact: true }).click();
  await expect(page.locator('#step-4')).toBeVisible();
  await expect(page.locator('#preview-canvas')).toBeVisible();
}

async function pdfTexts(page, bytes) {
  return page.evaluate(async (encoded) => {
    const pdfjs = await import('/node_modules/pdfjs-dist/build/pdf.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc = '/node_modules/pdfjs-dist/build/pdf.worker.min.mjs';
    const pdf = await pdfjs.getDocument({ data: Uint8Array.from(atob(encoded), (char) => char.charCodeAt(0)), isEvalSupported: false }).promise;
    const result = [];
    for (let index = 1; index <= pdf.numPages; index++) {
      const page = await pdf.getPage(index);
      const text = await page.getTextContent();
      result.push(text.items.filter((item) => item.str !== undefined).map((item) => ({ text: item.str, transform: item.transform })));
    }
    await pdf.loadingTask.destroy();
    return result;
  }, Buffer.from(bytes).toString('base64'));
}

test('Sample project previews and exports correct individual PDFs, ZIP, and combined PDF', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await screenshot(page, 'certgen-upload-desktop.png');
  await openSample(page);
  await screenshot(page, 'certgen-editor-desktop.png');
  await toExport(page);
  await screenshot(page, 'certgen-preview-desktop.png');
  const preview = await downloadBytes(page, () => page.getByRole('button', { name: 'PDF', exact: true }).click());
  const previewText = (await pdfTexts(page, preview.bytes)).flat().map((item) => item.text).join(' ');
  expect(previewText).toContain('Aditi Raman');
  expect(previewText).toContain('TECHFUSION 2K26');
  expect(previewText).toContain('TF26-0001');
  await page.getByRole('button', { name: 'Generate 3 certificates', exact: true }).click();
  await expect(page.locator('#download-results')).toContainText('3 certificates ready');
  const zipDownload = await downloadBytes(page, () => page.getByRole('button', { name: 'Download ZIP (3)' }).click());
  const zip = await JSZip.loadAsync(zipDownload.bytes);
  const files = Object.keys(zip.files).filter((name) => name.endsWith('.pdf'));
  expect(files).toHaveLength(3);
  const priya = await zip.file(files.find((name) => name.includes('Priya'))).async('uint8array');
  const priyaText = (await pdfTexts(page, priya)).flat().map((item) => item.text).join(' ');
  expect(priyaText).toContain('Priya K.');
  expect(priyaText).toContain('TF26-0003');
  expect(await zip.file('generation-report.csv').async('string')).toContain('Generated');
  const merged = await downloadBytes(page, () => page.getByRole('button', { name: 'One combined PDF' }).click());
  expect((await PDFDocument.load(merged.bytes)).getPageCount()).toBe(3);
  await screenshot(page, 'certgen-export-desktop.png');
  expect(errors).toEqual([]);
});

test('CSV import supports quoted duplicate names and case-insensitive column mapping', async ({ page }) => {
  await openSample(page);
  await page.getByRole('button', { name: 'Add recipients', exact: true }).click();
  await page.locator('#data-input').setInputFiles({ name: 'recipients.csv', mimeType: 'text/csv', buffer: Buffer.from('\uFEFFFull Name,College\n"Raman, Priya",AAACET\n"Raman, Priya",AAACET\nZoë García,AAACET') });
  await expect(page.locator('#data-file-label')).toContainText('3 recipients');
  await expect(page.getByLabel('Map Name to column')).toHaveValue('Full Name');
  await page.getByRole('button', { name: 'Preview certificates', exact: true }).click();
  await expect(page.locator('#preview-canvas')).toBeVisible();
  await page.getByRole('button', { name: 'Generate 3 certificates', exact: true }).click();
  await expect(page.locator('#download-results')).toContainText('3 certificates ready');
  const output = await downloadBytes(page, () => page.getByRole('button', { name: 'Download ZIP (3)' }).click());
  const zip = await JSZip.loadAsync(output.bytes);
  expect(Object.keys(zip.files).filter((name) => name.includes('Raman, Priya'))).toHaveLength(2);
  const zoeName = Object.keys(zip.files).find((name) => name.includes('Zoë'));
  expect((await pdfTexts(page, await zip.file(zoeName).async('uint8array'))).flat().map((item) => item.text).join(' ')).toContain('Zoë García');
});

test('Missing required values block export and unsupported scripts report explicit failures', async ({ page }) => {
  await openSample(page);
  await page.getByRole('button', { name: 'Add recipients', exact: true }).click();
  await page.locator('#data-input').setInputFiles({ name: 'missing.csv', mimeType: 'text/csv', buffer: Buffer.from('Name,College\n,AAACET') });
  await page.getByRole('button', { name: 'Preview certificates', exact: true }).click();
  await expect(page.locator('#export-validation')).toContainText('Row 1: Name is empty');
  await expect(page.locator('#generate-button')).toBeDisabled();
  await page.getByRole('button', { name: 'Back to recipients' }).click();
  await page.getByLabel('Row 1 Name', { exact: true }).fill('தமிழ்');
  await page.getByLabel('Row 1 Name', { exact: true }).press('Tab');
  await page.getByRole('button', { name: 'Preview certificates', exact: true }).click();
  await expect(page.locator('#preview-message')).toContainText('Upload a TTF/OTF');
  await page.getByRole('button', { name: 'Generate 1 certificate', exact: true }).click();
  await expect(page.locator('#download-results')).toContainText('0 certificates ready');
  await expect(page.locator('#download-results')).toContainText('1 certificate could not be generated');
  await expect(page.getByRole('button', { name: /Download ZIP/ })).toHaveCount(0);
});

test('Rotated, cropped, multi-page templates retain accurate fields across zoom changes', async ({ page }) => {
  const template = await PDFDocument.create();
  template.addPage([842, 595]);
  const second = template.addPage([700, 800]); second.setCropBox(30, 40, 400, 600); second.setRotation(degrees(90));
  await page.goto('/');
  await page.locator('#template-input').setInputFiles({ name: 'rotated.pdf', mimeType: 'application/pdf', buffer: Buffer.from(await template.save()) });
  await expect(page.locator('#template-info')).toContainText('2 pages');
  await page.getByRole('button', { name: 'Design fields', exact: true }).click();
  await page.getByLabel('Template page').selectOption('1');
  await page.getByRole('button', { name: 'Add field', exact: true }).click();
  await page.getByLabel('Field left position', { exact: true }).fill('20');
  await page.getByLabel('Field left position', { exact: true }).press('Tab');
  const original = await page.locator('.field-box').getAttribute('style');
  await page.getByLabel('Template zoom').selectOption('1.5');
  await expect(page.locator('.field-box')).toHaveAttribute('style', original);
  const layout = await downloadBytes(page, () => page.getByRole('button', { name: 'Save layout' }).click());
  expect(JSON.parse(layout.bytes.toString()).fields[0].page).toBe(1);
  await page.getByRole('button', { name: 'Add recipients', exact: true }).click();
  await page.locator('#data-input').setInputFiles({ name: 'one.csv', mimeType: 'text/csv', buffer: Buffer.from('Name\nAditi Raman') });
  await page.getByRole('button', { name: 'Preview certificates', exact: true }).click();
  await expect(page.locator('#preview-canvas')).toBeVisible();
  await page.getByLabel('Preview page').selectOption('1');
  await expect(page.locator('#preview-canvas')).toBeVisible();
  const preview = await downloadBytes(page, () => page.getByRole('button', { name: 'PDF', exact: true }).click());
  const output = await PDFDocument.load(preview.bytes);
  expect(output.getPageCount()).toBe(2);
  expect(output.getPage(1).getRotation().angle).toBe(90);
  const texts = await pdfTexts(page, preview.bytes);
  expect(texts[0]).toHaveLength(0);
  expect(texts[1].map((item) => item.text).join(' ')).toContain('Aditi Raman');
});

async function makeXlsx() {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>');
  zip.file('_rels/.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>');
  zip.file('xl/workbook.xml', '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Recipients" sheetId="1" r:id="rId1"/></sheets></workbook>');
  zip.file('xl/_rels/workbook.xml.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>');
  zip.file('xl/worksheets/sheet1.xml', '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Full Name</t></is></c><c r="B1" t="inlineStr"><is><t>College</t></is></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>Priya Raman</t></is></c><c r="B2" t="inlineStr"><is><t>AAACET</t></is></c></row></sheetData></worksheet>');
  return zip.generateAsync({ type: 'nodebuffer' });
}

test('Excel upload imports rows and maps columns', async ({ page }) => {
  await openSample(page);
  await page.getByRole('button', { name: 'Add recipients', exact: true }).click();
  await page.locator('#data-input').setInputFiles({ name: 'recipients.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: await makeXlsx() });
  await expect(page.locator('#data-file-label')).toContainText('1 recipients');
  await expect(page.getByLabel('Row 1 Full Name', { exact: true })).toHaveValue('Priya Raman');
  await expect(page.getByLabel('Map Name to column')).toHaveValue('Full Name');
});

test('Mobile workflow stays within the viewport and produces a real preview', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await screenshot(page, 'certgen-upload-mobile.png');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await openSample(page);
  await screenshot(page, 'certgen-editor-mobile.png');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await toExport(page);
  await screenshot(page, 'certgen-preview-mobile.png');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('A 100-recipient batch creates 100 unique PDFs and reports every row', async ({ page }) => {
  await openSample(page);
  await page.getByRole('button', { name: 'Add recipients', exact: true }).click();
  await page.locator('#data-input').setInputFiles({ name: 'bulk.csv', mimeType: 'text/csv', buffer: Buffer.from('Name\n' + Array.from({ length: 100 }, (_, index) => index % 2 ? `Recipient ${index}` : 'Duplicate Name').join('\n')) });
  await page.getByRole('button', { name: 'Preview certificates', exact: true }).click();
  await expect(page.locator('#preview-canvas')).toBeVisible();
  await page.getByRole('button', { name: 'Generate 100 certificates', exact: true }).click();
  await expect(page.locator('#download-results')).toContainText('100 certificates ready', { timeout: 60000 });
  const output = await downloadBytes(page, () => page.getByRole('button', { name: 'Download ZIP (100)' }).click());
  const zip = await JSZip.loadAsync(output.bytes);
  expect(Object.keys(zip.files).filter((name) => name.endsWith('.pdf'))).toHaveLength(100);
  expect((await zip.file('generation-report.csv').async('string')).split('\r\n')).toHaveLength(101);
});

test('Stopping generation keeps completed certificates and marks unprocessed rows', async ({ page }) => {
  await openSample(page);
  await page.getByRole('button', { name: 'Add recipients', exact: true }).click();
  await page.locator('#data-input').setInputFiles({ name: 'bulk.csv', mimeType: 'text/csv', buffer: Buffer.from('Name\n' + Array.from({ length: 200 }, (_, index) => `Recipient ${index + 1}`).join('\n')) });
  await page.getByRole('button', { name: 'Preview certificates', exact: true }).click();
  await expect(page.locator('#preview-canvas')).toBeVisible();
  await page.getByRole('button', { name: 'Generate 200 certificates', exact: true }).click();
  await expect(page.locator('#progress-label')).toContainText('processed');
  await page.getByRole('button', { name: 'Stop generation', exact: true }).click();
  await expect(page.locator('#progress-label')).toHaveText('Generation stopped');
  await expect(page.locator('#download-results')).toContainText('not processed');
  await expect(page.getByRole('button', { name: /Download ZIP/ })).toBeEnabled();
  const output = await downloadBytes(page, () => page.getByRole('button', { name: /Download ZIP/ }).click());
  const zip = await JSZip.loadAsync(output.bytes);
  const report = await zip.file('generation-report.csv').async('string');
  expect(report).toContain('Not processed');
  expect(report.split('\r\n')).toHaveLength(201);
});

test('Pointer drawing and saved layouts restore accurate positions', async ({ page }) => {
  await openSample(page);
  const bounds = await page.locator('#field-layer').boundingBox();
  await page.mouse.move(bounds.x + bounds.width * .3, bounds.y + bounds.height * .2);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width * .65, bounds.y + bounds.height * .27, { steps: 12 });
  await page.mouse.up();
  await expect(page.locator('.field-box')).toHaveCount(4);
  await expect(page.getByLabel('Field name', { exact: true })).toHaveValue('Date');
  const layout = await downloadBytes(page, () => page.getByRole('button', { name: 'Save layout' }).click());
  const config = JSON.parse(layout.bytes.toString());
  const drawn = config.fields.find((field) => field.name === 'Date');
  expect(drawn.x).toBeCloseTo(.3, 2);
  expect(drawn.width).toBeCloseTo(.35, 2);
  await page.getByLabel('Field left position', { exact: true }).fill('45');
  await page.getByLabel('Field left position', { exact: true }).press('Tab');
  await page.locator('#layout-input').setInputFiles({ name: 'layout.json', mimeType: 'application/json', buffer: layout.bytes });
  await expect(page.locator('.field-box')).toHaveCount(4);
  await page.locator('[data-select-field]').filter({ hasText: 'Date' }).click();
  await expect(page.getByLabel('Field left position', { exact: true })).toHaveValue('30.0');
});

test('Custom font upload and recipient changes produce fresh previews', async ({ page }) => {
  await openSample(page);
  await page.locator('#custom-font-input').setInputFiles(fileURLToPath(new URL('../../public/fonts/NotoSans-Regular.ttf', import.meta.url)));
  await expect(page.getByLabel('Field font', { exact: true })).toHaveValue('Custom');
  await toExport(page);
  await page.getByLabel('Preview recipient').selectOption('1');
  await expect(page.locator('#preview-canvas')).toBeVisible();
  const output = await downloadBytes(page, () => page.getByRole('button', { name: 'PDF', exact: true }).click());
  const text = (await pdfTexts(page, output.bytes)).flat().map((item) => item.text).join(' ');
  expect(text).toContain('Rahul Subramanian');
  expect(text).toContain('TF26-0002');
  expect(text).not.toContain('Aditi Raman');
});
