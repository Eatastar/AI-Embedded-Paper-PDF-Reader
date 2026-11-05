import { t } from '../i18n/locale';
import { useLocale } from '../i18n/react';
import { useEffect, useState } from 'react';
import { Palette } from 'lucide-react';
import { HIGHLIGHT_COLORS, normalizeHighlightColor } from '../domain/highlight-colors';

export function HighlightColorPicker({ color, onChange }: { color: string; onChange: (color: string) => void }) {
  useLocale();
  const [draft, setDraft] = useState(color);
  const [error, setError] = useState('');
  useEffect(() => { setDraft(color); setError(''); }, [color]);
  function apply(value: string) {
    try { onChange(normalizeHighlightColor(value)); setError(''); }
    catch (e) { setError(e instanceof Error ? e.message : '颜色未能保存。'); }
  }
  return <details className="highlight-color-picker">
    <summary><Palette size={14} />{t("高亮颜色")}<span className="highlight-current-color" style={{ background: color }} /></summary>
    <div className="highlight-color-options" role="group" aria-label={t("预设高亮颜色")}>{HIGHLIGHT_COLORS.map(item => <button type="button" key={item.value} style={{ background: item.value }} aria-label={t(item.name)} title={t(item.name)} aria-pressed={color.toLowerCase() === item.value} onClick={() => apply(item.value)} />)}</div>
    <div className="highlight-custom-color"><label>{t("自定义颜色")}<input type="color" aria-label={t("自定义高亮颜色")} value={color.slice(0, 7)} onChange={event => apply(event.target.value)} /></label><input aria-label={t("颜色代码")} value={draft} maxLength={9} placeholder="#RRGGBB" onChange={event => setDraft(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); apply(draft); } }} /><button type="button" className="annotation-text-button" onClick={() => apply(draft)}>{t("应用")}</button></div>
    {error && <p className="annotation-footnote" role="alert">{t(error)}</p>}
    <p className="annotation-footnote">{t("颜色会保存在这条批注中，可随时更换。")}</p>
  </details>;
}
