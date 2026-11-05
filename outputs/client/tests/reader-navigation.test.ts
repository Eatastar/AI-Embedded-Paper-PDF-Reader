import assert from 'node:assert/strict';
import test from 'node:test';
import type { Annotation, DocumentAttachment, DocumentPage } from '../src/domain/types';
import { activeReaderPage, buildDocumentSearch, documentNotes, filterDocumentNotes, normalizeSearchText, searchDocument } from '../src/domain/reader-navigation';
import { readerPosition } from '../src/domain/reader';
import { loadReaderPosition, saveReaderPosition } from '../src/adapters/reader';
import { PdfRenderQueue, readPdfOutline } from '../src/adapters/pdf-navigation';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { readerAnnotationRange } from '../src/adapters/reader-location';

const pages = (...texts: string[]): DocumentPage[] => texts.map((text, index) => ({ text, pageNumber: index + 1, messageId: `m${index}`, versionId: `v${index}` }));
const source: DocumentAttachment = { id: 'synthetic-file', name: 'Synthetic.pdf', kind: 'pdf', mimeType: 'application/pdf', size: 50, createdAt: 1, pages: pages('First page', 'Second page') };
const note = (id: string, pageIndex = 0, extra: Partial<Annotation> = {}): Annotation => ({ id, conversationId: 'synthetic-chat', messageId: `m${pageIndex}`, versionId: `v${pageIndex}`, quote: 'geodesic', anchor: null, color: '#f3cf67', question: '', answer: '', mode: 'note', note: 'my note', edited: false, status: 'noted', createdAt: 1, updatedAt: 1, ...extra });
const deferred = <T,>() => { let resolve!: (value: T) => void, reject!: (error: unknown) => void; const promise = new Promise<T>((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };

test('全文搜索忽略大小写、空白及断行连字符，映射回完整原文且不改写内容', () => {
  const input = pages('广义 相对论\nGeO-\ndesic is a geodesic.', '广义相对论'), original = structuredClone(input);
  const index = buildDocumentSearch(input), chinese = searchDocument(index, '广义相对论'), english = searchDocument(index, 'geodesic');
  assert.equal(chinese.count, 2); assert.deepEqual(chinese.hits.map(h => h.pageNumber), [1, 2]);
  assert.equal(chinese.hits[0].quote, '广义 相对论'); assert.equal(english.count, 2);
  assert.equal(english.hits[0].quote, 'GeO-\ndesic'); assert.equal(english.hits[1].ordinal, 1);
  for (const hit of [...chinese.hits, ...english.hits]) assert.equal(input[hit.pageIndex].text.slice(hit.start, hit.end), hit.quote);
  assert.deepEqual(input, original);
});

test('兼容连字、组合音标、全角文字与 emoji，不截断原文字符', () => {
  const input = pages('😀 ﬃ cafe\u0301 ＡＢＣ 😀'), index = buildDocumentSearch(input);
  assert.equal(searchDocument(index, 'ffi').hits[0].quote, 'ﬃ');
  assert.equal(searchDocument(index, 'café').hits[0].quote, 'cafe\u0301');
  assert.equal(searchDocument(index, 'abc').hits[0].quote, 'ＡＢＣ');
  assert.deepEqual(searchDocument(index, '😀').hits.map(h => h.quote), ['😀', '😀']);
  const normalized = normalizeSearchText('ﬃ'); assert.deepEqual([...normalized.starts], [0, 0, 0]); assert.deepEqual([...normalized.ends], [1, 1, 1]);
});

test('搜索逐页计算全部结果并限制列表长度，特殊字符按字面搜索', () => {
  const index = buildDocumentSearch(pages('x '.repeat(205), 'x .* [x]'));
  const result = searchDocument(index, 'X'); assert.equal(result.count, 207); assert.equal(result.hits.length, 200);
  assert.equal(result.hits[199].ordinal, 199); assert.equal(searchDocument(index, '.*').count, 1);
  assert.equal(searchDocument(index, '[x]').count, 1); assert.equal(searchDocument(index, ' \n\u200b').count, 0);
  assert.equal(searchDocument(index, 'absent').count, 0); assert.equal(searchDocument(index, 'x', 0).count, 207);
});

test('批注总览只包含当前原文版本的未删除批注并按页和时间排序', () => {
  const input = [note('p2', 1), note('late', 0, { createdAt: 20 }), note('deleted', 0, { deletedAt: 5 }), note('other-version', 0, { versionId: 'old' }), note('other-document', 4), note('first')];
  const result = documentNotes(source, input); assert.deepEqual(result.map(n => n.annotation.id), ['first', 'late', 'p2']);
  assert.deepEqual(result.map(n => n.pageNumber), [1, 1, 2]); assert.equal(input.length, 6);
});

test('批注筛选支持类型、页码、旧回答和重新提问草稿，不扫描长篇上下文', () => {
  const input = [note('note'), note('ask', 1, { mode: 'ask', status: 'answered', question: 'What?', answer: 'Original answer', reask: { question: 'New question', answer: '', status: 'draft' }, context: [{ role: 'user', content: 'hidden-context-only' }] })];
  const notes = documentNotes(source, input);
  assert.deepEqual(filterDocumentNotes(notes, 'note', null, '').map(n => n.annotation.id), ['note']);
  assert.deepEqual(filterDocumentNotes(notes, 'ask', 1, 'newquestion').map(n => n.annotation.id), ['ask']);
  assert.equal(filterDocumentNotes(notes, 'all', null, 'ORIGINAL').length, 1);
  assert.equal(filterDocumentNotes(notes, 'all', 0, 'new').length, 0);
  assert.equal(filterDocumentNotes(notes, 'all', null, 'hidden-context-only').length, 0);
});

test('连续阅读位置独立保存，兼容旧分页偏好并限制异常值', () => {
  const values = new Map<string, string>(), storage = { getItem: (key: string) => values.get(key) || null, setItem: (key: string, value: string) => { values.set(key, value); } };
  const next = { pageIndex: 1, zoom: 1.25, view: 'original' as const, scrollX: .2, scrollY: .5, layout: 'continuous' as const, pageOffset: .72 };
  saveReaderPosition('synthetic', next, storage); assert.deepEqual(loadReaderPosition('synthetic', 10, 'pdf', storage), next);
  assert.deepEqual(readerPosition({ ...next, layout: 'broken' }, 10, 'pdf'), { pageIndex: 1, zoom: 1.25, view: 'original', scrollX: .2, scrollY: .5 });
  assert.equal(readerPosition({ ...next, pageOffset: Infinity }, 10, 'pdf').pageOffset, 0);
  assert.equal(readerPosition({ ...next, pageOffset: 8 }, 10, 'pdf').pageOffset, 1);
  assert.equal(activeReaderPage([{ pageIndex: 2, top: -90, bottom: 10 }, { pageIndex: 3, top: 40, bottom: 500 }], 80), 3);
  assert.equal(activeReaderPage([{ pageIndex: 2, top: -90, bottom: 10 }, { pageIndex: 3, top: 40, bottom: 500 }], 15), 2);
});

test('PDF 目录解析内部页码、引用和命名位置；同一命名只解析一次', async () => {
  let named = 0;
  const pdf = { numPages: 10, getOutline: async () => [{ title: 'Intro', dest: [0], items: [{ title: 'Detail', dest: [{ num: 5, gen: 0 }] }] }, { title: 'Named', dest: 'methods' }, { title: 'Again', dest: 'methods' }, { title: 'Invalid', dest: [100] }, { title: 'External', url: 'https://example.invalid', dest: null }], getDestination: async () => { named++; return [3]; }, getPageIndex: async () => 2 } as unknown as PDFDocumentProxy;
  const { entries, truncated } = await readPdfOutline(pdf, new AbortController().signal);
  assert.equal(named, 1); assert.equal(truncated, false);
  assert.deepEqual(entries.map(e => [e.title, e.depth, e.pageIndex]), [['Intro', 0, 0], ['Detail', 1, 2], ['Named', 0, 3], ['Again', 0, 3], ['Invalid', 0, null], ['External', 0, null]]);
});

test('长目录限制 1000 项，取消后不发布迟到结果', async () => {
  const pdf = { numPages: 1, getOutline: async () => Array.from({ length: 1200 }, (_, i) => ({ title: `Section ${i}`, dest: [0] })) } as unknown as PDFDocumentProxy;
  const result = await readPdfOutline(pdf, new AbortController().signal); assert.equal(result.entries.length, 1000); assert.equal(result.truncated, true);
  const controller = new AbortController(), wait = deferred<any>();
  const job = readPdfOutline({ ...pdf, getOutline: () => wait.promise } as unknown as PDFDocumentProxy, controller.signal);
  const rejected = assert.rejects(job, { name: 'AbortError' }); controller.abort(); wait.resolve([{ title: 'late', dest: [0] }]); await rejected;
});

test('绘制队列同一时间只运行一页，已取消的排队页不会分配画布', async () => {
  const queue = new PdfRenderQueue(), first = deferred<number>(), controller = new AbortController(); let running = 0, maximum = 0, skipped = 0;
  const a = queue.enqueue(async () => { maximum = Math.max(maximum, ++running); const value = await first.promise; running--; return value; }, new AbortController().signal);
  const b = queue.enqueue(async () => { skipped++; return 2; }, controller.signal), cancelled = assert.rejects(b, { name: 'AbortError' });
  const c = queue.enqueue(async () => { maximum = Math.max(maximum, ++running); running--; return 3; }, new AbortController().signal);
  controller.abort(); first.resolve(1); assert.equal(await a, 1); await cancelled; assert.equal(await c, 3); assert.equal(skipped, 0); assert.equal(maximum, 1);
});

test('正在取消的绘制完成清理前不启动下一页，失败也不会堵塞队列', async () => {
  const queue = new PdfRenderQueue(), wait = deferred<number>(), controller = new AbortController(); let nextStarted = false;
  const first = queue.enqueue(() => wait.promise, controller.signal), rejected = assert.rejects(first, { name: 'AbortError' });
  const next = queue.enqueue(async () => { nextStarted = true; return 2; }, new AbortController().signal);
  controller.abort(); await Promise.resolve(); assert.equal(nextStarted, false); wait.resolve(1); await rejected; assert.equal(await next, 2);
  const failure = queue.enqueue(async () => { throw Error('synthetic-raster-failure'); }, new AbortController().signal);
  const last = queue.enqueue(async () => 3, new AbortController().signal); await assert.rejects(failure, /synthetic-raster-failure/); assert.equal(await last, 3);
});

test('批注导航在高亮未绘制时直接恢复原文范围，歧义或损坏锚点不误定位', () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'NodeFilter');
  Object.defineProperty(globalThis, 'NodeFilter', { configurable: true, value: { SHOW_TEXT: 4, FILTER_SKIP: 3, FILTER_ACCEPT: 1 } });
  try {
    const nodes = ['First line. ', 'orbital ', 'memory', ' ends.'].map(data => ({ data, length: data.length, parentElement: { closest: () => null } }));
    const ownerDocument = {
      createTreeWalker: () => { let index = 0; return { nextNode: () => nodes[index++] || null }; },
      createRange: () => {
        let start = 0, end = 0;
        const offset = (node: typeof nodes[number], at: number) => nodes.slice(0, nodes.indexOf(node)).reduce((n, entry) => n + entry.length, 0) + at;
        return { setStart: (node: typeof nodes[number], at: number) => { start = offset(node, at); }, setEnd: (node: typeof nodes[number], at: number) => { end = offset(node, at); }, get collapsed() { return start === end; }, toString: () => nodes.map(n => n.data).join('').slice(start, end) };
      },
    };
    const container = { ownerDocument } as unknown as HTMLElement;
    const anchor = { selectors: [{ start: 999, end: 1001, quote: 'orbital memory' }] };
    assert.equal(readerAnnotationRange(container, anchor)?.toString(), 'orbital memory');
    assert.equal(readerAnnotationRange(container, { selectors: [{ start: 0, end: 5, quote: 'absent' }] }), null);
    assert.equal(readerAnnotationRange(container, { selectors: [null, { quote: 'memory' }] }), null);
    nodes[0].data = 'orbital memory '; nodes[0].length = nodes[0].data.length;
    assert.equal(readerAnnotationRange(container, anchor), null);
  } finally { if (previous) Object.defineProperty(globalThis, 'NodeFilter', previous); else Reflect.deleteProperty(globalThis, 'NodeFilter'); }
});
