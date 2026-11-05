import type { TextSelector } from '@recogito/text-annotator';
import { reviveQuoteSelector } from './anchors';

/** Highlight renderers omit offscreen rectangles. Resolve the saved exact quote
 * first so navigation can bring that range onscreen without guessing a match. */
export function readerAnnotationRange(container: HTMLElement, anchor: unknown): Range | null {
  if (!anchor || typeof anchor !== 'object' || !('selectors' in anchor) || !Array.isArray(anchor.selectors)) return null;
  for (const value of anchor.selectors) {
    if (!value || typeof value !== 'object' || typeof value.start !== 'number' || typeof value.end !== 'number' || typeof value.quote !== 'string') continue;
    const revived = reviveQuoteSelector(value as TextSelector, container);
    if (revived[0]?.range && !revived[0].range.collapsed) return revived[0].range;
  }
  return null;
}
