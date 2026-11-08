/** Coalesce display/persistence updates, without changing the received text or
 * the frozen request. Every exit path must flush before final status is saved. */
export class TextBatch {
  private pending = '';
  private timer?: ReturnType<typeof setTimeout>;
  private failure: unknown;
  private last = -Infinity;
  constructor(private emit: (text: string) => void, private onError: () => void, private delay = 32) {}
  push(text: string): void {
    this.check(); this.pending += text;
    if (performance.now() - this.last >= this.delay) this.flush();
    else if (!this.timer) this.timer = setTimeout(() => { this.timer = undefined; try { this.flush(); } catch { this.onError(); } }, this.delay);
  }
  check(): void { if (this.failure) throw this.failure; }
  flush(): void {
    clearTimeout(this.timer); this.timer = undefined; this.check();
    if (!this.pending) return;
    const text = this.pending; this.pending = ''; this.last = performance.now();
    try { this.emit(text); } catch (error) { this.failure = error; throw error; }
  }
}
