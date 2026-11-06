import { t } from '../i18n/locale';
import { useLocale } from '../i18n/react';
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { DocumentAttachment, MessageVersion } from '../domain/types';
import { loadPdfDocument } from '../adapters/documents';
import { bindPdfZoom } from '../adapters/pdf-zoom';
import { PdfRenderQueue, readPdfOutline } from '../adapters/pdf-navigation';
import { resolvePdfDestination, type PdfLink } from '../adapters/pdf-links';
import { markReaderSearch } from '../adapters/reader-search';
import { readerAnnotationRange } from '../adapters/reader-location';
import { getDocumentBytes } from '../adapters/storage';
import { loadReaderAppearance, loadReaderPosition, saveReaderAppearance, saveReaderPosition } from '../adapters/reader';
import { colorLuminance, readerTheme } from '../domain/reader';
import { usesRelevantContext, type DocumentContextMode } from '../domain/document-context';
import { clampPdfZoom, pdfAnchorScrollDelta, pdfPageSize, pdfZoomAnchor } from '../domain/pdf-zoom';
import type { PdfZoomAnchor } from '../domain/pdf-zoom';
import type { ReaderPosition } from '../domain/reader';
import { readerPageAtFocus } from '../domain/reader-navigation';
import type { OutlineEntry, SearchFocus, SearchHit } from '../domain/reader-navigation';
import { ReaderToolbar } from './ReaderToolbar';
import { ReaderNavigation } from './ReaderNavigation';
import { PdfAnnotatedPage } from './PdfAnnotatedPage';
import { AnnotatedAnswer } from './AnnotatedAnswer';
import type { AnnotatedAnswerProps } from './AnnotatedAnswer';
import { useTranslation } from './Translation';
import './documents.css';

export interface DocumentReaderProps extends Omit<AnnotatedAnswerProps, 'messageId' | 'version' | 'plainText' | 'content' | 'contentReadyKey' | 'contentClassName'> {
  source: DocumentAttachment; onClose: () => void; focused: boolean; onToggleFocus: () => void;
  modelLabel?: string; onOpenModelSettings?: () => void; onBackup?: () => void; onOpenFile?: () => void;
  contextMode: DocumentContextMode; onContextMode: (value: DocumentContextMode) => void;
  onLocation: (location: { documentId: string; pageNumber: number }) => void;
}
const sameSet = (a: Set<number>, b: Set<number>) => a.size === b.size && [...a].every(value => b.has(value));
type PageGeometry = Record<number, { width: number; height: number }>;
const ReaderPageSlot = memo(function ReaderPageSlot({ index, number, width, height, empty, register, children }: { index: number; number: number; width: number; height: number; empty: boolean; register: (index: number, element: HTMLDivElement | null) => void; children?: ReactNode }) {
  useLocale();
  return <div ref={element => register(index, element)} data-reader-page={index} className="reader-page-slot" style={{ width }}><p className="reader-page-label">{t('第 {0} 页', [number])}{empty ? t(' · 无可提取文字，暂不支持 OCR') : ''}</p><div className="reader-page-body" style={{ width, height }}>{children || <div className="reader-page-placeholder" aria-label={t('第 {0} 页，滚动到此处时显示', [number])} />}</div></div>;
});

export function DocumentReader({ source, onClose, focused, onToggleFocus, modelLabel, onOpenModelSettings, onBackup, onOpenFile, contextMode, onContextMode, onLocation, ...annotationProps }: DocumentReaderProps) {
  useLocale();
  const translation = useTranslation();
  // Keep only the active translation's source page mounted so scrolling cannot
  // discard its result or the original anchor used by "Keep as a plain note".
  const translationPage = useMemo(() => translation?.sourceKey ? source.pages.findIndex(page => `${annotationProps.conversationId}:${page.messageId}:${page.versionId}` === translation.sourceKey) : -1, [translation?.sourceKey, annotationProps.conversationId, source.pages]);
  const [initial] = useState(() => loadReaderPosition(source.id, source.pages.length, source.kind));
  const [pageIndex, setPageIndex] = useState(initial.pageIndex), [pageInput, setPageInput] = useState(String(initial.pageIndex + 1));
  const [view, setView] = useState(initial.view), [layout, setLayout] = useState<'paged' | 'continuous'>(initial.layout || 'continuous');
  const [zoom, setZoom] = useState(initial.zoom), [appearance, setAppearance] = useState(loadReaderAppearance);
  const [compareOriginal, setCompareOriginal] = useState(false);
  const [appearanceSaved, setAppearanceSaved] = useState(true), [positionSaved, setPositionSaved] = useState(true);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null), [loading, setLoading] = useState(source.kind === 'pdf');
  const [fileError, setFileError] = useState(''), [availableWidth, setAvailableWidth] = useState(700);
  const [navigationOpen, setNavigationOpen] = useState(false), [narrow, setNarrow] = useState(false);
  const [outline, setOutline] = useState<OutlineEntry[]>([]), [outlineLoading, setOutlineLoading] = useState(false);
  const [outlineError, setOutlineError] = useState(false), [outlineTruncated, setOutlineTruncated] = useState(false);
  const [geometry, setGeometry] = useState<PageGeometry>({});
  const geometryRef = useRef(geometry); geometryRef.current = geometry;
  const [nearPages, setNearPages] = useState(() => new Set([initial.pageIndex]));
  const [forcedPage, setForcedPage] = useState<number | null>(initial.pageIndex);
  const [search, setSearch] = useState<SearchFocus | null>(null), [navigationRevision, setNavigationRevision] = useState(0);
  const [queue] = useState(() => new PdfRenderQueue());
  const rootRef = useRef<HTMLElement>(null), viewportRef = useRef<HTMLDivElement>(null), textRef = useRef<HTMLElement>(null);
  const pageInputRef = useRef<HTMLInputElement>(null), slots = useRef(new Map<number, HTMLDivElement>());
  const registerSlot = useCallback((index: number, element: HTMLDivElement | null) => { if (element) slots.current.set(index, element); else slots.current.delete(index); }, []);
  const position = useRef<ReaderPosition>(initial), pendingPosition = useRef<ReaderPosition | null>(initial);
  const anchor = useRef<{ pageIndex: number; point: PdfZoomAnchor } | null>(null), restoring = useRef(true);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined), scrollFrame = useRef(0);
  const searchRequest = useRef(0), pendingSearch = useRef<number | null>(null), pendingNote = useRef<string | null>(null);
  const handledOpen = useRef<string | null>(null);
  const [linkHistory, setLinkHistory] = useState<ReaderPosition[]>([]);
  const linkController = useRef<AbortController | null>(null);
  const pendingLink = useRef<{ pageIndex: number; x: number; y: number } | null>(null);
  useEffect(() => () => linkController.current?.abort(), []);
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
      next.pageIndex = readerPageAtFocus(source.pages.length, i => pageBody(i)?.getBoundingClientRect() || { top: Infinity, bottom: Infinity }, focus);
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
    if (continuous) index = readerPageAtFocus(source.pages.length, i => pageBody(i)?.getBoundingClientRect() || { top: Infinity, bottom: Infinity }, y);
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
    else annotationProps.onNotify(t("已到对应页面，这处文字暂时无法精确定位，可切换“可批注文本”查看。"));
    scroll();
  };
  const jump = (value: number, keepAnnotation = false) => {
    pendingLink.current = null;
    const index = Math.max(0, Math.min(source.pages.length - 1, value));
    anchor.current = null; restoring.current = true;
    position.current = { ...position.current, pageIndex: index, pageOffset: 0, scrollY: 0, scrollX: 0 };
    pendingPosition.current = { ...position.current }; setPageIndex(index); setPageInput(String(index + 1)); setForcedPage(index);
    setNavigationRevision(value => value + 1);
    if (!keepAnnotation) { pendingNote.current = null; annotationProps.onOpen(null); }
  };
  const clearSearch = () => { pendingSearch.current = null; setSearch(null); };
  const locateLink = () => {
    const target = pendingLink.current, element = viewportRef.current;
    if (!target || !element) return;
    const body = pageBody(target.pageIndex);
    if (!body?.querySelector('canvas[data-page-ready="true"]')) return;
    restore(); pendingLink.current = null;
    const rect = body.getBoundingClientRect(), viewport = element.getBoundingClientRect();
    element.scrollTop += rect.top + rect.height * target.y - viewport.top - focusY(element);
    const targetX = rect.left + rect.width * target.x;
    if (targetX < viewport.left || targetX > viewport.right) element.scrollLeft += targetX - viewport.left - 24;
    scroll();
  };
  const followPdfLink = async (link: PdfLink) => {
    if (link.url) { window.open(link.url, '_blank', 'noopener,noreferrer'); return; }
    if (!pdf) return;
    linkController.current?.abort(); const controller = new AbortController(); linkController.current = controller;
    const from = readPosition();
    try {
      const target = await resolvePdfDestination(pdf, link.destination, controller.signal);
      if (!target) { annotationProps.onNotify('这条 PDF 链接没有可用的文内位置。'); return; }
      setLinkHistory(history => [...history.slice(-19), from]); clearSearch(); jump(target.pageIndex);
      pendingLink.current = target;
    } catch { if (!controller.signal.aborted) annotationProps.onNotify('暂时无法跳转到这条 PDF 引用。'); }
  };
  const returnFromLink = () => {
    const previous = linkHistory.at(-1); if (!previous) return;
    linkController.current?.abort(); clearSearch(); jump(previous.pageIndex);
    position.current = { ...previous, zoom: position.current.zoom, view: position.current.view, layout: position.current.layout };
    pendingPosition.current = { ...position.current };
    setLinkHistory(history => history.slice(0, -1));
  };
  useLayoutEffect(() => { locateLink(); }, [navigationRevision, geometry, zoom]);
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
  const appearanceRef = useRef(appearance); appearanceRef.current = appearance;
  useEffect(() => {
    const timer = setTimeout(() => setAppearanceSaved(saveReaderAppearance(appearance)), 180);
    return () => clearTimeout(timer);
  }, [appearance]);
  useEffect(() => {
    const save = () => { setAppearanceSaved(saveReaderAppearance(appearanceRef.current)); };
    document.addEventListener('learn:save-edits', save); window.addEventListener('pagehide', save);
    return () => { saveReaderAppearance(appearanceRef.current); document.removeEventListener('learn:save-edits', save); window.removeEventListener('pagehide', save); };
  }, []);
  useEffect(() => { onLocation({ documentId: source.id, pageNumber: pageIndex + 1 }); }, [source.id, pageIndex, onLocation]);
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
    // Read geometry only around the viewport. Opening a long PDF must not load
    // every PDFPageProxy or reflow the whole document in hundreds of batches.
    const order = [...new Set([position.current.pageIndex, 0, ...nearPages])].filter(i => !geometryRef.current[i]);
    const load = async () => {
      for (let i = 0; i < order.length; i += 3) {
        const batch = await Promise.all(order.slice(i, i + 3).map(async index => {
          try { const page = await pdf.getPage(source.pages[index].pageNumber), size = page.getViewport({ scale: 1 }); return [index, { width: size.width, height: size.height }] as const; } catch { return null; }
        }));
        if (cancelled) return;
        captureRef.current(); setGeometry(current => ({ ...current, ...Object.fromEntries(batch.filter(item => item !== null)) }));
      }
    }; void load(); return () => { cancelled = true; };
  }, [pdf, continuous, source.pages, nearPages, pageIndex]);
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
  const ready = (index: number) => { restore(); locateLink(); setForcedPage(current => current === index ? null : current); locateNoteRef.current(); };
  const page = source.pages[pageIndex], hasText = Boolean(page?.text.trim());
  const version = (index: number): MessageVersion => ({ id: source.pages[index].versionId, content: source.pages[index].text, status: 'complete', createdAt: source.createdAt });
  const annotationsByPage = useMemo(() => {
    const pages = new Map(source.pages.map((p, index) => [p.messageId, { index, versionId: p.versionId }]));
    const groups = new Map<number, typeof annotationProps.annotations>();
    for (const annotation of annotationProps.annotations) { const page = pages.get(annotation.messageId); if (page?.versionId !== annotation.versionId) continue; const group = groups.get(page.index) || []; group.push(annotation); groups.set(page.index, group); }
    return groups;
  }, [source.pages, annotationProps.annotations]);
  const renderPage = (index: number) => <PdfAnnotatedPage {...annotationProps} readerStyle={palette} annotations={annotationsByPage.get(index) || []} messageId={source.pages[index].messageId} version={version(index)} pdf={pdf!} pageNumber={source.pages[index].pageNumber} availableWidth={availableWidth} zoom={zoom} appearance={appearance} compareOriginal={compareOriginal} onPageReady={() => ready(index)} queue={queue} scrollViewport={viewportRef} maxPixels={continuous ? 8_000_000 : 16_000_000} search={search?.pageIndex === index ? search : null} onSearchLocated={locateSearch} onPdfLink={link => void followPdfLink(link)} />;
  const commitPage = () => {
    if (!/^\d+$/u.test(pageInput)) { setPageInput(String(position.current.pageIndex + 1)); return; }
    const index = Math.max(0, Math.min(source.pages.length - 1, Number(pageInput) - 1));
    if (index === position.current.pageIndex) { setPageInput(String(index + 1)); return; }
    selectPage(index);
  };
  const original = compareOriginal || appearance.preset === 'original', paper = original ? '#ffffff' : appearance.paper, ink = original ? '#000000' : appearance.ink;
  const palette = readerTheme(paper, ink) as CSSProperties;
  return <section ref={rootRef} className="document-reader" role="region" aria-label={t("文档阅读：{0}", [source.name])} data-testid="document-reader" data-reader-focused={focused} data-reader-dark={colorLuminance(paper) < .25 ? 'true' : 'false'} data-reader-narrow={narrow} data-reader-layout={continuous ? 'continuous' : 'paged'} style={palette}>
    <ReaderToolbar onReturnFromLink={linkHistory.length ? returnFromLink : undefined} contextMode={contextMode} onContextMode={onContextMode} relevantContext={usesRelevantContext(source, contextMode)} onOpenFile={onOpenFile} name={source.name} kind={source.kind} pageCount={source.pages.length} pageIndex={pageIndex} pageInput={pageInput} pageInputRef={pageInputRef} onPageInput={setPageInput} onCommitPage={commitPage} onPage={selectPage} zoom={zoom} onZoom={changeZoom} view={view} onView={switchView} layout={layout} onLayout={switchLayout} appearance={appearance} onAppearance={value => { setCompareOriginal(false); setAppearance(value); }} saved={appearanceSaved && positionSaved} compareOriginal={compareOriginal} onCompareOriginal={() => setCompareOriginal(value => !value)} navigationOpen={navigationOpen} onToggleNavigation={() => setNavigationOpen(value => !value)} focused={focused} onToggleFocus={() => { flush(); onToggleFocus(); }} onClose={() => { flush(); onClose(); }} modelLabel={modelLabel} onOpenModelSettings={onOpenModelSettings} onBackup={onBackup} />
    <div className="document-reader-body">
      <ReaderNavigation open={navigationOpen} source={source} annotations={annotationProps.annotations} pageIndex={pageIndex} outline={outline} outlineLoading={loading || outlineLoading} outlineError={outlineError || Boolean(fileError)} outlineTruncated={outlineTruncated} onClose={() => setNavigationOpen(false)} onPage={selectPage} onSearch={selectSearch} onClearSearch={clearSearch} onAnnotation={selectAnnotation} />
      <div ref={viewportRef} className={`document-reader-viewport ${view === 'text' ? 'document-reader-text-viewport' : ''}`} onScroll={scroll}>
        {!hasText && !continuous && <p className="document-reader-warning">{t("这一页没有可提取的文字，可能是扫描页。可查看原页面；暂不支持 OCR 识别和图片内容询问。")}</p>}
        {view === 'original' && loading && <div className="document-reader-empty" role="status">{t("正在打开 PDF…")}</div>}
        {view === 'original' && fileError && <div className="document-reader-empty" role="alert"><p>{t(fileError)}</p><button type="button" onClick={() => switchView('text')}>{t("打开已保存文字")}</button></div>}
        {view === 'original' && pdf && (continuous ? <div className="reader-continuous-pages">{source.pages.map((p, index) => {
          const size = pdfPageSize(geometry[index] || geometry[0] || { width: 612, height: 792 }, availableWidth, zoom);
          const active = nearPages.has(index) || forcedPage === index || openedPage === index || translationPage === index;
          return <ReaderPageSlot key={p.versionId} index={index} number={p.pageNumber} width={size.width} height={size.height} empty={!p.text.trim()} register={registerSlot}>{active ? renderPage(index) : null}</ReaderPageSlot>;
        })}</div> : <div key={`${source.id}:${pageIndex}:pdf`}>{renderPage(pageIndex)}</div>)}
        {page && view === 'text' && hasText && <article ref={textRef} className="document-page-text" key={`${source.id}:${pageIndex}:text`}><p className="document-text-page-label">{t("第 {0} 页 · 提取文字", [page.pageNumber])}</p><AnnotatedAnswer {...annotationProps} readerStyle={palette} annotations={annotationsByPage.get(pageIndex) || []} messageId={page.messageId} version={version(pageIndex)} plainText /></article>}
      </div>
    </div>
  </section>;
}
