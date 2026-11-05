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
  constructor(private options: SessionOptions) {}
  load(workspace: Workspace) {
    this.value = workspace;
    this.revision += 1;
    this.savedRevision = this.revision;
    this.options.onChange(workspace);
    this.options.onStatus('已保存在本机');
  }
  update(change: (previous: Workspace) => Workspace): Workspace {
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
  async flush(): Promise<void> {
    if (this.timer) { clearTimeout(this.timer); this.timer = undefined; }
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
    this.queue = result;
    return result;
  }
  dispose() { if (this.timer) clearTimeout(this.timer); }
}
