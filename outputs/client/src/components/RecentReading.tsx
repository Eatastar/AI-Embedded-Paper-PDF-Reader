import { FileText } from 'lucide-react';
import { useMemo, useState } from 'react';
import { fileAnnotationCounter, type LocalDocumentGroup, type LocalDocumentReference } from '../domain/local-library';
import type { Conversation } from '../domain/types';
import { t } from '../i18n/locale';

const PREVIEW_COUNT = 5;
const PAGE_SIZE = 50;
type View = 'recent' | 'hidden' | null;

interface Props {
  visible: LocalDocumentGroup[];
  hidden: LocalDocumentGroup[];
  conversations: Conversation[];
  busy: boolean;
  loading: boolean;
  onOpenDocument: (group: LocalDocumentGroup, ref?: LocalDocumentReference) => void;
  onSetHidden: (groups: LocalDocumentGroup[], hide: boolean) => void;
}

export function RecentReading({ visible, hidden, conversations, busy, loading, onOpenDocument, onSetHidden }: Props) {
  const [view, setView] = useState<View>(null);
  const [selected, setSelected] = useState(new Set<string>());
  const [manageLimit, setManageLimit] = useState(PAGE_SIZE);
  const [browseLimit, setBrowseLimit] = useState(PREVIEW_COUNT);
  const countNotes = useMemo(() => fileAnnotationCounter(conversations), [conversations]);
  const groups = view === 'hidden' ? hidden : visible;
  const picked = groups.filter(group => selected.has(group.id));
  const limit = view ? manageLimit : browseLimit;
  const showMore = groups.length > limit;
  const canCollapse = !view && browseLimit > PREVIEW_COUNT;
  const emptyMessage = view === 'hidden' ? '没有已移出的阅读记录。' : hidden.length ? '最近阅读暂无文件。' : '读过的文件和批注会留在这里。';

  function changeView(next: View) {
    if (next === view) return;
    setView(next);
    setSelected(new Set());
    setManageLimit(PAGE_SIZE);
  }

  function select(id: string, checked: boolean) {
    const next = new Set(selected);
    if (checked) next.add(id);
    else next.delete(id);
    setSelected(next);
  }

  function applySelection() {
    onSetHidden(picked, view === 'recent');
    setSelected(new Set());
  }

  return <section className="reader-recent" aria-label={t("本地阅读记录")}>
    <header>
      <h2>{t("最近阅读")}</h2>
      <div className="reader-recent-header-actions">
        <span className="reader-recent-count">{loading ? t("正在整理…") : t("{0} 份文件", [groups.length])}</span>
        {(view || visible.length > 0 || hidden.length > 0) && <button type="button" className="document-tool-button"
          aria-label={t(view ? "完成" : "整理最近阅读")} aria-expanded={!!view}
          onClick={() => changeView(view ? null : visible.length ? 'recent' : 'hidden')}>{t(view ? "完成" : "整理")}</button>}
      </div>
    </header>
    {view && <>
      <div className="reader-recent-controls">
        <div className="reader-recent-tabs">
          <button type="button" className="document-tool-button" aria-pressed={view === 'recent'} onClick={() => changeView('recent')}>{t("列表中")} ({visible.length})</button>
          <button type="button" className="document-tool-button" aria-pressed={view === 'hidden'} onClick={() => changeView('hidden')}>{t("已移出")} ({hidden.length})</button>
        </div>
        <button type="button" className="document-tool-button" disabled={loading || !picked.length} onClick={applySelection}>
          {t(view === 'recent' ? "移出所选" : "恢复所选")}{picked.length > 0 && ` (${picked.length})`}
        </button>
      </div>
      {view === 'recent' && <p className="reader-recent-help">{t("移出后可恢复，原文件、批注和进度保留。")}</p>}
    </>}
    {!loading && !groups.length && <p className="reader-recent-empty">{t(emptyMessage)}</p>}
    <ul>{groups.slice(0, limit).map(group => {
      const { document } = group.references[0];
      const notes = countNotes(group.references);
      const ebook = document.kind === 'epub' || document.kind === 'mobi' || document.kind === 'azw3';
      const label = <span>
        <strong title={document.name}>{document.name}</strong>
        <small>{t(ebook ? "{0} 章" : "{0} 页", [document.pages.length])}{notes ? t(" · {0} 条批注", [notes]) : ''}</small>
      </span>;
      if (view) return <li key={group.id}>
        <label className="reader-recent-file reader-recent-select">
          <input type="checkbox" aria-label={document.name} checked={selected.has(group.id)} disabled={loading}
            onChange={event => select(group.id, event.target.checked)} />
          {label}
        </label>
      </li>;
      const owners = [...new Set(group.references.map(ref => ref.conversationId))];
      return <li key={group.id}>
        <button type="button" disabled={busy} className="reader-recent-file" onClick={() => onOpenDocument(group)}>
          <FileText size={19} />{label}<span className="reader-recent-open">{t("阅读")}</span>
        </button>
        {owners.length > 1 && <details className="reader-file-records">
          <summary>{t("查看已有的 {0} 份阅读记录", [owners.length])}</summary>
          {owners.map(id => {
            const refs = group.references.filter(ref => ref.conversationId === id);
            const owner = conversations.find(conversation => conversation.id === id);
            return <button type="button" disabled={busy} key={id} onClick={() => onOpenDocument(group, refs[0])}>
              {owner?.title || t("阅读记录")}<small>{countNotes(refs)}{t("条批注")}</small>
            </button>;
          })}
        </details>}
      </li>;
    })}</ul>
    {(showMore || canCollapse) && <div className="reader-recent-list-actions">
      {showMore && <button type="button" className="document-tool-button"
        onClick={() => view ? setManageLimit(limit + PAGE_SIZE) : setBrowseLimit(limit === PREVIEW_COUNT ? PAGE_SIZE : limit + PAGE_SIZE)}>
        {t(limit === PREVIEW_COUNT ? "查看全部" : "更多阅读记录")}
      </button>}
      {canCollapse && <button type="button" className="document-tool-button" onClick={() => setBrowseLimit(PREVIEW_COUNT)}>{t("收起")}</button>}
    </div>}
  </section>;
}
