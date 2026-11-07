import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactNode, RefObject } from 'react';
import { constrainPopup, resizePopup } from './popup-position';
import type { PopupPosition, PopupRect, ResizeEdge } from './popup-position';
import { t } from '../i18n/locale';
import { useLocale } from '../i18n/react';

interface Props {
  popupRef: RefObject<HTMLDivElement | null>;
  style: CSSProperties;
  children: ReactNode;
  onUserMoveOrResize?: () => void;
  resetLayoutKey?: number;
}

/** Only the title bar moves the card; its contents remain normal selectable text. */
export function MovableAnnotationPopup({ popupRef, style, children, onUserMoveOrResize, resetLayoutKey }: Props) {
  useLocale();
  const [position, setPosition] = useState<PopupPosition | null>(null);
  const [dragging, setDragging] = useState(false);
  const [resized, setResized] = useState<PopupRect | null>(null), [resizing, setResizing] = useState<ResizeEdge | null>(null);
  const resizeRef = useRef<{ edge: ResizeEdge; startX: number; startY: number; rect: PopupRect; announced: boolean } | null>(null);
  const positionRef = useRef<PopupPosition | null>(null);
  const dragRef = useRef<{ pointerId: number; offsetX: number; offsetY: number; startX: number; startY: number; announced: boolean } | null>(null);
  useLayoutEffect(() => {
    if (resetLayoutKey === undefined) return;
    positionRef.current = null; dragRef.current = null; resizeRef.current = null;
    setPosition(null); setResized(null); setDragging(false); setResizing(null);
  }, [resetLayoutKey]);

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
    const fitWindow = () => {
      setResized(previous => previous ? resizePopup({ ...previous, ...(positionRef.current || {}) }, 'se', { left: 0, top: 0 }, { width: innerWidth, height: innerHeight }) : null);
      keepVisible();
    };
    const observer = new ResizeObserver(keepVisible);
    if (popupRef.current) observer.observe(popupRef.current);
    window.addEventListener('resize', fitWindow);
    return () => { observer.disconnect(); window.removeEventListener('resize', fitWindow); };
  }, [popupRef]);

  const startDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || !event.isPrimary || !(event.target instanceof Element)) return;
    if (!event.target.closest('.annotation-card-header') || event.target.closest('button, a, input, textarea, select, [contenteditable="true"]')) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    dragRef.current = { pointerId: event.pointerId, offsetX: event.clientX - bounds.left, offsetY: event.clientY - bounds.top, startX: event.clientX, startY: event.clientY, announced: false };
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
    className={`annotation-popup${dragging ? ' annotation-popup-dragging' : ''}${resized ? ' annotation-popup-resized' : ''}${resizing ? ' annotation-popup-resizing resize-' + resizing : ''}`}
    style={{ ...style, ...(resized ? { left: resized.left, top: resized.top, width: resized.width, height: resized.height, maxHeight: resized.height } : {}), ...(position || {}) }}
    onPointerDown={startDrag}
    onPointerMove={(event) => {
      const drag = dragRef.current;
      if (drag?.pointerId === event.pointerId) {
        if (!drag.announced && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) >= 3) { drag.announced = true; onUserMoveOrResize?.(); }
        moveTo({ left: event.clientX - drag.offsetX, top: event.clientY - drag.offsetY });
      }
    }}
    onPointerUp={finishDrag}
    onPointerCancel={finishDrag}
    onLostPointerCapture={() => { dragRef.current = null; setDragging(false); }}
    onKeyDown={(event) => {
      if (!(event.target instanceof Element) || !event.target.matches('.annotation-card-header')) return;
      const direction = ({ ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] } as Record<string, number[]>)[event.key];
      if (!direction) return;
      event.preventDefault();
      onUserMoveOrResize?.();
      const bounds = event.currentTarget.getBoundingClientRect();
      const step = event.shiftKey ? 30 : 10;
      moveTo({ left: bounds.left + direction[0] * step, top: bounds.top + direction[1] * step });
    }}
  >{children}{(['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'] as ResizeEdge[]).map(edge => <button key={edge} type="button" className={`annotation-resize-handle resize-${edge}`} aria-label={t('调整批注框大小：{0}', [edge])} title={t('拖动调整大小，双击恢复')} onPointerDown={event => {
    if (event.button !== 0) return; event.preventDefault(); event.stopPropagation();
    const r = popupRef.current!.getBoundingClientRect(); resizeRef.current = { edge, startX: event.clientX, startY: event.clientY, rect: { left: r.left, top: r.top, width: r.width, height: r.height }, announced: false };
    setResizing(edge); event.currentTarget.setPointerCapture(event.pointerId);
  }} onPointerMove={event => {
    const start = resizeRef.current; if (!start || start.edge !== edge) return;
    if (!start.announced && Math.hypot(event.clientX - start.startX, event.clientY - start.startY) >= 3) { start.announced = true; onUserMoveOrResize?.(); }
    const next = resizePopup(start.rect, edge, { left: event.clientX - start.startX, top: event.clientY - start.startY }, { width: innerWidth, height: innerHeight });
    positionRef.current = { left: next.left, top: next.top }; setPosition(positionRef.current); setResized(next);
  }} onPointerUp={event => { resizeRef.current = null; setResizing(null); if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }} onPointerCancel={() => { resizeRef.current = null; setResizing(null); }} onLostPointerCapture={() => { resizeRef.current = null; setResizing(null); }} onDoubleClick={event => { event.preventDefault(); setResized(null); }} onKeyDown={event => {
    const delta = ({ ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] } as Record<string, number[]>)[event.key];
    if (!delta) return; event.preventDefault(); event.stopPropagation(); const r = popupRef.current!.getBoundingClientRect(), step = event.shiftKey ? 30 : 10;
    onUserMoveOrResize?.();
    const next = resizePopup({ left: r.left, top: r.top, width: r.width, height: r.height }, edge, { left: delta[0] * step, top: delta[1] * step }, { width: innerWidth, height: innerHeight });
    positionRef.current = { left: next.left, top: next.top }; setPosition(positionRef.current); setResized(next);
  }} />)}</div>;
}
