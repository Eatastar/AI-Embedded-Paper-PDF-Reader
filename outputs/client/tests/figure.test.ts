import test from 'node:test';
import assert from 'node:assert/strict';
import { createAnnotation, createConversation, createUserMessage, createAssistantMessage, prepareAnnotationRequest, completeAnnotation, updateAnnotationRequest, updateFigureStrokes, changeAnnotationReask, validateImport, mergeImportedWorkspace, buildAnnotationContext } from '../src/domain/workspace';
import { readFigure, readFigureStrokes, compactFigureStroke, figureSourceKey, type FigureSelection } from '../src/domain/figure';
import { WorkspaceCodec, unpackWorkspace } from '../src/domain/workspace-codec';
import { FigureCache } from '../src/domain/figure-cache';
import type { Workspace } from '../src/domain/types';

function fixture() {
  const c = createConversation('Synthetic figure document');
  c.messages = [createUserMessage('PRIVATE_MAIN_CHAT_SENTINEL'), createAssistantMessage('PRIVATE_MAIN_ANSWER_SENTINEL', 'complete')];
  c.documents = [{ id: 'pdf-figure', name: 'synthetic.pdf', kind: 'pdf', mimeType: 'application/pdf', size: 600, createdAt: Date.now(), pages: [1, 2].map(n => ({ pageNumber: n, text: `DOCUMENT_PAGE_${n}_FULL_TEXT`, messageId: `page-${n}`, versionId: `version-${n}` })) }];
  const figure: FigureSelection = { documentId: 'pdf-figure', pageNumber: 1, rect: { x: .1, y: .2, width: .6, height: .4 }, strokes: [] };
  const a = createAnnotation(c, { messageId: 'page-1', versionId: 'version-1', quote: 'Figure region, page 1', anchor: { type: 'pdf-region' }, color: '#f3cf67', question: 'Why does the curve flatten?', figure });
  const other = createAnnotation(c, { messageId: 'page-2', versionId: 'version-2', quote: 'DOCUMENT_PAGE_2', anchor: {}, color: '#a9c6f6', mode: 'note', note: 'OTHER_ANNOTATION_SENTINEL' });
  c.annotations = [a, other]; return { c, a, figure };
}
const strokes = [{ tool: 'ellipse' as const, color: '#d64a3a', width: .004, points: [{ x: .3, y: .2 }, { x: .8, y: .6 }] }];
test('figure questions include document text and reader-mark guidance but no main chat or other notes', () => {
  const { c, a } = fixture(); const text = JSON.stringify(buildAnnotationContext(c, a, 'STYLE', { mode: 'full' }));
  assert.ok(text.includes('DOCUMENT_PAGE_1_FULL_TEXT') && text.includes('DOCUMENT_PAGE_2_FULL_TEXT'));
  assert.ok(text.includes('手绘标记由读者添加')); assert.ok(!text.includes('PRIVATE_MAIN_') && !text.includes('OTHER_ANNOTATION_SENTINEL'));
  assert.ok(!text.includes('data:image') && !text.includes('base64'));
});
test('compact storage, validation and imported source remapping retain figure geometry and vector data only', () => {
  const { c, a } = fixture(); const edited = updateFigureStrokes(c, a.id, strokes);
  const workspace: Workspace = { schemaVersion: 1, activeConversationId: c.id, conversations: [edited] };
  const packed = new WorkspaceCodec().pack(workspace); const restored = validateImport(unpackWorkspace({ ...packed.header, records: packed.rows }));
  assert.deepEqual(restored.conversations[0].annotations[0].figure?.strokes, strokes);
  const merged = mergeImportedWorkspace(workspace, restored), added = merged.conversations.at(-1)!;
  assert.notEqual(added.documents![0].id, c.documents![0].id); assert.equal(added.annotations[0].figure?.documentId, added.documents![0].id);
  assert.ok(JSON.stringify(packed.rows).length < 12000); assert.ok(!JSON.stringify(packed.rows).includes('data:image'));
});
test('new strokes stay pending until replacement succeeds; failure and cancellation preserve the successful original', () => {
  const { c, a } = fixture(); const first = prepareAnnotationRequest(c, a.id);
  const successful = completeAnnotation(first.conversation, a.id, 'Original successful answer', 'vision-one');
  const pending = updateFigureStrokes(successful, a.id, strokes);
  assert.deepEqual(pending.annotations[0].figure?.strokes, []); assert.deepEqual(pending.annotations[0].reask?.figureStrokes, strokes);
  const retry = prepareAnnotationRequest(pending, a.id);
  const failed = updateAnnotationRequest(retry.conversation, a.id, '', { error: 'Synthetic unsupported image', interrupted: false });
  assert.equal(failed.annotations[0].answer, 'Original successful answer'); assert.equal(failed.annotations[0].modelLabel, 'vision-one');
  const cancelled = changeAnnotationReask(failed, a.id, 'cancel'); assert.deepEqual(cancelled.annotations[0].figure?.strokes, []);
  const replacement = prepareAnnotationRequest(failed, a.id); const completed = completeAnnotation(replacement.conversation, a.id, 'New answer', 'vision-two');
  assert.deepEqual(completed.annotations[0].figure?.strokes, strokes); assert.equal(completed.annotations[0].modelLabel, 'vision-two'); assert.equal(completed.annotations[0].reask, undefined);
});
test('image metadata rejects bitmaps, out-of-page crops, invalid coordinates and mismatched document sources', () => {
  const { c, figure } = fixture();
  assert.throws(() => readFigure({ ...figure, dataURL: 'data:image/png;base64,SYNTHETIC' }));
  assert.throws(() => readFigure({ ...figure, rect: { x: .8, y: .1, width: .5, height: .3 } }));
  assert.throws(() => readFigureStrokes([{ ...strokes[0], points: [{ x: NaN, y: .2 }, { x: .5, y: .6 }] }]));
  assert.throws(() => createAnnotation(c, { messageId: 'page-2', versionId: 'version-2', quote: 'Wrong page', anchor: {}, color: '#f3cf67', figure }));
});
test('long freehand strokes have bounded samples and keep endpoint geometry', () => {
  const value = compactFigureStroke({ ...strokes[0], tool: 'pen', points: Array.from({ length: 2000 }, (_, n) => ({ x: n / 1999, y: .4 })) });
  assert.equal(value.points.length, 256); assert.equal(value.points[0].x, 0); assert.equal(value.points.at(-1)?.x, 1); readFigureStrokes([value]);
});
test('derived image cache reuses a crop, evicts by bytes and LRU order, and can release a closed PDF', () => {
  const { figure } = fixture(), cache = new FigureCache<{ blob: Blob }>(8, 3), key = figureSourceKey(figure);
  const first = { blob: new Blob(['123']) }; cache.set(key, 'pdf-figure', first); assert.equal(cache.get(key), first);
  cache.set('second', 'pdf-two', { blob: new Blob(['456']) }); cache.get(key); cache.set('third', 'pdf-two', { blob: new Blob(['789']) });
  assert.equal(cache.bytes, 6); assert.equal(cache.get('second'), undefined); assert.equal(cache.get(key), first);
  cache.dropSource('pdf-figure'); assert.equal(cache.bytes, 3); assert.equal(cache.get(key), undefined);
  cache.clear(); assert.equal(cache.bytes, 0); assert.equal(cache.size, 0);
});
