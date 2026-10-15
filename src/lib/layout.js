export const LAYOUT_VERSION = 1;

export function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

export function constrainRect(rect) {
  const x = clamp(rect.x, 0, .99);
  const y = clamp(rect.y, 0, .99);
  return { x, y, width: clamp(rect.width, .005, 1 - x), height: clamp(rect.height, .005, 1 - y) };
}

export function makeField(page = 0, rect = { x: .2, y: .4, width: .6, height: .08 }, name = 'Name') {
  return {
    id: crypto.randomUUID(), name, page, ...constrainRect(rect),
    source: 'column', column: name, value: '', prefix: 'CERT-', start: 1, digits: 4,
    font: 'NotoSans', fontSize: 30, color: '#142d4e', align: 'center',
    autoFit: true, required: true,
  };
}

export function validateLayout(value, { fingerprint, pageCount }) {
  if (value?.version !== LAYOUT_VERSION || !Array.isArray(value.fields)) throw new Error('This is not a supported CertGen layout.');
  if (value.templateHash && value.templateHash !== fingerprint) throw new Error('This layout belongs to a different PDF. Upload its original template first.');
  if (!value.fields.length || value.fields.length > 100) throw new Error('A layout must contain between 1 and 100 fields.');
  const ids = new Set();
  const fonts = new Set(['NotoSans', 'Helvetica', 'Times-Roman', 'Courier', 'Custom']);
  return value.fields.map((field) => {
    const numbers = ['x', 'y', 'width', 'height', 'fontSize'];
    if (!field || numbers.some((key) => !Number.isFinite(field[key]))) throw new Error('The layout contains invalid field coordinates.');
    if (!Number.isInteger(field.page) || field.page < 0 || field.page >= pageCount) throw new Error('The layout refers to a page missing from this PDF.');
    if (field.x < 0 || field.y < 0 || field.width <= 0 || field.height <= 0 || field.x + field.width > 1.001 || field.y + field.height > 1.001) throw new Error('A layout field is outside the page.');
    if (!['column', 'constant', 'sequence'].includes(field.source) || !fonts.has(field.font) || !['left', 'center', 'right'].includes(field.align)) throw new Error('The layout has an invalid field setting.');
    if (!/^#[0-9a-f]{6}$/i.test(field.color) || field.fontSize < 4 || field.fontSize > 200) throw new Error('The layout has an invalid colour or font size.');
    if (!String(field.name ?? '').trim()) throw new Error('Every field needs a name.');
    if (field.source === 'sequence' && (!Number.isInteger(field.start) || field.start < 0 || !Number.isInteger(field.digits) || field.digits < 1 || field.digits > 12)) throw new Error('The layout has an invalid sequence setting.');
    const clean = {
      ...makeField(field.page, field, String(field.name).slice(0, 80)),
      source: field.source, column: String(field.column ?? '').slice(0, 200),
      value: String(field.value ?? '').slice(0, 2000), prefix: String(field.prefix ?? '').slice(0, 80),
      start: field.start ?? 1, digits: field.digits ?? 4,
      font: field.font, fontSize: field.fontSize, color: field.color, align: field.align,
      autoFit: Boolean(field.autoFit), required: Boolean(field.required),
    };
    if (typeof field.id === 'string' && !ids.has(field.id)) clean.id = field.id;
    ids.add(clean.id);
    return clean;
  });
}

export async function fingerprint(bytes) {
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash), (value) => value.toString(16).padStart(2, '0')).join('');
}
