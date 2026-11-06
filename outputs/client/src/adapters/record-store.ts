import type Dexie from 'dexie';
import type { EntityTable } from 'dexie';
import type { Workspace } from '../domain/types';
import { compactRequestCaches, createWorkspace, ImportValidationCache, validateImport } from '../domain/workspace';
import { contentHash } from '../domain/context-pool';
import { RECORD_PREFIX, unpackWorkspace, WorkspaceCodec } from '../domain/workspace-codec';
import type { CompactHeader, PackedWorkspace, WorkspaceRecord } from '../domain/workspace-codec';

export interface SavedMetadata {
  id: string; workspace?: unknown; kind?: WorkspaceRecord['kind']; data?: Record<string, unknown>; records?: SavedMetadata[];
}
export interface SavedDocument { id: string; bytes: Uint8Array }
export type WorkspaceDatabase = Dexie & { workspaces: EntityTable<SavedMetadata, 'id'>; documents: EntityTable<SavedDocument, 'id'> };
interface StoredHeader extends CompactHeader { revision: string }
interface WriteOptions {
  trusted?: boolean;
  checkRevision?: boolean;
  replace?: boolean;
  archive?: 'migration' | 'recovery';
  legacyFingerprint?: string;
  expectedMissing?: boolean;
  documentWrites?: SavedDocument[];
  documentDeletes?: string[];
}
export interface StorageWriteMetrics { writtenRecords: number; removedRecords: number; writtenBytes: number; totalRecords: number; metadataBytes: number }
const jsonBytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).byteLength;
const isHeader = (value: unknown): value is StoredHeader => Boolean(value && typeof value === 'object' && (value as StoredHeader).schemaVersion === 2 && typeof (value as StoredHeader).revision === 'string');
const changedElsewhere = () => new Error('本机记录已在另一个窗口更新。请先导出当前未保存内容，再重新打开客户端。');

/** Uses the existing object stores and database version. This keeps an older
 * client able to restore its compatible backup, rather than locking it out with
 * an irreversible IndexedDB version upgrade. The current marker is committed
 * atomically with all changed records and file removals. */
export class WorkspaceRecordStore {
  private codec = new WorkspaceCodec();
  private validation = new ImportValidationCache();
  private previous?: PackedWorkspace;
  private revision?: string;
  private loading?: Promise<Workspace>;
  metrics?: StorageWriteMetrics;
  constructor(private database: WorkspaceDatabase) {}

  load(beforeMigration?: (workspace: Workspace) => Promise<void>): Promise<Workspace> {
    if (this.loading) return this.loading;
    const load = async () => {
      const saved = await this.database.transaction('r', this.database.workspaces, async () => {
        const current = await this.database.workspaces.get('current');
        const rows = await this.database.workspaces.where('id').startsWith(RECORD_PREFIX).toArray();
        return { current, rows };
      });
      if (!saved.current) {
        if (saved.rows.length) throw new Error('备份格式无效：本机记录索引缺失，请从备份恢复。');
        const initial = createWorkspace(); await this.write(initial, { expectedMissing: true }); return initial;
      }
      if (isHeader(saved.current.workspace)) {
        const clean = validateImport(unpackWorkspace({ ...saved.current.workspace, records: saved.rows }));
        this.previous = this.codec.pack(clean); this.revision = saved.current.workspace.revision;
        const compact = compactRequestCaches(clean);
        if (compact !== clean) await this.write(compact, { trusted: true });
        return compact;
      }
      const clean = validateImport(saved.current.workspace);
      const fingerprint = contentHash(JSON.stringify(saved.current.workspace));
      if (beforeMigration) {
        try { await beforeMigration(clean); }
        catch { throw new Error('升级前备份未完成，原记录尚未更改。请先用旧版导出完整备份，再重新打开新版。'); }
      }
      const compact = compactRequestCaches(clean);
      await this.write(compact, { archive: 'migration', legacyFingerprint: fingerprint });
      return compact;
    };
    this.loading = load().finally(() => { this.loading = undefined; });
    return this.loading;
  }

  async write(workspace: Workspace, options: WriteOptions = {}): Promise<void> {
    const clean = validateImport(workspace, options.trusted ? this.validation : undefined);
    const packed = this.codec.pack(clean);
    const expectedRevision = this.revision, expectedPlan = this.previous;
    const header: StoredHeader = { ...packed.header, revision: crypto.randomUUID() };
    const marker: SavedMetadata = { id: 'current', workspace: header };
    let metrics!: StorageWriteMetrics;
    await this.database.transaction('rw', this.database.workspaces, this.database.documents, async () => {
      const current = await this.database.workspaces.get('current');
      const actualRevision = isHeader(current?.workspace) ? current.workspace.revision : undefined;
      if (options.expectedMissing && current) throw changedElsewhere();
      if (options.legacyFingerprint && (!current || contentHash(JSON.stringify(current.workspace)) !== options.legacyFingerprint)) throw changedElsewhere();
      if (!options.replace && (options.trusted || options.checkRevision) && expectedRevision !== actualRevision) throw changedElsewhere();
      const forceRows = options.replace || options.archive === 'migration';
      const cached = !forceRows && actualRevision !== undefined && actualRevision === expectedRevision && expectedPlan;
      const oldRows = cached ? undefined : await this.database.workspaces.where('id').startsWith(RECORD_PREFIX).toArray();
      const oldJson = cached ? new Map([...cached.groups].map(([id, group]) => [id, group.json]))
        : new Map((oldRows || []).map(row => [row.id, forceRows ? '' : JSON.stringify(row)]));
      if (options.archive && current) {
        const archiveRows = isHeader(current.workspace) ? oldRows || await this.database.workspaces.where('id').startsWith(RECORD_PREFIX).toArray() : undefined;
        await this.database.workspaces.put({ id: `${options.archive}-archive-${Date.now()}-${crypto.randomUUID()}`, workspace: current.workspace, ...(archiveRows ? { records: archiveRows } : {}) });
        const names = await this.database.workspaces.where('id').startsWith(options.archive + '-archive-').primaryKeys();
        names.sort((a, b) => String(b).localeCompare(String(a)));
        await this.database.workspaces.bulkDelete(names.slice(options.archive === 'migration' ? 2 : 3));
      }
      const changed = packed.rows.filter(row => forceRows || oldJson.get(row.id) !== packed.groups.get(row.id)!.json);
      const removed = [...oldJson.keys()].filter(id => !packed.groups.has(id));
      if (changed.length) await this.database.workspaces.bulkPut(changed);
      if (removed.length) await this.database.workspaces.bulkDelete(removed);
      for (const file of options.documentWrites || []) await this.database.documents.put({ id: file.id, bytes: new Uint8Array(file.bytes) });
      if (options.documentDeletes?.length) await this.database.documents.bulkDelete(options.documentDeletes);
      await this.database.workspaces.put(marker);
      metrics = { writtenRecords: changed.length + 1, removedRecords: removed.length, writtenBytes: jsonBytes(marker) + changed.reduce((sum, row) => sum + packed.groups.get(row.id)!.bytes, 0), totalRecords: packed.rows.length + 1, metadataBytes: packed.bytes };
    });
    // A rejected transaction never changes this cache or the visible live state.
    this.previous = packed; this.revision = header.revision; this.metrics = metrics;
  }
}
