import assert from 'node:assert/strict';
import test from 'node:test';
import { chatPosition, loadChatPosition, saveChatPosition, pruneChatPositions } from '../src/adapters/chat-position';
import type { ChatPosition } from '../src/adapters/chat-position';

function storage(): Storage {
  const data = new Map<string, string>();
  return { get length() { return data.size; }, getItem: key => data.get(key) ?? null, setItem: (key, value) => { data.set(key, value); }, removeItem: key => { data.delete(key); }, key: index => [...data.keys()][index] ?? null, clear: () => data.clear() };
}
const middle: ChatPosition = { scrollTop: 1543.5, atBottom: false, anchor: { messageId: 'synthetic-answer', versionId: 'synthetic-version', messageIndex: 5, blockIndex: 8, offset: -13.25, fraction: .25 } };

test('chat position saves only whitelisted reading metadata without copying content or credentials', () => {
  const target = storage();
  assert.ok(saveChatPosition('synthetic-conversation', { ...middle, text: 'SYNTHETIC_PRIVATE_TEXT', apiKey: 'fake-test-key', anchor: { ...middle.anchor!, text: 'SYNTHETIC_QUOTED_TEXT' } } as ChatPosition, target));
  const raw = target.getItem(target.key(0)!)!;
  assert.doesNotMatch(raw, /SYNTHETIC_PRIVATE_TEXT|SYNTHETIC_QUOTED_TEXT|fake-test-key|apiKey/);
  assert.deepEqual(loadChatPosition('synthetic-conversation', target), middle);
});
test('separate conversations retain independent middle, top and bottom positions across a fresh read', () => {
  const target = storage();
  saveChatPosition('synthetic/a', middle, target);
  saveChatPosition('synthetic%2Fa', { scrollTop: 9999, atBottom: true }, target);
  saveChatPosition('synthetic-top', { scrollTop: 0, atBottom: false }, target);
  assert.equal(target.length, 3);
  assert.deepEqual(loadChatPosition('synthetic/a', target), middle);
  assert.deepEqual(loadChatPosition('synthetic%2Fa', target), { scrollTop: 9999, atBottom: true });
  assert.deepEqual(loadChatPosition('synthetic-top', target), { scrollTop: 0, atBottom: false });
  assert.equal(loadChatPosition('different-conversation', target), null);
});
test('corrupt position data and invalid bounds safely fall back without invalid anchors', () => {
  const target = storage(); saveChatPosition('synthetic', middle, target);const key = target.key(0)!;
  for (const raw of ['{broken', 'null', '{"scrollTop":-1,"atBottom":false}', '{"scrollTop":0,"atBottom":"false"}']) { target.setItem(key, raw); assert.equal(loadChatPosition('synthetic', target), null); }
  for (const change of [{ messageIndex: -1 }, { blockIndex: .5 }, { fraction: 2 }, { offset: Infinity }, { messageId: '' }, { versionId: 'v'.repeat(201) }]) assert.deepEqual(chatPosition({ ...middle, anchor: { ...middle.anchor, ...change } }), { scrollTop: middle.scrollTop, atBottom: false });
  assert.equal(chatPosition({ scrollTop: NaN, atBottom: true }), null);
  assert.equal(chatPosition({ scrollTop: 1e10, atBottom: true }), null);
});
test('restricted preference storage and invalid conversation identifiers cannot interrupt chat', () => {
  const blocked = { getItem() { throw Error('synthetic denied storage'); }, setItem() { throw Error('synthetic denied storage'); } };
  assert.equal(loadChatPosition('synthetic', blocked), null);
  assert.equal(saveChatPosition('synthetic', middle, blocked), false);
  assert.equal(saveChatPosition('', middle, storage()), false);
  assert.equal(loadChatPosition('x'.repeat(201), storage()), null);
});
test('permanent conversation removal prunes only its position, preserving current and recycled conversations', () => {
  const target = storage();
  for (const id of ['current', 'recycled', 'removed-first', 'removed-second']) saveChatPosition(id, middle, target);
  target.setItem('learn-something.reader.session.v1', 'synthetic-reader-session');target.setItem('synthetic-unrelated', 'keep');
  pruneChatPositions(['current', 'recycled'], target);
  assert.equal(target.length, 4);
  assert.deepEqual(loadChatPosition('current', target), middle);
  assert.deepEqual(loadChatPosition('recycled', target), middle);
  assert.equal(loadChatPosition('removed-first', target), null); assert.equal(loadChatPosition('removed-second', target), null);
  assert.equal(target.getItem('learn-something.reader.session.v1'), 'synthetic-reader-session');assert.equal(target.getItem('synthetic-unrelated'), 'keep');
});
