import { useEffect, useId, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { ChevronLeft, ChevronRight, Columns2, Download, Eye, FolderOpen, Maximize2, Minus, PanelLeft, Plus, Settings2, SlidersHorizontal, X } from 'lucide-react';
import type { ReaderAppearance } from '../domain/reader';
import { ReaderAppearancePanel } from './ReaderAppearancePanel';

interface Props {
  name: string; kind: 'pdf' | 'text'; pageCount: number; pageIndex: number; pageInput: string;
  pageInputRef: RefObject<HTMLInputElement | null>; onPageInput: (value: string) => void; onCommitPage: () => void; onPage: (index: number) => void;
  zoom: number; onZoom: (value: number) => void; view: 'original' | 'text'; onView: (value: 'original' | 'text') => void;
  layout: 'paged' | 'continuous'; onLayout: (value: 'paged' | 'continuous') => void;
  appearance: ReaderAppearance; onAppearance: (value: ReaderAppearance) => void; saved: boolean;
  compareOriginal: boolean; onCompareOriginal: () => void;
  navigationOpen: boolean; onToggleNavigation: () => void; focused: boolean; onToggleFocus: () => void; onClose: () => void;
  modelLabel?: string; onOpenModelSettings?: () => void; onBackup?: () => void; onOpenFile?: () => void;
}

export function ReaderToolbar(props: Props) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null), triggerRef = useRef<HTMLButtonElement>(null), id = useId();
  useEffect(() => {
    if (!settingsOpen) return;
    const closeOutside = (event: Event) => {
      if (event.target instanceof Node && !settingsRef.current?.contains(event.target) && !triggerRef.current?.contains(event.target)) setSettingsOpen(false);
    };
    const closeKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault(); event.stopPropagation(); setSettingsOpen(false); triggerRef.current?.focus({ preventScroll: true });
    };
    settingsRef.current?.querySelector<HTMLElement>('button')?.focus({ preventScroll: true });
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('focusin', closeOutside);
    document.addEventListener('keydown', closeKey);
    return () => { document.removeEventListener('pointerdown', closeOutside); document.removeEventListener('focusin', closeOutside); document.removeEventListener('keydown', closeKey); };
  }, [settingsOpen]);
  const mode = props.view === 'text' ? '文本' : props.layout === 'continuous' ? '连续' : '单页';
  const zoomControls = <>
    <button type="button" className="document-icon-button" aria-label="缩小 PDF" disabled={props.zoom <= .5} onClick={() => props.onZoom(props.zoom - .25)}><Minus size={15} /></button>
    <button type="button" className="document-fit-button" title="恢复适合宽度" onClick={() => props.onZoom(1)}>{props.zoom === 1 ? '适合宽度' : `${Math.round(props.zoom * 100)}%`}</button>
    <button type="button" className="document-icon-button" aria-label="放大 PDF" disabled={props.zoom >= 2.5} onClick={() => props.onZoom(props.zoom + .25)}><Plus size={15} /></button>
  </>;
  return <>
    <header className="reader-toolbar" aria-label="阅读工具栏" data-testid="reader-toolbar">
      {props.onOpenFile && <button type="button" className="document-icon-button" aria-label="打开本地 PDF" title="打开本地 PDF" onClick={props.onOpenFile}><FolderOpen size={18} /></button>}
      <button type="button" className="document-icon-button" aria-label="文档导航" title="目录、搜索与批注" aria-expanded={props.navigationOpen} onClick={props.onToggleNavigation}><PanelLeft size={18} /></button>
      <div className="reader-toolbar-title" title={`${props.name} · ${mode}`}><strong>{props.name}</strong><span className="reader-mode-label">{mode}</span></div>
      <div className="document-page-navigation">
        <button type="button" className="document-icon-button" aria-label="上一页" disabled={props.pageIndex <= 0} onClick={() => props.onPage(props.pageIndex - 1)}><ChevronLeft size={17} /></button>
        <label><input ref={props.pageInputRef} aria-label="文档页码" type="text" inputMode="numeric" value={props.pageInput} onChange={event => props.onPageInput(event.target.value)} onBlur={props.onCommitPage} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur(); } }} /><span> / {props.pageCount}</span></label>
        <button type="button" className="document-icon-button" aria-label="下一页" disabled={props.pageIndex >= props.pageCount - 1} onClick={() => props.onPage(props.pageIndex + 1)}><ChevronRight size={17} /></button>
      </div>
      {props.kind === 'pdf' && props.view === 'original' && <div className="document-zoom-controls reader-toolbar-zoom">{zoomControls}</div>}
      <button ref={triggerRef} type="button" className="document-icon-button" aria-label="阅读设置" title="阅读模式、配色与更多" aria-controls={id} aria-expanded={settingsOpen} onClick={() => setSettingsOpen(value => !value)}><SlidersHorizontal size={18} /></button>
      <button type="button" className="document-icon-button" aria-label={props.focused ? '显示聊天' : '专注阅读'} title={props.focused ? '显示聊天' : '专注阅读'} onClick={props.onToggleFocus}>{props.focused ? <Columns2 size={18} /> : <Maximize2 size={18} />}</button>
      <button type="button" className="document-icon-button" aria-label="关闭文档阅读" title="关闭文档阅读" onClick={props.onClose}><X size={19} /></button>
    </header>
    {settingsOpen && <div ref={settingsRef} id={id} role="dialog" aria-label="阅读设置" className="reader-settings" data-testid="reader-settings">
      <header><div><strong>阅读设置</strong><small title={props.name}>{props.name}</small></div><button type="button" className="document-icon-button" aria-label="关闭阅读设置" onClick={() => { setSettingsOpen(false); triggerRef.current?.focus({ preventScroll: true }); }}><X size={18} /></button></header>
      {props.kind === 'pdf' && <div className="reader-setting-row"><span>显示</span><div className="document-view-switch" role="group" aria-label="文档显示方式"><button type="button" aria-pressed={props.view === 'original'} onClick={() => props.onView('original')}>PDF 原排版</button><button type="button" aria-pressed={props.view === 'text'} onClick={() => props.onView('text')}>可批注文本</button></div></div>}
      {props.kind === 'pdf' && props.view === 'original' && <>
        <div className="reader-setting-row"><span>翻页</span><div className="document-view-switch" role="group" aria-label="翻页方式"><button type="button" aria-pressed={props.layout === 'continuous'} onClick={() => props.onLayout('continuous')}>连续滚动</button><button type="button" aria-pressed={props.layout === 'paged'} onClick={() => props.onLayout('paged')}>单页阅读</button></div></div>
        <div className="reader-setting-row reader-settings-zoom"><span>缩放</span><div className="document-zoom-controls">{zoomControls}</div></div>
      </>}
      <ReaderAppearancePanel appearance={props.appearance} onChange={props.onAppearance} saved={props.saved} />
      <div className="reader-setting-actions"><button type="button" className="document-tool-button" aria-pressed={props.compareOriginal} disabled={props.appearance.preset === 'original'} onClick={props.onCompareOriginal}><Eye size={14} />原色对照</button>
        {props.onBackup && <button type="button" className="document-tool-button" onClick={() => { setSettingsOpen(false); props.onBackup?.(); }}><Download size={14} />备份当前对话</button>}
      </div>
      {props.onOpenModelSettings && <button type="button" className="reader-model-settings" onClick={() => { setSettingsOpen(false); props.onOpenModelSettings?.(); }}><Settings2 size={15} /><span>模型与设置</span><small>{props.modelLabel}</small></button>}
      <p className="reader-settings-help">划选文字可询问 AI 或只写批注。支持触控板捏合缩放；目录、搜索和批注总览在“文档导航”中。</p>
      <p className="reader-settings-help">询问会发送本对话和文档提取文字；原文件保存在本机。</p>
      <footer><span>learn something</span><span>{__APP_VERSION__} · {__APP_BUILD__}</span></footer>
    </div>}
  </>;
}
