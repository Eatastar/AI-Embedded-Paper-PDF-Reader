import { t } from '../i18n/locale';
import { useLocale } from '../i18n/react';
import { useEffect, useRef, useState } from 'react';
import type { PointerEvent } from 'react';
import { Check, Circle, Eraser, Pencil, Undo2, X } from 'lucide-react';
import { compactFigureStroke as compactStroke, coordinate, MAX_STROKES, STROKE_COLORS, figureStrokeBytes as strokeBytes, validateFigureStrokes as validateStrokes, type FigurePoint as Point, type FigureStroke as Stroke } from '../domain/figure';
import { formatFigureBytes as formatBytes } from '../adapters/figure';

export function StrokeOverlay({ strokes, width, height }: { strokes: readonly Stroke[]; width: number; height: number }) {
  return <svg className="stroke-overlay" viewBox={`0 0 ${width} ${height}`} aria-hidden="true">{strokes.map((stroke, i) => stroke.tool === 'ellipse' ? <ellipse key={i} cx={(stroke.points[0].x + stroke.points.at(-1)!.x) * width / 2} cy={(stroke.points[0].y + stroke.points.at(-1)!.y) * height / 2} rx={Math.abs(stroke.points[0].x - stroke.points.at(-1)!.x) * width / 2} ry={Math.abs(stroke.points[0].y - stroke.points.at(-1)!.y) * height / 2} fill="none" stroke={stroke.color} strokeWidth={stroke.width * width} /> : <polyline key={i} points={stroke.points.map(point => `${point.x * width},${point.y * height}`).join(' ')} fill="none" stroke={stroke.color} strokeWidth={stroke.width * width} strokeLinecap="round" strokeLinejoin="round" />)}</svg>;
}
export function DrawingEditor({ src, width, height, initial, onSave, onClose }: { src: string; width: number; height: number; initial: readonly Stroke[]; onSave: (strokes: Stroke[]) => void; onClose: () => void }) {
  useLocale();
  const dialog = useRef<HTMLDialogElement>(null), area = useRef<HTMLDivElement>(null), live = useRef<Stroke | null>(null);
  const [strokes, setStrokes] = useState<Stroke[]>(() => initial.slice());
  const [current, setCurrent] = useState<Stroke | null>(null);
  const [tool, setTool] = useState<'pen' | 'ellipse'>('ellipse');
  const [color, setColor] = useState(STROKE_COLORS[0]);
  const [lineWidth, setLineWidth] = useState(.004);
  const [size, setSize] = useState({ width: 800, height: 500 });
  const [error, setError] = useState('');
  const saveEdits = useRef(() => {});
  saveEdits.current = () => { validateStrokes(strokes); onSave(strokes); };
  useEffect(() => {
    const save = () => saveEdits.current();
    document.addEventListener('learn:save-edits', save);
    return () => document.removeEventListener('learn:save-edits', save);
  }, []);
  useEffect(() => { dialog.current?.showModal(); const first = dialog.current?.querySelector<HTMLButtonElement>('button'); first?.focus(); return () => { dialog.current?.close(); }; }, []);
  useEffect(() => {
    const element = area.current; if (!element) return;
    const observer = new ResizeObserver(() => setSize({ width: element.clientWidth - 36, height: element.clientHeight - 36 })); observer.observe(element); return () => observer.disconnect();
  }, []);
  const displayWidth = Math.max(100, Math.min(size.width, size.height * width / height));
  const point = (event: PointerEvent<HTMLDivElement>): Point => { const rect = event.currentTarget.getBoundingClientRect(); return { x: coordinate((event.clientX - rect.left) / rect.width), y: coordinate((event.clientY - rect.top) / rect.height) }; };
  return <dialog ref={dialog} className="drawing-dialog" aria-label={t("圈出图片中的疑问位置")} onCancel={event => { event.preventDefault(); onClose(); }}>
    <header><div><Pencil size={19} /><strong>{t("圈出你不理解的地方")}</strong><span>{t("整张图继续保留为背景")}</span></div><button aria-label={t("取消圈画")} title={t("取消（Esc）")} onClick={onClose}><X size={20} /></button></header>
    <div className="drawing-tools"><div className="drawing-tool-group"><button aria-pressed={tool === 'ellipse'} onClick={() => setTool('ellipse')}><Circle size={15} />{t("画圈")}</button><button aria-pressed={tool === 'pen'} onClick={() => setTool('pen')}><Pencil size={15} />{t("画笔")}</button></div><div className="drawing-colors" aria-label={t("笔迹颜色")}>{STROKE_COLORS.map(value => <button key={value} aria-label={t(value === STROKE_COLORS[0] ? '红色画笔' : value === STROKE_COLORS[1] ? '蓝色画笔' : '紫色画笔')} aria-pressed={color === value} onClick={() => setColor(value)}><span style={{ background: value }} /></button>)}</div><label className="line-size">{t("粗细")}<select aria-label={t("画笔粗细")} value={lineWidth} onChange={event => setLineWidth(Number(event.target.value))}><option value={.0025}>{t("细")}</option><option value={.004}>{t("中")}</option><option value={.007}>{t("粗")}</option></select></label><span className="drawing-tool-spacer" /><button disabled={!strokes.length} onClick={() => { setStrokes(previous => previous.slice(0, -1)); setError(''); }}><Undo2 size={15} />{t("撤销")}</button><button disabled={!strokes.length} onClick={() => { setStrokes([]); setError(''); }}><Eraser size={15} />{t("清空")}</button></div>
    <div className="drawing-area" ref={area}>
      <div className="drawing-stage" data-testid="drawing-stage" style={{ width: displayWidth, height: displayWidth * height / width }} onPointerDown={event => { if (event.button !== 0) return; if (strokes.length >= MAX_STROKES) { setError('这张图已有 40 笔，请先撤销或清空。'); return; } event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); const p = point(event); live.current = { tool, color, width: lineWidth, points: [p, p] }; setCurrent(live.current); }} onPointerMove={event => {
        if (!live.current) return; const p = point(event), previous = live.current.points.at(-1)!;
        if (Math.hypot(p.x - previous.x, p.y - previous.y) < .001) return;
        if (live.current.tool === 'ellipse') live.current = { ...live.current, points: [live.current.points[0], p] };
        else { const points = [...live.current.points, p]; live.current = { ...live.current, points: points.length > 512 ? compactStroke({ ...live.current, points }).points : points }; }
        setCurrent(live.current);
      }} onPointerUp={event => {
        const stroke = live.current; if (!stroke) return; const p = point(event);
        live.current = null; setCurrent(null); if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
        const complete = compactStroke({ ...stroke, points: stroke.tool === 'ellipse' ? [stroke.points[0], p] : [...stroke.points, p] });
        const a = complete.points[0], b = complete.points.at(-1)!;
        if (complete.tool === 'ellipse' && (Math.abs(a.x - b.x) < .004 || Math.abs(a.y - b.y) < .004)) return;
        if (complete.tool === 'pen' && complete.points.every(point => Math.hypot(point.x - a.x, point.y - a.y) < .003)) return;
        try { validateStrokes([...strokes, complete]); setStrokes(previous => [...previous, complete]); setError(''); } catch (e) { setError((e as Error).message); }
      }} onPointerCancel={() => { live.current = null; setCurrent(null); }}><img src={src} alt={t('用于圈画的原始配色图片')} draggable={false} /><StrokeOverlay strokes={current ? [...strokes, current] : strokes} width={width} height={height} /></div>
    </div>
    <footer><div><span>{t('{0} 笔 · 笔迹 {1}', [strokes.length, formatBytes(strokeBytes(strokes))])}</span><small>{t(error || '圈画会叠加到提问图片；取消不会改动原有笔迹。')}</small></div><button className="drawing-cancel" onClick={onClose}>{t("取消")}</button><button className="drawing-save" onClick={() => { try { validateStrokes(strokes); onSave(strokes); } catch (e) { setError((e as Error).message); } }}><Check size={15} />{t("保留圈画")}</button></footer>
  </dialog>;
}
