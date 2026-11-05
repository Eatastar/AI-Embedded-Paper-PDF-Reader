import { nearestPdfTextBox, pdfCaretOffsets } from '../domain/pdf-selection';
import type { PdfTextBox } from '../domain/pdf-selection';

interface Caret { node: Text; offset: number }
interface TextRun { node: Text; box: PdfTextBox; carets?: { offset: number; box: PdfTextBox }[] }

/**
 * Chromium's native selection can resolve a gap between PDF spans to a distant
 * container offset. Hit-test the rendered runs and their real DOM caret boxes
 * instead. Keep every text node and its order intact for existing annotations.
 */
export function bindPdfTextSelection(layer: HTMLDivElement): () => void {
  const doc = layer.ownerDocument;
  const win = doc.defaultView!;
  const abort = new AbortController();
  const options = { signal: abort.signal, capture: true };
  const viewport = layer.closest<HTMLElement>('.document-reader-viewport');
  let pointerId: number | undefined;
  let runs: TextRun[] = [];
  let active: { anchor: Caret; startX: number; startY: number; x: number; y: number; moved: boolean } | null = null;
  let frame = 0;

  const relativeBox = (rect: DOMRect, origin: DOMRect): PdfTextBox => ({
    left: rect.left - origin.left, top: rect.top - origin.top,
    right: rect.right - origin.left, bottom: rect.bottom - origin.top,
  });
  const collectRuns = () => {
    const origin = layer.getBoundingClientRect();
    runs = Array.from(layer.querySelectorAll<HTMLSpanElement>('span[role="presentation"]')).flatMap(span => {
      const node = span.firstChild;
      const rect = span.getBoundingClientRect();
      return node?.nodeType === Node.TEXT_NODE && node.textContent?.trim() && rect.width > 0 && rect.height > 0
        ? [{ node: node as Text, box: relativeBox(rect, origin) }] : [];
    });
  };
  const caretAt = (clientX: number, clientY: number): Caret | null => {
    const origin = layer.getBoundingClientRect();
    const x = clientX - origin.left, y = clientY - origin.top;
    const index = nearestPdfTextBox(runs.map(run => run.box), x, y);
    if (index === null) return null;
    const run = runs[index];
    if (!run.carets) {
      const range = doc.createRange();
      run.carets = pdfCaretOffsets(run.node.data).map(offset => {
        range.setStart(run.node, offset);
        range.collapse(true);
        return { offset, box: relativeBox(range.getBoundingClientRect(), origin) };
      });
    }
    const stop = nearestPdfTextBox(run.carets.map(caret => caret.box), x, y);
    return stop === null ? null : { node: run.node, offset: run.carets[stop].offset };
  };
  const update = () => {
    if (!active || !active.anchor.node.isConnected) return;
    const focus = caretAt(active.x, active.y);
    if (focus) doc.getSelection()?.setBaseAndExtent(active.anchor.node, active.anchor.offset, focus.node, focus.offset);
  };
  const stop = () => {
    active = null;
    win.cancelAnimationFrame(frame);
    frame = 0;
    if (pointerId !== undefined && layer.hasPointerCapture(pointerId)) layer.releasePointerCapture(pointerId);
    pointerId = undefined;
    runs = [];
  };
  const edgeSpeed = (point: number, min: number, max: number) => {
    const edge = 24;
    if (point < min + edge) return -Math.min(22, (min + edge - point) / 2);
    if (point > max - edge) return Math.min(22, (point - max + edge) / 2);
    return 0;
  };
  const autoScroll = () => {
    frame = 0;
    if (!active?.moved || !viewport) return;
    const bounds = viewport.getBoundingClientRect();
    const dx = edgeSpeed(active.x, bounds.left, bounds.right);
    const dy = edgeSpeed(active.y, bounds.top, bounds.bottom);
    if (!dx && !dy) return;
    const beforeX = viewport.scrollLeft, beforeY = viewport.scrollTop;
    viewport.scrollBy(dx, dy);
    update();
    if (beforeX !== viewport.scrollLeft || beforeY !== viewport.scrollTop) frame = win.requestAnimationFrame(autoScroll);
  };

  layer.addEventListener('pointerdown', event => {
    if (event.pointerType === 'mouse' && event.button === 0) pointerId = event.pointerId;
  }, options);
  layer.addEventListener('mousedown', event => {
    // Native word/paragraph selection, touch selection and modifier gestures stay
    // available. Only ordinary mouse drags need the PDF coordinate correction.
    if (event.button !== 0 || event.detail > 1 || pointerId === undefined || event.ctrlKey || event.metaKey || event.altKey) return;
    collectRuns();
    const focus = caretAt(event.clientX, event.clientY);
    if (!focus) return;
    const selection = doc.getSelection();
    const existing = event.shiftKey && selection?.anchorNode?.nodeType === Node.TEXT_NODE && layer.contains(selection.anchorNode)
      ? { node: selection.anchorNode as Text, offset: selection.anchorOffset } : null;
    active = { anchor: existing || focus, startX: event.clientX, startY: event.clientY, x: event.clientX, y: event.clientY, moved: false };
    event.preventDefault();
    layer.setPointerCapture(pointerId);
    update();
  }, options);
  doc.addEventListener('pointermove', event => {
    if (!active || event.pointerId !== pointerId) return;
    active.x = event.clientX; active.y = event.clientY;
    active.moved ||= Math.hypot(active.x - active.startX, active.y - active.startY) >= 3;
    if (!active.moved) return;
    event.preventDefault();
    update();
    if (!frame) frame = win.requestAnimationFrame(autoScroll);
  }, options);
  doc.addEventListener('pointerup', event => {
    if (!active || event.pointerId !== pointerId) return;
    // Capture phase runs before AnnotatedAnswer reads the completed range.
    active.x = event.clientX; active.y = event.clientY;
    if (active.moved) update();
    stop();
  }, options);
  doc.addEventListener('pointercancel', stop, options);
  win.addEventListener('blur', stop, { signal: abort.signal });
  return () => { stop(); abort.abort(); };
}
