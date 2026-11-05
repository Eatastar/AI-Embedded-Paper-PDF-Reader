import assert from 'node:assert/strict';
import { once } from 'node:events';
import test from 'node:test';
// @ts-expect-error The local server is native JavaScript, exercised through its HTTP interface.
import { createAppServer, friendlyModelError } from '../server/app.mjs';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { request as httpRequest } from 'node:http';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { streamReply } from '../src/adapters/model';

async function running(options: Record<string, unknown> = {}) {
  const server: Server = createAppServer({ env: {}, demoDuration: 1, ...options });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return { base, server, close: async () => { server.closeAllConnections(); server.close(); await once(server, 'close'); } };
}

const post = (base: string, path: string, body: unknown, extra: Record<string, string> = {}) => fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...extra }, body: JSON.stringify(body) });

test('desktop access token protects static pages and every API without exposing its value', async () => {
  const distDir = await mkdtemp(join(tmpdir(), 'margin-desktop-test-'));
  await writeFile(join(distDir, 'index.html'), '<!doctype html><title>Desktop test</title>');
  const token = 'desktop-session-token';
  const app = await running({ distDir, accessToken: token, allowDevOrigins: false });
  const headers = { 'x-margin-session': token };
  try {
    for (const path of ['/', '/index.html', '/api/health', '/api/settings']) {
      for (const supplied of ['', 'wrong', 'x'.repeat(token.length)]) {
        const response = await fetch(app.base + path, { headers: { 'x-margin-session': supplied } });
        assert.equal(response.status, 403);
        assert.doesNotMatch(await response.text(), /desktop-session-token/);
      }
    }
    assert.equal((await post(app.base, '/api/settings', { apiKey: 'should-not-be-saved' })).status, 403);
    assert.equal((await post(app.base, '/api/chat', { kind: 'main', messages: [{ role: 'user', content: 'hello' }] })).status, 403);
    const page = await fetch(app.base + '/', { headers });
    assert.equal(page.status, 200);
    assert.match(await page.text(), /Desktop test/);
    const settings = await (await fetch(app.base + '/api/settings', { headers })).json();
    assert.equal(settings.hasApiKey, false);
    assert.equal(JSON.stringify(settings).includes(token), false);
    const health = await (await fetch(app.base + '/api/health', { headers })).json();
    assert.equal(health.app, 'margin-chat');
    assert.equal(JSON.stringify(health).includes(token), false);
    const response = await post(app.base, '/api/chat', { kind: 'main', messages: [{ role: 'user', content: 'hello' }] }, headers);
    assert.equal(response.status, 200);
    assert.match(await response.text(), /"type":"done"/);
  } finally { await app.close(); await rm(distDir, { recursive: true, force: true }); }
});

test('desktop origin rules exclude development addresses while browser defaults retain them', async () => {
  const desktop = await running({ accessToken: 'origin-test-token', allowDevOrigins: false });
  const browser = await running();
  try {
    const sessionHeader = { 'x-margin-session': 'origin-test-token' };
    for (const origin of ['http://127.0.0.1:4317', 'http://localhost:4317']) {
      assert.equal((await fetch(desktop.base + '/api/settings', { headers: { ...sessionHeader, Origin: origin } })).status, 403);
      assert.equal((await fetch(browser.base + '/api/settings', { headers: { Origin: origin } })).status, 200);
    }
    assert.equal((await fetch(desktop.base + '/api/settings', { headers: { ...sessionHeader, Origin: desktop.base } })).status, 200);
    const forgedHost = await new Promise<number | undefined>((resolveStatus, reject) => {
      const req = httpRequest(desktop.base + '/api/settings', { headers: { ...sessionHeader, Host: '127.0.0.1:4317' } }, response => { response.resume(); resolveStatus(response.statusCode); });
      req.once('error', reject);
      req.end();
    });
    assert.equal(forgedHost, 403);
    assert.equal((await fetch(browser.base + '/api/settings')).status, 200);
  } finally { await desktop.close(); await browser.close(); }
});

test('shutdown requires the private launch token and health never exposes it', async () => {
  const app = await running({ env: { MARGIN_CLIENT_INSTANCE_ID: 'test-instance', MARGIN_CLIENT_SHUTDOWN_TOKEN: 'private-launch-token' } });
  try {
    const health = await (await fetch(app.base + '/api/health')).json();
    assert.equal(health.instanceId, 'test-instance');
    assert.equal(JSON.stringify(health).includes('private-launch-token'), false);
    assert.equal((await post(app.base, '/api/shutdown', { token: 'wrong' })).status, 403);
    assert.equal((await post(app.base, '/api/shutdown', { token: 'private-launch-token' }, { Origin: 'https://untrusted.example' })).status, 403);
    const shutdown = once(app.server, 'shutdownRequested');
    assert.equal((await post(app.base, '/api/shutdown', { token: 'private-launch-token' })).status, 200);
    await shutdown;
  } finally { await app.close(); }
});

test('settings never return secrets; blank keeps key and explicit clearing removes it', async () => {
  const app = await running();
  try {
    const initial = await (await fetch(app.base + '/api/settings')).json();
    assert.equal(initial.mode, 'demo');
    assert.equal(initial.model, '');
    const response = await post(app.base, '/api/settings', { apiKey: 'secret-test-key' });
    const saved = await response.json();
    assert.equal(saved.hasApiKey, true);
    assert.equal(JSON.stringify(saved).includes('secret-test-key'), false);
    assert.equal((await (await post(app.base, '/api/settings', { apiKey: '' })).json()).hasApiKey, true);
    assert.equal((await (await post(app.base, '/api/settings', { clearApiKey: true })).json()).hasApiKey, false);
    assert.equal((await post(app.base, '/api/settings', { mode: 'api', model: 'chosen-model' })).status, 400);
    assert.equal((await post(app.base, '/api/settings', { mode: 'api', baseURL: 'http://127.0.0.1:11434/v1', model: 'local-model' })).status, 200);
  } finally { await app.close(); }
});

test('local service rejects foreign origins, unsafe URLs, empty chats and oversized full history', async () => {
  const app = await running();
  try {
    assert.equal((await post(app.base, '/api/settings', {}, { Origin: 'https://untrusted.example' })).status, 403);
    const rebindingStatus = await new Promise<number | undefined>((resolveStatus, reject) => {
      const req = httpRequest(app.base + '/api/settings', { headers: { Host: 'untrusted.example' } }, response => { response.resume(); resolveStatus(response.statusCode); });
      req.once('error', reject);
      req.end();
    });
    assert.equal(rebindingStatus, 403);
    assert.equal((await post(app.base, '/api/settings', { baseURL: 'http://remote.example/v1' })).status, 400);
    assert.equal((await post(app.base, '/api/settings', { baseURL: 'https://key:secret@example.org/v1' })).status, 400);
    assert.equal((await post(app.base, '/api/chat', { kind: 'main', messages: [] })).status, 400);
    assert.equal((await post(app.base, '/api/chat', { kind: 'main', messages: [{ role: 'user', content: 'a'.repeat(32 * 1024 * 1024) }] })).status, 413);
    assert.equal((await fetch(app.base + '/api/settings')).headers.get('access-control-allow-origin'), null);
  } finally { await app.close(); }
});

test('demo streams explicit sample content and a completion event', async () => {
  const app = await running();
  try {
    const response = await post(app.base, '/api/chat', { kind: 'main', messages: [{ role: 'user', content: '什么是广义相对论' }] });
    assert.equal(response.headers.get('content-type'), 'text/event-stream; charset=utf-8');
    const events = (await response.text()).trim().split('\n\n').map(line => JSON.parse(line.slice(6)));
    assert.ok(events.filter(event => event.type === 'delta').length > 1);
    assert.match(events.filter(event => event.type === 'delta').map(event => event.text).join(''), /时空曲率/);
    assert.deepEqual(events.at(-1), { type: 'done', modelLabel: '本地演示 · 未调用 AI' });
  } finally { await app.close(); }
});

test('real SDK sends selected model, full messages and annotation quote to compatible API', async () => {
  const calls: { url: string; body: Record<string, unknown>; headers: Headers }[] = [];
  const mockFetch = async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), body: JSON.parse(String(init?.body)), headers: new Headers(init?.headers) });
    const chunks = [
      { id: 'test', object: 'chat.completion.chunk', created: 1, model: 'test-model', choices: [{ index: 0, delta: { role: 'assistant', content: '真实适配器' }, finish_reason: null }] },
      { id: 'test', object: 'chat.completion.chunk', created: 1, model: 'test-model', choices: [{ index: 0, delta: { content: '测试成功' }, finish_reason: null }] },
      { id: 'test', object: 'chat.completion.chunk', created: 1, model: 'test-model', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 30, completion_tokens: 8, total_tokens: 38 } },
    ];
    return new Response(chunks.map(chunk => `data: ${JSON.stringify(chunk)}\n\n`).join('') + 'data: [DONE]\n\n', { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
  };
  const app = await running({ fetch: mockFetch });
  try {
    assert.equal((await post(app.base, '/api/settings', { mode: 'api', model: 'test-model', apiKey: 'mock-secret' })).status, 200);
    const longHistory = '完整历史'.repeat(10000);
    const messages = [{ role: 'user', content: longHistory }, { role: 'assistant', content: '之前的原回答' }, { role: 'user', content: '请解释这段' }];
    const response = await post(app.base, '/api/chat', { kind: 'annotation', messages, quote: '时空曲率' });
    const text = await response.text();
    assert.match(text, /真实适配器/);
    assert.match(text, /测试成功/);
    assert.match(text, /"type":"done"/);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'https://api.openai.com/v1/chat/completions');
    assert.equal(calls[0].body.model, 'test-model');
    const transmitted = calls[0].body.messages as { content: string }[];
    assert.ok(transmitted.some(message => message.content === longHistory));
    assert.ok(transmitted.some(message => message.content.includes('时空曲率')));
    assert.equal(calls[0].headers.get('authorization'), 'Bearer mock-secret');
  } finally { await app.close(); }
});

test('DeepSeek preset sends exact full context and streams final content without reasoning text', async () => {
  const calls: { url: string; body: Record<string, unknown>; headers: Headers }[] = [];
  const app = await running({ fetch: async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), body: JSON.parse(String(init?.body)), headers: new Headers(init?.headers) });
    const deltas = [
      { role: 'assistant', reasoning_content: '不应显示的思考片段一。' },
      { reasoning_content: '不应显示的思考片段二。' },
      { content: '这是最终回答。' },
    ];
    const chunks = deltas.map(delta => ({
      id: 'deepseek-preset', object: 'chat.completion.chunk', created: 1,
      model: 'deepseek-flash', choices: [{ index: 0, delta, finish_reason: null }],
    }));
    const stop = { id: 'deepseek-preset', object: 'chat.completion.chunk', created: 1, model: 'deepseek-flash', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] };
    return new Response([...chunks, stop].map(chunk => `data: ${JSON.stringify(chunk)}\n\n`).join('') + 'data: [DONE]\n\n', { headers: { 'Content-Type': 'text/event-stream' } });
  } });
  try {
    const settings = await post(app.base, '/api/settings', { mode: 'api', baseURL: 'https://api.deepseek.com', model: 'deepseek-flash', apiKey: 'mock-deepseek-key' });
    assert.equal(settings.status, 200);
    const messages = [
      { role: 'system', content: '请用中文回答。' },
      { role: 'user', content: '完整历史，不可截断。'.repeat(2500) },
      { role: 'assistant', content: '上一轮的完整回答。' },
      { role: 'user', content: '请结合上文解释时空曲率。' },
    ];
    const response = await post(app.base, '/api/chat', { kind: 'main', messages });
    assert.equal(response.status, 200);
    const wire = await response.text();
    const events = wire.trim().split('\n\n').map(frame => JSON.parse(frame.slice(6)));
    assert.equal(events.filter(event => event.type === 'delta').map(event => event.text).join(''), '这是最终回答。');
    assert.equal(events.at(-1).type, 'done');
    assert.equal(events.at(-1).modelLabel, 'deepseek-flash');
    assert.doesNotMatch(wire, /不应显示|思考片段|reasoning_content|mock-deepseek-key/);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'https://api.deepseek.com/chat/completions');
    assert.equal(calls[0].body.model, 'deepseek-flash');
    assert.equal(calls[0].body.stream, true);
    assert.deepEqual(calls[0].body.messages, messages);
    assert.equal(calls[0].headers.get('authorization'), 'Bearer mock-deepseek-key');
  } finally { await app.close(); }
});

test('client system preference is sent once and annotation retries keep the frozen preference', async () => {
  const calls: { messages: { role: string; content: string }[] }[] = [];
  const app = await running({ fetch: async (_url: unknown, init: RequestInit) => {
    calls.push(JSON.parse(String(init.body)));
    const chunk = { id: 'prompt-test', object: 'chat.completion.chunk', created: 1, model: 'test-model', choices: [{ index: 0, delta: { content: '已完成回答' }, finish_reason: 'stop' }] };
    return new Response(`data: ${JSON.stringify(chunk)}\n\ndata: [DONE]\n\n`, { headers: { 'Content-Type': 'text/event-stream' } });
  } });
  try {
    await post(app.base, '/api/settings', { mode: 'api', model: 'test-model', apiKey: 'mock-secret', systemPrompt: '原来的回答偏好' });
    const snapshot = [{ role: 'system', content: '原来的回答偏好' }, { role: 'user', content: '原问题' }];
    await (await post(app.base, '/api/chat', { kind: 'main', messages: snapshot })).text();
    assert.deepEqual(calls[0].messages, snapshot);
    await post(app.base, '/api/settings', { systemPrompt: '后来修改的回答偏好' });
    await (await post(app.base, '/api/chat', { kind: 'annotation', quote: '时空曲率', messages: snapshot })).text();
    const retry = calls[1].messages;
    assert.equal(retry.filter(message => message.content === '原来的回答偏好').length, 1);
    assert.equal(retry.some(message => message.content.includes('后来修改的回答偏好')), false);
    assert.ok(retry.some(message => message.role === 'system' && message.content.includes('一次性批注解释')));
    // An empty preference is also part of the frozen context, not permission to add a new one.
    await (await post(app.base, '/api/chat', { kind: 'annotation', quote: '时空曲率', messages: snapshot.slice(1) })).text();
    assert.equal(calls[2].messages.some(message => message.content.includes('后来修改的回答偏好')), false);
  } finally { await app.close(); }
});

test('truncated, filtered and tool-only completions remain failed requests instead of consuming a note', async () => {
  let reason = 'length';
  const app = await running({ fetch: async () => {
    const chunks = [
      { id: 'incomplete', object: 'chat.completion.chunk', created: 1, model: 'test-model', choices: [{ index: 0, delta: { content: '回答到一半' }, finish_reason: null }] },
      { id: 'incomplete', object: 'chat.completion.chunk', created: 1, model: 'test-model', choices: [{ index: 0, delta: {}, finish_reason: reason }] },
    ];
    return new Response(chunks.map(chunk => `data: ${JSON.stringify(chunk)}\n\n`).join('') + 'data: [DONE]\n\n', { headers: { 'Content-Type': 'text/event-stream' } });
  } });
  try {
    await post(app.base, '/api/settings', { mode: 'api', model: 'test-model', apiKey: 'mock-secret' });
    for (reason of ['length', 'content_filter', 'tool_calls']) {
      const wire = await (await post(app.base, '/api/chat', { kind: 'annotation', quote: '原文', messages: [{ role: 'user', content: '解释原文' }] })).text();
      assert.match(wire, /回答到一半/);
      assert.match(wire, /"type":"error"/);
      assert.doesNotMatch(wire, /"type":"done"/);
    }
  } finally { await app.close(); }
});

test('provider failures are safe, readable and never retried', async () => {
  let calls = 0;
  const app = await running({ fetch: async () => { calls++; return new Response(JSON.stringify({ error: { message: 'context_length_exceeded secret-test-key' } }), { status: 400, headers: { 'Content-Type': 'application/json' } }); } });
  try {
    await post(app.base, '/api/settings', { mode: 'api', model: 'test-model', apiKey: 'secret-test-key' });
    const text = await (await post(app.base, '/api/chat', { kind: 'main', messages: [{ role: 'user', content: 'hello' }] })).text();
    assert.match(text, /完整上下文超过模型的容量/);
    assert.doesNotMatch(text, /secret-test-key/);
    assert.doesNotMatch(text, /"type":"done"/);
    assert.equal(calls, 1);
    assert.match(friendlyModelError({ statusCode: 401, message: 'secret' }), /认证/);
  } finally { await app.close(); }
});

test('timeout aborts the upstream request and reports an incomplete response', async () => {
  let upstreamAborted = false;
  const app = await running({ timeoutMs: 30, fetch: async (_url: unknown, init: RequestInit) => new Promise((_resolve, reject) => {
    init.signal?.addEventListener('abort', () => { upstreamAborted = true; reject(new DOMException('Aborted', 'AbortError')); }, { once: true });
  }) });
  try {
    await post(app.base, '/api/settings', { mode: 'api', model: 'test-model', apiKey: 'secret-test-key' });
    const text = await (await post(app.base, '/api/chat', { kind: 'main', messages: [{ role: 'user', content: 'hello' }] })).text();
    assert.equal(upstreamAborted, true);
    assert.match(text, /请求等待超时/);
    assert.doesNotMatch(text, /"type":"done"/);
  } finally { await app.close(); }
});

test('browser adapter handles split UTF-8 SSE frames and rejects missing completion', async () => {
  const originalFetch = globalThis.fetch;
  const encoder = new TextEncoder();
  const request = { kind: 'main' as const, messages: [{ role: 'user' as const, content: '你好' }] };
  try {
    const wire = encoder.encode('data: {"type":"delta","text":"你好"}\r\n\r\ndata: {"type":"done","modelLabel":"mock"}\n\n');
    globalThis.fetch = async () => new Response(new ReadableStream({ start(controller) { for (const byte of wire) controller.enqueue(new Uint8Array([byte])); controller.close(); } }), { headers: { 'Content-Type': 'text/event-stream' } });
    let answer = '';
    assert.deepEqual(await streamReply(request, text => { answer += text; }), { modelLabel: 'mock' });
    assert.equal(answer, '你好');
    globalThis.fetch = async () => new Response('data: {"type":"delta","text":"未完成"}\n\n', { headers: { 'Content-Type': 'text/event-stream' } });
    await assert.rejects(streamReply(request, () => {}), /连接提前结束/);
  } finally { globalThis.fetch = originalFetch; }
});
