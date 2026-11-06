import { t } from '../i18n/locale';
import { useLocale } from '../i18n/react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { loadPdfJs } from '../adapters/documents';
import { bindPdfTextSelection } from '../adapters/pdf-selection';
import { paintPdfFrame, startPdfFrame } from '../adapters/pdf-frame';
import { PdfColorProcessor } from '../adapters/pdf-color';
import { PdfRenderQueue } from '../adapters/pdf-navigation';
import { markReaderSearch } from '../adapters/reader-search';
import { pdfPageSize } from '../domain/pdf-zoom';
import { pdfLinkTextRegions, type PixelFrame } from '../domain/pdf-color';
import type { ReaderAppearance } from '../domain/reader';
import type { SearchFocus } from '../domain/reader-navigation';
import { pdfLinkAt, readPdfLinks, type PdfLink } from '../adapters/pdf-links';
import { AnnotatedAnswer } from './AnnotatedAnswer';
import type { AnnotatedAnswerProps } from './AnnotatedAnswer';

interface PdfAnnotatedPageProps extends AnnotatedAnswerProps {
  pdf: PDFDocumentProxy;
  pageNumber: number;
  availableWidth: number;
  zoom: number;
  appearance: ReaderAppearance;
  compareOriginal: boolean;
  onPageReady: () => void;
  queue: PdfRenderQueue;
  maxPixels?: number;
  search: SearchFocus | null;
  onSearchLocated: (marker: HTMLElement | null, request: number) => void;
  onPdfLink: (link: PdfLink) => void;
}

export function PdfAnnotatedPage({ pdf, pageNumber, availableWidth, zoom, appearance, compareOriginal, onPageReady, queue, maxPixels = 16_000_000, search, onSearchLocated, onPdfLink, ...annotationProps }: PdfAnnotatedPageProps) {
  useLocale();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const presentationRef = useRef<HTMLDivElement>(null);
  const [readyKey, setReadyKey] = useState(0);
  const [links, setLinks] = useState<PdfLink[]>([]);
  const linkClickStart = useRef<{ x: number; y: number } | null>(null);
  const [renderError, setRenderError] = useState('');
  const [colorError, setColorError] = useState(false);
  const originalRef = useRef<ImageData | null>(null);
  const colorSourceRef = useRef<PixelFrame | null>(null);
  const colorProcessor = useRef<PdfColorProcessor | null>(null);
  const colorRevision = useRef(0);
  useEffect(() => () => { colorRevision.current++; colorProcessor.current?.dispose(); colorProcessor.current = null; }, []);
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
  const paintRef = useRef((original?: ImageData | null, source?: PixelFrame | null) => Boolean(original));
  paintRef.current = (original = originalRef.current, source = colorSourceRef.current) => {
    const canvas = canvasRef.current;
    if (!original || !canvas) return false;
    try {
      colorRevision.current++; colorProcessor.current?.cancel();
      paintPdfFrame(canvas, original, appearance, compareOriginal, source?.linkText);
      canvas.style.visibility = 'visible';
      setColorError(false);
      return true;
    } catch { canvas.style.visibility = 'hidden'; setColorError(true); return false; }
  };
  useEffect(() => {
    const original = originalRef.current, source = colorSourceRef.current; if (!original || !source) return;
    const revision = ++colorRevision.current;
    const processor = colorProcessor.current ??= new PdfColorProcessor();
    const nextAppearance = compareOriginal ? { ...appearance, preset: 'original' as const } : appearance;
    const paint = async (fast: boolean) => {
      try {
        const frame = await processor.prepare(source, nextAppearance, fast);
        const canvas = canvasRef.current;
        if (!frame || !canvas || revision !== colorRevision.current || original !== originalRef.current) return;
        const display = new ImageData(new Uint8ClampedArray(frame.data), frame.width, frame.height);
        const context = canvas.getContext('2d', { alpha: true, willReadFrequently: true }); if (!context) throw new Error('Canvas unavailable');
        // Prepared offscreen. Resizing and publishing remain one synchronous commit.
        if (canvas.width !== frame.width) canvas.width = frame.width;
        if (canvas.height !== frame.height) canvas.height = frame.height;
        context.putImageData(display, 0, 0); canvas.style.visibility = 'visible'; setColorError(false);
      } catch { if (revision === colorRevision.current) setColorError(true); }
    };
    const request = requestAnimationFrame(() => { void paint(true); });
    const refine = setTimeout(() => { void paint(false); }, 160);
    return () => { colorRevision.current++; processor.cancel(); cancelAnimationFrame(request); clearTimeout(refine); };
  }, [appearance.paper, appearance.ink, appearance.preserveColors, appearance.preset, compareOriginal]);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
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
      const outputScale = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(maxPixels / (width * height)));
      if (!publishedScale.current) { stage.style.width = `${width}px`; stage.style.height = `${height}px`; }
      frameJob = startPdfFrame(page, library, viewport, outputScale, canvas.ownerDocument);
      const frame = await frameJob.promise;
      let nextLinks: PdfLink[] = [];
      try { nextLinks = await readPdfLinks(page, viewport, controller.signal); } catch { controller.signal.throwIfAborted(); }
      if (!cancelled && requested.current.zoom === zoom && requested.current.availableWidth === availableWidth) {
        const colorSource: PixelFrame = { width: frame.original.width, height: frame.original.height, data: frame.original.data, linkText: pdfLinkTextRegions(nextLinks, frame.textBounds, frame.original.width / viewport.width, frame.original.height / viewport.height) };
        if (!paintRef.current(frame.original, colorSource)) throw new Error('Page color preparation failed');
        // This whole commit is synchronous. The white source bitmap never enters
        // the visible canvas, and the new text and geometry arrive together.
        originalRef.current = frame.original;
        colorSourceRef.current = colorSource;
        stage.style.width = canvas.style.width = `${width}px`;
        stage.style.height = canvas.style.height = `${height}px`;
        stage.style.setProperty('--total-scale-factor', String(viewport.scale * viewport.userUnit));
        text.replaceChildren(frame.text);
        setLinks(nextLinks);
        canvas.dataset.pageReady = 'true';
        publishedScale.current = viewport.scale;
        preview();
        unbindSelection = bindPdfTextSelection(frame.text);
        setReadyKey(Date.now() || 1);
        readyRef.current();
      }
    };
    const timer = setTimeout(() => { void queue.enqueue(render, controller.signal).catch((error: unknown) => {
      if (!cancelled && !(error instanceof Error && ['RenderingCancelledException', 'AbortError'].includes(error.name))) setRenderError('这页暂时无法显示，请试试“可批注文本”视图。');
    }); }, publishedScale.current ? 120 : 0);
    return () => { cancelled = true; controller.abort(); clearTimeout(timer); unbindSelection?.(); frameJob?.cancel(); };
  }, [pdf, pageNumber, availableWidth, zoom, queue, maxPixels]);

  const locatedRef = useRef(onSearchLocated); locatedRef.current = onSearchLocated;
  useEffect(() => {
    if (!readyKey || !search || !stageRef.current || !textRef.current) return;
    const result = markReaderSearch(stageRef.current, textRef.current, search.query, search.ordinal);
    locatedRef.current(result.marker, search.request);
    return result.clear;
  }, [readyKey, search?.request, search?.query, search?.ordinal]);

  return <div className="document-pdf-wrap">
    {!readyKey && !renderError && <div className="document-render-status" role="status">{t("正在显示原页面…")}</div>}
    {renderError && <div className="document-reader-warning" role="alert">{t(renderError)}</div>}
    {colorError && <div className="document-reader-warning" role="status">{t("这一页暂时无法换色，可切换“可批注文本”，或主动选择“原色对照”查看。")}</div>}
    <div ref={presentationRef} className="document-page-presentation"><AnnotatedAnswer {...annotationProps} onSourceClick={point => {
      const stage = stageRef.current, start = linkClickStart.current;
      if (!readyKey || !stage || !start || Math.hypot(point.x - start.x, point.y - start.y) > 4) return false;
      const rect = stage.getBoundingClientRect(), scaleX = stage.offsetWidth / rect.width, scaleY = stage.offsetHeight / rect.height;
      const link = pdfLinkAt(links, (point.x - rect.left) * scaleX, (point.y - rect.top) * scaleY);
      if (!link) return false;
      onPdfLink(link); return true;
    }} contentReadyKey={readyKey} contentClassName="document-page-annotator" content={
      <div ref={stageRef} className="document-page-stage" onPointerDown={event => { linkClickStart.current = event.button === 0 ? { x: event.clientX, y: event.clientY } : null; }} onPointerMove={event => {
        const stage = event.currentTarget, rect = stage.getBoundingClientRect();
        const link = readyKey && pdfLinkAt(links, (event.clientX - rect.left) * stage.offsetWidth / rect.width, (event.clientY - rect.top) * stage.offsetHeight / rect.height);
        stage.dataset.linkHover = link ? 'true' : 'false'; stage.title = link ? (link.url || t('跳转到文内引用')) : '';
      }} onPointerLeave={event => { event.currentTarget.dataset.linkHover = 'false'; }}>
        <canvas ref={canvasRef} className="document-page-canvas" aria-label={t("PDF 第 {0} 页原页面", [pageNumber])} role="img" />
        <div ref={textRef} />
        {readyKey > 0 && <div className="pdf-link-accessibility">{links.map(link => <button type="button" key={link.id} className="pdf-link-keyboard" style={link.rect} aria-label={link.url ? t('打开链接：{0}', [link.url]) : t('跳转到文内引用：{0}', [link.label])} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); onPdfLink(link); } }} />)}</div>}
      </div>
    } /></div>
  </div>;
}

