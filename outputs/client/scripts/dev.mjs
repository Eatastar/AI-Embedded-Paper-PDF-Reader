import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const children = [
  spawn(process.execPath, ['server/index.mjs'], { cwd: root, stdio: 'inherit', windowsHide: true }),
  spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '4317', '--strictPort'], { cwd: root, stdio: 'inherit', windowsHide: true }),
];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) if (!child.killed) child.kill('SIGTERM');
  setTimeout(() => process.exit(code), 250).unref();
}
for (const child of children) {
  child.once('error', () => { console.error('启动失败，请确认依赖已经安装。'); stop(1); });
  child.once('exit', code => stop(code || 0));
}
process.once('SIGINT', () => stop());
process.once('SIGTERM', () => stop());
