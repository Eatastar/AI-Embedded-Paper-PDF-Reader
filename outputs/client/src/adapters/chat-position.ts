export interface ChatPosition {
  scrollTop: number;
  atBottom: boolean;
  anchor?: { messageId: string; versionId: string; messageIndex: number; blockIndex: number; offset: number; fraction: number | null };
}
interface PositionStorage { getItem(key: string): string | null; setItem(key: string, value: string): void }
const PREFIX = 'learn-something.chat.position.v1.';
const key = (id: string) => PREFIX + encodeURIComponent(id);
const validId = (id: unknown): id is string => typeof id === 'string' && id.trim().length > 0 && id.length <= 200;
const finite = (n: unknown, min: number, max: number): n is number => typeof n === 'number' && Number.isFinite(n) && n >= min && n <= max;
function local(): Storage | undefined { try { return globalThis.localStorage; } catch { return undefined; } }

/** Position metadata only: never store message text, document text or credentials. */
export function chatPosition(value: unknown): ChatPosition | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  if (!finite(v.scrollTop, 0, 1e9) || typeof v.atBottom !== 'boolean') return null;
  const result: ChatPosition = { scrollTop: v.scrollTop, atBottom: v.atBottom };
  const a = v.anchor as Record<string, unknown> | undefined;
  if (a && validId(a.messageId) && validId(a.versionId) && finite(a.messageIndex, 0, 1e6) && Number.isInteger(a.messageIndex) && finite(a.blockIndex, -1, 1e6) && Number.isInteger(a.blockIndex) && finite(a.offset, -1e9, 1e9) && (a.fraction === null || finite(a.fraction, 0, 1))) {
    result.anchor = { messageId: a.messageId, versionId: a.versionId, messageIndex: a.messageIndex, blockIndex: a.blockIndex, offset: a.offset, fraction: a.fraction };
  }
  return result;
}
export function loadChatPosition(id: string, target: PositionStorage | undefined = local()): ChatPosition | null {
  if (!validId(id)) return null;
  try { return chatPosition(JSON.parse(target?.getItem(key(id)) || 'null')); } catch { return null; }
}
export function saveChatPosition(id: string, position: ChatPosition, target: PositionStorage | undefined = local()): boolean {
  const clean = chatPosition(position);
  if (!validId(id) || !clean || !target) return false;
  try { target.setItem(key(id), JSON.stringify(clean)); return true; } catch { return false; }
}
export function pruneChatPositions(ids: readonly string[], target: Storage | undefined = local()): void {
  if (!target) return;
  try {
    const keep = new Set(ids.filter(validId).map(key));
    const stale: string[] = [];
    for (let i = 0; i < target.length; i++) { const k = target.key(i); if (k?.startsWith(PREFIX) && !keep.has(k)) stale.push(k); }
    for (const k of stale) target.removeItem(k);
  } catch { /* Reading also works when preference storage is unavailable. */ }
}

const MESSAGE = '[data-chat-message]';
const BLOCK = '.chat-question-text, .annotation-markdown :is(p, h1, h2, h3, h4, h5, h6, li, pre, table, blockquote)';
const messages = (viewport: HTMLElement) => [...viewport.querySelectorAll<HTMLElement>(MESSAGE)];
const blocks = (message: HTMLElement) => [...message.querySelectorAll<HTMLElement>(BLOCK)];
export function captureChatPosition(viewport: HTMLElement): ChatPosition | null {
  if (viewport.clientHeight <= 0 || viewport.clientWidth <= 0) return null;
  const scrollTop = Math.max(0, viewport.scrollTop);
  const result: ChatPosition = { scrollTop, atBottom: viewport.scrollHeight - viewport.clientHeight - scrollTop <= 16 };
  const top = viewport.getBoundingClientRect().top;
  const list = messages(viewport), messageIndex = list.findIndex(el => el.getBoundingClientRect().bottom > top + 4);
  const message = list[messageIndex];
  if (!message) return result;
  const listBlocks = blocks(message), blockIndex = listBlocks.findIndex(el => el.getBoundingClientRect().bottom > top + 4);
  const rect = (listBlocks[blockIndex] || message).getBoundingClientRect();
  const offset = rect.top - top;
  result.anchor = { messageId: message.dataset.messageId!, versionId: message.dataset.versionId!, messageIndex, blockIndex, offset,
    fraction: offset < 0 && rect.height > 0 ? Math.min(1, -offset / rect.height) : null };
  return result;
}
export function restoreChatPosition(viewport: HTMLElement, position: ChatPosition): boolean {
  if (viewport.clientHeight <= 0 || viewport.clientWidth <= 0) return false;
  let target = position.scrollTop;
  if (position.atBottom) target = viewport.scrollHeight;
  else if (position.anchor) {
    const a = position.anchor, list = messages(viewport);
    const message = list.find(el => el.dataset.messageId === a.messageId);
    if (message && message.dataset.versionId === a.versionId) {
      const rect = (blocks(message)[a.blockIndex] || message).getBoundingClientRect();
      const offset = a.fraction === null ? a.offset : -a.fraction * rect.height;
      target = viewport.scrollTop + rect.top - viewport.getBoundingClientRect().top - offset;
    } else {
      const nearby = message || list[Math.min(a.messageIndex, list.length - 1)];
      if (nearby) target = viewport.scrollTop + nearby.getBoundingClientRect().top - viewport.getBoundingClientRect().top;
    }
  }
  viewport.scrollTop = Math.max(0, Math.min(target, Math.max(0, viewport.scrollHeight - viewport.clientHeight)));
  return true;
}
