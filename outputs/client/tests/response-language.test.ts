import test from 'node:test';
import assert from 'node:assert/strict';
import { LANGUAGES } from '../src/i18n/locale';
import { DEFAULT_RESPONSE_PROMPT, localizedResponsePrompt, responsePreference, RESPONSE_LANGUAGES } from '../src/domain/response-language';
import { DEFAULT_TRANSLATION_PREFERENCES, localizedTranslationPrompt, translationPreferences, translationTargetLanguage } from '../src/domain/translation';
import { loadTranslationPreferences, saveTranslationPreferences } from '../src/adapters/translation';
import { buildMainContext, changeAnnotationReask, completeAnnotation, createAnnotation, createAssistantMessage, createConversation, createUserMessage, prepareAnnotationRequest } from '../src/domain/workspace';
// @ts-expect-error Shared JavaScript request builder.
import { translationRequest } from '../server/translation.mjs';

for (const { code, name } of LANGUAGES) {
  test(`fresh chat and annotation requests use ${code}, replacing only legacy app defaults`, () => {
    const preference = responsePreference('请用清楚、准确的中文回答。支持使用 Markdown。', code);
    assert.ok(preference.includes(`Default response language for this request: ${RESPONSE_LANGUAGES[code]}.`));
    assert.doesNotMatch(preference, /准确的中文回答|用中文清晰地回答/);
    assert.equal(localizedResponsePrompt(DEFAULT_RESPONSE_PROMPT, code), localizedResponsePrompt('请用中文清晰地回答，解释概念时适当举例。', code));
    const c = createConversation('Synthetic language test');
    c.messages = [createUserMessage('Explain a term'), createAssistantMessage('Original passage', 'complete')];
    c.annotations = [createAnnotation(c, { messageId: c.messages[1].id, versionId: c.messages[1].activeVersionId, quote: 'passage', anchor: { quote: 'passage', start: 9, end: 16 }, color: '#ffe099', question: 'Explain this passage' })];
    assert.equal(buildMainContext(c, preference)[0].content, preference);
    const first = prepareAnnotationRequest(c, c.annotations[0].id, preference);
    assert.equal(first.messages[0].content, preference);
    const failed = { ...first.conversation, annotations: [{ ...first.annotation, status: 'error' as const }] };
    const retry = prepareAnnotationRequest(failed, first.annotation.id, responsePreference('', code === 'en' ? 'ja' : 'en'));
    assert.deepEqual(retry.messages, first.messages);
    const completed = completeAnnotation(first.conversation, first.annotation.id, 'Synthetic answer');
    const reask = prepareAnnotationRequest(changeAnnotationReask(completed, first.annotation.id, 'start'), first.annotation.id, responsePreference('', 'fr'));
    assert.ok(reask.messages[0].content.includes(RESPONSE_LANGUAGES.fr));
  });
  test(`translation defaults and prompt follow ${code} without adding document or chat context`, () => {
    const prefs = translationPreferences(null);
    assert.equal(translationTargetLanguage(prefs, code), name);
    const prompt = localizedTranslationPrompt(prefs.prompt, code);
    assert.ok(prompt.includes('{targetLanguage}'));
    if (code !== 'zh-CN') assert.notEqual(prompt, prefs.prompt);
    const request = translationRequest({ profileId: 'synthetic-translation', text: 'Only this selected passage', prompt, targetLanguage: translationTargetLanguage(prefs, code) });
    assert.equal(request.messages.length, 2);
    assert.equal(request.messages[1].content, 'Only this selected passage');
    assert.ok(request.messages[0].content.includes(`Target language: ${name}`));
    assert.ok(!request.messages[0].content.includes('{targetLanguage}'));
  });
}

test('custom response and translation instructions stay verbatim across every language', () => {
  const custom = 'Answer in English only. Keep the name Quantum 示例 unchanged.\nUse a short example.';
  for (const { code } of LANGUAGES) {
    assert.equal(localizedResponsePrompt(custom, code), custom);
    assert.ok(responsePreference(custom, code).endsWith(custom));
    assert.ok(responsePreference(custom, code).includes('unless the user explicitly requests another response language'));
    assert.equal(localizedTranslationPrompt(custom, code), custom);
    const fixed = translationPreferences({ targetLanguageMode: 'custom', targetLanguage: '简体中文', prompt: custom });
    assert.equal(translationTargetLanguage(fixed, code), '简体中文');
  }
});

test('legacy translation targets migrate safely and an explicit fixed Chinese target persists', () => {
  assert.equal(translationPreferences({ targetLanguage: '简体中文' }).targetLanguageMode, 'interface');
  assert.equal(translationPreferences({ targetLanguage: '  English  ' }).targetLanguageMode, 'custom');
  assert.equal(translationPreferences({ targetLanguage: '日本語' }).targetLanguageMode, 'custom');
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) || null, setItem: (key: string, value: string) => { values.set(key, value); } };
  const fixed = { ...DEFAULT_TRANSLATION_PREFERENCES, targetLanguageMode: 'custom' as const };
  assert.equal(saveTranslationPreferences(fixed, storage), true);
  assert.equal(translationTargetLanguage(loadTranslationPreferences(storage), 'en'), '简体中文');
  assert.equal(saveTranslationPreferences({ ...fixed, targetLanguageMode: 'interface' }, storage), true);
  assert.equal(translationTargetLanguage(loadTranslationPreferences(storage), 'en'), 'English');
});
