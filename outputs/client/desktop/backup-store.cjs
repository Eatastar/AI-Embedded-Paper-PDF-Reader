const fs = require('node:fs/promises');
const { join } = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const { createBackupFiles } = require('./backup-files.cjs');
const { readLegacyBackup } = require('./backup-legacy.cjs');
const { createBackupStream, sharedFrom, SHARED_NAME, SHARED_FORMAT, MAX_BYTES } = require('./backup-stream.cjs');

const NAME = /^(\d{13})-([a-f0-9]{64})\.json$/;
const TEMP = /^\.pending-[a-f0-9-]{36}$/;
const digest = data => createHash('sha256').update(data).digest('hex');
const nameParts = id => typeof id === 'string' ? NAME.exec(id) || SHARED_NAME.exec(id) : null;

/** One writer per desktop profile. New recovery points share immutable binary
 * attachments; legacy self-contained backups remain readable and rotate normally. */
function createBackupStore({ directory, retain = 5, io = fs, now = Date.now, version }) {
  let queue = Promise.resolve(), prepared = false, migrationAttempted = false, streaming;
  const redirects = new Map();
  const serial = run => { const result = queue.catch(() => {}).then(run); queue = result; return result; };
  const assets = createBackupFiles({ directory: join(directory, 'Attachments'), io });
  const deletionPath = join(directory, '_pending-backup-deletion.json');
  const verify = async (path, checksum) => {
    const handle = await io.open(path, 'r');
    try {
      const hash = createHash('sha256'), buffer = Buffer.alloc(256 * 1024); let size = 0;
      while (true) { const { bytesRead } = await handle.read(buffer, 0, buffer.length, null); if (!bytesRead) break; size += bytesRead; if (size > MAX_BYTES) throw new Error('备份超过 350 MB。'); hash.update(buffer.subarray(0, bytesRead)); }
      if (hash.digest('hex') !== checksum) throw new Error('这份备份的完整性校验未通过，请选择其他备份。');
    } finally { await handle.close(); }
  };
  const readIndex = async (name, pattern, maximum) => {
    try {
      const entries = JSON.parse(await io.readFile(join(directory, name), 'utf8'));
      if (!Array.isArray(entries) || entries.length > maximum || entries.some(id => typeof id !== 'string' || !pattern.test(id))) throw new Error('invalid baseline index');
      return entries;
    } catch (error) {
      if (error.code === 'ENOENT') return [];
      throw new Error('升级前备份保护信息暂时无法读取，旧备份未清理。请先导出备份后重试。');
    }
  };
  // Keep the older index readable by v0.1.35 and earlier. Shared snapshot IDs
  // live separately, so an older app never mistakes one for a complete JSON.
  const readBaselines = async () => [...await readIndex('_upgrade-baselines.json', NAME, 2), ...await readIndex('_shared-upgrade-baselines.json', SHARED_NAME, 4)];
  const atomicWrite = async (target, text) => {
    const temp = join(directory, `.pending-${randomUUID()}`); let handle;
    try {
      handle = await io.open(temp, 'wx'); await handle.writeFile(text, 'utf8'); await handle.sync(); await handle.close(); handle = undefined;
      await io.rename(temp, target);
    } catch (error) { await handle?.close().catch(() => {}); await io.unlink(temp).catch(() => {}); throw error; }
  };
  const prepare = async () => {
    await io.mkdir(directory, { recursive: true }); await recoverDeletion(); await readBaselines();
    if (prepared) return;
    // No stream is active during first preparation; these are only our own
    // abandoned temporary files from a previous desktop process.
    for (const name of (await io.readdir(directory)).filter(name => TEMP.test(name))) {
      const path = join(directory, name), info = await io.lstat(path);
      if (info.isFile() && !info.isSymbolicLink()) await io.unlink(path);
    }
    await assets.cleanTemps(); prepared = true;
  };
  const list = async () => {
    let names; try { names = await io.readdir(directory); } catch (error) { if (error.code === 'ENOENT') return []; throw error; }
    const baselines = await readBaselines().catch(() => []);
    const entries = await Promise.all(names.filter(name => nameParts(name)).map(async id => {
      const info = await io.lstat(join(directory, id));
      if (!info.isFile() || info.isSymbolicLink()) return undefined;
      return { id, createdAt: Number(nameParts(id)[1]), size: info.size, ...(SHARED_NAME.test(id) ? { sharedAttachments: true } : {}), ...(baselines.includes(id) ? { baseline: true } : {}) };
    }));
    return entries.filter(Boolean).sort((a, b) => b.createdAt - a.createdAt || b.id.localeCompare(a.id));
  };
  const readChecked = async id => {
    const parts = nameParts(id); if (!parts) throw new Error('备份名称无效。');
    const path = join(directory, id), info = await io.lstat(path);
    if (!info.isFile() || info.isSymbolicLink() || info.size > MAX_BYTES) throw new Error('备份大小或类型无效。');
    const bytes = await io.readFile(path);
    if (digest(bytes) !== parts[2]) throw new Error('这份备份的完整性校验未通过，请选择其他备份。');
    return bytes.toString('utf8');
  };
  const read = id => serial(async () => {
    id = redirects.get(id) || id;
    const text = await readChecked(id); if (!SHARED_NAME.test(id)) return text;
    const snapshot = sharedFrom(text), metadata = JSON.stringify(snapshot.metadata);
    if (!snapshot.files.length) return metadata;
    const parts = [metadata.slice(0, -1), ',"documentFiles":['];
    for (let index = 0; index < snapshot.files.length; index++) {
      const file = snapshot.files[index];
      parts.push(`${index ? ',' : ''}{"documentId":${JSON.stringify(file.documentId)},"data":"`);
      let carry = Buffer.alloc(0);
      // Nothing leaves this call until every referenced attachment is verified.
      for await (const chunk of assets.chunks(file)) {
        const bytes = Buffer.concat([carry, chunk]), length = bytes.length - bytes.length % 3;
        parts.push(bytes.subarray(0, length).toString('base64')); carry = Buffer.from(bytes.subarray(length));
      }
      parts.push(carry.toString('base64'), '"}');
    }
    parts.push(']}'); return parts.join('');
  });
  const setProtected = async (desired, protectedIds) => {
    const next = [...new Set(desired)].sort((a, b) => Number(nameParts(b)[1]) - Number(nameParts(a)[1])).slice(0, 2);
    const oldShared = protectedIds.filter(value => SHARED_NAME.test(value)), nextShared = next.filter(value => SHARED_NAME.test(value));
    // Add new protection before removing old protection. A crash between these
    // writes may retain an extra recovery point, but cannot lose the new one.
    if (oldShared.length || nextShared.length) await atomicWrite(join(directory, '_shared-upgrade-baselines.json'), JSON.stringify([...new Set([...oldShared, ...nextShared])].sort((a, b) => Number(nameParts(b)[1]) - Number(nameParts(a)[1])).slice(0, 4)));
    await atomicWrite(join(directory, '_upgrade-baselines.json'), JSON.stringify(next.filter(value => NAME.test(value))));
    if (oldShared.length || nextShared.length) await atomicWrite(join(directory, '_shared-upgrade-baselines.json'), JSON.stringify(nextShared));
  };
  const protect = async (id, previous, protectedIds) => {
    // Retry all stages even if a prior partial write already added this ID.
    await setProtected([id, ...previous.filter(entry => protectedIds.includes(entry.id) && entry.id !== id).map(entry => entry.id)], protectedIds);
  };
  const recoverDeletion = async () => {
    let info; try { info = await io.lstat(deletionPath); } catch (error) { if (error.code === 'ENOENT') return; throw error; }
    if (!info.isFile() || info.isSymbolicLink() || info.size > 8192) throw new Error('备份删除状态无法确认，旧备份未清理。请先导出备份后重试。');
    let pending; try { pending = JSON.parse(await io.readFile(deletionPath, 'utf8')); } catch { throw new Error('备份删除状态无法确认，旧备份未清理。请先导出备份后重试。'); }
    if (!pending || !nameParts(pending.id) || !Array.isArray(pending.protectedIds) || pending.protectedIds.length > 6 || pending.protectedIds.some(id => !nameParts(id))) throw new Error('备份删除状态无法确认，旧备份未清理。请先导出备份后重试。');
    const existing = await io.lstat(join(directory, pending.id)).catch(error => { if (error.code === 'ENOENT') return undefined; throw error; });
    // If unlink never completed, restore the original protection. Otherwise
    // complete the requested deletion without protecting a missing file.
    await setProtected(existing ? pending.protectedIds : pending.protectedIds.filter(id => id !== pending.id), await readBaselines());
    await io.unlink(deletionPath);
  };
  const checkedEntries = async () => {
    const pending = await io.lstat(deletionPath).catch(error => { if (error.code === 'ENOENT') return undefined; throw error; });
    if (pending) throw new Error('备份删除状态无法确认，旧备份未清理。请先导出备份后重试。');
    const protectedIds = await readBaselines(), entries = await list(), ids = new Set(entries.map(entry => entry.id));
    if (protectedIds.some(id => !ids.has(id))) throw new Error('升级前备份保护信息暂时无法读取，旧备份未清理。请先导出备份后重试。');
    return entries;
  };
  const collect = async () => {
    const referenced = new Set();
    for (const entry of await checkedEntries()) if (entry.sharedAttachments) {
      // A single unreadable manifest stops GC; its attachments may still matter.
      const snapshot = sharedFrom(await readChecked(entry.id));
      for (const file of snapshot.files) referenced.add(file.hash);
    }
    await assets.prune(referenced);
  };
  const rotate = async () => {
    for (const entry of (await checkedEntries()).filter(entry => !entry.baseline).slice(retain)) await io.unlink(join(directory, entry.id)).catch(() => {});
    await collect();
  };
  const migrateLegacy = async () => {
    if (migrationAttempted) return;
    migrationAttempted = true;
    for (const entry of (await list()).filter(entry => !entry.sharedAttachments)) {
      try {
        const snapshot = await readLegacyBackup({ path: join(directory, entry.id), checksum: NAME.exec(entry.id)[2], io, assets });
        const replacement = await commitShared(snapshot.metadata, snapshot.files, { migrating: true, createdAt: entry.createdAt, replaceId: entry.id });
        // The replacement and its protection are durable before removing the
        // old embedded copies. Unsupported or damaged old files stay untouched.
        redirects.set(entry.id, replacement.id);
        await io.unlink(join(directory, entry.id));
      } catch { /* Keep the original; normal retention still applies. */ }
    }
  };
  const commitShared = async (metadata, files, options) => {
    const canonical = sharedFrom(JSON.stringify({ format: SHARED_FORMAT, metadata, files }));
    const text = JSON.stringify({ format: SHARED_FORMAT, metadata: canonical.metadata, files: canonical.files });
    if (Buffer.byteLength(text) > MAX_BYTES) throw new Error('完整备份超过 350 MB。');
    for (const file of files) await assets.check(file);
    const protectedIds = await readBaselines(), previous = await list(), checksum = digest(text); let same;
    const candidate = options.migrating ? previous.find(entry => entry.sharedAttachments && entry.id.endsWith(`-${checksum}.snapshot.json`)) : previous[0];
    if (candidate?.sharedAttachments && candidate.id.endsWith(`-${checksum}.snapshot.json`)) {
      try { await verify(join(directory, candidate.id), checksum); same = candidate; } catch { /* Repair a damaged manifest. */ }
    }
    const createdAt = options.createdAt ?? Math.max(now(), (previous[0]?.createdAt || 0) + 1), id = same?.id || `${createdAt}-${checksum}.snapshot.json`;
    if (!same) { await atomicWrite(join(directory, id), text); await verify(join(directory, id), checksum); }
    if (options.replaceId && protectedIds.includes(options.replaceId)) await setProtected(protectedIds.map(value => value === options.replaceId ? id : value), protectedIds);
    else if (options.baseline) await protect(id, previous, protectedIds);
    if (options.upgrade && version) await atomicWrite(join(directory, '_app-data-version.json'), JSON.stringify({ version, backupId: id }));
    if (!options.migrating) { await migrateLegacy().catch(() => {}); await rotate().catch(() => {}); }
    return { id, createdAt: same?.createdAt || createdAt, size: Buffer.byteLength(text), sharedAttachments: true, ...((await readBaselines()).includes(id) ? { baseline: true } : {}) };
  };
  // Compatibility entry points for older bridges and legacy migration backups.
  const write = (text, baseline = false) => serial(async () => {
    if (streaming?.active) throw new Error('另一份备份仍在写入，请稍后重试。');
    if (typeof text !== 'string' || Buffer.byteLength(text) > MAX_BYTES) throw new Error('完整备份超过 350 MB。');
    let data; try { data = JSON.parse(text); } catch { throw new Error('备份格式无效。'); }
    const legacy = data?.schemaVersion === 1 && Array.isArray(data.conversations) && data.conversations.length && Object.keys(data).every(key => ['schemaVersion', 'conversations', 'activeConversationId', 'documentFiles'].includes(key));
    const compact = data?.schemaVersion === 2 && Array.isArray(data.conversationIds) && data.conversationIds.length && Array.isArray(data.records) && Object.keys(data).every(key => ['schemaVersion', 'conversationIds', 'activeConversationId', 'records', 'documentFiles'].includes(key));
    if ((!legacy && !compact) || (baseline && !legacy)) throw new Error('备份格式无效。');
    await prepare(); const protectedIds = await readBaselines(), previous = await list(), checksum = digest(text); let same;
    if (previous[0]?.id.endsWith(`-${checksum}.json`)) { try { await verify(join(directory, previous[0].id), checksum); same = previous[0]; } catch {} }
    const createdAt = Math.max(now(), (previous[0]?.createdAt || 0) + 1), id = same?.id || `${createdAt}-${checksum}.json`;
    if (!same) { await atomicWrite(join(directory, id), text); await verify(join(directory, id), checksum); }
    if (baseline) await protect(id, previous, protectedIds);
    await rotate().catch(() => {});
    return { id, createdAt: same?.createdAt || createdAt, size: Buffer.byteLength(text), ...(baseline || protectedIds.includes(id) ? { baseline: true } : {}) };
  });
  const upgradeNeeded = async () => {
    if (!version) return false;
    try { const saved = JSON.parse(await io.readFile(join(directory, '_app-data-version.json'), 'utf8')); return saved.version !== version; } catch { return true; }
  };
  const remove = id => serial(async () => {
    if (!nameParts(id)) throw new Error('备份名称无效。');
    if (streaming?.active) throw new Error('另一份备份仍在写入，请稍后重试。');
    await prepare();
    let info = await io.lstat(join(directory, id)).catch(error => { if (error.code === 'ENOENT') return undefined; throw error; });
    // A still-existing legacy file is its own entry. Only follow an alias for
    // a stale list entry whose old file has already been converted away.
    if (!info && redirects.has(id)) { id = redirects.get(id); info = await io.lstat(join(directory, id)).catch(error => { if (error.code === 'ENOENT') return undefined; throw error; }); }
    if (info && (!info.isFile() || info.isSymbolicLink())) throw new Error('备份大小或类型无效。');
    const protectedIds = await readBaselines();
    if (info || protectedIds.includes(id)) {
      await atomicWrite(deletionPath, JSON.stringify({ id, protectedIds }));
      try {
        await setProtected(protectedIds.filter(value => value !== id), protectedIds);
        if (info) await io.unlink(join(directory, id));
        await io.unlink(deletionPath);
      } catch (error) {
        try { await recoverDeletion(); }
        catch { throw new Error('备份删除状态无法确认，旧备份未清理。请先导出备份后重试。'); }
        if (await io.lstat(join(directory, id)).catch(failure => { if (failure.code === 'ENOENT') return undefined; throw failure; })) throw error;
      }
    }
    let cleanupPending = false; try { await collect(); } catch { cleanupPending = true; }
    return { cleanupPending };
  });
  streaming = createBackupStream({ serial, assets, prepare, commit: commitShared, collect });
  return { list, read, write: text => write(text), baseline: text => write(text, true), remove, ...streaming.api, upgradeNeeded };
}
module.exports = { createBackupStore };
