import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, MouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { t } from '../i18n/locale';
import { useLocale } from '../i18n/react';
import type { DocumentReaderProps } from './DocumentReader';
import { AnnotatedAnswer } from './AnnotatedAnswer';
import { ReaderToolbar } from './ReaderToolbar';
import { ReaderNavigation } from './ReaderNavigation';
import { getDocumentBytes } from '../adapters/storage';
import { openEbook, type EbookSession, type EbookChapter, type EbookDestination } from '../adapters/ebooks';
import { bindEbookZoom, type EbookZoomController } from '../adapters/ebook-zoom';
import { clampPdfZoom } from '../domain/pdf-zoom';
import { loadReaderAppearance, saveReaderAppearance } from '../adapters/reader';
import { loadEbookPosition, saveEbookPosition, loadEbookTypography, saveEbookTypography } from '../adapters/ebook-preferences';
import { readerTheme, colorLuminance } from '../domain/reader';
import { usesRelevantContext } from '../domain/document-context';
import { ebookLayoutWidth, ebookTypography, type EbookTypography, type EbookPosition } from '../domain/ebook';
import type { OutlineEntry, SearchHit } from '../domain/reader-navigation';
import { readerAnnotationRange } from '../adapters/reader-location';
import { markReaderSearch } from '../adapters/reader-search';
import './documents.css';
import './ebooks.css';

const BLOCKS = 'p,h1,h2,h3,h4,h5,h6,li,pre,blockquote,table,figure';
const CSP = "default-src 'none'; script-src 'none'; img-src blob: data:; font-src blob: data:; style-src 'unsafe-inline' blob:; connect-src 'none'; media-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'";
function frameSource(chapter: EbookChapter, paper: string, ink: string) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${CSP}">${chapter.head}<style>html,body{background:${paper};color:${ink};margin:0}body{overflow-wrap:anywhere}#ebook-mount{min-height:100vh}</style></head><body><main id="ebook-mount"></main></body></html>`;
}
function sizeEbookPage(doc: Document, textWidth: number) {
  // The unzoomed root reserves a stable scrollbar gutter; the chapter's
  // displayed width must not feed back into how its lines are laid out.
  const available = doc.documentElement.getBoundingClientRect().width;
  const width = ebookLayoutWidth(available, textWidth);
  doc.getElementById('ebook-mount')?.style.setProperty('width', `${width}px`, 'important');
}
function capturePosition(doc: Document, chapter: number): EbookPosition {
  const root = doc.querySelector<HTMLElement>('.ebook-text'), scroll = doc.scrollingElement;
  const blocks = root ? [...root.querySelectorAll<HTMLElement>(BLOCKS)] : [];
  const index = blocks.findIndex(el => el.getBoundingClientRect().bottom > 24);
  const rect = blocks[index]?.getBoundingClientRect();
  return { chapter, block: Math.max(0, index), offset: rect ? Math.max(0, Math.min(1, (24 - rect.top) / Math.max(1, rect.height))) : 0, fraction: scroll ? scroll.scrollTop / Math.max(1, scroll.scrollHeight - scroll.clientHeight) : 0, zoom: clampPdfZoom(Number(doc.getElementById('ebook-mount')?.style.zoom) || 1), horizontal: scroll ? scroll.scrollLeft / Math.max(1, scroll.scrollWidth - scroll.clientWidth) : 0 };
}
function restorePosition(doc: Document, position: EbookPosition) {
  const scroll = doc.scrollingElement; if (!scroll) return;
  const blocks = doc.querySelector('.ebook-text')?.querySelectorAll<HTMLElement>(BLOCKS);
  const block = blocks?.[position.block];
  scroll.scrollTop = block ? scroll.scrollTop + block.getBoundingClientRect().top - 24 + block.getBoundingClientRect().height * position.offset : position.fraction * Math.max(0, scroll.scrollHeight - scroll.clientHeight);
  scroll.scrollLeft = (position.horizontal || 0) * Math.max(0, scroll.scrollWidth - scroll.clientWidth);
}

export default function EbookReader(props: DocumentReaderProps) {
  useLocale();
  const { source } = props;
  const initial = useMemo(() => loadEbookPosition(source.id, source.pages.length), [source.id]);
  const [chapterIndex, setChapterIndex] = useState(initial.chapter), [pageInput, setPageInput] = useState(String(initial.chapter + 1));
  const [book, setBook] = useState<EbookSession | null>(null), [chapter, setChapter] = useState<EbookChapter | null>(null);
  const [frameDoc, setFrameDoc] = useState<Document | null>(null), [error, setError] = useState(''), [loading, setLoading] = useState(true);
  const [outline, setOutline] = useState<OutlineEntry[]>([]), [outlineError, setOutlineError] = useState(false);
  const [navigationOpen, setNavigationOpen] = useState(false);
  const [narrow, setNarrow] = useState(false);
  const rootRef = useRef<HTMLElement>(null);
  const [appearance, setAppearance] = useState(loadReaderAppearance), [saved, setSaved] = useState(true), [compare, setCompare] = useState(false);
  const [typography, setTypography] = useState(() => loadEbookTypography(source.id));
  const typographyRef = useRef(typography); typographyRef.current = typography;
  const [zoom, setZoom] = useState(initial.zoom || 1);
  const zoomRef = useRef(zoom), zoomController = useRef<EbookZoomController | null>(null);
  const [search, setSearch] = useState<{ hit: SearchHit; query: string } | null>(null);
  const [returnTo, setReturnTo] = useState<EbookPosition | null>(null);
  const frameRef = useRef<HTMLIFrameElement>(null), pageInputRef = useRef<HTMLInputElement>(null);
  const pending = useRef<EbookPosition | null>(initial), pendingLink = useRef<EbookDestination | null>(null), pendingNote = useRef<string | null>(null);
  const position = useRef(initial), ready = useRef(false), frameState = useRef<{ doc: Document | null; index: number }>({ doc: null, index: chapterIndex });
  const propsRef = useRef(props); propsRef.current = props;
  const paper = compare ? '#ffffff' : appearance.paper, ink = compare ? '#000000' : appearance.ink;
  const palette = useMemo(() => readerTheme(paper, ink) as CSSProperties, [paper, ink]);
  const page = source.pages[chapterIndex];
  const savePosition = () => {
    const state = frameState.current;
    if (ready.current && state.doc && frameRef.current?.isConnected && state.doc.scrollingElement?.clientHeight) position.current = capturePosition(state.doc, state.index);
    saveEbookPosition(source.id, position.current);
  };
  const saveRef = useRef(savePosition); saveRef.current = savePosition;
  useLayoutEffect(() => () => saveRef.current(), [source.id]);
  useEffect(() => { const timer = setTimeout(() => saveRef.current(), 220); return () => clearTimeout(timer); }, [zoom]);
  const jump = (index: number, next?: EbookPosition) => {
    if (index < 0 || index >= source.pages.length) return;
    savePosition(); props.onOpen(null); setSearch(null); if (narrow) setNavigationOpen(false);
    if (next?.zoom !== undefined) { zoomRef.current = next.zoom; zoomController.current?.set(next.zoom); setZoom(next.zoom); }
    pending.current = next || { chapter: index, block: 0, offset: 0, fraction: 0 };
    if (index === chapterIndex && frameDoc) { restorePosition(frameDoc, pending.current); pending.current = null; }
    else { ready.current = false; setFrameDoc(null); setChapter(null); setChapterIndex(index); }
    setPageInput(String(index + 1));
  };
  useEffect(() => {
    const root = rootRef.current; if (!root) return;
    const observer = new ResizeObserver(() => setNarrow(root.clientWidth < 760));
    observer.observe(root); return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const controller = new AbortController(); let session: EbookSession | undefined;
    setLoading(true); setError('');
    void (async () => {
      try {
        const bytes = await getDocumentBytes(source.id); controller.signal.throwIfAborted();
        if (!bytes) throw new Error('原文件暂时不可用，请重新选择同一本电子书。');
        session = await openEbook(bytes, source.kind, controller.signal);
        if (controller.signal.aborted) { await session.destroy(); return; }
        if (session.count !== source.pages.length) throw new Error('电子书章节与阅读记录不一致，请重新导入文件。');
        setBook(session);
        try { const entries = await session.outline(controller.signal); if (!controller.signal.aborted) setOutline(entries); }
        catch { if (!controller.signal.aborted) setOutlineError(true); }
      } catch (cause) { if (!controller.signal.aborted) { setError(cause instanceof Error ? cause.message : '无法读取这本电子书。'); setLoading(false); } if (session) await session.destroy(); }
    })();
    return () => { controller.abort(); void session?.destroy(); };
  }, [source.id]);

  useEffect(() => {
    if (!book) return;
    const controller = new AbortController(); setLoading(true); setError('');
    void book.chapter(chapterIndex, controller.signal).then(value => {
      if (!controller.signal.aborted) { setChapter(value); setLoading(false); }
    }).catch(cause => { if (!controller.signal.aborted) { pendingLink.current = null; pendingNote.current = null; setError(cause instanceof Error ? cause.message : '无法读取这本电子书。'); setLoading(false); } });
    return () => controller.abort();
  }, [book, chapterIndex]);
  useEffect(() => { props.onLocation({ documentId: source.id, pageNumber: chapterIndex + 1 }); }, [source.id, chapterIndex, props.onLocation]);
  useEffect(() => {
    const unload = () => savePosition(); window.addEventListener('pagehide', unload);
    document.addEventListener('learn:save-edits', unload);
    return () => { savePosition(); window.removeEventListener('pagehide', unload); document.removeEventListener('learn:save-edits', unload); };
  }, [source.id]);

  // Persist typography without recreating iframe, annotations or publisher DOM.
  useLayoutEffect(() => {
    if (!frameDoc) return;
    let style = frameDoc.getElementById('ebook-user-style');
    if (!style) { style = frameDoc.createElement('style'); style.id = 'ebook-user-style'; frameDoc.head.append(style); }
    style.textContent = `html,body{background:${paper}!important;color:${ink}!important;color-scheme:${colorLuminance(paper) < .179 ? 'dark' : 'light'};scrollbar-color:${ink}55 ${paper}}html{scrollbar-gutter:stable}body{padding:0!important;margin:0!important;overflow-anchor:none;font-size:${typography.fontSize}px!important;line-height:${typography.lineHeight}!important;box-sizing:border-box}#ebook-mount{box-sizing:border-box!important;display:block!important;padding:24px 20px 60px!important;margin-inline:auto!important;max-width:none!important;overflow:visible!important}.ebook-text{max-width:${typography.width}px;margin-inline:auto;overflow-wrap:anywhere}.ebook-text *{color:inherit!important;line-height:inherit!important;background-color:transparent!important;cursor:text}.ebook-text :is(p,div,span,li,td){font-size:inherit!important}.ebook-text img,.ebook-text svg{max-width:100%!important;height:auto}.ebook-text :is(img,svg,svg *){cursor:default}.ebook-text :is(a,a *){color:${colorLuminance(paper) < .179 ? '#9dc7ff' : '#2165aa'}!important;cursor:pointer}.ebook-text pre,.ebook-text table{max-width:100%;overflow:auto}.ebook-text table{display:block}.annotation-footnote{max-width:${typography.width}px;margin:12px auto;font:14px/1.6 sans-serif}.ebook-chapter-navigation{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:12px;max-width:${typography.width}px;margin:40px auto 0;font:14px/1.5 sans-serif}.ebook-chapter-navigation button{border:1px solid ${ink}55;border-radius:8px;background:transparent;color:inherit;padding:8px 14px;cursor:pointer}.ebook-chapter-navigation button:disabled{opacity:.4;cursor:not-allowed}.ebook-annotator{position:relative}.reader-search-layer{position:absolute;inset:0;pointer-events:none}.reader-search-marker{position:absolute;background:#ffa80088;outline:1px solid #a2670080}::selection{background:#d8b35b80}`;
    sizeEbookPage(frameDoc, typography.width);
    if (ready.current && pending.current) { restorePosition(frameDoc, pending.current); pending.current = null; }
  }, [frameDoc, paper, ink, typography]);

  useLayoutEffect(() => {
    if (!frameDoc) return;
    const controller = bindEbookZoom(frameDoc, { zoom: zoomRef.current, onZoom: value => { zoomRef.current = value; setZoom(value); } });
    zoomController.current = controller;
    return () => { controller.destroy(); if (zoomController.current === controller) zoomController.current = null; };
  }, [frameDoc]);

  useEffect(() => {
    if (!frameDoc) return;
    frameState.current = { doc: frameDoc, index: chapterIndex };
    let cancelled = false, restoreTimer: ReturnType<typeof setTimeout> | undefined, scrollTimer: ReturnType<typeof setTimeout> | undefined;
    const restore = () => {
      if (cancelled) return;
      ready.current = true;
      if (pending.current) restorePosition(frameDoc, pending.current);
      const target = pendingLink.current?.anchor?.(frameDoc);
      if (target) target.scrollIntoView({ block: 'start' });
      pendingLink.current = null; pending.current = null;
      if (pendingNote.current) { const id = pendingNote.current; pendingNote.current = null; locateNote(id); }
      savePosition();
    };
    const restoreWhenReady = async () => {
      await Promise.race([Promise.all([frameDoc.fonts.ready, ...[...frameDoc.images].map(img => img.complete ? Promise.resolve() : img.decode().catch(() => {}))]), new Promise(resolve => { restoreTimer = setTimeout(resolve, 1500); })]);
      restore();
    };
    void restoreWhenReady();
    const scroll = () => {
      if (!ready.current) return;
      clearTimeout(scrollTimer); scrollTimer = setTimeout(savePosition, 220);
      window.dispatchEvent(new Event('scroll'));
    };
    const pointer = (event: PointerEvent) => {
      const frame = frameRef.current; if (!frame) return;
      const rect = frame.getBoundingClientRect();
      frame.dispatchEvent(new PointerEvent(event.type, { bubbles: true, clientX: rect.left + event.clientX, clientY: rect.top + event.clientY, pointerId: event.pointerId, button: event.button, buttons: event.buttons }));
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    };
    let frameWidth = frameRef.current?.clientWidth;
    const resize = new ResizeObserver(() => {
      const nextWidth = frameRef.current?.clientWidth;
      if (nextWidth && nextWidth !== frameWidth) {
        const before = ready.current ? capturePosition(frameDoc, chapterIndex) : null;
        sizeEbookPage(frameDoc, typographyRef.current.width);
        if (before) restorePosition(frameDoc, before);
      }
      frameWidth = nextWidth;
    });
    if (frameRef.current) resize.observe(frameRef.current);
    frameDoc.addEventListener('scroll', scroll, { passive: true }); frameDoc.addEventListener('keydown', key);
    for (const name of ['pointerdown', 'pointermove', 'pointerup'] as const) frameDoc.addEventListener(name, pointer);
    return () => {
      cancelled = true; clearTimeout(restoreTimer); clearTimeout(scrollTimer); resize.disconnect(); savePosition(); ready.current = false;
      if (frameState.current.doc === frameDoc) frameState.current = { doc: null, index: chapterIndex };
      frameDoc.removeEventListener('scroll', scroll); frameDoc.removeEventListener('keydown', key);
      for (const name of ['pointerdown', 'pointermove', 'pointerup'] as const) frameDoc.removeEventListener(name, pointer);
    };
  }, [frameDoc]);

  const locateNote = (id: string) => {
    if (!frameDoc) return;
    const annotation = propsRef.current.annotations.find(a => a.id === id), root = frameDoc.querySelector<HTMLElement>('.annotation-answer');
    const range = annotation && root ? readerAnnotationRange(root, annotation.anchor) : null;
    if (range && frameDoc.scrollingElement) frameDoc.scrollingElement.scrollTop += range.getBoundingClientRect().top - 60;
    propsRef.current.onOpen(id);
  };
  const selectNote = (id: string, index: number) => { if (index === chapterIndex && frameDoc) locateNote(id); else { jump(index); pendingNote.current = id; } };
  useEffect(() => {
    if (!frameDoc || !search) return;
    const root = frameDoc.querySelector<HTMLElement>('.annotation-answer'); if (!root) return;
    const marked = markReaderSearch(root, root, search.query, search.hit.ordinal);
    if (marked.marker && frameDoc.scrollingElement) frameDoc.scrollingElement.scrollTop += marked.marker.getBoundingClientRect().top - 70;
    return () => marked?.clear();
  }, [frameDoc, search]);

  const followLink = async (href: string, absolute = false) => {
    if (!book) return;
    try {
      if (/^https?:/i.test(href)) { if (window.confirm(t('即将使用系统浏览器打开链接：{0}', [href]))) window.open(href, '_blank', 'noopener,noreferrer'); return; }
      if (/^mailto:/i.test(href)) return;
      const destination = await book.destination(href, chapterIndex, absolute); if (!destination) return;
      setReturnTo(frameDoc ? capturePosition(frameDoc, chapterIndex) : position.current);
      if (destination.index === chapterIndex && frameDoc) destination.anchor?.(frameDoc)?.scrollIntoView({ block: 'start' });
      else { jump(destination.index); pendingLink.current = destination; }
    } catch (cause) { props.onNotify(cause instanceof Error ? cause.message : t('无法跳转到电子书链接。')); }
  };
  const onSourceClick = (event: MouseEvent) => {
    const target = event.target as Element;
    const link = target.closest?.('[data-book-href]'); if (!link) return;
    event.preventDefault(); void followLink(link.getAttribute('data-book-href') || '');
  };
  const updateTypography = (value: EbookTypography) => {
    const next = ebookTypography(value);
    if (frameDoc && ready.current) pending.current = capturePosition(frameDoc, chapterIndex);
    typographyRef.current = next; setTypography(next);
    if (!saveEbookTypography(source.id, next)) props.onNotify(t('排版设置仅在本次有效，请检查本机存储空间。'));
  };
  const srcDoc = useMemo(() => chapter ? frameSource(chapter, paper, ink) : '', [chapter]);
  const pageAnnotations = props.annotations.filter(a => a.messageId === page?.messageId && a.versionId === page?.versionId);
  return <section ref={rootRef} className="document-reader ebook-reader" style={palette} data-reader-focused={props.focused} data-reader-dark={colorLuminance(paper) < .179} data-reader-narrow={narrow}>
    <ReaderToolbar {...props} kind={source.kind} name={source.name} pageCount={source.pages.length} pageIndex={chapterIndex} pageInput={pageInput} pageInputRef={pageInputRef} onPageInput={setPageInput} onCommitPage={() => { const n = Number(pageInput); if (Number.isInteger(n) && n >= 1 && n <= source.pages.length) jump(n - 1); else setPageInput(String(chapterIndex + 1)); }} onPage={index => jump(index)} zoom={zoom} onZoom={value => zoomController.current?.set(value)} view="original" onView={() => {}} layout="paged" onLayout={() => {}} appearance={appearance} onAppearance={value => { setAppearance(value); setSaved(saveReaderAppearance(value)); }} saved={saved} compareOriginal={compare} onCompareOriginal={() => setCompare(value => !value)} navigationOpen={navigationOpen} onToggleNavigation={() => setNavigationOpen(value => !value)} relevantContext={usesRelevantContext(source, props.contextMode)} onReturnFromLink={returnTo ? () => { jump(returnTo.chapter, returnTo); setReturnTo(null); } : undefined} typography={typography} onTypography={updateTypography} />
    <div className="document-reader-body">
      <ReaderNavigation open={navigationOpen} source={source} annotations={props.annotations} pageIndex={chapterIndex} outline={outline.length ? outline : source.pages.map((page, index) => ({ key: page.messageId, title: page.title || t('第 {0} 章', [index + 1]), depth: 0, pageIndex: index }))} outlineLoading={!book && loading} outlineError={outlineError} outlineTruncated={outline.length >= 1000} onClose={() => setNavigationOpen(false)} onPage={index => jump(index)} onOutline={entry => { if (entry.href) void followLink(entry.href, true); else if (entry.pageIndex !== null) jump(entry.pageIndex); }} onSearch={(hit, query) => { if (hit.pageIndex !== chapterIndex) jump(hit.pageIndex); setSearch({ hit, query }); }} onClearSearch={() => setSearch(null)} onAnnotation={selectNote} />
      <div className="ebook-content" style={{ background: paper }}>
        {(loading || error) && <div className="document-reader-empty" role="status">{t(error || '正在读取电子书…')}</div>}
        {chapter && page && !error && <iframe key={chapterIndex} ref={frameRef} title={t('电子书正文')} className="ebook-frame" sandbox="allow-same-origin" referrerPolicy="no-referrer" srcDoc={srcDoc} style={{ background: paper }} onLoad={event => { const doc = event.currentTarget.contentDocument; if (doc?.getElementById('ebook-mount')) { doc.documentElement.lang = chapter.lang; doc.documentElement.className = chapter.htmlClass; doc.body.className = chapter.bodyClass; doc.body.dir = chapter.dir; setFrameDoc(doc); } }} />}
        {frameDoc?.getElementById('ebook-mount') && page && chapter && createPortal(<><AnnotatedAnswer {...props} readerStyle={palette} annotations={pageAnnotations} messageId={page.messageId} version={{ id: page.versionId, content: page.text, createdAt: source.createdAt, status: 'complete' }} contentClassName="ebook-annotator" content={<div className="ebook-text" onClick={onSourceClick} dangerouslySetInnerHTML={{ __html: chapter.body }} />} /><nav className="ebook-chapter-navigation"><button type="button" disabled={chapterIndex === 0} onClick={() => jump(chapterIndex - 1)}>{t('上一章')}</button><span>{t('第 {0} 章', [chapterIndex + 1])} / {source.pages.length}</span><button type="button" disabled={chapterIndex >= source.pages.length - 1} onClick={() => jump(chapterIndex + 1)}>{t('下一章')}</button></nav></>, frameDoc.getElementById('ebook-mount')!)}
      </div>
    </div>
  </section>;
}
