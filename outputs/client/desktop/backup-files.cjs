const { join } = require('node:path');
const { createHash, randomUUID } = require('node:crypto');

const HASH = /^[a-f0-9]{64}$/;
const ASSET = /^([a-f0-9]{64})\.bin$/;
const TEMP = /^\.pending-[a-f0-9-]{36}$/;
const MAX_FILE_BYTES = 150 * 1024 * 1024;
const CHUNK_BYTES = 256 * 1024;

/** Raw, content-addressed copies owned by local recovery points, not the library. */
function createBackupFiles({ directory, io }) {
  const pathFor = hash => {
    if (typeof hash !== 'string' || !HASH.test(hash)) throw new Error('备份附件标识无效。');
    return join(directory, `${hash}.bin`);
  };
  const check = async reference => {
    const path = pathFor(reference.hash), info = await io.lstat(path).catch(error => { if (error.code === 'ENOENT') throw new Error('备份附件缺失或损坏，请选择其他备份。'); throw error; });
    if (!info.isFile() || info.isSymbolicLink() || info.size !== reference.size) throw new Error('备份附件缺失或损坏，请选择其他备份。');
    return path;
  };
  async function* chunks(reference) {
    const handle = await io.open(await check(reference), 'r');
    try {
      const hash = createHash('sha256'), buffer = Buffer.alloc(CHUNK_BYTES);
      let size = 0;
      while (true) {
        const { bytesRead } = await handle.read(buffer, 0, buffer.length, null);
        if (!bytesRead) break;
        size += bytesRead;
        if (size > reference.size) throw new Error('备份附件大小不匹配。');
        const chunk = buffer.subarray(0, bytesRead); hash.update(chunk); yield chunk;
      }
      if (size !== reference.size || hash.digest('hex') !== reference.hash) throw new Error('备份附件完整性校验未通过，请选择其他备份。');
    } finally { await handle.close(); }
  }
  const verify = async reference => { for await (const _chunk of chunks(reference)) { /* Incremental integrity check. */ } };
  const start = async () => {
    await io.mkdir(directory, { recursive: true });
    const temp = join(directory, `.pending-${randomUUID()}`);
    return { temp, handle: await io.open(temp, 'wx'), hash: createHash('sha256'), size: 0 };
  };
  const append = async (pending, bytes) => {
    if (!pending.handle || pending.size + bytes.length > MAX_FILE_BYTES) throw new Error('备份附件大小不匹配。');
    await pending.handle.writeFile(bytes); pending.hash.update(bytes); pending.size += bytes.length;
  };
  const abort = async pending => {
    if (!pending) return;
    await pending.handle?.close().catch(() => {}); pending.handle = undefined;
    await io.unlink(pending.temp).catch(() => {});
  };
  const finish = async pending => {
    const reference = { hash: pending.hash.digest('hex'), size: pending.size };
    try {
      await pending.handle.sync(); await pending.handle.close(); pending.handle = undefined;
      // Check the bytes actually written before trusting a new recovery copy.
      const handle = await io.open(pending.temp, 'r');
      try {
        const hash = createHash('sha256'), buffer = Buffer.alloc(CHUNK_BYTES); let size = 0;
        while (true) { const { bytesRead } = await handle.read(buffer, 0, buffer.length, null); if (!bytesRead) break; size += bytesRead; hash.update(buffer.subarray(0, bytesRead)); }
        if (size !== reference.size || hash.digest('hex') !== reference.hash) throw new Error('备份附件写入校验未通过。');
      } finally { await handle.close(); }
      try { await verify(reference); await io.unlink(pending.temp); }
      catch (error) {
        // Atomically repair an absent or damaged shared copy. Never unlink first.
        if (error.code && !['ENOENT'].includes(error.code)) throw error;
        const existing = await io.lstat(pathFor(reference.hash)).catch(failure => { if (failure.code === 'ENOENT') return undefined; throw failure; });
        if (existing?.isSymbolicLink() || (existing && !existing.isFile())) throw new Error('备份附件类型无效。');
        await io.rename(pending.temp, pathFor(reference.hash));
      }
      return reference;
    } catch (error) { await abort(pending); throw error; }
  };
  const prune = async referenced => {
    let names; try { names = await io.readdir(directory); } catch (error) { if (error.code === 'ENOENT') return; throw error; }
    for (const name of names) {
      const match = ASSET.exec(name); if (!match || referenced.has(match[1])) continue;
      const path = join(directory, name), info = await io.lstat(path);
      if (info.isFile() && !info.isSymbolicLink()) await io.unlink(path);
    }
  };
  const cleanTemps = async () => {
    let names; try { names = await io.readdir(directory); } catch (error) { if (error.code === 'ENOENT') return; throw error; }
    for (const name of names.filter(name => TEMP.test(name))) {
      const path = join(directory, name), info = await io.lstat(path);
      if (info.isFile() && !info.isSymbolicLink()) await io.unlink(path);
    }
  };
  return { start, append, finish, abort, check, verify, chunks, prune, cleanTemps };
}
module.exports = { createBackupFiles, MAX_FILE_BYTES, CHUNK_BYTES };
