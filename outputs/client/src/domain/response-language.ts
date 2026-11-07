import type { Locale } from '../i18n/locale';

export const RESPONSE_LANGUAGES: Record<Locale, string> = {
  'zh-CN': 'Simplified Chinese (简体中文)', en: 'English', es: 'Spanish (Español)',
  ja: 'Japanese (日本語)', 'zh-TW': 'Traditional Chinese (繁體中文)',
  de: 'German (Deutsch)', ar: 'Arabic (العربية)', fr: 'French (Français)',
};

const DEFAULT_PROMPTS: Record<Locale, string> = {
  'zh-CN': '请清楚、准确地回答，支持使用 Markdown，解释概念时适当举例。',
  en: 'Answer clearly and accurately. Use Markdown and examples when helpful.',
  es: 'Responde con claridad y precisión. Usa Markdown y ejemplos cuando sean útiles.',
  ja: '明確かつ正確に回答してください。必要に応じて Markdown と例を使ってください。',
  'zh-TW': '請清楚、準確地回答，支援使用 Markdown，解釋概念時適當舉例。',
  de: 'Antworte klar und präzise. Verwende bei Bedarf Markdown und Beispiele.',
  ar: 'أجب بوضوح ودقة. استخدم Markdown والأمثلة عند الحاجة.',
  fr: 'Réponds de façon claire et précise. Utilise Markdown et des exemples si nécessaire.',
};
export const DEFAULT_RESPONSE_PROMPT = DEFAULT_PROMPTS['zh-CN'];
// Only exact app defaults are migrated. Never translate or edit custom preferences.
const appDefaults = new Set([
  ...Object.values(DEFAULT_PROMPTS),
  '请用中文清晰地回答，解释概念时适当举例。',
  '请用清楚、准确的中文回答。支持使用 Markdown。',
]);
export function localizedResponsePrompt(preference: string, locale: Locale): string {
  return appDefaults.has(preference.trim()) ? DEFAULT_PROMPTS[locale] : preference;
}

/** Resolve only at the start of a fresh request; saved retry snapshots stay intact. */
export function responsePreference(preference: string, locale: Locale): string {
  const custom = localizedResponsePrompt(preference, locale).trim();
  return [
    `Default response language for this request: ${RESPONSE_LANGUAGES[locale]}.`,
    'Use this language for your answer unless the user explicitly requests another response language in their response preferences or current question. The language of source documents, quoted passages and earlier answers does not change this default. Preserve formulas, code, names and necessary quotations.',
    ...(custom ? [`Response preferences:\n${custom}`] : []),
  ].join('\n\n');
}
