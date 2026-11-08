import test from 'node:test';
import assert from 'node:assert/strict';
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import { acquirePdfPage, pdfBasePixelLimit, pdfRenderQueue, releasePdfDocument, retainPdfPage } from '../src/adapters/pdf-resources';
import { TextBatch } from '../src/adapters/text-batch';
import { buildDocumentSearch, searchDocument, searchDocumentAsync, SEARCH_CACHE_BYTES } from '../src/domain/reader-navigation';
import { BoundedCache } from '../src/domain/bounded-cache';
import { PdfColorProcessor } from '../src/adapters/pdf-color';
import { DEFAULT_READER_APPEARANCE } from '../src/domain/reader';
const tick = () => new Promise(resolve => setTimeout(resolve, 0));

test('a page is shared across base, detail and crop and cleaned only after all users finish', async () => {
  let cleaned = 0, loads = 0;
  const page = { cleanup() { cleaned++; return true; } } as unknown as PDFPageProxy;
  const pdf = { async getPage() { loads++; return page; } } as unknown as PDFDocumentProxy;
  const base = await acquirePdfPage(pdf, 1), crop = await acquirePdfPage(pdf, 1), releaseDetail = retainPdfPage(page);
  assert.equal(loads, 1); base.release(); crop.release(); assert.equal(cleaned, 0);
  releaseDetail(); assert.equal(cleaned, 1); releaseDetail(); base.release(); assert.equal(cleaned, 1);
  const again = await acquirePdfPage(pdf, 1); releasePdfDocument(pdf); again.release(); assert.equal(cleaned, 1);
  await assert.rejects(acquirePdfPage(pdf, 1), { name: 'AbortError' });
});

test('cancelled pending PDF acquisition releases its eventual page and all rasters share one queue', async () => {
  let resolve!: (page: PDFPageProxy) => void, cleaned = 0;
  const pdf = { getPage: () => new Promise<PDFPageProxy>(done => { resolve = done; }) } as unknown as PDFDocumentProxy;
  const controller = new AbortController(), result = acquirePdfPage(pdf, 1, controller.signal);
  controller.abort(); resolve({ cleanup() { cleaned++; } } as unknown as PDFPageProxy);
  await assert.rejects(result, { name: 'AbortError' }); assert.equal(cleaned, 1);
  const queue = pdfRenderQueue(pdf); assert.equal(queue, pdfRenderQueue(pdf));
  let live = 0, maximum = 0;
  await Promise.all(Array.from({ length: 12 }, () => queue.enqueue(async () => { maximum = Math.max(maximum, ++live); await tick(); live--; }, new AbortController().signal)));
  assert.equal(maximum, 1);
  for (const count of [1, 2, 5, 20]) assert.ok(pdfBasePixelLimit(count, true) * count <= 16_000_000);
});

test('replacing source pixels terminates the old worker immediately and allows a fresh request', async () => {
  const workers: { terminated: boolean; onmessage?: (event: any) => void; last?: any; postMessage: (value: any) => void; terminate: () => void }[] = [];
  const processor = new PdfColorProcessor(() => {
    const worker = { terminated: false, onmessage: undefined as any, last: undefined as any, postMessage(value: any) { if (value.id) this.last = value; }, terminate() { this.terminated = true; } };
    workers.push(worker); return worker as unknown as Worker;
  });
  const source = { width: 1, height: 1, data: new Uint8ClampedArray([255,255,255,255]) };
  const previous = processor.prepare(source, DEFAULT_READER_APPEARANCE); processor.release();
  assert.equal(await previous, null); assert.equal(workers[0].terminated, true);
  const next = processor.prepare(source, DEFAULT_READER_APPEARANCE);
  workers[0].onmessage?.({ data: { id: 1, ...source } });
  workers[1].onmessage?.({ data: { id: workers[1].last.id, ...source } });
  assert.deepEqual((await next)?.data, source.data); processor.dispose();
});

test('search scans a long book with bounded derived text and exact Unicode offsets', () => {
  const pages = Array.from({ length: 1500 }, (_, index) => ({ text: ('unrelated words '.repeat(200)) + '😀 ﬃ cafe\u0301', pageNumber: index + 1, messageId: `m${index}`, versionId: `v${index}` }));
  const index = buildDocumentSearch(pages), result = searchDocument(index, 'ffi');
  assert.equal(result.count, pages.length); assert.equal(result.hits.length, 200);
  for (const hit of result.hits) assert.equal(pages[hit.pageIndex].text.slice(hit.start, hit.end), 'ﬃ');
  assert.ok(index.cache.bytes <= SEARCH_CACHE_BYTES); index.cache.clear(); assert.equal(index.cache.bytes, 0);
  const cache = new BoundedCache<string, number>(10, 2); cache.set('a', 1, 5); cache.set('b', 2, 5); cache.get('a'); cache.set('c', 3, 5);
  assert.equal(cache.get('b'), undefined); assert.equal(cache.get('a'), 1); cache.set('large', 4, 11); assert.equal(cache.bytes, 10);
});

test('large-book search yields to input and cancellation prevents a stale result', async () => {
  const pages = Array.from({ length: 100 }, (_, i) => ({ pageNumber: i + 1, text: 'synthetic needle', messageId: `m${i}`, versionId: `v${i}` }));
  const index = buildDocumentSearch(pages), controller = new AbortController();
  const cancelled = searchDocumentAsync(index, 'needle', controller.signal); controller.abort();
  await assert.rejects(cancelled, { name: 'AbortError' });
  assert.deepEqual(await searchDocumentAsync(index, 'needle', new AbortController().signal), searchDocument(index, 'needle'));
});

test('stream batching preserves exact text, flushes residual text and surfaces capacity failures', async () => {
  const emitted: string[] = [], batch = new TextBatch(text => emitted.push(text), () => {}, 10000);
  const chunks = Array.from({ length: 1000 }, (_, i) => `${i}中文😀\n`); chunks.forEach(text => batch.push(text));
  assert.equal(emitted.length, 1); batch.flush(); assert.equal(emitted.join(''), chunks.join(''));
  let cancelled = false;
  const broken = new TextBatch(() => { throw Error('capacity'); }, () => { cancelled = true; }, 1);
  assert.throws(() => broken.push('first'), /capacity/); assert.throws(() => broken.flush(), /capacity/);
  assert.equal(cancelled, false, 'synchronous failures propagate directly to the caller');
  const delayed = new TextBatch(text => { if (text === 'late') throw Error('limit'); }, () => { cancelled = true; }, 5);
  delayed.push('first'); delayed.push('late'); await new Promise(resolve => setTimeout(resolve, 15));
  assert.equal(cancelled, true); assert.throws(() => delayed.check(), /limit/);
});
