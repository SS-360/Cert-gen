import Papa from 'papaparse';

export const MAX_ROWS = 5000;
export const MAX_TEMPLATE_BYTES = 25 * 1024 * 1024;
export const MAX_DATA_BYTES = 10 * 1024 * 1024;

export function headerKey(value) {
  return String(value ?? '').replace(/^\uFEFF/, '').trim().toLowerCase().replace(/[\s_-]+/g, '');
}

export function normalizeTable(table) {
  const nonempty = table.filter((row) => row.some((cell) => String(cell ?? '').trim()));
  if (nonempty.length < 2) throw new Error('Your file needs a header row and at least one recipient.');
  const headers = nonempty[0].map((cell) => String(cell ?? '').replace(/^\uFEFF/, '').trim());
  if (headers.some((header) => !header)) throw new Error('Every column needs a name in the first row.');
  if (new Set(headers.map(headerKey)).size !== headers.length) throw new Error('Column names must be unique (ignoring case and spaces).');
  if (nonempty.length - 1 > MAX_ROWS) throw new Error(`Import up to ${MAX_ROWS.toLocaleString()} recipients at a time.`);
  const rows = nonempty.slice(1).map((cells, index) => {
    if (cells.length > headers.length && cells.slice(headers.length).some((cell) => String(cell ?? '').trim())) {
      throw new Error(`Row ${index + 2} contains more values than the header row.`);
    }
    return Object.fromEntries(headers.map((header, column) => {
      const cell = cells[column];
      return [header, cell instanceof Date ? cell.toISOString().slice(0, 10) : String(cell ?? '').trim()];
    }));
  });
  return { headers, rows };
}

export function parseCsv(text) {
  const parsed = Papa.parse(String(text).replace(/^\uFEFF/, ''), { skipEmptyLines: 'greedy' });
  const errors = parsed.errors.filter((error) => error.code !== 'UndetectableDelimiter');
  if (errors.length) throw new Error(`Could not read CSV: ${errors[0].message}`);
  return normalizeTable(parsed.data);
}

export async function importRecipients(file) {
  if (file.size > MAX_DATA_BYTES) throw new Error('The recipient file must be smaller than 10 MB.');
  if (/\.xlsx$/i.test(file.name)) {
    const { readSheet } = await import('read-excel-file/browser');
    return normalizeTable(await readSheet(file, 1));
  }
  if (!/\.(csv|tsv|txt)$/i.test(file.name)) throw new Error('Choose a CSV, TSV, or Excel .xlsx file.');
  return parseCsv(await file.text());
}

export function matchColumn(name, headers) {
  const key = headerKey(name);
  const exact = headers.find((header) => headerKey(header) === key);
  if (exact) return exact;
  const names = new Set(['name', 'fullname', 'studentname', 'participantname', 'recipientname']);
  return names.has(key) ? (headers.find((header) => names.has(headerKey(header))) ?? '') : '';
}

export function resolveValue(field, row, rowIndex = 0) {
  if (field.source === 'constant') return String(field.value ?? '').trim();
  if (field.source === 'sequence') return `${field.prefix ?? ''}${String((field.start ?? 1) + rowIndex).padStart(field.digits ?? 4, '0')}`;
  return String(Object.hasOwn(row, field.column) ? row[field.column] ?? '' : '').trim();
}

export function validateRecipients(fields, rows) {
  const issues = [];
  if (!fields.length) return [{ message: 'Add at least one certificate field.' }];
  if (!rows.length) return [{ message: 'Add at least one recipient.' }];
  rows.forEach((row, index) => fields.forEach((field) => {
    if (field.required && !resolveValue(field, row, index)) {
      issues.push({ row: index + 1, field: field.name, message: `Row ${index + 1}: ${field.name} is empty${field.source === 'column' ? ' or has no mapped column' : ''}.` });
    }
  }));
  return issues;
}

export function recipientName(fields, row, index) {
  const nameField = fields.find((field) => /name/i.test(field.name) && field.source === 'column') ?? fields.find((field) => field.source === 'column');
  return nameField ? resolveValue(nameField, row, index) : `Recipient ${index + 1}`;
}

export function certificateFilename(name, index) {
  const safe = String(name || 'recipient').normalize('NFKC').replace(/[<>:"/\\|?*\u0000-\u001F]/g, '-').replace(/[.\s]+$/g, '').slice(0, 90) || 'recipient';
  return `${String(index + 1).padStart(4, '0')}-${safe}.pdf`;
}

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

export function toCsv(rows) {
  return '\uFEFF' + Papa.unparse(rows, { escapeFormulae: true });
}
