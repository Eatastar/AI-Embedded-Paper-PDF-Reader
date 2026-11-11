import { build as bundle } from 'esbuild';
import { build as packageApp, Platform, Arch } from 'electron-builder';
import { cp, mkdir, readFile, writeFile, copyFile, readdir, stat, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { execFile } from 'node:child_process';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { parseArgs, promisify } from 'node:util';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const metadata = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
if (!/^\d+\.\d+\.\d+(?:-[a-z0-9.-]+)?$/i.test(metadata.version)) throw new Error('Invalid package version');
const portableTargets = {
  'linux-x64': { platform: 'linux', arch: 'x64', label: 'Linux', extension: 'tar.gz' },
  'macos-arm64': { platform: 'darwin', arch: 'arm64', label: 'macOS', extension: 'zip' },
  'macos-x64': { platform: 'darwin', arch: 'x64', label: 'macOS', extension: 'zip' },
};
const { values } = parseArgs({ options: {
  target: { type: 'string', multiple: true },
  'zip-only': { type: 'boolean' },
  'runtime-cache': { type: 'string' },
  'output-root': { type: 'string' },
} });
const targets = [...new Set(values.target ?? ['windows-x64'])];
for (const target of targets) {
  if (target !== 'windows-x64' && !Object.hasOwn(portableTargets, target)) throw new Error('Unknown desktop target: ' + target);
}
const windows = targets.includes('windows-x64');
const work = resolve(root, `../../work/desktop-package-${metadata.version}${windows ? '' : '-portable'}`);
const stage = resolve(work, 'app');
const output = resolve(work, 'release');
const deliveryRoot = resolve(values['output-root'] ?? resolve(root, '..'));
const require = createRequire(import.meta.url);
const electronPackage = require.resolve('electron/package.json');
const electronVersion = require(electronPackage).version;
if (dirname(stage) !== work || basename(stage) !== 'app') throw new Error('Invalid generated staging path');
await rm(stage, { recursive: true, force: true });
await mkdir(stage, { recursive: true });
await bundle({ entryPoints: [resolve(root, 'server/app.mjs')], outfile: resolve(stage, 'server.cjs'), bundle: true, platform: 'node', format: 'cjs', target: 'node22', legalComments: 'eof' });
await cp(resolve(root, 'dist'), resolve(stage, 'dist'), { recursive: true });
await copyFile(resolve(root, 'desktop/main.cjs'), resolve(stage, 'main.cjs'));
await copyFile(resolve(root, '../../LICENSE'), resolve(stage, 'LICENSE'));
await copyFile(resolve(root, 'desktop/startup.cjs'), resolve(stage, 'startup.cjs'));
await copyFile(resolve(root, 'desktop/profile-store.cjs'), resolve(stage, 'profile-store.cjs'));
await copyFile(resolve(root, 'desktop/model-network.cjs'), resolve(stage, 'model-network.cjs'));
await copyFile(resolve(root, 'desktop/request-log.cjs'), resolve(stage, 'request-log.cjs'));
for (const name of ['preload.cjs', 'desktop-bridge.cjs', 'backup-store.cjs', 'backup-stream.cjs', 'backup-files.cjs', 'backup-legacy.cjs']) await copyFile(resolve(root, 'desktop', name), resolve(stage, name));
await copyFile(resolve(root, 'desktop/icon.png'), resolve(stage, 'icon.png'));
// Include actual installed license texts, while keeping source, credentials,
// package-manager links and personal runtime data out of the desktop payload.
const notices = ['Third-party dependency notices for AI-Embedded Paper PDF Reader.\nElectron/Chromium notices are also supplied alongside the packaged runtime.'];
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
for (const license of ['vendor/zip-LICENSE', 'vendor/fflate-LICENSE']) notices.push('\nEbook dependency: ' + license + '\n' + await readFile(resolve(root, 'vendor/foliate-js', license), 'utf8'));
notices.push('\nFoliate-js ebook parsers (MIT), pinned source: https://github.com/johnfactotum/foliate-js/tree/78914aef4466eb960965702401634c2cb348e9b1\n' + await readFile(resolve(root, 'vendor/foliate-js/LICENSE'), 'utf8'));
await writeFile(resolve(stage, 'THIRD-PARTY-NOTICES.txt'), notices.join('\n\n'));
// The packager's default filters omit root LICENSE/NOTICE files from ASAR.
// Keep explicit copies under neutral filenames inside the app as well as next to it.
await mkdir(resolve(stage, 'licenses'), { recursive: true });
await copyFile(resolve(stage, 'LICENSE'), resolve(stage, 'licenses/project-MIT.txt'));
await copyFile(resolve(stage, 'THIRD-PARTY-NOTICES.txt'), resolve(stage, 'licenses/dependencies.txt'));
await writeFile(resolve(stage, 'package.json'), JSON.stringify({ name: 'ai-embedded-paper-pdf-reader-desktop', productName: 'AI-Embedded Paper PDF Reader', version: metadata.version, buildId: metadata.buildId, buildTime: metadata.buildTime, desktopDistribution: true, description: 'AI 嵌入式论文 PDF 阅读器 / Local PDF reader with AI questions and annotations', author: 'Eatastar', main: 'main.cjs', private: true, packageManager: 'pnpm@11.25.0', dependencies: {} }, null, 2));
for (const target of targets) {
  if (target !== 'windows-x64') await packagePortable(portableTargets[target]);
}
if (windows) await packageWindows();

async function runtimeHash(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}

async function deliver(source, delivery) {
  await mkdir(delivery, { recursive: true });
  const target = resolve(delivery, basename(source));
  await copyFile(source, target);
  await writeFile(target + '.sha256', await runtimeHash(target) + '  ' + basename(target) + '\n');
  console.log('Desktop package: ' + target);
}

async function packagePortable({ platform, arch, label, extension }) {
  const runtimeName = `electron-v${electronVersion}-${platform}-${arch}.zip`;
  const requireElectron = createRequire(electronPackage);
  const checksums = requireElectron('./checksums.json');
  const expectedHash = checksums[runtimeName];
  if (!expectedHash) throw new Error('Missing Electron checksum: ' + runtimeName);
  const archive = values['runtime-cache']
    ? resolve(values['runtime-cache'], runtimeName)
    : await requireElectron('@electron/get').downloadArtifact({
      version: electronVersion, artifactName: 'electron', platform, arch, checksums,
    });
  if (await runtimeHash(archive) !== expectedHash) throw new Error('Electron archive checksum mismatch: ' + runtimeName);

  const stem = `AI-Embedded-Paper-PDF-Reader-${metadata.version}-${label}-${arch}`;
  const source = resolve(work, stem + '.' + extension);
  const python = process.platform === 'win32' ? 'python' : 'python3';
  await promisify(execFile)(python, [
    resolve(root, 'scripts/package-portable-desktop.py'), platform, archive, stage, source, stem,
  ]);
  await deliver(source, resolve(deliveryRoot, platform === 'linux' ? 'linux' : 'macos'));
}

async function packageWindows() {
  const delivery = resolve(deliveryRoot, 'windows');
  const updateGuideName = 'READ-ME-FIRST-Update-and-Data-Migration.txt';
  const updateGuide = await readFile(resolve(root, '../../docs/UPDATING.md'), 'utf8');
  await writeFile(resolve(stage, updateGuideName), updateGuide.replace(/^#{1,6}\s+/gm, '').replace(/\*\*/g, '').replace(/`/g, ''));
  await writeFile(resolve(stage, 'pnpm-lock.yaml'), "lockfileVersion: '9.0'\nimporters:\n  .: {}\n");
  await mkdir(resolve(stage, 'node_modules'), { recursive: true });
  const paths = await packageApp({
    projectDir: stage,
    targets: Platform.WINDOWS.createTarget(values['zip-only'] ? ['zip'] : ['portable', 'zip'], Arch.x64),
    config: {
      appId: 'com.marginchat.desktop', productName: 'AI-Embedded Paper PDF Reader',
      directories: { app: stage, output },
      electronVersion,
      electronDist: dirname(require('electron')),
      files: ['main.cjs', 'startup.cjs', 'profile-store.cjs', 'model-network.cjs', 'request-log.cjs', 'preload.cjs', 'desktop-bridge.cjs', 'backup-store.cjs', 'backup-stream.cjs', 'backup-files.cjs', 'backup-legacy.cjs', 'server.cjs', 'icon.png', 'licenses/**/*', 'dist/**/*', 'package.json'],
      extraFiles: [
        { from: resolve(root, '../../LICENSE'), to: 'LICENSE' },
        { from: resolve(stage, 'THIRD-PARTY-NOTICES.txt'), to: 'THIRD-PARTY-NOTICES.txt' },
        { from: resolve(root, 'desktop/diagnose-launch.ps1'), to: 'diagnose-launch.ps1' },
        { from: resolve(root, 'desktop/启动诊断.cmd'), to: '启动诊断.cmd' },
        { from: resolve(root, '../windows/开始使用.txt'), to: '开始使用.txt' },
        { from: resolve(root, '../../docs/UPDATING.md'), to: '升级与数据保留-Update-and-data.md' },
        { from: resolve(stage, updateGuideName), to: updateGuideName },
      ],
      asar: true, npmRebuild: false, nodeGypRebuild: false,
      // The pinned builder writes an ASAR resource even when resource editing is
      // disabled. Restore the vendor runtime after packing and verify below.
      afterPack: async context => {
        await copyFile(require('electron'), resolve(context.appOutDir, 'AI-Embedded-Paper-PDF-Reader.exe'));
      },
      artifactName: 'AI-Embedded-Paper-PDF-Reader-${version}-Windows-${arch}.${ext}',
      // Keep the official runtime byte-for-byte. Editing its unsigned resources
      // produces a new executable that Windows application control may reject.
      // The application name, icon and version still come from the app/renderer.
      win: { target: ['portable', 'zip'], executableName: 'AI-Embedded-Paper-PDF-Reader', icon: resolve(root, 'desktop/icon.ico'), signAndEditExecutable: false, signExecutable: false, electronLanguages: ['en-US', 'zh-CN', 'zh-TW'] },
      // In the pinned builder version, true leaves UNPACK_DIR_NAME undefined and
      // uses a unique NSIS plugin directory for each launch, avoiding collisions.
      portable: { requestExecutionLevel: 'user', unicode: true, unpackDirName: true },
      publish: null,
    },
  });
  if (await runtimeHash(resolve(output, 'win-unpacked/AI-Embedded-Paper-PDF-Reader.exe')) !== await runtimeHash(require('electron'))) throw new Error('Packaged runtime differs from official Electron; delivery was not updated');
  for (const source of paths.filter(path => /\.(exe|zip)$/.test(path))) {
    await deliver(source, delivery);
  }
  for (const name of ['diagnose-launch.ps1', '启动诊断.cmd']) await copyFile(resolve(root, 'desktop', name), resolve(delivery, name));
  await copyFile(resolve(stage, updateGuideName), resolve(delivery, updateGuideName));
}
