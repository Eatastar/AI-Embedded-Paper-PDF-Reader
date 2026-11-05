import { t } from '../i18n/locale';
import { useLocale } from '../i18n/react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, Clipboard, Copy, MessageSquare, MessageSquarePlus, Trash2, X } from 'lucide-react';
import { MathMarkdown } from './MathMarkdown';
import { createTextAnnotator, rangeToSelector } from '@recogito/text-annotator';
import type { TextAnnotator, TextAnnotation, TextSelector } from '@recogito/text-annotator';
import type { Annotation, MessageVersion } from '../domain/types';
import { reviveQuoteSelector } from '../adapters/anchors';
import { AnnotationCard } from './AnnotationCard';
import { MovableAnnotationPopup } from './MovableAnnotationPopup';
import '@recogito/text-annotator/text-annotator.css';
import 'katex/dist/katex.min.css';
import './annotation.css';

export interface AnnotatedAnswerProps {
  conversationId: string;
  messageId: string;
  version: MessageVersion;
  annotations: Annotation[];
  reservedColors?: string[];
  openAnnotationId: string | null;
  onOpen: (id: string | null) => void;
  onCreate: (annotation: Annotation) => void;
  onUpdate: (id: string, patch: Partial<Annotation>) => void;
  onAsk: (id: string) => void;
  onStop: (id: string) => void;
  onReask: (id: string, action: 'start' | 'cancel' | 'edit') => void;
  onDelete: (id: string) => void;
  onNotify: (message: string) => void;
  disabled?: boolean;
  plainText?: boolean;
  content?: ReactNode;
  contentReadyKey?: string | number;
  contentClassName?: string;
}

interface SavedAnchor { selectors: TextSelector[] }
interface SelectionDraft { selector: TextSelector; rect: DOMRect }
interface AnnotationChoice { ids: string[]; rect: DOMRect }
interface AnswerMenu { x: number; y: number; ids: string[]; selection: SelectionDraft | null; targetId: string | null }
const COLORS = ['#f3cf67', '#a9c6f6', '#b7ddba', '#e6b4d7', '#c9baf1', '#f3ba95', '#94d5d3', '#d7d68d'];

function annotationColor(index: number): string {
  if (index < COLORS.length) return COLORS[index];
  // Golden-angle hues keep later notes distinct; the domain accepts hex colors.
  const hue = (index * 137.508) % 360;
  const saturation = 0.57;
  const lightness = 0.76;
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const secondary = chroma * (1 - Math.abs((hue / 60) % 2 - 1));
  const base = lightness - chroma / 2;
  const channels = hue < 60 ? [chroma, secondary, 0] : hue < 120 ? [secondary, chroma, 0] : hue < 180 ? [0, chroma, secondary] : hue < 240 ? [0, secondary, chroma] : hue < 300 ? [secondary, 0, chroma] : [chroma, 0, secondary];
  return `#${channels.map((channel) => Math.round((channel + base) * 255).toString(16).padStart(2, '0')).join('')}`;
}

function readAnchor(value: unknown): SavedAnchor | null {
  if (!value || typeof value !== 'object' || !('selectors' in value) || !Array.isArray(value.selectors)) return null;
  const selectors = value.selectors.filter((entry: unknown): entry is TextSelector => Boolean(entry && typeof entry === 'object' && 'start' in entry && typeof entry.start === 'number' && 'end' in entry && typeof entry.end === 'number' && 'quote' in entry && typeof entry.quote === 'string'));
  return selectors.length ? { selectors } : null;
}

function toTextAnnotation(annotation: Annotation): TextAnnotation | null {
  const anchor = readAnchor(annotation.anchor);
  return anchor ? { id: annotation.id, bodies: [], target: { annotation: annotation.id, selector: anchor.selectors, created: new Date(annotation.createdAt) } } : null;
}

function popupPosition(rect: DOMRect | null, height = 440, preferredWidth = 390): CSSProperties {
  const width = Math.min(preferredWidth, window.innerWidth - 24);
  const maxHeight = window.innerHeight - 32;
  if (!rect) return { width, maxHeight, left: Math.max(12, (window.innerWidth - width) / 2), top: 32 };
  const beside = rect.right + width + 28 < window.innerWidth;
  const left = beside ? rect.right + 18 : Math.max(12, Math.min(window.innerWidth - width - 12, rect.left));
  const idealTop = beside ? rect.top - 24 : rect.bottom + 12;
  return { width, maxHeight, left, top: Math.max(16, Math.min(idealTop, window.innerHeight - Math.min(height, maxHeight) - 16)) };
}

export function AnnotatedAnswer({ conversationId, messageId, version, annotations, reservedColors = [], openAnnotationId, onOpen, onCreate, onUpdate, onAsk, onStop, onReask, onDelete, onNotify, disabled, plainText = false, content, contentReadyKey, contentClassName = '' }: AnnotatedAnswerProps) {
  useLocale();
  const proseRef = useRef<HTMLDivElement>(null);
  const annotatorRef = useRef<TextAnnotator<TextAnnotation, TextAnnotation> | null>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const chooserRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuReturnFocusRef = useRef<HTMLElement | null>(null);
  const lastRectRef = useRef<DOMRect | null>(null);
  const [selectionDraft, setSelectionDraft] = useState<SelectionDraft | null>(null);
  const [annotationChoice, setAnnotationChoice] = useState<AnnotationChoice | null>(null);
  const [answerMenu, setAnswerMenu] = useState<AnswerMenu | null>(null);
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({});
  const [manualCopy, setManualCopy] = useState<string | null>(null);
  const [popupStyle, setPopupStyle] = useState<CSSProperties>({});
  const [layoutRevision, setLayoutRevision] = useState(0);
  const [unlocatedAnnotationIds, setUnlocatedAnnotationIds] = useState<string[]>([]);
  // A PDF text layer may arrive after its canvas. Zero explicitly pauses all
  // selection/anchor work until the caller has finished building that layer.
  const isComplete = version.status === 'complete' && contentReadyKey !== 0;
  const visibleAnnotations = annotations.filter((annotation) => annotation.messageId === messageId && annotation.versionId === version.id);
  const openAnnotation = visibleAnnotations.find((annotation) => annotation.id === openAnnotationId);
  const unlocatedAnnotations = visibleAnnotations.filter((annotation) => unlocatedAnnotationIds.includes(annotation.id));
  const choices = annotationChoice ? visibleAnnotations.filter((annotation) => annotationChoice.ids.includes(annotation.id)) : [];
  const menuAnnotations = answerMenu ? visibleAnnotations.filter((annotation) => answerMenu.ids.includes(annotation.id)) : [];
  const menuAnnotation = menuAnnotations.find((annotation) => annotation.id === answerMenu?.targetId);
  const callbacksRef = useRef({ onOpen, annotations: visibleAnnotations, openAnnotationId });
  callbacksRef.current = { onOpen, annotations: visibleAnnotations, openAnnotationId };
  // Store changes to question/answer do not recreate native text ranges.
  const anchorSignature = JSON.stringify(visibleAnnotations.map(({ id, anchor, color }) => ({ id, anchor, color })));

  useEffect(() => {
    const element = proseRef.current;
    if (!element || !isComplete) return;
    const annotator = createTextAnnotator<TextAnnotation, TextAnnotation>(element, {
      annotatingEnabled: false,
      renderer: 'SPANS',
      selectorReviveFn: reviveQuoteSelector,
      style: (annotation, state) => {
        const saved = callbacksRef.current.annotations.find((entry) => entry.id === annotation.id);
        return { fill: saved?.color || COLORS[0], fillOpacity: state.selected ? 0.64 : 0.44, underlineThickness: state.selected ? 2 : 1, underlineColor: saved?.color || COLORS[0] };
      },
    });
    annotatorRef.current = annotator;
    // Recalculate the overlay after a web font, formula or responsive layout changes.
    const observer = new ResizeObserver(() => {
      annotator.state.store.recalculatePositions();
      setLayoutRevision((revision) => revision + 1);
    });
    observer.observe(element);
    return () => { observer.disconnect(); annotator.destroy(); annotatorRef.current = null; };
  }, [version.id, isComplete, version.content, contentReadyKey]);

  useEffect(() => {
    const annotator = annotatorRef.current;
    if (!annotator) { setUnlocatedAnnotationIds([]); return; }
    const saved = callbacksRef.current.annotations.map(toTextAnnotation).filter((annotation): annotation is TextAnnotation => annotation !== null);
    annotator.setAnnotations(saved, true);
    setUnlocatedAnnotationIds(callbacksRef.current.annotations.filter((annotation) => {
      const selectorCount = readAnchor(annotation.anchor)?.selectors.length;
      return !selectorCount || annotator.state.store.getAnnotation(annotation.id)?.target.selector.length !== selectorCount;
    }).map((annotation) => annotation.id));
    if (callbacksRef.current.openAnnotationId && saved.some((annotation) => annotation.id === callbacksRef.current.openAnnotationId)) annotator.setSelected(callbacksRef.current.openAnnotationId);
    setLayoutRevision((revision) => revision + 1);
  }, [anchorSignature, version.id, isComplete, version.content, contentReadyKey]);

  useEffect(() => {
    const annotator = annotatorRef.current;
    if (!annotator) return;
    annotator.setSelected(openAnnotation?.id);
  }, [openAnnotation?.id]);

  useEffect(() => {
    setAnnotationChoice(null);
    setSelectionDraft(null);
    setAnswerMenu(null);
    setManualCopy(null);
  }, [version.id, contentReadyKey]);

  useLayoutEffect(() => {
    if (!answerMenu || !menuRef.current) return;
    const width = menuRef.current.offsetWidth;
    const height = menuRef.current.offsetHeight;
    setMenuStyle({ left: Math.max(8, Math.min(answerMenu.x, window.innerWidth - width - 8)), top: Math.max(8, Math.min(answerMenu.y, window.innerHeight - height - 8)) });
    menuRef.current.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')?.focus({ preventScroll: true });
  }, [answerMenu]);

  useEffect(() => {
    if (!answerMenu) return;
    const dismiss = (event: Event) => {
      if (event.target instanceof Node && menuRef.current?.contains(event.target)) return;
      setAnswerMenu(null);
    };
    document.addEventListener('pointerdown', dismiss);
    window.addEventListener('scroll', dismiss, true);
    window.addEventListener('resize', dismiss);
    return () => { document.removeEventListener('pointerdown', dismiss); window.removeEventListener('scroll', dismiss, true); window.removeEventListener('resize', dismiss); };
  }, [answerMenu]);

  useEffect(() => {
    if (!annotationChoice) return;
    chooserRef.current?.querySelector<HTMLButtonElement>('.annotation-choice-button')?.focus({ preventScroll: true });
    const dismiss = (event: Event) => {
      if (event.target instanceof Node && chooserRef.current?.contains(event.target)) return;
      setAnnotationChoice(null);
    };
    window.addEventListener('resize', dismiss);
    window.addEventListener('scroll', dismiss, true);
    return () => { window.removeEventListener('resize', dismiss); window.removeEventListener('scroll', dismiss, true); };
  }, [annotationChoice]);

  useEffect(() => {
    if (!openAnnotation) return;
    const update = () => setLayoutRevision((revision) => revision + 1);
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    const observer = new ResizeObserver(update);
    if (popupRef.current) observer.observe(popupRef.current);
    return () => { window.removeEventListener('resize', update); window.removeEventListener('scroll', update, true); observer.disconnect(); };
  }, [openAnnotation?.id]);

  useLayoutEffect(() => {
    if (!openAnnotation) return;
    const element = proseRef.current;
    const bounds = annotatorRef.current?.state.store.getAnnotationBounds(openAnnotation.id);
    const container = element?.getBoundingClientRect();
    const rect = bounds && container ? new DOMRect(container.left + bounds.x, container.top + bounds.y, bounds.width, bounds.height) : lastRectRef.current;
    if (rect) lastRectRef.current = rect;
    setPopupStyle(popupPosition(rect, popupRef.current?.offsetHeight || 440));
  }, [openAnnotation?.id, layoutRevision]);

  useEffect(() => {
    const clearSelection = () => {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed) setSelectionDraft(null);
    };
    const dismiss = (event: PointerEvent) => {
      if (!(event.target instanceof Element) || !event.target.closest('.annotation-selection-button')) setSelectionDraft(null);
      if (!(event.target instanceof Node) || !chooserRef.current?.contains(event.target)) setAnnotationChoice(null);
    };
    document.addEventListener('selectionchange', clearSelection);
    document.addEventListener('pointerdown', dismiss);
    return () => { document.removeEventListener('selectionchange', clearSelection); document.removeEventListener('pointerdown', dismiss); };
  }, []);

  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!isComplete || event.button !== 0) return;
    const element = proseRef.current;
    const selection = window.getSelection();
    if (!element || !selection) return;
    if (!selection.isCollapsed && selection.rangeCount) {
      const range = selection.getRangeAt(0);
      if (!element.contains(range.startContainer) || !element.contains(range.endContainer) || !range.toString().trim()) return;
      const revived = rangeToSelector(range, element);
      const rects = range.getClientRects();
      const rect = rects.length ? rects[rects.length - 1] : range.getBoundingClientRect();
      setAnnotationChoice(null);
      setSelectionDraft({ selector: { start: revived.start, end: revived.end, quote: revived.quote }, rect });
      return;
    }
    setSelectionDraft(null);
    const rect = element.getBoundingClientRect();
    // Recogito's public all=true overload returns every range under the pointer.
    // Deduplicate IDs because a wrapped annotation may have several hit rects.
    const hits = annotatorRef.current?.state.store.getAt(event.clientX - rect.left, event.clientY - rect.top, true) || [];
    const hitIds = new Set(hits.map((annotation) => annotation.id));
    const matching = visibleAnnotations.filter((annotation) => hitIds.has(annotation.id));
    if (matching.length) {
      lastRectRef.current = new DOMRect(event.clientX, event.clientY, 1, 18);
      if (matching.length > 1) {
        onOpen(null);
        setAnnotationChoice({ ids: matching.map((annotation) => annotation.id), rect: lastRectRef.current });
      } else {
        setAnnotationChoice(null);
        onOpen(matching[0].id);
      }
    }
  };

  const createAnnotation = (draft = selectionDraft) => {
    if (!draft || !isComplete || !annotatorRef.current) return;
    const now = Date.now();
    const id = crypto.randomUUID();
    lastRectRef.current = draft.rect;
    const usedColors = new Set([...reservedColors, ...visibleAnnotations.map((annotation) => annotation.color)].map((color) => color.toLowerCase()));
    let colorIndex = 0;
    while (usedColors.has(annotationColor(colorIndex).toLowerCase())) colorIndex += 1;
    const nextColor = annotationColor(colorIndex);
    try { onCreate({ id, conversationId, messageId, versionId: version.id, quote: draft.selector.quote, anchor: { selectors: [draft.selector] } satisfies SavedAnchor, color: nextColor, mode: 'ask', question: '', answer: '', edited: false, status: 'draft', createdAt: now, updatedAt: now }); }
    catch (error) { onNotify(error instanceof Error ? error.message : t("无法创建批注，请先导出备份。")); return; }
    onOpen(id);
    setAnnotationChoice(null);
    setSelectionDraft(null);
    setAnswerMenu(null);
    window.getSelection()?.removeAllRanges();
  };

  const handleContextMenu = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!isComplete || (event.target instanceof Element && event.target.closest('input, textarea, [contenteditable="true"]'))) return;
    event.preventDefault();
    const element = proseRef.current;
    if (!element) return;
    const bounds = element.getBoundingClientRect();
    const keyboardTriggered = event.clientX === 0 && event.clientY === 0;
    const x = keyboardTriggered ? bounds.left + 20 : event.clientX;
    const y = keyboardTriggered ? bounds.top + 20 : event.clientY;
    const hits = annotatorRef.current?.state.store.getAt(x - bounds.left, y - bounds.top, true) || [];
    const hitIds = new Set(hits.map((annotation) => annotation.id));
    if (keyboardTriggered && openAnnotation) hitIds.add(openAnnotation.id);
    const ids = visibleAnnotations.filter((annotation) => hitIds.has(annotation.id)).map((annotation) => annotation.id);
    const selection = window.getSelection();
    let draft: SelectionDraft | null = null;
    if (selection && !selection.isCollapsed && selection.rangeCount) {
      const range = selection.getRangeAt(0);
      if (element.contains(range.startContainer) && element.contains(range.endContainer) && range.toString().trim()) {
        const selector = rangeToSelector(range, element);
        draft = { selector: { start: selector.start, end: selector.end, quote: selector.quote }, rect: range.getBoundingClientRect() };
      }
    }
    menuReturnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setSelectionDraft(null);
    setAnnotationChoice(null);
    setMenuStyle({ left: x, top: y });
    setAnswerMenu({ x, y, ids, selection: draft, targetId: ids.length === 1 ? ids[0] : null });
  };

  const closeMenu = (restoreFocus = false) => {
    setAnswerMenu(null);
    if (restoreFocus) menuReturnFocusRef.current?.focus({ preventScroll: true });
  };

  const copyText = async (text: string) => {
    closeMenu();
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(text);
      onNotify(t("已复制到剪贴板。"));
    } catch {
      setManualCopy(text);
    }
  };

  const handleMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeMenu(true); return; }
    if (event.key === 'Tab') { closeMenu(); return; }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const buttons = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') || []);
    if (!buttons.length) return;
    const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const index = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (current + (event.key === 'ArrowUp' ? -1 : 1) + buttons.length) % buttons.length;
    buttons[index]?.focus({ preventScroll: true });
  };

  return (
    <>
      <div ref={proseRef} className={`annotation-answer${isComplete ? ' annotation-answer-ready' : ''}${contentClassName ? ` ${contentClassName}` : ''}`} onPointerUp={handlePointerUp} onContextMenu={handleContextMenu} data-testid="annotated-answer" data-version-id={version.id}>
        {content ?? (plainText ? <div className="annotation-plain-text">{version.content}</div> : <MathMarkdown streaming={version.status === 'streaming'}>{version.content}</MathMarkdown>)}
      </div>
      {unlocatedAnnotations.length > 0 && <details className="annotation-footnote" data-testid="unlocated-annotations">
        <summary>{t("有")}{unlocatedAnnotations.length}{t("条批注暂未定位原文")}</summary>
        <p>{t("排版更新后，部分原文位置可能变化。批注已保留，可在这里打开。")}</p>
        {unlocatedAnnotations.map((annotation) => <button
          type="button"
          key={annotation.id}
          className="annotation-choice-button"
          title={annotation.quote}
          onClick={(event) => { lastRectRef.current = event.currentTarget.getBoundingClientRect(); onOpen(annotation.id); }}
        ><span className="annotation-color-dot" style={{ background: annotation.color }} /><span className="annotation-choice-copy"><span className="annotation-choice-ordinal">{t("批注")}{visibleAnnotations.findIndex((entry) => entry.id === annotation.id) + 1}</span><span className="annotation-choice-preview">{(annotation.mode === 'note' ? annotation.note?.trim() : annotation.question.trim()) || annotation.quote}</span></span></button>)}
      </details>}
      {selectionDraft && isComplete && createPortal(
        <button
          type="button"
          className="annotation-selection-button"
          data-testid="create-annotation"
          style={{ left: Math.max(12, Math.min(window.innerWidth - 146, selectionDraft.rect.left + selectionDraft.rect.width / 2 - 67)), top: Math.max(12, selectionDraft.rect.top - 45) }}
          onPointerDown={(event) => event.preventDefault()}
          onClick={() => createAnnotation()}
        ><MessageSquarePlus size={15} />{t("添加批注")}</button>, document.body,
      )}
      {annotationChoice && choices.length > 1 && createPortal(
        <div
          ref={chooserRef}
          className="annotation-choice-popup"
          role="dialog"
          aria-label={t("选择批注")}
          data-testid="annotation-chooser"
          style={{ ...popupPosition(annotationChoice.rect, Math.min(360, choices.length * 58 + 50), 310), maxHeight: Math.min(360, window.innerHeight - 32) }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setAnnotationChoice(null); }
          }}
        >
          <div className="annotation-choice-header"><strong>{t("这里有")}{choices.length}{t("条批注")}</strong><button type="button" className="annotation-icon-button" aria-label={t("关闭批注选择")} onClick={() => setAnnotationChoice(null)}><X size={15} /></button></div>
          <div className="annotation-choice-list">
            {choices.map((annotation) => {
              const ordinal = visibleAnnotations.findIndex((entry) => entry.id === annotation.id) + 1;
              const label = (annotation.mode === 'note' ? annotation.note?.trim() : annotation.question.trim()) || annotation.quote;
              return <button
                type="button"
                key={annotation.id}
                className="annotation-choice-button"
                aria-label={t("打开批注 {0}：{1}", [ordinal, label])}
                title={label}
                onClick={() => { setAnnotationChoice(null); onOpen(annotation.id); }}
              ><span className="annotation-color-dot" style={{ background: annotation.color }} /><span className="annotation-choice-copy"><span className="annotation-choice-ordinal">{t("批注")}{ordinal}{annotation.status === 'draft' ? t(" · 草稿") : ''}</span><span className="annotation-choice-preview">{label}</span></span></button>;
            })}
          </div>
        </div>, document.body,
      )}
      {answerMenu && createPortal(
        <div
          ref={menuRef}
          className="annotation-context-menu"
          role="menu"
          aria-label={t("回答与批注操作")}
          data-testid="annotation-context-menu"
          style={menuStyle}
          onKeyDown={handleMenuKeyDown}
          onContextMenu={(event) => event.preventDefault()}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
        >
          {answerMenu.selection && <>
            <button type="button" role="menuitem" onClick={() => void copyText(answerMenu.selection!.selector.quote)}><Copy size={15} /><span>{t("复制选中文字")}</span></button>
            <button type="button" role="menuitem" onClick={() => createAnnotation(answerMenu.selection)}><MessageSquarePlus size={15} /><span>{t("为选中文字添加批注")}</span></button>
            {menuAnnotations.length > 0 && <div role="separator" className="annotation-menu-separator" />}
          </>}
          {menuAnnotations.length > 1 && !menuAnnotation ? <>
            <div className="annotation-menu-heading">{t("此处有")}{menuAnnotations.length}{t("条批注，请选择")}</div>
            {menuAnnotations.map((annotation) => {
              const ordinal = visibleAnnotations.findIndex((entry) => entry.id === annotation.id) + 1;
              const label = (annotation.mode === 'note' ? annotation.note?.trim() : annotation.question.trim()) || annotation.quote;
              return <button key={annotation.id} type="button" role="menuitem" data-annotation-id={annotation.id} aria-label={t("选择批注 {0}：{1}", [ordinal, label])} title={label} onClick={() => setAnswerMenu({ ...answerMenu, targetId: annotation.id })}><span className="annotation-color-dot" style={{ background: annotation.color }} /><span className="annotation-menu-note-label"><small>{t("批注")}{ordinal}</small><span>{label}</span></span><span className="annotation-menu-chevron">›</span></button>;
            })}
          </> : menuAnnotation ? <>
            {menuAnnotations.length > 1 && <button type="button" role="menuitem" className="annotation-menu-back" onClick={() => setAnswerMenu({ ...answerMenu, targetId: null })}><ArrowLeft size={14} /><span>{t("选择其他批注")}</span></button>}
            <div className="annotation-menu-heading annotation-menu-current" title={menuAnnotation.quote}><span className="annotation-color-dot" style={{ background: menuAnnotation.color }} /><span>{t("批注")}{visibleAnnotations.findIndex((entry) => entry.id === menuAnnotation.id) + 1} · {menuAnnotation.quote}</span></div>
            <button type="button" role="menuitem" onClick={() => { closeMenu(); onOpen(menuAnnotation.id); }}><MessageSquare size={15} /><span>{t("打开批注")}</span></button>
            <button type="button" role="menuitem" onClick={() => void copyText(menuAnnotation.quote)}><Copy size={15} /><span>{t("复制原文")}</span></button>
            <button type="button" role="menuitem" disabled={menuAnnotation.mode === 'note' ? !menuAnnotation.note : !menuAnnotation.question && !menuAnnotation.answer} onClick={() => void copyText(menuAnnotation.mode === 'note' ? menuAnnotation.note || '' : t("问题：{0}\n\n回答：{1}", [menuAnnotation.question, menuAnnotation.answer]))}><Clipboard size={15} /><span>{menuAnnotation.mode === 'note' ? t("复制批注") : t("复制批注问答")}</span></button>
            <div role="separator" className="annotation-menu-separator" />
            <button type="button" role="menuitem" className="annotation-menu-danger" disabled={menuAnnotation.status === 'generating'} title={menuAnnotation.status === 'generating' ? t("请等回答完成后再删除") : t("删除这条批注及其高亮，可撤销")} onClick={() => { closeMenu(); onDelete(menuAnnotation.id); }}><Trash2 size={15} /><span>{t("删除批注与高亮")}</span></button>
          </> : menuAnnotations.length === 0 && !answerMenu.selection ? <button type="button" role="menuitem" onClick={() => void copyText(proseRef.current?.innerText || version.content)}><Copy size={15} /><span>{t("复制回答")}</span></button> : null}
          <div className="annotation-menu-footnote">{t("粘贴请在输入框内右键操作")}</div>
        </div>, document.body,
      )}
      {manualCopy !== null && createPortal(
        <div className="annotation-copy-backdrop" onClick={(event) => { if (event.target === event.currentTarget) setManualCopy(null); }}>
          <section className="annotation-copy-dialog" role="dialog" aria-modal="true" aria-label={t("手动复制")} onKeyDown={(event) => {
            if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setManualCopy(null); }
            if (event.key === 'Tab') {
              const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('textarea, button'));
              const first = items[0]; const last = items[items.length - 1];
              if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
              else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
            }
          }}>
            <header><strong>{t("手动复制")}</strong><button type="button" className="annotation-icon-button" aria-label={t("关闭手动复制")} onClick={() => setManualCopy(null)}><X size={17} /></button></header>
            <p>{t("浏览器未允许自动复制。内容已选中，请按 Ctrl + C（Mac 按 ⌘ + C）。")}</p>
            <textarea aria-label={t("待复制内容")} readOnly value={manualCopy} ref={(element) => { if (element) { element.focus({ preventScroll: true }); element.select(); } }} />
          </section>
        </div>, document.body,
      )}
      {openAnnotation && createPortal(
        <MovableAnnotationPopup key={openAnnotation.id} popupRef={popupRef} style={popupStyle}>
          <AnnotationCard key={openAnnotation.id} annotation={openAnnotation} onClose={() => onOpen(null)} onUpdate={(patch) => onUpdate(openAnnotation.id, patch)} onAsk={() => onAsk(openAnnotation.id)} onStop={() => onStop(openAnnotation.id)} onReask={action => onReask(openAnnotation.id, action)} onDelete={() => onDelete(openAnnotation.id)} disabled={disabled} />
        </MovableAnnotationPopup>, document.body,
      )}
    </>
  );
}
