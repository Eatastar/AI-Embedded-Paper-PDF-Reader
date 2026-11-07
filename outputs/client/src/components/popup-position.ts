export interface PopupPosition { left: number; top: number }
export interface PopupSize { width: number; height: number }
export type ResizeEdge = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';
export interface PopupRect extends PopupPosition, PopupSize {}

/** Physical edges stay aligned with the source, including in RTL interfaces. */
export function resizePopup(rect: PopupRect, edge: ResizeEdge, delta: PopupPosition, viewport: PopupSize): PopupRect {
  const margin = 12;
  const minWidth = Math.min(260, Math.max(1, viewport.width - margin * 2));
  const minHeight = Math.min(180, Math.max(1, viewport.height - margin * 2));
  let left = rect.left, top = rect.top, right = rect.left + rect.width, bottom = rect.top + rect.height;
  if (edge.includes('w')) left = Math.max(margin, Math.min(right - minWidth, left + delta.left));
  if (edge.includes('e')) right = Math.min(viewport.width - margin, Math.max(left + minWidth, right + delta.left));
  if (edge.includes('n')) top = Math.max(margin, Math.min(bottom - minHeight, top + delta.top));
  if (edge.includes('s')) bottom = Math.min(viewport.height - margin, Math.max(top + minHeight, bottom + delta.top));
  const width = Math.min(Math.max(minWidth, right - left), Math.max(1, viewport.width - margin * 2));
  const height = Math.min(Math.max(minHeight, bottom - top), Math.max(1, viewport.height - margin * 2));
  return { ...constrainPopup({ left, top }, { width, height }, viewport), width, height };
}

/** Keep the draggable header reachable after moving or resizing a card. */
export function constrainPopup(position: PopupPosition, size: PopupSize, viewport: PopupSize): PopupPosition {
  const margin = 12;
  return {
    left: Math.max(margin, Math.min(position.left, viewport.width - size.width - margin)),
    top: Math.max(margin, Math.min(position.top, viewport.height - size.height - margin)),
  };
}
