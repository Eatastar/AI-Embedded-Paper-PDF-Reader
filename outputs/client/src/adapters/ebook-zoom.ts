import { bindPdfZoom } from './pdf-zoom';
import { clampPdfZoom } from '../domain/pdf-zoom';

export interface EbookZoomController {
  set(value: number, point?: { x: number; y: number }): void;
  resize(contentWidth: number): void;
  destroy(): void;
}

/** Scale a fixed logical chapter width with native CSS zoom. Font size and line
 * breaks stay unchanged; browser text, highlights and image rendering remain live. */
export function bindEbookZoom(doc: Document, options: { zoom: number; contentWidth: number; onZoom: (value: number) => void }): EbookZoomController {
  const mount = doc.getElementById('ebook-mount');
  const scroll = doc.scrollingElement as HTMLElement | null;
  if (!mount || !scroll) throw new Error('Ebook viewport unavailable');
  let zoom = clampPdfZoom(options.zoom), logicalWidth = 0;
  const set = (value: number, point?: { x: number; y: number }) => {
    const next = clampPdfZoom(value); if (next === zoom) return;
    const x = point?.x ?? doc.documentElement.clientWidth / 2;
    const y = point?.y ?? doc.documentElement.clientHeight / 2;
    const before = mount.getBoundingClientRect();
    const localX = (x - before.left) / zoom, localY = (y - before.top) / zoom;
    zoom = next; mount.style.setProperty('zoom', String(zoom), 'important');
    const after = mount.getBoundingClientRect();
    scroll.scrollLeft += after.left + localX * zoom - x;
    scroll.scrollTop += after.top + localY * zoom - y;
    options.onZoom(zoom);
    // Notify outer cards/search after the source viewport has finished moving.
    window.dispatchEvent(new Event('scroll'));
  };
  const resize = (contentWidth: number) => {
    const width = Math.max(240, Math.min(doc.documentElement.clientWidth, contentWidth + 40));
    if (logicalWidth !== width) { logicalWidth = width; mount.style.setProperty('width', `${width}px`, 'important'); }
  };
  mount.style.setProperty('zoom', String(zoom), 'important'); resize(options.contentWidth);
  // This binder is pure wheel/animation-frame handling, independent of PDF.js.
  const unbind = bindPdfZoom(doc.documentElement, { zoom: () => zoom, onZoom: set });
  return { set, resize, destroy() { unbind(); } };
}
