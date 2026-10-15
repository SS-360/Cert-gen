// Both workspaces use the same fit/zoom/DPR rules. PDF points never change with zoom.
export function previewGeometry(width, height, availableWidth, zoom = 1, pixelRatio = 1) {
  const scale = Math.min(Math.max(availableWidth, 200) / width, 1.5) * zoom;
  const ratio = Math.min(Math.max(pixelRatio, 1), 2);
  return { scale, ratio, width: width * scale, height: height * scale, pixelWidth: Math.ceil(width * scale * ratio), pixelHeight: Math.ceil(height * scale * ratio) };
}

export function startPageRender(page, availableWidth, zoom = 1) {
  const original = page.getViewport({ scale: 1 });
  const geometry = previewGeometry(original.width, original.height, availableWidth, zoom, window.devicePixelRatio || 1);
  const viewport = page.getViewport({ scale: geometry.scale });
  const buffer = document.createElement('canvas');
  buffer.width = geometry.pixelWidth; buffer.height = geometry.pixelHeight;
  const task = page.render({ canvasContext: buffer.getContext('2d'), viewport, transform: [geometry.ratio, 0, 0, geometry.ratio, 0, 0] });
  return { task, buffer, geometry, original };
}

export function commitPageRender(render, canvas) {
  const { geometry, buffer } = render;
  canvas.width = geometry.pixelWidth; canvas.height = geometry.pixelHeight;
  canvas.style.width = `${geometry.width}px`; canvas.style.height = `${geometry.height}px`;
  canvas.getContext('2d').drawImage(buffer, 0, 0);
}
