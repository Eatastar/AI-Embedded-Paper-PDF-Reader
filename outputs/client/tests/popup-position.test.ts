import assert from 'node:assert/strict';
import test from 'node:test';
import { constrainPopup } from '../src/components/popup-position';

test('dragging a note to a window edge keeps the header and close button inside the viewport', () => {
  const size = { width: 390, height: 440 }, viewport = { width: 1200, height: 900 };
  assert.deepEqual(constrainPopup({ left: -200, top: -100 }, size, viewport), { left: 12, top: 12 });
  assert.deepEqual(constrainPopup({ left: 1500, top: 1100 }, size, viewport), { left: 798, top: 448 });
  assert.deepEqual(constrainPopup({ left: 400, top: 100 }, size, viewport), { left: 400, top: 100 });
});

test('a growing answer or smaller viewport repositions the note without putting its header offscreen', () => {
  assert.deepEqual(constrainPopup({ left: 700, top: 400 }, { width: 390, height: 560 }, { width: 1000, height: 700 }), { left: 598, top: 128 });
  assert.deepEqual(constrainPopup({ left: 700, top: 400 }, { width: 390, height: 560 }, { width: 320, height: 400 }), { left: 12, top: 12 });
});
