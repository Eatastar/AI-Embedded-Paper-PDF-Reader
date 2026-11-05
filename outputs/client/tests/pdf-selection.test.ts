import assert from 'node:assert/strict';
import test from 'node:test';
import { nearestPdfTextBox, pdfCaretOffsets } from '../src/domain/pdf-selection';

test('a short final abstract line wins over earlier full lines when the pointer ends just beyond its text', () => {
  // Measured from the reported PDF at fit-to-width: native selection stopped
  // three lines early at a container offset rather than the final text node.
  const boxes = [
    { left: 140.8, top: 432.7, right: 462.5, bottom: 440 },
    { left: 140.8, top: 441.2, right: 462.5, bottom: 448.4 },
    { left: 140.8, top: 449.7, right: 462.5, bottom: 456.9 },
    { left: 140.8, top: 458.1, right: 317.1, bottom: 465.4 },
  ];
  assert.equal(nearestPdfTextBox(boxes, 319, 462), 3);
  assert.equal(nearestPdfTextBox(boxes, 139, 462), 3);
  assert.equal(nearestPdfTextBox(boxes, 240, 445), 1);
});

test('indentation, formula fragments and adjacent columns resolve from geometry rather than DOM order', () => {
  const boxes = [
    { left: 320, top: 100, right: 500, bottom: 110 },
    { left: 100, top: 112, right: 300, bottom: 122 },
    { left: 108, top: 100, right: 300, bottom: 110 },
  ];
  assert.equal(nearestPdfTextBox(boxes, 102, 104), 2);
  assert.equal(nearestPdfTextBox(boxes, 302, 117), 1);
  assert.equal(nearestPdfTextBox(boxes, 322, 104), 0);
  assert.equal(nearestPdfTextBox([], 1, 1), null);
  assert.equal(nearestPdfTextBox([{ left: NaN, top: 0, right: 1, bottom: 1 }], 1, 1), null);
});

test('caret boxes support zoom, scroll offsets and rotated text with zero-height or zero-width caret lines', () => {
  const carets = [0, 1, 2, 3].map(offset => ({ left: 50 + offset * 8, right: 50 + offset * 8, top: 100, bottom: 114 }));
  assert.equal(nearestPdfTextBox(carets, 67, 108), 2);
  const scaled = carets.map(b => ({ left: b.left * 1.5 - 40, right: b.right * 1.5 - 40, top: b.top * 1.5 - 90, bottom: b.bottom * 1.5 - 90 }));
  assert.equal(nearestPdfTextBox(scaled, 67 * 1.5 - 40, 108 * 1.5 - 90), 2);
  const rotated = carets.map(b => ({ left: b.top, right: b.bottom, top: b.left, bottom: b.right }));
  assert.equal(nearestPdfTextBox(rotated, 108, 67), 2);
});

test('caret offsets retain complete Chinese characters, combining marks, emoji and UTF-16 annotation offsets', () => {
  const text = '摘e\u0301要👨‍👩‍👧‍👦𝛿';
  const offsets = pdfCaretOffsets(text);
  assert.deepEqual(offsets.map((end, i) => text.slice(offsets[i - 1] ?? 0, end)).slice(1), ['摘', 'e\u0301', '要', '👨‍👩‍👧‍👦', '𝛿']);
  assert.equal(offsets.at(-1), text.length);
  assert.deepEqual(pdfCaretOffsets(''), [0]);
});
