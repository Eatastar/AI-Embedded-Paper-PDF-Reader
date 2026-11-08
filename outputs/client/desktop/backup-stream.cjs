const { randomUUID } = require('node:crypto');
const MAX_BYTES = 350_000_000;
const SHARED_FORMAT = 'shared-attachments-v1';
const SHARED_NAME = /^(\d{13})-([a-f0-9]{64})\.snapshot\.json$/;
const HASH = /^[a-f0-9]{64}$/;

function metadataFrom(text) {
  if (typeof text !== 'string' || Buffer.byteLength(text) > MAX_BYTES) throw new Error('备份格式无效。');
  let data; try { data = JSON.parse(text); } catch { throw new Error('备份格式无效。'); }
  const legacy = data?.schemaVersion === 1 && Array.isArray(data.conversations) && data.conversations.length && Object.keys(data).every(key => ['schemaVersion', 'conversations', 'activeConversationId'].includes(key));
  const compact = data?.schemaVersion === 2 && Array.isArray(data.conversationIds) && data.conversationIds.length && Array.isArray(data.records) && Object.keys(data).every(key => ['schemaVersion', 'conversationIds', 'activeConversationId', 'records'].includes(key));
  if (!legacy && !compact) throw new Error('备份格式无效。');
  const attachments = legacy ? data.conversations.flatMap(item => item.documents || []) : data.records.filter(item => item.kind === 'document').map(item => item.data);
  const expected = new Map();
  for (const item of attachments) {
    if (!item || typeof item.id !== 'string' || !item.id || item.id.length > 200 || !Number.isSafeInteger(item.size) || item.size < 0 || item.size > 150 * 1024 * 1024 || expected.has(item.id)) throw new Error('备份附件无效。');
    expected.set(item.id, item.size);
  }
  return { data, expected };
}
function filesFrom(metadata, files, shared = false) {
  if (!Array.isArray(files) || files.length > 10000) throw new Error('备份附件无效。');
  const ids = new Set();
  for (const file of files) {
    if (!file || typeof file.documentId !== 'string' || ids.has(file.documentId) || !metadata.expected.has(file.documentId) || metadata.expected.get(file.documentId) !== file.size || (shared && (typeof file.hash !== 'string' || !HASH.test(file.hash)))) throw new Error('备份附件无效。');
    ids.add(file.documentId);
  }
  if (metadata.expected.size !== ids.size) throw new Error('备份附件不完整。');
  const estimate = Buffer.byteLength(JSON.stringify(metadata.data)) + files.reduce((sum, file) => sum + Math.ceil(file.size / 3) * 4 + Buffer.byteLength(JSON.stringify(file.documentId)) + 64, 0) + 64;
  if (estimate > MAX_BYTES) throw new Error('完整备份超过 350 MB。');
  return files.map(file => ({ documentId: file.documentId, size: file.size, ...(shared ? { hash: file.hash } : {}) }));
}
function sharedFrom(text) {
  let data; try { data = JSON.parse(text); } catch { throw new Error('备份格式无效。'); }
  if (!data || data.format !== SHARED_FORMAT || Object.keys(data).some(key => !['format', 'metadata', 'files'].includes(key))) throw new Error('备份格式无效。');
  const metadata = metadataFrom(JSON.stringify(data.metadata));
  return { metadata: metadata.data, files: filesFrom(metadata, data.files, true) };
}

/** Bounded raw IPC writes one temporary attachment at a time. Recovery points
 * reference verified content-addressed copies instead of embedding Base64. */
function createBackupStream({ serial, assets, prepare, commit, collect }) {
  let stream;
  const abortCurrent = async () => {
    const current = stream; stream = undefined;
    if (!current) return;
    clearTimeout(current.timer); await assets.abort(current.pending);
    await collect().catch(() => {});
  };
  const touch = current => {
    clearTimeout(current.timer);
    current.timer = setTimeout(() => { void serial(async () => { if (stream === current) await abortCurrent(); }); }, 120000);
    current.timer.unref?.();
  };
  const emptyFiles = async current => {
    while (current.files[current.index]?.size === 0) {
      current.pending = await assets.start();
      const file = await assets.finish(current.pending); current.pending = undefined;
      current.references.push({ documentId: current.files[current.index].documentId, ...file }); current.index++;
    }
  };
  const get = id => { if (!stream || stream.id !== id) throw new Error('备份任务已经关闭，请重试。'); touch(stream); return stream; };
  const begin = input => serial(async () => {
    if (stream) throw new Error('另一份备份正在写入，请稍后重试。');
    const metadata = metadataFrom(input?.metadata), files = filesFrom(metadata, input.files);
    await prepare();
    stream = { id: randomUUID(), metadata: metadata.data, files, references: [], index: 0, received: 0, baseline: input.baseline === true || input.upgrade === true, upgrade: input.upgrade === true };
    try { touch(stream); await emptyFiles(stream); return stream.id; }
    catch (error) { await abortCurrent(); throw error; }
  });
  const append = input => serial(async () => {
    const current = get(input?.id);
    try {
      if (input.index !== current.index || !(input.bytes instanceof Uint8Array) || !input.bytes.length || input.bytes.length > 256 * 1024) throw new Error('备份分块无效。');
      const file = current.files[current.index];
      if (!file || current.received + input.bytes.length > file.size) throw new Error('备份附件大小不匹配。');
      if (!current.pending) current.pending = await assets.start();
      await assets.append(current.pending, input.bytes); current.received += input.bytes.length;
      if (current.received === file.size) {
        const saved = await assets.finish(current.pending); current.pending = undefined;
        current.references.push({ documentId: file.documentId, ...saved }); current.index++; current.received = 0;
        await emptyFiles(current);
      }
    } catch (error) { await abortCurrent(); throw error; }
  });
  const finish = id => serial(async () => {
    const current = get(id);
    try {
      if (current.index !== current.files.length) throw new Error('备份附件不完整，旧备份已保留。');
      const entry = await commit(current.metadata, current.references, { baseline: current.baseline, upgrade: current.upgrade });
      clearTimeout(current.timer); stream = undefined;
      return entry;
    } catch (error) { await abortCurrent(); throw error; }
  });
  return { get active() { return Boolean(stream); }, api: { begin, append, finish, abort: id => serial(async () => { if (id === undefined || stream?.id === id) await abortCurrent(); }) } };
}
module.exports = { createBackupStream, metadataFrom, filesFrom, sharedFrom, SHARED_NAME, SHARED_FORMAT, MAX_BYTES };
