import { useState } from 'react';
import { Languages } from 'lucide-react';
import { isLocale, setLocale, t, LANGUAGES } from '../i18n/locale';
import { useLocale } from '../i18n/react';
import { NativeSelect } from './NativeSelect';

export function LanguageSelector() {
  const locale = useLocale();
  const [saved, setSaved] = useState(true);
  return <div className="language-preference"><label className="language-selector" title={t('界面语言')}><Languages size={16} /><span className="visually-hidden">{t('界面语言')}</span><NativeSelect aria-label="界面语言 / Interface language" value={locale} onChange={event => { if (isLocale(event.target.value)) setSaved(setLocale(event.target.value)); }}>{LANGUAGES.map(language => <option key={language.code} value={language.code} lang={language.code}>{language.name}</option>)}</NativeSelect></label>{!saved && <small role="status">{t('设置仅在本次有效')}</small>}</div>;
}
