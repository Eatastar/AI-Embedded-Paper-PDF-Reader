import type { TextAnnotation, TextSelector } from '@recogito/text-annotator';
import { reviveQuoteSelector } from './anchors';

export interface AnnotationSurface {
  setAnnotations(annotations: TextAnnotation[], replace: boolean): void;
  setSelected(id?: string): void;
  destroy(): void;
  state: { store: {
    recalculatePositions(): void;
    getAnnotation(id: string): TextAnnotation | undefined;
    getAt(x: number, y: number, all: true): TextAnnotation[] | undefined;
    getAnnotationBounds(id: string): { x: number; y: number; width: number; height: number } | undefined;
  } };
}

/** Parent viewport coordinates for menus/cards; source hit testing stays local. */
export function annotationViewportRect(rect: DOMRect, source?: Document): DOMRect {
  let left = rect.left, top = rect.top;
  let current = source;
  while (current && current !== document) {
    const frame = current.defaultView?.frameElement;
    if (!frame) break;
    const bounds = frame.getBoundingClientRect(); left += bounds.left + frame.clientLeft; top += bounds.top + frame.clientTop;
    current = frame.ownerDocument;
  }
  return new DOMRect(left, top, rect.width, rect.height);
}
export const elementTarget = (value: unknown): Element | null => value && typeof value === 'object' && 'nodeType' in value && value.nodeType === 1 ? value as Element : null;

export function ebookRangeSelector(range: Range, root: HTMLElement): TextSelector {
  const before = root.ownerDocument.createRange(); before.selectNodeContents(root); before.setEnd(range.startContainer, range.startOffset);
  const start = before.toString().length;
  return { start, end: start + range.toString().length, quote: range.toString() };
}

/** Browser-native ranges avoid copying chapter text into another annotator DOM.
 * CSS highlights follow font/layout changes without wrapping publisher markup. */
export function createFrameAnnotationSurface(root: HTMLElement, color: (id: string) => string): AnnotationSurface {
  const view = root.ownerDocument.defaultView! as Window & typeof globalThis & { Highlight: new (...ranges: Range[]) => unknown };
  const registry = (view.CSS as typeof CSS & { highlights: Map<string, unknown> }).highlights;
  const style = root.ownerDocument.createElement('style'); root.ownerDocument.head.append(style);
  let selected: string | undefined;
  const entries = new Map<string, { annotation: TextAnnotation; ranges: Range[]; name: string }>();
  const clear = () => { for (const entry of entries.values()) registry.delete(entry.name); entries.clear(); style.textContent = ''; };
  const paint = () => { style.textContent = [...entries.values()].map(entry => `::highlight(${entry.name}){background-color:color-mix(in srgb, ${color(entry.annotation.id)} ${entry.annotation.id === selected ? '65' : '40'}%, transparent);${entry.annotation.id === selected ? 'text-decoration:underline;' : ''}}`).join('\n'); };
  const rects = (id: string) => (entries.get(id)?.ranges || []).flatMap(range => [...range.getClientRects()]);
  return {
    setAnnotations(annotations) {
      clear();
      for (const annotation of annotations) {
        const selectors = annotation.target.selector.flatMap(selector => reviveQuoteSelector(selector, root));
        const ranges = selectors.map(selector => selector.range);
        const name = `ebook-note-${entries.size}`;
        entries.set(annotation.id, { annotation: { ...annotation, target: { ...annotation.target, selector: selectors } }, ranges, name });
        if (ranges.length) registry.set(name, new view.Highlight(...ranges));
      }
      paint();
    },
    setSelected(id) { selected = id; paint(); },
    destroy() { clear(); style.remove(); },
    state: { store: {
      recalculatePositions() { /* Native ranges reflow with the document. */ },
      getAnnotation(id) { return entries.get(id)?.annotation; },
      getAt(x, y) {
        const bounds = root.getBoundingClientRect(); const px = bounds.left + x, py = bounds.top + y;
        return [...entries.values()].filter(entry => rects(entry.annotation.id).some(rect => px >= rect.left && px <= rect.right && py >= rect.top && py <= rect.bottom)).map(entry => entry.annotation);
      },
      getAnnotationBounds(id) {
        const ranges = rects(id); if (!ranges.length) return;
        const bounds = root.getBoundingClientRect(); const rect = ranges.find(rect => rect.bottom > 0 && rect.top < view.innerHeight) || ranges[0];
        return { x: rect.left - bounds.left, y: rect.top - bounds.top, width: rect.width, height: rect.height };
      },
    } },
  };
}
