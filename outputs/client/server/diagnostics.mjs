const PROVIDER_CODES = new Set([
  'invalid_api_key', 'insufficient_quota', 'rate_limit_exceeded', 'model_not_found',
  'context_length_exceeded', 'unsupported_parameter', 'invalid_request_error',
  'invalid_value', 'missing_required_parameter', 'organization_verification_required',
  'unsupported_country_region_territory', 'permission_denied', 'server_error',
]);
const NETWORK_CODES = new Set([
  'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT',
  'UND_ERR_SOCKET', 'ETIMEDOUT', 'ECONNREFUSED', 'ECONNRESET', 'ENOTFOUND', 'EAI_AGAIN',
  'CERT_HAS_EXPIRED', 'DEPTH_ZERO_SELF_SIGNED_CERT', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'ERR_PROXY_CONNECTION_FAILED', 'ERR_TUNNEL_CONNECTION_FAILED', 'ERR_NO_SUPPORTED_PROXIES',
  'ERR_PROXY_AUTH_REQUESTED', 'ERR_INVALID_AUTH_CREDENTIALS', 'ERR_NAME_NOT_RESOLVED',
  'ERR_CONNECTION_TIMED_OUT', 'ERR_CONNECTION_REFUSED', 'ERR_CONNECTION_RESET',
  'ERR_INTERNET_DISCONNECTED', 'ERR_NETWORK_CHANGED', 'ERR_CERT_AUTHORITY_INVALID',
  'ERR_CERT_DATE_INVALID', 'ERR_SSL_PROTOCOL_ERROR', 'ERR_FAILED',
]);
const LOCAL_CODES = new Set(['output_limit', 'stream_incomplete', 'missing_stream', 'model_incomplete', 'empty_response', 'invalid_stream_event', 'invalid_stream_encoding', 'stream_event_too_large', 'upstream_http_error', 'upstream_stream_error', 'content_filtered']);

function parsedBody(error) {
  if (error?.upstreamError && typeof error.upstreamError === 'object') return error.upstreamError;
  if (typeof error?.responseBody === 'string' && error.responseBody.length < 100000) {
    try { return JSON.parse(error.responseBody); } catch { /* Non-JSON error bodies stay private. */ }
  }
  return null;
}

export function errorDetails(error, timedOut = false) {
  if (timedOut) return { code: 'REQUEST_TIMEOUT' };
  const data = parsedBody(error);
  const upstream = data?.error || data?.response?.error;
  const providerCode = [upstream?.code, upstream?.type].find(code => PROVIDER_CODES.has(code));
  const seen = new Set();
  const queue = [error];
  let networkCode;
  while (queue.length && seen.size < 12) {
    const value = queue.shift();
    if (!value || typeof value !== 'object' || seen.has(value)) continue;
    seen.add(value);
    const match = String(value.message || '').match(/\b(?:ERR_[A-Z0-9_]+|UND_ERR_[A-Z0-9_]+)\b/g) || [];
    networkCode ||= [value.code, ...match].find(code => NETWORK_CODES.has(code));
    queue.push(value.cause, ...(Array.isArray(value.errors) ? value.errors.slice(0, 6) : []));
  }
  const code = providerCode || networkCode || (LOCAL_CODES.has(error?.code) ? error.code : error?.name === 'AbortError' ? 'ABORTED' : 'REQUEST_FAILED');
  const status = error?.statusCode ?? error?.cause?.statusCode;
  return { code, ...(Number.isInteger(status) && status >= 100 && status <= 599 ? { httpStatus: status } : {}) };
}

export function safeRequestRecord(input) {
  const safe = {};
  if (typeof input.requestId === 'string' && /^[0-9a-f-]{36}$/i.test(input.requestId)) safe.requestId = input.requestId;
  if (typeof input.time === 'string' && /^\d{4}-\d\d-\d\dT[0-9:.]+Z$/.test(input.time)) safe.time = input.time;
  if (['main', 'annotation'].includes(input.kind)) safe.kind = input.kind;
  if (['complete', 'error', 'aborted'].includes(input.outcome)) safe.outcome = input.outcome;
  if (['node', 'system-proxy'].includes(input.transport)) safe.transport = input.transport;
  if (['openai-chat', 'openai-responses', 'anthropic-messages'].includes(input.apiFormat)) safe.apiFormat = input.apiFormat;
  if (typeof input.model === 'string' && /^[a-z0-9_./:-]{1,160}$/i.test(input.model) && !/^sk-/i.test(input.model)) safe.model = input.model;
  if (typeof input.host === 'string' && /^[a-z0-9.:[\]-]{1,253}$/i.test(input.host) && !/^sk-/i.test(input.host)) safe.host = input.host;
  if (Number.isInteger(input.httpStatus) && input.httpStatus >= 100 && input.httpStatus <= 599) safe.httpStatus = input.httpStatus;
  if (Number.isFinite(input.elapsedMs) && input.elapsedMs >= 0) safe.elapsedMs = Math.round(input.elapsedMs);
  if (PROVIDER_CODES.has(input.code) || NETWORK_CODES.has(input.code) || LOCAL_CODES.has(input.code) || ['REQUEST_FAILED', 'REQUEST_TIMEOUT', 'ABORTED', 'COMPLETE'].includes(input.code)) safe.code = input.code;
  if (typeof input.upstreamRequestId === 'string' && /^(req_[a-zA-Z0-9_-]{1,100}|[0-9a-f-]{36})$/.test(input.upstreamRequestId)) safe.upstreamRequestId = input.upstreamRequestId;
  return safe;
}
