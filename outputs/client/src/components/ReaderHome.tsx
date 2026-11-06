import { t } from '../i18n/locale';
import { useLocale } from '../i18n/react';
import { BookOpen, FileText, FolderOpen, MessageSquare, Radar, Settings2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { Conversation, ModelSettings } from '../domain/types';
import type { LocalDocumentGroup, LocalDocumentReference } from '../domain/local-library';
import { fileAnnotationCounter } from '../domain/local-library';
import './documents.css';
import { LanguageSelector } from './LanguageSelector';
import { NativeSelect } from './NativeSelect';

interface Props {
  groups: LocalDocumentGroup[]; conversations: Conversation[]; busy: boolean; loading: boolean;
  onOpenFile: () => void; onOpenDocument: (group: LocalDocumentGroup, ref?: LocalDocumentReference) => void;
  onChat: () => void; onSettings: () => void; onDiscoverModels: () => void;
  settings: ModelSettings; onChooseModel: (id: string | null) => void;
}
export function ReaderHome({ groups, conversations, busy, loading, onOpenFile, onOpenDocument, onChat, onSettings, onDiscoverModels, settings, onChooseModel }: Props) {
  useLocale();
  const [limit, setLimit] = useState(50);
  const countNotes = useMemo(() => fileAnnotationCounter(conversations), [conversations]);
  return <section className="reader-home" aria-label={t("本地阅读器")} data-testid="reader-home">
    <header className="reader-home-toolbar"><span><BookOpen size={17} />AI-Embedded Paper PDF Reader</span><div><LanguageSelector /><button type="button" className="document-icon-button" aria-label={t("模型与设置")} title={t("模型与设置")} onClick={onSettings}><Settings2 size={18} /></button><button type="button" className="document-icon-button" aria-label={t("打开对话")} title={t("需要时打开对话")} onClick={onChat}><MessageSquare size={18} /></button></div></header>
    <div className="reader-home-content"><div className="reader-home-intro"><BookOpen size={29} /><h1>{t("打开一篇，慢慢读。")}</h1><p>{t("从本地选择 PDF，直接阅读、划词提问或记下想法。")}</p><button type="button" className="reader-open-file" disabled={busy} onClick={onOpenFile}><FolderOpen size={18} />{busy ? t("正在打开…") : t("打开本地 PDF")}</button></div>
      <section className="reader-api-card" aria-label={t("AI / API 连接")}><div><h2>{t("AI / API 连接")}</h2><p>{settings.mode === 'api' ? t("当前模型：{0}", [settings.model]) : t("尚未连接 AI，当前为本地演示。")}</p><small>{t("连接自己的 API 或本地模型，可直接获取上游模型列表。")}</small></div><div className="reader-api-actions">{settings.profiles.length > 0 && <NativeSelect wrapperClassName="reader-model-picker" aria-label={t("选择预载模型")} value={settings.mode === 'demo' ? '__demo__' : settings.activeProfileId || '__current__'} disabled={busy} onChange={event => onChooseModel(event.target.value === '__demo__' ? null : event.target.value)}><option value="__demo__">{t("本地演示")}</option>{settings.mode === 'api' && !settings.activeProfileId && <option value="__current__" disabled>{settings.model}</option>}{settings.profiles.map(profile => <option key={profile.id} value={profile.id}>{profile.name} · {profile.model}</option>)}</NativeSelect>}<div className="reader-api-buttons"><button type="button" className="document-tool-button" disabled={busy} onClick={onSettings}><Settings2 size={16} />{t("配置 API")}</button><button type="button" className="document-tool-button" disabled={busy} onClick={onDiscoverModels}><Radar size={16} />{t("探测上游模型")}</button></div></div></section>
      <section className="reader-recent" aria-label={t("本地阅读记录")}><header><h2>{t("最近阅读")}</h2><span>{loading ? t("正在整理…") : t("{0} 份文件", [groups.length])}</span></header>
        {!loading && !groups.length && <p className="reader-recent-empty">{t("读过的文件和批注会留在这里。")}</p>}
        <ul>{groups.slice(0, limit).map(group => {
          const ref = group.references[0], document = ref.document, notes = countNotes(group.references);
          const owners = [...new Set(group.references.map(r => r.conversationId))].map(id => group.references.filter(r => r.conversationId === id));
          return <li key={group.id}><button type="button" disabled={busy} className="reader-recent-file" onClick={() => onOpenDocument(group)}><FileText size={19} /><span><strong>{document.name}</strong><small>{t("{0} 页", [document.pages.length])}{notes ? t(" · {0} 条批注", [notes]) : ''}</small></span><span className="reader-recent-open">{t("阅读")}</span></button>
            {owners.length > 1 && <details className="reader-file-records"><summary>{t("查看已有的 {0} 份阅读记录", [owners.length])}</summary>{owners.map(refs => { const owner = conversations.find(c => c.id === refs[0].conversationId); return <button type="button" disabled={busy} key={refs[0].conversationId} onClick={() => onOpenDocument(group, refs[0])}>{owner?.title || t("阅读记录")}<small>{countNotes(refs)}{t("条批注")}</small></button>; })}</details>}
          </li>;
        })}</ul>
        {groups.length > limit && <button type="button" className="document-tool-button" onClick={() => setLimit(value => value + 50)}>{t("更多阅读记录")}</button>}
      </section>
    </div>
  </section>;
}
