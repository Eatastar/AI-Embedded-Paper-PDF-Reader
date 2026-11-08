import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import { PdfRenderQueue } from './pdf-navigation';

interface PageEntry { page?: PDFPageProxy; promise: Promise<PDFPageProxy>; users: number; owner: DocumentResources }
interface DocumentResources { pages: Map<number, PageEntry>; queue: PdfRenderQueue; disposed: boolean }
export interface PdfPageLease { page: PDFPageProxy; release: () => void }
const documents = new WeakMap<PDFDocumentProxy, DocumentResources>();
const pages = new WeakMap<PDFPageProxy, PageEntry>();
function resources(pdf: PDFDocumentProxy): DocumentResources {
  let value = documents.get(pdf);
  if (!value) { value = { pages: new Map(), queue: new PdfRenderQueue(), disposed: false }; documents.set(pdf, value); }
  return value;
}
export const pdfRenderQueue = (pdf: PDFDocumentProxy) => resources(pdf).queue;
function lease(entry: PageEntry): () => void {
  entry.users++;
  let released = false;
  return () => {
    if (released) return; released = true;
    if (--entry.users === 0 && !entry.owner.disposed) entry.page?.cleanup?.();
  };
}
/** A page is cleaned only after its last base/detail/crop user has finished. */
export async function acquirePdfPage(pdf: PDFDocumentProxy, number: number, signal?: AbortSignal): Promise<PdfPageLease> {
  signal?.throwIfAborted();
  const owner = resources(pdf);
  if (owner.disposed) throw new DOMException('Document closed', 'AbortError');
  let entry = owner.pages.get(number);
  if (!entry) {
    entry = { owner, users: 0, promise: pdf.getPage(number) }; owner.pages.set(number, entry);
    entry.promise = entry.promise.then(page => { entry!.page = page; pages.set(page, entry!); return page; }, error => { owner.pages.delete(number); throw error; });
  }
  const release = lease(entry);
  try {
    const page = await entry.promise;
    signal?.throwIfAborted();
    if (owner.disposed) throw new DOMException('Document closed', 'AbortError');
    return { page, release };
  } catch (error) { release(); throw error; }
}
export function retainPdfPage(page: PDFPageProxy): () => void {
  const entry = pages.get(page);
  return entry ? lease(entry) : () => {};
}
export function releasePdfDocument(pdf: PDFDocumentProxy): void {
  const owner = documents.get(pdf); if (!owner) return;
  owner.disposed = true; owner.pages.clear();
}

/** Steady-state base pixel budget, shared by active pages. Transient renders
 * are serialized separately; visible-region detail preserves sharp zoom. */
export const PDF_BASE_PIXEL_BUDGET = 16_000_000;
export function pdfBasePixelLimit(activePages: number, continuous: boolean): number {
  return continuous ? Math.min(8_000_000, Math.floor(PDF_BASE_PIXEL_BUDGET / Math.max(1, activePages))) : PDF_BASE_PIXEL_BUDGET;
}
