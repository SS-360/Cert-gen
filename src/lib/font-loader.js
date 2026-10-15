import { getFontDefinition, getFontFace, fontKey, fontFamily } from './fonts.js';

const cache = new Map();
const faces = new Map();
let customBytes;
export async function loadFont(id, style = 'regular') {
  const definition = getFontDefinition(id);
  if (!definition) throw new Error('Choose a font from the library.');
  if (definition.standard) return null;
  if (id === 'Custom') {
    if (!customBytes) throw new Error('Upload your custom TTF/OTF font first.');
    return customBytes;
  }
  const key = fontKey(id, style);
  if (!cache.has(key)) {
    const promise = (async () => {
      const face = getFontFace(id, style);
      const response = await fetch(`${import.meta.env.BASE_URL}fonts/${face.file}`);
      if (!response.ok) throw new Error(`${definition.name} could not load. Please try again.`);
      const bytes = new Uint8Array(await response.arrayBuffer());
      const browserFace = await new FontFace(fontFamily(id), bytes, { weight: String(face.weight), style: face.style }).load();
      document.fonts.add(browserFace);
      faces.set(key, browserFace);
      return bytes;
    })();
    cache.set(key, promise);
    promise.catch(() => cache.delete(key));
  }
  return cache.get(key);
}
export async function loadCustomFont(bytes) {
  const face = await new FontFace(fontFamily('Custom'), bytes).load();
  if (faces.has('Custom')) document.fonts.delete(faces.get('Custom'));
  document.fonts.add(face);
  faces.set('Custom', face);
  customBytes = bytes;
}
export async function certificateFonts(fields) {
  const entries = await Promise.all([...new Map(fields.map((field) => [fontKey(field.font, field.fontStyle), field])).entries()].map(async ([key, field]) => [key, await loadFont(field.font, field.fontStyle)]));
  return new Map(entries);
}
