import './styles.css';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { MAX_ROWS, MAX_TEMPLATE_BYTES, importRecipients, matchColumn, validateRecipients, recipientName, certificateFilename, escapeHtml as esc, toCsv } from './lib/data.js';
import { LAYOUT_VERSION, makeField, constrainRect, clamp, validateLayout, fingerprint } from './lib/layout.js';

let pdfjs;
async function loadPdfRenderer() {
  pdfjs ??= await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  return pdfjs;
}
const base = import.meta.env.BASE_URL;
const pdfOptions = { cMapUrl: `${base}pdfjs/cmaps/`, cMapPacked: true, standardFontDataUrl: `${base}pdfjs/standard_fonts/`, wasmUrl: `${base}pdfjs/wasm/`, isEvalSupported: false };
const $ = (selector) => document.querySelector(selector);
const shapes = {
  certificate: '<path d="M7 3h10v18H7zM10 7h4M10 11h4M10 15h4M10 18h2"/>',
  shield: '<path d="m12 3 8 3v6c0 5-8 9-8 9S4 17 4 12V6z"/><path d="m8 12 3 3 5-6"/>',
  folder: '<path d="M3 7V5h7l2 3h9v12H3z"/>',
  save: '<path d="M4 3h13l3 3v15H4zM8 3v6h8V3M8 21v-8h8v8"/>',
  upload: '<path d="M4 16v5h16v-5M12 16V3m-5 5 5-5 5 5"/>',
  download: '<path d="M4 16v5h16v-5M12 3v12m-5-5 5 5 5-5"/>',
  'arrow-right': '<path d="M4 12h16m-6-6 6 6-6 6"/>',
  select: '<path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/><path d="m10 10 3 8 1-4 4-1z"/>',
  table: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M9 9v11M15 9v11"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>',
  trash: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/>',
  copy: '<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V3H3v13h5"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/>',
  spark: '<path d="m12 3 2.3 6.7L21 12l-6.7 2.3L12 21l-2.3-6.7L3 12l6.7-2.3z"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
};
const icon = (name) => `<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${shapes[name] ?? shapes.info}</svg>`;
document.querySelectorAll('[data-icon]').forEach((node) => { node.innerHTML = icon(node.dataset.icon); });

const state = {
  step: 1, file: null, bytes: null, pdf: null, hash: '', fields: [], selected: null,
  page: 0, headers: [], rows: [], imported: false, dataFilename: '', tablePage: 0, search: '',
  customFont: null, customFontName: '', results: [], failures: [], generating: false, controller: null,
  previewIndex: 0, previewPage: 0, previewBytes: null, previewPdf: null,
};
let fontPromise;
let editorTask;
let editorToken = 0;
let previewTask;
let previewToken = 0;
let activeGesture;
let toastTimer;

function notice(message = '', success = false) {
  const node = $('#notice');
  node.textContent = message;
  node.hidden = !message;
  node.classList.toggle('success', success);
  if (message && !success) node.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function toast(message) {
  $('#toast').textContent = message;
  $('#toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 4000);
}

function errorMessage(error) {
  return error?.message || 'Something went wrong. Please try again.';
}

async function run(operation) {
  try { await operation(); } catch (error) { notice(errorMessage(error)); }
}

function invalidate() {
  state.results = [];
  state.failures = [];
  state.previewBytes = null;
  $('#download-results').hidden = true;
  $('#generation-progress').hidden = true;
  updateNavigation();
}

function updateNavigation() {
  const allowed = { 1: true, 2: !!state.pdf, 3: !!state.pdf && !!state.fields.length, 4: !!state.pdf && !!state.fields.length && !!state.rows.length };
  document.querySelectorAll('[data-step]').forEach((button) => {
    const step = Number(button.dataset.step);
    button.disabled = state.generating || !allowed[step];
    if (button.classList.contains('step')) {
      button.classList.toggle('active', step === state.step);
      button.classList.toggle('completed', step < state.step);
      if (step === state.step) button.setAttribute('aria-current', 'step');
      else button.removeAttribute('aria-current');
    }
  });
  $('#save-layout').disabled = !state.fields.length || state.generating;
}

async function goToStep(step) {
  if (state.generating) return;
  if (step > 1 && !state.pdf) throw new Error('Upload a PDF template first.');
  if (step > 2 && !state.fields.length) throw new Error('Add at least one field to your template.');
  if (step > 3 && !state.rows.length) throw new Error('Import your list or add a recipient first.');
  state.step = step;
  clearTimeout(toastTimer);
  $('#toast').hidden = true;
  notice();
  document.querySelectorAll('.step-section').forEach((section) => { section.hidden = section.id !== `step-${step}`; });
  updateNavigation();
  $(`#heading-${step}`).focus({ preventScroll: true });
  if (step === 2) { renderFieldSidebar(); await renderEditor(); }
  if (step === 3) { ensureColumns(); renderDataStep(); }
  if (step === 4) { renderExport(); await previewCertificate(); }
}

async function loadTemplate(file) {
  if (state.generating) return;
  if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') throw new Error('Choose a PDF certificate template.');
  if (file.size > MAX_TEMPLATE_BYTES) throw new Error('Choose a PDF smaller than 25 MB.');
  if (!file.size) throw new Error('The selected PDF is empty.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  let pdf;
  await loadPdfRenderer();
  try { pdf = await pdfjs.getDocument({ ...pdfOptions, data: bytes.slice() }).promise; }
  catch (error) { throw new Error(error.name === 'PasswordException' ? 'This PDF is password protected. Upload an unlocked copy.' : 'This PDF could not be opened. Choose a valid, unlocked PDF.'); }
  if (state.pdf) await state.pdf.loadingTask.destroy();
  state.file = file;
  state.bytes = bytes;
  state.pdf = pdf;
  state.hash = await fingerprint(bytes);
  state.fields = [];
  state.selected = null;
  state.page = 0;
  state.rows = [];
  state.headers = [];
  state.imported = false;
  state.dataFilename = '';
  state.previewIndex = 0;
  state.previewPage = 0;
  state.tablePage = 0;
  state.search = '';
  $('#recipient-search').value = '';
  $('#template-info').hidden = false;
  $('#template-info').innerHTML = `<div><strong>${esc(file.name)}</strong><p>${pdf.numPages} page${pdf.numPages === 1 ? '' : 's'} · ${(file.size / 1024 / 1024).toFixed(2)} MB · ready to personalize</p></div><button type="button" class="text-button" data-action="replace-template">Replace</button>`;
  $('#editor-page').innerHTML = Array.from({ length: pdf.numPages }, (_, page) => `<option value="${page}">${page + 1} of ${pdf.numPages}</option>`).join('');
  $('#editor-zoom').value = '1';
  notice();
  invalidate();
  toast('Template loaded. Your original PDF remains unchanged.');
}

async function renderEditor() {
  if (!state.pdf || state.step !== 2) return;
  const token = ++editorToken;
  if (editorTask) { editorTask.cancel(); try { await editorTask.promise; } catch { /* superseded render */ } }
  const page = await state.pdf.getPage(state.page + 1);
  if (token !== editorToken) return;
  const original = page.getViewport({ scale: 1 });
  const available = Math.max($('#editor-scroll').clientWidth - (innerWidth < 800 ? 30 : 50), 200);
  const scale = Math.min(available / original.width, 1.5) * Number($('#editor-zoom').value);
  const viewport = page.getViewport({ scale });
  const canvas = $('#editor-canvas');
  const ratio = Math.min(devicePixelRatio || 1, 2);
  canvas.width = Math.ceil(viewport.width * ratio);
  canvas.height = Math.ceil(viewport.height * ratio);
  canvas.style.width = `${viewport.width}px`;
  canvas.style.height = `${viewport.height}px`;
  $('#editor-surface').style.width = `${viewport.width}px`;
  $('#editor-surface').style.height = `${viewport.height}px`;
  $('#page-dimensions').textContent = `${Math.round(original.width)} × ${Math.round(original.height)} pt`;
  editorTask = page.render({ canvasContext: canvas.getContext('2d'), viewport, transform: [ratio, 0, 0, ratio, 0, 0] });
  try { await editorTask.promise; } catch (error) { if (error.name !== 'RenderingCancelledException') throw error; }
  if (token === editorToken) renderSelections();
}

function renderSelections() {
  $('#field-layer').innerHTML = state.fields.filter((field) => field.page === state.page).map((field) => `<div tabindex="0" role="button" aria-label="Select ${esc(field.name)} field" class="field-box ${field.id === state.selected ? 'selected' : ''}" data-field-box="${esc(field.id)}" style="left:${field.x * 100}%;top:${field.y * 100}%;width:${field.width * 100}%;height:${field.height * 100}%"><span class="field-label">${esc(field.name)}</span><span class="resize-handle" data-resize="true" aria-hidden="true"></span></div>`).join('');
}

function renderFieldSidebar() {
  $('#field-count').textContent = state.fields.length;
  $('#field-list').innerHTML = state.fields.map((field) => `<button type="button" class="field-item ${field.id === state.selected ? 'active' : ''}" data-select-field="${esc(field.id)}">${icon('select')}<strong>${esc(field.name)}</strong><span>p. ${field.page + 1}</span></button>`).join('');
  const field = state.fields.find((item) => item.id === state.selected);
  if (!field) { $('#field-inspector').innerHTML = '<p class="empty-inspector">Draw a box over the name or another blank area on your template. You can also use “Add field”.</p>'; return; }
  const options = (values, current) => values.map(([value, label]) => `<option value="${esc(value)}" ${value === current ? 'selected' : ''}>${esc(label)}</option>`).join('');
  $('#field-inspector').innerHTML = `<div class="field-form">
    <label class="form-label">Field name<input data-field-prop="name" aria-label="Field name" maxlength="80" value="${esc(field.name)}" /></label>
    <label class="form-label">Font<select data-field-prop="font" aria-label="Field font">${options([['NotoSans', 'Noto Sans · Unicode'], ['Helvetica', 'Helvetica'], ['Times-Roman', 'Times Roman'], ['Courier', 'Courier'], ['Custom', state.customFontName ? `Custom · ${state.customFontName}` : 'Custom TTF / OTF']], field.font)}</select></label>
    <div class="form-pair"><label class="form-label">Max size (pt)<input data-field-prop="fontSize" aria-label="Field font size" type="number" min="4" max="200" value="${field.fontSize}" /></label><label class="form-label">Text colour<input data-field-prop="color" aria-label="Field text colour" type="color" value="${esc(field.color)}" /></label></div>
    <label class="form-label">Alignment<select data-field-prop="align" aria-label="Field alignment">${options([['left', 'Left'], ['center', 'Centre'], ['right', 'Right']], field.align)}</select></label>
    <label class="checkbox-label"><input data-field-prop="autoFit" type="checkbox" ${field.autoFit ? 'checked' : ''} />Auto-fit long text</label>
    <label class="checkbox-label"><input data-field-prop="required" type="checkbox" ${field.required ? 'checked' : ''} />Required on every certificate</label>
    <div class="form-pair"><label class="form-label">Left (%)<input data-field-prop="x" aria-label="Field left position" type="number" min="0" max="99" step="0.1" value="${(field.x * 100).toFixed(1)}" /></label><label class="form-label">Top (%)<input data-field-prop="y" aria-label="Field top position" type="number" min="0" max="99" step="0.1" value="${(field.y * 100).toFixed(1)}" /></label></div>
    <div class="form-pair"><label class="form-label">Width (%)<input data-field-prop="width" aria-label="Field width" type="number" min="0.5" max="100" step="0.1" value="${(field.width * 100).toFixed(1)}" /></label><label class="form-label">Height (%)<input data-field-prop="height" aria-label="Field height" type="number" min="0.5" max="100" step="0.1" value="${(field.height * 100).toFixed(1)}" /></label></div>
    <label class="custom-font">Need a different language or typeface?<input type="file" id="custom-font-input" aria-label="Upload custom font" accept=".ttf,.otf" /><span>${state.customFontName ? `Loaded: ${esc(state.customFontName)}` : 'Upload a TTF/OTF font, then choose Custom.'}</span></label>
    <div class="form-actions"><button type="button" class="text-button" data-action="duplicate-field">${icon('copy')} Duplicate</button><button type="button" class="text-button danger" data-action="delete-field">${icon('trash')} Delete field</button></div>
  </div>`;
}

async function selectField(id) {
  const field = state.fields.find((item) => item.id === id);
  if (!field) return;
  state.selected = id;
  if (state.page !== field.page) { state.page = field.page; $('#editor-page').value = field.page; await renderEditor(); }
  renderSelections();
  renderFieldSidebar();
}

function addField(rect) {
  if (state.fields.length >= 100) throw new Error('This template already has 100 fields.');
  const names = ['Name', 'Event', 'Date', 'Certificate ID'];
  const name = names.find((candidate) => !state.fields.some((field) => field.name === candidate)) ?? `Field ${state.fields.length + 1}`;
  const field = makeField(state.page, rect, name);
  if (state.imported) field.column = matchColumn(name, state.headers);
  state.fields.push(field);
  state.selected = field.id;
  invalidate();
  renderSelections();
  renderFieldSidebar();
}

function pointerPosition(event) {
  const bounds = $('#field-layer').getBoundingClientRect();
  return { x: clamp((event.clientX - bounds.left) / bounds.width), y: clamp((event.clientY - bounds.top) / bounds.height) };
}

$('#field-layer').addEventListener('pointerdown', (event) => {
  if (state.generating || (event.pointerType === 'mouse' && event.button !== 0)) return;
  const box = event.target.closest('[data-field-box]');
  const point = pointerPosition(event);
  const field = box ? state.fields.find((item) => item.id === box.dataset.fieldBox) : null;
  activeGesture = { id: event.pointerId, start: point, mode: field ? (event.target.dataset.resize ? 'resize' : 'move') : 'draw', field, original: field ? { ...field } : null, moved: false };
  if (field) { state.selected = field.id; renderFieldSidebar(); box.classList.add('selected'); }
  $('#field-layer').setPointerCapture(event.pointerId);
  event.preventDefault();
});

$('#field-layer').addEventListener('pointermove', (event) => {
  if (!activeGesture || activeGesture.id !== event.pointerId) return;
  const current = pointerPosition(event);
  const { start, mode, field, original } = activeGesture;
  const dx = current.x - start.x;
  const dy = current.y - start.y;
  if (Math.abs(dx) + Math.abs(dy) > .004) activeGesture.moved = true;
  if (mode === 'draw') {
    let ghost = $('#drawing-field');
    if (!ghost) { ghost = document.createElement('div'); ghost.id = 'drawing-field'; ghost.className = 'field-box selected'; $('#field-layer').append(ghost); }
    const rect = { x: Math.min(start.x, current.x), y: Math.min(start.y, current.y), width: Math.abs(dx), height: Math.abs(dy) };
    Object.entries(rect).forEach(([key, value]) => { ghost.style[{ x: 'left', y: 'top' }[key] ?? key] = `${value * 100}%`; });
  } else {
    const rect = mode === 'move' ? { ...original, x: clamp(original.x + dx, 0, 1 - original.width), y: clamp(original.y + dy, 0, 1 - original.height) } : { ...original, width: clamp(original.width + dx, .015, 1 - original.x), height: clamp(original.height + dy, .015, 1 - original.y) };
    Object.assign(field, constrainRect(rect));
    const element = document.querySelector(`[data-field-box="${field.id}"]`);
    if (element) Object.entries({ left: field.x, top: field.y, width: field.width, height: field.height }).forEach(([key, value]) => { element.style[key] = `${value * 100}%`; });
  }
});

function endGesture(event) {
  if (!activeGesture || activeGesture.id !== event.pointerId) return;
  const { start, mode, moved } = activeGesture;
  const current = pointerPosition(event);
  if (mode === 'draw' && moved && Math.abs(current.x - start.x) > .02 && Math.abs(current.y - start.y) > .012) {
    addField({ x: Math.min(start.x, current.x), y: Math.min(start.y, current.y), width: Math.abs(current.x - start.x), height: Math.abs(current.y - start.y) });
  } else { renderSelections(); renderFieldSidebar(); if (moved) invalidate(); }
  activeGesture = null;
}
$('#field-layer').addEventListener('pointerup', (event) => run(() => endGesture(event)));
$('#field-layer').addEventListener('pointercancel', () => {
  if (activeGesture?.field) Object.assign(activeGesture.field, activeGesture.original);
  activeGesture = null; renderSelections();
});
$('#field-layer').addEventListener('keydown', (event) => {
  const box = event.target.closest('[data-field-box]');
  if (box && ['Enter', ' '].includes(event.key)) { event.preventDefault(); run(() => selectField(box.dataset.fieldBox)); }
  if (box && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
    event.preventDefault();
    const field = state.fields.find((item) => item.id === box.dataset.fieldBox);
    const offset = event.shiftKey ? .01 : .001;
    if (event.key === 'ArrowLeft') field.x -= offset;
    if (event.key === 'ArrowRight') field.x += offset;
    if (event.key === 'ArrowUp') field.y -= offset;
    if (event.key === 'ArrowDown') field.y += offset;
    Object.assign(field, constrainRect(field)); invalidate(); renderSelections(); renderFieldSidebar();
    document.querySelector(`[data-field-box="${field.id}"]`)?.focus();
  }
});

function ensureColumns() {
  if (!state.imported) {
    for (const field of state.fields) if (field.source === 'column' && field.column && !state.headers.includes(field.column)) state.headers.push(field.column);
  }
}

function sourceOptions(field) {
  return [['column', 'Spreadsheet column'], ['constant', 'Same for everyone'], ['sequence', 'Sequential ID']].map(([value, label]) => `<option value="${value}" ${field.source === value ? 'selected' : ''}>${label}</option>`).join('');
}

function renderMappings() {
  $('#column-mappings').innerHTML = state.fields.map((field) => {
    let valueControl;
    if (field.source === 'constant') valueControl = `<input data-map-prop="value" aria-label="${esc(field.name)} common value" value="${esc(field.value)}" placeholder="Value on every certificate" />`;
    else if (field.source === 'sequence') valueControl = `<div class="sequence-inputs"><input data-map-prop="prefix" aria-label="${esc(field.name)} ID prefix" value="${esc(field.prefix)}" placeholder="ID prefix" /><input data-map-prop="start" aria-label="${esc(field.name)} starting number" type="number" min="0" max="999999999" value="${field.start}" /></div>`;
    else valueControl = `<select data-map-prop="column" aria-label="Map ${esc(field.name)} to column"><option value="">Choose a column…</option>${state.headers.map((header) => `<option value="${esc(header)}" ${field.column === header ? 'selected' : ''}>${esc(header)}</option>`).join('')}</select>`;
    return `<div class="mapping-row" data-map-field="${esc(field.id)}"><label>${esc(field.name)}<small>Page ${field.page + 1} · ${field.required ? 'Required' : 'Optional'}</small></label><select data-map-prop="source" aria-label="${esc(field.name)} data source">${sourceOptions(field)}</select><div class="mapping-value">${valueControl}</div></div>`;
  }).join('');
}

function renderTable() {
  const query = state.search.toLowerCase().trim();
  const filtered = state.rows.map((row, index) => ({ row, index })).filter(({ row }) => !query || Object.values(row).some((value) => String(value).toLowerCase().includes(query)));
  const pageCount = Math.max(1, Math.ceil(filtered.length / 25));
  state.tablePage = Math.min(state.tablePage, pageCount - 1);
  const offset = state.tablePage * 25;
  const visible = filtered.slice(offset, offset + 25);
  $('#recipient-table thead').innerHTML = `<tr><th scope="col">#</th>${state.headers.map((header) => `<th scope="col">${esc(header)}</th>`).join('')}<th scope="col"><span class="small-text">Remove</span></th></tr>`;
  $('#recipient-table tbody').innerHTML = visible.length ? visible.map(({ row, index }) => `<tr><td class="row-number">${index + 1}</td>${state.headers.map((header, column) => `<td><input data-row="${index}" data-column="${column}" aria-label="Row ${index + 1} ${esc(header)}" value="${esc(Object.hasOwn(row, header) ? row[header] : '')}" /></td>`).join('')}<td><button type="button" class="icon-button" data-delete-row="${index}" aria-label="Remove recipient ${index + 1}">${icon('trash')}</button></td></tr>`).join('') : `<tr><td class="empty-table" colspan="${state.headers.length + 2}">${state.rows.length ? 'No recipients match your search.' : 'Import a spreadsheet or add your first recipient.'}</td></tr>`;
  $('#recipient-count').textContent = state.rows.length.toLocaleString();
  $('#table-range').textContent = filtered.length ? `${offset + 1}–${Math.min(offset + 25, filtered.length)} of ${filtered.length} ${query ? 'matching ' : ''}recipients` : 'No recipients';
  $('#table-prev').disabled = state.tablePage === 0;
  $('#table-next').disabled = state.tablePage >= pageCount - 1;
}

function renderValidation() {
  const issues = validateRecipients(state.fields, state.rows);
  $('#data-validation').textContent = state.rows.length ? (issues.length ? `${issues.length} missing value${issues.length === 1 ? '' : 's'} to check. You can review them in Preview & export.` : 'All required fields are mapped and filled. Ready for a final preview.') : '';
  updateNavigation();
  return issues;
}

function renderDataStep() {
  $('#data-file-label').textContent = state.dataFilename || 'CSV, TSV, or Excel .xlsx · up to 5,000 recipients';
  renderMappings(); renderTable(); renderValidation();
}

async function loadRecipients(file) {
  if (state.generating) return;
  const data = await importRecipients(file);
  state.headers = data.headers;
  state.rows = data.rows;
  state.imported = true;
  state.dataFilename = `${file.name} · ${data.rows.length.toLocaleString()} recipients`;
  state.tablePage = 0;
  state.previewIndex = 0;
  state.search = '';
  $('#recipient-search').value = '';
  for (const field of state.fields) if (field.source === 'column') field.column = matchColumn(field.column || field.name, data.headers);
  invalidate(); renderDataStep(); notice();
  toast(`${data.rows.length.toLocaleString()} recipients imported. Check your column mappings.`);
}

async function getFontBytes() {
  fontPromise ??= fetch(`${base}fonts/NotoSans-Regular.ttf`).then((response) => {
    if (!response.ok) throw new Error('The bundled font is unavailable. Reload and try again.');
    return response.arrayBuffer();
  }).then((bytes) => new Uint8Array(bytes)).catch((error) => { fontPromise = null; throw error; });
  return fontPromise;
}

async function makeCertificate(rowIndex) {
  const { generateCertificate } = await import('./lib/pdf.js');
  const fontBytes = state.fields.some((field) => field.font === 'NotoSans') ? await getFontBytes() : undefined;
  return generateCertificate(state.bytes, state.fields, state.rows[rowIndex], { rowIndex, fontBytes, customFontBytes: state.customFont });
}

function renderExport() {
  const issues = validateRecipients(state.fields, state.rows);
  const pages = state.pdf.numPages;
  $('#batch-summary').innerHTML = [
    ['Template', state.file.name], ['Recipients', state.rows.length.toLocaleString()],
    ['Personalization', `${state.fields.length} fields · ${pages} page${pages === 1 ? '' : 's'} per certificate`],
  ].map(([label, value]) => `<div><dt>${label}</dt><dd>${esc(value)}</dd></div>`).join('');
  $('#export-validation').innerHTML = issues.length ? `<div class="validation-box"><strong>${issues.length} item${issues.length === 1 ? '' : 's'} need your attention</strong><ul>${issues.slice(0, 6).map((issue) => `<li>${esc(issue.message)}</li>`).join('')}</ul>${issues.length > 6 ? `<p>And ${issues.length - 6} more. Check the recipient list.</p>` : ''}</div>` : `<div class="ready-box">${icon('check')}All required data is ready</div>`;
  $('#generate-button').disabled = !!issues.length || state.generating;
  $('#generate-button').innerHTML = `${icon('spark')}Generate ${state.rows.length.toLocaleString()} certificate${state.rows.length === 1 ? '' : 's'}`;
  state.previewIndex = Math.min(state.previewIndex, state.rows.length - 1);
  $('#preview-recipient').innerHTML = state.rows.map((row, index) => `<option value="${index}" ${index === state.previewIndex ? 'selected' : ''}>${index + 1}. ${esc(recipientName(state.fields, row, index))}</option>`).join('');
  $('#preview-page').innerHTML = Array.from({ length: pages }, (_, index) => `<option value="${index}" ${index === state.previewPage ? 'selected' : ''}>${index + 1} of ${pages}</option>`).join('');
}

async function previewCertificate() {
  const token = ++previewToken;
  $('#preview-message').textContent = 'Preparing your certificate preview…';
  $('#preview-message').hidden = false;
  $('#preview-canvas').hidden = true;
  state.previewBytes = null;
  try {
    if (previewTask) { previewTask.cancel(); try { await previewTask.promise; } catch { /* superseded */ } }
    const bytes = await makeCertificate(state.previewIndex);
    if (token !== previewToken) return;
    if (state.previewPdf) await state.previewPdf.loadingTask.destroy();
    if (token !== previewToken) return;
    const pdf = await pdfjs.getDocument({ ...pdfOptions, data: bytes.slice() }).promise;
    if (token !== previewToken) { await pdf.loadingTask.destroy(); return; }
    state.previewPdf = pdf;
    const page = await pdf.getPage(state.previewPage + 1);
    if (token !== previewToken) return;
    const original = page.getViewport({ scale: 1 });
    const available = Math.max($('#preview-scroll').clientWidth - (innerWidth < 800 ? 30 : 50), 200);
    const viewport = page.getViewport({ scale: Math.min(available / original.width, 1.6) });
    const canvas = $('#preview-canvas');
    const ratio = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.ceil(viewport.width * ratio);
    canvas.height = Math.ceil(viewport.height * ratio);
    canvas.style.width = `${viewport.width}px`;
    canvas.style.height = `${viewport.height}px`;
    previewTask = page.render({ canvasContext: canvas.getContext('2d'), viewport, transform: [ratio, 0, 0, ratio, 0, 0] });
    await previewTask.promise;
    if (token === previewToken) { state.previewBytes = bytes; canvas.hidden = false; $('#preview-message').hidden = true; }
  } catch (error) {
    if (token === previewToken && error.name !== 'RenderingCancelledException') {
      $('#preview-message').textContent = errorMessage(error);
      $('#preview-message').hidden = false;
    }
  }
}

function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = filename;
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

function savePdf(bytes, name) { saveBlob(new Blob([bytes], { type: 'application/pdf' }), name); }

function setGenerating(value) {
  state.generating = value;
  document.querySelectorAll('button, input, select').forEach((control) => {
    if (control.dataset.action === 'cancel') return;
    if (value) { control.dataset.wasDisabled = String(control.disabled); control.disabled = true; }
    else if (control.dataset.wasDisabled !== undefined) { control.disabled = control.dataset.wasDisabled === 'true'; delete control.dataset.wasDisabled; }
  });
  updateNavigation();
}

async function generateBatch() {
  if (state.generating) return;
  const issues = validateRecipients(state.fields, state.rows);
  if (issues.length) throw new Error(issues[0].message);
  state.results = []; state.failures = [];
  state.controller = new AbortController();
  setGenerating(true);
  notice();
  $('#download-results').hidden = true;
  $('#generation-progress').hidden = false;
  $('#progress').value = 0;
  document.querySelector('[data-action="cancel"]').hidden = false;
  $('#progress-label').textContent = 'Preparing certificates…';
  const started = performance.now();
  try {
    for (let index = 0; index < state.rows.length; index++) {
      if (state.controller.signal.aborted) break;
      const name = recipientName(state.fields, state.rows[index], index);
      try {
        const bytes = await makeCertificate(index);
        state.results.push({ index, name, filename: certificateFilename(name, index), bytes });
      } catch (error) { state.failures.push({ index, name, error: errorMessage(error) }); }
      $('#progress').value = (index + 1) / state.rows.length * 100;
      $('#progress-label').textContent = `${index + 1} / ${state.rows.length} processed`;
      $('#progress-detail').textContent = `${state.results.length} ready · ${state.failures.length} failed · ${Math.round((performance.now() - started) / 1000)}s elapsed`;
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  } finally {
    const stopped = state.controller.signal.aborted;
    setGenerating(false);
    document.querySelector('[data-action="cancel"]').hidden = true;
    $('#progress-label').textContent = stopped ? 'Generation stopped' : 'Generation finished';
    renderResults(stopped);
    toast(`${state.results.length} certificates ready${state.failures.length ? `; ${state.failures.length} need attention` : ''}.`);
  }
}

function renderResults(stopped) {
  const skipped = state.rows.length - state.results.length - state.failures.length;
  const resultNode = $('#download-results');
  resultNode.hidden = false;
  resultNode.innerHTML = `<h3 class="results-title">${state.results.length} certificate${state.results.length === 1 ? '' : 's'} ready</h3><p class="small-text muted">${state.failures.length} failed${stopped ? ` · ${skipped} not processed` : ''}. Original template pages are preserved.</p>
  ${state.results.length ? `<div class="download-buttons"><button type="button" class="button primary full-width" data-action="download-zip">${icon('download')}Download ZIP (${state.results.length})</button><button type="button" class="button secondary full-width" data-action="download-merged">One combined PDF</button></div>${state.results.slice(0, 5).map((item, index) => `<div class="result-file"><span>${esc(item.filename)}</span><button type="button" class="text-button" data-download-result="${index}">PDF</button></div>`).join('')}${state.results.length > 5 ? '<p class="muted small-text">All files are included in the ZIP.</p>' : ''}` : ''}
  ${state.failures.length ? `<details class="danger" open><summary>${state.failures.length} certificate${state.failures.length === 1 ? '' : 's'} could not be generated</summary><ul>${state.failures.slice(0, 100).map((item) => `<li>Row ${item.index + 1} · ${esc(item.name)}: ${esc(item.error)}</li>`).join('')}</ul><button type="button" class="text-button" data-action="download-report">Download full error report</button></details>` : ''}`;
}

async function downloadZip() {
  if (!state.results.length) throw new Error('Generate at least one certificate first.');
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  state.results.forEach((item) => zip.file(item.filename, item.bytes));
  const results = new Map(state.results.map((item) => [item.index, item]));
  const failures = new Map(state.failures.map((item) => [item.index, item]));
  zip.file('generation-report.csv', toCsv(state.rows.map((row, index) => ({
    row: index + 1,
    recipient: recipientName(state.fields, row, index),
    status: results.has(index) ? 'Generated' : failures.has(index) ? 'Failed' : 'Not processed',
    file: results.get(index)?.filename ?? '',
    error: failures.get(index)?.error ?? '',
  }))));
  const button = document.querySelector('[data-action="download-zip"]');
  button.disabled = true; button.textContent = 'Packaging ZIP…';
  try {
    const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 3 } });
    saveBlob(blob, `certgen-${state.results.length}-certificates.zip`);
  } finally { button.disabled = false; button.innerHTML = `${icon('download')}Download ZIP (${state.results.length})`; }
}

async function openDemo() {
  const { createDemoTemplate } = await import('./lib/pdf.js');
  const bytes = await createDemoTemplate();
  await loadTemplate(new File([bytes], 'sample-certificate.pdf', { type: 'application/pdf' }));
  const name = makeField(0, { x: .17, y: .48, width: .66, height: .075 }, 'Name');
  const event = { ...makeField(0, { x: .2, y: .65, width: .6, height: .055 }, 'Event'), source: 'constant', value: 'TECHFUSION 2K26', fontSize: 22, color: '#2563eb' };
  const id = { ...makeField(0, { x: .36, y: .86, width: .28, height: .04 }, 'Certificate ID'), source: 'sequence', prefix: 'TF26-', fontSize: 10 };
  state.fields = [name, event, id]; state.selected = name.id;
  state.headers = ['Name'];
  state.rows = [{ Name: 'Aditi Raman' }, { Name: 'Rahul Subramanian' }, { Name: 'Priya K.' }];
  state.dataFilename = 'Sample data · 3 recipients';
  await goToStep(2);
}

async function loadLayout(file) {
  if (!state.pdf) throw new Error('Upload the PDF template before loading its saved layout.');
  if (file.size > 1024 * 1024) throw new Error('Choose a CertGen layout smaller than 1 MB.');
  let layout;
  try { layout = JSON.parse(await file.text()); } catch { throw new Error('The layout file is not valid JSON.'); }
  state.fields = validateLayout(layout, { fingerprint: state.hash, pageCount: state.pdf.numPages });
  state.selected = state.fields[0].id;
  state.page = state.fields[0].page;
  $('#editor-page').value = state.page;
  invalidate();
  await goToStep(2);
  toast('Layout restored. Custom fonts must be re-uploaded if used.');
}

function bindDropZone(target, input, handler) {
  const zone = $(target);
  zone.addEventListener('click', () => { if (!state.generating) $(input).click(); });
  zone.addEventListener('keydown', (event) => { if (['Enter', ' '].includes(event.key)) { event.preventDefault(); if (!state.generating) $(input).click(); } });
  for (const type of ['dragenter', 'dragover', 'dragleave', 'drop']) zone.addEventListener(type, (event) => {
    event.preventDefault(); event.stopPropagation();
    zone.classList.toggle('dragover', ['dragenter', 'dragover'].includes(type));
    if (type === 'drop' && !state.generating && event.dataTransfer.files[0]) run(() => handler(event.dataTransfer.files[0]));
  });
  $(input).addEventListener('change', (event) => {
    const file = event.target.files[0];
    event.target.value = '';
    if (file) run(() => handler(file));
  });
}
bindDropZone('#template-drop', '#template-input', loadTemplate);
bindDropZone('#data-drop', '#data-input', loadRecipients);

document.addEventListener('click', (event) => run(async () => {
  const target = event.target.closest('button, [data-select-field]');
  if (!target || target.disabled) return;
  if (target.dataset.step) return goToStep(Number(target.dataset.step));
  if (target.dataset.selectField) return selectField(target.dataset.selectField);
  if (target.dataset.deleteRow !== undefined) { state.rows.splice(Number(target.dataset.deleteRow), 1); invalidate(); renderTable(); renderValidation(); return; }
  if (target.dataset.downloadResult !== undefined) { const result = state.results[Number(target.dataset.downloadResult)]; return savePdf(result.bytes, result.filename); }
  switch (target.dataset.action) {
    case 'replace-template': $('#template-input').click(); break;
    case 'demo': await openDemo(); break;
    case 'add-field': addField(); break;
    case 'delete-field': state.fields = state.fields.filter((field) => field.id !== state.selected); state.selected = state.fields[0]?.id ?? null; invalidate(); renderSelections(); renderFieldSidebar(); break;
    case 'duplicate-field': {
      if (state.fields.length >= 100) throw new Error('This template already has 100 fields.');
      const original = state.fields.find((field) => field.id === state.selected);
      const duplicate = { ...original, id: crypto.randomUUID(), name: `${original.name} copy`, y: clamp(original.y + .05, 0, 1 - original.height) };
      state.fields.push(duplicate); state.selected = duplicate.id; invalidate(); renderSelections(); renderFieldSidebar(); break;
    }
    case 'import-data': $('#data-input').click(); break;
    case 'add-row': if (state.rows.length >= MAX_ROWS) throw new Error(`A batch supports up to ${MAX_ROWS} recipients.`); ensureColumns(); state.rows.push(Object.fromEntries(state.headers.map((header) => [header, '']))); state.search = ''; $('#recipient-search').value = ''; state.tablePage = Math.floor((state.rows.length - 1) / 25); invalidate(); renderTable(); renderValidation(); break;
    case 'previous-table-page': state.tablePage--; renderTable(); break;
    case 'next-table-page': state.tablePage++; renderTable(); break;
    case 'sample-csv': {
      const headers = [...new Set(state.fields.filter((field) => field.source === 'column').map((field) => field.column || field.name))];
      if (!headers.length) headers.push('Recipient');
      saveBlob(new Blob([toCsv([Object.fromEntries(headers.map((header, index) => [header, index === 0 ? 'Sample Recipient' : 'Sample value']))])], { type: 'text/csv;charset=utf-8' }), 'certgen-recipients-sample.csv'); break;
    }
    case 'save-layout': saveBlob(new Blob([JSON.stringify({ version: LAYOUT_VERSION, templateName: state.file.name, templateHash: state.hash, fields: state.fields }, null, 2)], { type: 'application/json' }), 'certgen-layout.json'); toast('Layout saved. Recipient data is not included.'); break;
    case 'load-layout': if (!state.pdf) throw new Error('Upload your PDF template first, then load its saved layout.'); $('#layout-input').click(); break;
    case 'generate': await generateBatch(); break;
    case 'cancel': state.controller?.abort(); toast('Stopping after the current certificate. Completed PDFs will remain available.'); break;
    case 'download-zip': await downloadZip(); break;
    case 'download-merged': {
      if (!state.results.length) throw new Error('Generate certificates first.');
      const { mergeCertificates } = await import('./lib/pdf.js');
      target.disabled = true; target.textContent = 'Combining PDFs…';
      try { savePdf(await mergeCertificates(state.results), 'certgen-combined-certificates.pdf'); }
      finally { target.disabled = false; target.textContent = 'One combined PDF'; } break;
    }
    case 'download-preview': if (!state.previewBytes) throw new Error('Wait for a successful preview before downloading.'); savePdf(state.previewBytes, certificateFilename(recipientName(state.fields, state.rows[state.previewIndex], state.previewIndex), state.previewIndex)); break;
    case 'download-report': saveBlob(new Blob([toCsv(state.failures.map((item) => ({ row: item.index + 1, recipient: item.name, error: item.error })))], { type: 'text/csv;charset=utf-8' }), 'certgen-errors.csv'); break;
  }
}));

document.addEventListener('change', (event) => run(async () => {
  const target = event.target;
  if (target.dataset.fieldProp) {
    const field = state.fields.find((item) => item.id === state.selected);
    const key = target.dataset.fieldProp;
    if (['x', 'y', 'width', 'height'].includes(key)) {
      if (!Number.isFinite(Number(target.value))) throw new Error('Enter a valid field position.');
      field[key] = Number(target.value) / 100; Object.assign(field, constrainRect(field));
    } else if (key === 'fontSize') field.fontSize = clamp(Number(target.value) || 30, 4, 200);
    else if (target.type === 'checkbox') field[key] = target.checked;
    else if (key === 'name') { field.name = target.value.trim() || 'Untitled field'; if (!state.imported && !state.headers.length) field.column = field.name; }
    else field[key] = target.value;
    invalidate(); renderSelections(); renderFieldSidebar();
  }
  if (target.dataset.mapProp) {
    const field = state.fields.find((item) => item.id === target.closest('[data-map-field]').dataset.mapField);
    const key = target.dataset.mapProp;
    field[key] = key === 'start' ? Math.floor(clamp(Number(target.value) || 0, 0, 999999999)) : target.value;
    invalidate();
    if (key === 'source') { ensureColumns(); renderMappings(); renderTable(); }
    renderValidation();
  }
  if (target.dataset.row !== undefined) {
    const row = state.rows[Number(target.dataset.row)];
    row[state.headers[Number(target.dataset.column)]] = target.value;
    invalidate(); renderValidation();
  }
  if (target.id === 'editor-page') { state.page = Number(target.value); await renderEditor(); }
  if (target.id === 'editor-zoom') await renderEditor();
  if (target.id === 'preview-recipient') { state.previewIndex = Number(target.value); await previewCertificate(); }
  if (target.id === 'preview-page') { state.previewPage = Number(target.value); await previewCertificate(); }
  if (target.id === 'layout-input' && target.files[0]) { const file = target.files[0]; target.value = ''; await loadLayout(file); }
  if (target.id === 'custom-font-input' && target.files[0]) {
    const file = target.files[0];
    if (!/\.(ttf|otf)$/i.test(file.name) || file.size > 8 * 1024 * 1024) throw new Error('Choose a TTF/OTF font smaller than 8 MB.');
    state.customFont = new Uint8Array(await file.arrayBuffer()); state.customFontName = file.name;
    const field = state.fields.find((item) => item.id === state.selected); if (field) field.font = 'Custom';
    invalidate(); renderFieldSidebar(); toast('Custom font loaded. Check the preview to confirm all characters render.');
  }
}));

$('#recipient-search').addEventListener('input', (event) => { state.search = event.target.value; state.tablePage = 0; renderTable(); });
let resizeTimer;
window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => run(async () => { if (state.step === 2) await renderEditor(); if (state.step === 4) await previewCertificate(); }), 180); });
window.addEventListener('beforeunload', (event) => { if (state.generating) { event.preventDefault(); event.returnValue = ''; } });
updateNavigation();
