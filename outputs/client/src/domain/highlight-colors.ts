import type { Conversation } from './types';

export const HIGHLIGHT_COLORS = [
  { name: '金黄', value: '#f3cf67' }, { name: '浅蓝', value: '#a9c6f6' },
  { name: '浅绿', value: '#b7ddba' }, { name: '粉红', value: '#e6b4d7' },
  { name: '淡紫', value: '#c9baf1' }, { name: '蜜桃', value: '#f3ba95' },
  { name: '青绿', value: '#94d5d3' }, { name: '橄榄', value: '#d7d68d' },
] as const;

export function normalizeHighlightColor(value: string): string {
  const color = value.trim().toLowerCase();
  if (!/^#[0-9a-f]{6}([0-9a-f]{2})?$/.test(color)) throw new Error('请输入 #RRGGBB 或 #RRGGBBAA 格式的颜色。');
  return color;
}

/** Presentation changes preserve the source anchor and any in-flight exchange. */
export function changeAnnotationColor(conversation: Conversation, id: string, value: string): Conversation {
  const annotation = conversation.annotations.find(item => item.id === id && item.deletedAt === undefined);
  if (!annotation) throw new Error('这条批注已被删除。');
  const color = normalizeHighlightColor(value);
  if (annotation.color === color) return conversation;
  const updatedAt = Date.now();
  return { ...conversation, updatedAt, annotations: conversation.annotations.map(item => item.id === id ? { ...item, color, updatedAt } : item) };
}
