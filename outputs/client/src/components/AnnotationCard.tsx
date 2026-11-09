import { t } from '../i18n/locale';
import { useLocale } from '../i18n/react';
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Check, CornerDownLeft, GripHorizontal, LoaderCircle, MessageSquareQuote, Pencil, RotateCcw, Send, Square, Trash2, X } from 'lucide-react';
import { MathMarkdown } from './MathMarkdown';
import { HighlightColorPicker } from './HighlightColorPicker';
import type { Annotation } from '../domain/types';
import { canReferenceAnnotation } from '../domain/chat-references';

interface AnnotationCardProps {
  annotation: Annotation;
  onClose: () => void;
  onUpdate: (patch: Partial<Annotation>) => void;
  onAsk: () => void;
  onStop: () => void;
  onReask: (action: 'start' | 'cancel' | 'edit') => void;
  onDelete: () => void;
  onReferenceToChat?: () => void;
  disabled?: boolean;
  sourceContent?: ReactNode;
  requestControls?: ReactNode;
  requestDisabled?: boolean;
  headerActions?: ReactNode;
}

/** An anchored note or replaceable exchange, without nested annotation or chat history. */
export function AnnotationCard({ annotation, onClose, onUpdate, onAsk, onStop, onReask, onDelete, onReferenceToChat, disabled, sourceContent, requestControls, requestDisabled, headerActions }: AnnotationCardProps) {
  useLocale();
  const [editing, setEditing] = useState(false);
  const [question, setQuestion] = useState(annotation.question);
  const [answer, setAnswer] = useState(annotation.answer);
  const [note, setNote] = useState(annotation.note || '');
  const cardRef = useRef<HTMLElement>(null);
  const questionRef = useRef<HTMLTextAreaElement>(null);
  const isDraft = annotation.status === 'draft';
  const reask = annotation.reask;
  const isGenerating = annotation.status === 'generating' || reask?.status === 'generating';
  const canRetry = annotation.status === 'error' || annotation.status === 'interrupted';
  const isNote = annotation.mode === 'note';
  const canChooseMode = isDraft && !annotation.context && !annotation.originalQuestion && !annotation.figure;
  const sendDisabled = disabled || requestDisabled;
  const pendingEdit = useRef<Partial<Annotation> | null>(null);
  pendingEdit.current = editing && (isNote ? Boolean(note.trim()) && note !== (annotation.note || '') : question !== annotation.question || answer !== annotation.answer)
    ? isNote ? { note } : { question, answer } : null;
  const flushEdit = () => { const patch = pendingEdit.current; pendingEdit.current = null; if (patch) onUpdate(patch); };
  const flushRef = useRef(flushEdit); flushRef.current = flushEdit;

  useEffect(() => {
    setEditing(false);
    setQuestion(annotation.question);
    setAnswer(annotation.answer);
    setNote(annotation.note || '');
  }, [annotation.id]);

  useEffect(() => {
    if (isDraft || reask?.status === 'draft') questionRef.current?.focus({ preventScroll: true });
  }, [annotation.id, isNote, isDraft, reask?.status]);

  const startEditing = () => {
    setQuestion(annotation.question);
    setAnswer(annotation.answer);
    setNote(annotation.note || '');
    setEditing(true);
  };

  const changeMode = (mode: 'ask' | 'note') => {
    if (!canChooseMode || mode === (annotation.mode || 'ask')) return;
    // Keep the draft's text when the user changes its purpose.
    onUpdate(mode === 'note'
      ? { mode, note: annotation.question }
      : { mode, question: annotation.note || '' });
  };

  const saveEdit = () => {
    if (isNote && !note.trim()) return;
    pendingEdit.current = null;
    onUpdate(isNote
      ? { note, edited: true, updatedAt: Date.now() }
      : { question, answer, edited: true, updatedAt: Date.now() });
    setEditing(false);
  };

  const closeCard = () => {
    flushRef.current();
    onClose();
  };
  const saveNote = () => {
    if (annotation.note?.trim()) onUpdate({ note: annotation.note, status: 'noted' });
  };
  const closeRef = useRef(closeCard);
  closeRef.current = closeCard;
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || document.querySelector('dialog[open], .translation-result, .reader-settings, .annotation-context-menu, .annotation-choice-popup, .chat-text-selection')) return;
      event.preventDefault(); closeRef.current();
    };
    // The note stays open while the reader interacts with chat or source text.
    // Save pending edits on explicit close, a save barrier or source unmount.
    document.addEventListener('keydown', key);
    const saveBeforeExit = () => flushRef.current();
    document.addEventListener('learn:save-edits', saveBeforeExit);
    return () => { document.removeEventListener('keydown', key); document.removeEventListener('learn:save-edits', saveBeforeExit); flushRef.current(); };
  }, []);

  return (
    <section
      ref={cardRef}
      className={`annotation-card${annotation.figure ? ' figure-annotation-card' : ''}`}
      role="dialog"
      aria-modal="false"
      aria-label={annotation.figure ? t('图片问答') : isNote ? t("普通批注") : t("批注问答")}
      data-testid="annotation-card"
      data-annotation-id={annotation.id}
      onKeyDown={(event) => {
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeCard(); }
      }}
    >
      <header className="annotation-card-header" tabIndex={0} title={t("按住标题栏拖动；聚焦后也可用方向键移动")} aria-label={t("批注标题栏，可拖动或使用方向键移动")}>
        <div className="annotation-card-heading"><GripHorizontal size={14} className="annotation-drag-icon" /><span className="annotation-color-dot" style={{ background: annotation.color }} /><strong>{annotation.figure ? t("图片问答") : isDraft ? t("添加批注") : isNote ? t("批注") : reask ? t("重新提问") : t("批注问答")}</strong><span className="annotation-card-badge">{isNote ? t("个人笔记") : reask ? t("替换问答") : t("原文问答")}</span></div>
        <div className="annotation-card-header-actions">{headerActions}<button type="button" className="annotation-icon-button annotation-delete-button" aria-label={t("删除批注与高亮")} title={isGenerating ? t("请等回答完成后再删除") : t("删除这条批注及其高亮，可撤销")} disabled={isGenerating} onClick={(event) => { event.stopPropagation(); pendingEdit.current = null; onDelete(); }}><Trash2 size={15} /></button><button type="button" className="annotation-icon-button" aria-label={t("关闭批注")} title={t("关闭，批注会保留")} onClick={closeCard}><X size={17} /></button></div>
      </header>

      <div className="annotation-card-scroll">
        {sourceContent || <><blockquote className="annotation-quote" style={{ borderColor: annotation.color }} title={annotation.quote}>{annotation.quote}</blockquote><HighlightColorPicker color={annotation.color} onChange={color => onUpdate({ color })} /></>}
        {requestControls}
        {annotation.figure && annotation.modelLabel && <p className="figure-answer-model">{t('上次回答模型：{0}', [annotation.modelLabel])}</p>}

        {canChooseMode && <div className="annotation-mode-switch" role="group" aria-label={t("批注类型")}>
          <button type="button" aria-pressed={!isNote} onClick={() => changeMode('ask')}>{t("询问 AI")}</button>
          <button type="button" aria-pressed={isNote} onClick={() => changeMode('note')}>{t("只写批注")}</button>
        </div>}

        {isDraft && isNote ? (
          <div className="annotation-draft">
            <label htmlFor={`annotation-note-${annotation.id}`}>{t("记录你对这段内容的想法")}</label>
            <textarea
              ref={questionRef}
              id={`annotation-note-${annotation.id}`}
              className="annotation-textarea annotation-note-editor"
              placeholder={t("写下你的批注…")}
              rows={5}
              value={annotation.note || ''}
              onChange={(event) => onUpdate({ note: event.target.value })}
              onKeyDown={(event) => {
                if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && annotation.note?.trim()) {
                  event.preventDefault(); saveNote();
                }
              }}
            />
            <div className="annotation-draft-footer">
              <span>{t("保存在本地，不会请求 AI")}</span>
              <button type="button" className="annotation-primary-button" disabled={!annotation.note?.trim()} onClick={saveNote}><Check size={14} />{t("保存批注")}</button>
            </div>
            <p className="annotation-shortcut"><CornerDownLeft size={11} />{t("Ctrl / ⌘ + Enter 保存 · 草稿自动保存")}</p>
          </div>
        ) : isDraft ? (
          <div className="annotation-draft">
            <label htmlFor={`annotation-question-${annotation.id}`}>{t(annotation.figure ? '关于这张图，你想了解什么？' : "关于这段话，你想了解什么？")}</label>
            <textarea
              ref={questionRef}
              id={`annotation-question-${annotation.id}`}
              className="annotation-textarea"
              placeholder={t("写下你的问题…")}
              rows={3}
              value={annotation.question}
              disabled={disabled}
              onChange={(event) => onUpdate({ question: event.target.value })}
              onKeyDown={(event) => {
                if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && annotation.question.trim() && !sendDisabled) {
                  event.preventDefault(); onAsk();
                }
              }}
            />
            <div className="annotation-draft-footer">
              <span>{t('仅引用所属原文，资料按阅读设置引用')}</span>
              <button type="button" className="annotation-primary-button" disabled={!annotation.question.trim() || sendDisabled} onClick={onAsk}><Send size={14} />{t("提问")}</button>
            </div>
            <p className="annotation-shortcut"><CornerDownLeft size={11} />{t("Ctrl / ⌘ + Enter 发送 · 草稿自动保存")}</p>
          </div>
        ) : reask ? (
          <div className="annotation-reask">
            <p className="annotation-footnote">{t("新回答成功后替换当前问答，原高亮继续保留。")}</p>
            {reask.status === 'draft' ? <div className="annotation-draft">
              <label htmlFor={`annotation-reask-${annotation.id}`}>{t("关于这段原文，你想重新问什么？")}</label>
              <textarea ref={questionRef} id={`annotation-reask-${annotation.id}`} className="annotation-textarea" rows={4} value={reask.question} disabled={disabled} onChange={event => onUpdate({ reask: { ...reask, question: event.target.value } })} onKeyDown={event => { if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && reask.question.trim() && !sendDisabled) { event.preventDefault(); onAsk(); } }} />
              <div className="annotation-edit-actions"><button className="annotation-text-button" onClick={() => onReask('cancel')}>{t("取消重新提问")}</button><button className="annotation-primary-button" disabled={sendDisabled || !reask.question.trim()} onClick={onAsk}><Send size={14} />{t("发送并替换")}</button></div>
              <p className="annotation-footnote">{t('仅引用所属文档或原回答，不带聊天和其他批注。')}</p>
            </div> : <div className="annotation-response">
              <div className="annotation-section-label">{t("新的问题")}</div><p className="annotation-question-text">{reask.question}</p>
              <div className="annotation-section-label annotation-answer-label">{isGenerating ? <><LoaderCircle size={13} className="annotation-spin" />{t("正在重新回答")}</> : t("新的回答未完成")}</div>
              {reask.answer ? <MathMarkdown streaming={isGenerating}>{reask.answer}</MathMarkdown> : isGenerating ? <p className="annotation-waiting">{t("正在结合原文思考…")}</p> : null}
              {isGenerating ? <div className="annotation-response-actions"><span>{t("× 只收起，回答会继续")}</span><button className="annotation-text-button" onClick={onStop}><Square size={12} />{t("停止回答")}</button></div> : <div className="annotation-error" role="status"><p>{t(reask.error || "这次回答未完成。")}{t("旧问答仍保留。")}</p><div className="annotation-reask-actions"><button className="annotation-text-button" disabled={sendDisabled} onClick={onAsk}><RotateCcw size={13} />{t("重试原问题")}</button><button className="annotation-text-button" onClick={() => onReask('edit')}>{t("修改问题")}</button><button className="annotation-text-button" onClick={() => onReask('cancel')}>{t("返回原问答")}</button></div></div>}
            </div>}
            <details className="annotation-kept-answer"><summary>{t("查看当前保留的问答")}</summary><p className="annotation-question-text">{annotation.question}</p><MathMarkdown>{annotation.answer}</MathMarkdown></details>
          </div>
        ) : editing ? (
          <div className="annotation-edit-fields">
            {isNote ? <>
              <label htmlFor={`annotation-edit-note-${annotation.id}`}>{t("批注内容")}</label>
              <textarea id={`annotation-edit-note-${annotation.id}`} className="annotation-textarea annotation-note-editor" rows={7} value={note} onChange={(event) => setNote(event.target.value)} />
            </> : <>
              <label htmlFor={`annotation-edit-question-${annotation.id}`}>{t("问题")}</label>
              <textarea id={`annotation-edit-question-${annotation.id}`} className="annotation-textarea" rows={2} value={question} onChange={(event) => setQuestion(event.target.value)} />
              <label htmlFor={`annotation-edit-answer-${annotation.id}`}>{t("回答")}</label>
              <textarea id={`annotation-edit-answer-${annotation.id}`} className="annotation-textarea annotation-answer-editor" rows={7} value={answer} onChange={(event) => setAnswer(event.target.value)} />
            </>}
            {isNote && !note.trim() && <p className="annotation-footnote" role="status">{t("批注内容不能为空。直接关闭会保留上次内容；要移除这条批注，请点击右上角删除。")}</p>}
            <div className="annotation-edit-actions"><button type="button" className="annotation-text-button" onClick={() => { pendingEdit.current = null; setEditing(false); }}>{t("取消")}</button><button type="button" className="annotation-primary-button" disabled={isNote && !note.trim()} onClick={saveEdit}><Check size={14} />{t("保存修改")}</button></div>
            <p className="annotation-footnote">{t("修改只更新这条批注，不会重新请求 AI。")}</p>
          </div>
        ) : isNote ? (
          <div className="annotation-response annotation-note-response">
            <div className="annotation-section-label">{t("我的批注")}{annotation.edited && <span className="annotation-edited-label">{t("已编辑")}</span>}</div>
            {annotation.note ? <MathMarkdown>{annotation.note}</MathMarkdown> : <p className="annotation-waiting">{t("还没有批注内容。")}</p>}
            <div className="annotation-response-actions"><span>{t("已保存在本地")}</span><button type="button" className="annotation-text-button" onClick={startEditing}><Pencil size={13} />{t("编辑")}</button></div>
          </div>
        ) : (
          <div className="annotation-response">
            <div className="annotation-section-label">{t("你的问题")}</div>
            <p className="annotation-question-text">{annotation.originalQuestion && canRetry ? annotation.originalQuestion : annotation.question}</p>
            <div className="annotation-section-label annotation-answer-label">{isGenerating ? <><LoaderCircle size={13} className="annotation-spin" />{t("正在回答")}</> : <>{t("AI 回答")}{annotation.edited && <span className="annotation-edited-label">{t("已编辑")}</span>}</>}</div>
            {annotation.answer ? <MathMarkdown streaming={isGenerating}>{annotation.answer}</MathMarkdown> : isGenerating ? <p className="annotation-waiting">{t('正在结合原文思考…')}</p> : null}
            {canRetry && <div className="annotation-error" role="status"><p>{t(annotation.error || "上次回答未完成，可以重试原问题。")}</p><button type="button" className="annotation-text-button" disabled={sendDisabled} onClick={onAsk}><RotateCcw size={13} />{t("重试原问题")}</button></div>}
            {!isGenerating && !canRetry && <div className="annotation-response-actions"><span>{t("内容已自动保存")}</span><div className="annotation-reask-actions"><button type="button" className="annotation-text-button" onClick={startEditing}><Pencil size={13} />{t("编辑")}</button><button type="button" className="annotation-text-button" disabled={disabled} onClick={() => onReask('start')}><RotateCcw size={13} />{t("重新提问")}</button></div></div>}
            {isGenerating && <><div className="annotation-response-actions"><span>{t("关闭窗口后仍会继续回答")}</span><button type="button" className="annotation-text-button" onClick={onStop}><Square size={12} />{t("停止回答")}</button></div><p className="annotation-footnote">{t("停止后可以用原问题和首次上下文重试。")}</p></>}
          </div>
        )}
      </div>
      {onReferenceToChat && canReferenceAnnotation(annotation) && <footer className="annotation-chat-action"><button type="button" className="annotation-text-button" disabled={disabled || isGenerating} onClick={() => { flushRef.current(); onReferenceToChat(); }}><MessageSquareQuote size={14} />{t('引用到聊天继续追问')}</button></footer>}
    </section>
  );
}
