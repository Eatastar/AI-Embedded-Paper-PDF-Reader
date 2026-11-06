import assert from 'node:assert/strict';
import test from 'node:test';
import { documentFileKind, documentPageText, parseDocumentFile, MAX_DOCUMENT_BYTES, MAX_DOCUMENT_TEXT_CHARACTERS } from '../src/adapters/documents';

test('local UTF-8 text import preserves source and creates an independent annotation page', async () => {
  const original = '\ufeff# 论文笔记\r\n\r\n<script>not executed</script>\r\n\\(E=mc^2\\)';
  const file = new File([original], 'paper.MD', { type: 'text/markdown' });
  const progress: number[][] = [];
  const first = await parseDocumentFile(file, { onProgress: (page, total) => progress.push([page, total]) });
  const second = await parseDocumentFile(file);
  assert.equal(first.document.kind, 'text');
  assert.equal(first.document.pages[0].text, '# 论文笔记\n\n<script>not executed</script>\n\\(E=mc^2\\)');
  assert.equal(first.document.pages[0].pageNumber, 1);
  assert.equal(first.document.size, file.size);
  assert.deepEqual(first.bytes, new Uint8Array(await file.arrayBuffer()));
  assert.notEqual(first.document.id, second.document.id);
  assert.notEqual(first.document.pages[0].messageId, second.document.pages[0].messageId);
  assert.notEqual(first.document.pages[0].versionId, second.document.pages[0].versionId);
  assert.deepEqual(progress, [[1, 1]]);
});

test('extension and real PDF header validation reject renamed or unsupported files', async () => {
  assert.equal(documentFileKind({ name: 'paper.PDF', type: 'application/octet-stream', size: 42 }), 'pdf');
  assert.equal(documentFileKind({ name: 'large.pdf', type: 'application/pdf', size: 40 * 1024 * 1024 }), 'pdf');
  assert.throws(() => documentFileKind({ name: 'large.txt', type: 'text/plain', size: 26 * 1024 * 1024 }), /25 MB/);
  assert.throws(() => documentFileKind({ name: 'script.html', type: 'text/plain', size: 42 }), /目前支持/);
  assert.throws(() => documentFileKind({ name: 'empty.txt', type: 'text/plain', size: 0 }), /文件是空的/);
  assert.throws(() => documentFileKind({ name: 'large.pdf', type: 'application/pdf', size: MAX_DOCUMENT_BYTES + 1 }), /150 MB/);
  await assert.rejects(parseDocumentFile(new File(['not a real PDF'], 'paper.pdf')), /不是有效的 PDF/);
});

test('cancelled document parsing does not produce a partial attachment', async () => {
  const controller = new AbortController(); controller.abort();
  await assert.rejects(parseDocumentFile(new File(['synthetic text'], 'cancelled.txt'), { signal: controller.signal }), { name: 'AbortError' });
});

test('binary and non-UTF-8 text receive useful local errors', async () => {
  await assert.rejects(parseDocumentFile(new File([new Uint8Array([0xff, 0xfe, 0x01])], 'wrong.txt')), /UTF-8/);
  await assert.rejects(parseDocumentFile(new File(['before\u0000after'], 'binary.md')), /不像可读取的文字/);
  await assert.rejects(parseDocumentFile(new File(['a'.repeat(MAX_DOCUMENT_TEXT_CHARACTERS + 1)], 'long.txt')), /100 万字/);
});

test('PDF text extraction retains word gaps, fragmented words, CJK and page line breaks', () => {
  const piece = (str: string, x: number, y: number, width: number, hasEOL = false) => ({ str, transform: [12, 0, 0, 12, x, y], width, height: 12, hasEOL });
  assert.equal(documentPageText([
    { type: 'beginMarkedContent' },
    piece('General', 0, 100, 44), piece('relat', 48, 100, 25), piece('ivity', 73, 100, 20, true),
    piece('广义', 0, 80, 24), piece('相对论', 30, 80, 36, true),
    piece('line', 0, 60, 20), piece('two', 0, 40, 20),
  ]), 'General relativity\n广义相对论\nline\ntwo');
  assert.equal(documentPageText([{ str: 'hello', hasEOL: true }, { str: 'world' }]), 'hello\nworld');
  assert.equal(documentPageText([{ type: 'endMarkedContent' }]), '');
});
