import assert from 'node:assert/strict';
import test from 'node:test';
import { constrainPopup, resizePopup } from '../src/components/popup-position';

test('dragging a note to a window edge keeps the header and close button inside the viewport', () => {
  const size = { width: 390, height: 440 }, viewport = { width: 1200, height: 900 };
  assert.deepEqual(constrainPopup({ left: -200, top: -100 }, size, viewport), { left: 12, top: 12 });
  assert.deepEqual(constrainPopup({ left: 1500, top: 1100 }, size, viewport), { left: 798, top: 448 });
  assert.deepEqual(constrainPopup({ left: 400, top: 100 }, size, viewport), { left: 400, top: 100 });
});

test('resizing each physical corner preserves the opposite edge and a usable minimum', () => {
  const rect = { left: 100, top: 100, width: 390, height: 440 }, viewport = { width: 1200, height: 900 };
  assert.deepEqual(resizePopup(rect, 'se', { left: 100, top: 80 }, viewport), { left: 100, top: 100, width: 490, height: 520 });
  assert.deepEqual(resizePopup(rect, 'nw', { left: -50, top: -50 }, viewport), { left: 50, top: 50, width: 440, height: 490 });
  const minimum = resizePopup(rect, 'nw', { left: 900, top: 900 }, viewport);
  assert.equal(minimum.width, 260); assert.equal(minimum.height, 180); assert.equal(minimum.left + minimum.width, 490); assert.equal(minimum.top + minimum.height, 540);
  const small = resizePopup(rect, 'se', { left: 900, top: 900 }, { width: 320, height: 300 });
  assert.ok(small.left >= 12 && small.top >= 12 && small.left + small.width <= 308 && small.top + small.height <= 288);
});

test('a growing answer or smaller viewport repositions the note without putting its header offscreen', () => {
  assert.deepEqual(constrainPopup({ left: 700, top: 400 }, { width: 390, height: 560 }, { width: 1000, height: 700 }), { left: 598, top: 128 });
  assert.deepEqual(constrainPopup({ left: 700, top: 400 }, { width: 390, height: 560 }, { width: 320, height: 400 }), { left: 12, top: 12 });
});
