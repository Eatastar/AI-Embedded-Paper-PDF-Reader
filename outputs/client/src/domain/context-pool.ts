import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import type { InputMessage } from './types';

const encoder = new TextEncoder();
export const contentHash = (text: string) => bytesToHex(sha256(encoder.encode(text)));
const messages = new Map<string, Map<string, WeakRef<InputMessage>>>();
const snapshots = new Map<string, WeakRef<InputMessage[]>>();
const frozenSnapshots = new WeakSet<InputMessage[]>();
const messageIds = new WeakMap<InputMessage, string>();
const cleanupMessage = new FinalizationRegistry<{ map: Map<string, WeakRef<InputMessage>>; content: string; ref: WeakRef<InputMessage> }>(entry => {
  if (entry.map.get(entry.content) === entry.ref) entry.map.delete(entry.content);
});
const cleanupSnapshot = new FinalizationRegistry<{ key: string; ref: WeakRef<InputMessage[]> }>(entry => {
  if (snapshots.get(entry.key) === entry.ref) snapshots.delete(entry.key);
});

/** Share immutable values, with weak ownership so removed papers can be collected. */
export function internMessage(message: InputMessage): InputMessage {
  let map = messages.get(message.role);
  if (!map) { map = new Map(); messages.set(message.role, map); }
  const existing = map.get(message.content)?.deref();
  if (existing) return existing;
  const value = Object.freeze({ role: message.role, content: message.content });
  const ref = new WeakRef(value); map.set(value.content, ref);
  cleanupMessage.register(value, { map, content: value.content, ref });
  return value;
}

export function contextMessageId(message: InputMessage): string {
  const shared = internMessage(message);
  let id = messageIds.get(shared);
  if (!id) { id = contentHash(JSON.stringify(shared)); messageIds.set(shared, id); }
  return id;
}

export function freezeContext(input: InputMessage[]): InputMessage[] {
  if (frozenSnapshots.has(input)) return input;
  const values = input.map(internMessage);
  const key = values.map(contextMessageId).join(':');
  const existing = snapshots.get(key)?.deref();
  if (existing) return existing;
  // Keep the existing public type while enforcing immutability at runtime.
  const value = Object.freeze(values) as unknown as InputMessage[];
  frozenSnapshots.add(value);
  const ref = new WeakRef(value); snapshots.set(key, ref);
  cleanupSnapshot.register(value, { key, ref });
  return value;
}
