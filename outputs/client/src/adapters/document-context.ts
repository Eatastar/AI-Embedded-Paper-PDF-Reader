import type { DocumentContextMode } from '../domain/document-context';
const key = 'ai-paper-pdf-reader.document-context.v1';
export function loadDocumentContextMode(): DocumentContextMode { try { const value = localStorage.getItem(key); return value === 'full' || value === 'relevant' ? value : 'auto'; } catch { return 'auto'; } }
export function saveDocumentContextMode(mode: DocumentContextMode): boolean { try { localStorage.setItem(key, mode); return true; } catch { return false; } }
