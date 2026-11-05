export const MIN_PDF_ZOOM = .5;
export const MAX_PDF_ZOOM = 2.5;
export const clampPdfZoom = (zoom: number) => Number.isFinite(zoom) ? Math.max(MIN_PDF_ZOOM, Math.min(MAX_PDF_ZOOM, zoom)) : 1;

/** Chromium precision-touchpad pinch events use ctrl+wheel. Plain wheel remains
 * scrolling. Keep fractional changes so gentle gestures are not rounded away.
 * https://developer.mozilla.org/en-US/docs/Web/API/Element/wheel_event */
export function pdfWheelZoom(zoom: number, delta: number, mode: number, viewportHeight: number): number {
  if (!Number.isFinite(delta) || ![0, 1, 2].includes(mode)) return clampPdfZoom(zoom);
  const pixels = delta * (mode === 1 ? 16 : mode === 2 ? viewportHeight : 1);
  return clampPdfZoom(zoom * Math.exp(-Math.max(-120, Math.min(120, pixels)) * .002));
}
export function pdfPageSize(page: { width: number; height: number }, availableWidth: number, zoom: number) {
  const scale = Math.min(Math.max(240, availableWidth - 40), 1000) / page.width * clampPdfZoom(zoom);
  return { width: Math.floor(page.width * scale), height: Math.floor(page.height * scale), scale };
}
export interface PdfZoomAnchor { x: number; y: number; viewportX: number; viewportY: number }
interface Rect { left: number; top: number; width: number; height: number }
export function pdfZoomAnchor(page: Rect, viewport: Rect, x: number, y: number): PdfZoomAnchor {
  const unit = (value: number) => Math.max(0, Math.min(1, value));
  return { x: unit((x - page.left) / Math.max(1, page.width)), y: unit((y - page.top) / Math.max(1, page.height)), viewportX: x - viewport.left, viewportY: y - viewport.top };
}
/** The page may be centered at one zoom and horizontally scrollable at another. */
export function pdfAnchorScrollDelta(anchor: PdfZoomAnchor, page: Rect, viewport: Rect) {
  return { x: page.left + anchor.x * page.width - viewport.left - anchor.viewportX, y: page.top + anchor.y * page.height - viewport.top - anchor.viewportY };
}
