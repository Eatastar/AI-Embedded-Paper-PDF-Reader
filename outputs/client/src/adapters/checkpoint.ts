import type { Workspace } from '../domain/types';
import { desktop, type DesktopBridge } from './desktop';
import { exportWorkspace, exportWorkspaceWithFiles, getDocumentBytes } from './storage';

export const BACKUP_CHUNK_BYTES = 256 * 1024;
/** One attachment read at a time, bounded IPC, no full-file Base64 or full backup
 * string in the renderer. The desktop deduplicates local attachment copies;
 * older bridges retain their complete-JSON fallback. */
export async function writeLocalCheckpoint(workspace: Workspace, options: { compact?: boolean; baseline?: boolean; upgrade?: boolean } = {}, bridge: DesktopBridge | undefined = desktop()) {
  if (!bridge) throw new Error('本机备份不可用。');
  const backup = bridge.backups;
  if (!backup.begin || !backup.append || !backup.finish || !backup.abort) {
    const text = await exportWorkspaceWithFiles(workspace, { compact: options.compact !== false });
    return options.baseline ? backup.baseline(text) : backup.write(text);
  }
  const documents = workspace.conversations.flatMap(item => item.documents || []);
  const id = await backup.begin({ metadata: exportWorkspace(workspace, { compact: options.compact !== false }), files: documents.map(item => ({ documentId: item.id, size: item.size })), baseline: options.baseline, upgrade: options.upgrade });
  try {
    for (let index = 0; index < documents.length; index++) {
      const document = documents[index], bytes = await getDocumentBytes(document.id);
      if (!bytes || bytes.length !== document.size) throw new Error(`无法读取附件“${document.name}”，未生成不完整备份。`);
      // IPC clones the entire backing ArrayBuffer of a typed-array view. Each
      // chunk must own a small buffer, rather than view the whole PDF buffer.
      for (let offset = 0; offset < bytes.length; offset += BACKUP_CHUNK_BYTES) await backup.append({ id, index, bytes: bytes.slice(offset, offset + BACKUP_CHUNK_BYTES) });
    }
    return await backup.finish(id);
  } catch (error) { await backup.abort(id).catch(() => {}); throw error; }
}
