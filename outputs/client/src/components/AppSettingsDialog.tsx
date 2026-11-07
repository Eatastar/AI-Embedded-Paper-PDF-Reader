import { useEffect, useRef } from 'react';
import { ChevronRight, Settings, X } from 'lucide-react';
import { t } from '../i18n/locale';
import { useLocale } from '../i18n/react';
import { LanguageSelector } from './LanguageSelector';

export function AppSettingsDialog({ onClose, onModels }: { onClose: () => void; onModels: () => void }) {
  useLocale();
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);
  return <dialog ref={dialog} className="settings-dialog app-settings-dialog" aria-labelledby="app-settings-title" onCancel={onClose}>
    <header className="dialog-header"><div><h2 id="app-settings-title">{t('设置')}</h2><p className="profile-dialog-intro">{t('调整界面语言，管理模型连接。')}</p></div><button type="button" className="icon-button" aria-label={t('关闭设置')} onClick={onClose}><X size={20} /></button></header>
    <div className="app-preferences"><span>{t('界面语言')}</span><LanguageSelector /></div>
    <p className="field-help language-scope">{t('AI 默认回答和翻译目标跟随界面语言；自定义语言优先，已有内容不会被改写。')}</p>
    <section className="app-shortcuts" aria-label={t('快捷键')}><h3>{t('快捷键')}</h3><div><span>{t('框选图片')}</span><kbd>Ctrl+Alt+A</kbd></div><p className="field-help">{t('在 PDF 原排版中开启框选，再按一次或按 Esc 取消。')}</p></section>
    <button type="button" className="app-model-settings" onClick={onModels}><Settings size={17} /><span>{t('模型与 API 连接')}</span><ChevronRight size={17} /></button>
    <footer className="dialog-footer"><span>AI-Embedded Paper PDF Reader · {__APP_VERSION__}</span><button type="button" className="primary-button" onClick={onClose}>{t('完成')}</button></footer>
  </dialog>;
}
