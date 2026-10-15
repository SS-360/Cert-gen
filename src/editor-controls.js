import { FONT_CATALOG, FONT_CATEGORIES, CUSTOM_FONT, fontFamily } from './lib/fonts.js';
import { loadFont } from './lib/font-loader.js';
import { escapeHtml as esc } from './lib/data.js';
import { normalizeHex, hexToHsv, hsvToHex, hsvToRgb } from './lib/color.js';

const closeIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>';
export function createEditorControls({ selectedField, sampleText, customFontName, onFont, onColor, onError }) {
  const fontDialog = document.createElement('dialog');
  fontDialog.className = 'font-dialog';
  fontDialog.setAttribute('aria-labelledby', 'font-dialog-title');
  fontDialog.innerHTML = `<div class="dialog-heading"><div><h2 id="font-dialog-title">Choose a font</h2><p>Choose by appearance, not just by name.</p></div><button type="button" class="icon-button" data-close aria-label="Close font browser">${closeIcon}</button></div>
    <label class="search-fonts"><span>Search fonts</span><input type="search" id="font-search" placeholder="Search fonts…" /></label>
    <div class="font-categories" aria-label="Font categories">${FONT_CATEGORIES.map((category) => `<button type="button" data-category="${category}" aria-pressed="${category === 'All'}">${category}</button>`).join('')}</div>
    <div id="font-results" class="font-results" aria-label="Available fonts"></div>
    <div class="dialog-footer">26 bundled typefaces + 3 PDF fonts <span>Fonts stay on your device</span></div>`;
  document.body.append(fontDialog);
  let category = 'All';
  const observer = new IntersectionObserver((entries) => entries.forEach((entry) => {
    if (!entry.isIntersecting) return;
    const id = entry.target.dataset.fontOption;
    observer.unobserve(entry.target);
    loadFont(id).then(() => entry.target.classList.add('font-loaded')).catch(() => {
      entry.target.querySelector('.font-example').textContent = 'Font unavailable — retry selection';
    });
  }), { root: fontDialog.querySelector('#font-results'), rootMargin: '80px' });
  function renderFonts() {
    observer.disconnect();
    const field = selectedField();
    const query = fontDialog.querySelector('#font-search').value.toLowerCase().trim();
    const available = customFontName() ? [...FONT_CATALOG, { ...CUSTOM_FONT, name: customFontName() }] : FONT_CATALOG;
    const fonts = available.filter((font) => (category === 'All' || font.category === category) && `${font.name} ${font.category}`.toLowerCase().includes(query));
    fontDialog.querySelector('#font-results').innerHTML = fonts.length ? fonts.map((font) => `<button type="button" class="font-option ${font.id === field?.font ? 'chosen' : ''}" data-font-option="${font.id}" aria-label="Use ${esc(font.name)}" aria-pressed="${font.id === field?.font}"><span class="font-radio" aria-hidden="true"></span><span class="font-meta"><strong>${esc(font.name)}</strong><small>${font.category} · ${font.faces.length} style${font.faces.length === 1 ? '' : 's'}</small></span><span class="font-example" style="font-family:'${fontFamily(font.id)}',sans-serif">${esc(font.category === 'Tamil' ? 'தமிழ் எழுத்து' : sampleText(field) || 'Sample Participant')}</span></button>`).join('') : '<p class="empty-fonts">No fonts match. Try another name or category.</p>';
    fontDialog.querySelectorAll('[data-font-option]').forEach((node) => observer.observe(node));
    fontDialog.querySelectorAll('[data-category]').forEach((node) => node.setAttribute('aria-pressed', String(node.dataset.category === category)));
  }
  fontDialog.querySelector('#font-search').addEventListener('input', renderFonts);
  fontDialog.addEventListener('click', async (event) => {
    if (event.target.closest('[data-close]')) fontDialog.close();
    const filter = event.target.closest('[data-category]');
    if (filter) { category = filter.dataset.category; renderFonts(); }
    const choice = event.target.closest('[data-font-option]');
    if (choice) {
      choice.disabled = true;
      try { await loadFont(choice.dataset.fontOption); await onFont(choice.dataset.fontOption); fontDialog.close(); }
      catch (error) { choice.disabled = false; onError(error); }
    }
  });

  const colorDialog = document.createElement('dialog');
  colorDialog.className = 'color-dialog';
  colorDialog.setAttribute('aria-labelledby', 'color-dialog-title');
  colorDialog.innerHTML = `<div class="dialog-heading"><div><h2 id="color-dialog-title">Text colour</h2><p>Choose a colour for this field.</p></div><button type="button" class="icon-button" data-close aria-label="Close colour picker">${closeIcon}</button></div>
    <div class="wheel-wrap"><canvas id="color-wheel" width="256" height="256" tabindex="0" role="group" aria-label="Colour wheel" aria-describedby="wheel-help"></canvas><span id="wheel-marker" aria-hidden="true"></span></div>
    <p id="wheel-help" class="small-text muted">Drag to choose. Arrow keys adjust hue and saturation.</p>
    <label class="form-label brightness-label">Brightness <output id="brightness-value"></output><input type="range" id="color-brightness" min="0" max="100" step="1" /></label>
    <div class="form-pair"><label class="form-label">Hue (°)<input id="color-hue" type="number" min="0" max="360" step="1" /></label><label class="form-label">Saturation (%)<input id="color-saturation" type="number" min="0" max="100" step="1" /></label></div>
    <label class="form-label color-hex-label">Hex colour<div class="hex-entry"><span id="picker-swatch"></span><input id="picker-hex" aria-label="Picker hex colour" maxlength="7" spellcheck="false" /></div></label>
    <div class="preset-colors" aria-label="Colour presets">${['#142d4e', '#090a0f', '#245cff', '#7b4dff', '#bd3157', '#14805e', '#c2882d', '#ffffff'].map((color) => `<button type="button" data-preset="${color}" style="background:${color}" aria-label="Use colour ${color}"></button>`).join('')}</div>
    <div class="color-picker-actions"><button type="button" class="button secondary" id="screen-picker">Pick from screen</button><label class="button secondary native-picker">System colour picker<input type="color" id="native-color" aria-label="System colour picker" /></label></div>
    <p id="color-picker-status" role="status" class="small-text muted"></p><button type="button" class="button primary full-width" data-close>Done</button>`;
  document.body.append(colorDialog);
  let hsv = { h: 215, s: .7, v: .3 };
  const wheel = colorDialog.querySelector('#color-wheel');
  let wheelPainted = false;
  function updateColor(commit = true) {
    const hex = hsvToHex(hsv.h, hsv.s, hsv.v);
    if (!wheelPainted) {
    const ctx = wheel.getContext('2d');
    const pixels = ctx.createImageData(256, 256);
    for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
      const dx = (x - 127.5) / 127.5, dy = (y - 127.5) / 127.5;
      const saturation = Math.hypot(dx, dy);
      if (saturation > 1) continue;
      const rgb = hsvToRgb(Math.atan2(dy, dx) * 180 / Math.PI, saturation, 1);
      const index = (y * 256 + x) * 4;
      pixels.data.set([...rgb, Math.min(255, (1 - saturation) * 127.5 * 255)], index);
    }
    ctx.putImageData(pixels, 0, 0);
    wheelPainted = true;
    }
    const marker = colorDialog.querySelector('#wheel-marker');
    marker.style.left = `${50 + Math.cos(hsv.h * Math.PI / 180) * hsv.s * 50}%`;
    marker.style.top = `${50 + Math.sin(hsv.h * Math.PI / 180) * hsv.s * 50}%`;
    marker.style.background = hsvToHex(hsv.h, hsv.s, 1);
    colorDialog.querySelector('#color-brightness').value = Math.round(hsv.v * 100);
    colorDialog.querySelector('#color-brightness').style.setProperty('--bright', hsvToHex(hsv.h, hsv.s, 1));
    colorDialog.querySelector('#brightness-value').textContent = `${Math.round(hsv.v * 100)}%`;
    colorDialog.querySelector('#color-hue').value = Math.round(hsv.h);
    colorDialog.querySelector('#color-saturation').value = Math.round(hsv.s * 100);
    colorDialog.querySelector('#picker-hex').value = hex.toUpperCase();
    colorDialog.querySelector('#picker-hex').setCustomValidity('');
    colorDialog.querySelector('#native-color').value = hex;
    colorDialog.querySelector('#picker-swatch').style.background = hex;
    wheel.setAttribute('aria-label', `Colour wheel, hue ${Math.round(hsv.h)} degrees, saturation ${Math.round(hsv.s * 100)} percent`);
    if (commit) onColor(hex);
  }
  function applyHex(value) { const hex = normalizeHex(value); if (hex) { hsv = hexToHsv(hex); updateColor(); } return !!hex; }
  function wheelPosition(event) {
    const bounds = wheel.getBoundingClientRect();
    const dx = (event.clientX - bounds.left - bounds.width / 2) / (bounds.width / 2), dy = (event.clientY - bounds.top - bounds.height / 2) / (bounds.height / 2);
    hsv.h = (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360;
    hsv.s = Math.min(1, Math.hypot(dx, dy)); updateColor();
  }
  let dragging = false;
  wheel.addEventListener('pointerdown', (event) => { dragging = true; wheel.setPointerCapture(event.pointerId); wheelPosition(event); });
  wheel.addEventListener('pointermove', (event) => { if (dragging) wheelPosition(event); });
  wheel.addEventListener('pointerup', () => { dragging = false; });
  wheel.addEventListener('pointercancel', () => { dragging = false; });
  wheel.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    if (event.key === 'ArrowLeft') hsv.h = (hsv.h + 359) % 360;
    if (event.key === 'ArrowRight') hsv.h = (hsv.h + 1) % 360;
    if (event.key === 'ArrowUp') hsv.s = Math.min(1, hsv.s + .01);
    if (event.key === 'ArrowDown') hsv.s = Math.max(0, hsv.s - .01);
    updateColor();
  });
  for (const [id, key, multiplier] of [['color-brightness', 'v', .01], ['color-hue', 'h', 1], ['color-saturation', 's', .01]]) colorDialog.querySelector(`#${id}`).addEventListener('input', (event) => { hsv[key] = Math.max(0, Math.min(key === 'h' ? 360 : 100, Number(event.target.value))) * multiplier; updateColor(); });
  colorDialog.querySelector('#picker-hex').addEventListener('change', (event) => { if (!applyHex(event.target.value)) { event.target.setCustomValidity('Enter a 3- or 6-digit hex colour, such as #142D4E.'); event.target.reportValidity(); } });
  colorDialog.querySelector('#native-color').addEventListener('input', (event) => applyHex(event.target.value));
  colorDialog.addEventListener('click', (event) => {
    if (event.target.closest('[data-close]')) colorDialog.close();
    const preset = event.target.closest('[data-preset]'); if (preset) applyHex(preset.dataset.preset);
  });
  async function pickFromScreen() {
    if (!window.EyeDropper) { onError(new Error('This browser does not support screen colour sampling. Use the colour wheel, hex input, or system picker.')); return; }
    try { const result = await new window.EyeDropper().open(); applyHex(result.sRGBHex); }
    catch (error) { if (error.name !== 'AbortError') onError(error); }
  }
  colorDialog.querySelector('#screen-picker').addEventListener('click', pickFromScreen);
  for (const dialog of [fontDialog, colorDialog]) dialog.addEventListener('click', (event) => { if (event.target === dialog && (event.clientX < dialog.getBoundingClientRect().left || event.clientX > dialog.getBoundingClientRect().right || event.clientY < dialog.getBoundingClientRect().top || event.clientY > dialog.getBoundingClientRect().bottom)) dialog.close(); });
  return {
    openFonts() { category = 'All'; fontDialog.querySelector('#font-search').value = ''; fontDialog.showModal(); renderFonts(); },
    openColor() {
      hsv = hexToHsv(selectedField().color); updateColor(false); colorDialog.showModal();
      const supported = !!window.EyeDropper;
      colorDialog.querySelector('#screen-picker').hidden = !supported;
      colorDialog.querySelector('#color-picker-status').textContent = supported ? 'Screen sampling is available in this browser.' : 'Screen sampling is unavailable here. The wheel and system picker still work.';
    },
    pickFromScreen,
  };
}
