import { readerAppearance, readerPosition } from '../domain/reader';
import type { ReaderAppearance, ReaderPosition } from '../domain/reader';
interface ReaderStorage { getItem(key: string): string | null; setItem(key: string, value: string): void }
const APPEARANCE_KEY = 'learn-something.reader.appearance.v1';
const positionKey = (id: string) => 'learn-something.reader.position.v1.' + encodeURIComponent(id);
function storage(): ReaderStorage | undefined { try { return globalThis.localStorage; } catch { return undefined; } }
function read(key: string, target = storage()): unknown { try { const value = target?.getItem(key); return value ? JSON.parse(value) : null; } catch { return null; } }
function save(key: string, value: unknown, target = storage()): boolean { try { if (!target) return false; target.setItem(key, JSON.stringify(value)); return true; } catch { return false; } }
export function loadReaderAppearance(target?: ReaderStorage): ReaderAppearance { return readerAppearance(read(APPEARANCE_KEY, target)); }
export function saveReaderAppearance(appearance: ReaderAppearance, target?: ReaderStorage): boolean { return save(APPEARANCE_KEY, readerAppearance(appearance), target); }
export function loadReaderPosition(id: string, pageCount: number, kind: 'pdf' | 'text', target?: ReaderStorage): ReaderPosition { return readerPosition(read(positionKey(id), target), pageCount, kind); }
export function saveReaderPosition(id: string, position: ReaderPosition, target?: ReaderStorage): boolean { return save(positionKey(id), position, target); }
