import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAppServer } from './app.mjs';
import profileStorage from '../desktop/profile-store.cjs';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
try { process.loadEnvFile(resolve(projectRoot, '.env')); }
catch (error) { if (error.code !== 'ENOENT') { console.error('无法读取 .env 配置文件。'); process.exit(1); } }
const server = createAppServer({ distDir: resolve(projectRoot, 'dist'), profileStore: profileStorage.createProfileStore({ filePath: resolve(projectRoot, 'runtime/model-profiles.json') }) });
const port = Number(process.env.PORT || 4318);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error('本地端口设置不正确。'); process.exit(1);
}
server.on('error', error => {
  console.error(error.code === 'EADDRINUSE' ? `端口 ${port} 已被占用，请先关闭之前启动的客户端。` : '本地服务无法启动。');
  process.exitCode = 1;
});
server.listen(port, '127.0.0.1', () => console.log(`AI-Embedded Paper PDF Reader 本地服务已就绪 / Local service ready：http://127.0.0.1:${port}`));
let closing = false;
function shutdown() {
  if (closing) return;
  closing = true;
  server.closeAllConnections();
  server.close(() => process.exit(0));
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
server.on('shutdownRequested', shutdown);
