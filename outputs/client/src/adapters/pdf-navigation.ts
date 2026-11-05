import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { OutlineEntry } from '../domain/reader-navigation';

/** Only internal PDF destinations are resolved. URL actions, scripts and external
 * documents are never executed by the navigation panel. */
export async function readPdfOutline(pdf: PDFDocumentProxy, signal: AbortSignal): Promise<{ entries: OutlineEntry[]; truncated: boolean }> {
  const raw = await pdf.getOutline();
  if (signal.aborted) throw new DOMException('Outline cancelled', 'AbortError');
  const entries: OutlineEntry[] = [], pending = [...(raw || [])].reverse().map((item, index) => ({ item, depth: 0, key: String(index) }));
  const destinations = new Map<string, Promise<number | null>>();
  const resolve = async (value: unknown) => {
    try {
      const dest = typeof value === 'string' ? await pdf.getDestination(value) : value;
      if (!Array.isArray(dest)) return null;
      let index: number;
      if (Number.isInteger(dest[0])) index = dest[0];
      else if (dest[0] && Number.isInteger(dest[0].num) && Number.isInteger(dest[0].gen)) index = await pdf.getPageIndex(dest[0]);
      else return null;
      return Number.isInteger(index) && index >= 0 && index < pdf.numPages ? index : null;
    } catch { return null; }
  };
  while (pending.length && entries.length < 1000) {
    if (signal.aborted) throw new DOMException('Outline cancelled', 'AbortError');
    const { item, depth, key } = pending.pop()!;
    const name = typeof item.dest === 'string' ? item.dest : undefined;
    if (name && !destinations.has(name)) destinations.set(name, resolve(name));
    const pageIndex = name ? await destinations.get(name)! : await resolve(item.dest);
    if (signal.aborted) throw new DOMException('Outline cancelled', 'AbortError');
    entries.push({ key, title: String(item.title || '未命名章节').slice(0, 500), depth: Math.min(depth, 8), pageIndex });
    const children = Array.isArray(item.items) ? item.items : [];
    for (let i = children.length - 1; i >= 0; i--) pending.push({ item: children[i], depth: depth + 1, key: key + '.' + i });
  }
  return { entries, truncated: pending.length > 0 };
}

/** One raster at a time. Cancelled queued pages do not allocate a canvas, and a
 * cancelled active job releases its resources before the next one starts. */
export class PdfRenderQueue {
  private pending: { run: () => Promise<unknown>; resolve: (value: any) => void; reject: (error: unknown) => void; signal: AbortSignal; unbind: () => void }[] = [];
  private running = false;
  enqueue<T>(run: () => Promise<T>, signal: AbortSignal): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      if (signal.aborted) { reject(new DOMException('Render cancelled', 'AbortError')); return; }
      const entry = { run, resolve, reject, signal, unbind: () => {} };
      const abort = () => { const index = this.pending.indexOf(entry); if (index >= 0) { this.pending.splice(index, 1); entry.unbind(); reject(new DOMException('Render cancelled', 'AbortError')); } };
      entry.unbind = () => signal.removeEventListener('abort', abort);
      signal.addEventListener('abort', abort, { once: true }); this.pending.push(entry); void this.drain();
    });
  }
  private async drain() {
    if (this.running) return; this.running = true;
    try {
      while (this.pending.length) {
        const entry = this.pending.shift()!;
        try { if (entry.signal.aborted) throw new DOMException('Render cancelled', 'AbortError'); const result = await entry.run(); if (entry.signal.aborted) throw new DOMException('Render cancelled', 'AbortError'); entry.resolve(result); }
        catch (error) { entry.reject(error); } finally { entry.unbind(); }
      }
    } finally { this.running = false; }
  }
}
