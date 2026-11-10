import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { saveDocumentBytes, exportWorkspaceWithFiles, importWorkspaceWithFiles, getDocumentBytes } from '../src/adapters/storage';
import { assertEbookImageHeader, assertEbookSignature, safeEbookEntry, ebookPosition, ebookTypography } from '../src/domain/ebook';
import { documentFileKind, DOCUMENT_ACCEPT, READER_ACCEPT } from '../src/adapters/documents';
import { syntheticEpub, syntheticMobi, syntheticAzw3 } from './ebook-fixtures';
import { createWorkspace, createAnnotation, buildAnnotationContext, createUserMessage, createAssistantMessage, validateImport } from '../src/domain/workspace';
import { WorkspaceCodec, unpackWorkspace } from '../src/domain/workspace-codec';
import { captureChatTextReference } from '../src/domain/chat-text-reference';
import type { DocumentAttachment } from '../src/domain/types';
import { documentByteLimit, documentTextLimit } from '../src/domain/document-limits';

test('ebook import accepts EPUB/MOBI/AZW3 with bounded size and source signatures', () => {
  for (const kind of ['epub', 'mobi', 'azw3'] as const) {
    assert.equal(documentFileKind({ name: 'Synthetic.' + kind, type: '', size: 2000 }), kind);
    assert.throws(() => documentFileKind({ name: 'Synthetic.' + kind, type: '', size: documentByteLimit(kind) + 1 }));
    assert(DOCUMENT_ACCEPT.includes('.' + kind)); assert(READER_ACCEPT.includes('.' + kind));
    assert.equal(documentTextLimit(kind), 10_000_000);
  }
  assertEbookSignature(syntheticEpub(), 'epub'); assertEbookSignature(syntheticMobi(), 'mobi'); assertEbookSignature(syntheticAzw3(), 'azw3');
  assert.throws(() => assertEbookSignature(syntheticMobi(true), 'mobi'), /DRM/);
  assert.throws(() => assertEbookSignature(new Uint8Array([1, 2, 3]), 'epub'));
  const broken = syntheticMobi(); broken.writeUInt32BE(0xffffff, 78); assert.throws(() => assertEbookSignature(broken, 'mobi'));
  const bomb = syntheticMobi(); bomb.writeUInt32BE(60_000_000, 98); assert.throws(() => assertEbookSignature(bomb, 'mobi'), /EPUB/);
});
test('archive entry paths and reflow preferences remain bounded', () => {
  for (const path of ['../x', '/absolute', 'a/../../x', 'C:/x', 'a\\b', 'a\0b']) assert.equal(safeEbookEntry(path), false);
  assert.equal(safeEbookEntry('OEBPS/Text/chapter.xhtml'), true);
  assert.deepEqual(ebookPosition({ chapter: 99, block: -1, offset: Infinity, fraction: 2 }, 6), { chapter: 5, block: 0, offset: 0, fraction: 1 });
  assert.deepEqual(ebookTypography({ fontSize: 1000, lineHeight: -1, width: NaN }), { fontSize: 36, lineHeight: 1.2, width: 800 });
});

test('ebook zoom and horizontal progress extend old positions without changing typography', () => {
  const legacy = { chapter: 2, block: 20, offset: .3, fraction: .6 };
  assert.deepEqual(ebookPosition(legacy, 10), legacy);
  assert.deepEqual(ebookPosition({ ...legacy, zoom: 1.75, horizontal: .4 }, 10), { ...legacy, zoom: 1.75, horizontal: .4 });
  assert.deepEqual(ebookPosition({ ...legacy, zoom: 100, horizontal: 8 }, 10), { ...legacy, zoom: 2.5, horizontal: 1 });
  assert.deepEqual(ebookPosition({ ...legacy, zoom: NaN, horizontal: Infinity }, 10), legacy);
  assert.equal(ebookTypography({ fontSize: 19 }).fontSize, 19);
});
test('book chapter records and note anchors round-trip without changing legacy PDF data', () => {
  const workspace = createWorkspace(), conversation = workspace.conversations[0];
  const originalPdf: DocumentAttachment = { id: 'synthetic-pdf', kind: 'pdf', name: 'Synthetic.pdf', mimeType: 'application/pdf', size: 100, createdAt: 1, pages: [{ pageNumber: 1, text: 'Legacy PDF stays intact.', messageId: 'pdf-message', versionId: 'pdf-version' }] };
  const book: DocumentAttachment = { id: 'synthetic-epub', kind: 'epub', name: 'Synthetic.epub', mimeType: 'application/epub+zip', size: syntheticEpub().length, createdAt: 1, pages: [{ pageNumber: 1, text: 'Synthetic chapter context. Selected terminology.', title: 'Synthetic chapter', messageId: 'book-message', versionId: 'book-version' }] };
  conversation.documents = [originalPdf, book]; conversation.annotations = []; conversation.messages = [createUserMessage('PRIVATE_CHAT_SENTINEL'), createAssistantMessage('PRIVATE_CHAT_ANSWER', 'complete')];
  const note = createAnnotation(conversation, { messageId: 'book-message', versionId: 'book-version', quote: 'Selected terminology.', color: '#a9c6f6', anchor: { selectors: [{ start: 27, end: 48, quote: 'Selected terminology.' }] }, question: 'Explain this term.' });
  conversation.annotations = [note];
  const packed = new WorkspaceCodec().pack(workspace), restored = validateImport(unpackWorkspace({ ...packed.header, records: packed.rows }));
  const documents = restored.conversations[0].documents!;
  assert.deepEqual(documents[0], originalPdf); assert.deepEqual(documents[1], book); assert.deepEqual(restored.conversations[0].annotations[0].anchor, note.anchor);
  const context = JSON.stringify(buildAnnotationContext(conversation, note)); assert(context.includes('Synthetic chapter context.')); assert(!context.includes('PRIVATE_CHAT_SENTINEL')); assert(!context.includes('Legacy PDF stays intact.'));
  assert.match(captureChatTextReference(conversation, { conversationId: conversation.id, messageId: 'book-message', versionId: 'book-version', text: 'Selected terminology.' }).label, /ch\. 1/);
});

test('ebook raster headers reject excessive decoded pixel allocations', () => {
  const png = Buffer.alloc(24); png.writeUInt32BE(0x89504e47); png.writeUInt32BE(0x0d0a1a0a, 4); png.writeUInt32BE(40000, 16); png.writeUInt32BE(40000, 20);
  assert.throws(() => assertEbookImageHeader(png)); png.writeUInt32BE(1200, 16); png.writeUInt32BE(800, 20); assertEbookImageHeader(png);
});

test('pinned MOBI adapter accepts resource hooks and bounded font inflation output', async () => {
  const mobi = await import(new URL('../vendor/foliate-js/mobi.js', import.meta.url).href);
  const fflate = await import(new URL('../vendor/foliate-js/vendor/fflate.js', import.meta.url).href);
  const { deflateSync } = await import('node:zlib');
  const source = new Uint8Array(1024).fill(7), out = new Uint8Array(1024);
  assert.deepEqual(fflate.unzlibSync(deflateSync(source), { out }), source);
  assert.ok(new mobi.MOBI({ unzlib: fflate.unzlibSync, validateResource() {} }));
});

test('complete ebook backups restore original archives and remapped note sources', async () => {
  const source = createWorkspace(), conversation = source.conversations[0];
  conversation.messages = []; conversation.annotations = []; conversation.documents = [];
  const files = [['epub', syntheticEpub(2, 10)], ['mobi', syntheticMobi()], ['azw3', syntheticAzw3()]] as const;
  for (const [kind, bytes] of files) {
    const document: DocumentAttachment = { id: crypto.randomUUID(), kind, name: 'Synthetic.' + kind, mimeType: 'application/octet-stream', size: bytes.length, createdAt: 1, pages: [1, 2].map(pageNumber => ({ pageNumber, title: 'Chapter ' + pageNumber, text: 'A fictional source chapter.', messageId: crypto.randomUUID(), versionId: crypto.randomUUID() })) };
    conversation.documents.push(document); await saveDocumentBytes(document.id, bytes);
    const page = document.pages[0];
    const note = createAnnotation(conversation, { messageId: page.messageId, versionId: page.versionId, quote: 'fictional', anchor: { selectors: [{ start: 2, end: 11, quote: 'fictional' }] }, color: '#a9c6f6', mode: 'note' });
    conversation.annotations.push({ ...note, note: 'Synthetic saved note.', status: 'noted' });
  }
  const json = await exportWorkspaceWithFiles(source, { compact: true });
  const restored = await importWorkspaceWithFiles(json, createWorkspace());
  const target = restored.conversations.at(-1)!;
  assert.equal(target.documents?.length, 3); assert.equal(target.annotations.length, 3);
  for (const [kind, bytes] of files) {
    const document: DocumentAttachment = target.documents!.find(item => item.kind === kind)!;
    assert.deepEqual(await getDocumentBytes(document.id), new Uint8Array(bytes));
    assert.notEqual(document.id, conversation.documents.find(document => document.kind === kind)!.id);
    assert.equal(document.pages[0].title, 'Chapter 1');
    assert(target.annotations.some(note => note.messageId === document.pages[0].messageId && note.versionId === document.pages[0].versionId && note.note === 'Synthetic saved note.'));
  }
});
