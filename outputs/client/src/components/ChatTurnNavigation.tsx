import { useEffect, useMemo, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { ArrowUpRight, ListTree, Trash2, X } from 'lucide-react';
import type { Conversation } from '../domain/types';
import { chatTurns, chatTurnSelection } from '../domain/chat-turns';
import { t } from '../i18n/locale';
import { useLocale } from '../i18n/react';
import './chat-turns.css';

export function ChatTurnNavigation({ conversation, viewport, visible, disabled, onJump, onDelete }: {
  conversation: Conversation; viewport: RefObject<HTMLDivElement | null>; visible: boolean; disabled: boolean;
  onJump: (id: string) => void; onDelete: (ids: string[]) => Promise<void>;
}) {
  useLocale();
  const turns = useMemo(() => chatTurns(conversation.messages), [conversation.messages]);
  const key = turns.flatMap(turn => turn.messageIds).join(':');
  const [active, setActive] = useState(''), [mode, setMode] = useState<'browse' | 'manage' | null>(null);
  const [selected, setSelected] = useState(new Set<string>()), [confirming, setConfirming] = useState(false);
  const [page, setPage] = useState(0), [working, setWorking] = useState(false), [error, setError] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { if (mode) dialog.current?.showModal(); }, [mode]);
  useEffect(() => {
    setSelected(previous => { const next = new Set([...previous].filter(id => turns.some(turn => turn.id === id))); return next.size === previous.size ? previous : next; });
  }, [key]);
  useEffect(() => {
    const root = viewport.current; if (!visible || !root || !turns.length) return;
    const index = new Map(turns.flatMap((turn, i) => turn.messageIds.map(id => [id, i] as const)));
    const seen = new Map<Element, number>();
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        const i = index.get((entry.target as HTMLElement).dataset.messageId || '');
        if (entry.isIntersecting && i !== undefined) seen.set(entry.target, i); else seen.delete(entry.target);
      }
      if (seen.size) setActive(turns[Math.min(...seen.values())].id);
    }, { root });
    root.querySelectorAll('[data-chat-message]').forEach(element => observer.observe(element));
    return () => observer.disconnect();
  }, [key, visible, viewport]);
  const close = () => { if (!working) { setMode(null); setSelected(new Set()); setConfirming(false); setError(''); setPage(0); } };
  const selectAll = () => setSelected(new Set(turns.map(turn => turn.id)));
  const selectedTurns = turns.filter(turn => selected.has(turn.id));
  const items = confirming ? selectedTurns : turns;
  const pages = Math.max(1, Math.ceil(items.length / 40)), currentPage = Math.min(page, pages - 1);
  const impact = confirming && selectedTurns.length ? chatTurnSelection(conversation, selectedTurns.map(turn => turn.id)) : null;
  const confirm = () => { setConfirming(true); setPage(0); setError(''); };
  const toggle = (id: string) => setSelected(previous => { const next = new Set(previous); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const remove = async () => {
    if (disabled || working || !selectedTurns.length) return;
    setWorking(true); setError('');
    try { await onDelete(selectedTurns.map(turn => turn.id)); setMode(null); setConfirming(false); setSelected(new Set()); setPage(0); }
    catch (failure) { setError(failure instanceof Error ? failure.message : '操作未完成，请重试。'); }
    finally { setWorking(false); }
  };
  if (!visible || !turns.length) return null;
  return <>
    <nav className="chat-turn-rail" aria-label={t('对话跳转')}>
      <button type="button" className="chat-turn-menu icon-button" aria-label={t('对话目录与管理')} title={t('对话目录与管理')} onClick={() => setMode('browse')}><ListTree size={17} /></button>
      <div className="chat-turn-markers">{turns.map((turn, i) => <button key={turn.id} type="button" className="chat-turn-marker" aria-current={active === turn.id ? 'step' : undefined} aria-label={t('跳转第 {0} 轮：{1}', [i + 1, turn.preview])} title={`${i + 1}. ${turn.preview}`} onClick={() => onJump(turn.targetId)}><span /></button>)}</div>
    </nav>
    {mode && <dialog ref={dialog} className="settings-dialog chat-turn-dialog" aria-labelledby="chat-turns-title" onCancel={event => { event.preventDefault(); if (working) return; if (confirming) { setConfirming(false); setPage(0); } else close(); }}>
      <header className="dialog-header"><div><h2 id="chat-turns-title">{t(confirming ? '确认删除所选对话？' : '对话目录与管理')}</h2><p>{t(confirming ? '请核对问题开头。将删除所选问题、回答和所有回答版本，此操作不进入回收站。' : '按提问开头查找，跳转到对应回答，或选择多轮一起删除。')}</p></div><button type="button" className="icon-button" aria-label={t('关闭')} disabled={working} onClick={close}><X size={18} /></button></header>
      {!confirming && <div className="chat-turn-tools">{mode === 'manage' ? <label><input type="checkbox" checked={selected.size === turns.length} onChange={() => selected.size === turns.length ? setSelected(new Set()) : selectAll()} disabled={disabled} />{t('全选全部 {0} 轮', [turns.length])}</label> : <span>{t('共 {0} 轮对话', [turns.length])}</span>}<button type="button" className="secondary-button" disabled={disabled} onClick={() => { setMode(mode === 'browse' ? 'manage' : 'browse'); setPage(0); }}>{t(mode === 'browse' ? '管理与删除' : '返回目录')}</button></div>}
      <div className="chat-turn-list">{items.slice(currentPage * 40, (currentPage + 1) * 40).map(turn => {
        const number = turns.indexOf(turn) + 1;
        return <div className="chat-turn-row" key={turn.id}>
          {mode === 'manage' && !confirming && <input type="checkbox" checked={selected.has(turn.id)} disabled={disabled} aria-label={t('选择第 {0} 轮', [number])} onChange={() => toggle(turn.id)} />}
          <span className="chat-turn-number">{number}</span>
          <button type="button" className="chat-turn-preview" disabled={confirming || working} title={turn.preview} aria-pressed={mode === 'manage' && !confirming ? selected.has(turn.id) : undefined} onClick={() => { if (mode === 'manage') toggle(turn.id); else { close(); onJump(turn.targetId); } }}>{turn.preview || t('没有文字的问题')} {!confirming && <ArrowUpRight size={14} />}</button>
        </div>;
      })}</div>
      {pages > 1 && <nav className="chat-turn-pagination" aria-label={t('对话目录翻页')}><button type="button" className="secondary-button" disabled={working || !currentPage} onClick={() => setPage(currentPage - 1)}>{t('上一页')}</button><span>{currentPage + 1} / {pages}</span><button type="button" className="secondary-button" disabled={working || currentPage === pages - 1} onClick={() => setPage(currentPage + 1)}>{t('下一页')}</button></nav>}
      {confirming && <div className="chat-turn-warning"><p>{t('将删除 {0} 轮对话；PDF 文件及其原文批注保留。', [selectedTurns.length])}</p>{!!impact?.annotationIds.size && <p>{t('所选回答上的 {0} 条批注也会删除。', [impact.annotationIds.size])}</p>}{!!impact?.referenceCount && <p>{t('后续聊天中对本轮内容的文字和批注引用也会移除。')}</p>}<p>{t('以前的自动备份和导出备份仍可能保留这些内容。')}</p></div>}
      {error && <p className="recovery-message" role="alert">{t(error)}</p>}
      <footer className="chat-turn-footer">{confirming ? <><button type="button" className="secondary-button" disabled={working} autoFocus onClick={() => { setConfirming(false); setPage(0); }}>{t('取消')}</button><button type="button" className="danger-button" disabled={disabled || working || !selectedTurns.length} onClick={() => void remove()}><Trash2 size={14} />{t(working ? '正在删除…' : '确认删除 {0} 轮', [selectedTurns.length])}</button></> : mode === 'manage' ? <><button type="button" className="chat-turn-clear" disabled={disabled} onClick={() => { selectAll(); confirm(); }}>{t('清空本次聊天')}</button><span>{t('已选 {0} 轮', [selectedTurns.length])}</span><button type="button" className="danger-button" disabled={disabled || !selectedTurns.length} onClick={confirm}><Trash2 size={14} />{t('删除所选')}</button></> : <button type="button" className="secondary-button" onClick={close}>{t('关闭')}</button>}</footer>
    </dialog>}
  </>;
}
