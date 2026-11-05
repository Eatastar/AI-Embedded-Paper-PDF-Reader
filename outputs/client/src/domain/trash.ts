import type { Workspace } from './types';

export type TrashTarget = { kind: 'conversation'; id: string } | { kind: 'annotation'; conversationId: string; id: string } | { kind: 'all' };

/** Only trash entries can be permanently removed. Active records remain untouched. */
export function permanentlyDelete(workspace: Workspace, target: TrashTarget): Workspace {
  if (target.kind === 'conversation') {
    const source = workspace.conversations.find(c => c.id === target.id);
    if (!source || source.deletedAt === undefined) throw new Error('请先将这条对话移入回收站。');
    return { ...workspace, conversations: workspace.conversations.filter(c => c.id !== source.id) };
  }
  if (target.kind === 'annotation') {
    const source = workspace.conversations.find(c => c.id === target.conversationId && c.deletedAt === undefined);
    const annotation = source?.annotations.find(a => a.id === target.id);
    if (!source || !annotation || annotation.deletedAt === undefined) throw new Error('请先将这条批注移入回收站；所属对话也需要处于正常状态。');
    return { ...workspace, conversations: workspace.conversations.map(c => c.id === source.id ? { ...c, annotations: c.annotations.filter(a => a.id !== target.id), updatedAt: Date.now() } : c) };
  }
  return { ...workspace, conversations: workspace.conversations.filter(c => c.deletedAt === undefined).map(c => {
    const annotations = c.annotations.filter(a => a.deletedAt === undefined);
    return annotations.length === c.annotations.length ? c : { ...c, annotations, updatedAt: Date.now() };
  }) };
}
