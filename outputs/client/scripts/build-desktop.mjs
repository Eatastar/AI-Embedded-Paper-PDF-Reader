import { build as bundle } from 'esbuild';
import { build as packageApp, Platform, Arch } from 'electron-builder';
import { cp, mkdir, readFile, writeFile, copyFile, readdir, stat, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const work = resolve(root, '../../work/desktop-package');
const stage = resolve(work, 'app');
const output = resolve(work, 'release');
const delivery = resolve(root, '../windows');
const require = createRequire(import.meta.url);
const metadata = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
if (dirname(stage) !== work || basename(stage) !== 'app') throw new Error('Invalid generated staging path');
await rm(stage, { recursive: true, force: true });
await mkdir(stage, { recursive: true });
await mkdir(delivery, { recursive: true });
await bundle({ entryPoints: [resolve(root, 'server/app.mjs')], outfile: resolve(stage, 'server.cjs'), bundle: true, platform: 'node', format: 'cjs', target: 'node22', legalComments: 'eof' });
await cp(resolve(root, 'dist'), resolve(stage, 'dist'), { recursive: true });
await copyFile(resolve(root, 'desktop/main.cjs'), resolve(stage, 'main.cjs'));
await copyFile(resolve(root, 'desktop/startup.cjs'), resolve(stage, 'startup.cjs'));
await copyFile(resolve(root, 'desktop/profile-store.cjs'), resolve(stage, 'profile-store.cjs'));
await copyFile(resolve(root, 'desktop/model-network.cjs'), resolve(stage, 'model-network.cjs'));
await copyFile(resolve(root, 'desktop/request-log.cjs'), resolve(stage, 'request-log.cjs'));
for (const name of ['preload.cjs', 'desktop-bridge.cjs', 'backup-store.cjs']) await copyFile(resolve(root, 'desktop', name), resolve(stage, name));
await copyFile(resolve(root, 'desktop/icon.png'), resolve(stage, 'icon.png'));
// Include actual installed license texts, while keeping source, credentials,
// package-manager links and personal runtime data out of the desktop payload.
const notices = ['Third-party dependency notices for learn something.\nElectron/Chromium notices are also supplied alongside the packaged runtime.'];
for (const entry of await readdir(resolve(root, 'node_modules/.pnpm'))) {
  const boundary = entry.indexOf('@', entry.startsWith('@') ? 1 : 0);
  if (boundary < 0) continue;
  const packageName = entry.slice(0, boundary).replace('+', '/');
  const directory = resolve(root, 'node_modules/.pnpm', entry, 'node_modules', packageName);
  try {
    const info = JSON.parse(await readFile(resolve(directory, 'package.json'), 'utf8'));
    const texts = [];
    for (const name of await readdir(directory)) {
      if (!/^(licen[sc]e|notice|copying)(\.|$)/i.test(name)) continue;
      const path = resolve(directory, name), file = await stat(path);
      if (file.isFile() && file.size < 100000) texts.push(name + '\n' + await readFile(path, 'utf8'));
    }
    notices.push(`\n${info.name} ${info.version} — ${JSON.stringify(info.license || 'See package license')}\n${texts.join('\n')}`);
  } catch { /* Not every pnpm entry is a package root. */ }
}
await writeFile(resolve(stage, 'THIRD-PARTY-NOTICES.txt'), notices.join('\n\n'));
await writeFile(resolve(stage, 'package.json'), JSON.stringify({ name: 'learn-something-desktop', productName: 'learn something', version: metadata.version, buildId: metadata.buildId, buildTime: metadata.buildTime, description: '支持原文高亮与单次批注问答的 AI 客户端', author: 'learn something', main: 'main.cjs', private: true, packageManager: 'pnpm@11.25.0', dependencies: {} }, null, 2));
await writeFile(resolve(stage, 'pnpm-lock.yaml'), "lockfileVersion: '9.0'\nimporters:\n  .: {}\n");
await mkdir(resolve(stage, 'node_modules'), { recursive: true });
const paths = await packageApp({
  projectDir: stage,
  targets: Platform.WINDOWS.createTarget(process.argv.includes('--zip-only') ? ['zip'] : ['portable', 'zip'], Arch.x64),
  config: {
    appId: 'com.marginchat.desktop', productName: 'learn something',
    directories: { app: stage, output },
    electronVersion: JSON.parse(await readFile(require.resolve('electron/package.json'), 'utf8')).version,
    electronDist: dirname(require('electron')),
    files: ['main.cjs', 'startup.cjs', 'profile-store.cjs', 'model-network.cjs', 'request-log.cjs', 'preload.cjs', 'desktop-bridge.cjs', 'backup-store.cjs', 'server.cjs', 'icon.png', 'THIRD-PARTY-NOTICES.txt', 'dist/**/*', 'package.json'],
    extraFiles: [
      { from: resolve(root, 'desktop/diagnose-launch.ps1'), to: 'diagnose-launch.ps1' },
      { from: resolve(root, 'desktop/启动诊断.cmd'), to: '启动诊断.cmd' },
      { from: resolve(delivery, '开始使用.txt'), to: '开始使用.txt' },
    ],
    asar: true, npmRebuild: false, nodeGypRebuild: false,
    artifactName: 'LearnSomething-${version}-Windows-${arch}.${ext}',
    win: { target: ['portable', 'zip'], executableName: 'LearnSomething', icon: resolve(root, 'desktop/icon.ico'), signAndEditExecutable: true, signExecutable: false, electronLanguages: ['en-US', 'zh-CN', 'zh-TW'] },
    // In the pinned builder version, true leaves UNPACK_DIR_NAME undefined and
    // uses a unique NSIS plugin directory for each launch, avoiding collisions.
    portable: { requestExecutionLevel: 'user', unicode: true, unpackDirName: true, splashImage: resolve(root, 'desktop/splash.bmp') },
    publish: null,
  },
});
for (const source of paths.filter(path => /\.(exe|zip)$/.test(path))) {
  const target = resolve(delivery, basename(source));
  await copyFile(source, target);
  const data = await readFile(target);
  await writeFile(target + '.sha256', createHash('sha256').update(data).digest('hex') + '  ' + basename(target) + '\n');
  console.log('Windows package: ' + target);
}
for (const name of ['diagnose-launch.ps1', '启动诊断.cmd']) await copyFile(resolve(root, 'desktop', name), resolve(delivery, name));
