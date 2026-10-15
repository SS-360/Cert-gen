import { mkdir, writeFile, access } from 'node:fs/promises';
import { FONT_CATALOG } from '../src/lib/fonts.js';

// Run once when changing the catalogue. Fonts are committed, not fetched by users.
await mkdir('public/fonts/licenses', { recursive: true });
const google = 'https://raw.githubusercontent.com/google/fonts/main';
const noto = 'https://raw.githubusercontent.com/notofonts/noto-fonts/main';
async function download(urls, path, binary = false) {
  try { await access(path); return; } catch { /* new asset */ }
  for (const url of urls) {
    const response = await fetch(url);
    if (!response.ok) continue;
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (binary && !(bytes[0] === 0 && bytes[1] === 1 || new TextDecoder().decode(bytes.slice(0, 4)) === 'OTTO')) continue;
    await writeFile(path, bytes);
    return;
  }
  throw new Error(`Could not download ${path}`);
}
for (const font of FONT_CATALOG.filter((font) => !font.standard)) {
  const roots = font.source === 'noto' ? [`${noto}/hinted/ttf/${font.directory}`] : [`${google}/ofl/${font.directory}`, `${google}/apache/${font.directory}`];
  for (const face of font.faces) await download(roots.map((root) => `${root}/${face.file.replace('OldStandardTT-', 'OldStandard-').replace('UnifrakturMaguntia-Regular', 'UnifrakturMaguntia-Book')}`), `public/fonts/${face.file}`, true);
  await download(font.source === 'noto' ? [`${noto}/LICENSE`] : roots.flatMap((root) => [`${root}/OFL.txt`, `${root}/LICENSE.txt`]), `public/fonts/licenses/${font.id}.txt`);
  console.log(`${font.name}: ${font.faces.length} styles ready`);
}
