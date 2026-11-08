import { t } from '../i18n/locale';
import { useLocale } from '../i18n/react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Search, X } from 'lucide-react';
import type { Annotation, DocumentAttachment } from '../domain/types';
import { buildDocumentSearch, documentNotes, filterDocumentNotes, searchDocumentAsync } from '../domain/reader-navigation';
import type { OutlineEntry, SearchHit } from '../domain/reader-navigation';

type Tab = 'outline' | 'search' | 'notes';
interface Props {
  open: boolean; source: DocumentAttachment; annotations: Annotation[]; pageIndex: number;
  outline: OutlineEntry[]; outlineLoading: boolean; outlineError: boolean; outlineTruncated: boolean;
  onClose: () => void; onPage: (pageIndex: number) => void; onSearch: (hit: SearchHit, query: string) => void;
  onClearSearch: () => void; onAnnotation: (id: string, pageIndex: number) => void;
}

export function ReaderNavigation({ open, source, annotations, pageIndex, outline, outlineLoading, outlineError, outlineTruncated, onClose, onPage, onSearch, onClearSearch, onAnnotation }: Props) {
  useLocale();
  const id = useId();
  const [tab, setTab] = useState<Tab>(source.kind === 'pdf' ? 'outline' : 'search');
  const [query, setQuery] = useState(''), [settledQuery, setSettledQuery] = useState('');
  const [selectedHit, setSelectedHit] = useState<string | null>(null);
  const [noteKind, setNoteKind] = useState<'all' | 'ask' | 'note'>('all');
  const [notePage, setNotePage] = useState(''), [noteQuery, setNoteQuery] = useState('');
  const [noteLimit, setNoteLimit] = useState(100);
  const index = useRef<{ pages: DocumentAttachment['pages']; value: ReturnType<typeof buildDocumentSearch> } | null>(null);
  const [result, setResult] = useState<{ hits: SearchHit[]; count: number }>({ hits: [], count: 0 });
  const [searchBusy, setSearchBusy] = useState(false), [completedQuery, setCompletedQuery] = useState('');
  useEffect(() => { if (!open || tab !== 'search') index.current?.value.cache.clear(); }, [open, tab]);
  useEffect(() => { const timer = setTimeout(() => setSettledQuery(query), 160); return () => clearTimeout(timer); }, [query]);
  useEffect(() => {
    if (!open || tab !== 'search' || !settledQuery.trim()) { setResult({ hits: [], count: 0 }); setSearchBusy(false); setCompletedQuery(''); return; }
    if (index.current?.pages !== source.pages) index.current = { pages: source.pages, value: buildDocumentSearch(source.pages) };
    const controller = new AbortController(); setSearchBusy(true);
    void searchDocumentAsync(index.current.value, settledQuery, controller.signal).then(value => {
      if (!controller.signal.aborted) { setResult(value); setCompletedQuery(settledQuery); setSearchBusy(false); }
    }).catch(() => { if (!controller.signal.aborted) setSearchBusy(false); });
    return () => controller.abort();
  }, [source.pages, settledQuery, open, tab]);
  const notes = useMemo(() => documentNotes(source, annotations), [source, annotations]);
  const filteredNotes = useMemo(() => filterDocumentNotes(notes, noteKind, notePage ? Number(notePage) : null, noteQuery), [notes, noteKind, notePage, noteQuery]);
  useEffect(() => setNoteLimit(100), [noteKind, notePage, noteQuery]);
  const current = result.hits.findIndex(hit => hit.key === selectedHit);
  const searching = query !== settledQuery || searchBusy || Boolean(query.trim() && completedQuery !== settledQuery);
  const chooseHit = (hit: SearchHit) => { setSelectedHit(hit.key); onSearch(hit, settledQuery); };
  const stepHit = (direction: number) => {
    if (!result.hits.length || searching) return;
    const next = current < 0 ? direction < 0 ? result.hits.length - 1 : 0 : (current + direction + result.hits.length) % result.hits.length;
    chooseHit(result.hits[next]);
  };
  const tabs: { key: Tab; label: string }[] = [...(source.kind === 'pdf' ? [{ key: 'outline' as const, label: t("目录") }] : []), { key: 'search', label: t("搜索") }, { key: 'notes', label: t("批注 {0}", [notes.length]) }];
  return <aside className="reader-navigation" aria-label={t("文档导航")} data-testid="reader-navigation" hidden={!open} onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); onClose(); } }}>
    <header><strong>{t("文档导航")}</strong><button type="button" className="document-icon-button" aria-label={t("收起文档导航")} onClick={onClose}><X size={17} /></button></header>
    <div className="reader-navigation-tabs" role="tablist" aria-label={t("文档导航方式")} onKeyDown={event => {
      if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      event.preventDefault(); const next = tabs[(tabs.findIndex(t => t.key === tab) + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length]; setTab(next.key);
      event.currentTarget.querySelector<HTMLButtonElement>(`[data-reader-tab="${next.key}"]`)?.focus();
    }}>{tabs.map(item => <button type="button" key={item.key} id={`${id}-${item.key}`} data-reader-tab={item.key} role="tab" tabIndex={tab === item.key ? 0 : -1} aria-selected={tab === item.key} aria-controls={`${id}-panel`} onClick={() => setTab(item.key)}>{item.label}</button>)}</div>
    <section className="reader-navigation-content" id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-${tab}`}>
      {tab === 'outline' && <>
        <p className="reader-navigation-help">{t("目录来自 PDF，点击章节可跳转。")}</p>
        {outlineLoading && <p role="status">{t("正在读取目录…")}</p>}
        {!outlineLoading && !outline.length && <p className="reader-navigation-empty">{outlineError ? t("这份目录暂时无法读取，可通过搜索或页码定位。") : t("这份 PDF 没有内嵌目录，可通过搜索或页码定位。")}</p>}
        <nav aria-label={t("PDF 目录")}><ol className="reader-outline">{outline.map(item => <li key={item.key} style={{ paddingInlineStart: item.depth * 12 }}>
          {item.pageIndex === null ? <span className="reader-outline-heading">{item.title}</span> : <button type="button" aria-current={item.pageIndex === pageIndex ? 'location' : undefined} onClick={() => onPage(item.pageIndex!)} title={item.title}><span>{item.title}</span><small>{item.pageIndex + 1}</small></button>}
        </li>)}</ol></nav>
        {outlineTruncated && <p className="reader-navigation-help">{t("目录较长，已列出前 1000 项。")}</p>}
      </>}
      {tab === 'search' && <>
        <label className="reader-navigation-search"><Search size={15} aria-hidden="true" /><input aria-label={t("搜索本文件全文")} placeholder={t("搜索本文件全文…")} maxLength={200} value={query} onChange={event => { setQuery(event.target.value); setSelectedHit(null); onClearSearch(); }} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); stepHit(event.shiftKey ? -1 : 1); } }} /></label>
        <p className="reader-navigation-help">{t("在本机搜索全部提取文字，忽略大小写、空白和断词连字符。扫描页需先有可提取文字。")}</p>
        <div className="reader-search-count" aria-live="polite"><span>{searching ? t("正在搜索…") : query.trim() ? t("找到 {0} 处{1}", [result.count, current >= 0 ? ` · 当前 ${current + 1}` : '']) : t("输入关键词定位原文")}</span><div><button type="button" className="document-icon-button" aria-label={t("上一个搜索结果")} disabled={!result.hits.length || searching} onClick={() => stepHit(-1)}><ChevronUp size={16} /></button><button type="button" className="document-icon-button" aria-label={t("下一个搜索结果")} disabled={!result.hits.length || searching} onClick={() => stepHit(1)}><ChevronDown size={16} /></button></div></div>
        {!searching && <ol className="reader-search-results">{result.hits.map(hit => <li key={hit.key}><button type="button" aria-current={hit.key === selectedHit ? 'location' : undefined} onClick={() => chooseHit(hit)}><small>{t("第")}{hit.pageNumber}{t("页")}</small><span>{hit.before}<mark>{hit.quote}</mark>{hit.after}</span></button></li>)}</ol>}
        {!searching && result.count > result.hits.length && <p className="reader-navigation-help">{t("结果较多，列出前")}{result.hits.length}{t("处；可缩小关键词继续查找。")}</p>}
        {!searching && query.trim() && result.count === 0 && <p className="reader-navigation-empty">{t("没有找到匹配文字，试试较短的关键词。")}</p>}
      </>}
      {tab === 'notes' && <>
        <div className="reader-note-filters"><label>{t("类型")}<select aria-label={t("批注类型筛选")} value={noteKind} onChange={event => setNoteKind(event.target.value as typeof noteKind)}><option value="all">{t("全部批注")}</option><option value="ask">{t("询问 AI")}</option><option value="note">{t("普通批注")}</option></select></label><label>{t("页码")}<select aria-label={t("批注页码筛选")} value={notePage} onChange={event => setNotePage(event.target.value)}><option value="">{t("全部页")}</option>{source.pages.map((page, i) => <option value={i} key={page.versionId}>{t("第 {0} 页", [page.pageNumber])}</option>)}</select></label></div>
        <input className="reader-note-query" aria-label={t("搜索批注内容")} placeholder={t("搜索问题、回答或笔记…")} maxLength={200} value={noteQuery} onChange={event => setNoteQuery(event.target.value)} />
        <p className="reader-navigation-help" aria-live="polite">{t("共 {0} 条，点击回到原文并打开批注。", [filteredNotes.length])}</p>
        <ol className="reader-note-results">{filteredNotes.slice(0, noteLimit).map(({ annotation: a, pageIndex: page, pageNumber }) => <li key={a.id}><button type="button" onClick={() => onAnnotation(a.id, page)} style={{ borderInlineStartColor: a.color }}>
          <small>{t("第 {0} 页 · {1}", [pageNumber, a.mode === 'note' ? t("普通批注") : t("询问 AI")])}{a.status === 'generating' || a.reask?.status === 'generating' ? t(" · 回答中") : a.status === 'draft' ? t(" · 草稿") : ''}</small>
          <strong>{(a.mode === 'note' ? a.note : a.question)?.trim().slice(0, 100) || (a.mode === 'note' ? t("未完成的批注") : t("未完成的询问"))}</strong><span className="reader-note-quote">{a.quote.slice(0, 120)}</span>
        </button></li>)}</ol>
        {!filteredNotes.length && <p className="reader-navigation-empty">{notes.length ? t("没有符合筛选条件的批注。") : t("这份文件还没有批注。划选原文即可添加。")}</p>}
        {filteredNotes.length > noteLimit && <button type="button" className="document-tool-button" onClick={() => setNoteLimit(value => value + 100)}>{t("继续显示批注")}</button>}
      </>}
    </section>
  </aside>;
}
