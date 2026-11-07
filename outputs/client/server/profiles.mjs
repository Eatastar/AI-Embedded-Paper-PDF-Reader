import { randomUUID } from 'node:crypto';

const FORMATS = new Set(['openai-chat', 'openai-responses', 'anthropic-messages']);
const MAX_PROFILES = 50;

export class ProfileError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export function isLocalEndpoint(url) {
  return ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
}

function object(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new ProfileError(400, '模型配置格式不正确。');
  return input;
}

function text(value, label, max, trim = true) {
  if (typeof value !== 'string') throw new ProfileError(400, `${label}需要使用文字。`);
  const result = trim ? value.trim() : value;
  if (result.length > max) throw new ProfileError(400, `${label}过长，请适当缩短。`);
  return result;
}

function endpoint(value) {
  const raw = text(value, 'API 地址', 2048);
  let url;
  try { url = new URL(raw); } catch { throw new ProfileError(400, 'API 地址格式不正确，请填写完整地址。'); }
  if (url.username || url.password || url.search || url.hash || !['https:', 'http:'].includes(url.protocol)) {
    throw new ProfileError(400, 'API 地址不能包含账号、密码、查询参数或片段。');
  }
  if (url.protocol !== 'https:' && !isLocalEndpoint(url)) throw new ProfileError(400, '远程 API 地址请使用 HTTPS；本机服务可以使用 HTTP。');
  return url.href.replace(/\/$/, '');
}

function normalizeFields(input, previous, { requireKey = false, requireModel = true } = {}) {
  object(input);
  const next = { ...previous };
  if (input.imageInput !== undefined) { if (!['auto', 'supported', 'unsupported'].includes(input.imageInput)) throw new ProfileError(400, '图片能力设置无效。'); next.imageInput = input.imageInput; }
  if (input.apiFormat !== undefined) next.apiFormat = text(input.apiFormat, '接口格式', 40);
  if (!FORMATS.has(next.apiFormat)) throw new ProfileError(400, '请选择支持的接口格式。');
  if (input.baseURL !== undefined) next.baseURL = endpoint(input.baseURL);
  else next.baseURL = endpoint(next.baseURL);
  if (input.model !== undefined) next.model = text(input.model, '模型名称', 200);
  if (input.systemPrompt !== undefined) next.systemPrompt = text(input.systemPrompt, '回答偏好', 16000, false);
  if (input.clearApiKey !== undefined && typeof input.clearApiKey !== 'boolean') throw new ProfileError(400, '清除密钥设置格式不正确。');
  // A blank key only means "keep" while the destination and protocol are unchanged.
  let previousBaseURL;
  try { previousBaseURL = endpoint(previous.baseURL); } catch { previousBaseURL = previous.baseURL; }
  if (next.baseURL !== previousBaseURL || next.apiFormat !== previous.apiFormat || input.clearApiKey) next.apiKey = '';
  if (input.apiKey !== undefined) {
    const key = text(input.apiKey, 'API Key', 8192);
    if (key && !input.clearApiKey) next.apiKey = key;
  }
  if (requireModel && !next.model) throw new ProfileError(400, '请填写服务商提供的模型名称。');
  if (requireKey && !next.apiKey && !isLocalEndpoint(new URL(next.baseURL))) throw new ProfileError(400, '请填写 API Key；本机兼容服务可以留空。');
  return next;
}

function id(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(value)) throw new ProfileError(400, '模型配置标识不正确。');
  return value;
}

function normalizeStored(snapshot) {
  object(snapshot);
  if (!Array.isArray(snapshot.profiles) || snapshot.profiles.length > MAX_PROFILES || !['api', 'demo'].includes(snapshot.mode)) throw new Error('Invalid stored profiles');
  const used = new Set();
  const profiles = snapshot.profiles.map(raw => {
    object(raw);
    const profileId = id(raw.id);
    if (used.has(profileId)) throw new Error('Duplicate stored profile');
    used.add(profileId);
    const name = text(raw.name, '配置名称', 80);
    if (!name || typeof raw.apiKey !== 'string' || typeof raw.model !== 'string' || typeof raw.systemPrompt !== 'string') throw new Error('Invalid stored profile');
    const fields = normalizeFields(raw, { apiFormat: 'openai-chat', baseURL: 'https://api.openai.com/v1', model: '', systemPrompt: '', apiKey: '' });
    return { id: profileId, name, apiFormat: fields.apiFormat, baseURL: fields.baseURL, model: fields.model, systemPrompt: fields.systemPrompt, apiKey: fields.apiKey, ...(fields.imageInput ? { imageInput: fields.imageInput } : {}) };
  });
  const activeProfileId = snapshot.activeProfileId === null ? null : id(snapshot.activeProfileId);
  if (activeProfileId !== null && !used.has(activeProfileId)) throw new Error('Unknown active stored profile');
  if (snapshot.mode === 'api' && activeProfileId === null) throw new Error('Missing active stored profile');
  return { profiles, activeProfileId, mode: snapshot.mode };
}

/** Private keys remain in this closure; every public response is built field by field. */
export function createProfileManager({ initialSettings, store } = {}) {
  const initial = { ...initialSettings, apiFormat: initialSettings?.apiFormat || 'openai-chat' };
  let state = { profiles: [], activeProfileId: null, mode: initial.mode || 'demo', legacy: initial };
  let blocked = false;
  let localWarning = '';
  if (store) {
    try {
      const loaded = store.load();
      if (loaded !== null && loaded !== undefined) state = { ...state, ...normalizeStored(loaded) };
    } catch {
      blocked = true;
      localWarning = '已保存的模型配置暂时无法读取。为保护原文件，未覆盖它；请检查配置存储后重试。';
    }
  }
  const persistence = store?.persistence === 'encrypted' ? 'encrypted' : store ? 'configuration' : 'session';
  const selected = () => state.activeProfileId === null ? state.legacy : state.profiles.find(profile => profile.id === state.activeProfileId);
  const visible = profile => ({ apiFormat: profile.apiFormat, baseURL: profile.baseURL, model: profile.model, systemPrompt: profile.systemPrompt, hasApiKey: Boolean(profile.apiKey), ...(profile.imageInput ? { imageInput: profile.imageInput } : {}) });
  const storageWarning = () => localWarning || (typeof store?.warning === 'string' ? store.warning : '');
  const publicSettings = () => ({
    mode: state.mode,
    ...visible(selected()),
    profiles: state.profiles.map(profile => ({ id: profile.id, name: profile.name, ...visible(profile), keySaved: persistence === 'encrypted' && Boolean(profile.apiKey) })),
    activeProfileId: state.activeProfileId,
    persistence,
    ...(storageWarning() ? { storageWarning: storageWarning() } : {}),
  });
  const commit = next => {
    if (blocked) throw new ProfileError(500, '已保存的模型配置暂时无法读取，未覆盖原文件。请先检查配置存储。');
    if (store) {
      // Legacy settings are session-only. This snapshot contains only named profiles.
      const snapshot = { profiles: next.profiles.map(profile => ({ ...profile })), activeProfileId: next.activeProfileId, mode: next.activeProfileId === null ? 'demo' : next.mode };
      try { store.save(snapshot); }
      catch {
        localWarning = '模型配置未能保存，本次修改没有生效。请检查存储位置后重试。';
        throw new ProfileError(500, localWarning);
      }
    }
    state = next;
    localWarning = '';
    return publicSettings();
  };
  const find = profileId => {
    id(profileId);
    const profile = state.profiles.find(item => item.id === profileId);
    if (!profile) throw new ProfileError(404, '找不到这份模型配置，请重新选择。');
    return profile;
  };

  return {
    publicSettings,
    forDiscovery(input) {
      object(input);
      const previous = input.id === undefined ? { apiFormat: 'openai-chat', baseURL: 'https://api.openai.com/v1', model: '', systemPrompt: '', apiKey: '' } : find(input.id);
      return normalizeFields(input, previous, { requireKey: true, requireModel: false });
    },
    updateSettings(input) {
      object(input);
      const mode = input.mode === undefined ? state.mode : text(input.mode, '模式', 20);
      if (!['api', 'demo'].includes(mode)) throw new ProfileError(400, '请选择演示模式或 API 模式。');
      const previous = selected();
      const fields = normalizeFields(input, previous, { requireKey: mode === 'api', requireModel: mode === 'api' });
      if (state.activeProfileId !== null) {
        const profiles = state.profiles.map(profile => profile.id === state.activeProfileId ? { ...profile, ...fields } : profile);
        return commit({ ...state, profiles, mode });
      }
      return commit({ ...state, legacy: { ...fields, mode }, mode });
    },
    saveProfile(input) {
      object(input);
      if (input.activate !== undefined && typeof input.activate !== 'boolean') throw new ProfileError(400, '启用模型设置格式不正确。');
      const previous = input.id === undefined ? null : find(input.id);
      if (!previous && state.profiles.length >= MAX_PROFILES) throw new ProfileError(400, `最多保存 ${MAX_PROFILES} 份模型配置，请先删除不再使用的配置。`);
      const name = text(input.name, '配置名称', 80);
      if (!name) throw new ProfileError(400, '请给这份模型配置起个名字。');
      const fields = normalizeFields(input, previous || { apiFormat: 'openai-chat', baseURL: 'https://api.openai.com/v1', model: '', systemPrompt: initial.systemPrompt || '', apiKey: '' });
      const profile = { id: previous?.id || randomUUID(), name, apiFormat: fields.apiFormat, baseURL: fields.baseURL, model: fields.model, systemPrompt: fields.systemPrompt, apiKey: fields.apiKey, ...(fields.imageInput ? { imageInput: fields.imageInput } : {}) };
      const profiles = previous ? state.profiles.map(item => item.id === previous.id ? profile : item) : [...state.profiles, profile];
      const activate = input.activate !== false;
      return commit({ ...state, profiles, ...(activate ? { activeProfileId: profile.id, mode: 'api' } : {}) });
    },
    selectProfile(profileId) {
      if (profileId === null) return commit({ ...state, activeProfileId: null, mode: 'demo' });
      find(profileId);
      return commit({ ...state, activeProfileId: profileId, mode: 'api' });
    },
    deleteProfile(profileId) {
      find(profileId);
      return commit({ ...state, profiles: state.profiles.filter(profile => profile.id !== profileId), ...(state.activeProfileId === profileId ? { activeProfileId: null, mode: 'demo' } : {}) });
    },
    forRequest(profileId = undefined) {
      if (profileId === null) return { ...state.legacy, mode: 'demo' };
      const profile = profileId === undefined ? selected() : find(profileId);
      const mode = profileId === undefined ? state.mode : 'api';
      return { ...normalizeFields({}, profile, { requireKey: mode === 'api', requireModel: mode === 'api' }), mode };
    },
  };
}
