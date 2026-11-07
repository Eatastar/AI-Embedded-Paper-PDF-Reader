import { useRef, useState } from 'react';
import { Circle } from 'lucide-react';
import { t } from '../i18n/locale';
import { useLocale } from '../i18n/react';
import type { Annotation } from '../domain/types';
import { coordinate, type FigureRect } from '../domain/figure';

const style = (rect: FigureRect) => ({ left: `${rect.x * 100}%`, top: `${rect.y * 100}%`, width: `${rect.width * 100}%`, height: `${rect.height * 100}%` });
export function FigureSelectionLayer({ enabled, annotations, openedId, onSelect, onOpen, onNotify }: { enabled: boolean; annotations: Annotation[]; openedId: string | null; onSelect: (rect: FigureRect) => void; onOpen: (id: string) => void; onNotify: (message: string) => void }) {
  useLocale();
  const start = useRef<{ x: number; y: number } | null>(null);
  const [selection, setSelection] = useState<FigureRect | null>(null);
  const figures = annotations.filter(annotation => annotation.figure && annotation.deletedAt === undefined);
  return <div className="figure-page-layer" aria-hidden={!enabled && !figures.length}>
    {/* Keep only the source locator here; question markings belong to the cropped image. */}
    {!enabled && figures.map(annotation => <div key={annotation.id} className={`figure-region${openedId === annotation.id ? ' is-open' : ''}`} data-figure-annotation={annotation.id} style={{ ...style(annotation.figure!.rect), borderColor: annotation.color }}><button type="button" style={{ background: annotation.color }} aria-label={t('打开图片批注：{0}', [annotation.question || annotation.quote])} onClick={event => { event.stopPropagation(); onOpen(annotation.id); }}><Circle size={11} />{t('图片问答')}</button></div>)}
    {enabled && <div className="figure-crop-layer" data-testid="figure-crop-layer" onPointerDown={event => {
      if (event.button !== 0) return; event.preventDefault(); event.stopPropagation(); window.getSelection()?.removeAllRanges();
      const r = event.currentTarget.getBoundingClientRect(); start.current = { x: coordinate((event.clientX - r.left) / r.width), y: coordinate((event.clientY - r.top) / r.height) }; setSelection({ ...start.current, width: 0, height: 0 }); event.currentTarget.setPointerCapture(event.pointerId);
    }} onPointerMove={event => { if (!start.current) return; event.preventDefault(); event.stopPropagation(); const r = event.currentTarget.getBoundingClientRect(), x = coordinate((event.clientX - r.left) / r.width), y = coordinate((event.clientY - r.top) / r.height); setSelection({ x: Math.min(x, start.current.x), y: Math.min(y, start.current.y), width: Math.abs(x - start.current.x), height: Math.abs(y - start.current.y) }); }} onPointerUp={event => {
      event.preventDefault(); event.stopPropagation(); const first = start.current; if (!first) return; start.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      const r = event.currentTarget.getBoundingClientRect(), x = coordinate((event.clientX - r.left) / r.width), y = coordinate((event.clientY - r.top) / r.height);
      const rect = { x: Math.min(first.x, x), y: Math.min(first.y, y), width: Math.abs(first.x - x), height: Math.abs(first.y - y) };
      setSelection(null); if (rect.width * r.width < 25 || rect.height * r.height < 25) { onNotify('请拖出更大的图片选区。'); return; } onSelect(rect);
    }} onClick={event => { event.preventDefault(); event.stopPropagation(); }} onPointerCancel={() => { start.current = null; setSelection(null); }}>{selection && <div className="figure-crop-rectangle" style={style(selection)}><span>{t('松开鼠标，预览选图并圈出疑问')}</span></div>}</div>}
  </div>;
}
