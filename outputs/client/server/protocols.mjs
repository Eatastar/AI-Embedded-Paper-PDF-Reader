/** Native text transports. Keys and untrusted provider messages never enter Error.message. */
export class ProtocolError extends Error {
  constructor(code, { statusCode, responseBody, upstreamError } = {}) {
    super(code);
    this.name = 'ProtocolError';
    this.code = code;
    this.statusCode = statusCode;
    this.responseBody = responseBody;
    this.upstreamError = upstreamError;
  }
}

function endpointURL(baseURL, resource) {
  let url;
  try { url = new URL(baseURL); } catch { throw new ProtocolError('invalid_endpoint'); }
  if (url.username || url.password || url.search || url.hash || !['https:', 'http:'].includes(url.protocol)) throw new ProtocolError('invalid_endpoint');
  const path = url.pathname.replace(/\/+$/, '');
  if (!path) url.pathname = `/v1/${resource}`;
  else if (!path.endsWith(`/${resource}`)) url.pathname = `${path}/${resource}`;
  else url.pathname = path;
  return url.href;
}

function aborted(signal) {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
}

// SSE fields and UTF-8 characters can be split at any byte, including between CR and LF.
async function* streamEvents(body, signal) {
  if (!body) throw new ProtocolError('missing_stream');
  const reader = body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let buffer = '';
  let data = [];
  let event = '';
  let eventLength = 0;
  const abort = () => { void reader.cancel().catch(() => {}); };
  signal?.addEventListener('abort', abort, { once: true });
  const lineEvent = line => {
    eventLength += line.length;
    if (eventLength > 8 * 1024 * 1024) throw new ProtocolError('stream_event_too_large');
    if (!line) {
      const ready = data.length ? { event, data: data.join('\n') } : undefined;
      data = [];
      event = '';
      eventLength = 0;
      return ready;
    }
    if (line.startsWith(':')) return;
    const colon = line.indexOf(':');
    const field = colon < 0 ? line : line.slice(0, colon);
    let value = colon < 0 ? '' : line.slice(colon + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    if (field === 'event') event = value;
    else if (field === 'data') data.push(value);
  };
  try {
    let done = false;
    while (!done) {
      aborted(signal);
      const chunk = await reader.read();
      aborted(signal);
      done = chunk.done;
      try { buffer += decoder.decode(chunk.value, { stream: !done }); }
      catch { throw new ProtocolError('invalid_stream_encoding'); }
      while (buffer.length) {
        const match = /[\r\n]/.exec(buffer);
        if (!match) break;
        const index = match.index;
        if (!done && buffer[index] === '\r' && index + 1 === buffer.length) break;
        const line = buffer.slice(0, index);
        const separatorLength = buffer[index] === '\r' && buffer[index + 1] === '\n' ? 2 : 1;
        buffer = buffer.slice(index + separatorLength);
        const ready = lineEvent(line);
        if (ready) yield ready;
      }
      if (buffer.length > 8 * 1024 * 1024) throw new ProtocolError('stream_event_too_large');
    }
    if (buffer.length) lineEvent(buffer);
    const ready = lineEvent('');
    if (ready) yield ready;
    aborted(signal);
  } finally {
    signal?.removeEventListener('abort', abort);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

function eventJSON(event) {
  try {
    const data = JSON.parse(event.data);
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error();
    return data;
  } catch { throw new ProtocolError('invalid_stream_event'); }
}

const tokenCount = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;

function usageTotals(input, output, total) {
  const inputTokens = tokenCount(input);
  const outputTokens = tokenCount(output);
  return { inputTokens, outputTokens, totalTokens: tokenCount(total) ?? (inputTokens !== undefined && outputTokens !== undefined ? inputTokens + outputTokens : undefined) };
}

function providerError(code, body, statusCode) {
  return new ProtocolError(code, { statusCode, responseBody: typeof body === 'string' ? body : JSON.stringify(body), upstreamError: body });
}

async function fetchStream(url, body, headers, signal, fetcher) {
  aborted(signal);
  const response = await fetcher(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream', ...headers }, body: JSON.stringify(body), signal, redirect: 'error' });
  aborted(signal);
  if (!response.ok) {
    const raw = await response.text();
    let parsed;
    try { parsed = JSON.parse(raw); } catch { parsed = raw; }
    throw new ProtocolError('upstream_http_error', { statusCode: response.status, responseBody: raw, upstreamError: parsed });
  }
  return response;
}

function responseText(response) {
  if (!Array.isArray(response?.output)) return '';
  return response.output.filter(item => item?.type === 'message' && (!item.role || item.role === 'assistant'))
    .flatMap(item => Array.isArray(item.content) ? item.content : [])
    .map(part => part?.type === 'output_text' && typeof part.text === 'string' ? part.text : part?.type === 'refusal' && typeof part.refusal === 'string' ? part.refusal : '').join('');
}

async function openAIResponses({ baseURL, model, apiKey, messages, annotationInstruction, signal, fetcher, onText }) {
  const input = annotationInstruction ? [{ role: 'system', content: annotationInstruction }, ...messages] : messages;
  const response = await fetchStream(endpointURL(baseURL, 'responses'), { model, input: input.map(message => ({ role: message.role, content: message.content })), stream: true, store: false }, apiKey ? { Authorization: `Bearer ${apiKey}` } : {}, signal, fetcher);
  let text = '';
  const emit = async chunk => { aborted(signal); text += chunk; await onText(chunk); aborted(signal); };
  for await (const event of streamEvents(response.body, signal)) {
    aborted(signal);
    if (event.data === '[DONE]') continue; // A sentinel alone is not a completed Responses object.
    const data = eventJSON(event);
    const type = data.type || event.event;
    if (type === 'response.output_text.delta' || type === 'response.refusal.delta') {
      if (typeof data.delta !== 'string') throw new ProtocolError('invalid_stream_event');
      await emit(data.delta);
    } else if (type === 'response.failed' || type === 'response.incomplete' || type === 'error') {
      const code = data.response?.incomplete_details?.reason === 'max_output_tokens' ? 'output_limit' : 'upstream_stream_error';
      throw providerError(code, data);
    } else if (type === 'response.completed') {
      if (!data.response || data.response.status && data.response.status !== 'completed') throw providerError('model_incomplete', data);
      if (!text) {
        const finalText = responseText(data.response);
        if (finalText) await emit(finalText);
      }
      if (!text.trim()) throw new ProtocolError('empty_response');
      aborted(signal);
      const usage = data.response.usage || {};
      return { usage: usageTotals(usage.input_tokens, usage.output_tokens, usage.total_tokens) };
    }
  }
  throw new ProtocolError('stream_incomplete');
}

const anthropicErrorStatus = { authentication_error: 401, permission_error: 403, rate_limit_error: 429, not_found_error: 404, invalid_request_error: 400, overloaded_error: 529, api_error: 500 };

async function anthropicMessages({ baseURL, model, apiKey, messages, annotationInstruction, signal, fetcher, onText }) {
  const system = [
    ...(annotationInstruction ? [{ type: 'text', text: annotationInstruction }] : []),
    ...messages.filter(message => message.role === 'system').map(message => ({ type: 'text', text: message.content })),
  ];
  const body = { model, ...(system.length ? { system } : {}), messages: messages.filter(message => message.role !== 'system').map(message => ({ role: message.role, content: message.content })), max_tokens: 4096, stream: true };
  const response = await fetchStream(endpointURL(baseURL, 'messages'), body, { ...(apiKey ? { 'x-api-key': apiKey } : {}), 'anthropic-version': '2023-06-01' }, signal, fetcher);
  let text = '';
  let stopReason;
  let usage = {};
  const emit = async chunk => { aborted(signal); text += chunk; await onText(chunk); aborted(signal); };
  for await (const event of streamEvents(response.body, signal)) {
    aborted(signal);
    const data = eventJSON(event);
    const type = data.type || event.event;
    if (type === 'message_start') usage = { ...usage, ...data.message?.usage };
    else if (type === 'content_block_start' && data.content_block?.type === 'text') {
      if (typeof data.content_block.text !== 'string') throw new ProtocolError('invalid_stream_event');
      if (data.content_block.text) await emit(data.content_block.text);
    } else if (type === 'content_block_delta' && data.delta?.type === 'text_delta') {
      if (typeof data.delta.text !== 'string') throw new ProtocolError('invalid_stream_event');
      await emit(data.delta.text);
    } else if (type === 'message_delta') {
      if (data.delta?.stop_reason !== undefined && data.delta.stop_reason !== null) stopReason = data.delta.stop_reason;
      usage = { ...usage, ...data.usage };
    } else if (type === 'error') throw providerError('upstream_stream_error', data, anthropicErrorStatus[data.error?.type]);
    else if (type === 'message_stop') {
      if (stopReason !== 'end_turn' && stopReason !== 'stop_sequence') throw new ProtocolError(stopReason === 'max_tokens' ? 'output_limit' : 'model_incomplete');
      if (!text.trim()) throw new ProtocolError('empty_response');
      aborted(signal);
      const baseInput = tokenCount(usage.input_tokens);
      const input = baseInput === undefined ? undefined : baseInput + (tokenCount(usage.cache_creation_input_tokens) || 0) + (tokenCount(usage.cache_read_input_tokens) || 0);
      return { usage: usageTotals(input, usage.output_tokens) };
    }
  }
  throw new ProtocolError('stream_incomplete');
}

/** @param {{apiFormat: string, baseURL: string, model: string, apiKey?: string, messages: {role: string, content: string}[], annotationInstruction?: string, signal?: AbortSignal, fetch?: typeof fetch, onText: (text: string) => unknown}} options */
export async function streamProtocolReply({ apiFormat, baseURL, model, apiKey = '', messages, annotationInstruction = '', signal, fetch: customFetch, onText }) {
  if (!['openai-responses', 'anthropic-messages'].includes(apiFormat)) throw new ProtocolError('unsupported_api_format');
  if (!Array.isArray(messages) || messages.some(message => !message || !['system', 'user', 'assistant'].includes(message.role) || typeof message.content !== 'string')) throw new ProtocolError('invalid_messages');
  const options = { baseURL, model, apiKey, messages, annotationInstruction, signal, fetcher: customFetch || globalThis.fetch, onText };
  return apiFormat === 'openai-responses' ? openAIResponses(options) : anthropicMessages(options);
}
