import { useEffect, useId, useRef, useState } from 'react';
import { FileUp, FolderOpen, Languages, Menu, MessageSquare, Plus, RotateCcw, Settings2, Trash2, type LucideIcon } from 'lucide-react';
import { t } from '../i18n/locale';
import { useLocale } from '../i18n/react';
import { useTranslation } from './Translation';
import './reader-home-menu.css';

interface Props {
  busy: boolean; openFileDisabled: boolean;
  onOpenFile: () => void; onNewChat: () => void; onConversations: () => void;
  onSettings: () => void; onModels: () => void; onBackup: () => void;
  onImport: () => void; onTrash: () => void; onUndoDelete?: () => void;
}
interface Action { label: string; icon: LucideIcon; run: () => void; disabled?: boolean }

/** Reuses the workspace actions without mounting the hidden chat sidebar. */
export function ReaderHomeMenu(props: Props) {
  useLocale();
  const translation = useTranslation();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const firstFocus = useRef<'first' | 'last'>('first');
  const id = useId();
  const items = () => Array.from(panel.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') || []);
  useEffect(() => {
    if (!open) return;
    const buttons = items();
    (firstFocus.current === 'last' ? buttons.at(-1) : buttons[0])?.focus();
    const outside = (event: PointerEvent) => { if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false); };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault(); event.stopPropagation(); setOpen(false); trigger.current?.focus();
    };
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('keydown', escape, true);
    return () => { document.removeEventListener('pointerdown', outside, true); document.removeEventListener('keydown', escape, true); };
  }, [open]);
  const groups: Action[][] = [
    [
      { label: '打开本地 PDF', icon: FolderOpen, run: props.onOpenFile, disabled: props.openFileDisabled },
      { label: '开启新对话', icon: Plus, run: props.onNewChat, disabled: props.busy },
      { label: '你的对话', icon: MessageSquare, run: props.onConversations, disabled: props.busy },
    ],
    [
      { label: '设置', icon: Settings2, run: props.onSettings },
      { label: '模型与 API 连接', icon: Settings2, run: props.onModels },
      ...(translation ? [{ label: '翻译设置', icon: Languages, run: translation.openSettings }] : []),
    ],
    [
      { label: '备份与恢复', icon: RotateCcw, run: props.onBackup, disabled: props.busy },
      { label: '从文件恢复', icon: FileUp, run: props.onImport, disabled: props.openFileDisabled },
      { label: '回收站', icon: Trash2, run: props.onTrash, disabled: props.busy },
      ...(props.onUndoDelete ? [{ label: '撤销删除', icon: RotateCcw, run: props.onUndoDelete, disabled: props.openFileDisabled }] : []),
    ],
  ];
  return <div ref={root} className="reader-home-menu" onBlur={event => {
    if (event.relatedTarget instanceof Node && !event.currentTarget.contains(event.relatedTarget)) setOpen(false);
  }}>
    <button ref={trigger} type="button" className="document-tool-button home-menu-trigger" id={id} aria-label={t('菜单')} aria-haspopup="menu" aria-expanded={open} aria-controls={open ? `${id}-panel` : undefined} onClick={() => { firstFocus.current = 'first'; setOpen(value => !value); }} onKeyDown={event => {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); firstFocus.current = event.key === 'ArrowUp' ? 'last' : 'first'; setOpen(true); }
    }}><Menu size={18} /><span>{t('菜单')}</span></button>
    {open && <div ref={panel} className="home-menu-panel" role="menu" id={`${id}-panel`} aria-labelledby={id} onKeyDown={event => {
      const buttons = items();
      const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
      let next: HTMLButtonElement | undefined;
      if (event.key === 'ArrowDown') next = buttons[(index + 1) % buttons.length];
      if (event.key === 'ArrowUp') next = buttons[(index - 1 + buttons.length) % buttons.length];
      if (event.key === 'Home') next = buttons[0];
      if (event.key === 'End') next = buttons.at(-1);
      if (next) { event.preventDefault(); next.focus(); }
      if (event.key === 'Tab') { setOpen(false); trigger.current?.focus(); }
    }}>
      {groups.map((group, index) => <div key={index} role="group" className="home-menu-group">{group.map(action => <button key={action.label} type="button" role="menuitem" tabIndex={-1} disabled={action.disabled} onClick={() => { setOpen(false); trigger.current?.focus(); action.run(); }}><action.icon size={17} /><span>{t(action.label)}</span></button>)}</div>)}
    </div>}
  </div>;
}
