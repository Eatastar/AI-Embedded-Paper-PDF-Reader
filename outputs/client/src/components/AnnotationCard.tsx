import { useEffect, useRef, useState } from 'react';
import { Check, CornerDownLeft, GripHorizontal, LoaderCircle, Pencil, RotateCcw, Send, Trash2, X } from 'lucide-react';
import { MathMarkdown } from './MathMarkdown';
import type { Annotation } from '../domain/types';

interface AnnotationCardProps {
  annotation: Annotation;
  onClose: () => void;
  onUpdate: (patch: Partial<Annotation>) => void;
  onAsk: () => void;
  onDelete: () => void;
  disabled?: boolean;
}

/** An anchored personal note or single-turn AI exchange, without nested annotation. */
export function AnnotationCard({ annotation, onClose, onUpdate, onAsk, onDelete, disabled }: AnnotationCardProps) {
  const [editing, setEditing] = useState(false);
  const [question, setQuestion] = useState(annotation.question);
  const [answer, setAnswer] = useState(annotation.answer);
  const [note, setNote] = useState(annotation.note || '');
  const cardRef = useRef<HTMLElement>(null);
  const questionRef = useRef<HTMLTextAreaElement>(null);
  const isDraft = annotation.status === 'draft';
  const isGenerating = annotation.status === 'generating';
  const canRetry = annotation.status === 'error' || annotation.status === 'interrupted';
  const isNote = annotation.mode === 'note';
  const canChooseMode = isDraft && !annotation.context && !annotation.originalQuestion;

  useEffect(() => {
    setEditing(false);
    setQuestion(annotation.question);
    setAnswer(annotation.answer);
    setNote(annotation.note || '');
  }, [annotation.id]);

  useEffect(() => {
    if (isDraft) questionRef.current?.focus({ preventScroll: true });
  }, [annotation.id, isNote, isDraft]);

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
    onUpdate(isNote
      ? { note, edited: true, updatedAt: Date.now() }
      : { question, answer, edited: true, updatedAt: Date.now() });
    setEditing(false);
  };

  const closeCard = () => {
    if (editing && (isNote ? Boolean(note.trim()) && note !== (annotation.note || '') : question !== annotation.question || answer !== annotation.answer)) {
      onUpdate(isNote ? { note } : { question, answer });
    }
    onClose();
  };
  const saveNote = () => {
    if (annotation.note?.trim()) onUpdate({ note: annotation.note, status: 'noted' });
  };
  const closeRef = useRef(closeCard);
  closeRef.current = closeCard;
  useEffect(() => {
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && !cardRef.current?.contains(event.target)) closeRef.current();
    };
    // Capture runs before menus/other controls stop propagation, without consuming
    // the click: another highlight or the main input still receives its action.
    document.addEventListener('pointerdown', dismiss, true);
    return () => document.removeEventListener('pointerdown', dismiss, true);
  }, []);

  return (
    <section
      ref={cardRef}
      className="annotation-card"
      role="dialog"
      aria-modal="false"
      aria-label={isNote ? '普通批注' : '批注问答'}
      data-testid="annotation-card"
      data-annotation-id={annotation.id}
      onKeyDown={(event) => {
        if (event.key === 'Escape') { event.stopPropagation(); closeCard(); }
      }}
    >
      <header className="annotation-card-header" tabIndex={0} title="按住标题栏拖动；聚焦后也可用方向键移动" aria-label="批注标题栏，可拖动或使用方向键移动">
        <div className="annotation-card-heading"><GripHorizontal size={14} className="annotation-drag-icon" /><span className="annotation-color-dot" style={{ background: annotation.color }} /><strong>{isDraft ? '添加批注' : isNote ? '批注' : '批注问答'}</strong><span className="annotation-card-badge">{isNote ? '个人笔记' : '单次提问'}</span></div>
        <div className="annotation-card-header-actions"><button type="button" className="annotation-icon-button annotation-delete-button" aria-label="删除批注与高亮" title={isGenerating ? '请等回答完成后再删除' : '删除这条批注及其高亮，可撤销'} disabled={isGenerating} onClick={(event) => { event.stopPropagation(); onDelete(); }}><Trash2 size={15} /></button><button type="button" className="annotation-icon-button" aria-label="关闭批注" title="关闭，批注会保留" onClick={closeCard}><X size={17} /></button></div>
      </header>

      <div className="annotation-card-scroll">
        <blockquote className="annotation-quote" style={{ borderColor: annotation.color }} title={annotation.quote}>{annotation.quote}</blockquote>

        {canChooseMode && <div className="annotation-mode-switch" role="group" aria-label="批注类型">
          <button type="button" aria-pressed={!isNote} onClick={() => changeMode('ask')}>询问 AI</button>
          <button type="button" aria-pressed={isNote} onClick={() => changeMode('note')}>只写批注</button>
        </div>}

        {isDraft && isNote ? (
          <div className="annotation-draft">
            <label htmlFor={`annotation-note-${annotation.id}`}>记录你对这段内容的想法</label>
            <textarea
              ref={questionRef}
              id={`annotation-note-${annotation.id}`}
              className="annotation-textarea annotation-note-editor"
              placeholder="写下你的批注…"
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
              <span>保存在本地，不会请求 AI</span>
              <button type="button" className="annotation-primary-button" disabled={!annotation.note?.trim()} onClick={saveNote}><Check size={14} />保存批注</button>
            </div>
            <p className="annotation-shortcut"><CornerDownLeft size={11} /> Ctrl / ⌘ + Enter 保存 · 草稿自动保存</p>
          </div>
        ) : isDraft ? (
          <div className="annotation-draft">
            <label htmlFor={`annotation-question-${annotation.id}`}>关于这段话，你想了解什么？</label>
            <textarea
              ref={questionRef}
              id={`annotation-question-${annotation.id}`}
              className="annotation-textarea"
              placeholder="写下你的问题…"
              rows={3}
              value={annotation.question}
              disabled={disabled}
              onChange={(event) => onUpdate({ question: event.target.value })}
              onKeyDown={(event) => {
                if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && annotation.question.trim() && !disabled) {
                  event.preventDefault(); onAsk();
                }
              }}
            />
            <div className="annotation-draft-footer">
              <span>包含完整主对话上下文</span>
              <button type="button" className="annotation-primary-button" disabled={!annotation.question.trim() || disabled} onClick={onAsk}><Send size={14} />提问</button>
            </div>
            <p className="annotation-shortcut"><CornerDownLeft size={11} /> Ctrl / ⌘ + Enter 发送 · 草稿自动保存</p>
          </div>
        ) : editing ? (
          <div className="annotation-edit-fields">
            {isNote ? <>
              <label htmlFor={`annotation-edit-note-${annotation.id}`}>批注内容</label>
              <textarea id={`annotation-edit-note-${annotation.id}`} className="annotation-textarea annotation-note-editor" rows={7} value={note} onChange={(event) => setNote(event.target.value)} />
            </> : <>
              <label htmlFor={`annotation-edit-question-${annotation.id}`}>问题</label>
              <textarea id={`annotation-edit-question-${annotation.id}`} className="annotation-textarea" rows={2} value={question} onChange={(event) => setQuestion(event.target.value)} />
              <label htmlFor={`annotation-edit-answer-${annotation.id}`}>回答</label>
              <textarea id={`annotation-edit-answer-${annotation.id}`} className="annotation-textarea annotation-answer-editor" rows={7} value={answer} onChange={(event) => setAnswer(event.target.value)} />
            </>}
            {isNote && !note.trim() && <p className="annotation-footnote" role="status">批注内容不能为空。直接关闭会保留上次内容；要移除这条批注，请点击右上角删除。</p>}
            <div className="annotation-edit-actions"><button type="button" className="annotation-text-button" onClick={() => setEditing(false)}>取消</button><button type="button" className="annotation-primary-button" disabled={isNote && !note.trim()} onClick={saveEdit}><Check size={14} />保存修改</button></div>
            <p className="annotation-footnote">修改只更新这条批注，不会重新请求 AI。</p>
          </div>
        ) : isNote ? (
          <div className="annotation-response annotation-note-response">
            <div className="annotation-section-label">我的批注 {annotation.edited && <span className="annotation-edited-label">已编辑</span>}</div>
            {annotation.note ? <MathMarkdown>{annotation.note}</MathMarkdown> : <p className="annotation-waiting">还没有批注内容。</p>}
            <div className="annotation-response-actions"><span>已保存在本地</span><button type="button" className="annotation-text-button" onClick={startEditing}><Pencil size={13} />编辑</button></div>
          </div>
        ) : (
          <div className="annotation-response">
            <div className="annotation-section-label">你的问题</div>
            <p className="annotation-question-text">{annotation.originalQuestion && canRetry ? annotation.originalQuestion : annotation.question}</p>
            <div className="annotation-section-label annotation-answer-label">{isGenerating ? <><LoaderCircle size={13} className="annotation-spin" />正在回答</> : <>AI 回答 {annotation.edited && <span className="annotation-edited-label">已编辑</span>}</>}</div>
            {annotation.answer ? <MathMarkdown streaming={isGenerating}>{annotation.answer}</MathMarkdown> : isGenerating ? <p className="annotation-waiting">正在结合主对话思考…</p> : null}
            {canRetry && <div className="annotation-error" role="status"><p>{annotation.error || '上次回答未完成，可以重试原问题。'}</p><button type="button" className="annotation-text-button" disabled={disabled} onClick={onAsk}><RotateCcw size={13} />重试原问题</button></div>}
            {!isGenerating && !canRetry && <div className="annotation-response-actions"><span>内容已自动保存</span><button type="button" className="annotation-text-button" onClick={startEditing}><Pencil size={13} />编辑</button></div>}
            {isGenerating && <p className="annotation-footnote">可以关闭窗口，回答会继续并自动保存。</p>}
          </div>
        )}
      </div>
    </section>
  );
}
