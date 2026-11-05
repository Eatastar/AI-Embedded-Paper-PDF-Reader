import { useEffect, useState } from 'react';
import { isHexColor, READER_PRESETS, readerContrast } from '../domain/reader';
import type { ReaderAppearance } from '../domain/reader';

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (hex: string) => void }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => { setDraft(value); }, [value]);
  return <label className="reader-color-field"><span>{label}</span><input type="color" aria-label={`${label}选择器`} value={value} onChange={event => onChange(event.target.value)} /><input type="text" aria-label={`${label}色值`} value={draft} maxLength={7} spellCheck={false} onChange={event => { setDraft(event.target.value); if (isHexColor(event.target.value)) onChange(event.target.value.toLowerCase()); }} onBlur={() => { if (!isHexColor(draft)) setDraft(value); }} onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }} /></label>;
}
export function ReaderAppearancePanel({ appearance, onChange, saved }: { appearance: ReaderAppearance; onChange: (appearance: ReaderAppearance) => void; saved: boolean }) {
  return <div className="reader-appearance" aria-label="阅读配色设置">
    <div className="reader-theme-presets" role="group" aria-label="页面配色预设">{READER_PRESETS.map(preset => <button key={preset.id} type="button" aria-pressed={appearance.preset === preset.id} onClick={() => onChange({ preset: preset.id, paper: preset.paper, ink: preset.ink, preserveColors: appearance.preserveColors })}><span style={{ background: preset.paper, color: preset.ink }}>Aa</span>{preset.label}</button>)}</div>
    <div className="reader-color-fields"><ColorField label="纸张" value={appearance.paper} onChange={paper => onChange({ ...appearance, preset: 'custom', paper })} /><ColorField label="文字" value={appearance.ink} onChange={ink => onChange({ ...appearance, preset: 'custom', ink })} /><label className="reader-preserve-colors"><input type="checkbox" checked={appearance.preserveColors} onChange={event => onChange({ ...appearance, preserveColors: event.target.checked })} />保留彩色区域</label></div>
    <p className="reader-color-help">只调整阅读显示，不改变 PDF 原文件。{appearance.preserveColors ? '黑白和灰色随配色调整，彩色区域保持原色。' : '整页按纸张色和文字色显示，包括扫描图像。'}<span role="status">{saved ? '配色已记住' : '设置仅在本次有效'}</span></p>
    {readerContrast(appearance.paper, appearance.ink) < 3 && <p className="reader-contrast-notice" role="status">纸张与文字颜色较接近，可以调深文字或换浅色纸张。</p>}
  </div>;
}
