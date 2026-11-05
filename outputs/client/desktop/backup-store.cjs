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
  const list = async () => {
    let names;
    try { names = await io.readdir(directory); } catch (error) { if (error.code === 'ENOENT') return []; throw error; }
    const entries = await Promise.all(names.filter(name => NAME.test(name)).map(async id => {
      const info = await io.stat(join(directory, id));
      return { id, createdAt: Number(NAME.exec(id)[1]), size: info.size };
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
  const write = text => {
    const result = queue.catch(() => {}).then(async () => {
      if (typeof text !== 'string' || Buffer.byteLength(text) > MAX_BYTES) throw new Error('完整备份超过 350 MB。');
      let data;
      try { data = JSON.parse(text); } catch { throw new Error('备份格式无效。'); }
      if (data?.schemaVersion !== 1 || !Array.isArray(data.conversations) || !data.conversations.length || Object.keys(data).some(key => !['schemaVersion', 'conversations', 'activeConversationId', 'documentFiles'].includes(key))) throw new Error('备份格式无效。');
      await io.mkdir(directory, { recursive: true });
      const previous = await list();
      const checksum = digest(text);
      if (previous[0]?.id.endsWith(`-${checksum}.json`)) {
        try { await read(previous[0].id); return previous[0]; } catch { /* Replace damaged content with a fresh verified checkpoint. */ }
      }
      const createdAt = Math.max(now(), (previous[0]?.createdAt || 0) + 1);
      const id = `${createdAt}-${checksum}.json`, temp = join(directory, `.pending-${randomUUID()}`);
      let handle;
      try {
        handle = await io.open(temp, 'wx');
        await handle.writeFile(text, 'utf8'); await handle.sync(); await handle.close(); handle = undefined;
        await io.rename(temp, join(directory, id));
        await read(id);
      } catch (error) {
        await handle?.close().catch(() => {}); await io.unlink(temp).catch(() => {}); throw error;
      }
      // A cleanup failure cannot invalidate the newly committed backup.
      for (const entry of (await list()).slice(retain)) await io.unlink(join(directory, entry.id)).catch(() => {});
      return { id, createdAt, size: Buffer.byteLength(text) };
    });
    queue = result;
    return result;
  };
  return { list, read, write };
}
module.exports = { createBackupStore };
