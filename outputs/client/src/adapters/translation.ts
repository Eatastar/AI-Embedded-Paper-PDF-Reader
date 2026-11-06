import { translationPreferences, type TranslationPreferences } from '../domain/translation';
const KEY = 'ai-paper-reader.translation.v1';
interface PreferenceStorage { getItem: (key: string) => string | null; setItem: (key: string, value: string) => void }
export function loadTranslationPreferences(storage?: PreferenceStorage): TranslationPreferences {
  try { return translationPreferences(JSON.parse((storage || localStorage).getItem(KEY) || 'null')); }
  catch { return translationPreferences(null); }
}
export function saveTranslationPreferences(value: TranslationPreferences, storage?: PreferenceStorage): boolean {
  try { (storage || localStorage).setItem(KEY, JSON.stringify(translationPreferences(value))); return true; }
  catch { return false; }
}
