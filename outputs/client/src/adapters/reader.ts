import { readerAppearance, readerPosition } from '../domain/reader';
import type { ReaderAppearance, ReaderPosition } from '../domain/reader';
interface ReaderStorage { getItem(key: string): string | null; setItem(key: string, value: string): void }
const APPEARANCE_KEY = 'learn-something.reader.appearance.v1';
const positionKey = (id: string, version = 2) => `learn-something.reader.position.v${version}.` + encodeURIComponent(id);
function storage(): ReaderStorage | undefined { try { return globalThis.localStorage; } catch { return undefined; } }
function read(key: string, target = storage()): unknown { try { const value = target?.getItem(key); return value ? JSON.parse(value) : null; } catch { return null; } }
function save(key: string, value: unknown, target = storage()): boolean { try { if (!target) return false; target.setItem(key, JSON.stringify(value)); return true; } catch { return false; } }
export function loadReaderAppearance(target?: ReaderStorage): ReaderAppearance { return readerAppearance(read(APPEARANCE_KEY, target)); }
export function saveReaderAppearance(appearance: ReaderAppearance, target?: ReaderStorage): boolean { return save(APPEARANCE_KEY, readerAppearance(appearance), target); }
export function loadReaderPosition(id: string, pageCount: number, kind: import('../domain/types').DocumentKind, target?: ReaderStorage): ReaderPosition {
  const current = read(positionKey(id), target);
  if (current !== null) {
    const parsed = readerPosition(current, pageCount, kind);
    return kind === 'pdf' && !parsed.layout ? { ...parsed, layout: 'continuous', pageOffset: 0 } : parsed;
  }
  const legacy = readerPosition(read(positionKey(id, 1), target), pageCount, kind);
  // The earlier reader defaulted to a single page, including saved preferences.
  // Adopt scrolling once; later explicit choices persist in v2. Keep v1 intact.
  return kind === 'pdf' ? { ...legacy, layout: 'continuous', pageOffset: legacy.layout === 'continuous' ? legacy.pageOffset || 0 : legacy.scrollY } : legacy;
}
export function saveReaderPosition(id: string, position: ReaderPosition, target?: ReaderStorage): boolean { return save(positionKey(id), position, target); }
