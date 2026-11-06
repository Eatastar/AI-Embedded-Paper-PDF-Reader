import type { PDFPageProxy, RenderTask, TextLayer } from 'pdfjs-dist';
import type { ReaderAppearance } from '../domain/reader';
import { recolorPagePixels } from '../domain/reader';

type Viewport = ReturnType<PDFPageProxy['getViewport']>;
interface PdfLibrary { TextLayer: typeof TextLayer }
export interface PdfFrame { original: ImageData; text: HTMLDivElement; width: number; height: number; viewport: Viewport }

/** All progressive white-background painting and text construction stay detached.
 * Only a complete frame is eligible for presentation; cancellation cannot publish. */
export function startPdfFrame(page: PDFPageProxy, library: PdfLibrary, viewport: Viewport, outputScale: number, doc: Document = document) {
  const canvas = doc.createElement('canvas');
  const text = doc.createElement('div'); text.className = 'document-text-layer';
  const width = Math.floor(viewport.width), height = Math.floor(viewport.height);
  canvas.width = Math.max(1, Math.floor(width * outputScale)); canvas.height = Math.max(1, Math.floor(height * outputScale));
  const context = canvas.getContext('2d', { alpha: true, willReadFrequently: true });
  if (!context) throw new Error('Canvas unavailable');
  let cancelled = false, task: RenderTask | undefined, layer: TextLayer | undefined;
  const cancel = () => { cancelled = true; task?.cancel(); layer?.cancel(); };
  const check = () => { if (cancelled) throw new DOMException('PDF frame cancelled', 'AbortError'); };
  const promise = (async (): Promise<PdfFrame> => {
    task = page.render({ canvas, canvasContext: context, viewport, transform: outputScale === 1 ? undefined : [outputScale, 0, 0, outputScale, 0, 0], background: '#ffffff' });
    void task.promise.catch(() => {});
    const content = await page.getTextContent(); check();
    layer = new library.TextLayer({ container: text, textContentSource: content, viewport });
    await Promise.all([task.promise, layer.render()]); check();
    return { original: context.getImageData(0, 0, canvas.width, canvas.height), text, width, height, viewport };
  })().catch(error => { cancel(); throw error; }).finally(() => {
    // The complete ImageData is retained; the temporary raster can be released
    // immediately rather than keeping another large bitmap through a gesture.
    canvas.width = canvas.height = 1;
  });
  return { promise, cancel };
}

/** Prepare every output pixel before resizing the visible bitmap. No await or
 * uncolored draw occurs between clearing that bitmap and publishing its pixels. */
export function paintPdfFrame(canvas: HTMLCanvasElement, original: ImageData, appearance: ReaderAppearance, compareOriginal: boolean): void {
  const context = canvas.getContext('2d', { alpha: true, willReadFrequently: true });
  if (!context) throw new Error('Canvas unavailable');
  let display = original;
  if (!compareOriginal && appearance.preset !== 'original') {
    display = context.createImageData(original.width, original.height);
    recolorPagePixels(original.data, appearance, display.data, original.width);
  }
  if (canvas.width !== display.width) canvas.width = display.width;
  if (canvas.height !== display.height) canvas.height = display.height;
  context.putImageData(display, 0, 0);
}
