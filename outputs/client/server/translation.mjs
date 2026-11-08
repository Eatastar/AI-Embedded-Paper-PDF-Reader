export class TranslationError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

import { TRANSLATION_TEXT_LIMIT, TRANSLATION_PROMPT_LIMIT } from '../shared/translation.mjs';
export { TRANSLATION_TEXT_LIMIT, TRANSLATION_PROMPT_LIMIT, DEFAULT_TRANSLATION_PROMPT } from '../shared/translation.mjs';

/** Build the entire translation context here; caller-supplied history is forbidden. */
export function translationRequest(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TranslationError(400, '翻译请求格式不正确。');
  const allowed = new Set(['requestId', 'profileId', 'text', 'prompt', 'targetLanguage']);
  if (Object.keys(input).some(key => !allowed.has(key))) throw new TranslationError(400, '翻译只接受选中文字和翻译设置，不接受对话或文档上下文。');
  if (typeof input.profileId !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(input.profileId)) throw new TranslationError(400, '请先选择独立的翻译 API 连接。');
  if (typeof input.text !== 'string' || !input.text.trim()) throw new TranslationError(400, '请先选中需要翻译的文字。');
  if (input.text.length > TRANSLATION_TEXT_LIMIT) throw new TranslationError(400, '选中文字超过 20000 字符，请缩小选区后翻译；不会截断原文。');
  if (typeof input.prompt !== 'string' || !input.prompt.trim() || input.prompt.length > TRANSLATION_PROMPT_LIMIT) throw new TranslationError(400, '翻译提示词不能为空，且不能超过 16000 字符。');
  if (typeof input.targetLanguage !== 'string' || !input.targetLanguage.trim() || input.targetLanguage.length > 80) throw new TranslationError(400, '请填写不超过 80 字符的目标语言。');
  const language = input.targetLanguage.trim();
  const prompt = input.prompt.replaceAll('{targetLanguage}', language);
  return { kind: 'translation', profileId: input.profileId, messages: [
    { role: 'system', content: `${prompt}\n\n目标语言 / Target language: ${language}` },
    { role: 'user', content: input.text },
  ] };
}
