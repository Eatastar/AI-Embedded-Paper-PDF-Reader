import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Search, X } from 'lucide-react';
import type { Annotation, DocumentAttachment } from '../domain/types';
import { buildDocumentSearch, documentNotes, filterDocumentNotes, searchDocument } from '../domain/reader-navigation';
import type { OutlineEntry, SearchHit } from '../domain/reader-navigation';

type Tab = 'outline' | 'search' | 'notes';
interface Props {
  open: boolean; source: DocumentAttachment; annotations: Annotation[]; pageIndex: number;
  outline: OutlineEntry[]; outlineLoading: boolean; outlineError: boolean; outlineTruncated: boolean;
  onClose: () => void; onPage: (pageIndex: number) => void; onSearch: (hit: SearchHit, query: string) => void;
  onClearSearch: () => void; onAnnotation: (id: string, pageIndex: number) => void;
}

export function ReaderNavigation({ open, source, annotations, pageIndex, outline, outlineLoading, outlineError, outlineTruncated, onClose, onPage, onSearch, onClearSearch, onAnnotation }: Props) {
  const id = useId();
  const [tab, setTab] = useState<Tab>(source.kind === 'pdf' ? 'outline' : 'search');
  const [query, setQuery] = useState(''), [settledQuery, setSettledQuery] = useState('');
  const [selectedHit, setSelectedHit] = useState<string | null>(null);
  const [noteKind, setNoteKind] = useState<'all' | 'ask' | 'note'>('all');
  const [notePage, setNotePage] = useState(''), [noteQuery, setNoteQuery] = useState('');
  const [noteLimit, setNoteLimit] = useState(100);
  const index = useRef<{ pages: DocumentAttachment['pages']; value: ReturnType<typeof buildDocumentSearch> } | null>(null);
  useEffect(() => { const timer = setTimeout(() => setSettledQuery(query), 160); return () => clearTimeout(timer); }, [query]);
  const result = useMemo(() => {
    if (!open || tab !== 'search' || !settledQuery.trim()) return { hits: [], count: 0 };
    if (index.current?.pages !== source.pages) index.current = { pages: source.pages, value: buildDocumentSearch(source.pages) };
    return searchDocument(index.current.value, settledQuery);
  }, [source.pages, settledQuery, open, tab]);
  const notes = useMemo(() => documentNotes(source, annotations), [source, annotations]);
  const filteredNotes = useMemo(() => filterDocumentNotes(notes, noteKind, notePage ? Number(notePage) : null, noteQuery), [notes, noteKind, notePage, noteQuery]);
  useEffect(() => setNoteLimit(100), [noteKind, notePage, noteQuery]);
  const current = result.hits.findIndex(hit => hit.key === selectedHit);
  const searching = query !== settledQuery;
  const chooseHit = (hit: SearchHit) => { setSelectedHit(hit.key); onSearch(hit, settledQuery); };
  const stepHit = (direction: number) => {
    if (!result.hits.length || searching) return;
    const next = current < 0 ? direction < 0 ? result.hits.length - 1 : 0 : (current + direction + result.hits.length) % result.hits.length;
    chooseHit(result.hits[next]);
  };
  const tabs: { key: Tab; label: string }[] = [...(source.kind === 'pdf' ? [{ key: 'outline' as const, label: '目录' }] : []), { key: 'search', label: '搜索' }, { key: 'notes', label: `批注 ${notes.length}` }];
  return <aside className="reader-navigation" aria-label="文档导航" data-testid="reader-navigation" hidden={!open} onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); onClose(); } }}>
    <header><strong>文档导航</strong><button type="button" className="document-icon-button" aria-label="收起文档导航" onClick={onClose}><X size={17} /></button></header>
    <div className="reader-navigation-tabs" role="tablist" aria-label="文档导航方式" onKeyDown={event => {
      if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      event.preventDefault(); const next = tabs[(tabs.findIndex(t => t.key === tab) + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length]; setTab(next.key);
      event.currentTarget.querySelector<HTMLButtonElement>(`[data-reader-tab="${next.key}"]`)?.focus();
    }}>{tabs.map(item => <button type="button" key={item.key} id={`${id}-${item.key}`} data-reader-tab={item.key} role="tab" tabIndex={tab === item.key ? 0 : -1} aria-selected={tab === item.key} aria-controls={`${id}-panel`} onClick={() => setTab(item.key)}>{item.label}</button>)}</div>
    <section className="reader-navigation-content" id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-${tab}`}>
      {tab === 'outline' && <>
        <p className="reader-navigation-help">目录来自 PDF，点击章节可跳转。</p>
        {outlineLoading && <p role="status">正在读取目录…</p>}
        {!outlineLoading && !outline.length && <p className="reader-navigation-empty">{outlineError ? '这份目录暂时无法读取，可通过搜索或页码定位。' : '这份 PDF 没有内嵌目录，可通过搜索或页码定位。'}</p>}
        <nav aria-label="PDF 目录"><ol className="reader-outline">{outline.map(item => <li key={item.key} style={{ paddingInlineStart: item.depth * 12 }}>
          {item.pageIndex === null ? <span className="reader-outline-heading">{item.title}</span> : <button type="button" aria-current={item.pageIndex === pageIndex ? 'location' : undefined} onClick={() => onPage(item.pageIndex!)} title={item.title}><span>{item.title}</span><small>{item.pageIndex + 1}</small></button>}
        </li>)}</ol></nav>
        {outlineTruncated && <p className="reader-navigation-help">目录较长，已列出前 1000 项。</p>}
      </>}
      {tab === 'search' && <>
        <label className="reader-navigation-search"><Search size={15} aria-hidden="true" /><input aria-label="搜索本文件全文" placeholder="搜索本文件全文…" maxLength={200} value={query} onChange={event => { setQuery(event.target.value); setSelectedHit(null); onClearSearch(); }} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); stepHit(event.shiftKey ? -1 : 1); } }} /></label>
        <p className="reader-navigation-help">在本机搜索全部提取文字，忽略大小写、空白和断词连字符。扫描页需先有可提取文字。</p>
        <div className="reader-search-count" aria-live="polite"><span>{searching ? '正在搜索…' : query.trim() ? `找到 ${result.count} 处${current >= 0 ? ` · 当前 ${current + 1}` : ''}` : '输入关键词定位原文'}</span><div><button type="button" className="document-icon-button" aria-label="上一个搜索结果" disabled={!result.hits.length || searching} onClick={() => stepHit(-1)}><ChevronUp size={16} /></button><button type="button" className="document-icon-button" aria-label="下一个搜索结果" disabled={!result.hits.length || searching} onClick={() => stepHit(1)}><ChevronDown size={16} /></button></div></div>
        {!searching && <ol className="reader-search-results">{result.hits.map(hit => <li key={hit.key}><button type="button" aria-current={hit.key === selectedHit ? 'location' : undefined} onClick={() => chooseHit(hit)}><small>第 {hit.pageNumber} 页</small><span>{hit.before}<mark>{hit.quote}</mark>{hit.after}</span></button></li>)}</ol>}
        {!searching && result.count > result.hits.length && <p className="reader-navigation-help">结果较多，列出前 {result.hits.length} 处；可缩小关键词继续查找。</p>}
        {!searching && query.trim() && result.count === 0 && <p className="reader-navigation-empty">没有找到匹配文字，试试较短的关键词。</p>}
      </>}
      {tab === 'notes' && <>
        <div className="reader-note-filters"><label>类型<select aria-label="批注类型筛选" value={noteKind} onChange={event => setNoteKind(event.target.value as typeof noteKind)}><option value="all">全部批注</option><option value="ask">询问 AI</option><option value="note">普通批注</option></select></label><label>页码<select aria-label="批注页码筛选" value={notePage} onChange={event => setNotePage(event.target.value)}><option value="">全部页</option>{source.pages.map((page, i) => <option value={i} key={page.versionId}>第 {page.pageNumber} 页</option>)}</select></label></div>
        <input className="reader-note-query" aria-label="搜索批注内容" placeholder="搜索问题、回答或笔记…" maxLength={200} value={noteQuery} onChange={event => setNoteQuery(event.target.value)} />
        <p className="reader-navigation-help" aria-live="polite">共 {filteredNotes.length} 条，点击回到原文并打开批注。</p>
        <ol className="reader-note-results">{filteredNotes.slice(0, noteLimit).map(({ annotation: a, pageIndex: page, pageNumber }) => <li key={a.id}><button type="button" onClick={() => onAnnotation(a.id, page)} style={{ borderInlineStartColor: a.color }}>
          <small>第 {pageNumber} 页 · {a.mode === 'note' ? '普通批注' : '询问 AI'}{a.status === 'generating' || a.reask?.status === 'generating' ? ' · 回答中' : a.status === 'draft' ? ' · 草稿' : ''}</small>
          <strong>{(a.mode === 'note' ? a.note : a.question)?.trim().slice(0, 100) || (a.mode === 'note' ? '未完成的批注' : '未完成的询问')}</strong><span className="reader-note-quote">{a.quote.slice(0, 120)}</span>
        </button></li>)}</ol>
        {!filteredNotes.length && <p className="reader-navigation-empty">{notes.length ? '没有符合筛选条件的批注。' : '这份文件还没有批注。划选原文即可添加。'}</p>}
        {filteredNotes.length > noteLimit && <button type="button" className="document-tool-button" onClick={() => setNoteLimit(value => value + 100)}>继续显示批注</button>}
      </>}
    </section>
  </aside>;
}
