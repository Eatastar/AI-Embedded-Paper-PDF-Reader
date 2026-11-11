import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import type { Annotation, Conversation, DocumentAttachment, Workspace } from './types';

export interface LocalDocumentReference { conversationId: string; document: DocumentAttachment }
export interface LocalDocumentGroup { id: string; references: LocalDocumentReference[] }
export interface RecentReadingPreferences { opened: string[]; hidden: string[] }
export const RECENT_READING_ORDER_LIMIT = 200;

export function recordRecentReading(preferences: RecentReadingPreferences, documentId: string): RecentReadingPreferences {
  if (preferences.opened[0] === documentId && !preferences.hidden.includes(documentId)) return preferences;
  return {
    opened: [documentId, ...preferences.opened.filter(id => id !== documentId)].slice(0, RECENT_READING_ORDER_LIMIT),
    hidden: preferences.hidden.filter(id => id !== documentId),
  };
}

export function setRecentReadingHidden(preferences: RecentReadingPreferences, groups: LocalDocumentGroup[], hide: boolean): RecentReadingPreferences {
  const hidden = new Set(preferences.hidden);
  // Group keys can change when duplicate files are discovered. Save the IDs
  // of the actual records represented by the row.
  for (const group of groups) for (const { document } of group.references) {
    if (hide) hidden.add(document.id);
    else hidden.delete(document.id);
  }
  return { ...preferences, hidden: [...hidden] };
}

export function recentReadingGroups(groups: LocalDocumentGroup[], preferences: RecentReadingPreferences) {
  const order = new Map(preferences.opened.map((id, index) => [id, index]));
  const hiddenIds = new Set(preferences.hidden);
  const ordered = groups.map(group => ({
    group,
    rank: group.references.reduce((best, { document }) => Math.min(best, order.get(document.id) ?? order.size), order.size),
  })).sort((a, b) => a.rank - b.rank);
  const visible: LocalDocumentGroup[] = [], hidden: LocalDocumentGroup[] = [];
  for (const { group } of ordered) {
    const destination = group.references.every(({ document }) => hiddenIds.has(document.id)) ? hidden : visible;
    destination.push(group);
  }
  return { visible, hidden };
}

export type DocumentBytesReader = (id: string) => Promise<Uint8Array | undefined>;
export const fileContentHash = (bytes: Uint8Array) => bytesToHex(sha256(bytes));
export const localDocumentReferences = (workspace: Workspace | null): LocalDocumentReference[] => (workspace?.conversations || [])
  .filter(c => c.deletedAt === undefined).flatMap(c => (c.documents || []).map(document => ({ conversationId: c.id, document })));
const checkCancelled = (signal?: AbortSignal) => { if (signal?.aborted) throw new DOMException('Library cancelled', 'AbortError'); };

/** Only equal-sized candidates need their original bytes read. Names and PDF
 * extracted text never establish identity, and no original data is deleted. */
export class LocalDocumentIndex {
  private hashes = new Map<string, { source: DocumentAttachment; value: Promise<string | null> }>();
  clear() { this.hashes.clear(); }
  remember(document: DocumentAttachment, bytes: Uint8Array) {
    if (bytes.length !== document.size) throw Error('File size differs from metadata');
    this.hashes.set(document.id, { source: document, value: Promise.resolve(fileContentHash(bytes)) });
  }
  private hash(document: DocumentAttachment, read: DocumentBytesReader) {
    const cached = this.hashes.get(document.id);
    if (cached?.source === document) return cached.value;
    const value = read(document.id).then(bytes => bytes?.length === document.size ? fileContentHash(bytes) : null).catch(() => null);
    this.hashes.set(document.id, { source: document, value }); return value;
  }
  async find(bytes: Uint8Array, kind: DocumentAttachment['kind'], refs: LocalDocumentReference[], read: DocumentBytesReader, signal?: AbortSignal) {
    const expected = fileContentHash(bytes);
    for (const ref of refs) {
      checkCancelled(signal);
      if (ref.document.kind === kind && ref.document.size === bytes.length && await this.hash(ref.document, read) === expected) { checkCancelled(signal); return ref; }
    }
    checkCancelled(signal); return null;
  }
  async group(refs: LocalDocumentReference[], read: DocumentBytesReader, signal?: AbortSignal): Promise<LocalDocumentGroup[]> {
    const ids = new Set(refs.map(ref => ref.document.id));
    for (const id of this.hashes.keys()) if (!ids.has(id)) this.hashes.delete(id);
    const counts = new Map<string, number>(), bucket = (ref: LocalDocumentReference) => `${ref.document.kind}:${ref.document.size}`;
    refs.forEach(ref => counts.set(bucket(ref), (counts.get(bucket(ref)) || 0) + 1));
    const keys = new Array<string>(refs.length); let next = 0;
    const worker = async () => {
      while (next < refs.length) {
        const index = next++, ref = refs[index]; checkCancelled(signal);
        const hash = counts.get(bucket(ref))! > 1 ? await this.hash(ref.document, read) : null;
        checkCancelled(signal); keys[index] = hash ? `${ref.document.kind}:${hash}` : `document:${ref.document.id}`;
      }
    };
    await Promise.all([worker(), worker()]);
    const groups = new Map<string, LocalDocumentGroup>();
    refs.forEach((ref, index) => { const key = keys[index]; if (!groups.has(key)) groups.set(key, { id: key, references: [] }); groups.get(key)!.references.push(ref); });
    return [...groups.values()].sort((a, b) => Math.max(...b.references.map(r => r.document.createdAt)) - Math.max(...a.references.map(r => r.document.createdAt)));
  }
}

export function conversationFileGroups(groups: LocalDocumentGroup[], conversation: Conversation): LocalDocumentGroup[] {
  const live = new Map((conversation.documents || []).map(document => [document.id, document]));
  return groups.flatMap(group => { const references = group.references.filter(ref => ref.conversationId === conversation.id && live.has(ref.document.id)).map(ref => ({ ...ref, document: live.get(ref.document.id)! })); return references.length ? [{ ...group, references }] : []; });
}
export function fileAnnotationCounter(conversations: Conversation[]) {
  const counts = new Map<string, number>();
  for (const c of conversations) if (c.deletedAt === undefined) for (const a of c.annotations) if (a.deletedAt === undefined) {
    const key = JSON.stringify([c.id, a.messageId, a.versionId]); counts.set(key, (counts.get(key) || 0) + 1);
  }
  return (refs: LocalDocumentReference[]) => [...new Set(refs.flatMap(ref => ref.document.pages.map(p => JSON.stringify([ref.conversationId, p.messageId, p.versionId]))))].reduce((sum, key) => sum + (counts.get(key) || 0), 0);
}
export const fileAnnotationCount = (refs: LocalDocumentReference[], conversations: Conversation[]) => fileAnnotationCounter(conversations)(refs);

/** Project duplicate-page identities only for display. Editing and deletion use
 * the original annotation ID; stored sources, frozen context and backups remain. */
export function projectFileAnnotations(source: DocumentAttachment, equivalents: DocumentAttachment[], annotations: Annotation[]): Annotation[] {
  const pages = new Map<string, DocumentAttachment['pages'][number]>();
  for (const document of equivalents) for (const page of document.pages) {
    const canonical = source.pages.find(p => p.pageNumber === page.pageNumber);
    if (canonical) pages.set(JSON.stringify([page.messageId, page.versionId]), canonical);
  }
  return annotations.map(annotation => {
    const page = pages.get(JSON.stringify([annotation.messageId, annotation.versionId]));
    return page && (page.messageId !== annotation.messageId || page.versionId !== annotation.versionId) ? { ...annotation, messageId: page.messageId, versionId: page.versionId } : annotation;
  });
}
