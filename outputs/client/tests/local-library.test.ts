import test from 'node:test';
import assert from 'node:assert/strict';
import { LocalDocumentIndex, conversationFileGroups, fileAnnotationCounter, localDocumentReferences, projectFileAnnotations, recentReadingGroups, recordRecentReading, setRecentReadingHidden } from '../src/domain/local-library';
import type { Annotation, Conversation, DocumentAttachment, Workspace } from '../src/domain/types';
import { parseDocumentFile } from '../src/adapters/documents';
import { loadReaderSession, loadRecentReading, saveReaderSession, saveRecentReading } from '../src/adapters/reader-session';

const document = (id: string, name = 'paper.pdf', size = 4): DocumentAttachment => ({ id, name, size, kind: 'pdf', mimeType: 'application/pdf', createdAt: 1, pages: [{ pageNumber: 1, text: 'same extracted text', messageId: `${id}-m`, versionId: `${id}-v` }] });
const conversation = (id: string, documents: DocumentAttachment[], annotations: Annotation[] = []): Conversation => ({ id, title: id, createdAt: 1, updatedAt: 1, documents, annotations, messages: [] });
const annotation = (id: string, d: DocumentAttachment, extra: Partial<Annotation> = {}): Annotation => ({ id, conversationId: 'c', messageId: d.pages[0].messageId, versionId: d.pages[0].versionId, quote: 'same', anchor: { selectors: [{ start: 0, end: 4, quote: 'same' }] }, color: '#f3cf67', question: '', answer: '', mode: 'note', note: id, edited: false, status: 'noted', createdAt: 1, updatedAt: 1, ...extra });
const refs = (...documents: DocumentAttachment[]) => documents.map(document => ({ conversationId: 'c', document }));

test('removing and restoring recent reading leaves library references and annotations intact', async () => {
  const a = document('a'), copy = document('copy'), b = document('b', 'other.pdf', 5);
  const notes = [annotation('keep', a)];
  const owner = conversation('c', [a, copy, b], notes);
  const source = refs(a, copy, b);
  const index = new LocalDocumentIndex();
  const read = async (id: string) => new Uint8Array(id === 'b' ? 5 : 4);
  const [oldGroup] = await index.group(refs(a), read);
  const groups = await index.group(source, read);
  const [shared, other] = groups;
  assert.notEqual(shared.id, oldGroup.id);
  const initial = recordRecentReading({ opened: [], hidden: [] }, b.id);
  const removed = setRecentReadingHidden(initial, [shared], true);

  assert.deepEqual(recentReadingGroups(groups, removed), { visible: [other], hidden: [shared] });
  assert.deepEqual(recentReadingGroups([oldGroup, other], removed), { visible: [other], hidden: [oldGroup] });
  assert.deepEqual(conversationFileGroups(groups, owner), groups);
  assert.equal(fileAnnotationCounter([owner])(shared.references), 1);
  assert.equal((await index.find(new Uint8Array(4), 'pdf', source, read))?.document.id, a.id);

  const restored = setRecentReadingHidden(removed, [shared], false);
  assert.deepEqual(recentReadingGroups(groups, restored), { visible: [other, shared], hidden: [] });
  const reopened = recordRecentReading(removed, a.id);
  assert.deepEqual(recentReadingGroups(groups, reopened), { visible: [shared, other], hidden: [] });
  assert.deepEqual(reopened.hidden, [copy.id]);
  assert.deepEqual(initial.hidden, []);
});

test('recent reading preferences persist separately from the saved reader session', () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
  };
  const session = { conversationId: 'c', documentId: 'a', mode: 'closed' } as const;
  saveReaderSession(session, storage);
  assert.deepEqual(loadRecentReading(storage), { opened: [], hidden: [] });

  const preferences = { opened: ['b', 'b', '', 'a'], hidden: ['a', 'a'] };
  assert.equal(saveRecentReading(preferences, storage), true);
  assert.deepEqual(loadRecentReading(storage), { opened: ['b', 'a'], hidden: ['a'] });
  assert.deepEqual(loadReaderSession(storage), session);
  assert.equal(saveRecentReading(preferences, { setItem() { throw Error('Storage unavailable'); } }), false);
});

test('equal original bytes merge even after renaming; same names and extracted text never prove identity', async () => {
  const a = document('a'), b = document('b', 'renamed.pdf'), c = document('c');
  const source = refs(a, b, c), before = structuredClone(source), index = new LocalDocumentIndex();
  const bytes = new Map([['a', new Uint8Array([1,2,3,4])], ['b', new Uint8Array([1,2,3,4])], ['c', new Uint8Array([1,2,3,5])]]);
  const groups = await index.group(source, async id => bytes.get(id));
  assert.equal(groups.length, 2); assert.deepEqual(groups.map(g => g.references.map(r => r.document.id)), [['a','b'], ['c']]);
  assert.deepEqual(source, before);
});

test('unique file sizes avoid reading originals and repeated opens find the existing file', async () => {
  const a = document('a'), b = document('b', 'other.pdf', 5), index = new LocalDocumentIndex(), source = refs(a, b); let reads = 0;
  const read = async (id: string) => { reads++; return new Uint8Array(id === 'a' ? [1,2,3,4] : [1,2,3,4,5]); };
  assert.equal((await index.group(source, read)).length, 2); assert.equal(reads, 0);
  assert.equal((await index.find(new Uint8Array([1,2,3,4]), 'pdf', source, read))?.document.id, 'a');
  assert.equal((await index.find(new Uint8Array([1,2,3,4]), 'pdf', source, read))?.document.id, 'a'); assert.equal(reads, 1);
  assert.equal(await index.find(new Uint8Array([1,2,3,4]), 'text', source, read), null);
});

test('missing, unreadable or mismatched originals remain separate; cancelled indexing publishes no groups', async () => {
  const source = refs(document('missing'), document('damaged'), document('throwing')), index = new LocalDocumentIndex();
  const groups = await index.group(source, async id => { if (id === 'throwing') throw Error('synthetic-file-read'); return id === 'damaged' ? new Uint8Array([1]) : undefined; });
  assert.equal(groups.length, 3);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(index.group(source, async () => new Uint8Array(4), controller.signal), { name: 'AbortError' });
  index.clear(); let reads = 0; await index.group(source, async () => { reads++; return new Uint8Array(4); }); assert.equal(reads, 3);
});

test('library excludes deleted conversations, groups across records and isolates each conversation view', async () => {
  const a = document('a'), b = document('b'), c = { ...conversation('trash', [document('deleted')]), deletedAt: 9 };
  const workspace: Workspace = { schemaVersion: 1, activeConversationId: 'first', conversations: [conversation('first', [a]), conversation('second', [b]), c] };
  const references = localDocumentReferences(workspace); assert.equal(references.length, 2);
  const groups = await new LocalDocumentIndex().group(references, async () => new Uint8Array(4)); assert.equal(groups.length, 1);
  assert.deepEqual(conversationFileGroups(groups, workspace.conversations[0])[0].references.map(r => r.document.id), ['a']);
  assert.equal(conversationFileGroups(groups, conversation('first', [])).length, 0);
});

test('duplicate-page notes share a displayed source while original IDs, source versions and frozen attempts remain intact', () => {
  const a = document('a'), b = document('b'), outside = document('outside');
  const notes = [annotation('first', a), annotation('second', b, { mode: 'ask', question: 'old question', answer: 'old answer', status: 'answered', context: [{ role: 'user', content: 'frozen source' }], reask: { question: 'new question', answer: '', status: 'draft' } }), annotation('other', outside)];
  const before = structuredClone(notes), projected = projectFileAnnotations(a, [a, b], notes);
  assert.deepEqual(projected.map(a => a.id), ['first', 'second', 'other']);
  assert.equal(projected[1].messageId, a.pages[0].messageId); assert.equal(projected[1].versionId, a.pages[0].versionId);
  assert.equal(projected[1].context, notes[1].context); assert.equal(projected[1].anchor, notes[1].anchor); assert.equal(projected[1].reask, notes[1].reask);
  assert.equal(projected[2], notes[2]); assert.deepEqual(notes, before);
  const count = fileAnnotationCounter([conversation('c', [a,b], [...notes, annotation('deleted', b, { deletedAt: 4 })])]);
  assert.equal(count(refs(a, b)), 2); assert.equal(count(refs(a, a)), 1);
});

test('pre-read file bytes are parsed once and wrong lengths are rejected before saving', async () => {
  const bytes = new TextEncoder().encode('synthetic document'), file = new File([bytes], 'local.txt', { type: 'text/plain' });
  Object.defineProperty(file, 'arrayBuffer', { value: () => { throw Error('File must not be read twice'); } });
  const result = await parseDocumentFile(file, { bytes }); assert.equal(result.document.pages[0].text, 'synthetic document'); assert.equal(result.bytes, bytes);
  await assert.rejects(parseDocumentFile(file, { bytes: new Uint8Array(1) }), /大小发生变化/);
});
