import { useEffect, useRef, useState } from 'react';
import type { Workspace } from '../domain/types';
import { LocalDocumentIndex, localDocumentReferences } from '../domain/local-library';
import type { LocalDocumentGroup } from '../domain/local-library';
import { getDocumentBytes } from '../adapters/storage';

export function useLocalLibrary(workspace: Workspace | null) {
  const [index] = useState(() => new LocalDocumentIndex());
  const [groups, setGroups] = useState<LocalDocumentGroup[]>([]), [loading, setLoading] = useState(false), [revision, setRevision] = useState(0);
  const refs = localDocumentReferences(workspace), latest = useRef(refs); latest.current = refs;
  const signature = JSON.stringify(refs.map(ref => [ref.conversationId, ref.document.id, ref.document.kind, ref.document.size, ref.document.createdAt]));
  useEffect(() => {
    const controller = new AbortController(); setLoading(true);
    void index.group(latest.current, getDocumentBytes, controller.signal).then(value => { if (!controller.signal.aborted) { setGroups(value); setLoading(false); } }).catch(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [index, signature, revision]);
  return { index, groups, loading, refresh: () => { index.clear(); setRevision(value => value + 1); } };
}
