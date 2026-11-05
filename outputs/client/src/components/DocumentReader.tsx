import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { ChevronLeft, ChevronRight, FileText, Minus, Plus, X, Palette, Columns2, Maximize2, Eye, PanelLeft } from 'lucide-react';
import type { DocumentAttachment, MessageVersion } from '../domain/types';
import { loadPdfDocument } from '../adapters/documents';
import { bindPdfZoom } from '../adapters/pdf-zoom';
import { PdfRenderQueue, readPdfOutline } from '../adapters/pdf-navigation';
import { markReaderSearch } from '../adapters/reader-search';
import { readerAnnotationRange } from '../adapters/reader-location';
import { getDocumentBytes } from '../adapters/storage';
import { loadReaderAppearance, loadReaderPosition, saveReaderAppearance, saveReaderPosition } from '../adapters/reader';
import { colorLuminance } from '../domain/reader';
import { clampPdfZoom, pdfAnchorScrollDelta, pdfPageSize, pdfZoomAnchor } from '../domain/pdf-zoom';
import type { PdfZoomAnchor } from '../domain/pdf-zoom';
import type { ReaderPosition } from '../domain/reader';
import { activeReaderPage } from '../domain/reader-navigation';
import type { OutlineEntry, SearchFocus, SearchHit } from '../domain/reader-navigation';
import { ReaderAppearancePanel } from './ReaderAppearancePanel';
import { ReaderNavigation } from './ReaderNavigation';
import { PdfAnnotatedPage } from './PdfAnnotatedPage';
import { AnnotatedAnswer } from './AnnotatedAnswer';
import type { AnnotatedAnswerProps } from './AnnotatedAnswer';
import './documents.css';

export interface DocumentReaderProps extends Omit<AnnotatedAnswerProps, 'messageId' | 'version' | 'plainText' | 'content' | 'contentReadyKey' | 'contentClassName'> {
  source: DocumentAttachment; onClose: () => void; focused: boolean; onToggleFocus: () => void;
}
const sameSet = (a: Set<number>, b: Set<number>) => a.size === b.size && [...a].every(value => b.has(value));
type PageGeometry = Record<number, { width: number; height: number }>;

export function DocumentReader({ source, onClose, focused, onToggleFocus, ...annotationProps }: DocumentReaderProps) {
  const [initial] = useState(() => loadReaderPosition(source.id, source.pages.length, source.kind));
  const [pageIndex, setPageIndex] = useState(initial.pageIndex), [pageInput, setPageInput] = useState(String(initial.pageIndex + 1));
  const [view, setView] = useState(initial.view), [layout, setLayout] = useState<'paged' | 'continuous'>(initial.layout || 'paged');
  const [zoom, setZoom] = useState(initial.zoom), [appearance, setAppearance] = useState(loadReaderAppearance);
  const [appearanceOpen, setAppearanceOpen] = useState(false), [compareOriginal, setCompareOriginal] = useState(false);
  const [appearanceSaved, setAppearanceSaved] = useState(true), [positionSaved, setPositionSaved] = useState(true);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null), [loading, setLoading] = useState(source.kind === 'pdf');
  const [fileError, setFileError] = useState(''), [availableWidth, setAvailableWidth] = useState(700);
  const [navigationOpen, setNavigationOpen] = useState(false), [narrow, setNarrow] = useState(false);
  const [outline, setOutline] = useState<OutlineEntry[]>([]), [outlineLoading, setOutlineLoading] = useState(false);
  const [outlineError, setOutlineError] = useState(false), [outlineTruncated, setOutlineTruncated] = useState(false);
  const [geometry, setGeometry] = useState<PageGeometry>({});
  const [nearPages, setNearPages] = useState(() => new Set([initial.pageIndex]));
  const [forcedPage, setForcedPage] = useState<number | null>(initial.pageIndex);
  const [search, setSearch] = useState<SearchFocus | null>(null), [navigationRevision, setNavigationRevision] = useState(0);
  const [queue] = useState(() => new PdfRenderQueue());
  const rootRef = useRef<HTMLElement>(null), viewportRef = useRef<HTMLDivElement>(null), textRef = useRef<HTMLElement>(null);
  const pageInputRef = useRef<HTMLInputElement>(null), slots = useRef(new Map<number, HTMLDivElement>());
  const position = useRef<ReaderPosition>(initial), pendingPosition = useRef<ReaderPosition | null>(initial);
  const anchor = useRef<{ pageIndex: number; point: PdfZoomAnchor } | null>(null), restoring = useRef(true);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined), scrollFrame = useRef(0);
  const searchRequest = useRef(0), pendingSearch = useRef<number | null>(null), pendingNote = useRef<string | null>(null);
  const handledOpen = useRef<string | null>(null);
  const continuous = source.kind === 'pdf' && view === 'original' && layout === 'continuous';
  const openedPage = useMemo(() => {
    const opened = annotationProps.annotations.find(a => a.id === annotationProps.openAnnotationId);
    return opened ? source.pages.findIndex(p => p.messageId === opened.messageId && p.versionId === opened.versionId) : -1;
  }, [annotationProps.openAnnotationId, annotationProps.annotations, source.pages]);
  const pageBody = (index: number) => continuous ? slots.current.get(index)?.querySelector<HTMLElement>('.reader-page-body') : viewportRef.current?.querySelector<HTMLElement>('.document-page-stage');
  const focusY = (element: HTMLElement) => Math.min(120, element.clientHeight * .25);
  const readPosition = (): ReaderPosition => {
    const element = viewportRef.current;
    if (!element || restoring.current) return position.current;
    const next = { ...position.current, scrollY: element.scrollTop / Math.max(1, element.scrollHeight - element.clientHeight), scrollX: element.scrollLeft / Math.max(1, element.scrollWidth - element.clientWidth) };
    if (continuous && slots.current.size) {
      const focus = element.getBoundingClientRect().top + focusY(element);
      const rects = [...slots.current].map(([i, slot]) => ({ pageIndex: i, ...slot.querySelector<HTMLElement>('.reader-page-body')!.getBoundingClientRect().toJSON() }));
      next.pageIndex = activeReaderPage(rects, focus);
      const rect = pageBody(next.pageIndex)?.getBoundingClientRect();
      next.pageOffset = rect ? Math.max(0, Math.min(1, (focus - rect.top) / rect.height)) : 0;
    }
    return next;
  };
  const recordScroll = () => {
    if (restoring.current) return;
    position.current = readPosition();
    const index = position.current.pageIndex;
    if (continuous) { setPageIndex(index); if (document.activeElement !== pageInputRef.current) setPageInput(String(index + 1)); }
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => setPositionSaved(saveReaderPosition(source.id, position.current)), 200);
  };
  const recordRef = useRef(recordScroll); recordRef.current = recordScroll;
  const scroll = () => { cancelAnimationFrame(scrollFrame.current); scrollFrame.current = requestAnimationFrame(() => recordRef.current()); };
  const flush = () => { position.current = readPosition(); clearTimeout(saveTimer.current); saveReaderPosition(source.id, position.current); };
  const flushRef = useRef(flush); flushRef.current = flush;
  const captureAnchor = (point?: { x: number; y: number }) => {
    const element = viewportRef.current; if (!element || view !== 'original') return;
    if (pendingPosition.current && restoring.current) return;
    const bounds = element.getBoundingClientRect(), x = point?.x ?? bounds.left + element.clientWidth / 2, y = point?.y ?? bounds.top + focusY(element);
    let index = position.current.pageIndex;
    if (continuous) index = activeReaderPage([...slots.current].map(([i, slot]) => ({ pageIndex: i, ...slot.getBoundingClientRect().toJSON() })), y);
    const body = pageBody(index); if (!body) return;
    if (!continuous && !body.querySelector('canvas[data-page-ready="true"]')) return;
    anchor.current = { pageIndex: index, point: pdfZoomAnchor(body.getBoundingClientRect(), bounds, x, y) }; restoring.current = true;
  };
  const captureRef = useRef(captureAnchor); captureRef.current = captureAnchor;
  const restore = () => {
    const element = viewportRef.current; if (!element) return;
    const saved = pendingPosition.current, pinned = anchor.current;
    if (pinned) {
      if (!continuous && view === 'original' && !element.querySelector('canvas[data-page-ready="true"]')) return;
      const body = pageBody(pinned.pageIndex); if (!body) return;
      const delta = pdfAnchorScrollDelta(pinned.point, body.getBoundingClientRect(), element.getBoundingClientRect());
      element.scrollLeft += delta.x; element.scrollTop += delta.y; anchor.current = null;
    } else if (saved) {
      if (continuous) {
        const body = pageBody(saved.pageIndex); if (!body) return;
        element.scrollTop += body.getBoundingClientRect().top - element.getBoundingClientRect().top + (saved.pageOffset || 0) * body.getBoundingClientRect().height - focusY(element);
      } else {
        if (view === 'original' && !element.querySelector('canvas[data-page-ready="true"]')) return;
        element.scrollTop = saved.scrollY * Math.max(0, element.scrollHeight - element.clientHeight);
      }
      element.scrollLeft = saved.scrollX * Math.max(0, element.scrollWidth - element.clientWidth);
    } else return;
    pendingPosition.current = null; restoring.current = false; scroll();
  };
  useLayoutEffect(restore, [zoom, availableWidth, geometry, layout, view, pdf, navigationRevision]);
  const locateSearch = (marker: HTMLElement | null, request: number) => {
    if (pendingSearch.current !== request) return;
    restore(); pendingSearch.current = null;
    if (marker) marker.scrollIntoView({ block: 'center', inline: 'nearest' });
    else annotationProps.onNotify('已到对应页面，这处文字暂时无法精确定位，可切换“可批注文本”查看。');
    scroll();
  };
  const jump = (value: number, keepAnnotation = false) => {
    const index = Math.max(0, Math.min(source.pages.length - 1, value));
    anchor.current = null; restoring.current = true;
    position.current = { ...position.current, pageIndex: index, pageOffset: 0, scrollY: 0, scrollX: 0 };
    pendingPosition.current = { ...position.current }; setPageIndex(index); setPageInput(String(index + 1)); setForcedPage(index);
    setNavigationRevision(value => value + 1);
    if (!keepAnnotation) { pendingNote.current = null; annotationProps.onOpen(null); }
  };
  const clearSearch = () => { pendingSearch.current = null; setSearch(null); };
  const selectPage = (index: number) => { clearSearch(); jump(index); };
  const selectSearch = (hit: SearchHit, query: string) => {
    const request = ++searchRequest.current; pendingSearch.current = request;
    jump(hit.pageIndex); setSearch({ pageIndex: hit.pageIndex, ordinal: hit.ordinal, query, request });
  };
  const selectAnnotation = (id: string, index: number) => {
    clearSearch(); pendingNote.current = id; handledOpen.current = id; jump(index, true); annotationProps.onOpen(id);
  };
  const locateNoteRef = useRef(() => {});
  locateNoteRef.current = () => {
    const id = pendingNote.current, element = viewportRef.current; if (!id || !element) return;
    const note = annotationProps.annotations.find(a => a.id === id); if (!note) return;
    const prose = element.querySelector<HTMLElement>(`.annotation-answer[data-version-id="${CSS.escape(note.versionId)}"]`);
    if (!prose || (view === 'original' && !prose.querySelector('canvas[data-page-ready="true"]'))) return;
    const range = readerAnnotationRange(prose, note.anchor); if (!range) return;
    restore(); pendingNote.current = null;
    const rect = range.getBoundingClientRect(), viewport = element.getBoundingClientRect();
    element.scrollTop += rect.top - viewport.top - element.clientHeight / 2 + rect.height / 2;
    if (rect.left < viewport.left || rect.right > viewport.right) element.scrollLeft += rect.left - viewport.left - element.clientWidth / 2 + rect.width / 2;
    scroll();
  };
  useEffect(() => {
    const element = viewportRef.current; if (!element) return;
    let frame = requestAnimationFrame(() => locateNoteRef.current());
    const observer = new MutationObserver(() => { cancelAnimationFrame(frame); frame = requestAnimationFrame(() => locateNoteRef.current()); });
    observer.observe(element, { subtree: true, childList: true });
    return () => { cancelAnimationFrame(frame); observer.disconnect(); };
  }, []);
  useEffect(() => {
    const id = annotationProps.openAnnotationId;
    if (id === handledOpen.current) return; handledOpen.current = id;
    if (!id) { pendingNote.current = null; return; }
    if (openedPage >= 0 && openedPage !== position.current.pageIndex) { pendingNote.current = id; jump(openedPage, true); }
  }, [annotationProps.openAnnotationId, openedPage]);
  const changeZoom = (value: number, point?: { x: number; y: number }) => {
    const next = clampPdfZoom(value); if (next === position.current.zoom) return;
    captureAnchor(point); position.current = { ...position.current, zoom: next }; setZoom(next);
  };
  const zoomRef = useRef(changeZoom); zoomRef.current = changeZoom;
  useEffect(() => {
    const element = viewportRef.current; if (!element || source.kind !== 'pdf' || view !== 'original') return;
    return bindPdfZoom(element, { zoom: () => position.current.zoom, onZoom: (value, point) => zoomRef.current(value, point) });
  }, [source.kind, view]);
  const switchLayout = (value: 'paged' | 'continuous') => {
    if (value === layout) return;
    const saved = readPosition(); captureAnchor();
    position.current = { ...saved, layout: value, scrollY: 0, pageOffset: value === 'continuous' ? saved.pageOffset || saved.scrollY : undefined };
    pendingPosition.current = { ...position.current }; restoring.current = true;
    setForcedPage(saved.pageIndex); setLayout(value); annotationProps.onOpen(null);
  };
  const switchView = (value: 'original' | 'text') => {
    if (value === view) return;
    if (search?.pageIndex === position.current.pageIndex) pendingSearch.current = search.request;
    position.current = { ...readPosition(), view: value, scrollY: 0, pageOffset: 0, scrollX: 0 };
    pendingPosition.current = { ...position.current }; anchor.current = null; restoring.current = true;
    setView(value); annotationProps.onOpen(null);
  };
  useEffect(() => { setAppearanceSaved(saveReaderAppearance(appearance)); }, [appearance]);
  useEffect(() => { setPositionSaved(saveReaderPosition(source.id, position.current)); }, [source.id, pageIndex, view, zoom, layout]);
  useLayoutEffect(() => () => flushRef.current(), [source.id]);
  useEffect(() => {
    const save = () => flushRef.current(); window.addEventListener('pagehide', save);
    return () => { window.removeEventListener('pagehide', save); clearTimeout(saveTimer.current); cancelAnimationFrame(scrollFrame.current); };
  }, []);
  useEffect(() => {
    const root = rootRef.current, element = viewportRef.current; if (!root || !element) return;
    let width = 0;
    const rootObserver = new ResizeObserver(([entry]) => setNarrow(entry.contentRect.width < 900)); rootObserver.observe(root);
    const observer = new ResizeObserver(([entry]) => {
      const next = Math.round(entry.contentRect.width); if (next <= 0 || next === width) return;
      width = next; captureRef.current(); setAvailableWidth(next);
    }); observer.observe(element);
    return () => { observer.disconnect(); rootObserver.disconnect(); };
  }, []);
  useEffect(() => {
    if (source.kind !== 'pdf') { setLoading(false); return; }
    let cancelled = false, opened: PDFDocumentProxy | undefined;
    const load = async () => {
      const bytes = await getDocumentBytes(source.id); if (cancelled) return;
      if (!bytes) throw new Error('Missing document'); opened = await loadPdfDocument(bytes);
      if (cancelled) { await opened.loadingTask.destroy(); return; }
      setPdf(opened); setLoading(false);
    };
    void load().catch(() => { if (!cancelled) { setLoading(false); setFileError('无法打开本地原文件，仍可在“可批注文本”里阅读已保存的文字。'); } });
    return () => { cancelled = true; if (opened) void opened.loadingTask.destroy().catch(() => {}); };
  }, [source.id, source.kind]);
  useEffect(() => {
    if (!pdf) return;
    const controller = new AbortController(); setOutlineLoading(true);
    void readPdfOutline(pdf, controller.signal).then(result => { setOutline(result.entries); setOutlineTruncated(result.truncated); setOutlineLoading(false); }).catch(() => { if (!controller.signal.aborted) { setOutlineLoading(false); setOutlineError(true); } });
    return () => controller.abort();
  }, [pdf]);
  useEffect(() => {
    if (!pdf || !continuous) return;
    let cancelled = false;
    const order = [...new Set([position.current.pageIndex, 0, ...source.pages.map((_, i) => i)])].filter(i => !geometry[i]);
    const load = async () => {
      for (let i = 0; i < order.length; i += 3) {
        const batch = await Promise.all(order.slice(i, i + 3).map(async index => {
          try { const page = await pdf.getPage(source.pages[index].pageNumber), size = page.getViewport({ scale: 1 }); return [index, { width: size.width, height: size.height }] as const; } catch { return null; }
        }));
        if (cancelled) return;
        captureRef.current(); setGeometry(current => ({ ...current, ...Object.fromEntries(batch.filter(item => item !== null)) }));
      }
    }; void load(); return () => { cancelled = true; };
  }, [pdf, continuous, source.pages]);
  useEffect(() => {
    const root = viewportRef.current; if (!root || !continuous || !pdf) return;
    const visible = new Set<number>();
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => { const index = Number((entry.target as HTMLElement).dataset.readerPage); if (entry.isIntersecting) visible.add(index); else visible.delete(index); });
      setNearPages(current => sameSet(current, visible) ? current : new Set(visible));
    }, { root, rootMargin: `${Math.max(400, root.clientHeight)}px 0px` });
    slots.current.forEach(slot => observer.observe(slot)); return () => observer.disconnect();
  }, [continuous, pdf, availableWidth]);
  useEffect(() => {
    if (view !== 'text' || !search || search.pageIndex !== pageIndex || !textRef.current) return;
    const prose = textRef.current.querySelector<HTMLElement>('.annotation-answer'), text = textRef.current.querySelector<HTMLElement>('.annotation-plain-text');
    if (!prose || !text) return;
    const result = markReaderSearch(prose, text, search.query, search.ordinal); locateSearch(result.marker, search.request); return result.clear;
  }, [view, search, pageIndex]);
  const ready = (index: number) => { restore(); setForcedPage(current => current === index ? null : current); locateNoteRef.current(); };
  const page = source.pages[pageIndex], hasText = Boolean(page?.text.trim());
  const version = (index: number): MessageVersion => ({ id: source.pages[index].versionId, content: source.pages[index].text, status: 'complete', createdAt: source.createdAt });
  const annotationsByPage = useMemo(() => new Map(source.pages.map((p, i) => [i, annotationProps.annotations.filter(a => a.messageId === p.messageId && a.versionId === p.versionId)])), [source.pages, annotationProps.annotations]);
  const renderPage = (index: number) => <PdfAnnotatedPage {...annotationProps} annotations={annotationsByPage.get(index) || []} messageId={source.pages[index].messageId} version={version(index)} pdf={pdf!} pageNumber={source.pages[index].pageNumber} availableWidth={availableWidth} zoom={zoom} appearance={appearance} compareOriginal={compareOriginal} onPageReady={() => ready(index)} queue={queue} maxPixels={continuous ? 8_000_000 : 16_000_000} search={search?.pageIndex === index ? search : null} onSearchLocated={locateSearch} />;
  const commitPage = () => /^\d+$/u.test(pageInput) ? selectPage(Number(pageInput) - 1) : setPageInput(String(pageIndex + 1));
  const original = compareOriginal || appearance.preset === 'original', paper = original ? '#ffffff' : appearance.paper, ink = original ? '#000000' : appearance.ink;
  return <section ref={rootRef} className="document-reader" role="region" aria-label={`文档阅读：${source.name}`} data-testid="document-reader" data-reader-dark={colorLuminance(paper) < .25 ? 'true' : 'false'} data-reader-narrow={narrow} data-reader-layout={continuous ? 'continuous' : 'paged'} style={{ '--reader-paper': paper, '--reader-ink': ink } as CSSProperties}>
    <header className="document-reader-header"><FileText size={18} aria-hidden="true" /><div className="document-reader-heading"><strong title={source.name}>{source.name}</strong><span>保存在本机 · {source.pages.length} 页</span></div><button type="button" className="document-tool-button" aria-label={focused ? '显示聊天' : '专注阅读'} onClick={() => { flush(); onToggleFocus(); }}>{focused ? <Columns2 size={15} /> : <Maximize2 size={15} />}{focused ? '显示聊天' : '专注阅读'}</button><button type="button" className="document-icon-button" aria-label="关闭文档阅读" onClick={() => { flush(); onClose(); }}><X size={19} /></button></header>
    <div className="document-reader-toolbar">
      <button type="button" className="document-tool-button" aria-expanded={navigationOpen} onClick={() => setNavigationOpen(value => !value)}><PanelLeft size={14} />文档导航</button>
      {source.kind === 'pdf' && <div className="document-view-switch" aria-label="文档显示方式"><button type="button" aria-pressed={view === 'original'} onClick={() => switchView('original')}>PDF 原排版</button><button type="button" aria-pressed={view === 'text'} onClick={() => switchView('text')}>可批注文本</button></div>}
      {source.kind === 'pdf' && view === 'original' && <div className="document-view-switch" aria-label="翻页方式"><button type="button" aria-pressed={layout === 'paged'} onClick={() => switchLayout('paged')}>分页</button><button type="button" aria-pressed={layout === 'continuous'} onClick={() => switchLayout('continuous')}>连续</button></div>}
      <div className="document-page-navigation"><button type="button" className="document-icon-button" aria-label="上一页" disabled={pageIndex <= 0} onClick={() => selectPage(pageIndex - 1)}><ChevronLeft size={17} /></button><label><span className="document-sr-only">页码</span><input ref={pageInputRef} aria-label="文档页码" type="text" inputMode="numeric" value={pageInput} onChange={event => setPageInput(event.target.value)} onBlur={commitPage} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); commitPage(); } }} /><span> / {source.pages.length}</span></label><button type="button" className="document-icon-button" aria-label="下一页" disabled={pageIndex >= source.pages.length - 1} onClick={() => selectPage(pageIndex + 1)}><ChevronRight size={17} /></button></div>
      {source.kind === 'pdf' && view === 'original' && <div className="document-zoom-controls"><button type="button" className="document-icon-button" aria-label="缩小 PDF" disabled={zoom <= .5} onClick={() => changeZoom(zoom - .25)}><Minus size={15} /></button><button type="button" className="document-fit-button" title="恢复适合宽度" onClick={() => changeZoom(1)}>{zoom === 1 ? '适合宽度' : `${Math.round(zoom * 100)}%`}</button><button type="button" className="document-icon-button" aria-label="放大 PDF" disabled={zoom >= 2.5} onClick={() => changeZoom(zoom + .25)}><Plus size={15} /></button></div>}
      <div className="document-color-actions"><button type="button" className="document-tool-button" aria-expanded={appearanceOpen} onClick={() => setAppearanceOpen(value => !value)}><Palette size={14} />阅读配色</button><button type="button" className="document-tool-button" aria-pressed={compareOriginal} disabled={appearance.preset === 'original'} onClick={() => setCompareOriginal(value => !value)}><Eye size={14} />原色对照</button></div>
    </div>
    {appearanceOpen && <ReaderAppearancePanel appearance={appearance} saved={appearanceSaved && positionSaved} onChange={value => { setCompareOriginal(false); setAppearance(value); }} />}
    <p className="document-reader-hint">划选文字可询问 AI 或仅加批注。支持触控板捏合缩放；文档导航中可查目录、搜索全文和查看批注。询问会发送本对话和文档提取文字；原文件保存在本机。</p>
    <div className="document-reader-body">
      <ReaderNavigation open={navigationOpen} source={source} annotations={annotationProps.annotations} pageIndex={pageIndex} outline={outline} outlineLoading={loading || outlineLoading} outlineError={outlineError || Boolean(fileError)} outlineTruncated={outlineTruncated} onClose={() => setNavigationOpen(false)} onPage={selectPage} onSearch={selectSearch} onClearSearch={clearSearch} onAnnotation={selectAnnotation} />
      <div ref={viewportRef} className={`document-reader-viewport ${view === 'text' ? 'document-reader-text-viewport' : ''}`} onScroll={scroll}>
        {!hasText && !continuous && <p className="document-reader-warning">这一页没有可提取的文字，可能是扫描页。可查看原页面；暂不支持 OCR 识别和图片内容询问。</p>}
        {view === 'original' && loading && <div className="document-reader-empty" role="status">正在打开 PDF…</div>}
        {view === 'original' && fileError && <div className="document-reader-empty" role="alert"><p>{fileError}</p><button type="button" onClick={() => switchView('text')}>打开已保存文字</button></div>}
        {view === 'original' && pdf && (continuous ? <div className="reader-continuous-pages">{source.pages.map((p, index) => {
          const size = pdfPageSize(geometry[index] || geometry[0] || { width: 612, height: 792 }, availableWidth, zoom);
          const active = nearPages.has(index) || forcedPage === index || openedPage === index;
          return <div key={p.versionId} ref={element => { if (element) slots.current.set(index, element); else slots.current.delete(index); }} data-reader-page={index} className="reader-page-slot" style={{ width: size.width }}><p className="reader-page-label">第 {p.pageNumber} 页{!p.text.trim() ? ' · 无可提取文字，暂不支持 OCR' : ''}</p><div className="reader-page-body" style={{ width: size.width, height: size.height }}>{active ? renderPage(index) : <div className="reader-page-placeholder" aria-label={`第 ${p.pageNumber} 页，滚动到此处时显示`} />}</div></div>;
        })}</div> : <div key={`${source.id}:${pageIndex}:pdf`}>{renderPage(pageIndex)}</div>)}
        {page && view === 'text' && hasText && <article ref={textRef} className="document-page-text" key={`${source.id}:${pageIndex}:text`}><p className="document-text-page-label">第 {page.pageNumber} 页 · 提取文字</p><AnnotatedAnswer {...annotationProps} annotations={annotationsByPage.get(pageIndex) || []} messageId={page.messageId} version={version(pageIndex)} plainText /></article>}
      </div>
    </div>
  </section>;
}
