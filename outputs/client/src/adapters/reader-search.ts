import { foldSearchText, normalizeSearchText } from '../domain/reader-navigation';

/** Draw temporary search rectangles without wrapping or rewriting original text.
 * The text-annotation library continues to see exactly the same text nodes. */
export function markReaderSearch(container: HTMLElement, textRoot: HTMLElement, query: string, ordinal: number): { marker: HTMLElement | null; clear: () => void } {
  const doc = container.ownerDocument, walker = doc.createTreeWalker(textRoot, NodeFilter.SHOW_TEXT);
  const nodes: { node: Text; start: number; end: number }[] = []; let text = '', node: Node | null;
  while ((node = walker.nextNode())) { const start = text.length; text += node.textContent || ''; nodes.push({ node: node as Text, start, end: text.length }); }
  const normalized = normalizeSearchText(text), term = foldSearchText(query);
  let at = -1, from = 0;
  if (term) for (let i = 0; i <= ordinal; i++) { at = normalized.text.indexOf(term, from); if (at < 0) break; from = at + term.length; }
  const layer = doc.createElement('div'); layer.className = 'reader-search-layer'; layer.setAttribute('aria-hidden', 'true');
  const clear = () => layer.remove();
  if (at < 0 || !term) return { marker: null, clear };
  const start = normalized.starts[at], end = normalized.ends[at + term.length - 1];
  const first = nodes.find(n => n.start <= start && n.end > start), last = nodes.find(n => n.start < end && n.end >= end);
  if (!first || !last) return { marker: null, clear };
  const range = doc.createRange(); range.setStart(first.node, start - first.start); range.setEnd(last.node, end - last.start);
  const bounds = container.getBoundingClientRect(), scaleX = bounds.width / Math.max(1, container.offsetWidth), scaleY = bounds.height / Math.max(1, container.offsetHeight);
  for (const rect of range.getClientRects()) {
    if (rect.width <= 0 || rect.height <= 0) continue;
    const mark = doc.createElement('span'); mark.className = 'reader-search-marker';
    Object.assign(mark.style, { left: `${(rect.left - bounds.left) / scaleX}px`, top: `${(rect.top - bounds.top) / scaleY}px`, width: `${rect.width / scaleX}px`, height: `${rect.height / scaleY}px` }); layer.append(mark);
  }
  container.append(layer);
  return { marker: layer.firstElementChild as HTMLElement | null, clear };
}
