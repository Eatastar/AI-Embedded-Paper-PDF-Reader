import type { Annotation, DocumentAttachment, DocumentPage } from './types';

export interface SearchText { text: string; starts: Uint32Array; ends: Uint32Array }
export interface SearchHit { key: string; pageIndex: number; pageNumber: number; ordinal: number; start: number; end: number; before: string; quote: string; after: string }
export interface SearchFocus { pageIndex: number; ordinal: number; query: string; request: number }
export interface OutlineEntry { key: string; title: string; depth: number; pageIndex: number | null }
export interface DocumentNote { annotation: Annotation; pageIndex: number; pageNumber: number }

/** A search-only representation. Original text, DOM and annotation offsets never
 * change. Each normalized UTF-16 unit maps back to a whole original character. */
export function normalizeSearchText(source: string, offsets = true): SearchText {
  const chunks: string[] = [], starts: number[] = [], ends: number[] = [];
  for (const match of source.matchAll(/\P{M}\p{M}*|\p{M}+/gu)) {
    const value = match[0], start = match.index, end = start + value.length;
    if (/^[\s\u00ad\u200b\ufeff]+$/u.test(value)) continue;
    if (/^[-\u2010\u2011]$/u.test(value) && /\p{L}$/u.test(source.slice(Math.max(0, start - 2), start)) && /^\s*\p{L}/u.test(source.slice(end))) continue;
    const normalized = value.normalize('NFKC').toLowerCase(); chunks.push(normalized);
    if (offsets) for (let i = 0; i < normalized.length; i++) { starts.push(start); ends.push(end); }
  }
  return { text: chunks.join(''), starts: new Uint32Array(starts), ends: new Uint32Array(ends) };
}
export const foldSearchText = (value: string) => normalizeSearchText(value, false).text;
export function buildDocumentSearch(pages: DocumentPage[]) { return pages.map(page => ({ page, normalized: normalizeSearchText(page.text) })); }
export function searchDocument(index: ReturnType<typeof buildDocumentSearch>, query: string, maximum = 200) {
  const term = foldSearchText(query), hits: SearchHit[] = []; let count = 0;
  if (!term) return { hits, count };
  index.forEach(({ page, normalized }, pageIndex) => {
    let at = 0, ordinal = 0;
    while ((at = normalized.text.indexOf(term, at)) >= 0) {
      count++;
      if (hits.length < maximum) {
        const start = normalized.starts[at], end = normalized.ends[at + term.length - 1];
        let a = Math.max(0, start - 34), b = Math.min(page.text.length, end + 45);
        if (/[\udc00-\udfff]/u.test(page.text[a] || '')) a--;
        if (/[\ud800-\udbff]/u.test(page.text[b - 1] || '')) b++;
        hits.push({ key: `${pageIndex}:${start}:${end}`, pageIndex, pageNumber: page.pageNumber, ordinal, start, end, before: (a ? '…' : '') + page.text.slice(a, start), quote: page.text.slice(start, end), after: page.text.slice(end, b) + (b < page.text.length ? '…' : '') });
      }
      ordinal++; at += term.length;
    }
  });
  return { hits, count };
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
