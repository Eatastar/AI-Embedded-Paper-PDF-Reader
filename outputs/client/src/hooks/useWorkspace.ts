import { useCallback, useEffect, useRef, useState } from 'react';
import type { Workspace } from '../domain/types';
import { exportWorkspaceWithFiles, loadWorkspace, restoreWorkspaceWithFiles, saveWorkspace, saveWorkspaceAndPruneFiles } from '../adapters/storage';
import { WorkspaceSession } from '../adapters/workspace-session';
import { desktop } from '../adapters/desktop';
import { permanentlyDelete } from '../domain/trash';
import type { TrashTarget } from '../domain/trash';

export function useWorkspace() {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [loadError, setLoadError] = useState('');
  const [saveStatus, setSaveStatus] = useState('已保存在本机');
  const current = useRef<Workspace | null>(null);
  const [backupWarning, setBackupWarning] = useState('');
  const [lastBackup, setLastBackup] = useState<number>();
  const session = useRef<WorkspaceSession | null>(null);
  if (!session.current) session.current = new WorkspaceSession({ save: saveWorkspace, onChange: value => { current.current = value; setWorkspace(value); }, onStatus: setSaveStatus });
  const backupRevision = useRef(-1);
  const backupQueue = useRef(Promise.resolve());
  const flush = useCallback(() => session.current!.flush(), []);
  const checkpoint = useCallback(async () => {
    if (!desktop() || !current.current) return;
    const result = backupQueue.current.catch(() => {}).then(async () => {
      await flush();
      const revision = session.current!.revision;
      if (revision === backupRevision.current) return;
      const entry = await desktop()!.backups.write(await exportWorkspaceWithFiles(current.current!));
      backupRevision.current = revision;
      setLastBackup(entry.createdAt); setBackupWarning('');
    });
    backupQueue.current = result;
    try { await result; } catch (error) { setBackupWarning('自动备份未完成，当前记录仍在本机。请在“备份与恢复”中重试或导出备份。'); throw error; }
  }, [flush]);
  useEffect(() => {
    let alive = true;
    loadWorkspace().then(data => {
      if (!alive) return;
      session.current!.load(data);
    }).catch(() => { if (alive) setLoadError('无法打开本地记录。原记录仍保留在本机，可以从备份恢复，或重启后再试。'); });
    const saveOnHide = () => { void flush().catch(() => {}); };
    window.addEventListener('pagehide', saveOnHide);
    const interval = setInterval(() => { void checkpoint().catch(() => {}); }, 60_000);
    return () => {
      alive = false;
      window.removeEventListener('pagehide', saveOnHide);
      clearInterval(interval);
      session.current!.dispose();
    };
  }, [flush, checkpoint]);
  useEffect(() => {
    if (!workspace || loadError) return;
    const timer = setTimeout(() => { void checkpoint().catch(() => {}); }, 3000);
    return () => clearTimeout(timer);
  }, [workspace, loadError, checkpoint]);
  const update = useCallback((change: (previous: Workspace) => Workspace) => session.current!.update(change), []);
  const purge = useCallback((target: TrashTarget) => session.current!.commit(previous => permanentlyDelete(previous, target), saveWorkspaceAndPruneFiles), []);
  const recover = useCallback(async (text: string) => {
    const restored = await restoreWorkspaceWithFiles(text);
    session.current!.load(restored);
    setLoadError(''); backupRevision.current = -1;
  }, []);
  return { workspace, current, update, saveStatus, loadError, flush, checkpoint, recover, purge, backupWarning, lastBackup };
}
