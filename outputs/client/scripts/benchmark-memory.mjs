import { build } from 'esbuild';
import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdir, mkdtemp, writeFile, readFile } from 'node:fs/promises';
import * as fs from 'node:fs/promises';
import { dirname, relative, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..'), repo = resolve(root, '../..');
const args = Object.fromEntries(process.argv.slice(2).map(value => value.replace(/^--/, '').split('=')));
const work = resolve(repo, 'work/performance-tests'); await mkdir(work, { recursive: true });
const require = createRequire(import.meta.url);
if (!args.case) {
  const stage = await mkdtemp(join(work, 'memory-'));
  const baseline = args.baseline;
  if (baseline && !/^[a-f0-9]{7,40}$/i.test(baseline)) throw Error('Use a hexadecimal source commit');
  const cases = [];
  for (const mode of baseline ? ['baseline', 'current'] : ['current']) {
    const outfile = join(stage, `${mode}.cjs`);
    await build({ stdin: { contents: "export {buildDocumentSearch, searchDocument} from './src/domain/reader-navigation.ts'; export {WorkspaceCodec} from './src/domain/workspace-codec.ts'; export * from './src/adapters/storage.ts'; export {createWorkspace,makeId} from './src/domain/workspace.ts';", resolveDir: root }, outfile, bundle: true, platform: 'node', format: 'cjs', target: 'node22', logLevel: 'silent', plugins: mode === 'baseline' ? [{ name: 'reviewed-source-baseline', setup(builder) {
      builder.onLoad({ filter: /outputs[\\/]client[\\/](src|server|shared)[\\/].*\.(ts|tsx|mjs)$/ }, input => ({ contents: execFileSync('git', ['show', `${baseline}:${relative(repo, input.path).replaceAll('\\', '/')}`], { cwd: repo, encoding: 'utf8', maxBuffer: 10_000_000 }), loader: input.path.endsWith('.tsx') ? 'tsx' : input.path.endsWith('.ts') ? 'ts' : 'js' }));
    } }] : [] });
    const store = join(stage, `${mode}-store.cjs`);
    await writeFile(store, mode === 'baseline' ? execFileSync('git', ['show', `${baseline}:outputs/client/desktop/backup-store.cjs`], { cwd: repo }) : `module.exports = require(${JSON.stringify(resolve(root, 'desktop/backup-store.cjs'))});`);
    for (const name of ['search', 'records', 'backup']) {
      const result = await new Promise((done, reject) => {
        const child = spawn(process.execPath, ['--expose-gc', '--import', 'tsx', fileURLToPath(import.meta.url), `--case=${name}`, `--module=${outfile}`, `--store=${store}`, `--stage=${stage}`, `--mode=${mode}`], { cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
        let stdout = '', stderr = ''; child.stdout.on('data', value => { stdout += value; }); child.stderr.on('data', value => { stderr += value; });
        child.on('error', reject); child.on('exit', code => { if (code) reject(Error(stderr || stdout)); else { try { done(JSON.parse(stdout)); } catch { reject(Error(stdout + stderr)); } } });
      });
      cases.push(result);
    }
  }
  const report = { scenario: 'Isolated Node allocation benchmark with synthetic data; not desktop RSS or GPU usage', baseline: baseline || null, cases };
  await writeFile(join(work, 'memory-results.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2));
} else {
  await import('fake-indexeddb/auto');
  const api = require(args.module), storeFactory = require(args.store).createBackupStore;
  let base, peak;
  const sample = () => { const value = process.memoryUsage(); for (const key of Object.keys(value)) peak[key] = Math.max(peak[key], value[key]); };
  const start = () => { global.gc(); global.gc(); base = process.memoryUsage(); peak = { ...base }; return performance.now(); };
  const finish = started => { sample(); global.gc(); global.gc(); const held = process.memoryUsage(); console.log(JSON.stringify({ mode: args.mode, case: args.case, elapsedMs: Math.round(performance.now() - started), peakIncreaseMiB: Object.fromEntries(['rss', 'heapUsed', 'arrayBuffers'].map(key => [key, +((peak[key] - base[key]) / 1048576).toFixed(2)])), retainedIncreaseMiB: Object.fromEntries(['heapUsed', 'arrayBuffers'].map(key => [key, +((held[key] - base[key]) / 1048576).toFixed(2)])) })); };
  if (args.case === 'search') {
    const pages = Array.from({ length: 2500 }, (_, n) => ({ pageNumber: n + 1, text: 'synthetic literature paragraph '.repeat(64) + n + ' ﬃ target', messageId: `m${n}`, versionId: `v${n}` }));
    const started = start(), index = api.buildDocumentSearch(pages); global.retained = index; sample();
    const hits = api.searchDocument(index, 'target'); if (hits.count !== pages.length) throw Error('Search mismatch'); sample(); finish(started);
  } else if (args.case === 'records') {
    const value = api.createWorkspace(); value.conversations[0].documents = [{ id: api.makeId(), name: 'Synthetic.pdf', kind: 'pdf', mimeType: 'application/pdf', size: 1, createdAt: 1, pages: Array.from({ length: 1000 }, (_, i) => ({ pageNumber: i + 1, text: 'synthetic paper text '.repeat(250), messageId: api.makeId(), versionId: api.makeId() })) }];
    const started = start(), codec = new api.WorkspaceCodec(); global.retained = { codec, packed: codec.pack(value) }; sample(); finish(started);
  } else {
    const value = api.createWorkspace(), bytes = new Uint8Array(64 * 1024 * 1024).fill(65), id = api.makeId();
    value.conversations[0].documents = [{ id, name: 'Synthetic.pdf', kind: 'pdf', mimeType: 'application/pdf', size: bytes.length, createdAt: 1, pages: [{ pageNumber: 1, text: 'Synthetic paper', messageId: api.makeId(), versionId: api.makeId() }] }];
    await api.saveDocumentBytes(id, bytes);
    const directory = await mkdtemp(join(args.stage, 'synthetic-backup-'));
    const io = { ...fs, async readFile(...values) { const result = await fs.readFile(...values); sample(); return result; }, async open(...values) { sample(); return fs.open(...values); } };
    const store = storeFactory({ directory, io });
    const originalBtoa = global.btoa; global.btoa = value => { sample(); const result = originalBtoa(value); sample(); return result; };
    const started = start(), timer = setInterval(sample, 5);
    if (args.mode === 'baseline') { const text = await api.exportWorkspaceWithFiles(value, { compact: true }); sample(); await store.write(text); sample(); }
    else {
      const task = await store.begin({ metadata: api.exportWorkspace(value, { compact: true }), files: [{ documentId: id, size: bytes.length }] });
      const source = await api.getDocumentBytes(id); sample();
      for (let offset = 0; offset < source.length; offset += 256 * 1024) { await store.append(structuredClone({ id: task, index: 0, bytes: source.slice(offset, offset + 256 * 1024) })); sample(); }
      await store.finish(task); sample();
    }
    clearInterval(timer); global.btoa = originalBtoa; finish(started);
  }
}
