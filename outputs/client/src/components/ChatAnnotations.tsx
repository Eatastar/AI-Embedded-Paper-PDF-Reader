import { useEffect, useMemo, useRef, useState } from 'react';
import { MessageSquareQuote, Trash2, X } from 'lucide-react';
import type { AnnotationReference, Conversation } from '../domain/types';
import { annotationSourceLabel, canReferenceAnnotation, MAX_CHAT_REFERENCES } from '../domain/chat-references';
import { t } from '../i18n/locale';
import { useLocale } from '../i18n/react';
import './chat-annotations.css';

export function ChatAnnotationPicker({ conversation, selected, onApply, onClose }: { conversation: Conversation; selected: string[]; onApply: (ids: string[]) => void; onClose: () => void }) {
  useLocale();
  const dialog = useRef<HTMLDialogElement>(null);
  const [ids, setIds] = useState(() => new Set(selected)), [query, setQuery] = useState(''), [page, setPage] = useState(0), [error, setError] = useState('');
  useEffect(() => { dialog.current?.showModal(); }, []);
  const available = useMemo(() => conversation.annotations.filter(canReferenceAnnotation).sort((a, b) => b.updatedAt - a.updatedAt), [conversation.annotations]);
  const filtered = useMemo(() => { const needle = query.trim().toLowerCase(); return needle ? available.filter(annotation => `${annotation.quote}\n${annotation.question}\n${annotation.note || ''}`.toLowerCase().includes(needle)) : available; }, [available, query]);
  const pages = Math.max(1, Math.ceil(filtered.length / 40)), currentPage = Math.min(page, pages - 1);
  const toggle = (id: string) => {
    const next = new Set(ids); if (next.has(id)) next.delete(id); else if (next.size < MAX_CHAT_REFERENCES) next.add(id); else { setError('每次最多引用 10 条批注。'); return; }
    setIds(next); setError('');
  };
  return <dialog ref={dialog} className="settings-dialog chat-annotation-picker" aria-labelledby="chat-annotation-title" onCancel={event => { event.preventDefault(); onClose(); }}>
    <header className="dialog-header"><div><h2 id="chat-annotation-title">{t('引用批注到聊天')}</h2><p>{t('只带入你选择的批注。发送后保留当时的内容，可继续展开讨论。')}</p></div><button type="button" className="icon-button" aria-label={t('关闭批注选择')} onClick={onClose}><X size={19} /></button></header>
    <input className="chat-annotation-search" aria-label={t('搜索原文、问题或笔记')} placeholder={t('搜索原文、问题或笔记')} value={query} onChange={event => { setQuery(event.target.value); setPage(0); }} />
    <div className="chat-annotation-list">
      {!filtered.length && <p className="chat-annotation-empty">{t(available.length ? '没有匹配的批注。' : '还没有已保存的批注，可先在原文中提问或写笔记。')}</p>}
      {filtered.slice(currentPage * 40, (currentPage + 1) * 40).map(annotation => <label className="chat-annotation-choice" key={annotation.id}>
        <input type="checkbox" checked={ids.has(annotation.id)} onChange={() => toggle(annotation.id)} aria-label={t('选择批注：{0}', [annotation.quote.slice(0, 80)])} />
        <span><small>{annotationSourceLabel(conversation, annotation) === 'AI 回答' ? t('AI 回答') : annotationSourceLabel(conversation, annotation)} · {t(annotation.mode === 'note' ? '笔记' : 'AI 问答')}</small><strong>{annotation.quote.slice(0, 240)}</strong><span>{(annotation.mode === 'note' ? annotation.note : annotation.question)?.slice(0, 240)}</span></span>
      </label>)}
    </div>
    {pages > 1 && <nav className="chat-annotation-pagination" aria-label={t('批注列表翻页')}><button type="button" className="secondary-button" disabled={!currentPage} onClick={() => setPage(currentPage - 1)}>{t('上一页')}</button><span>{currentPage + 1} / {pages}</span><button type="button" className="secondary-button" disabled={currentPage >= pages - 1} onClick={() => setPage(currentPage + 1)}>{t('下一页')}</button></nav>}
    {error && <p role="alert" className="recovery-message">{t(error)}</p>}
    <footer className="chat-annotation-picker-actions"><span>{t('已选 {0} 条批注', [ids.size])}</span><button type="button" className="secondary-button" onClick={onClose}>{t('取消')}</button><button type="button" className="primary-button" onClick={() => onApply([...ids].filter(id => available.some(annotation => annotation.id === id)))}>{t('引用所选批注')}</button></footer>
  </dialog>;
}

export function ChatAnnotationReferences({ references }: { references: AnnotationReference[] }) {
  useLocale(); const [open, setOpen] = useState(false);
  return <details className="chat-annotation-references" onToggle={event => setOpen(event.currentTarget.open)}><summary><MessageSquareQuote size={13} />{t('主动引用 {0} 条批注', [references.length])}</summary>{open && <div>{references.map(reference => <article key={reference.annotationId}><small>{reference.label === 'AI 回答' ? t('AI 回答') : reference.label}</small><blockquote>{reference.quote}</blockquote>{reference.mode === 'note' ? <p>{reference.note}</p> : <><strong>{reference.question}</strong><p>{reference.answer}</p></>}</article>)}</div>}</details>;
}

export function DeleteChatTurnDialog({ question, annotationCount, referenceCount, disabled, onClose, onDelete }: { question: string; annotationCount: number; referenceCount: number; disabled: boolean; onClose: () => void; onDelete: () => Promise<void> }) {
  useLocale(); const dialog = useRef<HTMLDialogElement>(null), [working, setWorking] = useState(false), [error, setError] = useState('');
  useEffect(() => { dialog.current?.showModal(); }, []);
  const busy = disabled || working;
  return <dialog ref={dialog} className="settings-dialog chat-turn-delete-dialog" aria-labelledby="chat-turn-delete-title" onCancel={event => { event.preventDefault(); if (!working) onClose(); }}>
    <header className="dialog-header"><h2 id="chat-turn-delete-title">{t('删除本轮对话？')}</h2><button type="button" className="icon-button" aria-label={t('关闭删除确认')} disabled={working} onClick={onClose}><X size={19} /></button></header>
    <blockquote>{question.slice(0, 500)}</blockquote><p>{t('将删除本轮问题、回答及所有回答版本，之后的提问不再引用这一轮。此操作不进入回收站。')}</p>
    {annotationCount > 0 && <p>{t('这轮回答上的 {0} 条批注也会删除，PDF 原文上的批注保留。', [annotationCount])}</p>}
    {referenceCount > 0 && <p>{t('后续聊天中对这些批注的手动引用也会移除。')}</p>}
    <p className="trash-backup-note">{t('以前的自动备份和导出备份仍可能保留这些内容。')}</p>
    {error && <p role="alert" className="recovery-message">{t(error)}</p>}
    <footer className="chat-annotation-picker-actions"><button type="button" className="secondary-button" disabled={working} onClick={onClose}>{t('取消')}</button><button type="button" className="danger-button" disabled={busy} onClick={() => { setWorking(true); setError(''); void onDelete().catch(failure => { setError(failure instanceof Error ? failure.message : '操作未完成，请重试。'); setWorking(false); }); }}><Trash2 size={14} />{t(working ? '正在删除…' : '确认删除本轮')}</button></footer>
  </dialog>;
}
