import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Copy, GripHorizontal, Languages, Pin, RefreshCw, X } from 'lucide-react';
import { t } from '../i18n/locale';
import { useLocale } from '../i18n/react';
import type { ModelSettings, ProfileInput } from '../domain/types';
import { DEFAULT_TRANSLATION_PREFERENCES, DEFAULT_TRANSLATION_SHORTCUT, shortcutFromEvent, shortcutLabel, TRANSLATION_TEXT_LIMIT, TRANSLATION_PROMPT_LIMIT } from '../domain/translation';
import type { TranslationPreferences } from '../domain/translation';
import { loadTranslationPreferences, saveTranslationPreferences } from '../adapters/translation';
import { streamTranslation } from '../adapters/model';
import type { TranslationRequest } from '../adapters/model';
import { SettingsDialog } from './SettingsDialog';
import { NativeSelect } from './NativeSelect';
import { MovableAnnotationPopup } from './MovableAnnotationPopup';
import { MathMarkdown } from './MathMarkdown';
import './translation.css';

export interface TranslationSelection {
  sourceKey: string; text: string; element: HTMLElement; rect: DOMRect; style?: CSSProperties;
  save: (text: string, model: string) => void;
}
interface Result { id: number; source: TranslationSelection; request: TranslationRequest; text: string; model: string; status: 'streaming' | 'complete' | 'error'; error?: string }
interface TranslationActions { preferences: TranslationPreferences; sourceKey: string | null; translate: (source: TranslationSelection) => void; releaseSource: (key: string) => void; openSettings: () => void; enabled: boolean }
const TranslationContext = createContext<TranslationActions | null>(null);
export const useTranslation = () => useContext(TranslationContext);

export function TranslationButton() {
  useLocale();
  const actions = useTranslation();
  if (!actions) return null;
  return <button type="button" className="document-tool-button translation-trigger" aria-label={t('划词翻译设置')} title={`${t('划词翻译')} · ${shortcutLabel(actions.preferences.shortcut)}`} onClick={actions.openSettings}><Languages size={17} /><span>{t('翻译')}</span></button>;
}

export function TranslationProvider({ settings, scope, enabled, onSaveProfile, onDeleteProfile, onNotify, children }: {
  settings: ModelSettings; scope: string; enabled: boolean; onSaveProfile: (input: ProfileInput) => Promise<ModelSettings>; onDeleteProfile: (id: string) => Promise<void>; onNotify: (message: string) => void; children: ReactNode;
}) {
  useLocale();
  const [preferences, setPreferences] = useState(loadTranslationPreferences);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [position, setPosition] = useState<CSSProperties>({});
  const [manualCopy, setManualCopy] = useState(false);
  const popup = useRef<HTMLDivElement>(null), controller = useRef<AbortController | null>(null), sequence = useRef(0), resultRef = useRef(result);
  resultRef.current = result;
  const settingsRef = useRef(settings); settingsRef.current = settings;
  const preferencesRef = useRef(preferences); preferencesRef.current = preferences;
  const enabledRef = useRef(enabled); enabledRef.current = enabled;
  const dismiss = useCallback(() => { ++sequence.current; controller.current?.abort(); controller.current = null; resultRef.current = null; setResult(null); setManualCopy(false); }, []);
  useEffect(() => { dismiss(); }, [scope, enabled, dismiss]);
  useEffect(() => { document.addEventListener('learn:close-translations', dismiss); return () => { document.removeEventListener('learn:close-translations', dismiss); controller.current?.abort(); }; }, [dismiss]);
  const changePreferences = (value: TranslationPreferences) => {
    preferencesRef.current = value; setPreferences(value);
    if (!saveTranslationPreferences(value)) onNotify('翻译设置仅在本次运行有效。');
  };
  const run = useCallback(async (source: TranslationSelection, frozen?: TranslationRequest) => {
    if (!enabledRef.current || !source.element.isConnected) return;
    const prefs = preferencesRef.current;
    if (!source.text.trim()) return;
    if (source.text.length > TRANSLATION_TEXT_LIMIT) { onNotify('选中文字超过 20000 字符，请缩小选区后翻译；不会截断原文。'); return; }
    const profileId = frozen?.profileId || prefs.profileId;
    const profile = settingsRef.current.profiles.find(item => item.id === profileId);
    if (!profile) { dismiss(); setSettingsOpen(true); onNotify('请先选择独立的翻译 API 连接。'); return; }
    controller.current?.abort(); const current = new AbortController(); controller.current = current;
    const id = ++sequence.current;
    const request = frozen || { profileId: profile.id, text: source.text, prompt: prefs.prompt, targetLanguage: prefs.targetLanguage };
    const initial: Result = { id, source, request, text: '', model: profile.model, status: 'streaming' };
    resultRef.current = initial; setResult(initial); setManualCopy(false);
    let text = '';
    try {
      const completion = await streamTranslation(request, delta => {
        if (id !== sequence.current || current.signal.aborted) return;
        text += delta;
        if (text.length > 100000) throw new Error('译文过长，请缩小选区后重试。');
        setResult(value => value?.id === id ? { ...value, text } : value);
      }, current.signal);
      if (!text.trim()) throw new Error('模型没有返回译文，请重试或检查翻译模型。');
      if (id === sequence.current && !current.signal.aborted) setResult(value => value?.id === id ? { ...value, text, model: completion.modelLabel, status: 'complete' } : value);
    } catch (error) {
      if (id === sequence.current && !current.signal.aborted) setResult(value => value?.id === id ? { ...value, status: 'error', error: error instanceof Error ? error.message : '翻译未完成，请重试。' } : value);
    } finally { if (controller.current === current) controller.current = null; }
  }, [dismiss, onNotify]);
  const releaseSource = useCallback((key: string) => { if (resultRef.current?.source.sourceKey === key) dismiss(); }, [dismiss]);
  const openSettings = useCallback(() => { dismiss(); setSettingsOpen(true); }, [dismiss]);
  useEffect(() => {
    if (!result) return;
    let outsidePress: { id: number; x: number; y: number; moved: boolean } | null = null;
    const onScrollbar = (event: PointerEvent) => {
      if (!(event.target instanceof HTMLElement)) return false;
      const element = event.target, rect = element.getBoundingClientRect();
      return (element.scrollHeight > element.clientHeight && (event.clientX < rect.left + element.clientLeft || event.clientX >= rect.left + element.clientLeft + element.clientWidth))
        || (element.scrollWidth > element.clientWidth && (event.clientY < rect.top + element.clientTop || event.clientY >= rect.top + element.clientTop + element.clientHeight));
    };
    // Dismiss genuine outside clicks, not scrollbar drags or touch scrolling.
    const down = (event: PointerEvent) => {
      outsidePress = event.button === 0 && event.target instanceof Node && !popup.current?.contains(event.target) && !onScrollbar(event) ? { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false } : null;
    };
    const move = (event: PointerEvent) => { if (outsidePress?.id === event.pointerId && Math.hypot(event.clientX - outsidePress.x, event.clientY - outsidePress.y) >= 6) outsidePress.moved = true; };
    const up = (event: PointerEvent) => {
      const press = outsidePress; outsidePress = null;
      if (press?.id === event.pointerId && !press.moved && Math.hypot(event.clientX - press.x, event.clientY - press.y) < 6 && !onScrollbar(event) && event.target instanceof Node && !popup.current?.contains(event.target)) dismiss();
    };
    const cancel = () => { outsidePress = null; };
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape' && !document.querySelector('dialog[open]')) { event.preventDefault(); dismiss(); } };
    document.addEventListener('pointerdown', down); document.addEventListener('pointermove', move); document.addEventListener('pointerup', up); document.addEventListener('pointercancel', cancel); document.addEventListener('keydown', key);
    return () => { document.removeEventListener('pointerdown', down); document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', up); document.removeEventListener('pointercancel', cancel); document.removeEventListener('keydown', key); };
  }, [result?.id, dismiss]);
  useLayoutEffect(() => {
    if (!result) return;
    const place = () => {
      const width = Math.min(390, window.innerWidth - 24), height = Math.min(popup.current?.offsetHeight || 220, window.innerHeight - 32);
      const rect = result.source.rect;
      const right = rect.right + 14, left = rect.left - width - 14;
      const x = right + width <= window.innerWidth - 12 ? right : left >= 12 ? left : Math.min(window.innerWidth - width - 12, Math.max(12, rect.left));
      const y = right + width <= window.innerWidth - 12 || left >= 12 ? rect.top - 8 : rect.bottom + 12;
      setPosition({ width, maxHeight: window.innerHeight - 32, left: x, top: Math.max(16, Math.min(y, window.innerHeight - height - 16)) });
    };
    place(); const observer = new ResizeObserver(place); if (popup.current) observer.observe(popup.current);
    window.addEventListener('resize', place);
    return () => { observer.disconnect(); window.removeEventListener('resize', place); };
  }, [result?.id]);
  const sourceKey = result?.source.sourceKey ?? null;
  const value = useMemo(() => ({ preferences, sourceKey, translate: (source: TranslationSelection) => { void run(source); }, releaseSource, openSettings, enabled: enabled && !settingsOpen }), [preferences, sourceKey, run, releaseSource, openSettings, enabled, settingsOpen]);
  return <TranslationContext.Provider value={value}>{children}
    {settingsOpen && <TranslationSettings settings={settings} value={preferences} onSave={changePreferences} onClose={() => setSettingsOpen(false)} onSaveProfile={onSaveProfile} onDeleteProfile={onDeleteProfile} />}
    {result && createPortal(<MovableAnnotationPopup key={result.id} popupRef={popup} style={{ ...result.source.style, ...position }}><section className="annotation-card translation-result" role="dialog" aria-label={t('临时译文')} data-testid="translation-result">
      <header className="annotation-card-header" tabIndex={0} aria-label={t('拖动翻译面板')}><div className="translation-model"><GripHorizontal size={14} /><span title={result.model}>{result.model}</span></div><div className="annotation-card-header-actions">
        <button type="button" className="annotation-icon-button" aria-label={t('复制译文')} title={t('复制译文')} disabled={!result.text || result.status !== 'complete'} onClick={() => { void navigator.clipboard?.writeText(result.text).then(() => onNotify('译文已复制。')).catch(() => setManualCopy(true)); if (!navigator.clipboard) setManualCopy(true); }}><Copy size={15} /></button>
        <button type="button" className="annotation-icon-button" aria-label={t('保留为普通批注')} title={t('保留为普通批注')} disabled={result.status !== 'complete'} onClick={() => {
          if (resultRef.current?.id !== result.id || !result.source.element.isConnected) return;
          try { result.source.save(result.text, result.model); dismiss(); onNotify('译文已保留为普通批注。'); }
          catch (error) { onNotify(error instanceof Error ? error.message : '无法保留译文，请重试。'); }
        }}><Pin size={15} /></button>
        <button type="button" className="annotation-icon-button" aria-label={t('关闭翻译')} onClick={dismiss}><X size={17} /></button>
      </div></header>
      <div className="annotation-card-scroll" aria-live="polite" aria-busy={result.status === 'streaming'}>
        {result.text && <MathMarkdown streaming={result.status === 'streaming'}>{result.text}</MathMarkdown>}
        {result.status === 'streaming' && !result.text && <p className="annotation-waiting">{t('正在翻译…')}</p>}
        {result.status === 'error' && <div className="annotation-error" role="alert"><p>{t(result.error || '翻译未完成，请重试。')}</p><button type="button" className="annotation-text-button" onClick={() => void run(result.source, result.request)}><RefreshCw size={13} />{t('重试翻译')}</button><button type="button" className="annotation-text-button" onClick={openSettings}>{t('翻译设置')}</button></div>}
        {manualCopy && <textarea className="annotation-textarea" aria-label={t('待复制译文')} readOnly value={result.text} ref={element => { element?.focus(); element?.select(); }} />}
      </div>
    </section></MovableAnnotationPopup>, document.body)}
  </TranslationContext.Provider>;
}

function TranslationSettings({ settings, value, onSave, onClose, onSaveProfile, onDeleteProfile }: {
  settings: ModelSettings; value: TranslationPreferences; onSave: (value: TranslationPreferences) => void; onClose: () => void; onSaveProfile: (value: ProfileInput) => Promise<ModelSettings>; onDeleteProfile: (id: string) => Promise<void>;
}) {
  useLocale();
  const [readerStyle] = useState(() => {
    const reader = document.querySelector('.document-reader');
    if (!reader) return {};
    const computed = getComputedStyle(reader);
    return Object.fromEntries(['paper', 'panel', 'surface', 'code', 'hover', 'border', 'border-strong', 'text', 'ink', 'muted', 'accent', 'focus', 'danger'].map(key => [`--ls-${key}`, computed.getPropertyValue(`--ls-${key}`)])) as CSSProperties;
  });
  const dialog = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState(value), [recording, setRecording] = useState(false), [error, setError] = useState('');
  const [manage, setManage] = useState<{ profileId: string | null | undefined } | null>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);
  const selected = settings.profiles.find(profile => profile.id === draft.profileId);
  return <><dialog ref={dialog} className="settings-dialog translation-settings" style={readerStyle} aria-labelledby="translation-settings-title" onCancel={onClose}>
    <header className="dialog-header"><div><span className="eyebrow">QUICK TRANSLATION</span><h2 id="translation-settings-title">{t('划词翻译')}</h2><p className="profile-dialog-intro">{t('选中文字后右键翻译，或直接按快捷键。译文只在保留后成为普通批注。')}</p></div><button type="button" className="icon-button" aria-label={t('关闭翻译设置')} onClick={onClose}><X size={20} /></button></header>
    <form onSubmit={event => { event.preventDefault(); if (!draft.prompt.trim() || !draft.targetLanguage.trim()) { setError('目标语言和翻译提示词不能为空。'); return; } onSave(draft); onClose(); }}>
      <label className="field-label">{t('翻译 API / 模型')}<NativeSelect value={selected?.id || ''} onChange={event => setDraft({ ...draft, profileId: event.target.value || null })}><option value="">{draft.profileId && !selected ? t('原翻译连接已删除，请重新选择') : t('请选择独立的翻译连接') }</option>{settings.profiles.map(profile => <option key={profile.id} value={profile.id}>{profile.name} · {profile.model}</option>)}</NativeSelect></label>
      <div className="translation-connection-actions"><button type="button" className="document-tool-button" onClick={() => setManage({ profileId: null })}>{t('新建共享 API 连接')}</button><button type="button" className="document-tool-button" disabled={!settings.profiles.length} onClick={() => setManage({ profileId: draft.profileId ?? undefined })}>{t('管理共享连接')}</button></div>
      <p className="field-help">{t('连接与聊天、批注共用；此处选择只改变翻译模型，不切换聊天模型。')}</p>
      <label className="field-label">{t('目标语言')}<input className="field-input" list="translation-languages" value={draft.targetLanguage} maxLength={80} required onChange={event => setDraft({ ...draft, targetLanguage: event.target.value })} /><datalist id="translation-languages"><option value="简体中文" /><option value="English" /></datalist></label>
      <p className="field-help">{t('自动识别原文语言；也可填写其他目标语言，与界面语言分开。')}</p>
      <label className="field-label">{t('翻译快捷键')}<input className="field-input translation-shortcut" aria-label={t('翻译快捷键')} readOnly value={recording ? t('请按组合键…') : shortcutLabel(draft.shortcut)} onClick={() => { setRecording(true); setError(''); }} onBlur={() => setRecording(false)} onKeyDown={event => {
        if (event.key === 'Tab') { setRecording(false); return; }
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setRecording(false); return; }
        event.preventDefault(); event.stopPropagation(); setRecording(true);
        if (['Alt', 'Control', 'Meta', 'Shift'].includes(event.key)) return;
        const shortcut = shortcutFromEvent(event);
        if (!shortcut) { setError('此组合键与常用操作冲突，请使用 Alt、Ctrl 或 ⌘ 加字母或数字。'); return; }
        setDraft({ ...draft, shortcut }); setRecording(false); setError('');
      }} /></label>
      <button type="button" className="profile-text-button" onClick={() => { setDraft({ ...draft, shortcut: { ...DEFAULT_TRANSLATION_SHORTCUT } }); setRecording(false); setError(''); }}>{t('恢复 Alt+1')}</button>
      <p className="field-help">{t('快捷键仅在程序内选中正文时生效，不影响输入框。')}</p>
      <label className="field-label">{t('翻译提示词')}<textarea className="field-input" rows={5} value={draft.prompt} maxLength={TRANSLATION_PROMPT_LIMIT} required onChange={event => setDraft({ ...draft, prompt: event.target.value })} /></label>
      <button type="button" className="profile-text-button" onClick={() => setDraft({ ...draft, prompt: DEFAULT_TRANSLATION_PREFERENCES.prompt })}>{t('恢复默认提示词')}</button>
      <p className="field-help">{t('可用 {targetLanguage} 表示目标语言。只发送选中文字和翻译提示词，不发送全文、所在页或聊天历史。')}</p>
      <p className="field-help">{t('译文关闭即丢弃，不进入聊天、批注列表或备份；点击保留后按普通批注保存。')}</p>
      {error && <p className="form-error" role="alert">{t(error)}</p>}
      <footer className="dialog-footer"><button type="button" className="profile-text-button" onClick={onClose}>{t('取消')}</button><button type="submit" className="primary-button">{t('保存翻译设置')}</button></footer>
    </form>
  </dialog>
  {manage && <SettingsDialog settings={settings} style={readerStyle} purpose="translation" initialProfileId={manage.profileId} onClose={() => setManage(null)} onDeleteProfile={onDeleteProfile} onSelectProfile={async id => { if (id) setDraft(current => ({ ...current, profileId: id })); }} onSaveProfile={async input => {
    const before = new Set(settings.profiles.map(profile => profile.id));
    const next = await onSaveProfile({ ...input, activate: false });
    const id = input.id || next.profiles.find(profile => !before.has(profile.id))?.id;
    if (id) setDraft(current => ({ ...current, profileId: id }));
  }} />}
  </>;
}
