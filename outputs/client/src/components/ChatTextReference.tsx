import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MessageSquareQuote, X } from 'lucide-react';
import type { ChatTextReference } from '../domain/types';
import type { ChatTextSelection } from '../domain/chat-text-reference';
import { t } from '../i18n/locale';
import { useLocale } from '../i18n/react';
import './chat-text-reference.css';

const ChatTextContext = createContext<{ enabled: boolean; quote: (selection: ChatTextSelection) => void } | null>(null);
export const ChatTextReferenceProvider = ChatTextContext.Provider;
export const useChatTextReference = () => useContext(ChatTextContext);

export function ChatTextReferencePreview({ reference, onRemove }: { reference: ChatTextReference; onRemove?: () => void }) {
  useLocale();
  return <aside className="chat-text-reference" aria-label={t(onRemove ? '待发送的文字引用' : '已发送的文字引用')}>
    <div><MessageSquareQuote size={13} /><strong>{t('引用文字')}</strong><span title={reference.label}>{reference.label === 'AI 回答' || reference.label === '聊天问题' ? t(reference.label) : reference.label}</span>{onRemove && <button type="button" className="icon-button" aria-label={t('取消文字引用')} title={t('取消文字引用')} onClick={onRemove}><X size={14} /></button>}</div>
    <blockquote>{reference.text}</blockquote>
  </aside>;
}

/** User messages get a quote action, while annotations remain on AI/PDF text. */
export function ChatQuestionText({ selection, children }: { selection: Omit<ChatTextSelection, 'text'>; children: string }) {
  useLocale(); const actions = useChatTextReference();
  const content = useRef<HTMLSpanElement>(null), button = useRef<HTMLButtonElement>(null);
  const [draft, setDraft] = useState<{ text: string; left: number; top: number } | null>(null);
  const readSelection = () => {
    const current = window.getSelection();
    if (!actions?.enabled || !current?.rangeCount || current.isCollapsed) return false;
    const range = current.getRangeAt(0), text = range.toString().trim();
    if (!text || !content.current?.contains(range.startContainer) || !content.current.contains(range.endContainer)) return false;
    const rect = range.getBoundingClientRect();
    setDraft({ text, left: Math.max(8, Math.min(innerWidth - 150, rect.left)), top: Math.max(8, rect.top - 40) });
    return true;
  };
  useEffect(() => {
    if (!draft) return;
    const dismiss = (event: PointerEvent) => { if (event.target instanceof Node && !button.current?.contains(event.target)) setDraft(null); };
    const change = () => { if (window.getSelection()?.isCollapsed) setDraft(null); };
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape' && !event.defaultPrevented) { event.preventDefault(); setDraft(null); } };
    document.addEventListener('pointerdown', dismiss); document.addEventListener('selectionchange', change); document.addEventListener('keydown', key);
    return () => { document.removeEventListener('pointerdown', dismiss); document.removeEventListener('selectionchange', change); document.removeEventListener('keydown', key); };
  }, [draft]);
  return <><span ref={content} className="chat-question-text" onPointerUp={event => { if (event.button === 0) readSelection(); }} onContextMenu={event => { if (readSelection()) event.preventDefault(); }}>{children}</span>{draft && actions?.enabled && createPortal(<button ref={button} type="button" className="chat-text-selection" style={{ left: draft.left, top: draft.top }} onPointerDown={event => event.preventDefault()} onClick={() => { actions.quote({ ...selection, text: draft.text }); setDraft(null); window.getSelection()?.removeAllRanges(); }}><MessageSquareQuote size={15} />{t('引用到聊天')}</button>, document.body)}</>;
}
