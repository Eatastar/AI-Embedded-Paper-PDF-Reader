import type { Workspace } from '../domain/types';
import { assertWorkspaceCapacity } from '../domain/capacity';

type SessionOptions = {
  save: (workspace: Workspace) => Promise<void>;
  onChange: (workspace: Workspace) => void;
  onStatus: (status: string) => void;
};

/** Serializes writes and exposes a real, awaitable save barrier to desktop exit. */
export class WorkspaceSession {
  value: Workspace | null = null;
  revision = 0;
  savedRevision = -1;
  private queue: Promise<void> = Promise.resolve();
  private timer?: ReturnType<typeof setTimeout>;
  private committing = false;
  private flushing?: Promise<void>;
  constructor(private options: SessionOptions) {}
  load(workspace: Workspace) {
    this.value = workspace;
    this.revision += 1;
    this.savedRevision = this.revision;
    this.options.onChange(workspace);
    this.options.onStatus('已保存在本机');
  }
  update(change: (previous: Workspace) => Workspace): Workspace {
    if (this.committing) throw new Error('正在清理回收站，请稍候。');
    if (!this.value) throw new Error('正在读取本地记录。');
    const next = change(this.value);
    assertWorkspaceCapacity(next);
    this.value = next;
    this.revision += 1;
    this.options.onChange(next);
    this.options.onStatus('正在保存…');
    if (!this.timer) this.timer = setTimeout(() => { this.timer = undefined; void this.flush().catch(() => {}); }, 180);
    return next;
  }
  /** Commit irreversible removals through the same queue as ordinary saves, so an
   * older in-flight snapshot can never resurrect removed records or attachments. */
  async commit(change: (previous: Workspace) => Workspace, write: (next: Workspace, previous: Workspace) => Promise<void>): Promise<Workspace> {
    if (!this.value || this.committing) throw new Error('本机记录尚未就绪，请稍候。');
    this.committing = true;
    this.flushing = undefined; // A later flush must also wait for this commit.
    if (this.timer) { clearTimeout(this.timer); this.timer = undefined; }
    const operation = this.queue.catch(() => {}).then(async () => {
      const previous = this.value!;
      const next = change(previous);
      assertWorkspaceCapacity(next);
      this.options.onStatus('正在清理回收站…');
      await write(next, previous);
      this.value = next; this.revision += 1; this.savedRevision = this.revision;
      this.options.onChange(next); this.options.onStatus('已保存在本机');
      return next;
    });
    this.queue = operation.then(() => {}, () => {});
    try { return await operation; }
    catch (error) { this.options.onStatus(this.savedRevision === this.revision ? '已保存在本机' : '保存失败，请先导出备份'); throw error; }
    finally { this.committing = false; }
  }
  flush(): Promise<void> {
    if (this.timer) { clearTimeout(this.timer); this.timer = undefined; }
    if (this.flushing) return this.flushing;
    const write = async () => {
      while (this.value && this.savedRevision !== this.revision) {
        const snapshot = this.value;
        const revision = this.revision;
        try { await this.options.save(snapshot); }
        catch (error) { this.options.onStatus('保存失败，请先导出备份'); throw error; }
        this.savedRevision = revision;
      }
      this.options.onStatus('已保存在本机');
    };
    const result = this.queue.catch(() => {}).then(write);
    const barrier = result.finally(() => { if (this.flushing === barrier) this.flushing = undefined; });
    this.flushing = barrier; this.queue = barrier;
    return barrier;
  }
  dispose() { if (this.timer) clearTimeout(this.timer); }
}
