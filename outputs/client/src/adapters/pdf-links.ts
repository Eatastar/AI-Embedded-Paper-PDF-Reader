import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
type Viewport = ReturnType<PDFPageProxy['getViewport']>;
export interface PdfLink { id: string; label: string; rect: { left: number; top: number; width: number; height: number }; destination?: unknown; url?: string }
export function safePdfUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : null; }
  catch { return null; }
}
export async function readPdfLinks(page: PDFPageProxy, viewport: Viewport, signal: AbortSignal): Promise<PdfLink[]> {
  const annotations = await page.getAnnotations({ intent: 'display' }); signal.throwIfAborted();
  return annotations.flatMap((item: { subtype?: string; id?: string; rect?: number[]; dest?: unknown; url?: string }, index: number) => {
    if (item.subtype !== 'Link' || !Array.isArray(item.rect) || item.rect.length !== 4 || !item.rect.every(Number.isFinite)) return [];
    const url = safePdfUrl(item.url);
    if (!url && typeof item.dest !== 'string' && !Array.isArray(item.dest)) return [];
    const [x1, y1] = viewport.convertToViewportPoint(item.rect[0], item.rect[1]);
    const [x2, y2] = viewport.convertToViewportPoint(item.rect[2], item.rect[3]);
    const rect = { left: Math.min(x1, x2), top: Math.min(y1, y2), width: Math.abs(x2 - x1), height: Math.abs(y2 - y1) };
    if (!rect.width || !rect.height) return [];
    return [{ id: item.id || String(index), label: url || (typeof item.dest === 'string' ? item.dest : String(index + 1)), rect, ...(url ? { url } : { destination: item.dest }) }];
  });
}
export function pdfLinkAt(links: PdfLink[], x: number, y: number): PdfLink | undefined {
  return links.find(({ rect }) => x >= rect.left && y >= rect.top && x <= rect.left + rect.width && y <= rect.top + rect.height);
}
/** Resolve PDF named/explicit destinations to page-relative positions, including rotation. */
export async function resolvePdfDestination(pdf: PDFDocumentProxy, value: unknown, signal: AbortSignal): Promise<{ pageIndex: number; x: number; y: number } | null> {
  try {
    const dest = typeof value === 'string' ? await pdf.getDestination(value) : value; signal.throwIfAborted();
    if (!Array.isArray(dest)) return null;
    const ref = dest[0];
    const index = Number.isInteger(ref) ? ref : ref && Number.isInteger(ref.num) && Number.isInteger(ref.gen) ? await pdf.getPageIndex(ref) : null;
    signal.throwIfAborted();
    if (!Number.isInteger(index) || index < 0 || index >= pdf.numPages) return null;
    const page = await pdf.getPage(index + 1); signal.throwIfAborted();
    const viewport = page.getViewport({ scale: 1 }), mode = dest[1]?.name;
    if (mode === 'Fit' || mode === 'FitB') return { pageIndex: index, x: 0, y: 0 };
    let x = page.view[0], y = page.view[3];
    if (mode === 'XYZ') { if (Number.isFinite(dest[2])) x = dest[2]; if (Number.isFinite(dest[3])) y = dest[3]; }
    else if (mode === 'FitH' || mode === 'FitBH') { if (Number.isFinite(dest[2])) y = dest[2]; }
    else if (mode === 'FitV' || mode === 'FitBV') { if (Number.isFinite(dest[2])) x = dest[2]; }
    else if (mode === 'FitR') { if (Number.isFinite(dest[2])) x = dest[2]; if (Number.isFinite(dest[5])) y = dest[5]; }
    else if (mode !== 'Fit' && mode !== 'FitB') return null;
    const point = viewport.convertToViewportPoint(x, y);
    return { pageIndex: index, x: Math.max(0, Math.min(1, point[0] / viewport.width)), y: Math.max(0, Math.min(1, point[1] / viewport.height)) };
  } catch (error) { signal.throwIfAborted(); return null; }
}
