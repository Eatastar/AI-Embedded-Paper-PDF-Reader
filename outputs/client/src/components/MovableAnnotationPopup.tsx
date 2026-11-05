import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactNode, RefObject } from 'react';
import { constrainPopup } from './popup-position';
import type { PopupPosition } from './popup-position';

interface Props {
  popupRef: RefObject<HTMLDivElement | null>;
  style: CSSProperties;
  children: ReactNode;
}

/** Only the title bar moves the card; its contents remain normal selectable text. */
export function MovableAnnotationPopup({ popupRef, style, children }: Props) {
  const [position, setPosition] = useState<PopupPosition | null>(null);
  const [dragging, setDragging] = useState(false);
  const positionRef = useRef<PopupPosition | null>(null);
  const dragRef = useRef<{ pointerId: number; offsetX: number; offsetY: number } | null>(null);

  const moveTo = (next: PopupPosition) => {
    const element = popupRef.current;
    if (!element) return;
    const bounds = element.getBoundingClientRect();
    const limited = constrainPopup(next, bounds, { width: window.innerWidth, height: window.innerHeight });
    const previous = positionRef.current;
    if (previous?.left === limited.left && previous.top === limited.top) return;
    positionRef.current = limited;
    setPosition(limited);
  };
  const moveRef = useRef(moveTo);
  moveRef.current = moveTo;

  useEffect(() => {
    const keepVisible = () => { if (positionRef.current) moveRef.current(positionRef.current); };
    const observer = new ResizeObserver(keepVisible);
    if (popupRef.current) observer.observe(popupRef.current);
    window.addEventListener('resize', keepVisible);
    return () => { observer.disconnect(); window.removeEventListener('resize', keepVisible); };
  }, [popupRef]);

  const startDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || !event.isPrimary || !(event.target instanceof Element)) return;
    if (!event.target.closest('.annotation-card-header') || event.target.closest('button, a, input, textarea, select, [contenteditable="true"]')) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    dragRef.current = { pointerId: event.pointerId, offsetX: event.clientX - bounds.left, offsetY: event.clientY - bounds.top };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
    moveTo({ left: bounds.left, top: bounds.top });
    setDragging(true);
  };
  const finishDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  return <div
    ref={popupRef}
    className={`annotation-popup${dragging ? ' annotation-popup-dragging' : ''}`}
    style={{ ...style, ...(position || {}) }}
    onPointerDown={startDrag}
    onPointerMove={(event) => {
      const drag = dragRef.current;
      if (drag?.pointerId === event.pointerId) moveTo({ left: event.clientX - drag.offsetX, top: event.clientY - drag.offsetY });
    }}
    onPointerUp={finishDrag}
    onPointerCancel={finishDrag}
    onLostPointerCapture={() => { dragRef.current = null; setDragging(false); }}
    onKeyDown={(event) => {
      if (!(event.target instanceof Element) || !event.target.matches('.annotation-card-header')) return;
      const direction = ({ ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] } as Record<string, number[]>)[event.key];
      if (!direction) return;
      event.preventDefault();
      const bounds = event.currentTarget.getBoundingClientRect();
      const step = event.shiftKey ? 30 : 10;
      moveTo({ left: bounds.left + direction[0] * step, top: bounds.top + direction[1] * step });
    }}
  >{children}</div>;
}
