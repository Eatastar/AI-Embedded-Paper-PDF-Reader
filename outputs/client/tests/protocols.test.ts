import assert from 'node:assert/strict';
import test from 'node:test';
// @ts-expect-error Native JavaScript transports are tested through their exported interface.
import { ProtocolError, streamProtocolReply } from '../server/protocols.mjs';

type ProtocolFailure = Error & { code: string; statusCode?: number; responseBody: string; upstreamError: { error: { type: string; message: string } } };
const isProtocolError = (error: unknown): error is ProtocolFailure => error instanceof ProtocolError;

type Call = { url: string; body: Record<string, unknown>; headers: Headers; init?: RequestInit };
const event = (value: Record<string, unknown>) => `event: ${value.type}\r\ndata: ${JSON.stringify(value)}\r\n\r\n`;
const completed = (extra: Record<string, unknown> = {}) => event({ type: 'response.completed', response: { status: 'completed', usage: { input_tokens: 40, output_tokens: 8, total_tokens: 48 }, ...extra } });
const responseDelta = (delta = '回答') => event({ type: 'response.output_text.delta', delta });
const claudeDelta = (text = '回答') => event({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } });
const claudeStop = (reason: unknown = 'end_turn') => event({ type: 'message_delta', delta: { stop_reason: reason }, usage: { output_tokens: 12 } }) + event({ type: 'message_stop' });

function fragmentedResponse(text: string | Uint8Array, size = 3) {
  const bytes = typeof text === 'string' ? new TextEncoder().encode(text) : text;
  let offset = 0;
  return new Response(new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset === bytes.length) controller.close();
      else { controller.enqueue(bytes.slice(offset, offset + size)); offset = Math.min(offset + size, bytes.length); }
    },
  }), { headers: { 'Content-Type': 'text/event-stream' } });
}

async function execute(apiFormat: 'openai-responses' | 'anthropic-messages', responseText: string | Uint8Array, options: Record<string, unknown> = {}) {
  const calls: Call[] = [];
  let text = '';
  const result = await streamProtocolReply({
    apiFormat, baseURL: 'https://provider.example', model: 'selected-model', apiKey: 'mock-private-key', messages: [{ role: 'user', content: '问题' }],
    fetch: async (url: string | URL | Request, init?: RequestInit) => { calls.push({ url: String(url), body: JSON.parse(String(init?.body)), headers: new Headers(init?.headers), init }); return fragmentedResponse(responseText); },
    onText: (chunk: string) => { text += chunk; }, ...options,
  });
  return { result, text, calls };
}

test('Responses sends full ordered context and annotation, parses split UTF-8, ignores reasoning and reports usage', async () => {
  const messages = [{ role: 'system', content: '系统偏好一' }, { role: 'user', content: '完整上下文'.repeat(10000) }, { role: 'assistant', content: '旧回答' }, { role: 'system', content: '系统偏好二' }, { role: 'user', content: '解释选文' }];
  const snapshot = structuredClone(messages);
  const response = event({ type: 'response.created', response: { status: 'in_progress' } }) + event({ type: 'response.reasoning_summary_text.delta', delta: '不显示的推理' }) + responseDelta('中文🙂') + responseDelta('公式 $x^2$') + completed();
  const out = await execute('openai-responses', response, { messages, annotationInstruction: '选中原文：时空曲率' });
  assert.equal(out.text, '中文🙂公式 $x^2$');
  assert.deepEqual(out.result.usage, { inputTokens: 40, outputTokens: 8, totalTokens: 48 });
  assert.equal(out.calls.length, 1);
  assert.equal(out.calls[0].url, 'https://provider.example/v1/responses');
  assert.equal(out.calls[0].headers.get('authorization'), 'Bearer mock-private-key');
  assert.equal(out.calls[0].headers.get('x-api-key'), null);
  assert.equal(out.calls[0].init?.redirect, 'error');
  assert.deepEqual(out.calls[0].body, { model: 'selected-model', input: [{ role: 'system', content: '选中原文：时空曲率' }, ...messages], stream: true, store: false });
  assert.deepEqual(messages, snapshot);
});

test('Responses refusal remains readable and succeeds only after completed', async () => {
  const out = await execute('openai-responses', event({ type: 'response.refusal.delta', delta: '无法回答这项请求。' }) + completed());
  assert.equal(out.text, '无法回答这项请求。');
  assert.equal(out.result.usage.totalTokens, 48);
});

test('Responses can recover final text if a relay only forwards the completed event', async () => {
  const out = await execute('openai-responses', completed({ output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: '最终完整回答' }] }] }));
  assert.equal(out.text, '最终完整回答');
});

test('Responses does not treat tools, empty content, reasoning or a DONE sentinel as a successful answer', async () => {
  for (const output of [[], [{ type: 'function_call', name: 'search', arguments: '{}' }], [{ type: 'message', content: [{ type: 'output_text', text: ' ' }] }]]) {
    await assert.rejects(execute('openai-responses', completed({ output })), (error: unknown) => isProtocolError(error) && error.code === 'empty_response');
  }
  await assert.rejects(execute('openai-responses', event({ type: 'response.reasoning_summary_text.delta', delta: '推理' }) + completed()), (error: unknown) => isProtocolError(error) && error.code === 'empty_response');
  await assert.rejects(execute('openai-responses', responseDelta() + 'data: [DONE]\n\n'), (error: unknown) => isProtocolError(error) && error.code === 'stream_incomplete');
  await assert.rejects(execute('openai-responses', responseDelta()), (error: unknown) => isProtocolError(error) && error.code === 'stream_incomplete');
});

test('Responses rejects failed, incomplete and error events without exposing upstream messages in Error.message', async () => {
  const secret = 'mock-private-key-echoed-by-upstream';
  for (const failure of [
    { type: 'response.failed', response: { error: { code: 'context_length_exceeded', message: secret } } },
    { type: 'response.incomplete', response: { incomplete_details: { reason: 'max_output_tokens' }, error: { message: secret } } },
    { type: 'error', code: 'bad_request', message: secret },
    { type: 'response.completed', response: { status: 'failed', error: { message: secret } } },
  ]) {
    await assert.rejects(execute('openai-responses', responseDelta('部分文字') + event(failure)), (error: unknown) => {
      assert.ok(isProtocolError(error));
      assert.doesNotMatch(error.message, /mock-private-key/);
      assert.match(error.responseBody, /mock-private-key/);
      return true;
    });
  }
});

test('Claude extracts ordered system blocks, preserves complete conversational messages and keeps keys in the correct header', async () => {
  const messages = [{ role: 'system', content: '偏好一' }, { role: 'user', content: '全部历史'.repeat(10000) }, { role: 'assistant', content: '原回答' }, { role: 'system', content: '偏好二' }, { role: 'user', content: '继续解释' }];
  const response = event({ type: 'message_start', message: { usage: { input_tokens: 25, cache_creation_input_tokens: 10, cache_read_input_tokens: 5, output_tokens: 1 } } })
    + event({ type: 'content_block_start', index: 0, content_block: { type: 'text', text: '开头' } })
    + event({ type: 'ping' }) + event({ type: 'content_block_delta', delta: { type: 'thinking_delta', thinking: '隐藏思考' } })
    + claudeDelta('中文🙂') + event({ type: 'message_delta', delta: { stop_reason: null }, usage: { output_tokens: 5 } }) + claudeStop();
  const out = await execute('anthropic-messages', response, { messages, annotationInstruction: '选中原文：曲率' });
  assert.equal(out.text, '开头中文🙂');
  assert.deepEqual(out.result.usage, { inputTokens: 40, outputTokens: 12, totalTokens: 52 });
  assert.equal(out.calls.length, 1);
  assert.equal(out.calls[0].url, 'https://provider.example/v1/messages');
  assert.equal(out.calls[0].headers.get('x-api-key'), 'mock-private-key');
  assert.equal(out.calls[0].headers.get('authorization'), null);
  assert.equal(out.calls[0].headers.get('anthropic-version'), '2023-06-01');
  assert.deepEqual(out.calls[0].body, { model: 'selected-model', system: [{ type: 'text', text: '选中原文：曲率' }, { type: 'text', text: '偏好一' }, { type: 'text', text: '偏好二' }], messages: messages.filter(message => message.role !== 'system'), stream: true, max_tokens: 4096 });
});

test('Claude supports stop_sequence and does not invent unknown usage counts', async () => {
  const out = await execute('anthropic-messages', claudeDelta() + claudeStop('stop_sequence'));
  assert.equal(out.text, '回答');
  assert.deepEqual(out.result.usage, { inputTokens: undefined, outputTokens: 12, totalTokens: undefined });
  assert.equal('system' in out.calls[0].body, false);
});

test('Claude requires a normal stop reason, visible text and the final message_stop', async () => {
  for (const reason of ['max_tokens', 'tool_use', 'pause_turn', 'refusal', null]) {
    await assert.rejects(execute('anthropic-messages', claudeDelta() + claudeStop(reason)), (error: unknown) => isProtocolError(error) && error.code === (reason === 'max_tokens' ? 'output_limit' : 'model_incomplete'));
  }
  await assert.rejects(execute('anthropic-messages', claudeStop()), (error: unknown) => isProtocolError(error) && error.code === 'empty_response');
  await assert.rejects(execute('anthropic-messages', claudeDelta(' ') + claudeStop()), (error: unknown) => isProtocolError(error) && error.code === 'empty_response');
  await assert.rejects(execute('anthropic-messages', claudeDelta() + event({ type: 'message_delta', delta: { stop_reason: 'end_turn' } })), (error: unknown) => isProtocolError(error) && error.code === 'stream_incomplete');
});

test('Claude stream errors preserve their structured cause and useful status without leaking secrets in the message', async () => {
  await assert.rejects(execute('anthropic-messages', event({ type: 'error', error: { type: 'overloaded_error', message: 'echo mock-private-key' } })), (error: unknown) => {
    assert.ok(isProtocolError(error));
    assert.equal(error.statusCode, 529);
    assert.equal(error.upstreamError.error.type, 'overloaded_error');
    assert.equal(error.message, 'upstream_stream_error');
    return true;
  });
});

test('native transports preserve root, /v1, complete endpoints and custom relay prefixes without double-appending', async () => {
  for (const apiFormat of ['openai-responses', 'anthropic-messages'] as const) {
    const resource = apiFormat === 'openai-responses' ? 'responses' : 'messages';
    const response = apiFormat === 'openai-responses' ? responseDelta() + completed() : claudeDelta() + claudeStop();
    for (const [path, expected] of [['', `/v1/${resource}`], ['/', `/v1/${resource}`], ['/v1', `/v1/${resource}`], ['/v1/', `/v1/${resource}`], [`/v1/${resource}`, `/v1/${resource}`], [`/v1/${resource}/`, `/v1/${resource}`], ['/relay/v1', `/relay/v1/${resource}`], [`/relay/${resource}`, `/relay/${resource}`]]) {
      const out = await execute(apiFormat, response, { baseURL: 'https://provider.example' + path });
      assert.equal(out.calls[0].url, 'https://provider.example' + expected);
    }
  }
});

test('HTTP errors reach friendly handling as status and raw body, are never retried, and never expose keys in Error.message', async () => {
  for (const apiFormat of ['openai-responses', 'anthropic-messages'] as const) {
    let calls = 0;
    await assert.rejects(execute(apiFormat, '', { fetch: async () => { calls++; return new Response(JSON.stringify({ error: { type: 'authentication_error', message: 'echo mock-private-key' } }), { status: 401 }); } }), (error: unknown) => {
      assert.ok(isProtocolError(error));
      assert.equal(error.statusCode, 401);
      assert.equal(error.message, 'upstream_http_error');
      assert.equal(error.upstreamError.error.message, 'echo mock-private-key');
      assert.match(error.responseBody, /mock-private-key/);
      return true;
    });
    assert.equal(calls, 1);
  }
});

test('SSE accepts comments, multi-line JSON data, event-field types and CR boundaries', async () => {
  const text = ': keep-alive\rid: ignored\revent: response.output_text.delta\rdata: {"delta":\rdata: "边界🙂"}\r\r' + completed();
  const out = await execute('openai-responses', text);
  assert.equal(out.text, '边界🙂');
});

test('malformed JSON and UTF-8 are rejected instead of silently completing', async () => {
  for (const apiFormat of ['openai-responses', 'anthropic-messages'] as const) {
    await assert.rejects(execute(apiFormat, 'data: {malformed}\n\n'), (error: unknown) => isProtocolError(error) && error.code === 'invalid_stream_event');
    await assert.rejects(execute(apiFormat, new Uint8Array([0x64, 0x61, 0x74, 0x61, 0x3a, 0xff, 0x0a, 0x0a])), (error: unknown) => isProtocolError(error) && error.code === 'invalid_stream_encoding');
  }
});

test('abort is passed to fetch, stops the stream and never turns a partial answer into success', async () => {
  for (const apiFormat of ['openai-responses', 'anthropic-messages'] as const) {
    const controller = new AbortController();
    let passedSignal;
    let cancelled = false;
    const response = apiFormat === 'openai-responses' ? responseDelta() : claudeDelta();
    await assert.rejects(execute(apiFormat, '', {
      signal: controller.signal,
      fetch: async (_: unknown, init: RequestInit) => {
        passedSignal = init.signal;
        return new Response(new ReadableStream({ start(stream) { stream.enqueue(new TextEncoder().encode(response)); }, cancel() { cancelled = true; } }));
      },
      onText: () => { controller.abort(); },
    }), (error: unknown) => error instanceof DOMException && error.name === 'AbortError');
    assert.equal(passedSignal, controller.signal);
    assert.equal(cancelled, true);
  }
});

test('already aborted, unsupported formats and invalid endpoint credentials never issue requests', async () => {
  let calls = 0;
  const noFetch = async () => { calls++; throw new Error('unexpected request'); };
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(execute('openai-responses', '', { fetch: noFetch, signal: controller.signal }), (error: unknown) => error instanceof DOMException && error.name === 'AbortError');
  await assert.rejects(execute('openai-responses', '', { fetch: noFetch, apiFormat: 'unknown' }), (error: unknown) => isProtocolError(error) && error.code === 'unsupported_api_format');
  await assert.rejects(execute('openai-responses', '', { fetch: noFetch, baseURL: 'https://private:secret@provider.example/v1' }), (error: unknown) => isProtocolError(error) && error.code === 'invalid_endpoint' && !error.message.includes('secret'));
  assert.equal(calls, 0);
});

test('stopping while awaiting the first upstream token cancels the pending stream read', async () => {
  const controller = new AbortController();
  let cancelled = false;
  const timer = setTimeout(() => controller.abort(), 15);
  try {
    await assert.rejects(execute('anthropic-messages', '', {
      signal: controller.signal,
      fetch: async () => new Response(new ReadableStream({ cancel() { cancelled = true; } })),
    }), (error: unknown) => error instanceof DOMException && error.name === 'AbortError');
    assert.equal(cancelled, true);
  } finally { clearTimeout(timer); }
});

