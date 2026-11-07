import test from 'node:test';
import assert from 'node:assert/strict';
import { createLocaleStore, LOCALE_STORAGE_KEY, translate, LANGUAGES, localeDirection, catalogs, isLocale } from '../src/i18n/locale';
import { english } from '../src/i18n/messages';

test('language preference defaults to Chinese, survives restart and only touches its own key', () => {
  const records = new Map([['unrelated-record', 'unchanged']]);
  const storage = { getItem: (key: string) => records.get(key) ?? null, setItem: (key: string, value: string) => { records.set(key, value); } };
  const first = createLocaleStore(storage);
  assert.equal(first.get(), 'zh-CN');
  let renders = 0; const unsubscribe = first.subscribe(() => { renders++; });
  assert.equal(first.set('en'), true); assert.equal(renders, 1);
  assert.equal(createLocaleStore(storage).get(), 'en');
  assert.equal(records.get('unrelated-record'), 'unchanged');
  assert.deepEqual([...records.keys()], ['unrelated-record', LOCALE_STORAGE_KEY]);
  unsubscribe(); first.set('zh-CN'); assert.equal(renders, 1);
  assert.equal(createLocaleStore(storage).get(), 'zh-CN');
});

test('unavailable storage and invalid saved preferences keep the interface usable', () => {
  const denied = createLocaleStore({ getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } });
  assert.equal(denied.get(), 'zh-CN'); assert.equal(denied.set('en'), false); assert.equal(denied.get(), 'en');
  const invalid = createLocaleStore({ getItem: () => 'invalid-language', setItem() {} });
  assert.equal(invalid.get(), 'zh-CN'); assert.throws(() => invalid.set('xx' as 'en')); assert.equal(invalid.get(), 'zh-CN');
});

test('all eight languages persist with native names and Arabic has RTL direction', () => {
  assert.deepEqual(LANGUAGES.map(language => language.code), ['zh-CN', 'en', 'es', 'ja', 'zh-TW', 'de', 'ar', 'fr']);
  let saved: string | null = null; const storage = { getItem: () => saved, setItem: (_: string, value: string) => { saved = value; } };
  for (const language of LANGUAGES) { assert.ok(isLocale(language.code)); createLocaleStore(storage).set(language.code); assert.equal(createLocaleStore(storage).get(), language.code); assert.equal(localeDirection(language.code), language.code === 'ar' ? 'rtl' : 'ltr'); }
  assert.ok(!isLocale('xx'));
});

test('new locale catalogs preserve every placeholder and leave user text unconverted', () => {
  const tokens = (text: string) => [...text.matchAll(/\{\d+\}/g)].map(match => match[0]).sort();
  for (const [locale, catalog] of Object.entries(catalogs)) {
    for (const [key, value] of Object.entries(catalog)) { assert.ok(value.trim(), `${locale}: ${key}`); assert.deepEqual(tokens(value), tokens(key), `${locale}: ${key}`); }
  }
  for (const { code } of LANGUAGES) {
    const source = '用户原文.pdf العربية α \\LaTeX';
    assert.ok(translate('打开批注 {0}：{1}', code, [1, source]).endsWith(source));
    assert.equal(translate(source, code), source);
  }
  assert.equal(translate('界面语言', 'zh-TW'), '介面語言');
  assert.equal(translate('设置', 'fr'), 'Paramètres'); assert.equal(translate('设置', 'ja'), '設定');
  assert.equal(translate('设置', 'es'), 'Ajustes'); assert.equal(translate('设置', 'de'), 'Einstellungen'); assert.equal(translate('设置', 'ar'), 'الإعدادات');
  assert.ok(translate('API 密钥验证失败，请检查这份连接的密钥是否有效。', 'fr').startsWith('API key'));
});

test('every English translation preserves all interpolation placeholders', () => {
  const tokens = (value: string) => [...value.matchAll(/\{\d+\}/g)].map(match => match[0]).sort();
  for (const [source, translated] of Object.entries(english)) {
    assert.ok(translated.trim(), source); assert.deepEqual(tokens(translated), tokens(source), source);
  }
});

test('translation preserves quoted names, article content and external diagnostics verbatim', () => {
  const quote = '新对话 {1} $& \\ LaTeX α';
  assert.equal(translate('打开批注 {0}：{1}', 'en', [3, quote]), 'Open annotation 3: ' + quote);
  assert.equal(translate('打开批注 {0}：{1}', 'zh-CN', [3, quote]), '打开批注 3：' + quote);
  assert.equal(translate('External provider error 503: α', 'en'), 'External provider error 503: α');
  assert.equal(translate('无法读取附件“论文摘要.pdf”，未生成不完整备份。', 'en'), 'Attachment “论文摘要.pdf” could not be read. No incomplete backup was created.');
  assert.equal(translate('打开本地 PDF', 'en'), 'Open local PDF');
  assert.equal(translate('API 密钥验证失败，请检查这份连接的密钥是否有效。\n诊断编号：fake-123', 'en'), 'API key authentication failed. Check this connection\'s API key.\nDiagnostic ID: fake-123');
});
