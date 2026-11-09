import { useCallback, useEffect, useRef, useState } from 'react';
import type { Workspace } from '../domain/types';
import { loadWorkspace, restoreWorkspaceWithFiles, saveWorkspace, saveWorkspaceAndPruneFiles } from '../adapters/storage';
import { WorkspaceSession } from '../adapters/workspace-session';
import { desktop } from '../adapters/desktop';
import { permanentlyDelete } from '../domain/trash';
import type { TrashTarget } from '../domain/trash';
import { deleteChatTurn, deleteChatTurns } from '../domain/workspace';
import { writeLocalCheckpoint } from '../adapters/checkpoint';

export const AUTOMATIC_BACKUP_INTERVAL_MS = 10 * 60_000;

export function useWorkspace() {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [loadError, setLoadError] = useState('');
  const [saveStatus, setSaveStatus] = useState('已保存在本机');
  const current = useRef<Workspace | null>(null);
  const [backupWarning, setBackupWarning] = useState('');
  const [lastBackup, setLastBackup] = useState<number>();
  const session = useRef<WorkspaceSession | null>(null);
  if (!session.current) session.current = new WorkspaceSession({ save: value => saveWorkspace(value, { trusted: true }), onChange: value => { current.current = value; setWorkspace(value); }, onStatus: setSaveStatus });
  const backupRevision = useRef(-1);
  const backupQueue = useRef(Promise.resolve());
  const flush = useCallback(() => session.current!.flush(), []);
  const checkpoint = useCallback(async (options: { force?: boolean } = {}) => {
    if (!desktop() || !current.current) return;
    const result = backupQueue.current.catch(() => {}).then(async () => {
      await flush();
      const revision = session.current!.revision;
      if (!options.force && revision === backupRevision.current) return;
      const entry = await writeLocalCheckpoint(current.current!);
      backupRevision.current = revision;
      setLastBackup(entry.createdAt); setBackupWarning('');
    });
    backupQueue.current = result;
    try { await result; } catch (error) { setBackupWarning('自动备份未完成，当前记录仍在本机。请在“备份与恢复”中重试或导出备份。'); throw error; }
  }, [flush]);
  useEffect(() => {
    let alive = true;
    loadWorkspace(async previous => {
      if (desktop()) await writeLocalCheckpoint(previous, { compact: false, baseline: true, upgrade: true });
    }, async previous => {
      if (await desktop()?.backups.upgradeNeeded?.()) await writeLocalCheckpoint(previous, { upgrade: true });
    }).then(data => {
      if (!alive) return;
      session.current!.load(data);
    }).catch(error => { if (alive) setLoadError(error instanceof Error && error.message.startsWith('升级前备份') ? error.message : '无法打开本地记录。原记录仍保留在本机，可以从备份恢复，或重启后再试。'); });
    const saveOnHide = () => { void flush().catch(() => {}); };
    window.addEventListener('pagehide', saveOnHide);
    const interval = setInterval(() => { void checkpoint().catch(() => {}); }, AUTOMATIC_BACKUP_INTERVAL_MS);
    return () => {
      alive = false;
      window.removeEventListener('pagehide', saveOnHide);
      clearInterval(interval);
      session.current!.dispose();
    };
  }, [flush, checkpoint]);
  const invalidateCheckpoint = useCallback(() => { backupRevision.current = -1; setLastBackup(undefined); }, []);
  const update = useCallback((change: (previous: Workspace) => Workspace) => session.current!.update(change), []);
  const purge = useCallback((target: TrashTarget) => session.current!.commit(previous => permanentlyDelete(previous, target), saveWorkspaceAndPruneFiles), []);
  const removeChatTurn = useCallback((conversationId: string, messageId: string) => session.current!.commit(previous => deleteChatTurn(previous, conversationId, messageId), saveWorkspaceAndPruneFiles, '正在删除本轮对话…'), []);
  const removeChatTurns = useCallback((conversationId: string, messageIds: readonly string[]) => session.current!.commit(previous => deleteChatTurns(previous, conversationId, messageIds), saveWorkspaceAndPruneFiles, '正在删除所选对话…'), []);
  const recover = useCallback(async (text: string) => {
    const restored = await restoreWorkspaceWithFiles(text);
    session.current!.load(restored);
    setLoadError(''); backupRevision.current = -1;
  }, []);
  return { workspace, current, update, saveStatus, loadError, flush, checkpoint, invalidateCheckpoint, recover, purge, removeChatTurn, removeChatTurns, backupWarning, lastBackup };
}
