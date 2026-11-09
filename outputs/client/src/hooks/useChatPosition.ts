import { useLayoutEffect, useRef } from 'react';
import { captureChatPosition, loadChatPosition, restoreChatPosition, saveChatPosition } from '../adapters/chat-position';

/** Preserve reading anchors without competing with an explicit new question. */
export function useChatPosition(conversationId: string, visible: boolean, running: boolean, onAtBottom: (value: boolean) => void) {
  const viewportRef = useRef<HTMLDivElement>(null), contentRef = useRef<HTMLDivElement>(null);
  const control = useRef<{ visibility: (value: boolean) => void; run: () => void; bottom: () => void; jump: (id: string) => void } | null>(null);
  const runningRef = useRef(running); runningRef.current = running;
  const visibleRef = useRef(visible); visibleRef.current = visible;
  useLayoutEffect(() => {
    const viewport = viewportRef.current, content = contentRef.current;
    if (!viewport || !content) return;
    let held = loadChatPosition(conversationId) || { scrollTop: 0, atBottom: true };
    let pending = true, disposed = false, frame = 0, timer: ReturnType<typeof setTimeout> | undefined;
    let width = 0;
    const readable = () => visibleRef.current && viewport.clientHeight > 0 && viewport.clientWidth > 0;
    const status = () => { if (readable()) onAtBottom(viewport.scrollHeight - viewport.clientHeight - viewport.scrollTop < 160); };
    const remember = () => { if (!readable() || pending) return; const next = captureChatPosition(viewport); if (next) held = next; };
    const write = () => { clearTimeout(timer); remember(); saveChatPosition(conversationId, held); };
    const restore = () => {
      frame = 0;
      if (!readable()) return;
      const resized = width !== viewport.clientWidth;
      width = viewport.clientWidth;
      if (pending || (resized && !runningRef.current)) restoreChatPosition(viewport, held);
      status();
    };
    const schedule = () => { if (!disposed && !frame) frame = requestAnimationFrame(restore); };
    const intent = (event: Event) => {
      if (event instanceof KeyboardEvent && (!['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(event.key) || (event.target instanceof Element && event.target.closest('input,textarea,select,[contenteditable="true"]')))) return;
      pending = false;
    };
    const scroll = () => {
      if (!readable()) return;
      status(); if (pending) return;
      remember(); clearTimeout(timer); timer = setTimeout(write, 180);
    };
    const save = () => { if (pending && readable()) restoreChatPosition(viewport, held); write(); };
    const observer = new ResizeObserver(schedule); observer.observe(viewport); observer.observe(content);
    for (const type of ['wheel', 'pointerdown', 'touchstart', 'keydown']) viewport.addEventListener(type, intent, { passive: true });
    viewport.addEventListener('scroll', scroll, { passive: true });
    viewport.addEventListener('load', schedule, true);
    document.fonts?.addEventListener('loadingdone', schedule);
    document.fonts?.ready.then(() => { if (!disposed) schedule(); });
    document.addEventListener('learn:save-edits', save); window.addEventListener('pagehide', save);
    control.current = {
      visibility: value => { if (value) { pending = true; restore(); schedule(); } else { clearTimeout(timer); saveChatPosition(conversationId, held); } },
      run: () => { pending = false; },
      jump: id => {
        const rows = [...viewport.querySelectorAll<HTMLElement>('[data-chat-message]')];
        const index = rows.findIndex(row => row.dataset.messageId === id), row = rows[index];
        if (!row) return;
        held = { scrollTop: viewport.scrollTop, atBottom: false, anchor: { messageId: id, versionId: row.dataset.versionId!, messageIndex: index, blockIndex: -1, offset: 8, fraction: null } };
        pending = true; saveChatPosition(conversationId, held); restore(); schedule();
      },
      bottom: () => { pending = false; held = { scrollTop: viewport.scrollHeight, atBottom: true }; saveChatPosition(conversationId, held); viewport.scrollTo({ top: viewport.scrollHeight, behavior: 'smooth' }); },
    };
    restore(); schedule();
    return () => {
      save(); disposed = true; clearTimeout(timer); cancelAnimationFrame(frame); observer.disconnect();
      for (const type of ['wheel', 'pointerdown', 'touchstart', 'keydown']) viewport.removeEventListener(type, intent);
      viewport.removeEventListener('scroll', scroll); viewport.removeEventListener('load', schedule, true);
      document.fonts?.removeEventListener('loadingdone', schedule);
      document.removeEventListener('learn:save-edits', save); window.removeEventListener('pagehide', save); control.current = null;
    };
  }, [conversationId, onAtBottom]);
  useLayoutEffect(() => { control.current?.visibility(visible); }, [visible]);
  useLayoutEffect(() => { if (running) control.current?.run(); }, [running]);
  return { viewportRef, contentRef, onSend: () => control.current?.run(), scrollToBottom: () => control.current?.bottom(), scrollToMessage: (id: string) => control.current?.jump(id) };
}
