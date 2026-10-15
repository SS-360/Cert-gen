export function normalizeHex(value) {
  const hex = String(value).trim().replace(/^#/, '');
  if (/^[a-f0-9]{3}$/i.test(hex)) return `#${[...hex].map((c) => c + c).join('').toLowerCase()}`;
  return /^[a-f0-9]{6}$/i.test(hex) ? `#${hex.toLowerCase()}` : null;
}
export function hsvToRgb(h, s, v) {
  h = ((h % 360) + 360) % 360 / 60;
  s = Math.min(1, Math.max(0, s)); v = Math.min(1, Math.max(0, v));
  const c = v * s, x = c * (1 - Math.abs(h % 2 - 1)), m = v - c;
  return [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][Math.floor(h)].map((n) => Math.round((n + m) * 255));
}
export function rgbToHsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min;
  let h = delta === 0 ? 0 : max === r ? ((g - b) / delta) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
  return { h: (h * 60 + 360) % 360, s: max === 0 ? 0 : delta / max, v: max };
}
export function hexToHsv(hex) { return rgbToHsv(...[1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16))); }
export function hsvToHex(h, s, v) { return `#${hsvToRgb(h, s, v).map((n) => n.toString(16).padStart(2, '0')).join('')}`; }
