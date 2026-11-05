export interface PopupPosition { left: number; top: number }
export interface PopupSize { width: number; height: number }

/** Keep the draggable header reachable after moving or resizing a card. */
export function constrainPopup(position: PopupPosition, size: PopupSize, viewport: PopupSize): PopupPosition {
  const margin = 12;
  return {
    left: Math.max(margin, Math.min(position.left, viewport.width - size.width - margin)),
    top: Math.max(margin, Math.min(position.top, viewport.height - size.height - margin)),
  };
}
