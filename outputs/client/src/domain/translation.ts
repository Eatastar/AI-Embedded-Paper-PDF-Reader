// @ts-expect-error Pure translation rules are shared with the native JavaScript server.
import { DEFAULT_TRANSLATION_PROMPT, TRANSLATION_TEXT_LIMIT, TRANSLATION_PROMPT_LIMIT } from '../../server/translation.mjs';
export { TRANSLATION_TEXT_LIMIT, TRANSLATION_PROMPT_LIMIT };

export interface TranslationShortcut { code: string; alt: boolean; ctrl: boolean; shift: boolean; meta: boolean }
export interface TranslationPreferences { profileId: string | null; targetLanguage: string; prompt: string; shortcut: TranslationShortcut }
export const DEFAULT_TRANSLATION_SHORTCUT: TranslationShortcut = { code: 'Digit1', alt: true, ctrl: false, shift: false, meta: false };
export const DEFAULT_TRANSLATION_PREFERENCES: TranslationPreferences = { profileId: null, targetLanguage: '简体中文', prompt: DEFAULT_TRANSLATION_PROMPT, shortcut: DEFAULT_TRANSLATION_SHORTCUT };
type KeyInput = { code: string; altKey: boolean; ctrlKey: boolean; shiftKey: boolean; metaKey: boolean; repeat?: boolean; isComposing?: boolean };
export function shortcutLabel(value: TranslationShortcut): string {
  const key = value.code.replace(/^Digit/, '').replace(/^Key/, '').replace(/^Numpad/, 'Num ');
  return [...(value.ctrl ? ['Ctrl'] : []), ...(value.alt ? ['Alt'] : []), ...(value.shift ? ['Shift'] : []), ...(value.meta ? ['⌘'] : []), key].join('+');
}
export function validTranslationShortcut(value: unknown): value is TranslationShortcut {
  if (!value || typeof value !== 'object') return false;
  const key = value as TranslationShortcut;
  if (['alt', 'ctrl', 'shift', 'meta'].some(field => typeof key[field as keyof TranslationShortcut] !== 'boolean')) return false;
  if (!/^(Digit[0-9]|Key[A-Z]|Numpad[0-9]|F[1-9]|F1[0-2])$/.test(key.code) || !(key.alt || key.ctrl || key.meta)) return false;
  // Preserve common editing, navigation, app-close and existing send shortcuts.
  if (key.code.startsWith('F')) return false;
  if ((key.ctrl || key.meta) && !key.alt && /^(Key[ABCDFHJKLNOPRSTUVWXYZ]|Digit[0-9])$/.test(key.code)) return false;
  return true;
}
export function shortcutFromEvent(event: KeyInput): TranslationShortcut | null {
  const key = { code: event.code, alt: event.altKey, ctrl: event.ctrlKey, shift: event.shiftKey, meta: event.metaKey };
  return !event.isComposing && !event.repeat && validTranslationShortcut(key) ? key : null;
}
export function matchesTranslationShortcut(event: KeyInput, key: TranslationShortcut): boolean {
  return !event.repeat && !event.isComposing && event.code === key.code && event.altKey === key.alt && event.ctrlKey === key.ctrl && event.shiftKey === key.shift && event.metaKey === key.meta;
}
export function translationPreferences(input: unknown): TranslationPreferences {
  const value = input && typeof input === 'object' ? input as Partial<TranslationPreferences> : {};
  return {
    profileId: typeof value.profileId === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(value.profileId) ? value.profileId : null,
    targetLanguage: typeof value.targetLanguage === 'string' && value.targetLanguage.trim() && value.targetLanguage.length <= 80 ? value.targetLanguage.trim() : DEFAULT_TRANSLATION_PREFERENCES.targetLanguage,
    prompt: typeof value.prompt === 'string' && value.prompt.trim() && value.prompt.length <= TRANSLATION_PROMPT_LIMIT ? value.prompt : DEFAULT_TRANSLATION_PREFERENCES.prompt,
    shortcut: validTranslationShortcut(value.shortcut) ? { ...value.shortcut } : { ...DEFAULT_TRANSLATION_SHORTCUT },
  };
}
