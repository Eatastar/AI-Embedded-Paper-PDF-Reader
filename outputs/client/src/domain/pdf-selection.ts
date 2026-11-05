export interface PdfTextBox {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** PDF text runs are absolutely positioned. DOM order is not a hit-test. */
export function nearestPdfTextBox(boxes: readonly PdfTextBox[], x: number, y: number): number | null {
  let nearest: number | null = null;
  let best = Infinity;
  for (let index = 0; index < boxes.length; index += 1) {
    const box = boxes[index];
    if (![box.left, box.top, box.right, box.bottom].every(Number.isFinite)
      || box.right < box.left || box.bottom < box.top) continue;
    const dx = Math.max(box.left - x, 0, x - box.right);
    const dy = Math.max(box.top - y, 0, y - box.bottom);
    // Prefer the line under the pointer, including its short-line trailing gap.
    // The tiny tie-breaker handles overlapping superscripts and base text.
    const score = dx * dx + 4 * dy * dy + .001 * (y - (box.top + box.bottom) / 2) ** 2;
    if (score < best) { best = score; nearest = index; }
  }
  return nearest;
}

/** DOM ranges use UTF-16 offsets; never place a caret inside a grapheme. */
export function pdfCaretOffsets(text: string): number[] {
  const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
  return [0, ...Array.from(segmenter.segment(text), part => part.index + part.segment.length)];
}
