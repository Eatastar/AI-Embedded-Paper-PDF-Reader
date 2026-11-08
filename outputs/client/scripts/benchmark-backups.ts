// Fictional bytes and an isolated temporary directory; no personal profile or API.
import * as fs from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { createWorkspace, makeId } from '../src/domain/workspace';
import { exportWorkspace, parseWorkspace } from '../src/adapters/storage';
const { createBackupStore } = createRequire(import.meta.url)('../desktop/backup-store.cjs');
const mib = Number(process.argv.find(arg => arg.startsWith('--mib='))?.slice(6) || 8);
if (!Number.isInteger(mib) || mib < 1 || mib > 150) throw Error('Use --mib=1..150');
const directory = await fs.mkdtemp(join(tmpdir(), 'synthetic-backup-space-'));
let monitor: ReturnType<typeof setInterval> | undefined;
const sizeOf = async (path: string): Promise<number> => (await Promise.all((await fs.readdir(path, { withFileTypes: true })).map(async entry => entry.isDirectory() ? sizeOf(join(path, entry.name)) : (await fs.stat(join(path, entry.name))).size))).reduce((sum, size) => sum + size, 0);
try {
  const workspace = createWorkspace(), bytes = Buffer.alloc(mib * 1024 * 1024, 71), documentId = makeId();
  workspace.conversations[0].documents = [{ id: documentId, name: 'Synthetic.pdf', kind: 'pdf', mimeType: 'application/pdf', size: bytes.length, createdAt: 1, pages: [{ pageNumber: 1, messageId: makeId(), versionId: makeId(), text: 'Synthetic source passage.' }] }];
  const store = createBackupStore({ directory, version: '0.1.36' });
  for (let index = 0; index < 7; index++) {
    workspace.conversations[0].title = `Synthetic old recovery point ${index}`;
    const text = JSON.stringify({ ...JSON.parse(exportWorkspace(workspace, { compact: index >= 2 })), documentFiles: [{ documentId, data: bytes.toString('base64') }] });
    if (index < 2) await store.baseline(text); else await store.write(text);
  }
  const before = await sizeOf(directory); globalThis.gc?.();
  const startingRSS = process.memoryUsage().rss; let peakRSS = startingRSS;
  monitor = setInterval(() => { peakRSS = Math.max(peakRSS, process.memoryUsage().rss); }, 5);
  const started = performance.now();
  workspace.conversations[0].title = 'Synthetic first shared recovery point';
  const id = await store.begin({ metadata: exportWorkspace(workspace, { compact: true }), files: [{ documentId, size: bytes.length }], upgrade: true });
  for (let offset = 0; offset < bytes.length; offset += 256 * 1024) await store.append({ id, index: 0, bytes: bytes.subarray(offset, offset + 256 * 1024) });
  await store.finish(id); clearInterval(monitor);
  const elapsedMs = Math.round(performance.now() - started), after = await sizeOf(directory), points = await store.list();
  for (const point of points) {
    const text = await store.read(point.id); parseWorkspace(text);
    const restored = Buffer.from(JSON.parse(text).documentFiles[0].data, 'base64');
    if (createHash('sha256').update(restored).digest('hex') !== createHash('sha256').update(bytes).digest('hex')) throw Error('Synthetic restore differs');
  }
  console.log(JSON.stringify({
    fixture: { attachmentMiB: mib, recoveryPoints: points.length, protectedPoints: points.filter((point: any) => point.baseline).length },
    scope: 'Logical file sizes in the backup directory only, excluding library originals and physical filesystem overhead. Every retained point was restored and its attachment hash checked.',
    beforeBytes: before, afterBytes: after, reductionPercent: Number(((1 - after / before) * 100).toFixed(2)),
    sharedAttachmentFiles: (await fs.readdir(join(directory, 'Attachments'))).filter(name => /^[a-f0-9]{64}\.bin$/.test(name)).length,
    legacyPointsRemaining: points.filter((point: any) => !point.sharedAttachments).length,
    conversionMs: elapsedMs, conversionPeakRSSIncreaseMiB: Number(((peakRSS - startingRSS) / 1024 ** 2).toFixed(2)),
  }, null, 2));
} finally { clearInterval(monitor); await fs.rm(directory, { recursive: true, force: true }); }
