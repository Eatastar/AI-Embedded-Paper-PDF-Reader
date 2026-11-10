import type { Annotation, DocumentAttachment, DocumentPage } from './types';
import { BoundedCache } from './bounded-cache';

export interface SearchText { text: string; starts: Uint32Array; ends: Uint32Array }
export interface SearchHit { key: string; pageIndex: number; pageNumber: number; ordinal: number; start: number; end: number; before: string; quote: string; after: string }
export interface SearchFocus { pageIndex: number; ordinal: number; query: string; request: number }
export interface OutlineEntry { key: string; title: string; depth: number; pageIndex: number | null; href?: string }
export interface DocumentNote { annotation: Annotation; pageIndex: number; pageNumber: number }

/** A search-only representation. Original text, DOM and annotation offsets never
 * change. Each normalized UTF-16 unit maps back to a whole original character. */
function* searchSegments(source: string) {
  for (const match of source.matchAll(/\P{M}\p{M}*|\p{M}+/gu)) {
    const value = match[0], start = match.index, end = start + value.length;
    if (/^[\s\u00ad\u200b\ufeff]+$/u.test(value)) continue;
    if (/^[-\u2010\u2011]$/u.test(value) && /\p{L}$/u.test(source.slice(Math.max(0, start - 2), start)) && /^\s*\p{L}/u.test(source.slice(end))) continue;
    yield { text: value.normalize('NFKC').toLowerCase(), start, end };
  }
}
export function normalizeSearchText(source: string, offsets = true): SearchText {
  const chunks: string[] = [], starts: number[] = [], ends: number[] = []; let block = '';
  for (const part of searchSegments(source)) {
    block += part.text; if (block.length >= 4096) { chunks.push(block); block = ''; }
    if (offsets) for (let i = 0; i < part.text.length; i++) { starts.push(part.start); ends.push(part.end); }
  }
  chunks.push(block);
  return { text: chunks.join(''), starts: new Uint32Array(starts), ends: new Uint32Array(ends) };
}
export const foldSearchText = (value: string) => normalizeSearchText(value, false).text;
export const SEARCH_CACHE_BYTES = 8 * 1024 * 1024;
const searchEncoder = new TextEncoder(), searchDecoder = new TextDecoder();
export function buildDocumentSearch(pages: DocumentPage[]) { return { pages, cache: new BoundedCache<DocumentPage, Uint8Array>(SEARCH_CACHE_BYTES, 5000) }; }
export function searchDocument(index: ReturnType<typeof buildDocumentSearch>, query: string, maximum = 200, from = 0, to = index.pages.length) {
  const term = foldSearchText(query), hits: SearchHit[] = []; let count = 0;
  if (!term) return { hits, count };
  for (let pageIndex = from; pageIndex < to; pageIndex++) {
    const page = index.pages[pageIndex], cached = index.cache.get(page);
    const text = cached ? searchDecoder.decode(cached) : foldSearchText(page.text);
    if (!cached) { const bytes = searchEncoder.encode(text); index.cache.set(page, bytes, bytes.byteLength); }
    let at = 0, ordinal = 0;
    const matches: { at: number; ordinal: number; start: number; end: number }[] = [];
    while ((at = text.indexOf(term, at)) >= 0) {
      count++;
      if (hits.length + matches.length < maximum) matches.push({ at, ordinal, start: 0, end: 0 });
      ordinal++; at += term.length;
    }
    // Map only actual hits back to original offsets: no two arrays per book character.
    let offset = 0, next = 0;
    for (const part of matches.length ? searchSegments(page.text) : []) {
      const endOffset = offset + part.text.length;
      while (next < matches.length) {
        const match = matches[next];
        if (match.at >= offset && match.at < endOffset) match.start = part.start;
        if (match.at + term.length > endOffset) break;
        match.end = part.end; next++;
      }
      offset = endOffset; if (next === matches.length) break;
    }
    for (const { start, end, ordinal } of matches) {
        let a = Math.max(0, start - 34), b = Math.min(page.text.length, end + 45);
        if (/[\udc00-\udfff]/u.test(page.text[a] || '')) a--;
        if (/[\ud800-\udbff]/u.test(page.text[b - 1] || '')) b++;
        hits.push({ key: `${pageIndex}:${start}:${end}`, pageIndex, pageNumber: page.pageNumber, ordinal, start, end, before: (a ? '…' : '') + page.text.slice(a, start), quote: page.text.slice(start, end), after: page.text.slice(end, b) + (b < page.text.length ? '…' : '') });
    }
  }
  return { hits, count };
}
export async function searchDocumentAsync(index: ReturnType<typeof buildDocumentSearch>, query: string, signal: AbortSignal, maximum = 200) {
  const hits: SearchHit[] = []; let count = 0;
  for (let from = 0; from < index.pages.length; from += 16) {
    signal.throwIfAborted();
    const result = searchDocument(index, query, Math.max(0, maximum - hits.length), from, Math.min(index.pages.length, from + 16));
    hits.push(...result.hits); count += result.count;
    if (from + 16 < index.pages.length) await new Promise(resolve => setTimeout(resolve, 0));
  }
  signal.throwIfAborted(); return { hits, count };
}
export function documentNotes(source: DocumentAttachment, annotations: Annotation[]): DocumentNote[] {
  const key = (message: string, version: string) => JSON.stringify([message, version]);
  const pages = new Map(source.pages.map((page, pageIndex) => [key(page.messageId, page.versionId), { pageIndex, pageNumber: page.pageNumber }]));
  return annotations.flatMap(annotation => {
    const page = pages.get(key(annotation.messageId, annotation.versionId));
    return page && annotation.deletedAt === undefined ? [{ annotation, ...page }] : [];
  }).sort((a, b) => a.pageIndex - b.pageIndex || a.annotation.createdAt - b.annotation.createdAt);
}
export function filterDocumentNotes(notes: DocumentNote[], kind: 'all' | 'ask' | 'note', pageIndex: number | null, query: string) {
  const term = foldSearchText(query);
  return notes.filter(({ annotation: a, pageIndex: page }) => (kind === 'all' || (a.mode === 'note' ? 'note' : 'ask') === kind) && (pageIndex === null || pageIndex === page) && (!term || foldSearchText([a.quote, a.question, a.answer, a.note, a.reask?.question, a.reask?.answer].filter(Boolean).join('\n')).includes(term)));
}
export function activeReaderPage(rects: { pageIndex: number; top: number; bottom: number }[], focus: number) {
  if (!rects.length) return 0;
  const containing = rects.find(rect => rect.top <= focus && rect.bottom >= focus);
  return (containing || rects.reduce((best, next) => Math.min(Math.abs(next.top - focus), Math.abs(next.bottom - focus)) < Math.min(Math.abs(best.top - focus), Math.abs(best.bottom - focus)) ? next : best)).pageIndex;
}

/** Sorted page slots allow scroll tracking without measuring thousands of DOM nodes every frame. */
export function readerPageAtFocus(count: number, rectAt: (index: number) => { top: number; bottom: number }, focus: number): number {
  if (!count) return 0;
  let low = 0, high = count - 1;
  while (low < high) { const middle = (low + high) >>> 1; if (rectAt(middle).bottom < focus) low = middle + 1; else high = middle; }
  if (!low) return 0;
  const current = rectAt(low), previous = rectAt(low - 1);
  return current.top <= focus || Math.abs(current.top - focus) < Math.abs(previous.bottom - focus) ? low : low - 1;
}
