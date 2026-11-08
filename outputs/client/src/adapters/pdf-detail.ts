import type { PDFPageProxy, RenderTask } from 'pdfjs-dist';
import { PdfColorProcessor } from './pdf-color';
import { retainPdfPage } from './pdf-resources';
import type { PdfRenderQueue } from './pdf-navigation';
import { pdfDetailCovers, pdfDetailPlan, visiblePdfRegion, type PdfDetailPlan } from '../domain/pdf-detail';
import type { ReaderAppearance, PdfColorRegion } from '../domain/reader';

interface DetailOptions {
  page: PDFPageProxy;
  viewport: ReturnType<PDFPageProxy['getViewport']>;
  stage: HTMLElement;
  scrollViewport: HTMLElement;
  canvas: HTMLCanvasElement;
  baseDensity: number;
  appearance: ReaderAppearance;
  linkText: readonly PdfColorRegion[];
  queue?: PdfRenderQueue;
}

/** One replaceable, noninteractive detail tile per visible page. Offscreen pages
 * retain their bounded base frame, but release every detail pixel and worker. */
export function bindPdfDetail(options: DetailOptions): () => void {
  const { page, viewport, stage, scrollViewport, canvas, baseDensity, appearance, linkText } = options;
  const win = stage.ownerDocument.defaultView!;
  let disposed = false, revision = 0, timer = 0;
  let task: RenderTask | undefined, processor: PdfColorProcessor | undefined;
  let published: PdfDetailPlan | null = null, requested: PdfDetailPlan | null = null;
  let controller: AbortController | undefined;
  const cancel = () => { revision++; win.clearTimeout(timer); controller?.abort(); task?.cancel(); processor?.release(); requested = null; };
  const release = () => {
    cancel(); published = null; processor?.dispose(); processor = undefined;
    Object.assign(canvas.style, { visibility: 'hidden', left: '0px', top: '0px', width: '1px', height: '1px' }); canvas.width = canvas.height = 1;
    canvas.dataset.detailState = 'offscreen';
  };
  const measure = () => {
    const bounds = stage.getBoundingClientRect(), clip = scrollViewport.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return null;
    const sx = stage.offsetWidth / bounds.width, sy = stage.offsetHeight / bounds.height;
    const visible = visiblePdfRegion({ width: stage.offsetWidth, height: stage.offsetHeight }, {
      left: (clip.left + scrollViewport.clientLeft - bounds.left) * sx,
      top: (clip.top + scrollViewport.clientTop - bounds.top) * sy,
      width: scrollViewport.clientWidth * sx, height: scrollViewport.clientHeight * sy,
    });
    if (!visible) return null;
    const plan = pdfDetailPlan({ width: stage.offsetWidth, height: stage.offsetHeight }, visible, win.devicePixelRatio);
    return plan && plan.scale > baseDensity * 1.05 ? { plan, visible } : null;
  };
  const render = async (plan: PdfDetailPlan, id: number) => {
    if (disposed || id !== revision) return;
    const releasePage = retainPdfPage(page);
    const raster = stage.ownerDocument.createElement('canvas');
    let renderTask: RenderTask | undefined;
    try {
      if (disposed || id !== revision) return;
      raster.width = plan.pixelWidth; raster.height = plan.pixelHeight;
      const context = raster.getContext('2d', { alpha: true, willReadFrequently: true });
      if (!context) throw Error('Canvas unavailable');
      renderTask = task = page.render({ canvas: raster, canvasContext: context, viewport, background: '#ffffff', transform: [plan.scale, 0, 0, plan.scale, -plan.left * plan.scale, -plan.top * plan.scale] });
      await renderTask.promise;
      if (disposed || id !== revision) return;
      const original = context.getImageData(0, 0, raster.width, raster.height);
      const source = { width: original.width, height: original.height, data: original.data, linkText: linkText.map(rect => ({ left: (rect.left - plan.left) * plan.scale, top: (rect.top - plan.top) * plan.scale, width: rect.width * plan.scale, height: rect.height * plan.scale })) };
      raster.width = raster.height = 1;
      processor ??= new PdfColorProcessor();
      const frame = await processor.prepare(source, appearance);
      if (!frame || disposed || id !== revision) return;
      const display = new ImageData(new Uint8ClampedArray(frame.data.buffer as ArrayBuffer, frame.data.byteOffset, frame.data.length), frame.width, frame.height);
      const target = canvas.getContext('2d', { alpha: true, willReadFrequently: true });
      if (!target) throw Error('Canvas unavailable');
      // The white source stays detached. Geometry and colored pixels publish in
      // one synchronous step, underneath the existing selection/highlight layer.
      canvas.width = frame.width; canvas.height = frame.height;
      target.putImageData(display, 0, 0);
      Object.assign(canvas.style, { left: `${plan.left}px`, top: `${plan.top}px`, width: `${plan.width}px`, height: `${plan.height}px`, visibility: 'visible' });
      published = plan; requested = null;
      processor.release();
      canvas.dataset.detailState = 'ready'; canvas.dataset.detailScale = String(plan.scale);
    } catch (error) {
      if (!disposed && id === revision && !(error instanceof Error && ['RenderingCancelledException', 'AbortError'].includes(error.name))) { requested = null; canvas.dataset.detailState = 'fallback'; }
    } finally {
      if (task === renderTask) task = undefined;
      raster.width = raster.height = 1;
      releasePage();
    }
  };
  const update = () => {
    if (disposed) return;
    const next = measure();
    if (!next) { release(); return; }
    if (pdfDetailCovers(published, next.visible, next.plan.scale)) { if (requested) cancel(); return; }
    if (pdfDetailCovers(requested, next.visible, next.plan.scale)) return;
    cancel(); requested = next.plan;
    const id = revision;
    canvas.dataset.detailState = 'loading';
    controller = new AbortController(); const signal = controller.signal;
    timer = win.setTimeout(() => { void (options.queue ? options.queue.enqueue(() => render(next.plan, id), signal) : render(next.plan, id)).catch(() => {}); }, 90);
  };
  const observer = new ResizeObserver(update); observer.observe(stage); observer.observe(scrollViewport);
  scrollViewport.addEventListener('scroll', update, { passive: true }); win.addEventListener('resize', update);
  let resolution: MediaQueryList;
  const watchResolution = () => {
    resolution?.removeEventListener('change', watchResolution);
    resolution = win.matchMedia(`(resolution: ${win.devicePixelRatio}dppx)`);
    resolution.addEventListener('change', watchResolution, { once: true }); update();
  };
  watchResolution();
  return () => { disposed = true; release(); observer.disconnect(); scrollViewport.removeEventListener('scroll', update); win.removeEventListener('resize', update); resolution?.removeEventListener('change', watchResolution); };
}
