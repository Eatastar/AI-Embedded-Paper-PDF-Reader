/** A cache budget covers retained derived data, never the canonical document. */
export class BoundedCache<K, V> {
  private values = new Map<K, { value: V; bytes: number }>();
  bytes = 0;
  constructor(readonly limit: number, readonly entries = 32) {}
  get(key: K): V | undefined {
    const item = this.values.get(key); if (!item) return;
    this.values.delete(key); this.values.set(key, item); return item.value;
  }
  set(key: K, value: V, bytes: number): void {
    this.delete(key);
    if (bytes > this.limit) return;
    while (this.values.size && (this.bytes + bytes > this.limit || this.values.size >= this.entries)) this.delete(this.values.keys().next().value!);
    this.values.set(key, { value, bytes }); this.bytes += bytes;
  }
  delete(key: K): void { const item = this.values.get(key); if (item) { this.bytes -= item.bytes; this.values.delete(key); } }
  clear(): void { this.values.clear(); this.bytes = 0; }
}
