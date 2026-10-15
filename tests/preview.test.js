import test from 'node:test';
import assert from 'node:assert/strict';
import { previewGeometry } from '../src/lib/pdf-preview.js';

test('Preview fit and zoom use identical physical-point scale and DPR rules', () => {
  const fit = previewGeometry(595.5, 842.25, 812, 1, 2);
  const zoomed = previewGeometry(595.5, 842.25, 812, 1.5, 2);
  assert.ok(Math.abs(zoomed.width - fit.width * 1.5) < 1e-9);
  assert.ok(Math.abs(zoomed.height - fit.height * 1.5) < 1e-9);
  assert.equal(zoomed.pixelWidth, Math.ceil(zoomed.width * 2));
  assert.equal(zoomed.pixelHeight, Math.ceil(zoomed.height * 2));
  assert.equal(previewGeometry(600, 800, 4000, 1, 4).scale, 1.5);
  assert.equal(previewGeometry(600, 800, 4000, 1, 4).ratio, 2);
});
