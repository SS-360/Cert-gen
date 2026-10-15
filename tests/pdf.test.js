import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PDFDocument, StandardFonts, degrees } from 'pdf-lib';
import { makeField, constrainRect, validateLayout, fingerprint } from '../src/lib/layout.js';
import { fitText, generateCertificate, mergeCertificates, pageCoordinates, createDemoTemplate } from '../src/lib/pdf.js';

const fontBytes = new Uint8Array(await readFile(new URL('../public/fonts/NotoSans-Regular.ttf', import.meta.url)));

test('PDF generation embeds Unicode text and keeps all original pages', async () => {
  const template = await PDFDocument.create();
  template.addPage([842, 595]);
  template.addPage([500, 700]);
  const bytes = await template.save();
  const name = makeField(0, { x: .15, y: .4, width: .7, height: .1 }, 'Name');
  const event = { ...makeField(1, undefined, 'Name'), source: 'constant', value: 'Sample event' };
  const result = await generateCertificate(bytes, [name, event], { Name: 'Zoë García – Алексей' }, { fontBytes });
  const output = await PDFDocument.load(result);
  assert.equal(output.getPageCount(), 2);
  assert.deepEqual(output.getPage(1).getSize(), { width: 500, height: 700 });
  assert.ok(result.length > bytes.length);
});

test('Rotation and crop boxes map displayed field coordinates back into PDF space', async () => {
  const doc = await PDFDocument.create();
  const page = doc.addPage([700, 800]);
  page.setCropBox(30, 40, 400, 600);
  page.setRotation(degrees(90));
  assert.deepEqual(pageCoordinates(page), { width: 600, height: 400, matrix: [0, 1, -1, 0, 430, 40] });
  const result = await generateCertificate(await doc.save(), [makeField(0, undefined, 'Name')], { Name: 'Sample Participant' }, { fontBytes });
  const output = await PDFDocument.load(result);
  assert.equal(output.getPage(0).getRotation().angle, 90);
  assert.deepEqual(output.getPage(0).getCropBox(), { x: 30, y: 40, width: 400, height: 600 });
});

test('Auto-fit handles long names and multiline values without overflowing', async () => {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const rect = { width: 150, height: 40 };
  const text = fitText(font, 'A particularly long participant name', rect, 36);
  assert.ok(font.widthOfTextAtSize(text.lines[0], text.size) <= 142.01);
  assert.ok(text.height <= 36.01);
  assert.equal(fitText(font, 'First line\nSecond line', rect, 30).lines.length, 2);
  assert.throws(() => fitText(font, 'Long participant name', { width: 20, height: 10 }, 30, false), /overflows/);
});

test('Unsupported glyphs and missing custom fonts produce actionable errors', async () => {
  const bytes = await createDemoTemplate();
  await assert.rejects(() => generateCertificate(bytes, [makeField(0, undefined, 'Name')], { Name: 'தமிழ்' }, { fontBytes }), /Upload a TTF\/OTF/);
  await assert.rejects(() => generateCertificate(bytes, [{ ...makeField(0, undefined, 'Name'), font: 'Custom' }], { Name: 'Sample' }), /Upload your custom/);
});

test('Combined PDF contains every page of every generated certificate', async () => {
  const template = await PDFDocument.create(); template.addPage(); template.addPage();
  const bytes = await template.save();
  const outputs = await Promise.all(['Sample', 'Demo'].map(async (Name) => ({ bytes: await generateCertificate(bytes, [makeField(0, undefined, 'Name')], { Name }, { fontBytes }) })));
  assert.equal((await PDFDocument.load(await mergeCertificates(outputs))).getPageCount(), 4);
});

test('Layout import validates template identity, pages, coordinates, and styles', async () => {
  const hash = await fingerprint(new Uint8Array([1, 2, 3]));
  const field = makeField(0, undefined, 'Name');
  const layout = { version: 1, templateHash: hash, fields: [field] };
  const context = { fingerprint: hash, pageCount: 1 };
  assert.equal(validateLayout(layout, context)[0].name, 'Name');
  assert.throws(() => validateLayout(layout, { ...context, fingerprint: 'other' }), /different PDF/);
  assert.throws(() => validateLayout({ ...layout, fields: [{ ...field, page: 1 }] }, context), /page missing/);
  assert.throws(() => validateLayout({ ...layout, fields: [{ ...field, x: .95 }] }, context), /outside/);
  assert.throws(() => validateLayout({ ...layout, fields: [{ ...field, color: 'bad' }] }, context), /colour/);
  assert.throws(() => validateLayout({ ...layout, fields: [{ ...field, x: NaN }] }, context), /coordinates/);
});

test('Dragging and resizing constrain fields to the visible page', () => {
  const rect = constrainRect({ x: -.2, y: .95, width: 2, height: .8 });
  assert.equal(rect.x, 0); assert.equal(rect.width, 1);
  assert.ok(rect.y + rect.height <= 1);
});

test('New fields stay unnamed, including a saved draft', () => {
  const field = makeField();
  assert.equal(field.name, ''); assert.equal(field.column, '');
  assert.equal(validateLayout({ version: 1, fields: [field] }, { pageCount: 1 })[0].name, '');
});
