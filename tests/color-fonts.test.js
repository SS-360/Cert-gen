import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PDFDocument } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { FONT_CATALOG, fontKey } from '../src/lib/fonts.js';
import { makeField, validateLayout } from '../src/lib/layout.js';
import { generateCertificate } from '../src/lib/pdf.js';
import { normalizeHex, hsvToHex, hexToHsv, hsvToRgb, rgbToHsv } from '../src/lib/color.js';

test('Hex input accepts short/full hex and rejects invalid colours', () => {
  assert.equal(normalizeHex('ABC'), '#aabbcc'); assert.equal(normalizeHex(' #142D4E '), '#142d4e');
  for (const bad of ['red', '#12345', '#1234567', '#gg0000', '']) assert.equal(normalizeHex(bad), null);
});
test('HSV colour wheel conversion round-trips exact RGB colours', () => {
  for (const hex of ['#000000', '#ffffff', '#ff0000', '#00ff00', '#0000ff', '#142d4e', '#7b4dff', '#abcdef']) {
    const hsv = hexToHsv(hex); assert.equal(hsvToHex(hsv.h, hsv.s, hsv.v), hex);
  }
  assert.deepEqual(hsvToRgb(360, 1, 1), [255, 0, 0]);
  assert.deepEqual(rgbToHsv(128, 128, 128), { h: 0, s: 0, v: 128 / 255 });
});
test('Every bundled typeface/style is valid and embeds in a PDF', async () => {
  const template = await PDFDocument.create(); template.addPage([842, 595]); const bytes = await template.save();
  for (const family of FONT_CATALOG.filter((font) => !font.standard)) {
    const license = await readFile(new URL(`../public/fonts/licenses/${family.id}.txt`, import.meta.url), 'utf8');
    assert.ok(license.length > 100, `${family.name} needs its licence`);
    for (const face of family.faces) {
      const font = new Uint8Array(await readFile(new URL(`../public/fonts/${face.file}`, import.meta.url)));
      const parsed = fontkit.create(font); assert.ok(parsed.numGlyphs > 20, family.name);
      const field = { ...makeField(0, undefined, 'Name'), font: family.id, fontStyle: face.id };
      const pdf = await generateCertificate(bytes, [field], { Name: family.id === 'NotoSansTamil' ? 'தமிழ்' : 'Sample Participant' }, { fontData: new Map([[fontKey(family.id, face.id), font]]) });
      assert.equal((await PDFDocument.load(pdf)).getPageCount(), 1, `${family.name} ${face.id}`);
    }
  }
});
test('Visual font/style and sample text survive a saved layout; old layouts default to regular', () => {
  const field = { ...makeField(0, undefined, 'Name'), font: 'Poppins', fontStyle: 'boldItalic', previewText: 'Sample only' };
  const [restored] = validateLayout({ version: 1, fields: [field] }, { fingerprint: '', pageCount: 1 });
  assert.equal(restored.fontStyle, 'boldItalic'); assert.equal(restored.previewText, 'Sample only');
  delete field.fontStyle; delete field.previewText;
  assert.equal(validateLayout({ version: 1, fields: [field] }, { fingerprint: '', pageCount: 1 })[0].fontStyle, 'regular');
  field.fontStyle = 'not-a-style';
  assert.throws(() => validateLayout({ version: 1, fields: [field] }, { fingerprint: '', pageCount: 1 }), /font style/);
});
