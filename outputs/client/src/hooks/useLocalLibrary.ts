import { useEffect, useMemo, useRef, useState } from 'react';
import type { Workspace } from '../domain/types';
import { LocalDocumentIndex, localDocumentReferences, recentReadingGroups, recordRecentReading, setRecentReadingHidden } from '../domain/local-library';
import type { LocalDocumentGroup, RecentReadingPreferences } from '../domain/local-library';
import { getDocumentBytes } from '../adapters/storage';
import { loadRecentReading, saveRecentReading } from '../adapters/reader-session';

export function useLocalLibrary(workspace: Workspace | null) {
  const [index] = useState(() => new LocalDocumentIndex());
  const [groups, setGroups] = useState<LocalDocumentGroup[]>([]), [loading, setLoading] = useState(false), [revision, setRevision] = useState(0);
  const [preferences, setPreferences] = useState(() => loadRecentReading());
  const currentPreferences = useRef(preferences);
  const recent = useMemo(() => recentReadingGroups(groups, preferences), [groups, preferences]);
  function updateRecent(next: RecentReadingPreferences) {
    if (next === currentPreferences.current) return true;
    currentPreferences.current = next;
    setPreferences(next);
    return saveRecentReading(next);
  }
  const refs = localDocumentReferences(workspace), latest = useRef(refs); latest.current = refs;
  const signature = JSON.stringify(refs.map(ref => [ref.conversationId, ref.document.id, ref.document.kind, ref.document.size, ref.document.createdAt]));
  useEffect(() => {
    const controller = new AbortController(); setLoading(true);
    void index.group(latest.current, getDocumentBytes, controller.signal).then(value => { if (!controller.signal.aborted) { setGroups(value); setLoading(false); } }).catch(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [index, signature, revision]);
  return {
    index, groups, recent, loading,
    recordOpen: (id: string) => updateRecent(recordRecentReading(currentPreferences.current, id)),
    setRecentHidden: (selection: LocalDocumentGroup[], hide: boolean) => updateRecent(setRecentReadingHidden(currentPreferences.current, selection, hide)),
    refresh: () => { index.clear(); setRevision(value => value + 1); },
  };
}
