export interface ReaderSession { conversationId: string; documentId: string; mode?: 'focused' | 'split' | 'closed' }
const KEY = 'learn-something.reader.session.v1';
export function loadReaderSession(storage?: Pick<Storage, 'getItem'>): ReaderSession | null {
  try {
    const value = JSON.parse((storage || localStorage).getItem(KEY) || 'null');
    if (!value || typeof value.conversationId !== 'string' || !value.conversationId.trim() || value.conversationId.length > 200 || typeof value.documentId !== 'string' || !value.documentId.trim() || value.documentId.length > 200) return null;
    return { conversationId: value.conversationId, documentId: value.documentId, ...(['focused', 'split', 'closed'].includes(value.mode) ? { mode: value.mode } : {}) };
  } catch { return null; }
}
export function saveReaderSession(value: ReaderSession | null, storage?: Pick<Storage, 'setItem'>) { try { (storage || localStorage).setItem(KEY, JSON.stringify(value)); } catch { /* Reading remains usable with session-only preferences. */ } }
