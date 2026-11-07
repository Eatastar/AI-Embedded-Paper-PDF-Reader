import { t } from '../i18n/locale';
import { useLocale } from '../i18n/react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { ChevronDown, Circle, LocateFixed, Pin, PinOff, Settings2 } from 'lucide-react';
import type { Annotation, ModelSettings } from '../domain/types';
import { figureImageKey, figureSourceKey, type FigureStroke } from '../domain/figure';
import { clearFigureCache, figureCache, formatFigureBytes, getFigureBase, prepareFigureImage, type FigureImage, type PreparedFigureImage } from '../adapters/figure';
import { AnnotationCard } from './AnnotationCard';
import { MovableAnnotationPopup } from './MovableAnnotationPopup';
import { DrawingEditor } from './FigureDrawingEditor';
import { NativeSelect } from './NativeSelect';
import { constrainPopup, type PopupRect } from './popup-position';
import './figure.css';

interface Props {
  annotation: Annotation; pdf: PDFDocumentProxy; palette: CSSProperties; settings: ModelSettings; disabled?: boolean;
  onClose: () => void; onLocate: () => void; onUpdate: (patch: Partial<Annotation>) => void;
  onStrokes: (strokes: FigureStroke[]) => void; onAsk: (image: PreparedFigureImage, profileId?: string | null) => void;
  onStop: () => void; onReask: (action: 'start' | 'cancel' | 'edit') => void; onDelete: () => void; onSettings?: () => void;
  docked: boolean; onDockChange: (docked: boolean) => void;
}
function floatingRect(rect: PopupRect): PopupRect {
  const viewport = { width: innerWidth, height: innerHeight }, width = Math.min(rect.width, Math.max(1, viewport.width - 24));
  const position = constrainPopup(rect, { width, height: Math.min(rect.height, Math.max(1, viewport.height - 24)) }, viewport);
  return { ...position, width, height: Math.max(1, viewport.height - position.top - 12) };
}
function useURL(blob: Blob | undefined) {
  const [result, setResult] = useState<{ blob: Blob; url: string }>();
  useEffect(() => { if (!blob) { setResult(undefined); return; } const url = URL.createObjectURL(blob); setResult({ blob, url }); return () => URL.revokeObjectURL(url); }, [blob]);
  return result?.blob === blob ? result?.url : undefined;
}

export function FigureAnnotationPanel(props: Props) {
  useLocale();
  const { annotation, pdf, settings } = props, figure = annotation.figure!;
  const strokes = annotation.reask?.figureStrokes || figure.strokes;
  const sourceKey = figureSourceKey(figure), imageKey = figureImageKey(figure, strokes);
  const [base, setBase] = useState<{ key: string; image: FigureImage }>();
  const [prepared, setPrepared] = useState<PreparedFigureImage>();
  const [imageError, setImageError] = useState(''), [localError, setLocalError] = useState('');
  const [expanded, setExpanded] = useState(false), [drawing, setDrawing] = useState(false), [cacheOpen, setCacheOpen] = useState(false);
  const [profileId, setProfileId] = useState(() => { try { return localStorage.getItem('learn.figure.profile') || ''; } catch { return ''; } });
  const host = useRef<HTMLElement>(null), popup = useRef<HTMLDivElement>(null);
  const [bounds, setBounds] = useState<{ left: number; top: number; width: number; height: number }>();
  const [floatingBounds, setFloatingBounds] = useState<PopupRect>();
  const [resetLayoutKey, setResetLayoutKey] = useState(0);
  const busy = annotation.status === 'generating' || annotation.reask?.status === 'generating';
  const currentBase = base?.key === sourceKey ? base.image : undefined;
  const currentImage = prepared?.key === imageKey ? prepared : undefined;
  const originalURL = useURL(currentBase?.blob), previewURL = useURL(currentImage?.blob);
  const selected = settings.profiles.find(item => item.id === (profileId || settings.activeProfileId));
  const requestProfile = profileId || (settings.mode === 'demo' ? null : settings.activeProfileId || undefined);
  useEffect(() => { if (profileId && !settings.profiles.some(item => item.id === profileId)) setProfileId(''); }, [profileId, settings.profiles]);
  useEffect(() => { try { if (profileId) localStorage.setItem('learn.figure.profile', profileId); else localStorage.removeItem('learn.figure.profile'); } catch { /* Selection remains usable for this session. */ } setLocalError(''); }, [profileId]);
  useEffect(() => {
    const controller = new AbortController(); setImageError('');
    void getFigureBase(pdf, figure, controller.signal).then(image => setBase({ key: sourceKey, image })).catch(error => { if (!controller.signal.aborted) setImageError(error instanceof Error ? error.message : '无法准备提问图片，请重新框选。'); });
    return () => controller.abort();
  }, [pdf, sourceKey]);
  useEffect(() => {
    if (!currentBase) return;
    const controller = new AbortController(); setImageError('');
    void prepareFigureImage(currentBase, figure, strokes, controller.signal).then(setPrepared).catch(error => { if (!controller.signal.aborted) setImageError(error instanceof Error ? error.message : '无法准备提问图片，请重新框选。'); });
    return () => controller.abort();
  }, [currentBase, imageKey]);
  useLayoutEffect(() => {
    const element = host.current; if (!element) return;
    if (!props.docked) {
      const fit = () => { const r = popup.current?.getBoundingClientRect() || element.getBoundingClientRect(); setFloatingBounds(previous => floatingRect({ ...r, left: r.left, top: r.top, width: previous?.width || r.width, height: r.height })); };
      setFloatingBounds(previous => previous || floatingRect(element.getBoundingClientRect()));
      window.addEventListener('resize', fit);
      return () => window.removeEventListener('resize', fit);
    }
    const measure = () => { const r = element.getBoundingClientRect(); setBounds(previous => previous && previous.left === r.left && previous.top === r.top && previous.width === r.width && previous.height === r.height ? previous : { left: r.left, top: r.top, width: r.width, height: r.height }); };
    const observer = new ResizeObserver(measure); observer.observe(element); measure();
    window.addEventListener('resize', measure); document.addEventListener('scroll', measure, true);
    return () => { observer.disconnect(); window.removeEventListener('resize', measure); document.removeEventListener('scroll', measure, true); };
  }, [props.docked]);
  const detach = () => {
    if (!props.docked) return;
    const r = popup.current?.getBoundingClientRect(); if (r) setFloatingBounds(floatingRect(r));
    props.onDockChange(false);
  };
  const toggleDock = () => {
    if (props.docked) detach();
    else { setResetLayoutKey(value => value + 1); props.onDockChange(true); }
  };
  const placement = props.docked ? bounds : floatingBounds;
  const dockAction = <button type="button" className="annotation-icon-button figure-dock-toggle" aria-pressed={props.docked} aria-label={t(props.docked ? '取消停靠，释放阅读空间' : '停靠到阅读器')} title={t(props.docked ? '取消停靠，释放阅读空间' : '停靠到阅读器')} onClick={toggleDock}>{props.docked ? <PinOff size={15} /> : <Pin size={15} />}</button>;
  const ask = () => {
    if (!currentImage || imageError || busy) return;
    if (requestProfile === null) { setLocalError('图片问答需要连接支持图片理解的模型，当前为本地演示。'); return; }
    if (selected?.imageInput === 'unsupported') { setLocalError('此连接已设置为不支持图片。请切换支持图片理解的模型后重试，图片、圈画和问题已保留。'); return; }
    setLocalError(''); props.onAsk(currentImage, requestProfile);
  };
  const source = <div className="figure-source-preview">
    <div className="figure-source-actions"><button type="button" onClick={props.onLocate}><LocateFixed size={12} />{t('第 {0} 页原图', [figure.pageNumber])}</button><button type="button" disabled={!originalURL || busy} onClick={() => setDrawing(true)}><Circle size={12} />{t(strokes.length ? '调整圈画' : '圈出疑问')}</button></div>
    <button type="button" className={`figure-thumbnail ${expanded ? 'expanded' : ''}`} aria-expanded={expanded} aria-label={t(expanded ? '收起选图预览' : '展开选图预览')} onClick={() => setExpanded(!expanded)}><img src={previewURL || originalURL} alt={t('用于提问的原色图片，包含本次圈画')} /><span>{t(expanded ? '收起预览' : '选图预览')}<small>{t(expanded ? '原始配色' : '点击放大查看')}</small></span><ChevronDown size={12} /></button>
    <p className="figure-size">{currentImage ? t('图片 {0} · {1} 笔圈画', [formatFigureBytes(currentImage.blob.size), strokes.length]) : t('正在准备提问图片…')}</p>
    {imageError && <p className="figure-error" role="alert">{t(imageError)}</p>}
  </div>;
  const controls = <div className="figure-request-controls"><label>{t('提问模型')}<NativeSelect disabled={busy} value={profileId} onChange={event => setProfileId(event.target.value)}><option value="">{settings.mode === 'demo' ? t('请选择已保存的 API 连接') : t('跟随当前连接：{0}', [settings.model])}</option>{settings.profiles.map(profile => <option key={profile.id} value={profile.id}>{profile.name} · {profile.model}{profile.imageInput === 'unsupported' ? ` · ${t('仅文字')}` : ''}</option>)}</NativeSelect></label>{props.onSettings && <button type="button" className="figure-settings" title={t('配置 API')} onClick={props.onSettings}><Settings2 size={13} /></button>}{localError && <div className="figure-error" role="alert"><p>{t(localError)}</p><button type="button" onClick={() => { document.querySelector<HTMLSelectElement>('.figure-request-controls select')?.focus(); }}>{t('切换模型')}</button></div>}<details open={cacheOpen} onToggle={event => setCacheOpen(event.currentTarget.open)}><summary>{t('图像缓存：{0} / 32 MB', [formatFigureBytes(figureCache.bytes)])}</summary><p>{t('只保存选区坐标和笔迹；图片按需生成。临时预览与 PDF 页面内存另计。')}</p><button type="button" onClick={() => { clearFigureCache(); props.onClose(); }}>{t('清理图片缓存并收起')}</button></details></div>;
  return <aside ref={host} className="figure-note-rail" data-docked={props.docked} aria-label={t('图片批注区域')}>
    {placement && placement.width > 0 && createPortal(<MovableAnnotationPopup popupRef={popup} resetLayoutKey={resetLayoutKey} onUserMoveOrResize={detach} style={{ ...props.palette, left: placement.left, top: placement.top, width: placement.width, maxHeight: placement.height, zIndex: 48 }}><AnnotationCard annotation={annotation} headerActions={dockAction} sourceContent={source} requestControls={controls} requestDisabled={!currentImage || !!imageError} disabled={props.disabled} onClose={props.onClose} onUpdate={props.onUpdate} onAsk={ask} onStop={props.onStop} onReask={props.onReask} onDelete={props.onDelete} /></MovableAnnotationPopup>, document.body)}
    {drawing && originalURL && currentBase && <DrawingEditor src={originalURL} width={currentBase.width} height={currentBase.height} initial={strokes} onClose={() => setDrawing(false)} onSave={next => { props.onStrokes(next); setDrawing(false); }} />}
  </aside>;
}
