import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
// @ts-expect-error Native server module, tested through its HTTP boundary.
import { createAppServer } from '../server/app.mjs';
// @ts-expect-error Native server module.
import { discoverModels } from '../server/model-discovery.mjs';
// @ts-expect-error Shared native JavaScript URL helper.
import { modelListEndpoint } from '../server/model-endpoint.mjs';
const preset = { name: 'Synthetic connection', apiFormat: 'openai-chat', baseURL: 'https://synthetic.example/v1', model: '', systemPrompt: '' };
const list = (data: unknown) => new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });
test('model-list URLs accept base addresses and full inference endpoints without losing custom prefixes', () => {
  for (const [input, expected] of [
    ['https://synthetic.example', 'https://synthetic.example/v1/models'],
    ['https://synthetic.example/v1', 'https://synthetic.example/v1/models'],
    ['https://synthetic.example/v1/responses', 'https://synthetic.example/v1/models'],
    ['https://synthetic.example/v1/chat/completions/', 'https://synthetic.example/v1/models'],
    ['https://synthetic.example/relay/v1/messages', 'https://synthetic.example/relay/v1/models'],
    ['https://synthetic.example/v1/models/', 'https://synthetic.example/v1/models'],
    ['https://synthetic.example/responses', 'https://synthetic.example/models'],
    ['https://synthetic.example/models', 'https://synthetic.example/models'],
    ['https://synthetic.example/v1beta/openai/chat/completions', 'https://synthetic.example/v1beta/openai/models'],
    ['http://127.0.0.1:11434/v1/responses', 'http://127.0.0.1:11434/v1/models'],
  ]) assert.equal(modelListEndpoint(input).href, expected);
  assert.throws(() => modelListEndpoint('https://synthetic.example/v1?api_key=synthetic-key'));
  assert.throws(() => modelListEndpoint('https://synthetic-user:synthetic-key@synthetic.example/v1'));
});

test('discovery from saved full inference addresses retains credentials without editing the saved connection', async () => {
  const calls: any[] = [], app = await running((url: string, options: any) => { calls.push({ url, headers: options.headers, method: options.method }); return list({ data: [{ id: 'model-a' }] }); });
  try {
    for (const [apiFormat, suffix] of [['openai-responses', '/responses'], ['openai-chat', '/chat/completions'], ['anthropic-messages', '/messages']]) {
      const saved = await (await app.post('/api/profiles', { ...preset, apiFormat, baseURL: preset.baseURL + suffix, model: 'model-a', apiKey: 'synthetic-saved-key' })).json();
      const before = await app.settings(), response = await app.post('/api/models', { id: saved.activeProfileId });
      assert.equal(response.status, 200); assert.deepEqual((await response.json()).models, [{ id: 'model-a' }]);
      assert.deepEqual(await app.settings(), before);
      const call = calls.at(-1); assert.equal(call.url, 'https://synthetic.example/v1/models'); assert.equal(call.method, 'GET');
      assert.equal(apiFormat === 'anthropic-messages' ? call.headers['x-api-key'] : call.headers.Authorization, apiFormat === 'anthropic-messages' ? 'synthetic-saved-key' : 'Bearer synthetic-saved-key');
    }
    assert.equal(calls.length, 3);
  } finally { await app.close(); }
});
async function running(fetcher: any, extra = {}) {
  const server: Server = createAppServer({ env: {}, fetch: fetcher, ...extra }); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return { post: (path: string, value: unknown) => fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) }), settings: () => fetch(base + '/api/settings').then(r => r.json()), close: async () => { server.closeAllConnections(); server.close(); await once(server, 'close'); } };
}
test('unsaved connections discover models without a model name, saving a key or changing the active profile', async () => {
  const calls: any[] = [], app = await running((url: string, options: any) => { calls.push({ url, ...options }); return list({ data: [{ id: 'text-a' }, { id: 'text-b' }, { id: 'text-a' }, { id: 'invalid\nmodel' }] }); });
  try {
    const before = await app.settings(), response = await app.post('/api/models', { ...preset, apiKey: 'synthetic-discovery-key' });
    assert.equal(response.status, 200); const text = await response.text(); assert.deepEqual(JSON.parse(text).models, [{ id: 'text-a' }, { id: 'text-b' }]);
    assert.doesNotMatch(text, /synthetic-discovery-key|apiKey/); assert.deepEqual(await app.settings(), before);
    assert.equal(calls.length, 1); assert.equal(calls[0].method, 'GET'); assert.equal(calls[0].url, 'https://synthetic.example/v1/models'); assert.equal(calls[0].headers.Authorization, 'Bearer synthetic-discovery-key'); assert.equal(calls[0].redirect, 'error');
  } finally { await app.close(); }
});
test('saved keys are reused only for the exact saved destination and protocol', async () => {
  let calls = 0; const app = await running((_url: string, options: any) => { calls++; assert.equal(options.headers.Authorization, 'Bearer synthetic-saved-key'); return list({ data: [{ id: 'model-a' }] }); });
  try {
    const saved = await (await app.post('/api/profiles', { ...preset, model: 'model-a', apiKey: 'synthetic-saved-key' })).json();
    const id = saved.activeProfileId;
    assert.equal((await app.post('/api/models', { ...preset, id, apiKey: '' })).status, 200);
    assert.equal((await app.post('/api/models', { ...preset, id, baseURL: 'https://elsewhere.example/v1', apiKey: '' })).status, 400);
    assert.equal((await app.post('/api/models', { ...preset, id, apiFormat: 'anthropic-messages', apiKey: '' })).status, 400);
    assert.equal((await app.post('/api/models', { ...preset, id, clearApiKey: true })).status, 400); assert.equal(calls, 1);
  } finally { await app.close(); }
});
test('Claude model pagination stays on the configured origin and local compatible services may omit authentication', async () => {
  const calls: any[] = [];
  const config = { ...preset, apiFormat: 'anthropic-messages', apiKey: 'synthetic-claude-key' };
  const result = await discoverModels(config, { fetch: (url: string, options: any) => { calls.push({ url, ...options }); return list(calls.length === 1 ? { data: [{ id: 'claude-one', display_name: 'Claude One' }], has_more: true, last_id: 'claude-one', next: 'https://untrusted.example' } : { data: [{ id: 'claude-two' }], has_more: false }); } });
  assert.equal(result.models.length, 2); assert.equal(calls[0].headers['x-api-key'], 'synthetic-claude-key'); assert.equal(calls[0].headers['anthropic-version'], '2023-06-01'); assert.equal(calls[1].url, 'https://synthetic.example/v1/models?after_id=claude-one');
  const app = await running((_url: string, options: any) => { assert.equal(options.headers.Authorization, undefined); return list({ data: [{ id: 'local-model' }] }); });
  try { assert.equal((await app.post('/api/models', { ...preset, baseURL: 'http://127.0.0.1:11434/v1' })).status, 200); }
  finally { await app.close(); }
});
test('upstream errors, invalid and oversized lists are bounded and never expose provider bodies or keys', async () => {
  for (const [response, pattern] of [[new Response('synthetic-key leaked by upstream', { status: 401 }), /认证失败（HTTP 401）/], [new Response('private provider body', { status: 404 }), /模型列表接口未找到或未开放（HTTP 404）/], [list({ data: [] }), /没有返回可用模型/], [list({ data: [{ id: 'x' }], padding: 'x'.repeat(2 * 1024 * 1024) }), /列表过大/], [list({ invalid: true }), /有效的模型列表/]] as const) {
    await assert.rejects(discoverModels({ ...preset, apiKey: 'synthetic-key' }, { fetch: () => response }), (error: any) => { assert.match(error.message, pattern); assert.doesNotMatch(error.message, /synthetic-key|private provider body/); return true; });
  }
  await assert.rejects(discoverModels(preset, { timeoutMs: 10, fetch: (_url: string, options: any) => new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new DOMException('secret in error', 'AbortError')))) }), /超时/);
});
test('model discovery retains local session authorization and rejects untrusted origins', async () => {
  const app = await running(() => { throw Error('must not contact upstream'); }, { accessToken: 'synthetic-session-token' });
  try { assert.equal((await app.post('/api/models', preset)).status, 403); }
  finally { await app.close(); }
});
