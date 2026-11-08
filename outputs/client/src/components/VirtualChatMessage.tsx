import { useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode, RefObject } from 'react';

/** Lightweight anchors stay in the document; Markdown/KaTeX/annotators are
 * mounted only near the viewport or while a note, translation or selection uses them. */
export function VirtualChatMessage({ id, versionId, viewport, visible, pinned, initial, estimate, children }: {
  id: string; versionId: string; viewport: RefObject<HTMLDivElement | null>;
  visible: boolean; pinned: boolean; initial: boolean; estimate: number; children: () => ReactNode;
}) {
  const element = useRef<HTMLDivElement>(null), height = useRef(estimate);
  const [near, setNear] = useState(initial);
  const active = visible && (near || pinned);
  useLayoutEffect(() => {
    const row = element.current, root = viewport.current; if (!row || !root || !visible) return;
    let intersects = initial;
    const update = () => {
      const selection = row.ownerDocument.getSelection();
      // A whole-document range also contains empty placeholders. They are not
      // selected source text and must not activate every offscreen message.
      const selected = Boolean(row.dataset.mounted && selection && !selection.isCollapsed && selection.containsNode(row, true));
      setNear(intersects || selected);
      if (selected && !intersects) row.ownerDocument.addEventListener('selectionchange', update);
      else row.ownerDocument.removeEventListener('selectionchange', update);
    };
    const observer = new IntersectionObserver(entries => { intersects = entries[0].isIntersecting; update(); }, { root, rootMargin: '1000px 0px' });
    observer.observe(row);
    return () => { observer.disconnect(); row.ownerDocument.removeEventListener('selectionchange', update); };
  }, [visible, viewport, initial]);
  useLayoutEffect(() => {
    const row = element.current; if (!row || !active) return;
    const measure = () => { if (row.offsetHeight > 0) height.current = row.offsetHeight; };
    measure(); const observer = new ResizeObserver(measure); observer.observe(row);
    return () => observer.disconnect();
  }, [active, versionId]);
  return <div ref={element} className="chat-message-slot" data-chat-message data-message-id={id} data-version-id={versionId} data-mounted={active || undefined} style={{ display: 'flow-root', ...(active ? {} : { height: height.current }) }}>{active ? children() : null}</div>;
}
