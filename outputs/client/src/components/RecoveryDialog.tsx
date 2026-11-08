import { t, getLocale } from '../i18n/locale';
import { useLocale } from '../i18n/react';
import { useEffect, useRef, useState } from 'react';
import { Download, FileUp, RefreshCw, RotateCcw, Trash2, X } from 'lucide-react';
import { desktop } from '../adapters/desktop';
import type { LocalBackup } from '../adapters/desktop';
import { NativeSelect } from './NativeSelect';

export function RecoveryDialog({ recovery, onClose, onRestore, onCreate, onDeleted, onExport }: {
  recovery: boolean; onClose: () => void; onRestore: (text: string) => Promise<void>;
  onCreate: () => Promise<void>; onDeleted?: () => void; onExport?: (legacy?: boolean, currentOnly?: boolean) => Promise<void>;
}) {
  useLocale();
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [entries, setEntries] = useState<LocalBackup[]>([]);
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState('');
  const [scope, setScope] = useState('all');
  const [pendingDelete, setPendingDelete] = useState<LocalBackup>();
  const refresh = async () => { setEntries(await desktop()?.backups.list() || []); };
  const run = async (action: () => Promise<void>) => {
    setBusy(true); setMessage('');
    try { await action(); }
    catch (error) { setMessage(error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': Error: /, '') : '操作未完成，请重试。'); }
    finally { setBusy(false); }
  };
  useEffect(() => {
    dialog.current?.showModal();
    void run(refresh);
  }, []);
  const restore = async (text: string) => { await onRestore(text); onClose(); };
  const download = async (entry: LocalBackup) => {
    const text = await desktop()!.backups.read(entry.id);
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = t("ai-paper-pdf-reader-备份-{0}.json", [new Date(entry.createdAt).toISOString().slice(0, 10)]); link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000); setMessage('备份已导出。');
  };
  const cancelDelete = () => { setPendingDelete(undefined); setMessage(''); dialog.current?.querySelector<HTMLButtonElement>('.dialog-header button')?.focus(); };
  const remove = async (entry: LocalBackup) => {
    const result = await desktop()!.backups.remove!(entry.id);
    onDeleted?.(); await refresh(); setPendingDelete(undefined);
    setMessage(result.cleanupPending ? '备份已删除，部分附件暂时无法清理，将稍后重试。' : '备份已删除。');
    dialog.current?.querySelector<HTMLButtonElement>('.dialog-header button')?.focus();
  };
  return <dialog ref={dialog} className="settings-dialog recovery-dialog" aria-labelledby="recovery-title" onCancel={event => { event.preventDefault(); if (busy) return; if (pendingDelete) cancelDelete(); else onClose(); }}>
    <header className="dialog-header"><div><span className="eyebrow">LOCAL BACKUPS</span><h2 id="recovery-title">{t("备份与恢复")}</h2></div><button className="icon-button" aria-label={t("关闭备份与恢复")} disabled={busy} onClick={onClose}><X size={19} /></button></header>
    {pendingDelete ? <div className="trash-confirmation backup-delete-confirmation">
      <h3>{t("删除这份备份？")}</h3><p className="trash-confirm-label">{new Date(pendingDelete.createdAt).toLocaleString(getLocale(), { hour12: false })}</p>
      <p>{t("只删除这个恢复点，不影响当前的聊天、笔记、批注和 PDF。之后仍会按规则生成新备份。")}</p>
      {pendingDelete.baseline && <p className="trash-backup-note">{t("这是升级前备份，删除后将无法通过它恢复到升级前。")}</p>}
      <div className="trash-confirm-actions"><button type="button" className="secondary-button" disabled={busy} onClick={cancelDelete} autoFocus>{t("取消")}</button><button type="button" className="danger-button" disabled={busy} onClick={() => void run(() => remove(pendingDelete))}><Trash2 size={14} />{busy ? t("正在删除…") : t("确认永久删除")}</button></div>
    </div> : <>
    <p className="recovery-intro">{recovery ? t("原记录仍保留在本机。选择一份完整备份恢复，恢复前会另外保留原记录副本。") : t("恢复会添加为新的对话，现有对话继续保留。")}</p>
    <p className="recovery-intro">{desktop() ? t("聊天和批注照常自动保存；有变化时每 10 分钟建立备份，退出前也会备份。保留最近 5 份普通备份和 2 份升级前备份，可逐条删除。") : t("浏览器版可导入、导出完整备份；自动轮换备份由桌面版提供。")}{t("模型密钥不包含在备份中。")}</p>
    {desktop() && <p className="recovery-intro">{t("自动备份中的相同附件只保存一份，各恢复点共享使用。导出 JSON 时会附带原文件，可单独恢复。")}</p>}
    {onExport && <><label className="backup-scope"><span>{t("导出范围")}</span><NativeSelect wrapperClassName="backup-scope-select" aria-label={t("备份导出范围")} value={scope} disabled={busy} onChange={event => setScope(event.target.value)}><option value="all">{t("全部记录（含回收站）")}</option><option value="current">{t("当前对话")}</option></NativeSelect></label><p className="recovery-intro">{t("新版备份体积更小；需要回退旧版时，选择“兼容旧版导出”。")}</p></>}
    <div className="recovery-toolbar">
      {desktop() && !recovery && <button className="secondary-button" disabled={busy} onClick={() => void run(async () => { await onCreate(); await refresh(); setMessage('自动备份已更新。'); })}><RefreshCw size={15} />{t("立即备份")}</button>}
      {onExport && <><button className="secondary-button" disabled={busy} onClick={() => void run(() => onExport(false, scope === 'current'))}><Download size={15} />{t("导出备份")}</button><button className="secondary-button" disabled={busy} onClick={() => void run(() => onExport(true, scope === 'current'))}>{t("兼容旧版导出")}</button></>}
      <button className="secondary-button" disabled={busy} onClick={() => input.current?.click()}><FileUp size={15} />{t("从文件恢复")}</button>
    </div>
    <div className="recovery-list" aria-busy={busy}>
      {!entries.length && <p className="recovery-empty">{busy ? t("正在读取本机备份…") : t("暂无自动备份，可以选择之前导出的 JSON 文件。")}</p>}
      {entries.map(entry => <article className="recovery-entry" key={entry.id} data-backup-id={entry.id}><div><strong>{new Date(entry.createdAt).toLocaleString(getLocale(), { hour12: false })}</strong><span>{entry.baseline ? t("升级前备份") : entry.sharedAttachments ? t("共享附件备份") : t("完整备份")} · {entry.sharedAttachments ? t("记录 {0} MB", [(entry.size / 1024 / 1024).toFixed(2)]) : `${(entry.size / 1024 / 1024).toFixed(2)} MB`}</span></div><div className="recovery-entry-actions"><button className="icon-button" aria-label={t("导出 {0} 的备份", [new Date(entry.createdAt).toLocaleString(getLocale(), { hour12: false })])} title={t("导出这份备份")} disabled={busy} onClick={() => void run(() => download(entry))}><Download size={16} /></button>{desktop()?.backups.remove && <button type="button" className="icon-button backup-delete-button" title={t("删除这份备份")} aria-label={t("删除 {0} 的备份", [new Date(entry.createdAt).toLocaleString(getLocale(), { hour12: false })])} disabled={busy} onClick={() => { setMessage(''); setPendingDelete(entry); }}><Trash2 size={16} /></button>}<button className="secondary-button" disabled={busy} onClick={() => void run(async () => restore(await desktop()!.backups.read(entry.id)))}><RotateCcw size={14} />{recovery ? t("恢复") : t("恢复为新对话")}</button></div></article>)}
    </div>
    </>}
    {message && <p className="recovery-message" role="status">{t(message)}</p>}
    <footer className="recovery-footer" title={t("构建时间 {0}", [new Date(__APP_BUILD_TIME__).toLocaleString(getLocale(), { hour12: false })])}>AI-Embedded Paper PDF Reader {__APP_VERSION__}{t("· 构建")}{__APP_BUILD__}</footer>
    <input ref={input} type="file" className="visually-hidden" accept=".json,application/json" aria-label={t("选择恢复备份文件")} onChange={event => {
      const file = event.target.files?.[0]; if (!file) return;
      void run(async () => { if (file.size > 350_000_000) throw new Error('备份超过 350 MB，请选择较小的备份文件。'); await restore(await file.text()); }).finally(() => { if (input.current) input.current.value = ''; });
    }} />
  </dialog>;
}
