import assert from 'node:assert/strict';
import test from 'node:test';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
// @ts-expect-error Native server exercised through HTTP.
import { createAppServer } from '../server/app.mjs';
import { DEFAULT_TRANSLATION_PREFERENCES, DEFAULT_TRANSLATION_SHORTCUT, matchesTranslationShortcut, shortcutFromEvent, shortcutLabel, translationPreferences } from '../src/domain/translation';
import { loadTranslationPreferences, saveTranslationPreferences } from '../src/adapters/translation';

const post = (base: string, path: string, data: unknown) => fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
const sse = (data: unknown) => `data: ${JSON.stringify(data)}\n\n`;

for (const format of ['openai-chat', 'openai-responses', 'anthropic-messages'] as const) test(`translation ${format} sends only selection/prompt with its own credentials and leaves chat selection intact`, async () => {
  const calls: { url: string; body: unknown; headers: Headers }[] = [], logs: unknown[] = [];
  const server: Server = createAppServer({ env: {}, onRequestLog: (record: unknown) => logs.push(record), fetch: async (url: string, init: RequestInit) => {
    calls.push({ url: String(url), body: JSON.parse(String(init.body)), headers: new Headers(init.headers) });
    const content = format === 'openai-chat' ? sse({ id: 'mock-translation', object: 'chat.completion.chunk', created: 1, model: 'translation-model', choices: [{ index: 0, delta: { content: '对应译文' }, finish_reason: null }] }) + sse({ id: 'mock-translation', object: 'chat.completion.chunk', created: 1, model: 'translation-model', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] }) + 'data: [DONE]\n\n'
      : format === 'openai-responses' ? sse({ type: 'response.output_text.delta', delta: '对应译文' }) + sse({ type: 'response.completed', response: { status: 'completed' } })
        : sse({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: '对应译文' } }) + sse({ type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 4 } }) + sse({ type: 'message_stop' });
    return new Response(content, { headers: { 'Content-Type': 'text/event-stream' } });
  } });
  server.listen(0, '127.0.0.1'); await once(server, 'listening'); const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    const chat = await (await post(base, '/api/profiles', { name: 'Mock chat', apiFormat: 'openai-chat', baseURL: 'https://chat.example/v1', model: 'chat-model', systemPrompt: 'PRIVATE_CHAT_STYLE', apiKey: 'fake-chat-key' })).json();
    const profiles = await (await post(base, '/api/profiles', { name: 'Mock translation', apiFormat: format, baseURL: 'https://translation.example/v1', model: 'translation-model', systemPrompt: 'UNRELATED_PROFILE_STYLE', apiKey: 'fake-translation-key', activate: false })).json();
    assert.equal(profiles.activeProfileId, chat.activeProfileId);
    const translationId = profiles.profiles.find((p: { name: string }) => p.name === 'Mock translation').id;
    const selection = 'Selected text only.\n$x^2$ [1]';
    const response = await post(base, '/api/translate', { profileId: translationId, text: selection, prompt: '仅译为{targetLanguage}，保留公式。', targetLanguage: 'English' });
    assert.equal(response.status, 200); const result = await response.text();
    assert.match(result, /对应译文/); assert.match(result, /"modelLabel":"translation-model"/); assert.match(result, /"type":"done"/);
    assert.equal(calls.length, 1); assert.match(calls[0].url, /^https:\/\/translation.example\/v1\//);
    const serialized = JSON.stringify(calls[0].body);
    assert.match(serialized, /Selected text only/); assert.match(serialized, /仅译为English/);
    assert.doesNotMatch(serialized, /PRIVATE_CHAT_STYLE|UNRELATED_PROFILE_STYLE|chat-model/);
    const headers = calls[0].headers;
    assert.equal(format === 'anthropic-messages' ? headers.get('x-api-key') : headers.get('authorization'), format === 'anthropic-messages' ? 'fake-translation-key' : 'Bearer fake-translation-key');
    const payload = calls[0].body as { messages?: { role: string; content: unknown }[]; input?: { role: string; content: string }[]; system?: string };
    const messages = payload.messages || payload.input!;
    assert.equal(messages.filter(message => message.role === 'user').length, 1);
    assert.ok(JSON.stringify(messages.find(message => message.role === 'user')?.content).includes('Selected text only.'));
    assert.equal((await (await fetch(base + '/api/settings')).json()).activeProfileId, chat.activeProfileId);
    assert.equal((logs[0] as { kind: string }).kind, 'translation'); assert.doesNotMatch(JSON.stringify(logs), /Selected text|fake-translation-key|仅译为|对应译文/);
    for (const invalid of [
      { profileId: null }, { profileId: 'missing-profile' }, { messages: [{ role: 'user', content: 'whole-paper-secret' }] }, { text: 'x'.repeat(20001) }, { prompt: '' }, { targetLanguage: '' },
    ]) {
      const failed = await post(base, '/api/translate', { profileId: translationId, text: selection, prompt: 'Translate', targetLanguage: 'English', ...invalid });
      assert.ok([400, 404].includes(failed.status)); await failed.text();
    }
    assert.equal(calls.length, 1, 'Invalid requests do not fall back to chat or contact any upstream');
  } finally { server.closeAllConnections(); server.close(); await once(server, 'close'); }
});

test('translation shortcut defaults to Alt+1 and ignores repeat, composition and mismatched modifiers', () => {
  const event = { code: 'Digit1', altKey: true, ctrlKey: false, shiftKey: false, metaKey: false };
  assert.equal(shortcutLabel(DEFAULT_TRANSLATION_SHORTCUT), 'Alt+1');
  assert.equal(matchesTranslationShortcut(event, DEFAULT_TRANSLATION_SHORTCUT), true);
  for (const change of [{ repeat: true }, { isComposing: true }, { ctrlKey: true }, { altKey: false }, { code: 'Digit2' }]) assert.equal(matchesTranslationShortcut({ ...event, ...change }, DEFAULT_TRANSLATION_SHORTCUT), false);
  assert.equal(shortcutFromEvent({ ...event, code: 'KeyC', altKey: false, ctrlKey: true }), null);
  assert.equal(shortcutFromEvent({ ...event, code: 'F4' }), null);
  assert.equal(shortcutFromEvent({ ...event, altKey: false }), null);
  assert.equal(shortcutLabel(shortcutFromEvent({ ...event, code: 'KeyT', ctrlKey: true })!), 'Ctrl+Alt+T');
});

test('translation preferences persist only approved settings, never selected text/results or credentials', () => {
  const values = new Map([['margin-chat-workspace', 'unchanged']]);
  const storage = { getItem: (key: string) => values.get(key) || null, setItem: (key: string, value: string) => { values.set(key, value); } };
  const input = { ...DEFAULT_TRANSLATION_PREFERENCES, profileId: 'test-profile', targetLanguage: 'English', prompt: '自定义：{targetLanguage}', text: 'private selected passage', answer: 'private translation', apiKey: 'fake-test-key' };
  assert.equal(saveTranslationPreferences(input, storage), true); assert.deepEqual(loadTranslationPreferences(storage), translationPreferences(input));
  assert.equal(values.get('margin-chat-workspace'), 'unchanged');
  assert.doesNotMatch(JSON.stringify([...values]), /private selected passage|private translation|fake-test-key/);
  assert.deepEqual(loadTranslationPreferences({ getItem: () => '{broken', setItem() {} }), DEFAULT_TRANSLATION_PREFERENCES);
  assert.deepEqual(loadTranslationPreferences({ getItem() { throw Error('denied'); }, setItem() {} }), DEFAULT_TRANSLATION_PREFERENCES);
  assert.equal(saveTranslationPreferences(input, { getItem: () => null, setItem() { throw Error('full'); } }), false);
});
