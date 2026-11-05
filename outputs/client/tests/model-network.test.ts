import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
const { createModelFetch } = createRequire(import.meta.url)('../desktop/model-network.cjs');

test('desktop traffic follows refreshed session settings and preserves streaming, authorization and cancellation', async () => {
  const calls: { url: unknown; init: RequestInit }[] = [];
  const trace: string[] = [];
  const session = {
    async forceReloadProxyConfig() { trace.push('proxy'); },
    async fetch(url: unknown, init: RequestInit) { calls.push({ url, init }); trace.push('fetch'); return new Response('data: 流式文字\n\n'); },
  };
  const fetcher = createModelFetch(session);
  const controller = new AbortController();
  for (const endpoint of ['responses', 'chat/completions', 'messages']) {
    const response = await fetcher(`https://provider.example/v1/${endpoint}`, { method: 'POST', headers: { Authorization: 'Bearer mock-key' }, body: '{"model":"selected"}', signal: controller.signal });
    assert.equal(await response.text(), 'data: 流式文字\n\n');
  }
  assert.deepEqual(trace, ['proxy', 'fetch', 'proxy', 'fetch', 'proxy', 'fetch']);
  for (const { init } of calls) {
    assert.equal(init.body, '{"model":"selected"}');
    assert.equal(new Headers(init.headers).get('authorization'), 'Bearer mock-key');
    assert.equal(init.signal, controller.signal);
    assert.equal(init.credentials, 'omit'); assert.equal(init.cache, 'no-store'); assert.equal(init.redirect, 'error');
  }
});

test('a failed proxy sends no direct retry and a later request refreshes configuration again', async () => {
  let attempts = 0, refreshed = 0;
  const failure = new TypeError('net::ERR_PROXY_CONNECTION_FAILED');
  const fetcher = createModelFetch({
    async forceReloadProxyConfig() { refreshed++; },
    async fetch() { attempts++; if (attempts === 1) throw failure; return new Response('recovered'); },
  });
  await assert.rejects(fetcher('https://provider.example', {}), error => error === failure);
  assert.equal(attempts, 1);
  assert.equal(await (await fetcher('https://provider.example', {})).text(), 'recovered');
  assert.equal(refreshed, 2);
});

test('stop works before a request and while waiting for proxy refresh, without sending a POST', async () => {
  let called = 0;
  const controller = new AbortController();
  const fetcher = createModelFetch({ forceReloadProxyConfig: () => new Promise(() => {}), async fetch() { called++; } });
  const pending = fetcher('https://provider.example', { signal: controller.signal });
  controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
  await assert.rejects(fetcher(new Request('https://provider.example', { signal: controller.signal })), { name: 'AbortError' });
  assert.equal(called, 0);
});

test('local model URLs stay local and invalid protocols cannot reach the session', async () => {
  const urls: string[] = [];
  const fetcher = createModelFetch({ async forceReloadProxyConfig() {}, async fetch(url: string) { urls.push(url); return new Response('local'); } });
  await fetcher(new URL('http://127.0.0.1:11434/v1/chat/completions'));
  assert.equal(urls[0], 'http://127.0.0.1:11434/v1/chat/completions');
  for (const url of ['file:///private', 'data:text/plain,test', 'https://user:secret@example.org']) await assert.rejects(fetcher(url));
  assert.equal(urls.length, 1);
});
