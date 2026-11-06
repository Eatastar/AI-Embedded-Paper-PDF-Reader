import { ProfileError } from './profiles.mjs';

const MAX_BYTES = 2 * 1024 * 1024;
const MAX_MODELS = 2000;
const failure = (status, message) => new ProfileError(status, message);
async function readList(response, signal) {
  if (!response.body) throw failure(502, '模型列表为空，请手动填写模型名称。');
  const reader = response.body.getReader();
  const chunks = []; let size = 0;
  try {
    while (true) {
      signal.throwIfAborted();
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) throw failure(502, '模型列表过大，请手动填写模型名称。');
      chunks.push(value);
    }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    try { return JSON.parse(new TextDecoder().decode(bytes)); }
    catch { throw failure(502, '服务未返回有效的模型列表，请检查地址或手动填写。'); }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}

/** Only lists models at the user-selected destination. Never starts a generation or saves credentials. */
export async function discoverModels(config, { fetch: fetcher = globalThis.fetch, signal, timeoutMs = 15000 } = {}) {
  const controller = new AbortController();
  const aborted = () => controller.abort();
  signal?.addEventListener('abort', aborted, { once: true });
  if (signal?.aborted) controller.abort();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const models = new Map();
  const url = new URL(config.baseURL);
  url.pathname = `${url.pathname.replace(/\/+$/, '') || '/v1'}/models`;
  const anthropic = config.apiFormat === 'anthropic-messages';
  const headers = anthropic
    ? { 'anthropic-version': '2023-06-01', ...(config.apiKey ? { 'x-api-key': config.apiKey } : {}) }
    : config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {};
  const cursors = new Set();
  try {
    for (let page = 0; page < 20; page++) {
      controller.signal.throwIfAborted();
      const response = await fetcher(url.href, { method: 'GET', headers: { Accept: 'application/json', ...headers }, redirect: 'error', credentials: 'omit', signal: controller.signal });
      if (!response.ok) {
        await response.body?.cancel().catch(() => {});
        if ([401, 403].includes(response.status)) throw failure(400, '无法获取模型列表：认证失败，请检查密钥与权限。');
        if ([404, 405, 501].includes(response.status)) throw failure(400, '此服务未提供模型列表接口，仍可手动填写模型名称。');
        if (response.status === 429) throw failure(429, '获取模型列表受到限制，请稍后重试。');
        throw failure(502, '模型列表服务暂时不可用，请稍后重试或手动填写。');
      }
      const body = await readList(response, controller.signal);
      if (!body || !Array.isArray(body.data)) throw failure(502, '服务未返回有效的模型列表，请检查地址或手动填写。');
      for (const item of body.data) {
        if (typeof item?.id !== 'string' || !item.id.trim() || item.id.length > 200 || /[\x00-\x1f\x7f]/.test(item.id)) continue;
        if (!models.has(item.id)) models.set(item.id, { id: item.id, ...(typeof item.display_name === 'string' && item.display_name.length <= 200 ? { label: item.display_name } : {}) });
        if (models.size > MAX_MODELS) throw failure(502, '模型列表过大，请手动填写模型名称。');
      }
      if (!anthropic || !body.has_more) {
        if (!models.size) throw failure(400, '此连接没有返回可用模型，请检查权限或手动填写。');
        return { models: [...models.values()] };
      }
      if (typeof body.last_id !== 'string' || body.last_id.length > 200 || cursors.has(body.last_id)) throw failure(502, '模型列表分页异常，请手动填写模型名称。');
      cursors.add(body.last_id); url.searchParams.set('after_id', body.last_id);
    }
    throw failure(502, '模型列表过大，请手动填写模型名称。');
  } catch (error) {
    if (error instanceof ProfileError) throw error;
    if (signal?.aborted) throw failure(499, '已取消获取模型列表。');
    if (controller.signal.aborted) throw failure(504, '获取模型列表超时，请检查网络或代理后重试。');
    throw failure(502, '无法连接模型列表服务，请检查地址、网络或代理。');
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', aborted); }
}
