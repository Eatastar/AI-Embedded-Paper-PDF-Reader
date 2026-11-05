import { useCallback, useEffect, useRef, useState } from 'react';
import type { Workspace } from '../domain/types';
import { loadWorkspace, saveWorkspace } from '../adapters/storage';

export function useWorkspace() {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [loadError, setLoadError] = useState('');
  const [saveStatus, setSaveStatus] = useState('已保存在本机');
  const current = useRef<Workspace | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queue = useRef(Promise.resolve());
  const revision = useRef(0);
  const persist = useCallback(() => {
    if (!current.current) return;
    const snapshot = structuredClone(current.current);
    const savedRevision = revision.current;
    queue.current = queue.current.catch(() => {}).then(() => saveWorkspace(snapshot)).then(() => {
      if (savedRevision === revision.current) setSaveStatus('已保存在本机');
    }).catch(() => setSaveStatus('保存失败，请先导出备份'));
  }, []);
  useEffect(() => {
    let alive = true;
    loadWorkspace().then(data => {
      if (!alive) return;
      current.current = data;
      setWorkspace(data);
      setSaveStatus('已保存在本机');
    }).catch(() => { if (alive) setLoadError('无法打开本地记录。请检查浏览器是否允许本地存储，然后刷新重试。'); });
    const flush = () => persist();
    window.addEventListener('pagehide', flush);
    return () => {
      alive = false;
      window.removeEventListener('pagehide', flush);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [persist]);
  const update = useCallback((change: (previous: Workspace) => Workspace) => {
    if (!current.current) throw new Error('正在读取本地记录。');
    const next = change(current.current);
    current.current = next;
    revision.current += 1;
    setWorkspace(next);
    setSaveStatus('正在保存…');
    if (!timer.current) {
      timer.current = setTimeout(() => { timer.current = null; persist(); }, 180);
    }
    return next;
  }, [persist]);
  return { workspace, current, update, saveStatus, loadError };
}
