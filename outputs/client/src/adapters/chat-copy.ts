import type { ChatMessage } from '../domain/types';
import { activeVersion } from '../domain/workspace';

/** Copy the displayed versions and explicit references, never hidden retries,
 * system instructions, model credentials or unrelated document context. */
export function chatTranscript(messages: readonly ChatMessage[], userLabel = 'You'): string {
  return messages.map(message => {
    const version = activeVersion(message), references = [
      ...(message.textReference ? [`[${message.textReference.label}]\n${message.textReference.text}`] : []),
      ...(message.annotationReferences || []).map(reference => `[${reference.label}]\n${reference.quote}\n${reference.mode === 'note' ? reference.note || '' : reference.question + '\n' + reference.answer}`),
    ];
    return `${message.role === 'user' ? userLabel : 'AI'}:\n${[version.content, ...references].join('\n\n')}`;
  }).join('\n\n');
}

/** Whole-history copy reads canonical text instead of mounting thousands of
 * offscreen formula/annotation components. Ordinary partial selection is native. */
export function bindCompleteChatCopy(viewport: HTMLElement, content: HTMLElement, messages: () => readonly ChatMessage[], userLabel: () => string): () => void {
  const doc = viewport.ownerDocument; let lastPointerInChat = false;
  const pointer = (event: Event) => { lastPointerInChat = Boolean(event.target && viewport.contains(event.target as Node)); };
  const copy = (event: ClipboardEvent) => {
    if (!event.clipboardData || !viewport.clientHeight) return;
    if ((event.target as Element | null)?.closest?.('input,textarea,[contenteditable="true"]')) return;
    const selection = doc.getSelection(), rows = content.querySelectorAll<HTMLElement>('[data-chat-message]');
    if (!selection?.rangeCount || selection.isCollapsed || !rows.length) return;
    const range = selection.getRangeAt(0), first = rows[0], last = rows[rows.length - 1];
    if ((!lastPointerInChat && !content.contains(range.commonAncestorContainer)) || !range.isPointInRange(first, 0) || !range.isPointInRange(last, last.childNodes.length)) return;
    event.clipboardData.setData('text/plain', chatTranscript(messages(), userLabel())); event.preventDefault();
  };
  doc.addEventListener('pointerdown', pointer, true); doc.addEventListener('copy', copy);
  return () => { doc.removeEventListener('pointerdown', pointer, true); doc.removeEventListener('copy', copy); };
}
