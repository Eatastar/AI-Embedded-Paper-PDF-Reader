// Synthetic metadata only: no personal files, profiles, model calls or PDF rendering.
import { createAnnotation, completeAnnotation, createConversation, makeId, prepareAnnotationRequest, updateAnnotationRequest } from '../src/domain/workspace';
import { WorkspaceCodec } from '../src/domain/workspace-codec';
import type { Workspace } from '../src/domain/types';

const paper = 'Synthetic paper text. '.repeat(50_000).slice(0, 1_000_000);
const interrupted = process.argv.includes('--interrupted');
let conversation = createConversation('Synthetic annotation size benchmark');
conversation.documents = [{
  id: makeId(), name: 'synthetic-paper.pdf', kind: 'pdf', mimeType: 'application/pdf', size: 1024 * 1024, createdAt: 1,
  pages: Array.from({ length: 50 }, (_, index) => ({ pageNumber: index + 1, messageId: makeId(), versionId: makeId(), text: paper.slice(index * 20_000, (index + 1) * 20_000) })),
}];
const page = conversation.documents[0].pages[0], codec = new WorkspaceCodec();
let baselineHeap = 0;
const samples: { annotations: number; metadataBytes: number; inputRecords: number; heapIncreaseMiB: number | null }[] = [];
async function sample() {
  const workspace: Workspace = { schemaVersion: 1, conversations: [conversation], activeConversationId: conversation.id };
  const packed = codec.pack(workspace);
  // Allow weak caches and previous immutable conversation branches to settle.
  for (let pass = 0; pass < 3; pass++) { globalThis.gc?.(); await new Promise<void>(done => setImmediate(done)); }
  const heap = process.memoryUsage().heapUsed;
  if (!samples.length) baselineHeap = heap;
  samples.push({ annotations: conversation.annotations.length, metadataBytes: packed.bytes, inputRecords: packed.rows.filter(row => row.kind === 'input').length, heapIncreaseMiB: globalThis.gc ? Number(((heap - baselineHeap) / 1024 ** 2).toFixed(2)) : null });
}
await sample();
for (let index = 0; index < 1000; index++) {
  const annotation = createAnnotation(conversation, { messageId: page.messageId, versionId: page.versionId, quote: 'Synthetic paper text.', anchor: { quote: 'Synthetic paper text.' }, color: '#ffe099', question: `Synthetic question ${index}` });
  const prepared = prepareAnnotationRequest({ ...conversation, annotations: [...conversation.annotations, annotation] }, annotation.id, '', { mode: 'full' });
  const prefix = `Synthetic answer ${index}. `;
  const answer = prefix + 'Explanation. '.repeat(100).slice(0, 1000 - prefix.length);
  conversation = interrupted ? updateAnnotationRequest(prepared.conversation, annotation.id, answer, { interrupted: true, error: 'Synthetic network interruption.' }) : completeAnnotation(prepared.conversation, annotation.id, answer);
  if ([1, 100, 1000].includes(index + 1)) await sample();
}
console.log(JSON.stringify({
  fixture: { paperCharacters: paper.length, annotations: 1000, answerCharactersEach: 1000, status: interrupted ? 'interrupted' : 'answered', contextMode: 'full', declaredPdfBytes: 1024 * 1024 },
  scope: 'Compact serialized metadata and retained Node JS heap only. PDF bytes, physical database size, renderer/GPU memory and backup files are excluded. The PDF size is a fixture field, not a binary allocation.',
  samples,
}, null, 2));
