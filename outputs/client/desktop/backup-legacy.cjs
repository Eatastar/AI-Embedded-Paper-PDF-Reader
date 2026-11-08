const { createHash } = require('node:crypto');
const { metadataFrom, filesFrom, MAX_BYTES } = require('./backup-stream.cjs');

/** Reads the attachments-last JSON produced by the app without ever collecting
 * an entire Base64 PDF string. Other layouts are left intact, not guessed at. */
class LegacyReader {
  constructor(handle) { this.handle = handle; this.buffer = Buffer.alloc(0); this.position = 0; this.size = 0; this.hash = createHash('sha256'); }
  async peek() {
    if (this.position < this.buffer.length) return this.buffer[this.position];
    const buffer = Buffer.allocUnsafe(256 * 1024), { bytesRead } = await this.handle.read(buffer, 0, buffer.length, null);
    this.buffer = buffer.subarray(0, bytesRead); this.position = 0; this.size += bytesRead;
    if (this.size > MAX_BYTES) throw new Error('备份超过 350 MB。');
    if (bytesRead) { this.hash.update(this.buffer); return this.buffer[0]; }
  }
  async take() { const value = await this.peek(); if (value !== undefined) this.position++; return value; }
  async space() { while ([9, 10, 13, 32].includes(await this.peek())) this.position++; }
  async expect(value) { await this.space(); if (await this.take() !== value.charCodeAt(0)) throw new Error('旧备份格式暂不支持自动转换。'); }
  async string() {
    await this.expect('"'); const bytes = [34]; let escape = false;
    while (true) {
      const value = await this.take();
      if (value === undefined || bytes.length > 4096) throw new Error('旧备份格式暂不支持自动转换。');
      bytes.push(value);
      if (!escape && value === 34) return JSON.parse(Buffer.from(bytes).toString('utf8'));
      if (!escape && value === 92) escape = true; else escape = false;
    }
  }
  async value() {
    await this.space(); const parts = []; let depth = 0, quoted = false, escape = false;
    while (await this.peek() !== undefined) {
      const start = this.position;
      while (this.position < this.buffer.length) {
        const value = this.buffer[this.position];
        if (!quoted && !depth && [44, 125, 93].includes(value)) {
          parts.push(this.buffer.subarray(start, this.position));
          return JSON.parse(Buffer.concat(parts).toString('utf8'));
        }
        if (quoted) {
          if (!escape && value === 34) quoted = false;
          if (!escape && value === 92) escape = true; else escape = false;
        } else if (value === 34) quoted = true;
        else if (value === 123 || value === 91) depth++;
        else if (value === 125 || value === 93) depth--;
        this.position++;
      }
      parts.push(this.buffer.subarray(start, this.position));
    }
    throw new Error('旧备份格式暂不支持自动转换。');
  }
  async base64(pending, size, assets) {
    await this.expect('"'); let carry = '', characters = 0;
    while (true) {
      if (await this.peek() === undefined) throw new Error('备份附件不完整。');
      const close = this.buffer.indexOf(34, this.position), end = close < 0 ? this.buffer.length : close;
      const part = this.buffer.subarray(this.position, end).toString('latin1'); this.position = end; characters += part.length;
      if (/[^A-Za-z0-9+/=]/.test(part)) throw new Error('旧备份格式暂不支持自动转换。');
      const text = carry + part;
      const length = close < 0 ? Math.max(0, (Math.floor(text.length / 4) - 1) * 4) : text.length;
      const next = text.slice(0, length);
      if (close < 0 ? next.includes('=') : !/^[A-Za-z0-9+/]*={0,2}$/.test(next) || next.length % 4 !== 0) throw new Error('备份附件格式无效。');
      const bytes = Buffer.from(next, 'base64');
      if (pending.size + bytes.length > size) throw new Error('备份附件大小不匹配。');
      if (bytes.length) await assets.append(pending, bytes);
      carry = text.slice(length);
      if (close >= 0) {
        this.position++;
        if (characters !== Math.ceil(size / 3) * 4 || pending.size !== size) throw new Error('备份附件大小不匹配。');
        return;
      }
    }
  }
  async end(checksum) {
    await this.space();
    if (await this.peek() !== undefined || this.hash.digest('hex') !== checksum) throw new Error('这份备份的完整性校验未通过，请选择其他备份。');
  }
}

async function readLegacyBackup({ path, checksum, io, assets }) {
  const handle = await io.open(path, 'r'), reader = new LegacyReader(handle);
  const data = {}, keys = new Set(), references = []; let pending;
  try {
    await reader.expect('{');
    while (true) {
      const key = await reader.string();
      if (keys.has(key) || !['schemaVersion', 'conversations', 'activeConversationId', 'conversationIds', 'records', 'documentFiles'].includes(key)) throw new Error('旧备份格式暂不支持自动转换。');
      keys.add(key); await reader.expect(':');
      if (key === 'documentFiles') {
        const metadata = metadataFrom(JSON.stringify(data)), ids = new Set(); await reader.expect('['); await reader.space();
        if (await reader.peek() !== 93) while (true) {
          await reader.expect('{');
          if (await reader.string() !== 'documentId') throw new Error('旧备份格式暂不支持自动转换。');
          await reader.expect(':'); const documentId = await reader.string();
          if (ids.has(documentId) || !metadata.expected.has(documentId)) throw new Error('备份附件无效。'); ids.add(documentId);
          await reader.expect(','); if (await reader.string() !== 'data') throw new Error('旧备份格式暂不支持自动转换。');
          await reader.expect(':'); pending = await assets.start();
          await reader.base64(pending, metadata.expected.get(documentId), assets);
          references.push({ documentId, ...await assets.finish(pending) }); pending = undefined;
          await reader.expect('}'); await reader.space();
          if (await reader.peek() !== 44) break;
          await reader.expect(',');
        }
        await reader.expect(']'); await reader.expect('}'); await reader.end(checksum);
        return { metadata: metadata.data, files: filesFrom(metadata, references, true) };
      }
      data[key] = await reader.value(); await reader.space();
      if (await reader.peek() === 125) {
        await reader.expect('}'); await reader.end(checksum);
        const metadata = metadataFrom(JSON.stringify(data)); return { metadata: metadata.data, files: filesFrom(metadata, [], true) };
      }
      await reader.expect(',');
    }
  } finally { await assets.abort(pending); await handle.close(); }
}
module.exports = { readLegacyBackup };
