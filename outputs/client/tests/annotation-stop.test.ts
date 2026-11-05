import test from 'node:test';
import assert from 'node:assert/strict';
import { streamReply } from '../src/adapters/model';
import { completeAnnotation, createAnnotation, createAssistantMessage, createConversation, createUserMessage, prepareAnnotationRequest, validateImport } from '../src/domain/workspace';

test('同一数据包里停止后不能继续接收字符或把迟到的 done 当作成功', async () => {
  const original = globalThis.fetch, controller = new AbortController(); let answer = '', requestedSignal: AbortSignal | undefined;
  globalThis.fetch = async (_url, init) => {
    requestedSignal = init?.signal as AbortSignal;
    return new Response('data: {"type":"delta","text":"已收到部分回答"}\n\ndata: {"type":"delta","text":"迟到的内容"}\n\ndata: {"type":"done"}\n\n', { headers: { 'Content-Type': 'text/event-stream' } });
  };
  try {
    await assert.rejects(streamReply({ kind: 'annotation', messages: [] }, text => { answer += text; controller.abort(); }, controller.signal), { name: 'AbortError' });
    assert.equal(answer, '已收到部分回答'); assert.equal(requestedSignal, controller.signal);
  } finally { globalThis.fetch = original; }
});

test('停止会唤醒等待中的流读取，已停止的请求不会再发出', async () => {
  const original = globalThis.fetch, controller = new AbortController(); let calls = 0, cancelled = false;
  globalThis.fetch = async () => { calls++; return new Response(new ReadableStream({ cancel() { cancelled = true; } }), { headers: { 'Content-Type': 'text/event-stream' } }); };
  try {
    const running = streamReply({ kind: 'annotation', messages: [] }, () => {}, controller.signal);
    await new Promise(resolve => setImmediate(resolve)); controller.abort();
    await assert.rejects(running, { name: 'AbortError' }); assert.equal(cancelled, true);
    await assert.rejects(streamReply({ kind: 'annotation', messages: [] }, () => {}, controller.signal), { name: 'AbortError' }); assert.equal(calls, 1);
  } finally { globalThis.fetch = original; }
});

test('中断跨保存后仍重试原上下文，成功后需显式重新提问', () => {
  const conversation = createConversation('停止与重试');
  const message = createAssistantMessage('完整原文', 'complete'); conversation.messages = [createUserMessage('原始主问题'), message];
  const annotation = createAnnotation(conversation, { messageId: message.id, versionId: message.activeVersionId, quote: '原文', anchor: {}, color: '#ffe099', question: '解释一下' }); conversation.annotations = [annotation];
  const first = prepareAnnotationRequest(conversation, annotation.id, '首次规则');
  const interrupted = { ...first.conversation, messages: [...first.conversation.messages, createUserMessage('后来的新问题')], annotations: first.conversation.annotations.map(a => ({ ...a, status: 'interrupted' as const, answer: '部分回答' })) };
  const reloaded = validateImport({ schemaVersion: 1, activeConversationId: conversation.id, conversations: [interrupted] }).conversations[0];
  const retry = prepareAnnotationRequest(reloaded, annotation.id, '后来的新规则');
  assert.deepEqual(retry.messages, first.messages); assert.equal(retry.annotation.answer, '');
  const completed = completeAnnotation(retry.conversation, annotation.id, '完整解释');
  assert.throws(() => prepareAnnotationRequest(completed, annotation.id, '再次提问'), /一次|单次/);
});
