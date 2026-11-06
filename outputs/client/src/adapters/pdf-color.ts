import { colorPreview, type PixelFrame } from '../domain/pdf-color';
import { recolorPagePixels, type ReaderAppearance } from '../domain/reader';
interface Job { id: number; source: PixelFrame; appearance: ReaderAppearance; preview: boolean; resolve: (frame: PixelFrame | null) => void; reject: (error: unknown) => void }
/** One active job and one latest waiting job per visible page; no backlog from a dragged color picker. */
export class PdfColorProcessor {
  private worker: Worker | undefined;
  private sentSource: PixelFrame | undefined;
  private active: Job | undefined;
  private waiting: Job | undefined;
  private revision = 0;
  private disposed = false;
  constructor(private factory = () => new Worker(new URL('./pdf-color.worker.ts', import.meta.url), { type: 'module' })) {}
  prepare(source: PixelFrame, appearance: ReaderAppearance, preview = false): Promise<PixelFrame | null> {
    if (this.disposed) return Promise.resolve(null);
    const id = ++this.revision;
    this.waiting?.resolve(null);
    return new Promise((resolve, reject) => {
      this.waiting = { id, source, appearance, preview, resolve, reject }; this.pump();
    });
  }
  cancel() { ++this.revision; this.waiting?.resolve(null); this.waiting = undefined; }
  dispose() { this.disposed = true; this.cancel(); this.active?.resolve(null); this.active = undefined; this.worker?.terminate(); this.worker = undefined; this.sentSource = undefined; }
  private finish(frame: PixelFrame) {
    const job = this.active; this.active = undefined;
    job?.resolve(job.id === this.revision && !this.disposed ? frame : null); this.pump();
  }
  private pump() {
    if (this.active || !this.waiting || this.disposed) return;
    const job = this.waiting; this.waiting = undefined; this.active = job;
    try {
      if (!this.worker) {
        this.worker = this.factory();
        this.worker.onmessage = event => { if (event.data.id === this.active?.id) this.finish(event.data); };
        this.worker.onerror = event => { event.preventDefault(); this.worker?.terminate(); this.worker = undefined; this.sentSource = undefined; void this.fallback(); };
      }
      if (this.sentSource !== job.source) {
        const data = job.source.data.slice();
        this.worker.postMessage({ source: { width: job.source.width, height: job.source.height, data } }, [data.buffer]); this.sentSource = job.source;
      }
      this.worker.postMessage({ id: job.id, appearance: job.appearance, preview: job.preview });
    } catch { void this.fallback(); }
  }
  private async fallback() {
    const job = this.active; if (!job) return;
    try {
      const source = job.preview ? colorPreview(job.source) : job.source;
      const data = new Uint8ClampedArray(source.data.length);
      const rows = Math.max(1, Math.floor(65536 / source.width));
      for (let row = 0; row < source.height; row += rows) {
        if (this.disposed || job.id !== this.revision) { this.finish(source); return; }
        const end = Math.min(source.height, row + rows), from = Math.max(0, row - 1), to = Math.min(source.height, end + 1);
        const colored = recolorPagePixels(source.data.subarray(from * source.width * 4, to * source.width * 4), job.appearance, undefined, source.width);
        data.set(colored.subarray((row - from) * source.width * 4, (end - from) * source.width * 4), row * source.width * 4);
        await new Promise(resolve => setTimeout(resolve, 0));
      }
      this.finish({ width: source.width, height: source.height, data });
    } catch (error) { this.active = undefined; job.reject(error); this.pump(); }
  }
}
