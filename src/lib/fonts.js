const styles = {
  regular: { label: 'Regular', weight: 400, style: 'normal', suffix: 'Regular' },
  bold: { label: 'Bold', weight: 700, style: 'normal', suffix: 'Bold' },
  italic: { label: 'Italic', weight: 400, style: 'italic', suffix: 'Italic' },
  boldItalic: { label: 'Bold italic', weight: 700, style: 'italic', suffix: 'BoldItalic' },
};
function family(id, name, category, variants = ['regular'], directory = id.toLowerCase(), source = 'google') {
  return { id, name, category, directory, source, faces: variants.map((variant) => ({ id: variant, ...styles[variant], file: `${id}-${styles[variant].suffix}.ttf` })) };
}
const four = ['regular', 'bold', 'italic', 'boldItalic'];
export const FONT_CATALOG = [
  family('NotoSans', 'Noto Sans', 'Sans serif', four, 'NotoSans', 'noto'),
  family('Poppins', 'Poppins', 'Sans serif', four),
  family('Lato', 'Lato', 'Sans serif', four),
  family('Barlow', 'Barlow', 'Sans serif', four),
  family('NotoSerif', 'Noto Serif', 'Serif', four, 'NotoSerif', 'noto'),
  family('CrimsonText', 'Crimson Text', 'Serif', four),
  family('OldStandardTT', 'Old Standard TT', 'Serif', ['regular', 'bold', 'italic']),
  family('CinzelDecorative', 'Cinzel Decorative', 'Display', ['regular', 'bold']),
  family('GreatVibes', 'Great Vibes', 'Cursive'),
  family('AlexBrush', 'Alex Brush', 'Cursive'),
  family('Allura', 'Allura', 'Cursive'),
  family('Sacramento', 'Sacramento', 'Cursive'),
  family('Parisienne', 'Parisienne', 'Cursive'),
  family('KaushanScript', 'Kaushan Script', 'Cursive'),
  family('Satisfy', 'Satisfy', 'Cursive'),
  family('PermanentMarker', 'Permanent Marker', 'Handwriting'),
  family('CaveatBrush', 'Caveat Brush', 'Handwriting'),
  family('Kalam', 'Kalam', 'Handwriting', ['regular', 'bold']),
  family('PatrickHand', 'Patrick Hand', 'Handwriting'),
  family('BebasNeue', 'Bebas Neue', 'Display'),
  family('BlackOpsOne', 'Black Ops One', 'Display'),
  family('PirataOne', 'Pirata One', 'Display'),
  family('UnifrakturMaguntia', 'Unifraktur Maguntia', 'Display'),
  family('CourierPrime', 'Courier Prime', 'Monospace', four),
  family('SpecialElite', 'Special Elite', 'Monospace'),
  family('NotoSansTamil', 'Noto Sans Tamil', 'Tamil', ['regular', 'bold'], 'NotoSansTamil', 'noto'),
  ...[['Helvetica', 'Helvetica', 'Sans serif', 'Arial'], ['Times-Roman', 'Times Roman', 'Serif', 'Times New Roman'], ['Courier', 'Courier', 'Monospace', 'Courier New']].map(([id, name, category, fallback]) => ({ id, name, category, standard: true, fallback, faces: four.map((id) => ({ id, ...styles[id] })) })),
];
export const FONT_CATEGORIES = ['All', 'Sans serif', 'Serif', 'Cursive', 'Handwriting', 'Display', 'Monospace', 'Tamil'];
export const CUSTOM_FONT = { id: 'Custom', name: 'Uploaded font', category: 'Custom', faces: [{ id: 'regular', ...styles.regular }] };
export const getFontDefinition = (id) => id === 'Custom' ? CUSTOM_FONT : FONT_CATALOG.find((font) => font.id === id);
export const getFontFace = (id, style = 'regular') => getFontDefinition(id)?.faces.find((face) => face.id === style) ?? getFontDefinition(id)?.faces[0];
export const fontKey = (id, style = 'regular') => `${id}:${getFontFace(id, style)?.id ?? 'regular'}`;
export const fontFamily = (id) => getFontDefinition(id)?.fallback ?? `CertGen ${id}`;
