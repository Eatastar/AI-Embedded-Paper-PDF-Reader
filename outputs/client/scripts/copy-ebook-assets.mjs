import { readFile, mkdir, copyFile, rm, lstat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = resolve(root, 'vendor/foliate-js');
const origin = JSON.parse(await readFile(resolve(source, 'ORIGIN.json'), 'utf8'));
const names = ['epub.js', 'mobi.js', 'epubcfi.js', 'vendor/zip.js', 'vendor/fflate.js', 'vendor/zip-LICENSE', 'vendor/fflate-LICENSE', 'LICENSE'];
if (origin.commit !== '78914aef4466eb960965702401634c2cb348e9b1' || JSON.stringify(Object.keys(origin.sha256).sort()) !== JSON.stringify(names.sort())) throw new Error('Unexpected ebook source manifest');
const generated = resolve(root, 'public/ebook');
if (dirname(generated) !== resolve(root, 'public') || (await lstat(generated).catch(() => null))?.isSymbolicLink()) throw new Error('Unsafe generated asset directory');
await rm(generated, { recursive: true, force: true });
for (const [name, expected] of Object.entries(origin.sha256)) {
  const bytes = await readFile(resolve(source, name));
  // Sources are text. Normalize checkout line endings before verification.
  const actual = createHash('sha256').update(bytes.toString('utf8').replaceAll('\r\n', '\n')).digest('hex');
  if (actual !== expected) throw new Error(`Ebook parser checksum mismatch: ${name}`);
  const destination = resolve(root, 'public/ebook', name);
  await mkdir(dirname(destination), { recursive: true });
  await copyFile(resolve(source, name), destination);
}
console.log('Pinned ebook parsing assets copied.');
