import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
// @ts-expect-error Native local server modules are verified through their public API.
import { validateImageInput, imageMessages, friendlyImageError } from '../server/vision.mjs';
// @ts-expect-error Native local server module.
import { streamProtocolReply } from '../server/protocols.mjs';
// @ts-expect-error Native local server module.
import { createAppServer } from '../server/app.mjs';
import { syntheticImages } from './figure-fixtures';

const messages = [{ role: 'system', content: 'STYLE' }, { role: 'user', content: 'DOCUMENT_TEXT' }, { role: 'user', content: 'FIGURE_QUESTION' }];
for (const [mime, image] of Object.entries(syntheticImages)) test(`inline ${mime} image validates actual dimensions without fetching a URL`, () => assert.deepEqual(validateImageInput(image), image));
test('image wire validation rejects remote URLs, MIME lies, size mismatches, and main-chat covert images', () => {
  assert.throws(() => validateImageInput({ dataURL: 'https://example.invalid/personal.png', width: 4, height: 3 }));
  assert.throws(() => validateImageInput({ ...syntheticImages.png, width: 8 }));
  assert.throws(() => validateImageInput({ ...syntheticImages.png, dataURL: syntheticImages.png.dataURL.replace('image/png', 'image/jpeg') }));
  assert.throws(() => validateImageInput({ ...syntheticImages.png, extraImage: syntheticImages.jpeg }));
  assert.throws(() => validateImageInput({ dataURL: 'data:image/png;base64,' + 'A'.repeat(1_400_000), width: 4, height: 3 }));
});
const streams: Record<string, string> = {
  'openai-chat': 'data: {"choices":[{"delta":{"content":"Image answer"}}]}\n\ndata: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n',
  'openai-responses': 'data: {"type":"response.output_text.delta","delta":"Image answer"}\n\ndata: {"type":"response.completed","response":{"status":"completed"}}\n\n',
  'anthropic-messages': 'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Image answer"}}\n\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn"}}\n\ndata: {"type":"message_stop"}\n\n',
};
for (const format of Object.keys(streams)) test(`${format} places one image only in the explicit final user question`, async () => {
  const original = structuredClone(messages); let result = '', seen: any;
  await streamProtocolReply({ apiFormat: format, baseURL: 'https://example.invalid/v1', model: 'synthetic-vision', apiKey: 'fake-test-key', messages, image: syntheticImages.png, onText: (chunk: string) => { result += chunk; }, fetch: async (_url: string, options: RequestInit) => { seen = JSON.parse(options.body as string); return new Response(streams[format], { headers: { 'content-type': 'text/event-stream' } }); } });
  assert.equal(result, 'Image answer'); assert.deepEqual(messages, original);
  const input = format === 'openai-responses' ? seen.input : seen.messages;
  const last = input.at(-1).content; assert.ok(Array.isArray(last));
  if (format === 'openai-chat') assert.equal(last[1].image_url.url, syntheticImages.png.dataURL);
  else if (format === 'openai-responses') assert.equal(last[1].image_url, syntheticImages.png.dataURL);
  else { assert.equal(last[0].source.media_type, 'image/png'); assert.equal(last[0].source.data, syntheticImages.png.dataURL.split(',')[1]); }
  assert.equal(input.filter((message: any) => Array.isArray(message.content)).length, 1);
});
test('generic 400, auth, and network errors are never blindly classified as image unsupported', () => {
  const fallback = 'SAFE_FALLBACK';
  assert.equal(friendlyImageError({ statusCode: 401, responseBody: 'image inputs are not supported' }, fallback), fallback);
  assert.equal(friendlyImageError({ code: 'ECONNREFUSED', message: 'PRIVATE_RESPONSE' }, fallback), fallback);
  assert.ok(friendlyImageError({ statusCode: 400, responseBody: 'invalid parameter; PRIVATE_RESPONSE' }, fallback).includes('暂时无法确认'));
  assert.ok(friendlyImageError({ statusCode: 400, upstreamError: { error: { code: 'image_input_not_supported' } } }, fallback).includes('明确拒绝'));
});
test('real local image endpoint transports pixels, blocks known text-only models and keeps diagnostics free of image bytes', async t => {
  let calls = 0, reject = false; const records: unknown[] = [];
  const server = createAppServer({ env: {}, demoDuration: 0, onRequestLog: (record: unknown) => records.push(record), fetch: async (_url: string, options: RequestInit) => { calls++; const body = JSON.parse(options.body as string); assert.equal(body.messages.at(-1).content[1].image_url.url, syntheticImages.png.dataURL); return reject ? new Response(JSON.stringify({ error: { code: 'image_input_not_supported', message: 'PRIVATE_PROVIDER_RESPONSE' } }), { status: 400 }) : new Response(streams['openai-chat']); } });
  server.listen(0, '127.0.0.1'); await once(server, 'listening'); t.after(() => new Promise<void>(resolve => server.close(() => resolve())));
  const address = `http://127.0.0.1:${server.address().port}`;
  const post = (path: string, body: unknown) => fetch(address + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const settings = await post('/api/profiles', { name: 'Synthetic vision', apiFormat: 'openai-chat', baseURL: 'https://example.invalid/v1', model: 'synthetic-vision', apiKey: 'fake-test-key', systemPrompt: '', activate: true }); assert.equal(settings.status, 200);
  const profile = (await settings.json()).profiles[0];
  const request = { kind: 'annotation', quote: 'Synthetic figure region', messages, image: syntheticImages.png, profileId: profile.id };
  let response = await post('/api/chat', request); assert.ok((await response.text()).includes('Image answer')); assert.equal(calls, 1);
  reject = true; response = await post('/api/chat', request); const failure = await response.text(); assert.ok(failure.includes('明确拒绝')); assert.ok(!failure.includes('PRIVATE_PROVIDER_RESPONSE'));
  await post('/api/profiles', { ...profile, imageInput: 'unsupported', activate: false });
  response = await post('/api/chat', request); assert.ok((await response.text()).includes('不支持图片')); assert.equal(calls, 2);
  response = await post('/api/chat', { ...request, kind: 'main' }); assert.equal(response.status, 400); assert.equal(calls, 2);
  const log = JSON.stringify(records); assert.ok(!log.includes('data:image') && !log.includes('fake-test-key') && !log.includes('FIGURE_QUESTION'));
});
