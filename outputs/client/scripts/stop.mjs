import { readFile, unlink } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const recordPath = resolve(root, 'runtime/server.json');
const base = 'http://127.0.0.1:4317';

async function health() {
  try {
    const response = await fetch(base + '/api/health', { signal: AbortSignal.timeout(800) });
    if (!response.ok) return null;
    const body = await response.json();
    return body.app === 'margin-chat' && body.version === '0.1.0' ? body : null;
  } catch { return null; }
}

async function main() {
  let record;
  try { record = JSON.parse(await readFile(recordPath, 'utf8')); }
  catch { throw new Error('没有找到此启动器保存的运行记录。本次没有停止其他服务。'); }
  if (!record || typeof record !== 'object' || record.app !== 'margin-chat' || record.version !== '0.1.0' || record.port !== 4317 || typeof record.instanceId !== 'string' || !/^[0-9a-f-]{36}$/i.test(record.instanceId) || typeof record.shutdownToken !== 'string' || !/^[0-9a-f]{64}$/i.test(record.shutdownToken)) {
    throw new Error('运行记录无效，本次没有停止任何服务。');
  }
  const live = await health();
  if (!live) throw new Error('learn something可能已经停止，或无法连接。本次没有关闭其他程序。');
  if (live.instanceId !== record.instanceId) throw new Error('当前服务不是此启动器记录的那一次运行。本次没有停止它。');
  let response;
  try {
    response = await fetch(base + '/api/shutdown', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: record.shutdownToken }), signal: AbortSignal.timeout(2000),
    });
  } catch { throw new Error('关闭请求未完成，请稍后再试。'); }
  if (!response.ok) throw new Error('服务没有接受关闭请求。本次没有关闭其他程序。');
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const remaining = await health();
    if (!remaining || remaining.instanceId !== record.instanceId) {
      // A new launch may already have saved a different instance's record.
      try {
        const latest = JSON.parse(await readFile(recordPath, 'utf8'));
        if (latest.instanceId === record.instanceId) await unlink(recordPath);
      } catch { /* No stale record needs removing. */ }
      console.log('learn something本地服务已停止。聊天记录仍保存在浏览器中。');
      return;
    }
    await delay(120);
  }
  throw new Error('已请求关闭，但服务尚未退出。请稍后再次运行停止工具。');
}

main().catch(error => { console.error(error instanceof Error ? error.message : '停止操作未完成。'); process.exitCode = 1; });
