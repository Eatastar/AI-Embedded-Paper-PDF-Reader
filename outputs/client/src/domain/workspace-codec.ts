import type { Annotation, AnnotationAttempt, ChatMessage, Conversation, DocumentAttachment, DocumentPage, InputMessage, MessageVersion, Workspace } from './types';
import { contentHash, contextMessageId, freezeContext, internMessage } from './context-pool';
import { MAX_DOCUMENT_PAGES } from './document-limits';

export const RECORD_PREFIX = '$ls2:';
export type RecordKind = 'conversation' | 'message' | 'version' | 'annotation' | 'document' | 'page' | 'input' | 'context';
export interface WorkspaceRecord { id: string; kind: RecordKind; data: Record<string, unknown> }
export interface CompactHeader { schemaVersion: 2; conversationIds: string[]; activeConversationId: string }
export interface CompactWorkspace extends CompactHeader { records: WorkspaceRecord[] }
interface Group { row: WorkspaceRecord; json: string; bytes: number; children: Group[] }
interface ContextReference { prefix: string; tail: string }
interface ContextGroup { reference: ContextReference; children: Group[] }
export interface PackedWorkspace { header: CompactHeader; rows: WorkspaceRecord[]; groups: Map<string, Group>; bytes: number }
const encoder = new TextEncoder();
const key = (kind: RecordKind, id: string) => RECORD_PREFIX + kind + ':' + id;
const pick = (object: object, names: string[]): Record<string, unknown> => Object.fromEntries(names.filter(name => (object as Record<string, unknown>)[name] !== undefined).map(name => [name, (object as Record<string, unknown>)[name]]));

/** Known-field records and content-addressed immutable context. A graph walk visits
 * shared prefixes only once; unchanged records keep their encoded bytes in a cache. */
export class WorkspaceCodec {
  private cache = new WeakMap<object, Group>();
  private contextCache = new WeakMap<InputMessage[], ContextGroup>();
  private prefixes = new Map<string, WeakRef<Group>>();
  private prefixCleanup = new FinalizationRegistry<{ id: string; ref: WeakRef<Group> }>(entry => { if (this.prefixes.get(entry.id) === entry.ref) this.prefixes.delete(entry.id); });
  private group(kind: RecordKind, id: string, data: Record<string, unknown>, children: Group[] = []): Group {
    const row = { id: key(kind, id), kind, data }, json = JSON.stringify(row);
    return { row, json, bytes: encoder.encode(json).byteLength, children };
  }
  private memo(value: object, create: () => Group): Group {
    const cached = this.cache.get(value); if (cached) return cached;
    const group = create(); this.cache.set(value, group); return group;
  }
  private input(message: InputMessage): Group {
    const shared = internMessage(message);
    return this.memo(shared, () => this.group('input', contextMessageId(shared), { role: shared.role, content: shared.content }));
  }
  private context(messages: InputMessage[]): ContextGroup {
    const cached = this.contextCache.get(messages); if (cached) return cached;
    const shared = freezeContext(messages);
    const prefix = shared.slice(0, -1), ids = prefix.map(contextMessageId), id = contentHash(JSON.stringify(ids));
    let group = this.prefixes.get(id)?.deref();
    if (!group) {
      group = this.group('context', id, { messages: ids }, prefix.map(message => this.input(message)));
      const ref = new WeakRef(group); this.prefixes.set(id, ref); this.prefixCleanup.register(group, { id, ref });
    }
    // Empty legacy contexts are valid and must round-trip without fabricating input.
    const tail = shared.at(-1);
    const result = { reference: { prefix: id, tail: tail ? contextMessageId(tail) : '' }, children: [group, ...(tail ? [this.input(tail)] : [])] };
    this.contextCache.set(messages, result); return result;
  }
  private version(value: MessageVersion): Group {
    return this.memo(value, () => {
      const context = value.context === undefined ? undefined : this.context(value.context);
      return this.group('version', value.id, { ...pick(value, ['id', 'content', 'createdAt', 'modelLabel', 'error']), status: value.status === 'streaming' ? 'interrupted' : value.status, ...(context ? { contextRef: context.reference } : {}) }, context?.children);
    });
  }
  private message(value: ChatMessage): Group {
    return this.memo(value, () => this.group('message', value.id, { ...pick(value, ['id', 'role', 'activeVersionId', 'annotationReferences']), versionIds: value.versions.map(v => v.id) }, value.versions.map(v => this.version(v))));
  }
  private page(value: DocumentPage): Group { return this.memo(value, () => this.group('page', value.messageId, pick(value, ['pageNumber', 'text', 'messageId', 'versionId']))); }
  private document(value: DocumentAttachment): Group {
    return this.memo(value, () => this.group('document', value.id, { ...pick(value, ['id', 'name', 'kind', 'mimeType', 'size', 'createdAt']), pageIds: value.pages.map(p => p.messageId) }, value.pages.map(p => this.page(p))));
  }
  private annotation(value: Annotation): Group {
    return this.memo(value, () => {
      const data = { ...pick(value, ['id', 'conversationId', 'messageId', 'versionId', 'quote', 'anchor', 'color', 'question', 'answer', 'mode', 'note', 'originalQuestion', 'originalAnswer', 'edited', 'createdAt', 'updatedAt', 'error', 'deletedAt', 'requestPreference', 'documentContextMode']), status: value.status === 'generating' ? 'interrupted' : value.status };
      const children: Group[] = [];
      const attach = (target: Record<string, unknown>, context?: InputMessage[]) => {
        if (!context) return;
        const group = this.context(context); target.contextRef = group.reference; children.push(...group.children);
      };
      attach(data, value.context);
      if (value.reask) {
        const attempt = { ...pick(value.reask, ['question', 'answer', 'error', 'requestPreference', 'documentContextMode']), status: value.reask.status === 'generating' ? 'interrupted' : value.reask.status };
        attach(attempt, value.reask.context); (data as Record<string, unknown>).reask = attempt;
      }
      return this.group('annotation', value.id, data, children);
    });
  }
  private conversation(value: Conversation): Group {
    return this.memo(value, () => this.group('conversation', value.id, {
      ...pick(value, ['id', 'title', 'createdAt', 'updatedAt', 'deletedAt']), messageIds: value.messages.map(m => m.id), annotationIds: value.annotations.map(a => a.id),
      ...(value.documents !== undefined ? { documentIds: value.documents.map(d => d.id) } : {}),
    }, [...value.messages.map(m => this.message(m)), ...value.annotations.map(a => this.annotation(a)), ...(value.documents || []).map(d => this.document(d))]));
  }
  pack(workspace: Workspace): PackedWorkspace {
    const groups = new Map<string, Group>(), visited = new Set<Group>();
    const visit = (group: Group) => {
      if (visited.has(group)) return; visited.add(group);
      const existing = groups.get(group.row.id);
      if (existing && existing.json !== group.json) throw new Error('保存记录包含重复且不一致的标识。');
      groups.set(group.row.id, group); group.children.forEach(visit);
    };
    workspace.conversations.forEach(c => visit(this.conversation(c)));
    const header: CompactHeader = { schemaVersion: 2, activeConversationId: workspace.activeConversationId, conversationIds: workspace.conversations.map(c => c.id) };
    const rows = [...groups.values()].map(group => group.row);
    const bytes = encoder.encode(JSON.stringify({ ...header, records: [] })).byteLength + [...groups.values()].reduce((sum, group) => sum + group.bytes, 0) + Math.max(0, rows.length - 1);
    return { header, rows, groups, bytes };
  }
}

const invalid = (): never => { throw new Error('备份格式无效：记录缺失、重复、损坏或关联不一致。'); };
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) return invalid();
  return value as Record<string, unknown>;
}
function ids(value: unknown, maximum: number): string[] {
  if (!Array.isArray(value) || value.length > maximum || value.some(id => typeof id !== 'string' || id.length > 200)) return invalid();
  return value;
}

/** Decode only reachable known records. Hash checks protect a frozen retry from
 * accidentally resolving to a different message, even after source text changes. */
export function unpackWorkspace(input: unknown): unknown {
  const root = object(input);
  if (root.schemaVersion !== 2 || !Array.isArray(root.records)) return invalid();
  const records = new Map<string, WorkspaceRecord>(), visited = new Set<string>();
  for (const raw of root.records) {
    const row = object(raw);
    if (typeof row.id !== 'string' || !row.id.startsWith(RECORD_PREFIX) || records.has(row.id) || typeof row.kind !== 'string') return invalid();
    records.set(row.id, { id: row.id, kind: row.kind as RecordKind, data: object(row.data) });
  }
  const read = (kind: RecordKind, id: string): Record<string, unknown> => {
    if (typeof id !== 'string') return invalid();
    const record = records.get(key(kind, id));
    if (!record || record.kind !== kind) return invalid();
    if ((kind === 'page' && record.data.messageId !== id) || (!['page', 'input', 'context'].includes(kind) && record.data.id !== id)) return invalid();
    visited.add(record.id); return record.data;
  };
  const decodedInputs = new Map<string, InputMessage>();
  const inputMessage = (id: string): InputMessage => {
    if (!/^[a-f0-9]{64}$/.test(id)) return invalid();
    const cached = decodedInputs.get(id); if (cached) return cached;
    const data = read('input', id);
    if (!['system', 'user', 'assistant'].includes(data.role as string) || typeof data.content !== 'string' || data.content.length > 2_000_000) return invalid();
    const message = internMessage({ role: data.role as InputMessage['role'], content: data.content });
    if (contextMessageId(message) !== id) return invalid();
    decodedInputs.set(id, message); return message;
  };
  const prefixes = new Map<string, InputMessage[]>();
  const context = (raw: unknown): InputMessage[] => {
    const ref = object(raw);
    if (typeof ref.prefix !== 'string' || typeof ref.tail !== 'string' || !/^[a-f0-9]{64}$/.test(ref.prefix)) return invalid();
    let prefix = prefixes.get(ref.prefix);
    if (!prefix) {
      const data = read('context', ref.prefix), sequence = ids(data.messages, 10012);
      if (contentHash(JSON.stringify(sequence)) !== ref.prefix) return invalid();
      prefix = sequence.map(inputMessage); prefixes.set(ref.prefix, prefix);
    }
    return freezeContext([...prefix, ...(ref.tail ? [inputMessage(ref.tail)] : [])]);
  };
  const withContext = (data: Record<string, unknown>, fields: string[]) => ({ ...pick(data, fields), ...(data.contextRef !== undefined ? { context: context(data.contextRef) } : {}) });
  const conversations = ids(root.conversationIds, 1000).map(id => {
    const data = read('conversation', id);
    const messages = ids(data.messageIds, 10000).map(messageId => {
      const m = read('message', messageId);
      return { ...pick(m, ['id', 'role', 'activeVersionId', 'annotationReferences']), versions: ids(m.versionIds, 1000).map(versionId => withContext(read('version', versionId), ['id', 'content', 'status', 'createdAt', 'modelLabel', 'error'])) };
    });
    const documents = data.documentIds === undefined ? undefined : ids(data.documentIds, 10).map(documentId => {
      const d = read('document', documentId);
      return { ...pick(d, ['id', 'name', 'kind', 'mimeType', 'size', 'createdAt']), pages: ids(d.pageIds, MAX_DOCUMENT_PAGES).map(pageId => pick(read('page', pageId), ['pageNumber', 'text', 'messageId', 'versionId'])) };
    });
    const annotations = ids(data.annotationIds, 10000).map(annotationId => {
      const a = read('annotation', annotationId);
      const annotation = withContext(a, ['id', 'conversationId', 'messageId', 'versionId', 'quote', 'anchor', 'color', 'question', 'answer', 'mode', 'note', 'originalQuestion', 'originalAnswer', 'edited', 'status', 'createdAt', 'updatedAt', 'error', 'deletedAt', 'requestPreference', 'documentContextMode']);
      if (a.reask !== undefined) (annotation as Record<string, unknown>).reask = withContext(object(a.reask), ['question', 'answer', 'status', 'error', 'requestPreference', 'documentContextMode']);
      return annotation;
    });
    return { ...pick(data, ['id', 'title', 'createdAt', 'updatedAt', 'deletedAt']), messages, annotations, ...(documents !== undefined ? { documents } : {}) };
  });
  if (visited.size !== records.size) return invalid();
  // The domain validator is applied by the storage boundary after expansion.
  return { schemaVersion: 1, activeConversationId: root.activeConversationId, conversations };
}
