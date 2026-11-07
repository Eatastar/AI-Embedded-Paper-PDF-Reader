import type { ChatTextReference, Conversation } from './types';

export type ChatTextSelection = Omit<ChatTextReference, 'label'>;
export const MAX_CHAT_QUOTE_CHARACTERS = 20_000;
function sourceLabel(conversation: Conversation, selection: ChatTextSelection): string | undefined {
  if (selection.conversationId !== conversation.id) return;
  for (const document of conversation.documents || []) {
    const page = document.pages.find(item => item.messageId === selection.messageId && item.versionId === selection.versionId);
    if (page) return `${document.name} · p. ${page.pageNumber}`;
  }
  const message = conversation.messages.find(item => item.id === selection.messageId);
  const version = message?.versions.find(item => item.id === selection.versionId && item.status === 'complete');
  if (version) return message!.role === 'user' ? '聊天问题' : 'AI 回答';
}
export function hasChatTextSource(conversation: Conversation, selection: ChatTextSelection): boolean { return sourceLabel(conversation, selection) !== undefined; }
export function parseChatTextReference(value: unknown): ChatTextReference {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('引用文字格式无效。');
  const raw = value as Record<string, unknown>;
  const id = (key: string) => { const text = raw[key]; if (typeof text !== 'string' || !text.trim() || text.length > 200) throw new Error('引用文字的来源标识无效。'); return text; };
  if (typeof raw.text !== 'string' || !raw.text.trim()) throw new Error('请先选择要引用的文字。');
  if (raw.text.length > MAX_CHAT_QUOTE_CHARACTERS) throw new Error('每次最多引用 20000 个字符，请缩小选区。');
  if (typeof raw.label !== 'string' || !raw.label.trim() || raw.label.length > 1000) throw new Error('引用文字的来源说明无效。');
  return { conversationId: id('conversationId'), messageId: id('messageId'), versionId: id('versionId'), label: raw.label, text: raw.text };
}
export function captureChatTextReference(conversation: Conversation, selection: ChatTextSelection): ChatTextReference {
  const label = sourceLabel(conversation, selection);
  if (!label) throw new Error('引用的原文已不存在，请重新选择。');
  return parseChatTextReference({ conversationId: selection.conversationId, messageId: selection.messageId, versionId: selection.versionId, label, text: selection.text.trim() });
}
