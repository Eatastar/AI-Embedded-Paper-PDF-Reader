import { pdfWheelZoom } from '../domain/pdf-zoom';

interface ZoomTarget extends EventTarget { clientHeight: number }
interface ZoomOptions {
  zoom: () => number;
  onZoom: (zoom: number, point: { x: number; y: number }) => void;
  requestFrame?: (callback: FrameRequestCallback) => number;
  cancelFrame?: (id: number) => void;
}
/** Non-passive, scoped to the PDF viewport: the page and chat chrome do not zoom. */
export function bindPdfZoom(target: ZoomTarget, options: ZoomOptions): () => void {
  const request = options.requestFrame || requestAnimationFrame;
  const cancel = options.cancelFrame || cancelAnimationFrame;
  let frame = 0, pending: number | undefined, point = { x: 0, y: 0 };
  const wheel = (raw: Event) => {
    const event = raw as WheelEvent;
    if (!event.ctrlKey || !Number.isFinite(event.deltaY)) return;
    event.preventDefault();
    pending = pdfWheelZoom(pending ?? options.zoom(), event.deltaY, event.deltaMode, target.clientHeight);
    point = { x: event.clientX, y: event.clientY };
    if (!frame) frame = request(() => {
      frame = 0;
      const next = pending; pending = undefined;
      if (next !== undefined) options.onZoom(next, point);
    });
  };
  target.addEventListener('wheel', wheel, { passive: false });
  return () => { target.removeEventListener('wheel', wheel); if (frame) cancel(frame); pending = undefined; };
}
