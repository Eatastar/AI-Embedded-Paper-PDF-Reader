import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AssistantRuntimeProvider, ComposerPrimitive, ThreadPrimitive, useExternalStoreRuntime } from '@assistant-ui/react';
import type { ThreadMessageLike } from '@assistant-ui/react';
import { ArrowDown, ArrowUp, BookOpen, Check, ChevronLeft, ChevronRight, Download, FileUp, FileText, Menu, MessageSquare, Paperclip, PenLine, Plus, RefreshCw, RotateCcw, Settings2, Sparkles, Square, Trash2, X } from 'lucide-react';
import type { Annotation, ChatMessage, Conversation, InputMessage, MessageVersion, ModelSettings, ProfileInput, Workspace } from './domain/types';
import { activeVersion, addAssistantVersion, buildMainContext, completeAnnotation, createAssistantMessage, createConversation, createUserMessage, deleteAnnotation, restoreAnnotation, deleteConversation, restoreConversation, prepareAnnotationRequest, updateAnnotationCopy, saveNoteAnnotation } from './domain/workspace';
import { exportWorkspaceWithFiles, importWorkspaceWithFiles, saveDocumentBytes } from './adapters/storage';
import { deleteProfile, getSettings, saveProfile, selectProfile, streamReply } from './adapters/model';
import { AnnotatedAnswer } from './components/AnnotatedAnswer';
import { SettingsDialog } from './components/SettingsDialog';
import { useWorkspace } from './hooks/useWorkspace';
import { DocumentReader } from './components/DocumentReader';

const DEFAULT_SETTINGS: ModelSettings = { mode: 'demo', baseURL: 'https://api.openai.com/v1', model: '', systemPrompt: '请用中文清晰地回答，解释概念时适当举例。', hasApiKey: false, apiFormat: 'openai-chat', profiles: [], activeProfileId: null, persistence: 'session' };
type Busy = { conversationId: string; messageId: string; versionId: string; controller: AbortController };

function updateConversation(workspace: Workspace, id: string, change: (c: Conversation) => Conversation) {
  return { ...workspace, conversations: workspace.conversations.map(c => c.id === id ? change(c) : c) };
}
function patchVersion(c: Conversation, messageId: string, versionId: string, patch: Partial<MessageVersion>): Conversation {
  return { ...c, updatedAt: Date.now(), messages: c.messages.map(m => m.id === messageId ? { ...m, versions: m.versions.map(v => v.id === versionId ? { ...v, ...patch } : v) } : m) };
}
const errorText = (e: unknown) => e instanceof Error ? e.message : '操作未完成，请重试。';

export default function App() {
  const { workspace, current, update, saveStatus, loadError } = useWorkspace();
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [openAnnotationId, setOpenAnnotationId] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [mainBusyId, setMainBusyId] = useState<string | null>(null);
  const [modelSwitchBusy, setModelSwitchBusy] = useState(false);
  const [fileBusy, setFileBusy] = useState(false);
  const [openDocumentId, setOpenDocumentId] = useState<string | null>(null);
  const [readerFocused, setReaderFocused] = useState(false);
  const fileOperation = useRef(false);
  const mainRequest = useRef<Busy | null>(null);
  const annotationRequests = useRef(new Set<string>());
  const fileInput = useRef<HTMLInputElement>(null);
  const uploadInput = useRef<HTMLInputElement>(null);
  const notify = useCallback((text: string) => setNotice(text), []);
  useEffect(() => { getSettings().then(setSettings).catch(() => notify('模型服务暂未连接，请重新启动客户端。')); }, [notify]);
  useEffect(() => {
    if (!notice) return;
    const timeout = setTimeout(() => setNotice(''), 6500);
    return () => clearTimeout(timeout);
  }, [notice]);

  const active = workspace?.conversations.find(c => c.id === workspace.activeConversationId && c.deletedAt === undefined);
  const openDocument = active?.documents?.find(d => d.id === openDocumentId);
  const deletedConversations = workspace?.conversations.filter(c => c.deletedAt !== undefined).sort((a, b) => b.deletedAt! - a.deletedAt!) || [];
  const latestDeleted = workspace?.conversations.filter(c => c.deletedAt === undefined).flatMap(c => c.annotations.filter(a => a.deletedAt !== undefined).map(annotation => ({ conversationId: c.id, annotation }))).sort((a, b) => b.annotation.deletedAt! - a.annotation.deletedAt!)[0];
  const mutateConversation = useCallback((id: string, change: (c: Conversation) => Conversation) => {
    update(previous => updateConversation(previous, id, change));
  }, [update]);
  function ensureModelIdle() {
    if (mainRequest.current || annotationRequests.current.size) throw new Error('请等当前回答完成后，再修改或切换模型。');
  }
  async function chooseModel(profileId: string | null) {
    ensureModelIdle();
    setModelSwitchBusy(true);
    try { const next = await selectProfile(profileId); setSettings(next); notify(profileId ? '已切换模型，后续问题会使用这份配置。' : '已切换到演示模式。'); }
    finally { setModelSwitchBusy(false); }
  }
  async function storeProfile(value: ProfileInput) {
    ensureModelIdle();
    const next = await saveProfile(value);
    setSettings(next); notify('模型配置已保存。');
  }
  async function removeProfile(id: string) {
    ensureModelIdle();
    const next = await deleteProfile(id);
    setSettings(next); notify('已删除模型配置，聊天记录继续保留。');
  }
  function selectConversation(id: string) {
    if (fileOperation.current) return;
    setOpenAnnotationId(null); setOpenDocumentId(null); setSidebarOpen(false);
    update(w => ({ ...w, activeConversationId: id }));
  }
  function newConversation() {
    if (fileOperation.current) return;
    const conversation = createConversation();
    update(w => ({ ...w, conversations: [conversation, ...w.conversations], activeConversationId: conversation.id }));
    setOpenAnnotationId(null); setOpenDocumentId(null); setSidebarOpen(false);
  }
  function removeConversation(id: string) {
    if (fileOperation.current) return;
    const conversation = current.current?.conversations.find(c => c.id === id);
    if (mainRequest.current?.conversationId === id || conversation?.annotations.some(a => a.status === 'generating')) { notify('请等这个对话的回答完成，或停止生成后再删除。'); return; }
    try { update(w => deleteConversation(w, id)); setOpenAnnotationId(null); setOpenDocumentId(null); notify('对话已删除，可在“已删除的对话”中恢复。'); }
    catch (e) { notify(errorText(e)); }
  }
  function recoverConversation(id: string) {
    if (fileOperation.current) return;
    try { update(w => restoreConversation(w, id)); setOpenAnnotationId(null); setOpenDocumentId(null); setSidebarOpen(false); notify('对话及其附件、批注已恢复。'); }
    catch (e) { notify(errorText(e)); }
  }
  async function runMain(conversationId: string, messageId: string, versionId: string, messages: InputMessage[], variant = 0) {
    const controller = new AbortController();
    mainRequest.current = { conversationId, messageId, versionId, controller };
    setMainBusyId(conversationId);
    let content = '';
    try {
      mutateConversation(conversationId, c => patchVersion(c, messageId, versionId, { modelLabel: settings.mode === 'demo' ? '本地演示' : settings.model }));
      const result = await streamReply({ messages, kind: 'main', variant, ...(settings.activeProfileId ? { profileId: settings.activeProfileId } : settings.mode === 'demo' ? { profileId: null } : {}) }, delta => {
        content += delta;
        mutateConversation(conversationId, c => patchVersion(c, messageId, versionId, { content }));
      }, controller.signal);
      if (!content.trim()) throw new Error('模型返回了空回答，请重试。');
      mutateConversation(conversationId, c => patchVersion(c, messageId, versionId, { content, status: 'complete', modelLabel: result.modelLabel }));
    } catch (e) {
      const aborted = controller.signal.aborted;
      mutateConversation(conversationId, c => patchVersion(c, messageId, versionId, { content, status: aborted ? 'interrupted' : 'error', error: aborted ? '回答已停止，可以继续发送新问题或重新生成。' : errorText(e) }));
      if (!aborted) notify(errorText(e));
    } finally {
      mainRequest.current = null; setMainBusyId(null);
    }
  }
  async function sendMain(conversationId: string, question: string) {
    if (fileOperation.current) { notify('请等文件处理完成后再发送。'); return; }
    if (mainRequest.current) { notify('请先等待当前回答完成，或停止生成。'); return; }
    const conversation = current.current?.conversations.find(c => c.id === conversationId);
    if (!conversation || !question.trim()) return;
    try {
      const user = createUserMessage(question.trim());
      const base = { ...conversation, messages: [...conversation.messages, user] };
      const messages = buildMainContext(base, settings.systemPrompt);
      const assistant = createAssistantMessage();
      mutateConversation(conversationId, () => ({ ...base, title: conversation.messages.length === 0 ? question.trim().slice(0, 25) : conversation.title, updatedAt: Date.now(), messages: [...base.messages, assistant] }));
      setOpenAnnotationId(null);
      await runMain(conversationId, assistant.id, assistant.activeVersionId, messages);
    } catch (e) { notify(errorText(e)); }
  }
  async function regenerate(conversationId: string, messageId: string) {
    if (mainRequest.current) return;
    const conversation = current.current?.conversations.find(c => c.id === conversationId);
    if (!conversation) return;
    const index = conversation.messages.findIndex(m => m.id === messageId);
    if (index !== conversation.messages.length - 1) { notify('请在最后一条回答上重新生成。旧回答仍可切换版本和查看批注。'); return; }
    try {
      const messages = buildMainContext({ ...conversation, messages: conversation.messages.slice(0, index) }, settings.systemPrompt);
      const next = addAssistantVersion(conversation.messages[index]);
      mutateConversation(conversationId, c => ({ ...c, messages: c.messages.map(m => m.id === messageId ? next : m), updatedAt: Date.now() }));
      setOpenAnnotationId(null);
      await runMain(conversationId, messageId, next.activeVersionId, messages, next.versions.length - 1);
    } catch (e) { notify(errorText(e)); }
  }
  function setVersion(conversationId: string, messageId: string, versionId: string) {
    if (mainRequest.current) return;
    setOpenAnnotationId(null);
    mutateConversation(conversationId, c => ({ ...c, messages: c.messages.map(m => m.id === messageId ? { ...m, activeVersionId: versionId } : m), updatedAt: Date.now() }));
  }
  function addAnnotation(conversationId: string, annotation: Annotation) {
    mutateConversation(conversationId, c => c.annotations.some(a => a.id === annotation.id) ? c : { ...c, updatedAt: Date.now(), annotations: [...c.annotations, annotation] });
    setOpenAnnotationId(annotation.id);
  }
  function editAnnotation(conversationId: string, id: string, patch: Partial<Annotation>) {
    try {
      mutateConversation(conversationId, c => {
        const annotation = c.annotations.find(a => a.id === id);
        if (!annotation || annotation.status === 'generating') return c;
        if (annotation.mode === 'note' && (patch.status === 'noted' || (annotation.status === 'noted' && patch.note !== undefined))) return saveNoteAnnotation(c, id, patch.note ?? annotation.note ?? '');
        const textPatch: { question?: string; answer?: string; mode?: 'ask' | 'note'; note?: string } = {};
        if (patch.mode !== undefined) textPatch.mode = patch.mode;
        if (patch.note !== undefined) textPatch.note = patch.note;
        if (patch.question !== undefined) textPatch.question = patch.question;
        if (patch.answer !== undefined && annotation.status === 'answered') textPatch.answer = patch.answer;
        return updateAnnotationCopy(c, id, textPatch);
      });
    } catch (e) { notify(errorText(e)); }
  }
  function removeAnnotation(conversationId: string, id: string) {
    if (annotationRequests.current.has(id)) { notify('请等批注回答完成后再删除。'); return; }
    try {
      mutateConversation(conversationId, c => deleteAnnotation(c, id));
      if (openAnnotationId === id) setOpenAnnotationId(null);
      notify('已删除批注与高亮，可撤销。');
    } catch (e) { notify(errorText(e)); }
  }
  function undoDelete() {
    if (mainRequest.current) { notify('请等主回答完成后再恢复批注。'); return; }
    const deleted = current.current?.conversations.filter(c => c.deletedAt === undefined).flatMap(c => c.annotations.filter(a => a.deletedAt !== undefined).map(annotation => ({ conversationId: c.id, annotation }))).sort((a, b) => b.annotation.deletedAt! - a.annotation.deletedAt!)[0];
    if (!deleted) return;
    update(w => ({
      ...updateConversation(w, deleted.conversationId, c => ({
        ...restoreAnnotation(c, deleted.annotation.id),
        messages: c.messages.map(m => m.id === deleted.annotation.messageId ? { ...m, activeVersionId: deleted.annotation.versionId } : m),
      })), activeConversationId: deleted.conversationId,
    }));
    setSidebarOpen(false); setOpenAnnotationId(deleted.annotation.id);
    const source = current.current?.conversations.find(c => c.id === deleted.conversationId)?.documents?.find(d => d.pages.some(p => p.messageId === deleted.annotation.messageId));
    setOpenDocumentId(source?.id || null);
    notify('批注与高亮已恢复。');
  }
  async function askAnnotation(conversationId: string, annotationId: string) {
    if (fileOperation.current) { notify('请等文件处理完成后再提问。'); return; }
    if (annotationRequests.current.has(annotationId)) return;
    if (mainRequest.current?.conversationId === conversationId) { notify('请等主回答完成后再发送批注问题。'); return; }
    const conversation = current.current?.conversations.find(c => c.id === conversationId);
    if (!conversation) return;
    let prepared;
    try { prepared = prepareAnnotationRequest(conversation, annotationId, settings.systemPrompt); }
    catch (e) { notify(errorText(e)); return; }
    annotationRequests.current.add(annotationId);
    mutateConversation(conversationId, () => prepared.conversation);
    let answer = '';
    try {
      await streamReply({ messages: prepared.messages, kind: 'annotation', quote: prepared.annotation.quote, ...(settings.activeProfileId ? { profileId: settings.activeProfileId } : settings.mode === 'demo' ? { profileId: null } : {}) }, delta => {
        answer += delta;
        mutateConversation(conversationId, c => ({ ...c, annotations: c.annotations.map(a => a.id === annotationId ? { ...a, answer, updatedAt: Date.now() } : a) }));
      });
      mutateConversation(conversationId, c => completeAnnotation(c, annotationId, answer));
    } catch (e) {
      mutateConversation(conversationId, c => ({ ...c, updatedAt: Date.now(), annotations: c.annotations.map(a => a.id === annotationId ? { ...a, answer, status: 'error', error: errorText(e), updatedAt: Date.now() } : a) }));
    } finally { annotationRequests.current.delete(annotationId); }
  }
  async function downloadBackup(conversationId?: string) {
    if (!current.current) return;
    try {
      const snapshot = current.current;
      const selected = conversationId ? snapshot.conversations.find(c => c.id === conversationId && c.deletedAt === undefined) : undefined;
      const source = selected ? { ...snapshot, conversations: [selected], activeConversationId: selected.id } : snapshot;
      const blob = new Blob([await exportWorkspaceWithFiles(source)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a'); link.href = url; link.download = 'learn-something-备份-' + new Date().toISOString().slice(0, 10) + '.json'; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000); notify('完整备份已导出，包含附件原文件、所有回答版本和批注。');
    } catch (e) { notify(errorText(e)); }
  }
  async function importBackup(file: File) {
    if (fileOperation.current || mainRequest.current || annotationRequests.current.size) { notify('请等文件处理和回答结束后再导入。'); return; }
    fileOperation.current = true; setFileBusy(true);
    try {
      if (file.size > 350_000_000) throw new Error('备份超过 350 MB，请选择较小的备份文件。');
      const text = await file.text();
      const snapshot = current.current!;
      const merged = await importWorkspaceWithFiles(text, snapshot);
      if (current.current !== snapshot) throw new Error('对话在导入时发生变化，请重新导入。');
      update(() => merged);
      setOpenAnnotationId(null); setOpenDocumentId(null); setSidebarOpen(false); notify('已导入为新对话，附件和原有记录完整保留。');
    } catch (e) { notify(errorText(e)); }
    finally { if (fileInput.current) fileInput.current.value = ''; fileOperation.current = false; setFileBusy(false); }
  }
  async function uploadDocument(file: File) {
    if (fileOperation.current || mainRequest.current || annotationRequests.current.size) { notify('请等当前文件或回答完成后再上传。'); return; }
    const conversationId = current.current?.activeConversationId;
    if (!conversationId) return;
    fileOperation.current = true; setFileBusy(true); notify('正在读取文件，请稍候…');
    try {
      const existing = current.current?.conversations.find(c => c.id === conversationId);
      if (!existing || (existing.documents?.length || 0) >= 10) throw new Error('每个对话最多保存 10 份附件，请新建对话后上传。');
      const { parseDocumentFile } = await import('./adapters/documents');
      const parsed = await parseDocumentFile(file);
      await saveDocumentBytes(parsed.document.id, parsed.bytes);
      mutateConversation(conversationId, c => ({ ...c, title: c.messages.length === 0 && !c.documents?.length ? parsed.document.name.slice(0, 40) : c.title, documents: [...(c.documents || []), parsed.document], updatedAt: Date.now() }));
      setOpenAnnotationId(null); setOpenDocumentId(parsed.document.id); setReaderFocused(true); setSidebarOpen(false);
      notify('文件已保存在本机。可直接阅读批注，也可在对话框中询问文件内容。');
    } catch (e) { notify(errorText(e)); }
    finally { fileOperation.current = false; setFileBusy(false); if (uploadInput.current) uploadInput.current.value = ''; }
  }
  if (!workspace || !active) return <div className="loading-screen"><PenLine size={30} /><h1>learn something</h1><p>{loadError || '正在打开你的阅读空间…'}</p>{loadError && <button onClick={() => location.reload()} className="primary-button">重新打开</button>}</div>;
  return <div className={'app-shell' + (openDocument && readerFocused ? ' reader-focused' : '')}>
    {sidebarOpen && <button className="mobile-overlay" aria-label="关闭对话列表" onClick={() => setSidebarOpen(false)} />}
    <aside className={'sidebar ' + (sidebarOpen ? 'sidebar-open' : '')}>
      <div className="brand"><span className="brand-mark"><PenLine size={20} /></span><span className="brand-name">learn something<small>阅读与批注</small></span><button className="icon-button mobile-close" aria-label="关闭对话列表" onClick={() => setSidebarOpen(false)}><X size={18} /></button></div>
      <button className="new-conversation" disabled={fileBusy} onClick={newConversation}><Plus size={18} />开启新对话<span>＋</span></button>
      <button className="open-reading-file" disabled={fileBusy || mainBusyId !== null} onClick={() => uploadInput.current?.click()}><BookOpen size={17} />打开文件阅读</button>
      <div className="sidebar-section-label">你的对话</div>
      <nav className="conversation-list" aria-label="对话列表">
        {workspace.conversations.filter(c => c.deletedAt === undefined).sort((a, b) => b.updatedAt - a.updatedAt).map(c => <div key={c.id} className={'conversation-row ' + (c.id === active.id ? 'active' : '')}><button className={'conversation-item ' + (c.id === active.id ? 'active' : '')} disabled={fileBusy} onClick={() => selectConversation(c.id)} aria-current={c.id === active.id ? 'page' : undefined}>
          <MessageSquare size={16} /><span>{c.title}</span>{c.annotations.some(a => a.deletedAt === undefined) && <small>{c.annotations.filter(a => a.deletedAt === undefined).length}</small>}
        </button><button className="conversation-delete icon-button" aria-label={`删除对话：${c.title}`} title="删除对话，可恢复" disabled={fileBusy || mainBusyId === c.id || c.annotations.some(a => a.status === 'generating')} onClick={() => removeConversation(c.id)}><Trash2 size={14} /></button></div>)}
        {deletedConversations.length > 0 && <details className="deleted-conversations"><summary>已删除的对话（{deletedConversations.length}）</summary>{deletedConversations.map(c => <div key={c.id}><span title={c.title}>{c.title}</span><button disabled={fileBusy} aria-label={`恢复对话：${c.title}`} onClick={() => recoverConversation(c.id)}>恢复</button></div>)}</details>}
      </nav>
      <div className="sidebar-bottom">
        {latestDeleted && <button className="sidebar-settings undo-deletion" onClick={undoDelete} disabled={mainBusyId !== null} title="恢复最近删除的批注与高亮，刷新后仍可使用"><RotateCcw size={16} /><span>撤销删除</span></button>}
        <div className="backup-actions"><button disabled={fileBusy} onClick={() => fileInput.current?.click()}><FileUp size={15} />导入</button><button onClick={() => void downloadBackup()}><Download size={15} />备份</button></div>
        <button className="sidebar-settings" onClick={() => setSettingsOpen(true)}><Settings2 size={17} /><span>模型与设置</span></button>
        <div className={'save-status ' + (saveStatus.startsWith('保存失败') ? 'save-error' : '')}><span />{saveStatus}</div>
      </div>
    </aside>
    <main className="main-pane">
      <header className="topbar">
        <div className="topbar-heading"><button className="icon-button mobile-menu" aria-label="打开对话列表" onClick={() => setSidebarOpen(true)}><Menu size={20} /></button><span>{openDocument && readerFocused ? openDocument.name : active.title}</span><span className="version-badge">{__APP_VERSION__}</span></div>
        <div className="topbar-actions"><button className="icon-button" aria-label="备份当前对话" title="单独备份这个对话及其文件" onClick={() => void downloadBackup(active.id)}><Download size={17} /></button><button className={'connection-button ' + (settings.mode === 'demo' ? 'demo-connection' : '')} onClick={() => setSettingsOpen(true)}><span className="status-dot" />{settings.mode === 'demo' ? '演示模式' : settings.model || '连接模型'}<Settings2 size={14} /></button></div>
      </header>
      <div className={'workspace-content ' + (openDocument ? 'with-reader' : '')}>
      <div className="conversation-pane">
      <ChatView key={active.id} conversation={active} isRunning={mainBusyId === active.id} globallyBusy={mainBusyId !== null || modelSwitchBusy || fileBusy} modelSwitchDisabled={modelSwitchBusy || mainBusyId !== null || active.annotations.some(a => a.status === 'generating')} onChooseModel={id => { void chooseModel(id).catch(e => notify(errorText(e))); }} onManageModels={() => setSettingsOpen(true)} settings={settings} openAnnotationId={openAnnotationId} onOpen={setOpenAnnotationId} onSend={q => sendMain(active.id, q)} onStop={() => mainRequest.current?.controller.abort()} onRegenerate={id => regenerate(active.id, id)} onVersion={(messageId, versionId) => setVersion(active.id, messageId, versionId)} onCreate={a => addAnnotation(active.id, a)} onUpdate={(id, patch) => editAnnotation(active.id, id, patch)} onAsk={id => askAnnotation(active.id, id)} onDelete={id => removeAnnotation(active.id, id)} onNotify={notify} onUpload={() => uploadInput.current?.click()} onOpenDocument={id => { setOpenAnnotationId(null); setOpenDocumentId(id); setReaderFocused(true); setSidebarOpen(false); }} fileBusy={fileBusy} />
      </div>
      {openDocument && <div className="document-pane"><DocumentReader key={openDocument.id} focused={readerFocused} onToggleFocus={() => { if (readerFocused && window.innerWidth <= 1050) { setOpenDocumentId(null); setOpenAnnotationId(null); } setReaderFocused(value => !value); }} source={openDocument} conversationId={active.id} annotations={active.annotations.filter(a => a.deletedAt === undefined)} reservedColors={active.annotations.map(a => a.color)} openAnnotationId={openAnnotationId} onOpen={setOpenAnnotationId} onCreate={a => addAnnotation(active.id, a)} onUpdate={(id, patch) => editAnnotation(active.id, id, patch)} onAsk={id => askAnnotation(active.id, id)} onDelete={id => removeAnnotation(active.id, id)} onNotify={notify} disabled={mainBusyId !== null || fileBusy} onClose={() => { setOpenDocumentId(null); setOpenAnnotationId(null); setReaderFocused(false); }} /></div>}
      </div>
    </main>
    <input ref={fileInput} className="visually-hidden" type="file" accept=".json,application/json" onChange={e => { const file = e.target.files?.[0]; if (file) void importBackup(file); }} aria-label="导入聊天备份" />
    <input ref={uploadInput} className="visually-hidden" type="file" accept=".pdf,.txt,.md,.markdown,application/pdf,text/plain,text/markdown" onChange={e => { const file = e.target.files?.[0]; if (file) void uploadDocument(file); }} aria-label="上传 PDF 或文本文件" />
    {notice && <div role="status" className="toast">{notice}{notice === '已删除批注与高亮，可撤销。' && latestDeleted && <button className="undo-toast" onClick={undoDelete}>撤销</button>}<button className="icon-button" aria-label="关闭提示" onClick={() => setNotice('')}><X size={15} /></button></div>}
    {saveStatus.startsWith('保存失败') && <div className="save-failure" role="alert">{saveStatus}<button onClick={() => void downloadBackup()}>导出备份</button></div>}
    {settingsOpen && <SettingsDialog settings={settings} onClose={() => setSettingsOpen(false)} onSaveProfile={storeProfile} onDeleteProfile={removeProfile} onSelectProfile={chooseModel} />}
  </div>;
}

type ChatViewProps = {
  conversation: Conversation; isRunning: boolean; globallyBusy: boolean; settings: ModelSettings;
  openAnnotationId: string | null; onOpen: (id: string | null) => void;
  onSend: (question: string) => Promise<void>; onStop: () => void; onRegenerate: (id: string) => void;
  onVersion: (messageId: string, versionId: string) => void;
  onCreate: (annotation: Annotation) => void; onUpdate: (id: string, patch: Partial<Annotation>) => void; onAsk: (id: string) => void;
  onDelete: (id: string) => void; onNotify: (message: string) => void;
  modelSwitchDisabled: boolean; onChooseModel: (id: string | null) => void; onManageModels: () => void;
  onUpload: () => void; onOpenDocument: (id: string) => void; fileBusy: boolean;
};
function ChatView(props: ChatViewProps) {
  const { conversation, settings, isRunning, globallyBusy } = props;
  const bottom = useRef<HTMLDivElement>(null);
  const [atBottom, setAtBottom] = useState(true);
  const convertMessage = useCallback((m: ChatMessage): ThreadMessageLike => ({
    id: m.id, role: m.role, content: [{ type: 'text', text: activeVersion(m).content }],
    ...(m.role === 'assistant' ? { status: activeVersion(m).status === 'streaming' ? { type: 'running' as const } : { type: 'complete' as const, reason: 'stop' as const } } : {}),
  }), []);
  const messages = useMemo(() => conversation.messages, [conversation.messages]);
  const runtime = useExternalStoreRuntime({
    messages, convertMessage, isRunning, isSendDisabled: globallyBusy,
    onNew: async message => {
      const question = message.content.filter(p => p.type === 'text').map(p => p.type === 'text' ? p.text : '').join('\n');
      await props.onSend(question);
    },
    onCancel: async () => props.onStop(),
  });
  return <AssistantRuntimeProvider runtime={runtime}>
    <ThreadPrimitive.Root className="chat-root">
      {Boolean(conversation.documents?.length) && <div className="document-attachments" aria-label="对话附件">{conversation.documents!.map(d => <button key={d.id} title={`打开 ${d.name}`} onClick={() => props.onOpenDocument(d.id)}><FileText size={14} /><span>{d.name}</span><small>{d.pages.length} 页</small></button>)}<p>文件保存在本机；发送问题时会包含文件提取文字。</p></div>}
      <ThreadPrimitive.Viewport className="chat-viewport" autoScroll={isRunning} scrollToBottomOnInitialize={false} scrollToBottomOnRunStart scrollToBottomOnThreadSwitch={false} onScroll={e => { const el = e.currentTarget; setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 160); }}>
        <div className="reading-column">
          {conversation.messages.length === 0 ? <div className="empty-state">
            <span className="empty-symbol"><PenLine size={29} /></span><div className="eyebrow">THINK WITHOUT LOSING YOUR PLACE</div><h1>让好奇心，<br />留在原文旁。</h1><p>{conversation.documents?.length ? <>文件已准备好。点击上方文件可阅读、划选批注；<br />也可以在下方直接询问论文中的问题。</> : <>聊一个想弄懂的话题，或上传一篇论文。<br />选中文字后，可以询问 AI，也可以只写自己的批注。</>}</p>
            <button className="starter-question" onClick={() => void props.onSend('什么是广义相对论？请用容易理解的方式介绍。')} disabled={globallyBusy}><BookOpen size={17} /><span>从广义相对论开始</span><ArrowUp size={15} /></button>
          </div> : <>
            <div className="reading-guide"><PenLine size={14} /><span>选中回答中的文字，就能在原处批注提问</span><span className="guide-end">READ · ASK · KEEP</span></div>
            {conversation.messages.map((message, index) => {
              const version = activeVersion(message);
              const versionIndex = message.versions.findIndex(v => v.id === version.id);
              if (message.role === 'user') return <div className="user-message" key={message.id}><span className="user-label">你</span><div>{version.content}</div></div>;
              const annotations = conversation.annotations.filter(a => a.deletedAt === undefined && a.messageId === message.id && a.versionId === version.id);
              return <article className="assistant-message" key={message.id} data-message-id={message.id}>
                <div className="assistant-label"><span className="mini-brand"><PenLine size={14} /></span><strong>learn something</strong><span>{version.modelLabel || (conversation.title.includes('体验示例') ? '本地示例回答' : settings.mode === 'demo' ? '本地演示' : settings.model)}</span>{version.status === 'streaming' && <span className="streaming-label"><span />正在思考与书写</span>}</div>
                <AnnotatedAnswer key={version.id} conversationId={conversation.id} messageId={message.id} version={version} annotations={annotations} reservedColors={conversation.annotations.filter(a => a.messageId === message.id && a.versionId === version.id).map(a => a.color)} openAnnotationId={props.openAnnotationId} onOpen={props.onOpen} onCreate={props.onCreate} onUpdate={props.onUpdate} onAsk={props.onAsk} onDelete={props.onDelete} onNotify={props.onNotify} disabled={isRunning} />
                {version.error && version.status !== 'complete' && <div className="answer-error" role="alert">{version.error}<p>你可以直接继续发送新问题，也可以重新生成。需要更换 API 时，在左下角切换模型即可。</p></div>}
                <footer className="answer-actions">
                  {index === conversation.messages.length - 1 && <button disabled={globallyBusy} onClick={() => props.onRegenerate(message.id)}><RefreshCw size={14} />{version.status === 'error' || version.status === 'interrupted' ? '重试这次回答' : '重新生成'}</button>}
                  {message.versions.length > 1 && <div className="version-control"><button className="icon-button" aria-label="查看上一个回答版本" disabled={globallyBusy || versionIndex === 0} onClick={() => props.onVersion(message.id, message.versions[versionIndex - 1].id)}><ChevronLeft size={15} /></button><span>版本 {versionIndex + 1} / {message.versions.length}</span><button className="icon-button" aria-label="查看下一个回答版本" disabled={globallyBusy || versionIndex === message.versions.length - 1} onClick={() => props.onVersion(message.id, message.versions[versionIndex + 1].id)}><ChevronRight size={15} /></button></div>}
                  {annotations.length > 0 && <span className="annotation-count"><PenLine size={13} />{annotations.length} 条批注</span>}
                  {version.status === 'complete' && <span className="answer-complete"><Check size={12} />已保存</span>}
                </footer>
              </article>;
            })}
          </>}
          <div ref={bottom} className="chat-bottom" />
        </div>
      </ThreadPrimitive.Viewport>
      {!atBottom && <button className="scroll-bottom icon-button" aria-label="回到对话底部" onClick={() => bottom.current?.scrollIntoView({ behavior: 'smooth' })}><ArrowDown size={18} /></button>}
      <div className="composer-area">
        <ComposerPrimitive.Root className="main-composer">
          <ComposerPrimitive.Input className="composer-input" placeholder="想弄懂什么？从这里开始…" aria-label="输入主对话问题" autoFocus={false} disabled={globallyBusy} maxRows={7} addAttachmentOnPaste={false} unstable_focusOnScrollToBottom={false} unstable_focusOnRunStart={false} />
          <div className="composer-toolbar"><div className="composer-model-controls"><button type="button" className="upload-document-button" aria-label="上传文件" title="上传 PDF、TXT 或 Markdown；只保存在本机" disabled={globallyBusy} onClick={props.onUpload}><Paperclip size={14} /><span>{props.fileBusy ? '读取中…' : '上传'}</span></button><Sparkles size={14} /><select aria-label="选择预载模型" title="选择已保存的模型配置" value={settings.mode === 'demo' ? '__demo__' : settings.activeProfileId || '__current__'} disabled={props.modelSwitchDisabled} onChange={event => { if (event.target.value === '__manage__') props.onManageModels(); else props.onChooseModel(event.target.value === '__demo__' ? null : event.target.value); }}>
            <option value="__demo__">演示模式</option>
            {settings.mode === 'api' && !settings.activeProfileId && <option value="__current__" disabled>{settings.model || '当前连接（未保存）'}</option>}
            {settings.profiles.map(profile => <option key={profile.id} value={profile.id}>{profile.name} · {profile.model}{!profile.hasApiKey && !/^http:\/\/(127\.0\.0\.1|localhost|\[::1\])(?=[:/]|$)/.test(profile.baseURL) ? '（需填写密钥）' : ''}</option>)}
            <option value="__manage__">＋ 添加或管理模型…</option>
          </select><button type="button" className="composer-manage-models" onClick={props.onManageModels} disabled={props.modelSwitchDisabled}>管理模型</button></div>{isRunning ? <ComposerPrimitive.Cancel className="send-button" aria-label="停止生成"><Square size={15} fill="currentColor" /></ComposerPrimitive.Cancel> : <ComposerPrimitive.Send className="send-button" aria-label="发送问题"><ArrowUp size={20} /></ComposerPrimitive.Send>}</div>
        </ComposerPrimitive.Root>
        <p className="composer-footnote">Enter 发送，Shift + Enter 换行 <span>·</span> 批注可询问 AI，也可只写笔记</p>
      </div>
    </ThreadPrimitive.Root>
  </AssistantRuntimeProvider>;
}

