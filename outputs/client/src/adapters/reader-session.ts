interface ReaderSession { conversationId: string; documentId: string }
const KEY = 'learn-something.reader.session.v1';
export function loadReaderSession(): ReaderSession | null {
  try { const value = JSON.parse(localStorage.getItem(KEY) || 'null'); return value && typeof value.conversationId === 'string' && typeof value.documentId === 'string' ? value : null; } catch { return null; }
}
export function saveReaderSession(value: ReaderSession | null) { try { localStorage.setItem(KEY, JSON.stringify(value)); } catch { /* Reading remains usable with session-only preferences. */ } }
