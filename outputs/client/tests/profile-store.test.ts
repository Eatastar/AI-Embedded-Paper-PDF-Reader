import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';

const require = createRequire(import.meta.url);
const { createProfileStore } = require('../desktop/profile-store.cjs');
const key = randomBytes(32);
const crypto = {
  isEncryptionAvailable: () => true,
  encryptString(value: string) {
    const nonce = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, nonce);
    const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    return Buffer.concat([nonce, cipher.getAuthTag(), ciphertext]);
  },
  decryptString(value: Buffer) {
    const decipher = createDecipheriv('aes-256-gcm', key, value.subarray(0, 12));
    decipher.setAuthTag(value.subarray(12, 28));
    return Buffer.concat([decipher.update(value.subarray(28)), decipher.final()]).toString('utf8');
  },
};
const snapshot = { mode: 'api', activeProfileId: 'one', profiles: [{ id: 'one', name: '我的模型', apiFormat: 'openai-chat', baseURL: 'https://provider.example/v1', model: 'model-one', systemPrompt: '用中文解释', apiKey: 'private-key-only-for-test' }] };

function fixture() {
  const root = fileURLToPath(new URL('../../../work/profile-store-tests/', import.meta.url));
  mkdirSync(root, { recursive: true });
  const directory = mkdtempSync(join(root, 'margin-profile-store-'));
  return { directory, filePath: join(directory, 'profiles.json'), close: () => rmSync(directory, { recursive: true, force: true }) };
}

test('desktop profiles survive reopening while their keys exist only as encrypted blobs on disk', () => {
  const file = fixture();
  try {
    const store = createProfileStore({ filePath: file.filePath, safeStorage: crypto });
    assert.equal(store.load(), null);
    store.save(snapshot);
    assert.equal(store.persistence, 'encrypted');
    const saved = readFileSync(file.filePath, 'utf8');
    assert.doesNotMatch(saved, /private-key-only-for-test|"apiKey"/);
    assert.deepEqual(createProfileStore({ filePath: file.filePath, safeStorage: crypto }).load(), snapshot);
    store.save({ ...snapshot, mode: 'demo', activeProfileId: null });
    assert.equal(store.load().mode, 'demo');
    assert.equal(store.load().profiles[0].apiKey, snapshot.profiles[0].apiKey);
  } finally { file.close(); }
});

test('unavailable or unprotected system storage persists configuration without keys', () => {
  const basicText = { ...crypto, getSelectedStorageBackend: () => 'basic_text' };
  for (const safeStorage of [undefined, { isEncryptionAvailable: () => false }, basicText]) {
    const file = fixture();
    try {
      const store = createProfileStore({ filePath: file.filePath, safeStorage });
      store.save(snapshot);
      assert.equal(store.persistence, 'configuration');
      assert.doesNotMatch(readFileSync(file.filePath, 'utf8'), /private-key-only-for-test|encryptedApiKey|"apiKey"/);
      assert.equal(store.load().profiles[0].name, '我的模型');
      assert.equal(store.load().profiles[0].apiKey, '');
      if (safeStorage) assert.ok(store.warning);
    } finally { file.close(); }
  }
});

test('a damaged file or a key from a different account stays untouched and cannot be silently overwritten', () => {
  const file = fixture();
  try {
    createProfileStore({ filePath: file.filePath, safeStorage: crypto }).save(snapshot);
    const original = readFileSync(file.filePath, 'utf8');
    const unavailable = createProfileStore({ filePath: file.filePath });
    assert.equal(unavailable.load(), null);
    assert.ok(unavailable.warning);
    assert.throws(() => unavailable.save(snapshot));
    assert.equal(readFileSync(file.filePath, 'utf8'), original);
    writeFileSync(file.filePath, '{bad json');
    const broken = createProfileStore({ filePath: file.filePath, safeStorage: crypto });
    assert.equal(broken.load(), null);
    assert.throws(() => broken.save(snapshot));
    assert.equal(readFileSync(file.filePath, 'utf8'), '{bad json');
  } finally { file.close(); }
});

test('explicit key removal removes the encrypted blob and no unknown fields are stored', () => {
  const file = fixture();
  try {
    const store = createProfileStore({ filePath: file.filePath, safeStorage: crypto });
    store.save({ ...snapshot, ignored: 'should-not-be-saved', profiles: [{ ...snapshot.profiles[0], apiKey: '', arbitrary: 'should-not-be-saved' }] });
    assert.doesNotMatch(readFileSync(file.filePath, 'utf8'), /encryptedApiKey|arbitrary|ignored|should-not-be-saved/);
    assert.equal(store.load().profiles[0].apiKey, '');
  } finally { file.close(); }
});
