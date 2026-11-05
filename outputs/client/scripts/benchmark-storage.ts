// Synthetic data only; fake-indexeddb never opens the user's browser database.
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { performance } from 'node:perf_hooks';
import { WorkspaceRecordStore } from '../src/adapters/record-store';
import type { WorkspaceDatabase } from '../src/adapters/record-store';
import { WorkspaceCodec } from '../src/domain/workspace-codec';
import { changeAnnotationReask, completeAnnotation, createAnnotation, createAssistantMessage, createConversation, createUserMessage, makeId, prepareAnnotationRequest, updateAnnotationRequest, validateImport } from '../src/domain/workspace';
import type { Workspace } from '../src/domain/types';

let conversation = createConversation('Synthetic storage benchmark');
conversation.messages = [createUserMessage('Explain this paper'), createAssistantMessage('A synthetic explanation with a highlighted term.', 'complete')];
conversation.documents = [{ id: makeId(), name: 'synthetic.txt', kind: 'text', mimeType: 'text/plain', size: 1_000_000, createdAt: 1, pages: [{ pageNumber: 1, messageId: makeId(), versionId: makeId(), text: 'A'.repeat(1_000_000) }] }];
for (let i = 0; i < 10; i++) {
  const annotation = createAnnotation(conversation, { messageId: conversation.messages[1].id, versionId: conversation.messages[1].activeVersionId, quote: 'highlighted term', anchor: { quote: 'highlighted term' }, color: '#ffe099', question: `Question ${i}` });
  conversation = completeAnnotation(prepareAnnotationRequest({ ...conversation, annotations: [...conversation.annotations, annotation] }, annotation.id).conversation, annotation.id, `Answer ${i}`);
}
let workspace: Workspace = { schemaVersion: 1, activeConversationId: conversation.id, conversations: [conversation] };
const legacyMetadataBytes = Buffer.byteLength(JSON.stringify(validateImport(workspace)));
const packed = new WorkspaceCodec().pack(workspace);
const db = new Dexie('learn-benchmark-' + makeId()) as WorkspaceDatabase;
db.version(1).stores({ workspaces: 'id' }); db.version(2).stores({ workspaces: 'id', documents: 'id' });
try {
  const store = new WorkspaceRecordStore(db);
  await store.write(workspace);
  const annotationId = conversation.annotations[0].id;
  workspace = { ...workspace, conversations: [prepareAnnotationRequest(changeAnnotationReask(conversation, annotationId, 'start'), annotationId).conversation] };
  await store.write(workspace, { trusted: true });
  const writes: NonNullable<WorkspaceRecordStore['metrics']>[] = [];
  const started = performance.now();
  for (let i = 1; i <= 30; i++) {
    workspace = { ...workspace, conversations: [updateAnnotationRequest(workspace.conversations[0], annotationId, 'streamed answer '.repeat(i))] };
    await store.write(workspace, { trusted: true }); writes.push({ ...store.metrics! });
  }
  console.log(JSON.stringify({
    fixture: { documentCharacters: 1_000_000, annotations: 10, streamedWrites: 30, storage: 'isolated fake-indexeddb; serialized metadata bytes, not physical disk usage' },
    legacyMetadataBytes, compactMetadataBytes: packed.bytes, reductionPercent: Number(((1 - packed.bytes / legacyMetadataBytes) * 100).toFixed(2)),
    sharedContextPrefixes: packed.rows.filter(row => row.kind === 'context').length,
    stream: { maxWrittenRecords: Math.max(...writes.map(w => w.writtenRecords)), maxWrittenBytes: Math.max(...writes.map(w => w.writtenBytes)), totalWrittenBytes: writes.reduce((sum, w) => sum + w.writtenBytes, 0), elapsedMs: Number((performance.now() - started).toFixed(2)) },
  }, null, 2));
} finally { db.close(); await db.delete(); }
