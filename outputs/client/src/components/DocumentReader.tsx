import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { ChevronLeft, ChevronRight, FileText, Minus, Plus, X, Palette, Columns2, Maximize2, Eye } from 'lucide-react';
import type { CSSProperties } from 'react';
import type { DocumentAttachment, MessageVersion } from '../domain/types';
import { loadPdfDocument, loadPdfJs } from '../adapters/documents';
import { bindPdfTextSelection } from '../adapters/pdf-selection';
import { bindPdfZoom } from '../adapters/pdf-zoom';
import { paintPdfFrame, startPdfFrame } from '../adapters/pdf-frame';
import { getDocumentBytes } from '../adapters/storage';
import { loadReaderAppearance, loadReaderPosition, saveReaderAppearance, saveReaderPosition } from '../adapters/reader';
import { colorLuminance } from '../domain/reader';
import { clampPdfZoom, pdfAnchorScrollDelta, pdfPageSize, pdfZoomAnchor } from '../domain/pdf-zoom';
import type { PdfZoomAnchor } from '../domain/pdf-zoom';
import type { ReaderAppearance, ReaderPosition } from '../domain/reader';
import { ReaderAppearancePanel } from './ReaderAppearancePanel';
import { AnnotatedAnswer } from './AnnotatedAnswer';
import type { AnnotatedAnswerProps } from './AnnotatedAnswer';
import './documents.css';

export interface DocumentReaderProps extends Omit<AnnotatedAnswerProps, 'messageId' | 'version' | 'plainText' | 'content' | 'contentReadyKey' | 'contentClassName'> {
  source: DocumentAttachment;
  onClose: () => void;
  focused: boolean;
  onToggleFocus: () => void;
}

interface PdfAnnotatedPageProps extends AnnotatedAnswerProps {
  pdf: PDFDocumentProxy;
  pageNumber: number;
  availableWidth: number;
  zoom: number;
  appearance: ReaderAppearance;
  compareOriginal: boolean;
  onPageReady: () => void;
}

function PdfAnnotatedPage({ pdf, pageNumber, availableWidth, zoom, appearance, compareOriginal, onPageReady, ...annotationProps }: PdfAnnotatedPageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const presentationRef = useRef<HTMLDivElement>(null);
  const [readyKey, setReadyKey] = useState(0);
  const [renderError, setRenderError] = useState('');
  const [colorError, setColorError] = useState(false);
  const originalRef = useRef<ImageData | null>(null);
  const pageSize = useRef<{ width: number; height: number } | null>(null);
  const publishedScale = useRef<number | null>(null);
  const requested = useRef({ availableWidth, zoom });
  requested.current = { availableWidth, zoom };
  const preview = () => {
    if (!presentationRef.current || !pageSize.current || !publishedScale.current) return;
    const size = pdfPageSize(pageSize.current, requested.current.availableWidth, requested.current.zoom);
    // Scale the whole completed page, including its text, while the next raster
    // is prepared. CSS zoom also gives the viewport the correct scroll extent.
    presentationRef.current.style.zoom = String(size.scale / publishedScale.current);
  };
  useLayoutEffect(preview, [availableWidth, zoom]);
  const readyRef = useRef(onPageReady);
  readyRef.current = onPageReady;
  const paintRef = useRef((original?: ImageData | null) => Boolean(original));
  paintRef.current = (original = originalRef.current) => {
    const canvas = canvasRef.current;
    if (!original || !canvas) return false;
    try {
      paintPdfFrame(canvas, original, appearance, compareOriginal);
      canvas.style.visibility = 'visible';
      setColorError(false);
      return true;
    } catch { canvas.style.visibility = 'hidden'; setColorError(true); return false; }
  };
  useLayoutEffect(() => { paintRef.current(); }, [appearance.paper, appearance.ink, appearance.preserveColors, appearance.preset, compareOriginal]);

  useEffect(() => {
    let cancelled = false;
    let frameJob: ReturnType<typeof startPdfFrame> | undefined;
    let unbindSelection: (() => void) | undefined;
    setReadyKey(0);
    setRenderError('');
    const render = async () => {
      const [page, library] = await Promise.all([pdf.getPage(pageNumber), loadPdfJs()]);
      const canvas = canvasRef.current;
      const text = textRef.current;
      const stage = stageRef.current;
      if (cancelled || !canvas || !text || !stage) return;
      const unscaled = page.getViewport({ scale: 1 });
      pageSize.current = unscaled;
      const size = pdfPageSize(unscaled, availableWidth, zoom);
      const viewport = page.getViewport({ scale: size.scale });
      const width = Math.floor(viewport.width);
      const height = Math.floor(viewport.height);
      const outputScale = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(16_000_000 / (width * height)));
      if (!publishedScale.current) { stage.style.width = `${width}px`; stage.style.height = `${height}px`; }
      frameJob = startPdfFrame(page, library, viewport, outputScale, canvas.ownerDocument);
      const frame = await frameJob.promise;
      if (!cancelled && requested.current.zoom === zoom && requested.current.availableWidth === availableWidth) {
        if (!paintRef.current(frame.original)) throw new Error('Page color preparation failed');
        // This whole commit is synchronous. The white source bitmap never enters
        // the visible canvas, and the new text and geometry arrive together.
        originalRef.current = frame.original;
        stage.style.width = canvas.style.width = `${width}px`;
        stage.style.height = canvas.style.height = `${height}px`;
        stage.style.setProperty('--total-scale-factor', String(viewport.scale * viewport.userUnit));
        text.replaceChildren(frame.text);
        canvas.dataset.pageReady = 'true';
        publishedScale.current = viewport.scale;
        preview();
        unbindSelection = bindPdfTextSelection(frame.text);
        setReadyKey(Date.now() || 1);
        readyRef.current();
      }
    };
    const timer = setTimeout(() => { void render().catch((error: unknown) => {
      if (!cancelled && !(error instanceof Error && error.name === 'RenderingCancelledException')) setRenderError('这页暂时无法显示，请试试“可批注文本”视图。');
    }); }, publishedScale.current ? 120 : 0);
    return () => { cancelled = true; clearTimeout(timer); unbindSelection?.(); frameJob?.cancel(); };
  }, [pdf, pageNumber, availableWidth, zoom]);

  return <div className="document-pdf-wrap">
    {!readyKey && !renderError && <div className="document-render-status" role="status">正在显示原页面…</div>}
    {renderError && <div className="document-reader-warning" role="alert">{renderError}</div>}
    {colorError && <div className="document-reader-warning" role="status">这一页暂时无法换色，可切换“可批注文本”，或主动选择“原色对照”查看。</div>}
    <div ref={presentationRef} className="document-page-presentation"><AnnotatedAnswer {...annotationProps} contentReadyKey={readyKey} contentClassName="document-page-annotator" content={
      <div ref={stageRef} className="document-page-stage">
        <canvas ref={canvasRef} className="document-page-canvas" aria-label={`PDF 第 ${pageNumber} 页原页面`} role="img" />
        <div ref={textRef} />
      </div>
    } /></div>
  </div>;
}

export function DocumentReader({ source, onClose, focused, onToggleFocus, ...annotationProps }: DocumentReaderProps) {
  const [initialPosition] = useState(() => loadReaderPosition(source.id, source.pages.length, source.kind));
  const [pageIndex, setPageIndex] = useState(initialPosition.pageIndex);
  const [pageInput, setPageInput] = useState(String(initialPosition.pageIndex + 1));
  const [view, setView] = useState<'original' | 'text'>(initialPosition.view);
  const [zoom, setZoom] = useState(initialPosition.zoom);
  const [appearance, setAppearance] = useState(loadReaderAppearance);
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const [compareOriginal, setCompareOriginal] = useState(false);
  const [appearanceSaved, setAppearanceSaved] = useState(true);
  const [positionSaved, setPositionSaved] = useState(true);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [loading, setLoading] = useState(source.kind === 'pdf');
  const [fileError, setFileError] = useState('');
  const [availableWidth, setAvailableWidth] = useState(700);
  const viewportRef = useRef<HTMLDivElement>(null);
  const positionRef = useRef<ReaderPosition>(initialPosition);
  const pendingScroll = useRef<Pick<ReaderPosition, 'scrollY' | 'scrollX'> | null>(initialPosition);
  const zoomAnchor = useRef<PdfZoomAnchor | null>(null);
  const restoring = useRef(true);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const restoreFrame = useRef(0);
  const captureZoomAnchor = (point?: { x: number; y: number }) => {
    const element = viewportRef.current;
    const stage = element?.querySelector<HTMLElement>('.document-page-stage:has(canvas[data-page-ready="true"])');
    if (!element || !stage) return false;
    const viewport = element.getBoundingClientRect();
    zoomAnchor.current = pdfZoomAnchor(stage.getBoundingClientRect(), viewport, point?.x ?? viewport.left + element.clientWidth / 2, point?.y ?? viewport.top + element.clientHeight / 2);
    return true;
  };
  const applyZoomAnchor = () => {
    const element = viewportRef.current, anchor = zoomAnchor.current;
    const stage = element?.querySelector<HTMLElement>('.document-page-stage');
    if (!element || !stage || !anchor) return;
    const delta = pdfAnchorScrollDelta(anchor, stage.getBoundingClientRect(), element.getBoundingClientRect());
    element.scrollLeft += delta.x; element.scrollTop += delta.y;
  };
  useLayoutEffect(() => { if (zoomAnchor.current) applyZoomAnchor(); }, [zoom, availableWidth]);
  const restoreScroll = () => {
    cancelAnimationFrame(restoreFrame.current);
    restoreFrame.current = requestAnimationFrame(() => {
      const element = viewportRef.current, pending = pendingScroll.current;
      if (!element || (!pending && !zoomAnchor.current)) return;
      if (zoomAnchor.current) applyZoomAnchor();
      else if (pending) element.scrollTo({ top: pending.scrollY * Math.max(0, element.scrollHeight - element.clientHeight), left: pending.scrollX * Math.max(0, element.scrollWidth - element.clientWidth) });
      zoomAnchor.current = null;
      pendingScroll.current = null;
      restoring.current = false;
      recordScroll();
    });
  };
  const recordScroll = () => {
    const element = viewportRef.current;
    if (!element || restoring.current) return;
    positionRef.current = { ...positionRef.current, scrollY: element.scrollTop / Math.max(1, element.scrollHeight - element.clientHeight), scrollX: element.scrollLeft / Math.max(1, element.scrollWidth - element.clientWidth) };
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => setPositionSaved(saveReaderPosition(source.id, positionRef.current)), 200);
  };
  const flushPosition = () => {
    const element = viewportRef.current;
    if (element && !restoring.current) positionRef.current = { ...positionRef.current, scrollY: element.scrollTop / Math.max(1, element.scrollHeight - element.clientHeight), scrollX: element.scrollLeft / Math.max(1, element.scrollWidth - element.clientWidth) };
    clearTimeout(saveTimer.current);
    saveReaderPosition(source.id, positionRef.current);
  };
  const flushRef = useRef(flushPosition);
  flushRef.current = flushPosition;
  const resetScroll = () => {
    zoomAnchor.current = null;
    positionRef.current = { ...positionRef.current, scrollY: 0, scrollX: 0 };
    pendingScroll.current = { scrollY: 0, scrollX: 0 };
    restoring.current = true;
  };
  const changeZoom = (value: number, point?: { x: number; y: number }) => {
    const next = clampPdfZoom(value);
    if (next === positionRef.current.zoom) return;
    captureZoomAnchor(point);
    pendingScroll.current = { scrollY: positionRef.current.scrollY, scrollX: positionRef.current.scrollX };
    restoring.current = true;
    positionRef.current = { ...positionRef.current, zoom: next };
    setZoom(next);
  };
  const changeZoomRef = useRef(changeZoom);
  changeZoomRef.current = changeZoom;
  useEffect(() => {
    const element = viewportRef.current;
    if (!element || source.kind !== 'pdf' || view !== 'original') return;
    return bindPdfZoom(element, { zoom: () => positionRef.current.zoom, onZoom: (value, point) => changeZoomRef.current(value, point) });
  }, [source.id, source.kind, view]);
  useEffect(() => { setAppearanceSaved(saveReaderAppearance(appearance)); }, [appearance]);
  useEffect(() => { setPositionSaved(saveReaderPosition(source.id, positionRef.current)); }, [source.id, pageIndex, view, zoom]);
  useEffect(() => () => { clearTimeout(saveTimer.current); cancelAnimationFrame(restoreFrame.current); saveReaderPosition(source.id, positionRef.current); }, [source.id]);
  useLayoutEffect(() => () => flushRef.current(), [source.id]);
  useEffect(() => { const flush = () => flushRef.current(); window.addEventListener('pagehide', flush); return () => window.removeEventListener('pagehide', flush); }, []);
  useEffect(() => { if (view === 'text') restoreScroll(); }, [view, pageIndex]);

  useEffect(() => {
    setFileError(''); setPdf(null);
    if (source.kind !== 'pdf') { setLoading(false); return; }
    let cancelled = false;
    let opened: PDFDocumentProxy | undefined;
    setLoading(true);
    const load = async () => {
      const bytes = await getDocumentBytes(source.id);
      if (cancelled) return;
      if (!bytes) throw new Error('Missing document');
      opened = await loadPdfDocument(bytes);
      if (cancelled) { await opened.loadingTask.destroy(); return; }
      setPdf(opened); setLoading(false);
    };
    void load().catch(() => {
      if (!cancelled) { setLoading(false); setFileError('无法打开本地原文件，仍可在“可批注文本”里阅读已保存的文字。'); }
    });
    return () => { cancelled = true; if (opened) void opened.loadingTask.destroy().catch(() => {}); };
  }, [source.id, source.kind]);

  useEffect(() => {
    const element = viewportRef.current;
    if (!element) return;
    let lastWidth = 0;
    const observer = new ResizeObserver(([entry]) => {
      const width = Math.round(entry.contentRect.width);
      if (width > 0 && width !== lastWidth) {
        lastWidth = width;
        if (captureZoomAnchor()) restoring.current = true;
        setAvailableWidth(width);
      }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const opened = annotationProps.annotations.find((annotation) => annotation.id === annotationProps.openAnnotationId);
    if (!opened) return;
    const targetPage = source.pages.findIndex((candidate) => candidate.messageId === opened.messageId && candidate.versionId === opened.versionId);
    if (targetPage < 0 || targetPage === pageIndex) return;
    // External entry points such as undo must retain the requested popup.
    setPageIndex(targetPage);
    setPageInput(String(targetPage + 1));
    positionRef.current = { ...positionRef.current, pageIndex: targetPage };
    resetScroll();
  }, [annotationProps.openAnnotationId, annotationProps.annotations, source.pages, pageIndex]);

  const page = source.pages[pageIndex];
  const version: MessageVersion | null = page ? { id: page.versionId, content: page.text, status: 'complete', createdAt: source.createdAt } : null;
  const hasText = Boolean(page?.text.trim());
  const pageAnnotations = annotationProps.annotations.filter((annotation) => annotation.messageId === page?.messageId && annotation.versionId === page?.versionId);
  const setPage = (value: number) => {
    const index = Math.max(0, Math.min(source.pages.length - 1, value));
    if (index === pageIndex) { setPageInput(String(index + 1)); return; }
    positionRef.current = { ...positionRef.current, pageIndex: index };
    resetScroll();
    setPageIndex(index); setPageInput(String(index + 1));
    annotationProps.onOpen(null);
  };
  const commitPage = () => {
    if (/^\d+$/u.test(pageInput)) setPage(Number(pageInput) - 1);
    else setPageInput(String(pageIndex + 1));
  };
  const switchView = (value: 'original' | 'text') => { if (value === view) return; annotationProps.onOpen(null); positionRef.current = { ...positionRef.current, view: value }; resetScroll(); setView(value); };
  const original = compareOriginal || appearance.preset === 'original';
  const displayPaper = original ? '#ffffff' : appearance.paper;
  const displayInk = original ? '#000000' : appearance.ink;
  const readerStyle = { '--reader-paper': displayPaper, '--reader-ink': displayInk } as CSSProperties;

  return <section className="document-reader" role="region" aria-label={`文档阅读：${source.name}`} data-testid="document-reader" data-reader-dark={colorLuminance(displayPaper) < .25 ? 'true' : 'false'} style={readerStyle}>
    <header className="document-reader-header">
      <FileText size={18} aria-hidden="true" />
      <div className="document-reader-heading"><strong title={source.name}>{source.name}</strong><span>保存在本机 · {source.pages.length} 页</span></div>
      <button type="button" className="document-tool-button" aria-label={focused ? '显示聊天' : '专注阅读'} onClick={() => { flushPosition(); onToggleFocus(); }}>{focused ? <Columns2 size={15} /> : <Maximize2 size={15} />}{focused ? '显示聊天' : '专注阅读'}</button>
      <button type="button" className="document-icon-button" aria-label="关闭文档阅读" onClick={() => { flushPosition(); onClose(); }}><X size={19} /></button>
    </header>
    <div className="document-reader-toolbar">
      {source.kind === 'pdf' && <div className="document-view-switch" aria-label="文档显示方式">
        <button type="button" aria-pressed={view === 'original'} onClick={() => switchView('original')}>PDF 原排版</button>
        <button type="button" aria-pressed={view === 'text'} onClick={() => switchView('text')}>可批注文本</button>
      </div>}
      <div className="document-page-navigation">
        <button type="button" className="document-icon-button" aria-label="上一页" disabled={pageIndex <= 0} onClick={() => setPage(pageIndex - 1)}><ChevronLeft size={17} /></button>
        <label><span className="document-sr-only">页码</span><input aria-label="文档页码" type="text" inputMode="numeric" value={pageInput} onChange={(event) => setPageInput(event.target.value)} onBlur={commitPage} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); commitPage(); } }} /><span> / {source.pages.length}</span></label>
        <button type="button" className="document-icon-button" aria-label="下一页" disabled={pageIndex >= source.pages.length - 1} onClick={() => setPage(pageIndex + 1)}><ChevronRight size={17} /></button>
      </div>
      {source.kind === 'pdf' && view === 'original' && <div className="document-zoom-controls">
        <button type="button" className="document-icon-button" aria-label="缩小 PDF" disabled={zoom <= 0.5} onClick={() => changeZoom(zoom - .25)}><Minus size={15} /></button>
        <button type="button" className="document-fit-button" title="恢复适合宽度" onClick={() => changeZoom(1)}>{zoom === 1 ? '适合宽度' : `${Math.round(zoom * 100)}%`}</button>
        <button type="button" className="document-icon-button" aria-label="放大 PDF" disabled={zoom >= 2.5} onClick={() => changeZoom(zoom + .25)}><Plus size={15} /></button>
      </div>}
      <div className="document-color-actions"><button type="button" className="document-tool-button" aria-expanded={appearanceOpen} onClick={() => setAppearanceOpen(value => !value)}><Palette size={14} />阅读配色</button><button type="button" className="document-tool-button" aria-pressed={compareOriginal} disabled={appearance.preset === 'original'} onClick={() => setCompareOriginal(value => !value)}><Eye size={14} />原色对照</button></div>
    </div>
    {appearanceOpen && <ReaderAppearancePanel appearance={appearance} saved={appearanceSaved && positionSaved} onChange={value => { setCompareOriginal(false); setAppearance(value); }} />}
    <p className="document-reader-hint">划选文字可询问 AI 或仅加批注。PDF 支持触控板双指捏合缩放、双指滑动滚动，也可用 Ctrl + 滚轮。询问会发送本对话和文档提取文字；原文件保存在本机。</p>
    <div ref={viewportRef} className={`document-reader-viewport ${view === 'text' ? 'document-reader-text-viewport' : ''}`} onScroll={recordScroll}>
      {!hasText && <p className="document-reader-warning">这一页没有可提取的文字，可能是扫描页。可查看原页面；暂不支持 OCR 识别和图片内容询问。扫描页使用深色配色时，可关闭“保留彩色区域”来调整整页明暗。</p>}
      {view === 'original' && loading && <div className="document-reader-empty" role="status">正在打开 PDF…</div>}
      {view === 'original' && fileError && <div className="document-reader-empty" role="alert"><p>{fileError}</p><button type="button" onClick={() => switchView('text')}>打开已保存文字</button></div>}
      {page && version && view === 'original' && pdf && <PdfAnnotatedPage key={`${source.id}:${pageIndex}:pdf`} {...annotationProps} annotations={pageAnnotations} messageId={page.messageId} version={version} pdf={pdf} pageNumber={page.pageNumber} availableWidth={availableWidth} zoom={zoom} appearance={appearance} compareOriginal={compareOriginal} onPageReady={restoreScroll} />}
      {page && version && view === 'text' && hasText && <article className="document-page-text" key={`${source.id}:${pageIndex}:text`}><p className="document-text-page-label">第 {page.pageNumber} 页 · 提取文字</p><AnnotatedAnswer {...annotationProps} annotations={pageAnnotations} messageId={page.messageId} version={version} plainText /></article>}
    </div>
  </section>;
}
