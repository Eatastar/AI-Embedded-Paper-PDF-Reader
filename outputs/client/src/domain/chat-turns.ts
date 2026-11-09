import type { ChatMessage, Conversation } from './types';

export interface ChatTurn {
  id: string;
  messageIds: string[];
  targetId: string;
  preview: string;
}

/** Small navigation descriptors; never copy answers or frozen request contexts. */
export function chatTurns(messages: readonly ChatMessage[]): ChatTurn[] {
  const turns: ChatTurn[] = [];
  let hasAnswer = false;
  for (const message of messages) {
    let turn = turns.at(-1);
    if (message.role === 'user' || !turn) {
      const version = message.versions.find(item => item.id === message.activeVersionId);
      turn = { id: message.id, messageIds: [], targetId: message.id, preview: (version?.content || '').slice(0, 1000).replace(/\s+/g, ' ').trim().slice(0, 180) };
      turns.push(turn); hasAnswer = false;
    }
    if (message.role === 'assistant' && !hasAnswer) { turn.targetId = message.id; hasAnswer = true; }
    turn.messageIds.push(message.id);
  }
  return turns;
}

export function chatTurnSelection(conversation: Conversation, ids: readonly string[]) {
  const wanted = new Set(ids);
  const turns = chatTurns(conversation.messages).filter(turn => turn.messageIds.some(id => wanted.has(id)));
  const messageIds = new Set(turns.flatMap(turn => turn.messageIds));
  for (const id of wanted) if (!messageIds.has(id)) throw new Error('这轮对话已不存在。');
  const annotationIds = new Set(conversation.annotations.filter(annotation => messageIds.has(annotation.messageId)).map(annotation => annotation.id));
  const referenceCount = conversation.messages.filter(message => !messageIds.has(message.id)).reduce((sum, message) => sum + Number(messageIds.has(message.textReference?.messageId || '')) + (message.annotationReferences || []).filter(reference => annotationIds.has(reference.annotationId)).length, 0);
  return { turns, messageIds, annotationIds, referenceCount };
}
