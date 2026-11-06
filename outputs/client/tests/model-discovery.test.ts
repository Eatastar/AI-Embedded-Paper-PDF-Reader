import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
// @ts-expect-error Native server module, tested through its HTTP boundary.
import { createAppServer } from '../server/app.mjs';
// @ts-expect-error Native server module.
import { discoverModels } from '../server/model-discovery.mjs';
const preset = { name: 'Synthetic connection', apiFormat: 'openai-chat', baseURL: 'https://synthetic.example/v1', model: '', systemPrompt: '' };
const list = (data: unknown) => new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });
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
  for (const [response, pattern] of [[new Response('synthetic-key leaked by upstream', { status: 401 }), /认证失败/], [new Response('private provider body', { status: 404 }), /未提供模型列表接口/], [list({ data: [] }), /没有返回可用模型/], [list({ data: [{ id: 'x' }], padding: 'x'.repeat(2 * 1024 * 1024) }), /列表过大/], [list({ invalid: true }), /有效的模型列表/]] as const) {
    await assert.rejects(discoverModels({ ...preset, apiKey: 'synthetic-key' }, { fetch: () => response }), (error: any) => { assert.match(error.message, pattern); assert.doesNotMatch(error.message, /synthetic-key|private provider body/); return true; });
  }
  await assert.rejects(discoverModels(preset, { timeoutMs: 10, fetch: (_url: string, options: any) => new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new DOMException('secret in error', 'AbortError')))) }), /超时/);
});
test('model discovery retains local session authorization and rejects untrusted origins', async () => {
  const app = await running(() => { throw Error('must not contact upstream'); }, { accessToken: 'synthetic-session-token' });
  try { assert.equal((await app.post('/api/models', preset)).status, 403); }
  finally { await app.close(); }
});
