import { t, getLocale } from './i18n/locale';
import { useLocale } from './i18n/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AssistantRuntimeProvider, ComposerPrimitive, ThreadPrimitive, useExternalStoreRuntime } from '@assistant-ui/react';
import type { ThreadMessageLike } from '@assistant-ui/react';
import { ArrowDown, ArrowUp, BookOpen, Check, ChevronDown, ChevronLeft, ChevronRight, Columns2, Download, FileUp, FileText, FolderOpen, Menu, MessageSquare, MessageSquareQuote, Paperclip, PenLine, Plus, RefreshCw, RotateCcw, Settings2, Square, Trash2, X } from 'lucide-react';
import type { Annotation, ChatMessage, ChatTextReference, Conversation, InputMessage, MessageVersion, ModelSettings, ProfileInput, Workspace } from './domain/types';
import { activeVersion, addAssistantVersion, buildMainContext, completeAnnotation, createAssistantMessage, createConversation, createUserMessage, deleteAnnotation, restoreAnnotation, deleteConversation, restoreConversation, prepareAnnotationRequest, updateAnnotationCopy, saveNoteAnnotation } from './domain/workspace';
import { exportWorkspaceWithFiles, importWorkspaceWithFiles, saveDocumentBytes, getDocumentBytes } from './adapters/storage';
import { deleteProfile, getSettings, saveProfile, selectProfile, streamReply } from './adapters/model';
import { AnnotatedAnswer } from './components/AnnotatedAnswer';
import { SettingsDialog } from './components/SettingsDialog';
import { useWorkspace } from './hooks/useWorkspace';
import { useChatPosition } from './hooks/useChatPosition';
import { pruneChatPositions } from './adapters/chat-position';
import { DocumentReader } from './components/DocumentReader';
import { RecoveryDialog } from './components/RecoveryDialog';
import { assertWorkspaceCapacity } from './domain/capacity';
import { desktop } from './adapters/desktop';
import { changeAnnotationReask, updateAnnotationRequest } from './domain/workspace';
import { isAnnotationGenerating } from './domain/annotation-state';
import type { TrashTarget } from './domain/trash';
import { TrashDialog } from './components/TrashDialog';
import { ReaderHome } from './components/ReaderHome';
import { loadDocumentContextMode, saveDocumentContextMode } from './adapters/document-context';
import type { DocumentContextMode } from './domain/document-context';
import { freezeContext } from './domain/context-pool';
import { useLocalLibrary } from './hooks/useLocalLibrary';
import { conversationFileGroups, fileAnnotationCounter, localDocumentReferences, projectFileAnnotations } from './domain/local-library';
import type { LocalDocumentGroup, LocalDocumentReference } from './domain/local-library';
import { loadReaderSession, saveReaderSession } from './adapters/reader-session';
import { changeAnnotationColor } from './domain/highlight-colors';
import { TranslationButton, TranslationProvider } from './components/Translation';
import { canReferenceAnnotation, captureAnnotationReferences, chatRound } from './domain/chat-references';
import { ChatAnnotationPicker, ChatAnnotationReferences, DeleteChatTurnDialog } from './components/ChatAnnotations';
import { NativeSelect } from './components/NativeSelect';
import { ChatQuestionText, ChatTextReferencePreview, ChatTextReferenceProvider } from './components/ChatTextReference';
import { captureChatTextReference, hasChatTextSource, type ChatTextSelection } from './domain/chat-text-reference';
import type { ReaderSession } from './adapters/reader-session';

const DEFAULT_SETTINGS: ModelSettings = { mode: 'demo', baseURL: 'https://api.openai.com/v1', model: '', systemPrompt: '请用中文清晰地回答，解释概念时适当举例。', hasApiKey: false, apiFormat: 'openai-chat', profiles: [], activeProfileId: null, persistence: 'session' };
type Busy = { conversationId: string; messageId: string; versionId: string; controller: AbortController };

function updateConversation(workspace: Workspace, id: string, change: (c: Conversation) => Conversation) {
  return { ...workspace, conversations: workspace.conversations.map(c => c.id === id ? change(c) : c) };
}
function patchVersion(c: Conversation, messageId: string, versionId: string, patch: Partial<MessageVersion>): Conversation {
  return { ...c, updatedAt: Date.now(), messages: c.messages.map(m => m.id === messageId ? { ...m, versions: m.versions.map(v => v.id === versionId ? { ...v, ...patch } : v) } : m) };
}
const errorText = (e: unknown) => e instanceof Error ? e.message : t("操作未完成，请重试。");

export default function App() {
  const locale = useLocale();
  useEffect(() => { document.documentElement.lang = locale; document.title = 'AI-Embedded Paper PDF Reader'; desktop()?.setLocale?.(locale); }, [locale]);
  const { workspace, current, update, saveStatus, loadError, flush, checkpoint, recover, purge, removeChatTurn, backupWarning, lastBackup } = useWorkspace();
  const [turnBusy, setTurnBusy] = useState(false);
  const [trashOpen, setTrashOpen] = useState(false);
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const closingRef = useRef(false);
  const closeAttempt = useRef(0);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [contextMode, setContextMode] = useState(loadDocumentContextMode);
  const readerLocation = useRef<{ documentId: string; pageNumber: number } | undefined>(undefined);
  const onReaderLocation = useCallback((location: { documentId: string; pageNumber: number }) => { readerLocation.current = location; }, []);
  const changeContextMode = (value: DocumentContextMode) => { setContextMode(value); if (!saveDocumentContextMode(value)) notify('资料范围设置仅在本次有效。'); };
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsIntent, setSettingsIntent] = useState<'configure' | 'discover'>('configure');
  const closeSettings = () => { setSettingsOpen(false); setSettingsIntent('configure'); };
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [openAnnotationId, setOpenAnnotationId] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [mainBusyId, setMainBusyId] = useState<string | null>(null);
  const [modelSwitchBusy, setModelSwitchBusy] = useState(false);
  const [fileBusy, setFileBusy] = useState(false);
  const [fileProgress, setFileProgress] = useState<{ page: number; total: number } | null>(null);
  const fileController = useRef<AbortController | null>(null);
  const [openDocumentId, setOpenDocumentId] = useState<string | null>(null);
  const [readerFocused, setReaderFocused] = useState(true);
  const [lastReader, setLastReader] = useState<ReaderSession | null>(loadReaderSession);
  const [chatTextReference, setChatTextReference] = useState<ChatTextReference | null>(null);
  const library = useLocalLibrary(workspace);
  const readerInput = useRef<HTMLInputElement>(null);
  const startupReaderRestored = useRef(false);
  const fileOperation = useRef(false);
  const mainRequest = useRef<Busy | null>(null);
  const annotationRequests = useRef(new Map<string, AbortController>());
  const fileInput = useRef<HTMLInputElement>(null);
  const uploadInput = useRef<HTMLInputElement>(null);
  const notify = useCallback((text: string) => setNotice(text), []);
  useEffect(() => { getSettings().then(setSettings).catch(() => notify('模型服务暂未连接，请重新启动客户端。')); }, [notify]);
  useEffect(() => desktop()?.onPrepareClose(async () => {
    const attempt = ++closeAttempt.current;
    closingRef.current = true; setClosing(true);
    try {
      document.dispatchEvent(new Event('learn:close-translations'));
      fileController.current?.abort();
      mainRequest.current?.controller.abort();
      for (const controller of annotationRequests.current.values()) controller.abort();
      // File parsing and aborted streams must settle before taking the last snapshot.
      while (fileOperation.current || mainRequest.current || annotationRequests.current.size) {
        if (attempt !== closeAttempt.current) throw new Error('退出已取消。');
        await new Promise(resolve => setTimeout(resolve, 25));
      }
      // Commits must settle before flushing a still-open annotation editor.
      document.dispatchEvent(new Event('learn:save-edits'));
      await flush(); await checkpoint();
    } finally { if (attempt === closeAttempt.current) { closingRef.current = false; setClosing(false); } }
  }, () => { closeAttempt.current++; closingRef.current = false; setClosing(false); }), [flush, checkpoint]);
  useEffect(() => {
    if (!notice) return;
    const timeout = setTimeout(() => setNotice(''), 6500);
    return () => clearTimeout(timeout);
  }, [notice]);

  const active = workspace?.conversations.find(c => c.id === workspace.activeConversationId && c.deletedAt === undefined);
  const conversationIds = workspace && JSON.stringify(workspace.conversations.map(c => c.id));
  useEffect(() => { if (conversationIds) pruneChatPositions(JSON.parse(conversationIds)); }, [conversationIds]);
  const openDocument = active?.documents?.find(d => d.id === openDocumentId);
  const reopenDocument = active?.documents?.find(document => lastReader?.conversationId === active.id && document.id === lastReader.documentId) || active?.documents?.find(document => document.kind === 'pdf') || active?.documents?.[0];
  useEffect(() => { if (chatTextReference && (!active || !hasChatTextSource(active, chatTextReference))) setChatTextReference(null); }, [active, chatTextReference]);
  const activeFileGroups = useMemo(() => active ? conversationFileGroups(library.groups, active) : [], [library.groups, active]);
  const readerAnnotations = useMemo(() => {
    if (!active || !openDocument) return active?.annotations.filter(a => a.deletedAt === undefined) || [];
    const equivalents = activeFileGroups.find(g => g.references.some(r => r.document.id === openDocument.id))?.references.map(r => r.document) || [openDocument];
    return projectFileAnnotations(openDocument, equivalents, active.annotations.filter(a => a.deletedAt === undefined));
  }, [active, openDocument, activeFileGroups]);
  useEffect(() => {
    if (!workspace || startupReaderRestored.current) return;
    startupReaderRestored.current = true;
    const saved = loadReaderSession();
    if (saved?.mode === 'closed') return;
    const owner = saved && workspace.conversations.find(c => c.id === saved.conversationId && c.deletedAt === undefined);
    if (owner?.documents?.some(d => d.id === saved!.documentId)) { update(w => ({ ...w, activeConversationId: owner.id })); setOpenDocumentId(saved!.documentId); setReaderFocused(saved?.mode !== 'split'); }
  }, [workspace, update]);
  useEffect(() => {
    if (!active || !openDocument) return;
    const next: ReaderSession = { conversationId: active.id, documentId: openDocument.id, mode: readerFocused ? 'focused' : 'split' };
    setLastReader(previous => previous?.conversationId === next.conversationId && previous.documentId === next.documentId && previous.mode === next.mode ? previous : next);
    saveReaderSession(next);
  }, [active?.id, openDocument?.id, readerFocused]);
  function openReaderReference(ref: LocalDocumentReference, mode: 'focused' | 'split' = 'focused') {
    const owner = current.current?.conversations.find(c => c.id === ref.conversationId && c.deletedAt === undefined);
    if (!owner?.documents?.some(d => d.id === ref.document.id)) return;
    if (current.current!.activeConversationId !== owner.id) update(w => ({ ...w, activeConversationId: owner.id }));
    document.dispatchEvent(new Event('learn:save-edits'));
    setOpenAnnotationId(null); setOpenDocumentId(ref.document.id); setReaderFocused(mode === 'focused'); setSidebarOpen(false);
    const next = { conversationId: owner.id, documentId: ref.document.id, mode };
    setLastReader(next); saveReaderSession(next);
  }
  function openLibraryDocument(group: LocalDocumentGroup, preferred?: LocalDocumentReference) {
    if (fileOperation.current) return;
    const count = fileAnnotationCounter(current.current!.conversations);
    const ref = preferred || group.references.find(r => r.conversationId === current.current?.activeConversationId) || [...group.references].sort((a, b) => count([b]) - count([a]))[0];
    if (ref) openReaderReference(ref);
  }
  function chooseReaderFile() {
    if (fileOperation.current || mainRequest.current || annotationRequests.current.size) { notify('请等当前文件或回答完成后再打开。'); return; }
    readerInput.current?.click();
  }
  function closeReader() {
    document.dispatchEvent(new Event('learn:save-edits'));
    if (active && openDocument) { const next: ReaderSession = { conversationId: active.id, documentId: openDocument.id, mode: 'closed' }; setLastReader(next); saveReaderSession(next); }
    setOpenAnnotationId(null); setOpenDocumentId(null);
  }
  function expandReader(mode: 'focused' | 'split' = 'split') {
    if (fileOperation.current) return;
    if (openDocument) setReaderFocused(mode === 'focused');
    else if (active && reopenDocument) openReaderReference({ conversationId: active.id, document: reopenDocument }, mode);
    else setReaderFocused(true);
  }
  function quoteText(selection: ChatTextSelection) {
    if (closingRef.current || fileOperation.current) return;
    const owner = current.current?.conversations.find(conversation => conversation.id === selection.conversationId && conversation.deletedAt === undefined);
    if (!owner) return;
    try {
      const reference = captureChatTextReference(owner, selection);
      if (current.current!.activeConversationId !== owner.id) update(value => ({ ...value, activeConversationId: owner.id }));
      setChatTextReference(reference); setReaderFocused(false); setSidebarOpen(false);
      requestAnimationFrame(() => document.querySelector<HTMLTextAreaElement>('.composer-input')?.focus({ preventScroll: true }));
    } catch (error) { notify(errorText(error)); }
  }
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
  async function storeTranslationProfile(value: ProfileInput) {
    ensureModelIdle();
    const next = await saveProfile({ ...value, activate: false });
    setSettings(next); notify('共享 API 连接已保存。');
    return next;
  }
  async function removeProfile(id: string) {
    ensureModelIdle();
    const next = await deleteProfile(id);
    setSettings(next); notify('已删除模型配置，聊天记录继续保留。');
  }
  function selectConversation(id: string) {
    if (fileOperation.current) return;
    setOpenAnnotationId(null); setOpenDocumentId(null); setSidebarOpen(false); setReaderFocused(false);
    update(w => ({ ...w, activeConversationId: id }));
  }
  function newConversation() {
    if (fileOperation.current) return;
    const conversation = createConversation();
    try { update(w => ({ ...w, conversations: [conversation, ...w.conversations], activeConversationId: conversation.id })); }
    catch (error) { notify(errorText(error)); return; }
    setOpenAnnotationId(null); setOpenDocumentId(null); setSidebarOpen(false); setReaderFocused(false);
  }
  function removeConversation(id: string) {
    if (fileOperation.current) return;
    const conversation = current.current?.conversations.find(c => c.id === id);
    if (mainRequest.current?.conversationId === id || conversation?.annotations.some(isAnnotationGenerating)) { notify('请等这个对话的回答完成，或停止生成后再删除。'); return; }
    try { update(w => deleteConversation(w, id)); setOpenAnnotationId(null); setOpenDocumentId(null); notify('对话已移入回收站，可在那里恢复或永久删除。'); }
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
        const next = content + delta;
        mutateConversation(conversationId, c => patchVersion(c, messageId, versionId, { content: next }));
        content = next;
      }, controller.signal);
      if (!content.trim()) throw new Error('模型返回了空回答，请重试。');
      mutateConversation(conversationId, c => patchVersion(c, messageId, versionId, { content, status: 'complete', modelLabel: result.modelLabel, context: undefined }));
    } catch (e) {
      const aborted = controller.signal.aborted;
      mutateConversation(conversationId, c => patchVersion(c, messageId, versionId, { content, status: aborted ? 'interrupted' : 'error', error: aborted ? "回答已停止，可以继续发送新问题或重新生成。" : errorText(e) }));
      if (!aborted) notify(errorText(e));
    } finally {
      mainRequest.current = null; setMainBusyId(null);
    }
  }
  async function sendMain(conversationId: string, question: string, annotationIds: string[] = [], textReference?: ChatTextReference): Promise<boolean> {
    if (closingRef.current) return false;
    if (fileOperation.current) { notify('请等文件处理完成后再发送。'); return false; }
    if (mainRequest.current) { notify('请先等待当前回答完成，或停止生成。'); return false; }
    const conversation = current.current?.conversations.find(c => c.id === conversationId);
    if (!conversation || !question.trim()) return false;
    let accepted = false;
    try {
      const user = createUserMessage(question.trim());
      const references = captureAnnotationReferences(conversation, annotationIds);
      if (references.length) user.annotationReferences = references;
      if (textReference) user.textReference = captureChatTextReference(conversation, textReference);
      const base = { ...conversation, messages: [...conversation.messages, user] };
      const messages = buildMainContext(base, settings.systemPrompt, { mode: contextMode, location: readerLocation.current });
      const assistant = createAssistantMessage();
      assistant.versions[0].context = freezeContext(messages);
      mutateConversation(conversationId, () => ({ ...base, title: conversation.messages.length === 0 ? question.trim().slice(0, 25) : conversation.title, updatedAt: Date.now(), messages: [...base.messages, assistant] }));
      accepted = true;
      if (textReference) setChatTextReference(previous => previous === textReference ? null : previous);
      await runMain(conversationId, assistant.id, assistant.activeVersionId, messages);
    } catch (e) { notify(errorText(e)); }
    return accepted;
  }
  async function removeTurn(conversationId: string, messageId: string): Promise<void> {
    if (closingRef.current || fileOperation.current || mainRequest.current || annotationRequests.current.size) throw new Error('请先停止回答，再删除本轮对话。');
    fileOperation.current = true; setTurnBusy(true);
    try {
      const next = await removeChatTurn(conversationId, messageId);
      if (openAnnotationId && !next.conversations.some(conversation => conversation.annotations.some(annotation => annotation.id === openAnnotationId))) setOpenAnnotationId(null);
      notify('本轮对话已删除，后续请求不再带入。');
    } finally { fileOperation.current = false; setTurnBusy(false); }
  }
  async function regenerate(conversationId: string, messageId: string) {
    if (mainRequest.current) return;
    const conversation = current.current?.conversations.find(c => c.id === conversationId);
    if (!conversation) return;
    const index = conversation.messages.findIndex(m => m.id === messageId);
    if (index !== conversation.messages.length - 1) { notify('请在最后一条回答上重新生成。旧回答仍可切换版本和查看批注。'); return; }
    try {
      const previous = activeVersion(conversation.messages[index]);
      const messages = previous.status !== 'complete' && previous.context ? previous.context.slice() : buildMainContext({ ...conversation, messages: conversation.messages.slice(0, index) }, settings.systemPrompt, { mode: contextMode, location: readerLocation.current });
      const next = addAssistantVersion(conversation.messages[index]);
      next.versions[next.versions.length - 1].context = freezeContext(messages);
      mutateConversation(conversationId, c => ({ ...c, messages: c.messages.map(m => m.id === messageId ? next : m), updatedAt: Date.now() }));
      if (conversation.annotations.some(annotation => annotation.id === openAnnotationId && annotation.messageId === messageId)) setOpenAnnotationId(null);
      await runMain(conversationId, messageId, next.activeVersionId, messages, next.versions.length - 1);
    } catch (e) { notify(errorText(e)); }
  }
  function setVersion(conversationId: string, messageId: string, versionId: string) {
    if (mainRequest.current) return;
    if (current.current?.conversations.find(conversation => conversation.id === conversationId)?.annotations.some(annotation => annotation.id === openAnnotationId && annotation.messageId === messageId)) setOpenAnnotationId(null);
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
        if (!annotation) return c;
        if (patch.color !== undefined) return changeAnnotationColor(c, id, patch.color);
        if (isAnnotationGenerating(annotation)) return c;
        if (patch.reask) return changeAnnotationReask(c, id, 'edit', patch.reask.question);
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
  function reaskAnnotation(conversationId: string, id: string, action: 'start' | 'cancel' | 'edit') {
    if (fileOperation.current || closingRef.current) return;
    try { mutateConversation(conversationId, c => changeAnnotationReask(c, id, action)); }
    catch (error) { notify(errorText(error)); }
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
    if (closingRef.current) return;
    if (fileOperation.current) { notify('请等文件处理完成后再提问。'); return; }
    if (annotationRequests.current.has(annotationId)) return;
    if (mainRequest.current?.conversationId === conversationId) { notify('请等主回答完成后再发送批注问题。'); return; }
    const conversation = current.current?.conversations.find(c => c.id === conversationId);
    if (!conversation) return;
    let prepared;
    try { prepared = prepareAnnotationRequest(conversation, annotationId, settings.systemPrompt, { mode: contextMode }); }
    catch (e) { notify(errorText(e)); return; }
    try { mutateConversation(conversationId, () => prepared.conversation); }
    catch (error) { notify(errorText(error)); return; }
    const controller = new AbortController();
    annotationRequests.current.set(annotationId, controller);
    let answer = '';
    try {
      await streamReply({ messages: prepared.messages, kind: 'annotation', quote: prepared.annotation.quote, ...(settings.activeProfileId ? { profileId: settings.activeProfileId } : settings.mode === 'demo' ? { profileId: null } : {}) }, delta => {
        const next = answer + delta;
        mutateConversation(conversationId, c => updateAnnotationRequest(c, annotationId, next));
        answer = next;
      }, controller.signal);
      mutateConversation(conversationId, c => completeAnnotation(c, annotationId, answer));
    } catch (e) {
      mutateConversation(conversationId, c => updateAnnotationRequest(c, annotationId, answer, { interrupted: controller.signal.aborted, error: controller.signal.aborted ? "回答已停止，可以用原问题和本次上下文重试。" : errorText(e) }));
    } finally { annotationRequests.current.delete(annotationId); }
  }
  async function downloadBackup(conversationId?: string, legacy = false, propagate = false) {
    if (!current.current) return;
    try {
      const snapshot = current.current;
      const selected = conversationId ? snapshot.conversations.find(c => c.id === conversationId && c.deletedAt === undefined) : undefined;
      const source = selected ? { ...snapshot, conversations: [selected], activeConversationId: selected.id } : snapshot;
      const blob = new Blob([await exportWorkspaceWithFiles(source, { compact: !legacy })], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a'); link.href = url; link.download = 'ai-paper-pdf-reader-' + (legacy ? t("兼容旧版-") : '') + t("备份-") + new Date().toISOString().slice(0, 10) + '.json'; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000); notify('完整备份已导出，包含附件原文件、所有回答版本和批注。');
    } catch (e) { if (propagate) throw e; notify(errorText(e)); }
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
      update(() => merged); library.refresh();
      setOpenAnnotationId(null); setOpenDocumentId(null); setSidebarOpen(false); notify('已导入为新对话，附件和原有记录完整保留。');
    } catch (e) { notify(errorText(e)); }
    finally { if (fileInput.current) fileInput.current.value = ''; fileOperation.current = false; setFileBusy(false); }
  }
  async function uploadDocument(file: File, intent: 'reader' | 'chat' = 'chat') {
    if (closingRef.current || fileOperation.current || mainRequest.current || annotationRequests.current.size) { notify('请等当前文件或回答完成后再打开。'); return; }
    const snapshot = current.current; if (!snapshot) return;
    const conversationId = snapshot.activeConversationId;
    fileOperation.current = true; setFileBusy(true); notify('正在打开本地文件…');
    const controller = new AbortController(); fileController.current = controller; setFileProgress({ page: 0, total: 0 });
    try {
      const { parseDocumentFile, documentFileKind } = await import('./adapters/documents');
      const kind = documentFileKind(file), bytes = new Uint8Array(await file.arrayBuffer());
      controller.signal.throwIfAborted();
      const refs = localDocumentReferences(snapshot).filter(ref => intent === 'reader' || ref.conversationId === conversationId).sort((a, b) => Number(b.conversationId === conversationId) - Number(a.conversationId === conversationId));
      const existing = await library.index.find(bytes, kind, refs, getDocumentBytes);
      if (existing) { openReaderReference(existing); notify('已打开本机已有的文件，批注可以继续使用。'); return; }
      const owner = snapshot.conversations.find(c => c.id === conversationId && c.deletedAt === undefined);
      if (!owner) throw Error(t("当前记录不可用，请重新打开。"));
      if (intent === 'chat' && (owner.documents?.length || 0) >= 10) throw Error(t("这个对话已有 10 份文件，请在阅读器中打开文件。"));
      const parsed = await parseDocumentFile(file, { bytes, signal: controller.signal, onProgress: (page, total) => setFileProgress({ page, total }) });
      controller.signal.throwIfAborted();
      const nextOwner = intent === 'reader' ? { ...createConversation(parsed.document.name.slice(0, 80)), documents: [parsed.document] } : null;
      const next = nextOwner ? { ...current.current!, conversations: [nextOwner, ...current.current!.conversations], activeConversationId: nextOwner.id } : updateConversation(current.current!, conversationId, c => ({ ...c, documents: [...(c.documents || []), parsed.document] }));
      assertWorkspaceCapacity(next);
      setFileProgress(null);
      await saveDocumentBytes(parsed.document.id, parsed.bytes);
      library.index.remember(parsed.document, parsed.bytes);
      if (nextOwner) update(w => ({ ...w, conversations: [nextOwner, ...w.conversations], activeConversationId: nextOwner.id }));
      else mutateConversation(conversationId, c => ({ ...c, title: c.messages.length === 0 && !c.documents?.length ? parsed.document.name.slice(0, 40) : c.title, documents: [...(c.documents || []), parsed.document], updatedAt: Date.now() }));
      openReaderReference({ conversationId: nextOwner?.id || conversationId, document: parsed.document });
      notify('文件已在本机打开，可以直接阅读和批注。');
    } catch (e) { notify(controller.signal.aborted ? '已取消打开文件。' : errorText(e)); }
    finally { fileOperation.current = false; fileController.current = null; setFileBusy(false); setFileProgress(null); if (uploadInput.current) uploadInput.current.value = ''; if (readerInput.current) readerInput.current.value = ''; }
  }
  async function restoreBackup(text: string) {
    if (fileOperation.current || mainRequest.current || annotationRequests.current.size) throw new Error('请先停止回答，等待文件处理完成后再恢复。');
    fileOperation.current = true; setFileBusy(true);
    try {
      if (loadError) await recover(text);
      else {
        const snapshot = current.current!;
        const merged = await importWorkspaceWithFiles(text, snapshot);
        if (current.current !== snapshot) throw new Error('对话在恢复时发生变化，请重试。');
        update(() => merged); await flush();
      }
      library.refresh(); setOpenAnnotationId(null); setOpenDocumentId(null); setSidebarOpen(false); notify('备份已恢复，附件和批注可以继续使用。');
    } finally { fileOperation.current = false; setFileBusy(false); }
  }
  async function purgeTrash(target: TrashTarget) {
    if (fileOperation.current || mainRequest.current || annotationRequests.current.size) throw new Error('请先停止正在生成的回答，等待文件处理完成后再清理回收站。');
    fileOperation.current = true; setFileBusy(true);
    try { await purge(target); setOpenAnnotationId(null); notify(target.kind === 'all' ? '回收站已清空，相关附件原文件已清理。' : '已永久删除，无法从回收站恢复。'); }
    finally { fileOperation.current = false; setFileBusy(false); }
  }
  async function restoreTrash(target: Exclude<TrashTarget, { kind: 'all' }>) {
    if (fileOperation.current || mainRequest.current || annotationRequests.current.size) throw new Error('请等文件处理和回答结束后再恢复。');
    fileOperation.current = true; setFileBusy(true);
    try {
      if (target.kind === 'conversation') {
        update(w => restoreConversation(w, target.id)); setOpenAnnotationId(null); setOpenDocumentId(null);
      } else {
        const annotation = current.current?.conversations.find(c => c.id === target.conversationId)?.annotations.find(a => a.id === target.id);
        if (!annotation) throw new Error('这条批注已不在回收站。');
        update(w => ({ ...updateConversation(w, target.conversationId, c => ({ ...restoreAnnotation(c, target.id), messages: c.messages.map(m => m.id === annotation.messageId ? { ...m, activeVersionId: annotation.versionId } : m) })), activeConversationId: target.conversationId }));
        setOpenAnnotationId(target.id);
        const document = current.current?.conversations.find(c => c.id === target.conversationId)?.documents?.find(d => d.pages.some(p => p.messageId === annotation.messageId));
        setOpenDocumentId(document?.id || null); setReaderFocused(Boolean(document));
      }
      await flush(); setTrashOpen(false); setSidebarOpen(false); notify('记录已恢复。');
    } finally { fileOperation.current = false; setFileBusy(false); }
  }
  const recoveryDialog = recoveryOpen && <RecoveryDialog recovery={Boolean(loadError)} onClose={() => setRecoveryOpen(false)} onRestore={restoreBackup} onCreate={checkpoint} onExport={workspace ? (legacy, currentOnly) => downloadBackup(currentOnly ? current.current?.activeConversationId : undefined, legacy, true) : undefined} />;
  if (!workspace || !active) return <div className="loading-screen"><PenLine size={30} /><h1>AI-Embedded Paper PDF Reader</h1><p>{t(loadError || t("正在打开你的阅读空间…"))}</p>{loadError && <div className="recovery-toolbar"><button onClick={() => setRecoveryOpen(true)} className="primary-button">{t("从备份恢复")}</button><button onClick={() => location.reload()} className="secondary-button">{t("重新打开")}</button></div>}{recoveryDialog}</div>;
  return <ChatTextReferenceProvider value={{ enabled: !closing && !fileBusy && !turnBusy && !settingsOpen && !recoveryOpen && !trashOpen, quote: quoteText }}><TranslationProvider settings={settings} scope={`${active.id}:${openDocument?.id || 'chat'}:${readerFocused}`} enabled={!closing && !fileBusy && !turnBusy && !settingsOpen && !recoveryOpen && !trashOpen} onSaveProfile={storeTranslationProfile} onDeleteProfile={removeProfile} onNotify={notify}><div className={'app-shell reader-primary' + (readerFocused ? ' reader-focused' : ' chat-open')}>
    {sidebarOpen && <button className="mobile-overlay" aria-label={t("关闭对话列表")} onClick={() => setSidebarOpen(false)} />}
    <aside className={'sidebar ' + (sidebarOpen ? 'sidebar-open' : '')}>
      <div className="brand"><span className="brand-mark"><PenLine size={20} /></span><span className="brand-name"><span className="brand-title">AI-Embedded Paper PDF Reader</span><small>{t("阅读与批注")}</small></span><button className="icon-button mobile-close" aria-label={t("关闭对话列表")} onClick={() => setSidebarOpen(false)}><X size={18} /></button></div>
      <button className="new-conversation" disabled={fileBusy} onClick={newConversation}><Plus size={18} />{t("开启新对话")}<span>＋</span></button>
      <button className="open-reading-file" disabled={fileBusy || mainBusyId !== null} onClick={chooseReaderFile}><BookOpen size={17} />{t("打开本地 PDF")}</button>
      <div className="sidebar-section-label">{t("你的对话")}</div>
      <nav className="conversation-list" aria-label={t("对话列表")}>
        {workspace.conversations.filter(c => c.deletedAt === undefined).sort((a, b) => b.updatedAt - a.updatedAt).map(c => <div key={c.id} className={'conversation-row ' + (c.id === active.id ? 'active' : '')}><button className={'conversation-item ' + (c.id === active.id ? 'active' : '')} disabled={fileBusy} onClick={() => selectConversation(c.id)} aria-current={c.id === active.id ? 'page' : undefined}>
          <MessageSquare size={16} /><span>{c.title}</span>{c.annotations.some(a => a.deletedAt === undefined) && <small>{c.annotations.filter(a => a.deletedAt === undefined).length}</small>}
        </button><button className="conversation-delete icon-button" aria-label={t("删除对话：{0}", [c.title])} title={t("删除对话，可恢复")} disabled={fileBusy || mainBusyId === c.id || c.annotations.some(isAnnotationGenerating)} onClick={() => removeConversation(c.id)}><Trash2 size={14} /></button></div>)}
      </nav>
      <div className="sidebar-bottom">
        <button className="sidebar-settings" disabled={fileBusy} onClick={() => setTrashOpen(true)}><Trash2 size={16} /><span>{t("回收站（")}{deletedConversations.length + workspace.conversations.filter(c => c.deletedAt === undefined).reduce((sum, c) => sum + c.annotations.filter(a => a.deletedAt !== undefined).length, 0)}）</span></button>
        {latestDeleted && <button className="sidebar-settings undo-deletion" onClick={undoDelete} disabled={mainBusyId !== null} title={t("恢复最近删除的批注与高亮，刷新后仍可使用")}><RotateCcw size={16} /><span>{t("撤销删除")}</span></button>}
        <div className="backup-actions"><button disabled={fileBusy} onClick={() => fileInput.current?.click()}><FileUp size={15} />{t("导入")}</button><button onClick={() => setRecoveryOpen(true)}><RotateCcw size={15} />{t("备份与恢复")}</button></div>
        <button className="sidebar-settings" onClick={() => setSettingsOpen(true)}><Settings2 size={17} /><span>{t("模型与设置")}</span></button>
        <div className={'save-status ' + (saveStatus.startsWith("保存失败") ? 'save-error' : '')}><span />{t(saveStatus)}</div>
        {lastBackup && <div className="backup-time">{t("自动备份")}{new Date(lastBackup).toLocaleTimeString(getLocale(), { hour: '2-digit', minute: '2-digit', hour12: false })}</div>}
      </div>
    </aside>
    <main className="main-pane">
      <header className="topbar">
        <div className="topbar-heading"><button className="icon-button mobile-menu" aria-label={t("打开对话列表")} onClick={() => setSidebarOpen(true)}><Menu size={20} /></button><span>{openDocument && readerFocused ? openDocument.name : active.title}</span><span className="version-badge" title={t("构建 {0} · {1}", [__APP_BUILD__, new Date(__APP_BUILD_TIME__).toLocaleString(getLocale(), { hour12: false })])}>{__APP_VERSION__} · {__APP_BUILD__}</span></div>
        <div className="topbar-actions"><TranslationButton /><div className="reader-mode-actions">{!openDocument && reopenDocument && <button type="button" className="reader-mode-button" aria-label={t('展开 PDF 与聊天并排阅读')} title={t('展开文档：{0}', [reopenDocument.name])} disabled={fileBusy || turnBusy} onClick={() => expandReader('split')}><Columns2 size={17} /><span>{t('展开 PDF')}</span></button>}<button type="button" className="reader-mode-button" aria-label={t('返回阅读模式')} title={t('返回阅读模式')} disabled={fileBusy || turnBusy} onClick={() => expandReader('focused')}><BookOpen size={17} /><span>{t('阅读模式')}</span></button></div><button className="icon-button" aria-label={t("备份当前对话")} title={t("单独备份这个对话及其文件")} onClick={() => void downloadBackup(active.id)}><Download size={17} /></button><button className={'connection-button ' + (settings.mode === 'demo' ? 'demo-connection' : '')} onClick={() => setSettingsOpen(true)}><span className="status-dot" />{settings.mode === 'demo' ? t("演示模式") : settings.model || t("连接模型")}<Settings2 size={14} /></button></div>
      </header>
      <div className={'workspace-content ' + (openDocument ? 'with-reader' : '')}>
      <div className="conversation-pane">
      <ChatView key={active.id} visible={!readerFocused} fileGroups={activeFileGroups} filesLoading={library.loading} conversation={active} isRunning={mainBusyId === active.id} globallyBusy={mainBusyId !== null || modelSwitchBusy || fileBusy || turnBusy} turnDeleteDisabled={workspace.conversations.some(conversation => conversation.annotations.some(isAnnotationGenerating))} textReference={chatTextReference} onClearTextReference={() => setChatTextReference(null)} modelSwitchDisabled={modelSwitchBusy || mainBusyId !== null || turnBusy || active.annotations.some(isAnnotationGenerating)} onChooseModel={id => { void chooseModel(id).catch(e => notify(errorText(e))); }} onManageModels={() => setSettingsOpen(true)} settings={settings} openAnnotationId={openAnnotationId} onOpen={setOpenAnnotationId} onSend={(q, ids) => sendMain(active.id, q, ids, chatTextReference || undefined)} onDeleteTurn={id => removeTurn(active.id, id)} onStop={() => mainRequest.current?.controller.abort()} onRegenerate={id => regenerate(active.id, id)} onVersion={(messageId, versionId) => setVersion(active.id, messageId, versionId)} onCreate={a => addAnnotation(active.id, a)} onUpdate={(id, patch) => editAnnotation(active.id, id, patch)} onAsk={id => askAnnotation(active.id, id)} onReask={(id, action) => reaskAnnotation(active.id, id, action)} onStopAnnotation={id => annotationRequests.current.get(id)?.abort()} onDelete={id => removeAnnotation(active.id, id)} onNotify={notify} onUpload={() => uploadInput.current?.click()} onOpenDocument={id => { const document = active.documents?.find(d => d.id === id); if (document) openReaderReference({ conversationId: active.id, document }, 'split'); }} fileBusy={fileBusy} />
      </div>
      {(openDocument || readerFocused) && <div className="document-pane">{openDocument ? <DocumentReader contextMode={contextMode} onContextMode={changeContextMode} onLocation={onReaderLocation} key={openDocument.id} modelLabel={settings.mode === 'demo' ? t("演示模式") : settings.model || t("连接模型")} onOpenModelSettings={() => setSettingsOpen(true)} onBackup={() => void downloadBackup(active.id)} focused={readerFocused} onOpenFile={chooseReaderFile} onToggleFocus={() => setReaderFocused(value => !value)} source={openDocument} conversationId={active.id} annotations={readerAnnotations} reservedColors={active.annotations.map(a => a.color)} openAnnotationId={openAnnotationId} onOpen={setOpenAnnotationId} onCreate={a => addAnnotation(active.id, a)} onUpdate={(id, patch) => editAnnotation(active.id, id, patch)} onAsk={id => askAnnotation(active.id, id)} onReask={(id, action) => reaskAnnotation(active.id, id, action)} onStop={id => annotationRequests.current.get(id)?.abort()} onDelete={id => removeAnnotation(active.id, id)} onNotify={notify} disabled={mainBusyId !== null || fileBusy || turnBusy} onClose={closeReader} /> : <ReaderHome onDiscoverModels={() => { setSettingsIntent('discover'); setSettingsOpen(true); }} settings={settings} onChooseModel={id => { void chooseModel(id).catch(error => notify(errorText(error))); }} groups={library.groups} conversations={workspace.conversations} busy={fileBusy || modelSwitchBusy || mainBusyId !== null || annotationRequests.current.size > 0} loading={library.loading} onOpenFile={chooseReaderFile} onOpenDocument={openLibraryDocument} onChat={() => setReaderFocused(false)} onSettings={() => setSettingsOpen(true)} />}</div>}
      </div>
    </main>
    <input ref={fileInput} className="visually-hidden" type="file" accept=".json,application/json" onChange={e => { const file = e.target.files?.[0]; if (file) void importBackup(file); }} aria-label={t("导入聊天备份")} />
    <input ref={readerInput} className="visually-hidden" type="file" accept=".pdf,application/pdf" onChange={e => { const file = e.target.files?.[0]; if (file) void uploadDocument(file, 'reader'); }} aria-label={t("选择本地 PDF")} />
    <input ref={uploadInput} className="visually-hidden" type="file" accept=".pdf,.txt,.md,.markdown,application/pdf,text/plain,text/markdown" onChange={e => { const file = e.target.files?.[0]; if (file) void uploadDocument(file); }} aria-label={t("添加本地 PDF 或文本文件")} />
    {fileProgress && <div className="file-open-progress" role="status"><span>{fileProgress.total ? t("正在提取文字：{0} / {1} 页", [fileProgress.page, fileProgress.total]) : t("正在读取本地文件…")}</span><progress max={fileProgress.total || 1} value={fileProgress.page} /><button type="button" onClick={() => fileController.current?.abort()}>{t("取消打开")}</button></div>}
    {notice && <div role="status" className="toast">{t(notice)}{notice === "已删除批注与高亮，可撤销。" && latestDeleted && <button className="undo-toast" onClick={undoDelete}>{t("撤销")}</button>}<button className="icon-button" aria-label={t("关闭提示")} onClick={() => setNotice('')}><X size={15} /></button></div>}
    {saveStatus.startsWith("保存失败") && <div className="save-failure" role="alert">{t(saveStatus)}<button onClick={() => void downloadBackup()}>{t("导出备份")}</button></div>}
    {settingsOpen && <SettingsDialog settings={settings} initialIntent={settingsIntent} onClose={closeSettings} onSaveProfile={storeProfile} onDeleteProfile={removeProfile} onSelectProfile={chooseModel} />}
    {recoveryDialog}
    {trashOpen && <TrashDialog workspace={workspace} busy={fileBusy || mainBusyId !== null || annotationRequests.current.size > 0} onClose={() => setTrashOpen(false)} onPurge={purgeTrash} onRestore={restoreTrash} />}
    {backupWarning && <div className="save-failure" role="alert">{t(backupWarning)}<button onClick={() => setRecoveryOpen(true)}>{t("备份与恢复")}</button></div>}
    {closing && <div className="closing-overlay" role="status">{t("正在保存并关闭…")}</div>}
  </div></TranslationProvider></ChatTextReferenceProvider>;
}

type ChatViewProps = {
  conversation: Conversation; isRunning: boolean; globallyBusy: boolean; settings: ModelSettings; visible: boolean;
  openAnnotationId: string | null; onOpen: (id: string | null) => void;
  onSend: (question: string, annotationIds?: string[]) => Promise<boolean>; onStop: () => void; onRegenerate: (id: string) => void;
  onDeleteTurn: (messageId: string) => Promise<void>;
  turnDeleteDisabled: boolean;
  textReference: ChatTextReference | null; onClearTextReference: () => void;
  onVersion: (messageId: string, versionId: string) => void;
  onCreate: (annotation: Annotation) => void; onUpdate: (id: string, patch: Partial<Annotation>) => void; onAsk: (id: string) => void; onReask: (id: string, action: 'start' | 'cancel' | 'edit') => void; onStopAnnotation: (id: string) => void;
  onDelete: (id: string) => void; onNotify: (message: string) => void;
  modelSwitchDisabled: boolean; onChooseModel: (id: string | null) => void; onManageModels: () => void;
  onUpload: () => void; onOpenDocument: (id: string) => void; fileBusy: boolean;
  fileGroups: LocalDocumentGroup[]; filesLoading: boolean;
};
export function ChatView(props: ChatViewProps) {
  useLocale();
  const { conversation, settings, isRunning, globallyBusy } = props;
  const [atBottom, setAtBottom] = useState(true);
  const chatPosition = useChatPosition(conversation.id, props.visible, isRunning, setAtBottom);
  const [selectedAnnotations, setSelectedAnnotations] = useState<string[]>([]), [pickingAnnotations, setPickingAnnotations] = useState(false), [deletingMessage, setDeletingMessage] = useState<string | null>(null);
  useEffect(() => { setSelectedAnnotations(previous => { const next = previous.filter(id => conversation.annotations.some(annotation => annotation.id === id && canReferenceAnnotation(annotation))); return next.length === previous.length ? previous : next; }); }, [conversation.annotations]);
  const round = deletingMessage && conversation.messages.some(message => message.id === deletingMessage) ? chatRound(conversation.messages, deletingMessage) : [];
  const roundIds = new Set(round.map(message => message.id));
  const roundAnnotations = conversation.annotations.filter(annotation => roundIds.has(annotation.messageId));
  const roundAnnotationIds = new Set(roundAnnotations.map(annotation => annotation.id));
  const referencedElsewhere = conversation.messages.filter(message => !roundIds.has(message.id)).reduce((sum, message) => sum + Number(roundIds.has(message.textReference?.messageId || '')) + (message.annotationReferences || []).filter(reference => roundAnnotationIds.has(reference.annotationId)).length, 0);
  const deleteDisabled = globallyBusy || props.turnDeleteDisabled || conversation.annotations.some(isAnnotationGenerating);
  const convertMessage = useCallback((m: ChatMessage): ThreadMessageLike => ({
    id: m.id, role: m.role, content: [{ type: 'text', text: activeVersion(m).content }],
    ...(m.role === 'assistant' ? { status: activeVersion(m).status === 'streaming' ? { type: 'running' as const } : { type: 'complete' as const, reason: 'stop' as const } } : {}),
  }), []);
  const messages = useMemo(() => conversation.messages, [conversation.messages]);
  const runtime = useExternalStoreRuntime({
    messages, convertMessage, isRunning, isSendDisabled: globallyBusy,
    onNew: async message => {
      chatPosition.onSend();
      const question = message.content.filter(p => p.type === 'text').map(p => p.type === 'text' ? p.text : '').join('\n');
      if (await props.onSend(question, selectedAnnotations)) setSelectedAnnotations([]);
    },
    onCancel: async () => props.onStop(),
  });
  return <AssistantRuntimeProvider runtime={runtime}>
    <ThreadPrimitive.Root className="chat-root">
      {Boolean(conversation.documents?.length) && <details className="chat-local-files" aria-label={t("对话本地文件")}><summary><FolderOpen size={14} />{t("本地文件")}<small>{props.filesLoading ? t("整理中…") : props.fileGroups.length}</small><span className="chat-files-disclosure" aria-hidden="true"><span className="chat-files-expand">{t('展开')}</span><span className="chat-files-collapse">{t('收起')}</span><ChevronDown size={14} strokeWidth={1.6} /></span></summary><div>{props.fileGroups.map(group => { const d = group.references[0].document; return <button type="button" key={group.id} title={t("阅读 {0}", [d.name])} onClick={() => props.onOpenDocument(d.id)}><FileText size={15} /><span>{d.name}</span><small>{d.pages.length}{t("页")}</small></button>; })}</div></details>}

      <ThreadPrimitive.Viewport ref={chatPosition.viewportRef} className="chat-viewport" autoScroll={isRunning} scrollToBottomOnInitialize={false} scrollToBottomOnRunStart scrollToBottomOnThreadSwitch={false}>
        <div ref={chatPosition.contentRef} className="reading-column">
          {conversation.messages.length === 0 ? <div className="empty-state">
            <span className="empty-symbol"><PenLine size={29} /></span><div className="eyebrow">THINK WITHOUT LOSING YOUR PLACE</div><h1>{t("让好奇心，")}<br />{t("留在原文旁。")}</h1><p>{conversation.documents?.length ? <>{t("文件已准备好。点击上方文件可阅读、划选批注；")}<br />{t("也可以在下方直接询问论文中的问题。")}</> : <>{t("聊一个想弄懂的话题，或上传一篇论文。")}<br />{t("选中文字后，可以询问 AI，也可以只写自己的批注。")}</>}</p>
            <button className="starter-question" onClick={() => void props.onSend(t("什么是广义相对论？请用容易理解的方式介绍。"))} disabled={globallyBusy}><BookOpen size={17} /><span>{t("从广义相对论开始")}</span><ArrowUp size={15} /></button>
          </div> : <>
            <div className="reading-guide"><PenLine size={14} /><span>{t("选中回答中的文字，就能在原处批注提问")}</span><span className="guide-end">READ · ASK · KEEP</span></div>
            {conversation.messages.map((message, index) => {
              const version = activeVersion(message);
              const versionIndex = message.versions.findIndex(v => v.id === version.id);
              if (message.role === 'user') return <div className="user-message" key={message.id} data-message-id={message.id} data-chat-message data-version-id={version.id}><span className="user-label">{t("你")}</span><div><ChatQuestionText selection={{ conversationId: conversation.id, messageId: message.id, versionId: version.id }}>{version.content}</ChatQuestionText>{message.textReference && <ChatTextReferencePreview reference={message.textReference} />}{Boolean(message.annotationReferences?.length) && <ChatAnnotationReferences references={message.annotationReferences!} />}</div>{(!conversation.messages[index + 1] || conversation.messages[index + 1].role === 'user') && <button type="button" className="user-turn-delete" disabled={deleteDisabled} aria-label={t('删除本轮对话')} onClick={() => setDeletingMessage(message.id)}><Trash2 size={13} />{t('删除本轮')}</button>}</div>;
              const annotations = conversation.annotations.filter(a => a.deletedAt === undefined && a.messageId === message.id && a.versionId === version.id);
              return <article className="assistant-message" key={message.id} data-message-id={message.id} data-chat-message data-version-id={version.id}>
                <div className="assistant-label"><span className="mini-brand"><PenLine size={14} /></span><strong>AI-Embedded Paper PDF Reader</strong><span>{version.modelLabel || (conversation.title.includes(t("体验示例")) ? t("本地示例回答") : settings.mode === 'demo' ? t("本地演示") : settings.model)}</span>{version.status === 'streaming' && <span className="streaming-label"><span />{t("正在思考与书写")}</span>}</div>
                <AnnotatedAnswer key={version.id} conversationId={conversation.id} messageId={message.id} version={version} annotations={annotations} reservedColors={conversation.annotations.filter(a => a.messageId === message.id && a.versionId === version.id).map(a => a.color)} openAnnotationId={props.openAnnotationId} onOpen={props.onOpen} onCreate={props.onCreate} onUpdate={props.onUpdate} onAsk={props.onAsk} onReask={props.onReask} onStop={props.onStopAnnotation} onDelete={props.onDelete} onNotify={props.onNotify} disabled={isRunning} />
                {version.error && version.status !== 'complete' && <div className="answer-error" role="alert">{t(version.error || "")}<p>{t("你可以直接继续发送新问题，也可以重新生成。需要更换 API 时，在左下角切换模型即可。")}</p></div>}
                <footer className="answer-actions">
                  <button type="button" disabled={deleteDisabled} aria-label={t('删除本轮对话')} onClick={() => setDeletingMessage(message.id)}><Trash2 size={14} />{t('删除本轮')}</button>
                  {index === conversation.messages.length - 1 && <button disabled={globallyBusy} onClick={() => props.onRegenerate(message.id)}><RefreshCw size={14} />{version.status === 'error' || version.status === 'interrupted' ? t("重试这次回答") : t("重新生成")}</button>}
                  {message.versions.length > 1 && <div className="version-control"><button className="icon-button" aria-label={t("查看上一个回答版本")} disabled={globallyBusy || versionIndex === 0} onClick={() => props.onVersion(message.id, message.versions[versionIndex - 1].id)}><ChevronLeft size={15} /></button><span>{t("版本")}{versionIndex + 1} / {message.versions.length}</span><button className="icon-button" aria-label={t("查看下一个回答版本")} disabled={globallyBusy || versionIndex === message.versions.length - 1} onClick={() => props.onVersion(message.id, message.versions[versionIndex + 1].id)}><ChevronRight size={15} /></button></div>}
                  {annotations.length > 0 && <span className="annotation-count"><PenLine size={13} />{annotations.length}{t("条批注")}</span>}
                  {version.status === 'complete' && <span className="answer-complete"><Check size={12} />{t("已保存")}</span>}
                </footer>
              </article>;
            })}
          </>}
          <div className="chat-bottom" />
        </div>
      </ThreadPrimitive.Viewport>
      {!atBottom && <button className="scroll-bottom icon-button" aria-label={t("回到对话底部")} onClick={chatPosition.scrollToBottom}><ArrowDown size={18} /></button>}
      <div className="composer-area">
        <ComposerPrimitive.Root className="main-composer">
          {props.textReference && <ChatTextReferencePreview reference={props.textReference} onRemove={props.onClearTextReference} />}
          <ComposerPrimitive.Input className="composer-input" placeholder={t(props.textReference ? '就这段文字，你想问什么？' : "想弄懂什么？从这里开始…")} aria-label={t("输入主对话问题")} autoFocus={false} disabled={globallyBusy} maxRows={7} addAttachmentOnPaste={false} unstable_focusOnScrollToBottom={false} unstable_focusOnRunStart={false} />
          <div className="composer-toolbar">
            <div className="composer-quick-actions"><button type="button" className="upload-document-button" aria-label={t("添加本地文件")} title={t("从本地选择 PDF、TXT 或 Markdown")} disabled={globallyBusy} onClick={props.onUpload}><Paperclip size={15} /><span className="composer-action-label">{props.fileBusy ? t("读取中…") : t("本地文件")}</span></button>
              <div className="chat-reference-tools"><button type="button" className="chat-reference-trigger" data-selected={selectedAnnotations.length > 0 || undefined} aria-label={t('引用批注')} title={selectedAnnotations.length ? `${t('引用批注')} · ${t('已选 {0} 条批注', [selectedAnnotations.length])}` : t('引用批注')} disabled={globallyBusy} onClick={() => setPickingAnnotations(true)}><MessageSquareQuote size={15} /><span className="composer-action-label">{t('引用批注')}</span>{selectedAnnotations.length > 0 && <span className="chat-reference-count" aria-hidden="true">{selectedAnnotations.length}</span>}</button>{selectedAnnotations.length > 0 && <><span className="visually-hidden" role="status">{t('已选 {0} 条批注', [selectedAnnotations.length])}</span><button type="button" className="chat-reference-clear" title={t('清除本次批注引用')} disabled={globallyBusy} aria-label={t('清除本次批注引用')} onClick={() => setSelectedAnnotations([])}><X size={13} /></button></>}</div>
            </div>
            <div className="composer-model-controls"><NativeSelect wrapperClassName="composer-model-select" aria-label={t("选择预载模型")} title={settings.mode === 'api' ? settings.model : t("选择已保存的模型配置")} value={settings.mode === 'demo' ? '__demo__' : settings.activeProfileId || '__current__'} disabled={props.modelSwitchDisabled} onChange={event => { if (event.target.value === '__manage__') props.onManageModels(); else props.onChooseModel(event.target.value === '__demo__' ? null : event.target.value); }}>
            <option value="__demo__">{t("演示模式")}</option>
            {settings.mode === 'api' && !settings.activeProfileId && <option value="__current__" disabled>{settings.model || t("当前连接（未保存）")}</option>}
            {settings.profiles.map(profile => <option key={profile.id} value={profile.id}>{profile.name} · {profile.model}{!profile.hasApiKey && !/^http:\/\/(127\.0\.0\.1|localhost|\[::1\])(?=[:/]|$)/.test(profile.baseURL) ? t("（需填写密钥）") : ''}</option>)}
            <option value="__manage__">{t("＋ 添加或管理模型…")}</option>
            </NativeSelect></div>{isRunning ? <ComposerPrimitive.Cancel className="send-button" aria-label={t("停止生成")}><Square size={15} fill="currentColor" /></ComposerPrimitive.Cancel> : <ComposerPrimitive.Send className="send-button" aria-label={t("发送问题")}><ArrowUp size={20} /></ComposerPrimitive.Send>}
          </div>
        </ComposerPrimitive.Root>
        <p className="composer-footnote">{t("Enter 发送，Shift + Enter 换行")}<span>·</span>{t('批注独立提问，聊天只引用你主动选择的批注')}</p>
      </div>
      {pickingAnnotations && <ChatAnnotationPicker conversation={conversation} selected={selectedAnnotations} onClose={() => setPickingAnnotations(false)} onApply={ids => { setSelectedAnnotations(ids); setPickingAnnotations(false); }} />}
      {round.length > 0 && <DeleteChatTurnDialog question={activeVersion(round[0]).content} annotationCount={roundAnnotations.length} referenceCount={referencedElsewhere} disabled={deleteDisabled} onClose={() => setDeletingMessage(null)} onDelete={async () => { await props.onDeleteTurn(round[0].id); setDeletingMessage(null); }} />}
    </ThreadPrimitive.Root>
  </AssistantRuntimeProvider>;
}

