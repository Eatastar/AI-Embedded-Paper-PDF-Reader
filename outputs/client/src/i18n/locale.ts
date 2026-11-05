import { english } from './messages';

export type Locale = 'zh-CN' | 'en';
export const LOCALE_STORAGE_KEY = 'ai-paper-pdf-reader.ui-locale.v1';
type PreferenceStorage = Pick<Storage, 'getItem' | 'setItem'>;
export function isLocale(value: unknown): value is Locale { return value === 'zh-CN' || value === 'en'; }

/** This preference is separate from conversations, credentials and backup data. */
export function createLocaleStore(storage?: PreferenceStorage) {
  let locale: Locale = 'zh-CN';
  try { const saved = storage?.getItem(LOCALE_STORAGE_KEY); if (isLocale(saved)) locale = saved; } catch { /* Restricted storage: use the session. */ }
  const listeners = new Set<() => void>();
  return {
    get: () => locale,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    set(value: Locale) {
      if (!isLocale(value)) throw new Error('Unsupported interface language');
      let saved = false;
      try { if (storage) { storage.setItem(LOCALE_STORAGE_KEY, value); saved = true; } } catch { /* Keep the working session usable. */ }
      locale = value;
      listeners.forEach(listener => listener());
      return saved;
    },
  };
}
function browserStorage() { try { return typeof window === 'undefined' ? undefined : window.localStorage; } catch { return undefined; } }
export const localeStore = createLocaleStore(browserStorage());
export const getLocale = localeStore.get;
export const setLocale = localeStore.set;
function interpolate(message: string, values: readonly unknown[]) {
  return message.replace(/\{(\d+)\}/g, (token, index: string) => Number(index) < values.length ? String(values[Number(index)]) : token);
}
// Dynamic diagnostics keep filenames, provider messages and identifiers intact.
const patterns = Object.entries(english).filter(([key]) => /\{\d+\}/.test(key)).map(([key, translation]) => {
  const indexes: number[] = [];
  const parts = key.split(/(\{\d+\})/g).map(part => {
    if (/^\{\d+\}$/.test(part)) { indexes.push(Number(part.slice(1, -1))); return '([\\s\\S]*?)'; }
    return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  });
  return { key, translation, indexes, regexp: new RegExp('^' + parts.join('') + '$') };
}).sort((a, b) => b.key.length - a.key.length);
export function translate(source: string, locale: Locale, values: readonly unknown[] = []): string {
  if (locale === 'zh-CN') return interpolate(source, values);
  if (Object.prototype.hasOwnProperty.call(english, source)) return interpolate(english[source], values);
  if (!values.length) for (const pattern of patterns) {
    const match = pattern.regexp.exec(source);
    if (!match) continue;
    const captured: string[] = [];
    pattern.indexes.forEach((index, position) => {
      const raw = match[position + 1];
      // Only these application-owned wrappers contain another diagnostic.
      // Other interpolations can be filenames or quoted user text.
      captured[index] = index === 0 && (pattern.key === '{0}\n诊断编号：{1}' || pattern.key === '备份格式无效：{0}') ? translate(raw, locale) : raw;
    });
    return interpolate(pattern.translation, captured);
  }
  return interpolate(source, values);
}
export function t(source: string, values: readonly unknown[] = []): string { return translate(source, getLocale(), values); }
