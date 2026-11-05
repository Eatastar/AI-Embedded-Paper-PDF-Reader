import test from 'node:test';
import assert from 'node:assert/strict';
import { locateQuoteAnchor } from '../src/adapters/anchors';

test('an unchanged range keeps its exact offsets even when the quote repeats', () => {
  const text = '曲率描述几何，曲率可以测量。';
  const start = text.lastIndexOf('曲率');
  const selector = { start, end: start + 2, quote: '曲率', id: 'saved-selector' };
  assert.deepEqual(locateQuoteAnchor(text, selector), selector);
  assert.equal(selector.start, start);
});

test('ordinary text after a newly rendered formula relocates by its unique exact quote', () => {
  const oldText = '公式：G_{\\mu\\nu}=T_{\\mu\\nu}。这里描述时空曲率。';
  const quote = '这里描述时空曲率';
  const selector = { start: oldText.indexOf(quote), end: oldText.indexOf(quote) + quote.length, quote };
  const text = '公式：Gμν= Tμν。这里描述时空曲率。';
  const start = text.indexOf(quote);
  assert.deepEqual(locateQuoteAnchor(text, selector), { start, end: start + quote.length, quote });
});

test('text before a changed formula remains at its saved position', () => {
  const quote = '爱因斯坦场方程';
  const selector = { start: 0, end: quote.length, quote };
  assert.deepEqual(locateQuoteAnchor(`${quote}：Gμν。`, selector), selector);
});

test('changed quotes crossing an old formula stay unlocated instead of using stale offsets', () => {
  const quote = '方程 G_{\\mu\\nu} 描述';
  assert.equal(locateQuoteAnchor('方程 Gμν 描述时空曲率。', { start: 0, end: quote.length, quote }), null);
});

test('a moved quote with multiple exact matches is not guessed from proximity', () => {
  assert.equal(locateQuoteAnchor('曲率是几何。曲率可以测量。', { start: 4, end: 6, quote: '曲率' }), null);
  assert.equal(locateQuoteAnchor('aaa', { start: 5, end: 7, quote: 'aa' }), null);
});

test('offsets use UTF-16 positions consistently with DOM text ranges', () => {
  const text = '公式🌏之后：引力';
  const quote = '引力';
  assert.deepEqual(locateQuoteAnchor(text, { start: 1, end: 3, quote }), {
    start: text.indexOf(quote), end: text.length, quote,
  });
});

test('invalid offsets can only recover a unique quote; empty or missing quotes never locate', () => {
  assert.deepEqual(locateQuoteAnchor('唯一引用', { start: -1, end: Number.NaN, quote: '引用' }), {
    start: 2, end: 4, quote: '引用',
  });
  assert.equal(locateQuoteAnchor('正文', { start: 0, end: 0, quote: '' }), null);
  assert.equal(locateQuoteAnchor('正文', { start: 0, end: 1000, quote: '不存在' }), null);
});
