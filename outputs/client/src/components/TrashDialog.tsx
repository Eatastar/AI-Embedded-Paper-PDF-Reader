import { useEffect, useRef, useState } from 'react';
import { RotateCcw, Trash2, X } from 'lucide-react';
import type { Workspace } from '../domain/types';
import type { TrashTarget } from '../domain/trash';

export function TrashDialog({ workspace, busy, onClose, onRestore, onPurge }: {
  workspace: Workspace; busy: boolean; onClose: () => void;
  onRestore: (target: Exclude<TrashTarget, { kind: 'all' }>) => Promise<void>;
  onPurge: (target: TrashTarget) => Promise<void>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [pending, setPending] = useState<{ target: TrashTarget; label: string }>();
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const disabled = busy || working;
  const conversations = workspace.conversations.filter(c => c.deletedAt !== undefined).sort((a, b) => b.deletedAt! - a.deletedAt!);
  const annotations = workspace.conversations.filter(c => c.deletedAt === undefined).flatMap(c => c.annotations.filter(a => a.deletedAt !== undefined).map(a => ({ conversation: c, annotation: a }))).sort((a, b) => b.annotation.deletedAt! - a.annotation.deletedAt!);
  const count = conversations.length + annotations.length;
  useEffect(() => { dialog.current?.showModal(); }, []);
  const run = async (action: () => Promise<void>) => {
    setWorking(true); setError('');
    try { await action(); setPending(undefined); }
    catch (e) { setError(e instanceof Error ? e.message : '操作未完成，请重试。'); }
    finally { setWorking(false); }
  };
  return <dialog ref={dialog} className="settings-dialog trash-dialog" aria-labelledby="trash-title" onCancel={event => { event.preventDefault(); if (disabled) return; if (pending) setPending(undefined); else onClose(); }}>
    <header className="dialog-header"><div><span className="eyebrow">RECYCLE BIN</span><h2 id="trash-title">回收站</h2></div><button className="icon-button" aria-label="关闭回收站" disabled={disabled} onClick={onClose}><X size={19} /></button></header>
    {pending ? <div className="trash-confirmation">
      <h3>{pending.target.kind === 'all' ? '清空回收站？' : '永久删除这条记录？'}</h3><p className="trash-confirm-label">{pending.label}</p>
      <p>将从当前记录中移除，无法从回收站恢复。删除对话时，也会移除其全部批注和附件原文件。</p>
      <p className="trash-backup-note">以前的自动备份和导出备份仍可能保留这些内容。</p>
      <div className="trash-confirm-actions"><button className="secondary-button" disabled={disabled} onClick={() => { setPending(undefined); setError(''); }}>取消</button><button className="danger-button" disabled={disabled} onClick={() => void run(() => onPurge(pending.target))}><Trash2 size={14} />{working ? '正在删除…' : pending.target.kind === 'all' ? '确认清空' : '确认永久删除'}</button></div>
    </div> : <>
      <div className="trash-toolbar"><p>{count ? `${count} 条已删除记录，可恢复或永久删除。` : '回收站是空的。'}</p><button className="trash-delete-button" disabled={disabled || !count} onClick={() => setPending({ target: { kind: 'all' }, label: `共 ${count} 条记录` })}><Trash2 size={14} />清空回收站</button></div>
      <div className="trash-list">
        {conversations.length > 0 && <h3>对话</h3>}
        {conversations.map(c => <article className="trash-entry" key={c.id}><div className="trash-entry-text"><strong title={c.title}>{c.title}</strong><span>{c.messages.length} 条消息 · {c.annotations.length} 条批注 · {c.documents?.length || 0} 份附件</span></div><div className="trash-entry-actions"><button className="secondary-button" disabled={disabled} aria-label={`恢复对话：${c.title}`} onClick={() => void run(() => onRestore({ kind: 'conversation', id: c.id }))}><RotateCcw size={13} />恢复</button><button className="trash-delete-button" disabled={disabled} aria-label={`永久删除对话：${c.title}`} onClick={() => setPending({ target: { kind: 'conversation', id: c.id }, label: c.title })}><Trash2 size={13} />永久删除</button></div></article>)}
        {annotations.length > 0 && <h3>批注</h3>}
        {annotations.map(({ conversation: c, annotation: a }) => <article className="trash-entry" key={a.id}><div className="trash-entry-text"><strong title={a.quote}>{a.mode === 'note' ? a.note || a.quote : a.question || a.quote}</strong><span>{c.title} · {a.quote.slice(0, 50)}</span></div><div className="trash-entry-actions"><button className="secondary-button" disabled={disabled} aria-label={`恢复批注：${a.quote}`} onClick={() => void run(() => onRestore({ kind: 'annotation', conversationId: c.id, id: a.id }))}><RotateCcw size={13} />恢复</button><button className="trash-delete-button" disabled={disabled} aria-label={`永久删除批注：${a.quote}`} onClick={() => setPending({ target: { kind: 'annotation', conversationId: c.id, id: a.id }, label: a.quote })}><Trash2 size={13} />永久删除</button></div></article>)}
      </div>
    </>}
    {error && <p className="recovery-message" role="alert">{error}</p>}
  </dialog>;
}
