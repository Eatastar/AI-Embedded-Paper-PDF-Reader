import { spawn } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { createServer } from 'node:net';
import { access, mkdir, writeFile } from 'node:fs/promises';
import { openSync, closeSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { setTimeout as delay } from 'node:timers/promises';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const serverPath = resolve(root, 'server/index.mjs');
const runtime = resolve(root, 'runtime');
const base = 'http://127.0.0.1:4317';
const require = createRequire(import.meta.url);
let started;
let launchedRecord;

async function health() {
  try {
    const response = await fetch(base + '/api/health', { signal: AbortSignal.timeout(800) });
    if (!response.ok) return null;
    const body = await response.json();
    return body.app === 'margin-chat' && body.version === '0.1.0' ? body : null;
  } catch { return null; }
}

async function portAvailable() {
  return new Promise((resolvePort, reject) => {
    const probe = createServer();
    probe.once('error', error => error.code === 'EADDRINUSE' ? resolvePort(false) : reject(error));
    probe.listen(4317, '127.0.0.1', () => probe.close(() => resolvePort(true)));
  });
}

async function openBrowser() {
  if (process.argv.includes('--no-open')) return;
  try {
    const child = process.platform === 'win32'
      ? spawn('rundll32.exe', ['url.dll,FileProtocolHandler', base], { detached: true, windowsHide: true, stdio: 'ignore' })
      : spawn(process.platform === 'darwin' ? 'open' : 'xdg-open', [base], { detached: true, stdio: 'ignore' });
    await new Promise((resolveOpen, reject) => { child.once('spawn', resolveOpen); child.once('error', reject); });
    child.unref();
  } catch { console.log('没有自动打开浏览器，请手动访问：' + base); }
}

async function requestOwnedShutdown() {
  if (!launchedRecord) return;
  const live = await health();
  if (live?.instanceId !== launchedRecord.instanceId) return;
  await fetch(base + '/api/shutdown', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: launchedRecord.shutdownToken }), signal: AbortSignal.timeout(1500),
  }).catch(() => {});
}

async function main() {
  if (process.argv.slice(2).some(argument => argument !== '--no-open')) throw new Error('不支持这个启动选项。正常双击启动文件即可。');
  if (Number(process.versions.node.split('.')[0]) < 22) throw new Error('需要 Node.js 22 或更新版本。可以使用 Codex 自带的 Node.js。');
  if (await health()) {
    console.log('learn something已经在运行，已沿用当前客户端：' + base);
    await openBrowser();
    return;
  }
  if (!(await portAvailable())) throw new Error('端口 4317 被其他程序占用。请先关闭占用该端口的程序，再重新启动learn something。');
  try { await access(resolve(root, 'dist/index.html')); }
  catch { throw new Error('缺少客户端构建文件 dist。请保留完整客户端文件夹，或请开发者先完成构建。'); }
  try { require.resolve('ai'); require.resolve('@ai-sdk/openai-compatible'); }
  catch { throw new Error('缺少运行依赖 node_modules。请使用完整客户端文件夹；启动器不会自动联网下载。'); }
  await mkdir(runtime, { recursive: true });
  launchedRecord = { app: 'margin-chat', version: '0.1.0', port: 4317, instanceId: randomUUID(), shutdownToken: randomBytes(32).toString('hex') };
  const log = openSync(resolve(runtime, 'server.log'), 'a');
  try {
    started = spawn(process.execPath, [serverPath], { cwd: root, env: { ...process.env, PORT: '4317', MARGIN_CLIENT_INSTANCE_ID: launchedRecord.instanceId, MARGIN_CLIENT_SHUTDOWN_TOKEN: launchedRecord.shutdownToken }, detached: true, windowsHide: true, stdio: ['ignore', log, log] });
    await new Promise((resolveStart, reject) => { started.once('spawn', resolveStart); started.once('error', reject); });
  } finally { closeSync(log); }
  let exited = false;
  started.once('exit', () => { exited = true; });
  started.unref();
  const readyDeadline = Date.now() + 12000;
  while (Date.now() < readyDeadline) {
    const live = await health();
    if (live?.instanceId === launchedRecord.instanceId) {
      try {
        await writeFile(resolve(runtime, 'server.json'), JSON.stringify(launchedRecord, null, 2), { encoding: 'utf8', mode: 0o600 });
      } catch { throw new Error('无法保存经过验证的运行身份。为避免留下无法管理的后台服务，已取消本次启动。'); }
      console.log('learn something已启动：' + base);
      console.log('聊天记录保存在当前浏览器中。关闭网页不会停止本地服务。');
      await openBrowser();
      return;
    }
    if (exited) throw new Error('本地服务启动失败。详细记录位于 runtime/server.log。');
    await delay(160);
  }
  throw new Error('等待本地服务超时。详细记录位于 runtime/server.log。');
}

main().catch(async error => {
  // Ask only the instance created by this attempt to shut itself down. A
  // mismatched or pre-existing process is never terminated through the OS.
  await requestOwnedShutdown();
  console.error('启动未完成：' + (error instanceof Error ? error.message : '请检查客户端文件是否完整。'));
  process.exitCode = 1;
});
