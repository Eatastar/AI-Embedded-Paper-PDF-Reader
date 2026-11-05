import type { InputMessage, ModelSettings, ProfileInput } from '../domain/types';

export type SettingsUpdate = Partial<Omit<ModelSettings, 'hasApiKey'>> & { apiKey?: string; clearApiKey?: boolean };
export interface ReplyRequest { messages: InputMessage[]; kind: 'main' | 'annotation'; quote?: string; variant?: number; profileId?: string | null }

async function readFailure(response: Response): Promise<string> {
  try { const body = await response.json() as { error?: string }; return body.error || `请求失败（${response.status}）。`; }
  catch { return `本地服务未能处理请求（${response.status}）。`; }
}

export async function getSettings(): Promise<ModelSettings> {
  const response = await fetch('/api/settings', { cache: 'no-store' });
  if (!response.ok) throw new Error(await readFailure(response));
  return response.json() as Promise<ModelSettings>;
}

export async function saveSettings(update: SettingsUpdate): Promise<ModelSettings> {
  const response = await fetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(update) });
  if (!response.ok) throw new Error(await readFailure(response));
  return response.json() as Promise<ModelSettings>;
}

async function profileAction(path: string, body: unknown): Promise<ModelSettings> {
  const response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!response.ok) throw new Error(await readFailure(response));
  return response.json() as Promise<ModelSettings>;
}

export const saveProfile = (profile: ProfileInput) => profileAction('/api/profiles', profile);
export const selectProfile = (profileId: string | null) => profileAction('/api/profiles/select', { profileId });
export const deleteProfile = (profileId: string) => profileAction('/api/profiles/delete', { profileId });

export async function streamReply(request: ReplyRequest, onDelta: (text: string) => void, signal?: AbortSignal): Promise<{ modelLabel: string }> {
  signal?.throwIfAborted();
  const response = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requestId: crypto.randomUUID(), ...request }), signal });
  if (!response.ok) throw new Error(await readFailure(response));
  if (!response.body || !response.headers.get('content-type')?.includes('text/event-stream')) throw new Error('本地服务没有返回可读取的回答。');
  const reader = response.body.getReader();
  const abortRead = () => { void reader.cancel().catch(() => {}); };
  signal?.addEventListener('abort', abortRead, { once: true });
  const decoder = new TextDecoder();
  let pending = '';
  let result: { modelLabel: string } | undefined;
  const consumeEvent = (event: string) => {
    signal?.throwIfAborted();
    const data = event.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
    if (!data) return;
    let part: { type: string; text?: string; modelLabel?: string; message?: string };
    try { part = JSON.parse(data) as typeof part; }
    catch { throw new Error('回答的数据格式不正确，请重试。'); }
    if (part.type === 'delta' && typeof part.text === 'string') onDelta(part.text);
    else if (part.type === 'done') result = { modelLabel: part.modelLabel || '所选模型' };
    else if (part.type === 'error') throw new Error(part.message || '生成回答时遇到问题。');
  };
  try {
    while (true) {
      signal?.throwIfAborted();
      const { done, value } = await reader.read();
      pending += decoder.decode(value, { stream: !done });
      let match: RegExpExecArray | null;
      while ((match = /\r?\n\r?\n/.exec(pending))) {
        const event = pending.slice(0, match.index);
        pending = pending.slice(match.index + match[0].length);
        consumeEvent(event);
      }
      if (done) break;
    }
    if (pending.trim()) consumeEvent(pending);
    if (signal?.aborted) throw new DOMException('回答已停止。', 'AbortError');
    if (!result) throw new Error('连接提前结束，回答尚未完成。请重试。');
    return result;
  } finally {
    signal?.removeEventListener('abort', abortRead);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
