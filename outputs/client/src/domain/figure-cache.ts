import { FIGURE_LIMITS } from './figure';
/** Derived binary data only. Persistent annotations never reference this cache. */
export class FigureCache<T extends { blob: Blob }> {
  private entries = new Map<string, { sourceId: string; value: T }>();
  bytes = 0;
  constructor(readonly byteLimit: number = FIGURE_LIMITS.cacheBytes, readonly entryLimit: number = FIGURE_LIMITS.cacheEntries) {}
  get size() { return this.entries.size; }
  get(key: string) { const entry = this.entries.get(key); if (!entry) return; this.entries.delete(key); this.entries.set(key, entry); return entry.value; }
  set(key: string, sourceId: string, value: T) {
    if (value.blob.size > this.byteLimit) throw Error('图片超过缓存容量，请框选更小的区域。');
    this.delete(key);
    while (this.entries.size && (this.bytes + value.blob.size > this.byteLimit || this.entries.size >= this.entryLimit)) this.delete(this.entries.keys().next().value!);
    this.entries.set(key, { sourceId, value }); this.bytes += value.blob.size;
  }
  delete(key: string) { const entry = this.entries.get(key); if (entry) { this.bytes -= entry.value.blob.size; this.entries.delete(key); } }
  dropSource(sourceId: string) { for (const [key, entry] of this.entries) if (entry.sourceId === sourceId) this.delete(key); }
  clear() { this.entries.clear(); this.bytes = 0; }
}
