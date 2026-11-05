const fs = require('node:fs/promises');
const { join } = require('node:path');
const { createHash, randomUUID } = require('node:crypto');

const MAX_BYTES = 350_000_000;
const NAME = /^(\d{13})-([a-f0-9]{64})\.json$/;
const digest = data => createHash('sha256').update(data).digest('hex');

/** Complete, local-only checkpoints. A rename commits a verified file atomically;
 * previous backups are rotated only after the new one has been written and synced. */
function createBackupStore({ directory, retain = 5, io = fs, now = Date.now }) {
  let queue = Promise.resolve();
  const readBaselines = async () => {
    try {
      const entries = JSON.parse(await io.readFile(join(directory, '_upgrade-baselines.json'), 'utf8'));
      if (!Array.isArray(entries) || entries.length > 2 || entries.some(id => typeof id !== 'string' || !NAME.test(id))) throw new Error('invalid baseline index');
      return entries;
    } catch (error) {
      if (error.code === 'ENOENT') return [];
      throw new Error('升级前备份保护信息暂时无法读取，旧备份未清理。请先导出备份后重试。');
    }
  };
  const atomicWrite = async (target, text) => {
    const temp = join(directory, `.pending-${randomUUID()}`); let handle;
    try {
      handle = await io.open(temp, 'wx');
      await handle.writeFile(text, 'utf8'); await handle.sync(); await handle.close(); handle = undefined;
      await io.rename(temp, target);
    } catch (error) { await handle?.close().catch(() => {}); await io.unlink(temp).catch(() => {}); throw error; }
  };
  const list = async () => {
    let names;
    try { names = await io.readdir(directory); } catch (error) { if (error.code === 'ENOENT') return []; throw error; }
    const baselines = await readBaselines().catch(() => []);
    const entries = await Promise.all(names.filter(name => NAME.test(name)).map(async id => {
      const info = await io.stat(join(directory, id));
      return { id, createdAt: Number(NAME.exec(id)[1]), size: info.size, ...(baselines.includes(id) ? { baseline: true } : {}) };
    }));
    return entries.sort((a, b) => b.createdAt - a.createdAt || b.id.localeCompare(a.id));
  };
  const read = async id => {
    if (typeof id !== 'string' || !NAME.test(id)) throw new Error('备份名称无效。');
    const path = join(directory, id), info = await io.stat(path);
    if (!info.isFile() || info.size > MAX_BYTES) throw new Error('备份大小或类型无效。');
    const bytes = await io.readFile(path);
    if (digest(bytes) !== NAME.exec(id)[2]) throw new Error('这份备份的完整性校验未通过，请选择其他备份。');
    return bytes.toString('utf8');
  };
  const write = (text, baseline = false) => {
    const result = queue.catch(() => {}).then(async () => {
      if (typeof text !== 'string' || Buffer.byteLength(text) > MAX_BYTES) throw new Error('完整备份超过 350 MB。');
      let data;
      try { data = JSON.parse(text); } catch { throw new Error('备份格式无效。'); }
      const legacy = data?.schemaVersion === 1 && Array.isArray(data.conversations) && data.conversations.length && Object.keys(data).every(key => ['schemaVersion', 'conversations', 'activeConversationId', 'documentFiles'].includes(key));
      const compact = data?.schemaVersion === 2 && Array.isArray(data.conversationIds) && data.conversationIds.length && Array.isArray(data.records) && Object.keys(data).every(key => ['schemaVersion', 'conversationIds', 'activeConversationId', 'records', 'documentFiles'].includes(key));
      if ((!legacy && !compact) || (baseline && !legacy)) throw new Error('备份格式无效。');
      await io.mkdir(directory, { recursive: true });
      const protectedIds = await readBaselines();
      const previous = await list();
      const checksum = digest(text);
      let same;
      if (previous[0]?.id.endsWith(`-${checksum}.json`)) {
        try { await read(previous[0].id); same = previous[0]; } catch { /* Replace damaged content with a fresh verified checkpoint. */ }
      }
      const createdAt = Math.max(now(), (previous[0]?.createdAt || 0) + 1);
      const id = same?.id || `${createdAt}-${checksum}.json`;
      if (!same) { await atomicWrite(join(directory, id), text); await read(id); }
      if (baseline && !protectedIds.includes(id)) {
        const next = [id, ...protectedIds.filter(name => previous.some(entry => entry.id === name))].slice(0, 2);
        await atomicWrite(join(directory, '_upgrade-baselines.json'), JSON.stringify(next));
      }
      // A cleanup failure cannot invalidate the newly committed backup.
      for (const entry of (await list()).filter(entry => !entry.baseline).slice(retain)) await io.unlink(join(directory, entry.id)).catch(() => {});
      return { id, createdAt: same?.createdAt || createdAt, size: Buffer.byteLength(text), ...(baseline || protectedIds.includes(id) ? { baseline: true } : {}) };
    });
    queue = result;
    return result;
  };
  return { list, read, write: text => write(text), baseline: text => write(text, true) };
}
module.exports = { createBackupStore };
