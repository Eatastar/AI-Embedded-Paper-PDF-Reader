import { BookOpen, FileText, FolderOpen, MessageSquare, Settings2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { Conversation } from '../domain/types';
import type { LocalDocumentGroup, LocalDocumentReference } from '../domain/local-library';
import { fileAnnotationCounter } from '../domain/local-library';
import './documents.css';

interface Props {
  groups: LocalDocumentGroup[]; conversations: Conversation[]; busy: boolean; loading: boolean;
  onOpenFile: () => void; onOpenDocument: (group: LocalDocumentGroup, ref?: LocalDocumentReference) => void;
  onChat: () => void; onSettings: () => void;
}
export function ReaderHome({ groups, conversations, busy, loading, onOpenFile, onOpenDocument, onChat, onSettings }: Props) {
  const [limit, setLimit] = useState(50);
  const countNotes = useMemo(() => fileAnnotationCounter(conversations), [conversations]);
  return <section className="reader-home" aria-label="本地阅读器" data-testid="reader-home">
    <header className="reader-home-toolbar"><span><BookOpen size={17} />learn something</span><div><button type="button" className="document-icon-button" aria-label="模型与设置" title="模型与设置" onClick={onSettings}><Settings2 size={18} /></button><button type="button" className="document-icon-button" aria-label="打开对话" title="需要时打开对话" onClick={onChat}><MessageSquare size={18} /></button></div></header>
    <div className="reader-home-content"><div className="reader-home-intro"><BookOpen size={29} /><h1>打开一篇，慢慢读。</h1><p>从本地选择 PDF，直接阅读、划词提问或记下想法。</p><button type="button" className="reader-open-file" disabled={busy} onClick={onOpenFile}><FolderOpen size={18} />{busy ? '正在打开…' : '打开本地 PDF'}</button></div>
      <section className="reader-recent" aria-label="本地阅读记录"><header><h2>最近阅读</h2><span>{loading ? '正在整理…' : `${groups.length} 份文件`}</span></header>
        {!loading && !groups.length && <p className="reader-recent-empty">读过的文件和批注会留在这里。</p>}
        <ul>{groups.slice(0, limit).map(group => {
          const ref = group.references[0], document = ref.document, notes = countNotes(group.references);
          const owners = [...new Set(group.references.map(r => r.conversationId))].map(id => group.references.filter(r => r.conversationId === id));
          return <li key={group.id}><button type="button" disabled={busy} className="reader-recent-file" onClick={() => onOpenDocument(group)}><FileText size={19} /><span><strong>{document.name}</strong><small>{document.pages.length} 页{notes ? ` · ${notes} 条批注` : ''}</small></span><span className="reader-recent-open">阅读</span></button>
            {owners.length > 1 && <details className="reader-file-records"><summary>查看已有的 {owners.length} 份阅读记录</summary>{owners.map(refs => { const owner = conversations.find(c => c.id === refs[0].conversationId); return <button type="button" disabled={busy} key={refs[0].conversationId} onClick={() => onOpenDocument(group, refs[0])}>{owner?.title || '阅读记录'}<small>{countNotes(refs)} 条批注</small></button>; })}</details>}
          </li>;
        })}</ul>
        {groups.length > limit && <button type="button" className="document-tool-button" onClick={() => setLimit(value => value + 50)}>更多阅读记录</button>}
      </section>
    </div>
  </section>;
}
