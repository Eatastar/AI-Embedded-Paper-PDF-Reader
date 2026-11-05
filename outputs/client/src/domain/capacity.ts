import type { Workspace } from './types';

export const WORKSPACE_LIMITS = Object.freeze({ conversations: 1000, messages: 10000, versions: 1000, annotations: 10000, context: 10012, text: 2_000_000, backupBytes: 350_000_000 });
const sizes = new WeakMap<object, number>();
const checked = new WeakSet<object>();
const encoder = new TextEncoder();
const count = (length: number, maximum: number, label: string) => {
  if (length > maximum) throw new Error(`${label}最多 ${maximum.toLocaleString('zh-CN')} 条，当前操作未执行。请先导出备份。`);
};

// Updates use immutable objects. Cache unchanged branches, including frozen context,
// rather than stringify or clone an entire library on every streamed character.
export function jsonBytes(value: unknown): number {
  if (value === undefined) return 0;
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'string' && value.length > WORKSPACE_LIMITS.text) throw new Error('单段文字超过 200 万字符，已保留修改前的内容。');
    return encoder.encode(JSON.stringify(value)).byteLength;
  }
  const cached = sizes.get(value);
  if (cached !== undefined) return cached;
  const entries = Array.isArray(value) ? value.map(item => jsonBytes(item))
    : Object.entries(value).filter(([, item]) => item !== undefined).map(([key, item]) => encoder.encode(JSON.stringify(key)).byteLength + 1 + jsonBytes(item));
  const size = 2 + Math.max(0, entries.length - 1) + entries.reduce((sum, item) => sum + item, 0);
  sizes.set(value, size);
  return size;
}

/** Check the live candidate before changing UI state, starting requests or writing files. */
export function assertWorkspaceCapacity(workspace: Workspace): void {
  count(workspace.conversations.length, WORKSPACE_LIMITS.conversations, '对话（含已删除对话）');
  let fileBytes = 0;
  let running = 0;
  for (const conversation of workspace.conversations) {
    if (!checked.has(conversation)) {
      count(conversation.messages.length, WORKSPACE_LIMITS.messages, '每个对话的消息');
      count(conversation.annotations.length, WORKSPACE_LIMITS.annotations, '每个对话的批注（含已删除批注）');
      count(conversation.documents?.length || 0, 10, '每个对话的附件');
      for (const message of conversation.messages) if (!checked.has(message)) {
        count(message.versions.length, WORKSPACE_LIMITS.versions, '每条回答的版本');
        checked.add(message);
      }
      for (const annotation of conversation.annotations) if (!checked.has(annotation)) {
        count(annotation.context?.length || 0, WORKSPACE_LIMITS.context, '批注上下文');
        checked.add(annotation);
      }
      for (const document of conversation.documents || []) if (!checked.has(document)) {
        count(document.pages.length, 300, '单份附件的页数');
        if (document.size > 25 * 1024 * 1024 || document.pages.reduce((sum, page) => sum + page.text.length, 0) > 1_000_000) throw new Error('单份附件最多 25 MB、100 万字符。');
        checked.add(document);
      }
      checked.add(conversation);
    }
    for (const document of conversation.documents || []) fileBytes += Math.ceil(document.size / 3) * 4 + jsonBytes(document.id) + 64;
    running += conversation.annotations.filter(a => a.status === 'generating').length;
    running += conversation.messages.reduce((sum, message) => sum + message.versions.filter(v => v.status === 'streaming').length, 0);
  }
  // Reserve a little space for interrupted statuses and a useful error message at
  // shutdown. This prevents a valid live stream from becoming an unsavable backup.
  if (jsonBytes(workspace) + fileBytes + 4096 + running * 1024 > WORKSPACE_LIMITS.backupBytes) throw new Error('完整备份将超过 350 MB，已保留操作前的记录。请先分别导出对话备份。');
}
