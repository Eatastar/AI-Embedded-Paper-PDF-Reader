import assert from 'node:assert/strict';
import { once } from 'node:events';
import test from 'node:test';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
// @ts-expect-error Native JavaScript modules are exercised through the server interface.
import { createAppServer } from '../server/app.mjs';

async function running(options: Record<string, unknown> = {}) {
  const server: Server = createAppServer({ env: {}, demoDuration: 1, ...options });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return { base, close: async () => { server.closeAllConnections(); server.close(); await once(server, 'close'); } };
}

const post = (base: string, path: string, body: unknown) => fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const settings = async (base: string) => (await fetch(base + '/api/settings')).json();
const chat = { kind: 'main', messages: [{ role: 'user', content: '你好' }] };
const preset = (name: string, extra: Record<string, unknown> = {}) => ({ name, apiFormat: 'openai-chat', baseURL: 'https://provider.example/v1', model: 'model-a', systemPrompt: '中文回答', ...extra });
const response = (content = '模型回答') => new Response(`data: ${JSON.stringify({ id: 'profile-test', object: 'chat.completion.chunk', created: 1, model: 'model-a', choices: [{ index: 0, delta: { content }, finish_reason: 'stop' }] })}\n\ndata: [DONE]\n\n`, { headers: { 'Content-Type': 'text/event-stream' } });

test('named profiles isolate secrets from each other and from legacy settings', async () => {
  const calls: { url: string; authorization: string | null }[] = [];
  const app = await running({ fetch: async (url: unknown, init: RequestInit) => { calls.push({ url: String(url), authorization: new Headers(init.headers).get('authorization') }); return response(); } });
  try {
    await post(app.base, '/api/settings', { apiKey: 'legacy-secret' });
    const first = await (await post(app.base, '/api/profiles', preset('模型 A', { apiKey: 'secret-a' }))).json();
    const firstId = first.activeProfileId;
    assert.equal(first.persistence, 'session');
    assert.equal(first.profiles[0].keySaved, false);
    const second = await (await post(app.base, '/api/profiles', preset('模型 B', { baseURL: 'https://second.example/v1' }))).json();
    const secondId = second.activeProfileId;
    assert.notEqual(firstId, secondId);
    assert.equal(second.hasApiKey, false);
    assert.equal(second.profiles[0].hasApiKey, true);
    assert.doesNotMatch(JSON.stringify(second), /secret-a|legacy-secret|apiKey/);
    assert.equal((await post(app.base, '/api/chat', chat)).status, 400);
    await (await post(app.base, '/api/chat', { ...chat, profileId: firstId })).text();
    assert.deepEqual(calls, [{ url: 'https://provider.example/v1/chat/completions', authorization: 'Bearer secret-a' }]);
    const demo = await (await post(app.base, '/api/chat', { ...chat, profileId: null })).text();
    assert.match(demo, /本地演示/);
    assert.equal(calls.length, 1);
    const active = await settings(app.base);
    assert.equal(active.activeProfileId, secondId);
  } finally { await app.close(); }
});

test('blank keys only remain on the same endpoint and protocol; explicit clearing removes them', async () => {
  const app = await running();
  try {
    let saved = await (await post(app.base, '/api/profiles', preset('我的模型', { apiKey: 'old-secret' }))).json();
    const profileId = saved.activeProfileId;
    saved = await (await post(app.base, '/api/profiles', preset('改名', { id: profileId, model: 'model-b', apiKey: '' }))).json();
    assert.equal(saved.hasApiKey, true);
    saved = await (await post(app.base, '/api/profiles', preset('更换路径', { id: profileId, baseURL: 'https://provider.example/other', apiKey: '' }))).json();
    assert.equal(saved.hasApiKey, false);
    saved = await (await post(app.base, '/api/profiles', preset('新密钥', { id: profileId, apiKey: 'replacement-secret' }))).json();
    assert.equal(saved.hasApiKey, true);
    saved = await (await post(app.base, '/api/profiles', preset('更换协议', { id: profileId, apiFormat: 'openai-responses' }))).json();
    assert.equal(saved.hasApiKey, false);
    saved = await (await post(app.base, '/api/profiles', preset('清除', { id: profileId, apiKey: 'another-secret' }))).json();
    assert.equal(saved.hasApiKey, true);
    saved = await (await post(app.base, '/api/profiles', preset('清除', { id: profileId, clearApiKey: true, apiKey: 'must-be-cleared' }))).json();
    assert.equal(saved.hasApiKey, false);
    saved = await (await post(app.base, '/api/profiles', preset('更换主机', { id: profileId, apiKey: 'source-secret' }))).json();
    assert.equal(saved.hasApiKey, true);
    saved = await (await post(app.base, '/api/profiles', preset('更换主机', { id: profileId, baseURL: 'https://elsewhere.example/v1' }))).json();
    assert.equal(saved.hasApiKey, false);
    assert.doesNotMatch(JSON.stringify(saved), /source-secret|replacement-secret|old-secret/);
  } finally { await app.close(); }
});

test('canonical trailing slashes do not discard an environment key for the same endpoint', async () => {
  const keys: (string | null)[] = [];
  const app = await running({ env: { AI_BASE_URL: 'https://provider.example/v1/', AI_MODEL: 'model-a', AI_API_KEY: 'environment-secret' }, fetch: async (_url: unknown, init: RequestInit) => { keys.push(new Headers(init.headers).get('authorization')); return response(); } });
  try {
    const updated = await post(app.base, '/api/settings', { mode: 'api' });
    assert.equal(updated.status, 200);
    assert.equal((await updated.json()).hasApiKey, true);
    const wire = await (await post(app.base, '/api/chat', chat)).text();
    assert.match(wire, /"type":"done"/);
    assert.deepEqual(keys, ['Bearer environment-secret']);
  } finally { await app.close(); }
});

test('legacy settings edit the active profile without changing unrelated saved profiles', async () => {
  const app = await running();
  try {
    const first = await (await post(app.base, '/api/profiles', preset('A', { apiKey: 'secret-a' }))).json();
    const firstId = first.activeProfileId;
    const second = await (await post(app.base, '/api/profiles', preset('B', { apiKey: 'secret-b' }))).json();
    const secondId = second.activeProfileId;
    const edited = await (await post(app.base, '/api/settings', { model: 'new-model', apiKey: '' })).json();
    assert.equal(edited.activeProfileId, secondId);
    assert.equal(edited.model, 'new-model');
    assert.equal(edited.profiles.find((profile: { id: string }) => profile.id === firstId).model, 'model-a');
    assert.equal(edited.profiles.find((profile: { id: string }) => profile.id === secondId).hasApiKey, true);
    const firstAgain = await (await post(app.base, '/api/profiles/select', { profileId: firstId })).json();
    assert.equal(firstAgain.model, 'model-a');
    assert.equal(firstAgain.hasApiKey, true);
    const deleted = await (await post(app.base, '/api/profiles/delete', { profileId: firstId })).json();
    assert.equal(deleted.mode, 'demo');
    assert.equal(deleted.activeProfileId, null);
    assert.equal(deleted.profiles.length, 1);
    assert.equal(deleted.profiles[0].id, secondId);
    assert.equal((await post(app.base, '/api/profiles/select', { profileId: firstId })).status, 404);
    assert.equal((await post(app.base, '/api/profiles/delete', { profileId: firstId })).status, 404);
    assert.equal((await post(app.base, '/api/profiles', preset('unknown', { id: 'unknown-id' }))).status, 404);
  } finally { await app.close(); }
});

test('encrypted profile snapshots reload while public settings never contain private material', async () => {
  let snapshot: unknown = null;
  const store = { persistence: 'encrypted', load: () => structuredClone(snapshot), save: (value: unknown) => { snapshot = structuredClone(value); } };
  let app = await running({ profileStore: store });
  let activeId: string;
  try {
    const saved = await (await post(app.base, '/api/profiles', preset('保存后重开', { apiKey: 'persisted-secret' }))).json();
    activeId = saved.activeProfileId;
    assert.equal(saved.profiles[0].keySaved, true);
    assert.equal(saved.persistence, 'encrypted');
    assert.doesNotMatch(JSON.stringify(saved), /persisted-secret|apiKey/);
  } finally { await app.close(); }
  app = await running({ profileStore: store });
  try {
    const loaded = await settings(app.base);
    assert.equal(loaded.activeProfileId, activeId!);
    assert.equal(loaded.profiles[0].name, '保存后重开');
    assert.equal(loaded.hasApiKey, true);
    const demo = await (await post(app.base, '/api/profiles/select', { profileId: null })).json();
    assert.equal(demo.mode, 'demo');
    assert.equal(demo.activeProfileId, null);
    assert.equal(demo.profiles.length, 1);
  } finally { await app.close(); }
});

test('configuration-only stores restore metadata and clearly require the session key again', async () => {
  let snapshot: { profiles: { apiKey: string }[] } | null = null;
  const store = {
    persistence: 'configuration', warning: '此环境仅保存配置，密钥在退出后清除。',
    load: () => structuredClone(snapshot),
    save: (value: { profiles: { apiKey: string }[] }) => { snapshot = structuredClone(value); snapshot.profiles.forEach(profile => { profile.apiKey = ''; }); },
  };
  let app = await running({ profileStore: store });
  try {
    const saved = await (await post(app.base, '/api/profiles', preset('仅配置', { apiKey: 'session-secret' }))).json();
    assert.equal(saved.hasApiKey, true);
    assert.equal(saved.profiles[0].keySaved, false);
    assert.equal(saved.persistence, 'configuration');
    assert.match(saved.storageWarning, /仅保存配置/);
  } finally { await app.close(); }
  app = await running({ profileStore: store });
  try {
    const loaded = await settings(app.base);
    assert.equal(loaded.profiles.length, 1);
    assert.equal(loaded.hasApiKey, false);
    assert.equal((await post(app.base, '/api/chat', chat)).status, 400);
  } finally { await app.close(); }
});

test('save failures leave the active configuration untouched and never expose storage exception details', async () => {
  let failed = false;
  const snapshots: unknown[] = [];
  const store = { persistence: 'encrypted', load: () => null, save: (value: unknown) => { if (failed) throw new Error('private-path private-secret'); snapshots.push(structuredClone(value)); } };
  const app = await running({ profileStore: store });
  try {
    const original = await (await post(app.base, '/api/profiles', preset('原来的模型', { apiKey: 'original-secret' }))).json();
    failed = true;
    for (const [path, body] of [
      ['/api/profiles', preset('未保存', { apiKey: 'unsaved-secret' })],
      ['/api/profiles/select', { profileId: null }],
      ['/api/profiles/delete', { profileId: original.activeProfileId }],
      ['/api/settings', { model: 'unsaved-model' }],
    ] as const) {
      const result = await post(app.base, path, body);
      assert.equal(result.status, 500);
      const message = await result.text();
      assert.match(message, /没有生效/);
      assert.doesNotMatch(message, /private-path|private-secret|unsaved-secret/);
      const current = await settings(app.base);
      assert.equal(current.activeProfileId, original.activeProfileId);
      assert.equal(current.profiles.length, 1);
      assert.equal(current.model, 'model-a');
      assert.match(current.storageWarning, /未能保存/);
    }
    assert.equal(snapshots.length, 1);
    failed = false;
    const recovered = await (await post(app.base, '/api/profiles/select', { profileId: null })).json();
    assert.equal(recovered.mode, 'demo');
    assert.equal(recovered.storageWarning, undefined);
  } finally { await app.close(); }
});

test('invalid or unreadable stored profiles are protected from silent overwrite', async () => {
  for (const load of [() => { throw new Error('decrypt private-secret'); }, () => ({ profiles: [{ id: 'bad' }], activeProfileId: 'bad', mode: 'api' })]) {
    let writes = 0;
    const app = await running({ profileStore: { persistence: 'encrypted', load, save: () => { writes++; } } });
    try {
      const current = await settings(app.base);
      assert.match(current.storageWarning, /未覆盖/);
      assert.doesNotMatch(JSON.stringify(current), /private-secret|decrypt/);
      assert.equal((await post(app.base, '/api/profiles', preset('不要覆盖', { apiKey: 'new-secret' }))).status, 500);
      assert.equal(writes, 0);
      assert.equal((await post(app.base, '/api/chat', { ...chat, profileId: null })).status, 200);
    } finally { await app.close(); }
  }
});

test('profile edits and selection changes cannot redirect a request already in progress', async () => {
  let releaseResponse: ((response: Response) => void) | undefined;
  let started: (() => void) | undefined;
  const whenStarted = new Promise<void>(resolve => { started = resolve; });
  const calls: { url: string; key: string | null; body: { model: string } }[] = [];
  const app = await running({ fetch: async (url: unknown, init: RequestInit) => {
    calls.push({ url: String(url), key: new Headers(init.headers).get('authorization'), body: JSON.parse(String(init.body)) });
    started!();
    return new Promise<Response>(resolve => { releaseResponse = resolve; });
  } });
  try {
    const first = await (await post(app.base, '/api/profiles', preset('请求中的模型', { apiKey: 'first-secret' }))).json();
    const pending = post(app.base, '/api/chat', { ...chat, profileId: first.activeProfileId });
    await whenStarted;
    await post(app.base, '/api/profiles', preset('另一个模型', { baseURL: 'https://second.example/v1', model: 'model-b', apiKey: 'second-secret' }));
    await post(app.base, '/api/profiles/delete', { profileId: first.activeProfileId });
    releaseResponse!(response('原模型完整回答'));
    const wire = await (await pending).text();
    assert.match(wire, /原模型完整回答/);
    assert.match(wire, /"type":"done"/);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'https://provider.example/v1/chat/completions');
    assert.equal(calls[0].key, 'Bearer first-secret');
    assert.equal(calls[0].body.model, 'model-a');
    const current = await settings(app.base);
    assert.equal(current.model, 'model-b');
    assert.equal(current.profiles.length, 1);
  } finally { releaseResponse?.(response()); await app.close(); }
});

test('profile validation rejects unsafe endpoints, invalid identifiers, formats and excessive counts', async () => {
  const app = await running();
  try {
    for (const input of [null, [], preset(''), preset('x'.repeat(81)), preset('无效格式', { apiFormat: 'other' }), preset('远程明文', { baseURL: 'http://remote.example/v1' }), preset('地址密钥', { baseURL: 'https://user:secret@remote.example/v1' }), preset('查询参数', { baseURL: 'https://remote.example/v1?key=secret' }), preset('缺少模型', { model: '' }), preset('无效id', { id: '../escape' }), preset('错误开关', { activate: 'yes' })]) {
      assert.equal((await post(app.base, '/api/profiles', input)).status, 400);
    }
    const local = await (await post(app.base, '/api/profiles', preset('本地服务', { baseURL: 'http://127.0.0.1:11434/v1' }))).json();
    assert.equal(local.hasApiKey, false);
    for (let index = 1; index < 50; index++) assert.equal((await post(app.base, '/api/profiles', preset(`配置 ${index}`, { activate: false }))).status, 200);
    assert.equal((await post(app.base, '/api/profiles', preset('超过数量'))).status, 400);
    assert.equal((await post(app.base, '/api/profiles/select', {})).status, 400);
    assert.equal((await post(app.base, '/api/profiles/delete', { profileId: 12 })).status, 400);
    assert.equal((await post(app.base, '/api/chat', { ...chat, profileId: false })).status, 400);
    assert.equal((await post(app.base, '/api/chat', { ...chat, profileId: 'missing' })).status, 404);
  } finally { await app.close(); }
});
