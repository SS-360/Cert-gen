import 'regenerator-runtime/runtime.js';
import { PDFDocument, StandardFonts, rgb, pushGraphicsState, popGraphicsState, concatTransformationMatrix } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { resolveValue } from './data.js';
import { fontKey } from './fonts.js';

export function pageCoordinates(page) {
  const box = page.getCropBox();
  const angle = ((page.getRotation().angle % 360) + 360) % 360;
  const { x, y, width: w, height: h } = box;
  const matrices = {
    0: [1, 0, 0, 1, x, y],
    90: [0, 1, -1, 0, x + w, y],
    180: [-1, 0, 0, -1, x + w, y + h],
    270: [0, -1, 1, 0, x, y + h],
  };
  if (!matrices[angle]) throw new Error('Only PDF page rotations in multiples of 90° are supported.');
  return { width: angle % 180 ? h : w, height: angle % 180 ? w : h, matrix: matrices[angle] };
}

export function fitText(font, text, rect, maxSize, autoFit = true) {
  const lines = String(text).replace(/\r\n?/g, '\n').split('\n');
  const unitWidth = Math.max(...lines.map((line) => font.widthOfTextAtSize(line, 1)), .001);
  const ascender = font.heightAtSize(1, { descender: false });
  const descender = font.heightAtSize(1, { descender: true }) - ascender;
  const totalHeight = ascender + descender + Math.max(0, lines.length - 1) * 1.2;
  const width = Math.max(rect.width - 8, 1);
  const height = Math.max(rect.height - 4, 1);
  const size = autoFit ? Math.min(maxSize, width / unitWidth, height / totalHeight) : maxSize;
  if (size < 4) throw new Error('Text is too long for its field. Widen the field or shorten the value.');
  if (!autoFit && (unitWidth * size > width || totalHeight * size > height)) throw new Error('Text overflows its field. Enable auto-fit or enlarge the field.');
  return { lines, size, ascender: ascender * size, descender: descender * size, height: totalHeight * size };
}

export async function generateCertificate(templateBytes, fields, row, { rowIndex = 0, fontBytes, customFontBytes, fontData = new Map() } = {}) {
  const doc = await PDFDocument.load(templateBytes.slice());
  doc.registerFontkit(fontkit);
  const fonts = new Map();
  async function getFont(name, style = 'regular') {
    const key = fontKey(name, style);
    if (fonts.has(key)) return fonts.get(key);
    let result;
    const standard = {
      Helvetica: [StandardFonts.Helvetica, StandardFonts.HelveticaBold, StandardFonts.HelveticaOblique, StandardFonts.HelveticaBoldOblique],
      'Times-Roman': [StandardFonts.TimesRoman, StandardFonts.TimesRomanBold, StandardFonts.TimesRomanItalic, StandardFonts.TimesRomanBoldItalic],
      Courier: [StandardFonts.Courier, StandardFonts.CourierBold, StandardFonts.CourierOblique, StandardFonts.CourierBoldOblique],
    };
    if (!standard[name]) {
      const bytes = fontData.get(key) ?? (name === 'Custom' ? customFontBytes : name === 'NotoSans' && style === 'regular' ? fontBytes : undefined);
      if (!bytes) throw new Error(name === 'Custom' ? 'Upload your custom TTF/OTF font before generating.' : 'The bundled font could not load. Reload the app and try again.');
      result = await doc.embedFont(bytes, { subset: true });
    } else {
      result = await doc.embedFont(standard[name][['regular', 'bold', 'italic', 'boldItalic'].indexOf(style)] ?? standard[name][0]);
    }
    fonts.set(key, result);
    return result;
  }
  for (const field of fields) {
    const value = resolveValue(field, row, rowIndex);
    if (!value) {
      if (field.required) throw new Error(`${field.name} is empty. Map its column or provide a common value.`);
      continue;
    }
    const page = doc.getPage(field.page);
    const { width, height, matrix } = pageCoordinates(page);
    const font = await getFont(field.font, field.fontStyle);
    const characterSet = new Set(font.getCharacterSet());
    const missing = [...new Set(Array.from(value).filter((char) => char !== '\n' && char !== '\r' && !characterSet.has(char.codePointAt(0))))];
    if (missing.length) throw new Error(`${field.name}: the selected font cannot display ${missing.slice(0, 4).join(' ')}. Upload a TTF/OTF font that supports these characters.`);
    const rect = { x: field.x * width, y: (1 - field.y - field.height) * height, width: field.width * width, height: field.height * height };
    const text = fitText(font, value, rect, field.fontSize, field.autoFit);
    const firstBaseline = rect.y + (rect.height - text.height) / 2 + text.descender + (text.lines.length - 1) * text.size * 1.2;
    const color = rgb(...[1, 3, 5].map((start) => parseInt(field.color.slice(start, start + 2), 16) / 255));
    page.pushOperators(pushGraphicsState(), concatTransformationMatrix(...matrix));
    text.lines.forEach((line, index) => {
      const lineWidth = font.widthOfTextAtSize(line, text.size);
      const offset = field.align === 'left' ? 4 : field.align === 'right' ? rect.width - lineWidth - 4 : (rect.width - lineWidth) / 2;
      page.drawText(line, { x: rect.x + offset, y: firstBaseline - index * text.size * 1.2, size: text.size, font, color });
    });
    page.pushOperators(popGraphicsState());
  }
  return doc.save();
}

export async function mergeCertificates(certificates) {
  const merged = await PDFDocument.create();
  for (const certificate of certificates) {
    const source = await PDFDocument.load(certificate.bytes);
    const pages = await merged.copyPages(source, source.getPageIndices());
    pages.forEach((page) => merged.addPage(page));
  }
  return merged.save();
}

export async function createDemoTemplate() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([842, 595]);
  const serif = await doc.embedFont(StandardFonts.TimesRoman);
  const sans = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const navy = rgb(.08, .17, .29);
  const blue = rgb(.17, .37, .92);
  const gold = rgb(.73, .57, .29);
  page.drawRectangle({ x: 0, y: 0, width: 842, height: 595, color: rgb(1, 1, 1) });
  page.drawRectangle({ x: 22, y: 22, width: 798, height: 551, borderColor: navy, borderWidth: 1.5 });
  page.drawRectangle({ x: 32, y: 32, width: 778, height: 531, borderColor: gold, borderWidth: .6 });
  page.drawRectangle({ x: 22, y: 550, width: 798, height: 23, color: navy });
  function center(value, y, size, font = sans, color = navy) {
    page.drawText(value, { x: (842 - font.widthOfTextAtSize(value, size)) / 2, y, size, font, color });
  }
  center('YOUR ORGANIZATION', 507, 15, bold);
  center('Your department', 482, 12);
  center('CERTIFICATE', 413, 46, serif);
  center('OF PARTICIPATION', 384, 14, bold, blue);
  center('This certificate is proudly presented to', 339, 13);
  page.drawLine({ start: { x: 165, y: 260 }, end: { x: 677, y: 260 }, thickness: .6, color: gold });
  center('for their participation in', 226, 12);
  center('Your event or program', 157, 12);
  page.drawLine({ start: { x: 95, y: 93 }, end: { x: 245, y: 93 }, thickness: .5, color: navy });
  page.drawLine({ start: { x: 597, y: 93 }, end: { x: 747, y: 93 }, thickness: .5, color: navy });
  page.drawText('Authorized signatory', { x: 110, y: 72, size: 10, font: sans, color: navy });
  page.drawText('Authorized signatory', { x: 613, y: 72, size: 10, font: sans, color: navy });
  return doc.save();
}
