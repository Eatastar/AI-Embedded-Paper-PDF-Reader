import { useEffect, useRef, useState } from 'react';
import { Check, KeyRound, Pencil, PlugZap, Plus, Trash2, X } from 'lucide-react';
import type { ModelProfile, ModelSettings, ProfileInput } from '../domain/types';
import { apiFormatOptions, connectionPresets, profileFromPreset } from '../domain/model-presets';

function editProfile(profile: ModelProfile): ProfileInput {
  return {
    id: profile.id, name: profile.name, apiFormat: profile.apiFormat,
    baseURL: profile.baseURL, model: profile.model, systemPrompt: profile.systemPrompt,
  };
}

export function SettingsDialog({ settings, onClose, onSaveProfile, onDeleteProfile, onSelectProfile }: {
  settings: ModelSettings;
  onClose: () => void;
  onSaveProfile: (value: ProfileInput) => Promise<void>;
  onDeleteProfile: (id: string) => Promise<void>;
  onSelectProfile: (id: string | null) => Promise<void>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const firstProfile = settings.profiles.find(profile => profile.id === settings.activeProfileId) ?? settings.profiles[0];
  const [form, setForm] = useState<ProfileInput>(() => firstProfile ? editProfile(firstProfile) : profileFromPreset(connectionPresets[0], settings.systemPrompt));
  const [presetId, setPresetId] = useState<string | null>(firstProfile ? null : 'relay');
  const [apiKey, setApiKey] = useState('');
  const [clearApiKey, setClearApiKey] = useState(false);
  const [busy, setBusy] = useState<'save' | 'delete' | 'select' | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const currentProfile = settings.profiles.find(profile => profile.id === form.id);
  const retainedKey = Boolean(currentProfile?.hasApiKey && !clearApiKey);
  const preset = connectionPresets.find(item => item.id === presetId);
  const format = apiFormatOptions.find(item => item.value === form.apiFormat);

  useEffect(() => { dialog.current?.showModal(); }, []);

  function choosePreset(id: string) {
    const next = connectionPresets.find(item => item.id === id);
    if (!next) return;
    setForm(profileFromPreset(next, settings.systemPrompt));
    setPresetId(id); setApiKey(''); setClearApiKey(false); setDeleteId(null); setError('');
  }
  function chooseProfile(profile: ModelProfile) {
    setForm(editProfile(profile)); setPresetId(null); setApiKey('');
    setClearApiKey(false); setDeleteId(null); setError('');
  }
  function changeConnection(value: Partial<ProfileInput>) {
    setForm(previous => ({ ...previous, ...value }));
    setApiKey('');
    if (currentProfile?.hasApiKey) setClearApiKey(true);
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setError(''); setBusy('save');
    try {
      await onSaveProfile({ ...form, apiKey: apiKey.trim() || undefined, clearApiKey: clearApiKey && !apiKey.trim(), activate: true });
      onClose();
    } catch (e) { setError(e instanceof Error ? e.message : '配置未能保存，请重试。'); }
    finally { setBusy(null); }
  }
  async function selectProfile(id: string | null) {
    setError(''); setBusy('select');
    try { await onSelectProfile(id); onClose(); }
    catch (e) { setError(e instanceof Error ? e.message : '暂时无法切换模型，请重试。'); }
    finally { setBusy(null); }
  }
  async function deleteProfile(id: string) {
    setError(''); setBusy('delete');
    try {
      await onDeleteProfile(id);
      if (form.id === id) choosePreset('relay');
      setDeleteId(null);
    } catch (e) { setError(e instanceof Error ? e.message : '配置未能删除，请重试。'); }
    finally { setBusy(null); }
  }

  return <dialog className="settings-dialog profile-settings-dialog" ref={dialog} onCancel={onClose} aria-labelledby="settings-title">
    <header className="dialog-header">
      <div><span className="eyebrow">MODEL CONNECTIONS</span><h2 id="settings-title">我的模型</h2><p className="profile-dialog-intro">提前保存连接，聊天时在输入框左下角切换。</p></div>
      <button type="button" className="icon-button" aria-label="关闭设置" onClick={onClose}><X size={20} /></button>
    </header>

    <section className="saved-profiles" aria-labelledby="saved-profiles-title">
      <div className="profile-section-heading"><h3 id="saved-profiles-title">已保存的连接</h3><button type="button" className="profile-text-button" disabled={Boolean(busy)} onClick={() => choosePreset('relay')}><Plus size={14} />新建</button></div>
      {settings.profiles.length === 0 && <p className="profile-empty">还没有保存的模型，选一个下方模板开始。</p>}
      <div className="profile-list">
        {settings.profiles.map(profile => <div className={`profile-list-item${form.id === profile.id ? ' editing' : ''}`} key={profile.id}>
          <button type="button" className="profile-list-name" onClick={() => chooseProfile(profile)} disabled={Boolean(busy)} aria-label={`查看 ${profile.name} 的配置`}>
            <strong>{profile.name}{settings.activeProfileId === profile.id && settings.mode === 'api' && <span className="profile-active-label"><Check size={11} />使用中</span>}</strong>
            <span>{profile.model}<span className="profile-key-state">{profile.hasApiKey ? (profile.keySaved ? '密钥已保存' : '密钥本次有效') : '未填写密钥'}</span></span>
          </button>
          <div className="profile-list-actions">
            <button type="button" className="profile-text-button" onClick={() => selectProfile(profile.id)} disabled={Boolean(busy) || (settings.activeProfileId === profile.id && settings.mode === 'api')}>使用</button>
            <button type="button" className="icon-button" aria-label={`编辑 ${profile.name}`} title="编辑配置" onClick={() => chooseProfile(profile)} disabled={Boolean(busy)}><Pencil size={14} /></button>
            <button type="button" className="icon-button" aria-label={`删除 ${profile.name}`} title="删除配置" onClick={() => setDeleteId(profile.id)} disabled={Boolean(busy)}><Trash2 size={14} /></button>
          </div>
          {deleteId === profile.id && <div className="profile-delete-confirm"><span>删除这项连接及其密钥？聊天和批注会保留。</span><div><button type="button" className="profile-text-button" onClick={() => setDeleteId(null)} disabled={Boolean(busy)}>取消</button><button type="button" className="profile-text-button danger" onClick={() => deleteProfile(profile.id)} disabled={Boolean(busy)}>{busy === 'delete' ? '删除中…' : '确认删除'}</button></div></div>}
        </div>)}
      </div>
      <button type="button" className="profile-demo-button" onClick={() => selectProfile(null)} disabled={Boolean(busy)}>{settings.mode === 'demo' && <Check size={13} />}使用本地演示<span>不调用 API</span></button>
    </section>

    <form onSubmit={submit}>
      <fieldset className="profile-form-fields" disabled={Boolean(busy)}>
        <legend className="profile-form-title">{form.id ? '编辑连接' : '新建连接'}</legend>
        <div className="connection-templates" role="group" aria-label="选择连接模板">
          {connectionPresets.map(item => <button type="button" key={item.id} className={`connection-template${presetId === item.id ? ' selected' : ''}`} aria-pressed={presetId === item.id} onClick={() => choosePreset(item.id)} title={item.description}>{item.name}</button>)}
        </div>
        <p className="field-help profile-template-help">{form.id ? '编辑当前配置；点击模板会新建另一项连接，需重新填写密钥。' : '模板只预填接口格式；地址、模型名称和回答偏好都可以修改。'}</p>
        <label className="field-label">连接名称<input className="field-input" value={form.name} maxLength={80} required onChange={e => setForm({ ...form, name: e.target.value })} placeholder="例如：我的 GPT、Claude 工作、中转站 A" autoComplete="off" /></label>
        <label className="field-label">接口格式<select className="field-input" value={form.apiFormat} onChange={e => changeConnection({ apiFormat: e.target.value as ProfileInput['apiFormat'] })}>{apiFormatOptions.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
        <p className="field-help">{format?.help} 中转站请按服务商说明选择。</p>
        <label className="field-label">API 地址<input className="field-input" type="url" value={form.baseURL} required onChange={e => changeConnection({ baseURL: e.target.value })} placeholder={preset?.addressPlaceholder ?? '填写服务商提供的 API 基础地址，例如 https://api.example.com/v1'} autoComplete="off" /></label>
        <p className="field-help">填写基础地址即可，无需添加 /chat/completions、/responses 或 /messages。</p>
        <label className="field-label">模型名称<input className="field-input" value={form.model} required onChange={e => setForm({ ...form, model: e.target.value })} placeholder={preset?.modelPlaceholder ?? '填写服务商提供的完整模型名称'} autoComplete="off" /></label>
        <label className="field-label">API 密钥 <span className="field-side">{apiKey ? '将使用新密钥' : retainedKey ? (currentProfile?.keySaved ? '已加密保存' : '本次运行已设置') : '未填写，可稍后补充'}</span>
          <span className="password-field"><KeyRound size={16} /><input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} autoComplete="off" placeholder={retainedKey ? '留空保留此连接的密钥' : '输入此服务的 API Key，也可先留空'} /></span>
        </label>
        {clearApiKey && currentProfile?.hasApiKey && <p className="profile-key-notice">接口地址或格式已修改，原密钥不会沿用。请填写新密钥，或留空稍后补充。</p>}
        <p className="field-help profile-storage-help">{settings.persistence === 'encrypted' ? '密钥使用本机系统加密保存，重启后可继续使用。' : settings.persistence === 'configuration' ? '连接配置会保存在本机；密钥仅本次运行有效，重启后需重新填写。' : '当前只能在本次运行中保留连接和密钥，退出后需重新填写。'} 密钥不会进入聊天记录或聊天备份。</p>
        {settings.storageWarning && <p className="profile-key-notice">{settings.storageWarning}</p>}
        <label className="field-label">回答偏好<textarea className="field-input" rows={3} value={form.systemPrompt} onChange={e => setForm({ ...form, systemPrompt: e.target.value })} placeholder="例如：用中文回答，解释清楚，适当举例。" /></label>
      </fieldset>
      {error && <p className="form-error" role="alert">{error}</p>}
      <footer className="dialog-footer profile-dialog-footer"><span>保存和切换都不会发送问题</span><div><button type="button" className="profile-text-button" onClick={onClose} disabled={Boolean(busy)}>取消</button><button className="primary-button" disabled={Boolean(busy)} type="submit"><PlugZap size={16} />{busy === 'save' ? '保存中…' : '保存并使用'}</button></div></footer>
    </form>
  </dialog>;
}
