import { useState } from 'react';
import { Languages } from 'lucide-react';
import { isLocale, setLocale, t } from '../i18n/locale';
import { useLocale } from '../i18n/react';

export function LanguageSelector() {
  const locale = useLocale();
  const [saved, setSaved] = useState(true);
  return <div className="language-preference"><label className="language-selector" title="界面语言 / Interface language"><Languages size={16} /><span className="visually-hidden">{t('界面语言')}</span><select aria-label="界面语言 / Interface language" value={locale} onChange={event => { if (isLocale(event.target.value)) setSaved(setLocale(event.target.value)); }}><option value="zh-CN">简体中文</option><option value="en">English</option></select></label>{!saved && <small role="status">{t('设置仅在本次有效')}</small>}</div>;
}
