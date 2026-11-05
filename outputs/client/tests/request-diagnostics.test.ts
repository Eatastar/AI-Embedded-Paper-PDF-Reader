import assert from 'node:assert/strict';
import test from 'node:test';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { createRequire } from 'node:module';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
// @ts-expect-error The local HTTP server is JavaScript.
import { createAppServer, friendlyModelError } from '../server/app.mjs';
// @ts-expect-error The diagnostics mapper is JavaScript.
import { errorDetails, safeRequestRecord } from '../server/diagnostics.mjs';
const require = createRequire(import.meta.url);
const { createModelFetch } = require('../desktop/model-network.cjs');
const { createRequestLog } = require('../desktop/request-log.cjs');
const post = (base: string, path: string, body: unknown) => fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

test('network errors, including Chromium errors, are specific and never expose exception text', () => {
  for (const [code, word] of [['ERR_PROXY_CONNECTION_FAILED', '代理'], ['ERR_TUNNEL_CONNECTION_FAILED', '代理'], ['UND_ERR_CONNECT_TIMEOUT', '连接模型服务器超时'], ['ENOTFOUND', '域名解析'], ['ERR_CERT_AUTHORITY_INVALID', '证书'], ['ECONNRESET', '已断开']]) {
    const error = new TypeError(`private-secret net::${code}`, { cause: Object.assign(new Error('secret URL'), { code }) });
    assert.equal(errorDetails(error).code, code);
    assert.ok(friendlyModelError(error).includes(word));
    assert.doesNotMatch(friendlyModelError(error), /private-secret|secret URL/);
  }
  assert.equal(errorDetails({ cause: new AggregateError([Object.assign(new Error(), { code: 'ENOTFOUND' })]) }).code, 'ENOTFOUND');
});

test('quota, rate limit and failed Responses events retain their distinct safe causes', () => {
  for (const [code, word] of [['insufficient_quota', '额度不足'], ['rate_limit_exceeded', '频繁'], ['invalid_api_key', '密钥验证'], ['model_not_found', '权限']]) {
    const error = { code: 'upstream_stream_error', upstreamError: { response: { error: { code, message: 'sk-private-secret' } } } };
    assert.equal(errorDetails(error).code, code);
    assert.ok(friendlyModelError(error).includes(word));
    assert.doesNotMatch(friendlyModelError(error), /sk-private-secret/);
  }
  const fallback = errorDetails({ code: 'sk-private-secret', responseBody: '{"error":{"code":"sk-private-secret","message":"private"}}' });
  assert.equal(fallback.code, 'REQUEST_FAILED');
});

test('an actual chat route uses the desktop adapter, reports proxy failure once, and can recover on the next question', async () => {
  let count = 0, reloads = 0;
  const records: any[] = [];
  const desktopFetch = createModelFetch({
    async forceReloadProxyConfig() { reloads++; },
    async fetch(_url: unknown, init: RequestInit) {
      count++;
      assert.equal(new Headers(init.headers).get('authorization'), 'Bearer secret-only-for-test');
      if (count === 1) throw new TypeError('net::ERR_PROXY_CONNECTION_FAILED secret-only-for-test');
      const chunks = [{ choices: [{ index: 0, delta: { content: '恢复成功' }, finish_reason: null }] }, { choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] }];
      return new Response(chunks.map(x => `data: ${JSON.stringify(x)}\n\n`).join('') + 'data: [DONE]\n\n', { headers: { 'Content-Type': 'text/event-stream', 'x-request-id': 'req_qa_recovered' } });
    },
  });
  const server = createAppServer({ env: {}, fetch: desktopFetch, transport: 'system-proxy', onRequestLog: (record: unknown) => records.push(record) });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    await post(base, '/api/settings', { mode: 'api', model: 'selected-model', apiKey: 'secret-only-for-test' });
    const body = { kind: 'main', messages: [{ role: 'user', content: 'private-chat-not-for-logs' }] };
    const first = await (await post(base, '/api/chat', body)).text();
    assert.match(first, /无法连接系统代理/); assert.match(first, /诊断编号/);
    assert.equal(count, 1);
    const second = await (await post(base, '/api/chat', body)).text();
    assert.match(second, /恢复成功/); assert.match(second, /"type":"done"/);
    assert.equal(reloads, 2); assert.equal(count, 2);
    assert.equal(records[0].code, 'ERR_PROXY_CONNECTION_FAILED'); assert.equal(records[0].outcome, 'error');
    assert.equal(records[1].code, 'COMPLETE'); assert.equal(records[1].upstreamRequestId, 'req_qa_recovered');
    assert.ok(first.includes(records[0].requestId));
    assert.equal(records[0].model, 'selected-model'); assert.equal(records[0].transport, 'system-proxy');
    assert.doesNotMatch(JSON.stringify(records) + first, /secret-only-for-test|private-chat-not-for-logs/);
  } finally { server.closeAllConnections(); server.close(); await once(server, 'close'); }
});

test('Responses and Claude requests both pass through the desktop session with the same error diagnostics', async () => {
  const records: any[] = [], urls: string[] = [];
  const desktopFetch = createModelFetch({
    async forceReloadProxyConfig() {},
    async fetch(url: string) {
      urls.push(url);
      return new Response(JSON.stringify({ error: { code: 'insufficient_quota', message: 'private-key-should-not-be-printed' } }), { status: 429, headers: { 'Content-Type': 'application/json', 'x-request-id': 'req_qa_quota' } });
    },
  });
  const server = createAppServer({ env: {}, fetch: desktopFetch, onRequestLog: (record: unknown) => records.push(record) });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    for (const apiFormat of ['openai-responses', 'anthropic-messages']) {
      await post(base, '/api/settings', { mode: 'api', apiFormat, baseURL: 'https://provider.example/v1', model: 'qa', apiKey: 'mock-key' });
      const response = await (await post(base, '/api/chat', { kind: 'annotation', quote: 'private-quote', messages: [{ role: 'user', content: 'private-question' }] })).text();
      assert.match(response, /额度不足/); assert.match(response, /诊断编号/); assert.doesNotMatch(response, /private-key/);
    }
    assert.deepEqual(urls, ['https://provider.example/v1/responses', 'https://provider.example/v1/messages']);
    assert.ok(records.every(r => r.httpStatus === 429 && r.code === 'insufficient_quota' && r.upstreamRequestId === 'req_qa_quota'));
    assert.doesNotMatch(JSON.stringify(records), /private-quote|private-question|mock-key/);
  } finally { server.closeAllConnections(); server.close(); await once(server, 'close'); }
});

test('request logs rotate, strip unknown data and logging failure cannot break chat', () => {
  const root = fileURLToPath(new URL('../../../work/request-log-tests/', import.meta.url)); mkdirSync(root, { recursive: true });
  const directory = mkdtempSync(join(root, 'run-'));
  try {
    const log = createRequestLog(directory);
    const record = safeRequestRecord({ requestId: 'a'.repeat(36), time: '2026-11-04T00:00:00.000Z', kind: 'main', outcome: 'error', transport: 'system-proxy', apiFormat: 'openai-responses', host: 'api.openai.com', model: 'qa', code: 'UND_ERR_CONNECT_TIMEOUT', elapsedMs: 10, apiKey: 'must-not-save', prompt: 'must-not-save', headers: { authorization: 'must-not-save' } });
    log.write(record);
    assert.doesNotMatch(readFileSync(log.path, 'utf8'), /must-not-save|authorization|apiKey|prompt/);
    writeFileSync(log.path, ' '.repeat(1024 * 1024 + 1));
    log.write(record);
    assert.ok(readFileSync(join(directory, 'logs/requests-previous.jsonl')).length > 1024 * 1024);
    assert.equal(JSON.parse(readFileSync(log.path, 'utf8')).code, 'UND_ERR_CONNECT_TIMEOUT');
    const invalidRoot = join(directory, 'file-not-directory'); writeFileSync(invalidRoot, 'test');
    assert.doesNotThrow(() => createRequestLog(invalidRoot).write(record));
  } finally { assert.equal(dirname(resolve(directory)), resolve(root)); rmSync(directory, { recursive: true, force: true }); }
});
