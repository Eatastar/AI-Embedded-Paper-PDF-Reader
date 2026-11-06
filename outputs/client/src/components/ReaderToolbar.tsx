import { t } from '../i18n/locale';
import { useLocale } from '../i18n/react';
import { useEffect, useId, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { ArrowLeft, ChevronLeft, ChevronRight, Columns2, Download, Eye, FolderOpen, Maximize2, Minus, PanelLeft, Plus, Settings2, SlidersHorizontal, X } from 'lucide-react';
import type { ReaderAppearance } from '../domain/reader';
import { LanguageSelector } from './LanguageSelector';
import { ReaderAppearancePanel } from './ReaderAppearancePanel';
import type { DocumentContextMode } from '../domain/document-context';
import { TranslationButton } from './Translation';

interface Props {
  onReturnFromLink?: () => void;
  name: string; kind: 'pdf' | 'text'; pageCount: number; pageIndex: number; pageInput: string;
  pageInputRef: RefObject<HTMLInputElement | null>; onPageInput: (value: string) => void; onCommitPage: () => void; onPage: (index: number) => void;
  zoom: number; onZoom: (value: number) => void; view: 'original' | 'text'; onView: (value: 'original' | 'text') => void;
  layout: 'paged' | 'continuous'; onLayout: (value: 'paged' | 'continuous') => void;
  appearance: ReaderAppearance; onAppearance: (value: ReaderAppearance) => void; saved: boolean;
  compareOriginal: boolean; onCompareOriginal: () => void;
  navigationOpen: boolean; onToggleNavigation: () => void; focused: boolean; onToggleFocus: () => void; onClose: () => void;
  modelLabel?: string; onOpenModelSettings?: () => void; onBackup?: () => void; onOpenFile?: () => void;
  contextMode: DocumentContextMode; onContextMode: (value: DocumentContextMode) => void; relevantContext: boolean;
}

export function ReaderToolbar(props: Props) {
  useLocale();
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
  const mode = props.view === 'text' ? t("文本") : props.layout === 'continuous' ? t("连续") : t("单页");
  const zoomControls = <>
    <button type="button" className="document-icon-button" aria-label={t("缩小 PDF")} disabled={props.zoom <= .5} onClick={() => props.onZoom(props.zoom - .25)}><Minus size={15} /></button>
    <button type="button" className="document-fit-button" title={t("恢复适合宽度")} onClick={() => props.onZoom(1)}>{props.zoom === 1 ? t("适合宽度") : `${Math.round(props.zoom * 100)}%`}</button>
    <button type="button" className="document-icon-button" aria-label={t("放大 PDF")} disabled={props.zoom >= 2.5} onClick={() => props.onZoom(props.zoom + .25)}><Plus size={15} /></button>
  </>;
  return <>
    <header className="reader-toolbar" aria-label={t("阅读工具栏")} data-testid="reader-toolbar">
      {props.onOpenFile && <button type="button" className="document-icon-button" aria-label={t("打开本地 PDF")} title={t("打开本地 PDF")} onClick={props.onOpenFile}><FolderOpen size={18} /></button>}
      <button type="button" className="document-icon-button" aria-label={t("文档导航")} title={t("目录、搜索与批注")} aria-expanded={props.navigationOpen} onClick={props.onToggleNavigation}><PanelLeft size={18} /></button>
      <div className="reader-toolbar-title" title={`${props.name} · ${mode} · ${props.relevantContext ? t('按需引用') : t('全文')}`}><strong>{props.name}</strong><span className="reader-mode-label">{mode} · {props.relevantContext ? t('按需引用') : t('全文')}</span></div>
      <div className="document-page-navigation">
        {props.onReturnFromLink && <button type="button" className="document-icon-button" aria-label={t('返回跳转前位置')} title={t('返回跳转前位置')} onClick={props.onReturnFromLink}><ArrowLeft size={16} /></button>}
        <button type="button" className="document-icon-button" aria-label={t("上一页")} disabled={props.pageIndex <= 0} onClick={() => props.onPage(props.pageIndex - 1)}><ChevronLeft size={17} /></button>
        <label><input ref={props.pageInputRef} aria-label={t("文档页码")} type="text" inputMode="numeric" value={props.pageInput} onChange={event => props.onPageInput(event.target.value)} onBlur={props.onCommitPage} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur(); } }} /><span> / {props.pageCount}</span></label>
        <button type="button" className="document-icon-button" aria-label={t("下一页")} disabled={props.pageIndex >= props.pageCount - 1} onClick={() => props.onPage(props.pageIndex + 1)}><ChevronRight size={17} /></button>
      </div>
      {props.kind === 'pdf' && props.view === 'original' && <div className="document-zoom-controls reader-toolbar-zoom">{zoomControls}</div>}
      <TranslationButton />
      <button ref={triggerRef} type="button" className="document-icon-button" aria-label={t("阅读设置")} title={t("阅读模式、配色与更多")} aria-controls={id} aria-expanded={settingsOpen} onClick={() => setSettingsOpen(value => !value)}><SlidersHorizontal size={18} /></button>
      <button type="button" className="document-icon-button" aria-label={props.focused ? t("显示聊天") : t("专注阅读")} title={props.focused ? t("显示聊天") : t("专注阅读")} onClick={props.onToggleFocus}>{props.focused ? <Columns2 size={18} /> : <Maximize2 size={18} />}</button>
      <button type="button" className="document-icon-button" aria-label={t("关闭文档阅读")} title={t("关闭文档阅读")} onClick={props.onClose}><X size={19} /></button>
    </header>
    {settingsOpen && <div ref={settingsRef} id={id} role="dialog" aria-label={t("阅读设置")} className="reader-settings" data-testid="reader-settings">
      <header><div><strong>{t("阅读设置")}</strong><small title={props.name}>{props.name}</small></div><button type="button" className="document-icon-button" aria-label={t("关闭阅读设置")} onClick={() => { setSettingsOpen(false); triggerRef.current?.focus({ preventScroll: true }); }}><X size={18} /></button></header>
      {props.kind === 'pdf' && <div className="reader-setting-row"><span>{t("显示")}</span><div className="document-view-switch" role="group" aria-label={t("文档显示方式")}><button type="button" aria-pressed={props.view === 'original'} onClick={() => props.onView('original')}>{t("PDF 原排版")}</button><button type="button" aria-pressed={props.view === 'text'} onClick={() => props.onView('text')}>{t("可批注文本")}</button></div></div>}
      {props.kind === 'pdf' && props.view === 'original' && <>
        <div className="reader-setting-row"><span>{t("翻页")}</span><div className="document-view-switch" role="group" aria-label={t("翻页方式")}><button type="button" aria-pressed={props.layout === 'continuous'} onClick={() => props.onLayout('continuous')}>{t("连续滚动")}</button><button type="button" aria-pressed={props.layout === 'paged'} onClick={() => props.onLayout('paged')}>{t("单页阅读")}</button></div></div>
        <div className="reader-setting-row reader-settings-zoom"><span>{t("缩放")}</span><div className="document-zoom-controls">{zoomControls}</div></div>
      </>}
      <div className="reader-setting-row"><span>{t("界面语言")}</span><LanguageSelector /></div>
      <label className="reader-setting-row reader-context-setting"><span>{t("AI 资料范围")}</span><select aria-label={t("AI 资料范围")} value={props.contextMode} onChange={event => props.onContextMode(event.target.value as DocumentContextMode)}><option value="auto">{t("自动：小文件全文，大文件按需引用")}</option><option value="relevant">{t("按需引用")}</option><option value="full">{t("全文")}</option></select></label>
      <p className="reader-settings-help" role="status">{props.relevantContext ? t("当前文件：按需引用，发送选段、所在页和相关片段；不发送全文。") : t("当前文件：全文，发送全部提取文字；扫描图片暂不识别。")}{t('批注不带聊天记录；失败重试保留本次问题和资料范围。')}</p>
      <p className="reader-settings-help">{t("自动模式：超过 25 MB、300 页或 12 万字符时按需引用，每份最多引用 2.4 万字符。全文模式仍受模型容量限制。")}</p>
      <ReaderAppearancePanel appearance={props.appearance} onChange={props.onAppearance} saved={props.saved} />
      <div className="reader-setting-actions"><button type="button" className="document-tool-button" aria-pressed={props.compareOriginal} disabled={props.appearance.preset === 'original'} onClick={props.onCompareOriginal}><Eye size={14} />{t("原色对照")}</button>
        {props.onBackup && <button type="button" className="document-tool-button" onClick={() => { setSettingsOpen(false); props.onBackup?.(); }}><Download size={14} />{t("备份当前对话")}</button>}
      </div>
      {props.onOpenModelSettings && <button type="button" className="reader-model-settings" onClick={() => { setSettingsOpen(false); props.onOpenModelSettings?.(); }}><Settings2 size={15} /><span>{t("模型与设置")}</span><small>{props.modelLabel}</small></button>}
      <p className="reader-settings-help">{t("划选文字可询问 AI 或只写批注。支持触控板捏合缩放；目录、搜索和批注总览在“文档导航”中。")}</p>
      <p className="reader-settings-help">{t('批注只引用所属文档或原回答，不带主聊天和其他批注；原文件保存在本机。')}</p>
      <footer><span>AI-Embedded Paper PDF Reader</span><span>{__APP_VERSION__} · {__APP_BUILD__}</span></footer>
    </div>}
  </>;
}
