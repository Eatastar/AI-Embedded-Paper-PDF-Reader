import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { lstat, readFile, readdir, realpath, mkdir, writeFile } from 'node:fs/promises';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const app = 'outputs/client/';
const staticFiles = [
  '.gitignore', '.gitattributes', 'README.md', 'LICENSE', 'tools/source-audit.mjs',
  'docs/PROJECT.md', 'docs/ROADMAP.md', 'docs/REPOSITORY_POLICY.md', 'docs/CHANGELOG.md',
  'docs/PRIVACY.md', 'docs/THIRD_PARTY.md', 'docs/OPEN_SOURCE_RELEASE.md',
  'outputs/windows/开始使用.txt',
  ...['.gitignore', '.gitattributes', '.env.example', 'README.md', 'package.json', 'pnpm-lock.yaml',
    'pnpm-workspace.yaml', 'index.html', 'tsconfig.json', 'vite.config.ts', '启动客户端.cmd', '停止客户端.cmd',
    'public/icon.svg'].map(name => app + name),
];
const directories = new Map([
  [app + 'src', new Set(['.ts', '.tsx', '.css'])],
  [app + 'server', new Set(['.mjs'])],
  [app + 'scripts', new Set(['.mjs', '.ts', '.py'])],
  [app + 'tests', new Set(['.ts'])],
  [app + 'desktop', new Set(['.cjs', '.cmd', '.ps1', '.md', '.png', '.ico', '.bmp'])],
]);
const binaryFiles = new Set(['desktop/icon.png', 'desktop/icon.ico', 'desktop/splash.bmp'].map(name => app + name));
const slash = path => path.split(sep).join('/');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const gitHash = bytes => createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');

function allowedPath(path) {
  if (path.startsWith('/') || path.includes('\\') || path.split('/').includes('..')) return false;
  if (/(^|\/)(node_modules|dist|runtime|logs|IndexedDB|Local Storage|Session Storage|databases|Session|Backups)(\/|$)/i.test(path)) return false;
  if (/(^|\/)\.env(?:\..+)?$/i.test(path) && path !== app + '.env.example') return false;
  if (/\.(?:pdf|docx|xlsx|pptx|exe|dll|asar|zip|7z|db|sqlite3?|ldb|log|jsonl|tsbuildinfo)$/i.test(path)) return false;
  if (/(^|\/)(?:model-profiles|credentials|secrets)(?:\.|$)/i.test(path) || /(?:备份|backup).*\.json$/i.test(path)) return false;
  if (staticFiles.includes(path)) return true;
  for (const [directory, extensions] of directories) {
    if (path.startsWith(directory + '/') && extensions.has(extname(path))) {
      return !['.png', '.ico', '.bmp'].includes(extname(path)) || binaryFiles.has(path);
    }
  }
  return false;
}

function contentFindings(path, text) {
  const failures = [], fixtures = [];
  const record = (index, kind) => failures.push({ path, line: text.slice(0, index).split('\n').length, kind });
  const sensitive = [
    ['private-key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g],
    ['provider-key', /\b(?:sk-(?:(?:proj|svcacct|ant-api\d+)-)?[A-Za-z0-9_-]{24,}|gh[pousr]_[A-Za-z0-9]{24,}|github_pat_[A-Za-z0-9_]{30,}|xox[baprs]-[A-Za-z0-9-]{20,}|AIza[A-Za-z0-9_-]{30,})\b/g],
    ['private-user-path', /\b[A-Za-z]:[\\/]Users[\\/](?!(?:Public|Default)(?:[\\/]|\b))[^\\/\s"'`]+/g],
    ['chat-transcript', /<(?:send_user_message_question_reply|external_codex_apps_open_page)>/g],
  ];
  for (const [kind, pattern] of sensitive) for (const match of text.matchAll(pattern)) record(match.index, kind);
  const literals = /\b(?:apiKey|api_key|AI_API_KEY|accessToken|access_token|authorization|password)\b\s*[=:]\s*['"`]([^'"`\r\n]+)['"`]/gi;
  for (const match of text.matchAll(literals)) {
    const value = match[1].trim();
    if (!value || value === 'Bearer' || /\$\{|\\/.test(value)) continue;
    const test = path.startsWith(app + 'tests/');
    const clearlySynthetic = /test|fake|dummy|fixture|example|synthetic|mock|qa[-_]|never|not[-_]|in[-_]memory|alpha|beta|first|second/i.test(value);
    if (test && (clearlySynthetic || value.length <= 18)) fixtures.push({ path, line: text.slice(0, match.index).split('\n').length });
    else record(match.index, 'credential-literal');
  }
  if (path === app + '.env.example') {
    for (const [index, line] of text.split('\n').entries()) {
      if (/^\s*(?:AI_API_KEY|OPENAI_API_KEY|ANTHROPIC_API_KEY|DEEPSEEK_API_KEY)\s*=\s*\S/.test(line)) failures.push({ path, line: index + 1, kind: 'nonempty-template-key' });
    }
  }
  return { failures, fixtures };
}

if (process.argv.includes('--self-test')) {
  for (const path of ['work/backup.json', app + 'runtime/server.json', app + '.env', app + '.env.local', app + 'src/credentials.json', 'outputs/windows/LearnSomething.exe', 'docs/paper.pdf', 'docs/readme-private.json', app + 'desktop/photo.png', app + 'desktop/Backups/1234567890000.json', app + 'src/Backups/notes.ts']) assert.equal(allowedPath(path), false, path);
  for (const path of ['README.md', 'LICENSE', 'docs/PRIVACY.md', 'docs/THIRD_PARTY.md', 'docs/OPEN_SOURCE_RELEASE.md', app + '.env.example', app + 'src/App.tsx', app + 'desktop/icon.png', app + 'tests/domain.test.ts']) assert.equal(allowedPath(path), true, path);
  const credential = ['api', 'Key'].join('') + ' = ' + JSON.stringify('a'.repeat(40));
  assert.ok(contentFindings(app + 'src/unsafe.ts', credential).failures.length);
  const key = ['sk', 'proj', 'a'.repeat(60)].join('-');
  assert.ok(contentFindings(app + 'src/unsafe.ts', JSON.stringify(key)).failures.some(item => item.kind === 'provider-key'));
  assert.ok(contentFindings(app + '.env.example', ['AI_API', 'KEY'].join('_') + '=value').failures.length);
  assert.equal(contentFindings(app + 'tests/demo.test.ts', ['api', 'Key'].join('') + " = 'fake-test-key'").failures.length, 0);
  console.log(JSON.stringify({ passed: true, checks: 24 }));
  process.exit(0);
}

const realRoot = await realpath(root);
async function inside(path) {
  const absolute = resolve(root, path);
  const info = await lstat(absolute);
  if (info.isSymbolicLink()) throw new Error('Source links require manual review: ' + path);
  const actual = await realpath(absolute);
  if (!actual.startsWith(realRoot + sep)) throw new Error('Source path escaped repository');
  return info;
}
async function walk(directory) {
  await inside(directory);
  const result = [];
  for (const entry of await readdir(join(root, directory), { withFileTypes: true })) {
    const path = directory + '/' + entry.name;
    if (entry.isSymbolicLink()) throw new Error('Source links require manual review: ' + path);
    if (entry.isDirectory()) result.push(...await walk(path));
    else if (entry.isFile()) result.push(path);
  }
  return result;
}

const paths = [...staticFiles];
for (const directory of directories.keys()) paths.push(...await walk(directory));
const failures = [], fixtures = [], files = [];
for (const path of [...new Set(paths)].sort()) {
  if (!allowedPath(path)) { failures.push({ path, kind: 'unapproved-file' }); continue; }
  if (!(await inside(path)).isFile()) throw new Error('Expected source file: ' + path);
  const original = await readFile(join(root, path));
  const binary = binaryFiles.has(path);
  const content = binary ? original.toString('base64') : new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(original).replace(/\r\n?/g, '\n');
  const bytes = binary ? original : Buffer.from(content, 'utf8');
  if (!binary) {
    const scan = contentFindings(path, content);
    failures.push(...scan.failures); fixtures.push(...scan.fixtures);
  }
  files.push({ path, binary, bytes: bytes.length, sourceSha256: hash(original), sha256: hash(bytes), gitSha: gitHash(bytes), content });
}
if (failures.length) {
  console.error(JSON.stringify({ passed: false, findings: failures }, null, 2));
  process.exit(1);
}
const manifest = { checkedAt: new Date().toISOString(), version: JSON.parse(await readFile(join(root, app, 'package.json'), 'utf8')).version, files, fixtures, totalBytes: files.reduce((sum, file) => sum + file.bytes, 0) };
await mkdir(join(root, 'work'), { recursive: true });
await writeFile(join(root, 'work/github-publish-manifest.json'), JSON.stringify(manifest));
await writeFile(join(root, 'work/github-allowlist.txt'), files.map(file => file.path).join('\n') + '\n');
console.log(JSON.stringify({ passed: true, files: files.length, textFiles: files.filter(file => !file.binary).length, binaryFiles: files.filter(file => file.binary).map(file => ({ path: file.path, bytes: file.bytes })), totalBytes: manifest.totalBytes, syntheticTestCredentialReferences: fixtures.length, excluded: ['personal data', 'credentials', 'runtime', 'backups', 'papers', 'generated assets', 'application packages'] }, null, 2));
