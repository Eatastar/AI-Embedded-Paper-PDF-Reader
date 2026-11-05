import Dexie, { type EntityTable } from 'dexie';
import type { Workspace } from '../domain/types';
import { createWorkspace, validateImport, mergeImportedWorkspace } from '../domain/workspace';

interface SavedWorkspace { id: string; workspace: Workspace }
interface SavedDocument { id: string; bytes: Uint8Array }
const database = new Dexie('margin-chat-workspace') as Dexie & { workspaces: EntityTable<SavedWorkspace, 'id'>; documents: EntityTable<SavedDocument, 'id'> };
database.version(1).stores({ workspaces: 'id' });
database.version(2).stores({ workspaces: 'id', documents: 'id' });

export async function saveDocumentBytes(id: string, bytes: Uint8Array): Promise<void> {
  if (!id || bytes.byteLength > 25 * 1024 * 1024) throw new Error('附件大小不得超过 25 MB。');
  await database.documents.put({ id, bytes: new Uint8Array(bytes) });
}

export async function getDocumentBytes(id: string): Promise<Uint8Array | undefined> {
  const saved = await database.documents.get(id);
  return saved ? new Uint8Array(saved.bytes) : undefined;
}

export async function loadWorkspace(): Promise<Workspace> {
  const saved = await database.workspaces.get('current');
  return saved ? validateImport(saved.workspace) : createWorkspace();
}

export async function saveWorkspace(workspace: Workspace): Promise<void> {
  // Persist only known data fields. Running copies are stored as interrupted because
  // no network request can survive a page reload; the live UI object stays untouched.
  const clean = validateImport(workspace);
  await database.workspaces.put({ id: 'current', workspace: clean });
}

export function exportWorkspace(workspace: Workspace): string {
  return JSON.stringify(validateImport(workspace), null, 2);
}

function parseBackupData(text: string): unknown {
  if (typeof text !== 'string' || text.length > 350_000_000) throw new Error('备份超过 350 MB，或格式无效。');
  let data: unknown;
  try { data = JSON.parse(text); } catch { throw new Error('无法读取备份，请选择有效的 JSON 文件。'); }
  return data;
}
export function parseWorkspace(text: string): Workspace { return validateImport(parseBackupData(text)); }

function base64(bytes: Uint8Array): string {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 32768) binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
  return btoa(binary);
}

/** Binary files are read only for a backup; streaming chat saves never clone them. */
export async function exportWorkspaceWithFiles(workspace: Workspace): Promise<string> {
  const clean = validateImport(workspace);
  const metadataSize = new TextEncoder().encode(JSON.stringify(clean)).byteLength;
  const binarySize = clean.conversations.flatMap(c => c.documents || []).reduce((sum, document) => sum + Math.ceil(document.size / 3) * 4 + new TextEncoder().encode(JSON.stringify(document.id)).byteLength + 64, 0);
  if (metadataSize + binarySize + 64 > 350_000_000) throw new Error('完整备份超过 350 MB。请分别备份较小范围的对话，附件原文件仍保存在本机。');
  const documentFiles = [];
  for (const conversation of clean.conversations) for (const document of conversation.documents || []) {
    const bytes = await getDocumentBytes(document.id);
    if (!bytes || bytes.length !== document.size) throw new Error(`无法读取附件“${document.name}”，未生成不完整备份。`);
    documentFiles.push({ documentId: document.id, data: base64(bytes) });
  }
  return JSON.stringify({ ...clean, ...(documentFiles.length ? { documentFiles } : {}) });
}

/** Validate every file before saving any; remap files with their imported document IDs. */
export async function importWorkspaceWithFiles(text: string, current: Workspace): Promise<Workspace> {
  const raw = parseBackupData(text) as { documentFiles?: unknown };
  const imported = validateImport(raw);
  const documents = imported.conversations.flatMap(c => c.documents || []);
  const files = raw.documentFiles === undefined ? [] : raw.documentFiles;
  if (!Array.isArray(files) || files.length !== documents.length) throw new Error('备份缺少附件原文件，或附件列表不完整。');
  const decoded = new Map<string, Uint8Array>();
  for (const file of files) {
    if (!file || typeof file !== 'object' || typeof file.documentId !== 'string' || typeof file.data !== 'string' || decoded.has(file.documentId)) throw new Error('备份附件格式无效。');
    const document = documents.find(d => d.id === file.documentId);
    if (!document || file.data.length !== Math.ceil(document.size / 3) * 4 || file.data.length > 35_000_000) throw new Error('备份附件格式无效。');
    const padding = document.size % 3 === 0 ? '' : document.size % 3 === 1 ? '==' : '=';
    const contentLength = file.data.length - padding.length;
    if ((padding && !file.data.endsWith(padding)) || /[^A-Za-z0-9+/]/.test(file.data.slice(0, contentLength))) throw new Error('备份附件格式无效。');
    let bytes: Uint8Array;
    try { bytes = Uint8Array.from(atob(file.data), char => char.charCodeAt(0)); } catch { throw new Error('备份附件数据无法读取。'); }
    if (bytes.length !== document.size || bytes.length > 25 * 1024 * 1024) throw new Error('备份附件大小与记录不一致。');
    if (document.kind === 'pdf' && !new TextDecoder().decode(bytes.subarray(0, 1024)).includes('%PDF-')) throw new Error('备份中的 PDF 原文件无效。');
    decoded.set(document.id, bytes);
  }
  const remapped = new Map<string, string>();
  const merged = mergeImportedWorkspace(current, imported, (oldId, newId) => remapped.set(oldId, newId));
  // One transaction keeps failed imports from leaving partial binary attachments.
  await database.transaction('rw', database.documents, async () => {
    for (const [oldId, bytes] of decoded) await saveDocumentBytes(remapped.get(oldId)!, bytes);
  });
  return merged;
}
