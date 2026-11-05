import { useEffect, useRef, useState } from 'react';
import { Check, KeyRound, Pencil, PlugZap, Plus, Trash2, X } from 'lucide-react';
import type { ModelProfile, ModelSettings, ProfileInput } from '../domain/types';
import { apiFormatOptions, connectionPresets, otherConnectionPresets, profileFromPreset } from '../domain/model-presets';

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
  const connectionName = useRef<HTMLInputElement>(null);
  const firstProfile = settings.profiles.find(profile => profile.id === settings.activeProfileId) ?? settings.profiles[0];
  const [form, setForm] = useState<ProfileInput>(() => firstProfile ? editProfile(firstProfile) : profileFromPreset(connectionPresets[0], settings.systemPrompt));
  const [presetId, setPresetId] = useState<string | null>(firstProfile ? null : 'relay');
  const [otherPresetId, setOtherPresetId] = useState('custom');
  const [apiKey, setApiKey] = useState('');
  const [clearApiKey, setClearApiKey] = useState(false);
  const [busy, setBusy] = useState<'save' | 'delete' | 'select' | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const currentProfile = settings.profiles.find(profile => profile.id === form.id);
  const retainedKey = Boolean(currentProfile?.hasApiKey && !clearApiKey);
  const otherPreset = otherConnectionPresets.find(item => item.id === otherPresetId);
  const preset = presetId === 'other' ? otherPreset : connectionPresets.find(item => item.id === presetId);
  const format = apiFormatOptions.find(item => item.value === form.apiFormat);

  useEffect(() => { dialog.current?.showModal(); }, []);

  function choosePreset(id: string) {
    const next = connectionPresets.find(item => item.id === id);
    if (!next) return;
    setForm(profileFromPreset(next, settings.systemPrompt));
    setOtherPresetId('custom');
    setPresetId(id); setApiKey(''); setClearApiKey(false); setDeleteId(null); setError('');
  }
  function chooseOtherPreset(id: string) {
    const next = otherConnectionPresets.find(item => item.id === id);
    if (!next) return;
    setForm(profileFromPreset(next, settings.systemPrompt));
    setOtherPresetId(id); setApiKey(''); setClearApiKey(false); setDeleteId(null); setError('');
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
      if (form.id === id) choosePreset('other');
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
      <div className="profile-section-heading"><h3 id="saved-profiles-title">已保存的连接</h3><button type="button" className="profile-text-button" disabled={Boolean(busy)} onClick={() => choosePreset('other')}><Plus size={14} />新建</button></div>
      {settings.profiles.length === 0 && <p className="profile-empty">还没有保存的模型，选一个下方模板开始。</p>}
      {settings.profiles.length > 0 && <>
        <div className="profile-picker-row">
          <select className="field-input profile-picker" aria-label="已保存的连接" value={currentProfile?.id ?? ''} disabled={Boolean(busy)} onChange={event => {
            const next = settings.profiles.find(profile => profile.id === event.target.value);
            if (next) chooseProfile(next);
          }}>
            <option value="" disabled>选择已保存的连接（{settings.profiles.length}）</option>
            {settings.profiles.map(profile => <option key={profile.id} value={profile.id}>{profile.name} · {profile.model}{settings.activeProfileId === profile.id && settings.mode === 'api' ? ' ✓ 使用中' : ''}</option>)}
          </select>
          <div className="profile-picker-actions">
            <button type="button" className="profile-text-button" onClick={() => currentProfile && selectProfile(currentProfile.id)} disabled={Boolean(busy) || !currentProfile || (settings.activeProfileId === currentProfile.id && settings.mode === 'api')}>{currentProfile && settings.activeProfileId === currentProfile.id && settings.mode === 'api' ? '使用中' : '使用'}</button>
            <button type="button" className="icon-button" aria-label="编辑所选连接" title="编辑所选连接" onClick={() => { connectionName.current?.focus(); connectionName.current?.select(); }} disabled={Boolean(busy) || !currentProfile}><Pencil size={14} /></button>
            <button type="button" className="icon-button" aria-label="删除所选连接" title="删除所选连接" onClick={() => currentProfile && setDeleteId(currentProfile.id)} disabled={Boolean(busy) || !currentProfile}><Trash2 size={14} /></button>
          </div>
        </div>
        {currentProfile && <p className="profile-selection-status">{currentProfile.hasApiKey ? (currentProfile.keySaved ? '密钥已加密保存' : '密钥仅本次有效') : '未设置密钥；本机服务未启用鉴权时可留空'}<span>选择后可在下方编辑，点击“使用”切换。</span></p>}
        {deleteId && currentProfile?.id === deleteId && <div className="profile-delete-confirm"><span>删除“{currentProfile.name}”及其密钥？聊天和批注会保留。</span><div><button type="button" className="profile-text-button" onClick={() => setDeleteId(null)} disabled={Boolean(busy)}>取消</button><button type="button" className="profile-text-button danger" onClick={() => deleteProfile(deleteId)} disabled={Boolean(busy)}>{busy === 'delete' ? '删除中…' : '确认删除'}</button></div></div>}
      </>}
      <button type="button" className="profile-demo-button" onClick={() => selectProfile(null)} disabled={Boolean(busy)}>{settings.mode === 'demo' && <Check size={13} />}使用本地演示<span>不调用 API</span></button>
    </section>

    <form onSubmit={submit}>
      <fieldset className="profile-form-fields" disabled={Boolean(busy)}>
        <legend className="profile-form-title">{form.id ? '编辑连接' : '新建连接'}</legend>
        <div className="connection-templates" role="group" aria-label="选择连接模板">
          {connectionPresets.map(item => <button type="button" key={item.id} className={`connection-template${presetId === item.id ? ' selected' : ''}`} aria-pressed={presetId === item.id} onClick={() => choosePreset(item.id)} title={item.description}>{item.name}</button>)}
        </div>
        {presetId === 'other' && <div className="other-connection-presets">
          <label className="field-label">常用服务<select className="field-input" value={otherPresetId} onChange={event => chooseOtherPreset(event.target.value)}>{otherConnectionPresets.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
          <p className="field-help">{otherPreset?.description}</p>
        </div>}
        <p className="field-help profile-template-help">{form.id ? '编辑当前配置；点击模板会新建另一项连接，需重新填写密钥。' : '模板只预填接口格式；地址、模型名称和回答偏好都可以修改。'}</p>
        <label className="field-label">连接名称<input ref={connectionName} className="field-input" value={form.name} maxLength={80} required onChange={e => setForm({ ...form, name: e.target.value })} placeholder="例如：本地模型、Kimi、我的 GPT" autoComplete="off" /></label>
        <label className="field-label">接口格式<select className="field-input" value={form.apiFormat} onChange={e => changeConnection({ apiFormat: e.target.value as ProfileInput['apiFormat'] })}>{apiFormatOptions.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
        <p className="field-help">{format?.help} 自定义服务请按提供方说明选择。</p>
        <label className="field-label">API 地址<input className="field-input" type="url" value={form.baseURL} required onChange={e => changeConnection({ baseURL: e.target.value })} placeholder={preset?.addressPlaceholder ?? '填写服务商提供的 API 基础地址，例如 https://api.example.com/v1'} autoComplete="off" /></label>
        <p className="field-help">填写基础地址即可，无需添加 /chat/completions、/responses 或 /messages。本机服务可使用 http://localhost 或 http://127.0.0.1 加端口。</p>
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
