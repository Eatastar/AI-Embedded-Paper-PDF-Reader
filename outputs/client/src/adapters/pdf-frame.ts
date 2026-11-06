import type { PDFPageProxy, RenderTask, TextLayer } from 'pdfjs-dist';
import type { ReaderAppearance, PdfColorRegion } from '../domain/reader';
import { recolorPagePixels } from '../domain/reader';

type Viewport = ReturnType<PDFPageProxy['getViewport']>;
interface PdfLibrary { TextLayer: typeof TextLayer }
export interface PdfFrame { original: ImageData; text: HTMLDivElement; textBounds: PdfColorRegion[]; width: number; height: number; viewport: Viewport }

/** Use PDF text geometry, including page/text rotation, rather than image links. */
export function pdfTextBounds(content: Awaited<ReturnType<PDFPageProxy['getTextContent']>>, viewport: Viewport): PdfColorRegion[] {
  const [a, b, c, d, e, f] = viewport.transform;
  return content.items.flatMap(item => {
    if (!('str' in item) || !item.str.trim()) return [];
    if (!item.transform.every(Number.isFinite) || !Number.isFinite(item.width) || !Number.isFinite(item.height)) return [];
    const [ta, tb, tc, td, te, tf] = item.transform;
    const font = content.styles?.[item.fontName];
    const fontHeight = Math.hypot(a * tc + c * td, b * tc + d * td);
    let angle = Math.atan2(b * ta + d * tb, a * ta + c * tb);
    if (font?.vertical) angle += Math.PI / 2;
    const ascentRatio = Number.isFinite(font?.ascent) ? font.ascent : Number.isFinite(font?.descent) ? 1 + font.descent : .8;
    const ascent = fontHeight * ascentRatio;
    const x = a * te + c * tf + e + ascent * Math.sin(angle), y = b * te + d * tf + f - ascent * Math.cos(angle);
    const runWidth = (font?.vertical ? item.height : item.width) * Math.hypot(a, b);
    const ux = Math.cos(angle), uy = Math.sin(angle);
    const corners = [[x, y], [x + ux * runWidth, y + uy * runWidth], [x - uy * fontHeight, y + ux * fontHeight], [x + ux * runWidth - uy * fontHeight, y + uy * runWidth + ux * fontHeight]];
    const left = Math.min(...corners.map(point => point[0])) - 1, top = Math.min(...corners.map(point => point[1])) - 1;
    return [{ left, top, width: Math.max(...corners.map(point => point[0])) + 1 - left, height: Math.max(...corners.map(point => point[1])) + 1 - top }];
  });
}

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
    return { original: context.getImageData(0, 0, canvas.width, canvas.height), text, textBounds: content.items.length ? pdfTextBounds(content, viewport) : [], width, height, viewport };
  })().catch(error => { cancel(); throw error; }).finally(() => {
    // The complete ImageData is retained; the temporary raster can be released
    // immediately rather than keeping another large bitmap through a gesture.
    canvas.width = canvas.height = 1;
  });
  return { promise, cancel };
}

/** Prepare every output pixel before resizing the visible bitmap. No await or
 * uncolored draw occurs between clearing that bitmap and publishing its pixels. */
export function paintPdfFrame(canvas: HTMLCanvasElement, original: ImageData, appearance: ReaderAppearance, compareOriginal: boolean, linkText: readonly PdfColorRegion[] = []): void {
  const context = canvas.getContext('2d', { alpha: true, willReadFrequently: true });
  if (!context) throw new Error('Canvas unavailable');
  let display = original;
  if (!compareOriginal && appearance.preset !== 'original') {
    display = context.createImageData(original.width, original.height);
    recolorPagePixels(original.data, appearance, display.data, original.width, linkText);
  }
  if (canvas.width !== display.width) canvas.width = display.width;
  if (canvas.height !== display.height) canvas.height = display.height;
  context.putImageData(display, 0, 0);
}
