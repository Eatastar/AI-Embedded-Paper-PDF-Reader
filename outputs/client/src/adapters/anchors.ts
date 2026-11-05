import type { RevivedTextSelector, TextSelector } from '@recogito/text-annotator';

export interface QuoteAnchor { start: number; end: number; quote: string }

// Renderers may change the DOM text (for example when TeX becomes a formula).
// Keep a still-correct range, and repair a moved range only when its exact quote
// identifies a single location. Ambiguous or changed quotes stay unlocated.
export function locateQuoteAnchor<T extends QuoteAnchor>(text: string, selector: T): T | null {
  if (!selector.quote) return null;
  if (Number.isInteger(selector.start) && Number.isInteger(selector.end)
    && selector.start >= 0 && selector.end <= text.length && selector.end > selector.start
    && text.slice(selector.start, selector.end) === selector.quote) return { ...selector };

  const start = text.indexOf(selector.quote);
  if (start === -1 || text.indexOf(selector.quote, start + 1) !== -1) return null;
  return { ...selector, start, end: start + selector.quote.length };
}

export function reviveQuoteSelector(selector: TextSelector, container: HTMLElement): RevivedTextSelector[] {
  const scope = selector.offsetReference || container;
  if (scope !== container && !container.contains(scope)) return [];
  const walker = container.ownerDocument.createTreeWalker(scope, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => node.parentElement?.closest('.not-annotatable')
      ? NodeFilter.FILTER_SKIP : NodeFilter.FILTER_ACCEPT,
  });
  const nodes: Text[] = [];
  let node: Node | null;
  while ((node = walker.nextNode())) nodes.push(node as Text);
  const located = locateQuoteAnchor(nodes.map((entry) => entry.data).join(''), selector);
  if (!located) return [];

  const range = container.ownerDocument.createRange();
  let offset = 0;
  let started = false;
  for (const entry of nodes) {
    const end = offset + entry.length;
    if (!started && located.start < end) {
      range.setStart(entry, located.start - offset);
      started = true;
    }
    if (started && located.end <= end) {
      range.setEnd(entry, located.end - offset);
      // A range spanning excluded nodes can contain different text. Do not
      // silently highlight it even when its filtered offsets happened to fit.
      return !range.collapsed && range.toString() === located.quote ? [{ ...located, range }] : [];
    }
    offset = end;
  }
  return [];
}
