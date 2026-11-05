import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_READER_APPEARANCE, READER_PRESETS, readerAppearance, readerContrast, readerPosition, recolorPagePixels } from '../src/domain/reader';
import { loadReaderAppearance, loadReaderPosition, saveReaderAppearance, saveReaderPosition } from '../src/adapters/reader';

test('page colors change black and white pixels while preserving source bytes and colorful graph regions', () => {
  const source = new Uint8ClampedArray([255,255,255,255, 0,0,0,255, 230,35,45,255, 32,100,220,240, 235,242,224,255]);
  const original = source.slice();
  const result = recolorPagePixels(source, DEFAULT_READER_APPEARANCE);
  assert.deepEqual([...result.slice(0, 4)], [255,244,214,255]);
  assert.deepEqual([...result.slice(4, 8)], [64,53,38,255]);
  assert.deepEqual([...result.slice(8)], [...original.slice(8)]);
  assert.deepEqual(source, original, 'The original PDF display buffer remains reusable for original-color comparison');
});

test('a scanned grayscale page supports a dark palette, with original mode restoring every byte', () => {
  const source = new Uint8ClampedArray([255,255,255,255, 128,128,128,200, 0,0,0,255]);
  const dark = readerAppearance({ preset: 'dark', paper: '#ffffff', ink: '#000000', preserveColors: true });
  const result = recolorPagePixels(source, dark);
  assert.deepEqual([...result.slice(0, 4)], [38,40,44,255]);
  assert.deepEqual([...result.slice(-4)], [228,225,216,255]);
  assert.equal(result[7], 200);
  assert.deepEqual(recolorPagePixels(source, { ...dark, preset: 'original' }), source);
  assert.throws(() => recolorPagePixels(source, dark, source), /separate/);
});

test('custom colors can also remap colorful scans when color preservation is switched off', () => {
  const source = new Uint8ClampedArray([255,0,0,255]);
  const custom = readerAppearance({ preset: 'custom', paper: '#FFFFCC', ink: '#223344', preserveColors: false });
  const output = recolorPagePixels(source, custom);
  assert.equal(custom.paper, '#ffffcc');
  assert.notDeepEqual(output, source);
  assert.equal(output[3], 255);
  for (const preset of READER_PRESETS) assert.ok(readerContrast(preset.paper, preset.ink) >= 4.5);
});

test('damaged appearance and position records fall back to usable values and valid page bounds', () => {
  assert.deepEqual(readerAppearance({ paper: 'url(remote)', ink: '#ffffff' }), DEFAULT_READER_APPEARANCE);
  assert.deepEqual(readerPosition({ pageIndex: 999, zoom: Infinity, scrollY: -8, scrollX: 8, view: 'original' }, 12, 'text'), { pageIndex: 11, zoom: 1, scrollY: 0, scrollX: 1, view: 'text' });
  assert.deepEqual(readerPosition(null, 3, 'pdf'), { pageIndex: 0, zoom: 1, scrollY: 0, scrollX: 0, view: 'original' });
});

test('appearance persists globally and independent document positions do not overwrite each other or chat storage', () => {
  const values = new Map<string, string>([['margin-chat-workspace', 'untouched-chat-record']]);
  const storage = { getItem: (key: string) => values.get(key) || null, setItem: (key: string, value: string) => { values.set(key, value); } };
  const appearance = readerAppearance({ preset: 'custom', paper: '#e4efd9', ink: '#243522', preserveColors: true });
  assert.equal(saveReaderAppearance(appearance, storage), true);
  assert.deepEqual(loadReaderAppearance(storage), appearance);
  const a = { pageIndex: 8, zoom: 1.75, view: 'original' as const, scrollY: .6, scrollX: .2 };
  const b = { pageIndex: 1, zoom: .75, view: 'text' as const, scrollY: .3, scrollX: 0 };
  assert.equal(saveReaderPosition('paper-a', a, storage), true);
  assert.equal(saveReaderPosition('paper-b', b, storage), true);
  assert.deepEqual(loadReaderPosition('paper-a', 20, 'pdf', storage), { ...a, layout: 'continuous', pageOffset: 0 });
  assert.deepEqual(loadReaderPosition('paper-b', 20, 'pdf', storage), { ...b, layout: 'continuous', pageOffset: 0 });
  assert.equal(values.get('margin-chat-workspace'), 'untouched-chat-record');
});

test('disabled or corrupted local storage does not block reading and reports unsaved preferences', () => {
  const denied = { getItem() { throw new Error('Storage disabled'); }, setItem() { throw new Error('Storage full'); } };
  assert.deepEqual(loadReaderAppearance(denied), DEFAULT_READER_APPEARANCE);
  assert.equal(saveReaderAppearance(DEFAULT_READER_APPEARANCE, denied), false);
  assert.deepEqual(loadReaderPosition('paper', 2, 'pdf', { ...denied, getItem: () => '{broken' }), { ...readerPosition(null, 2, 'pdf'), layout: 'continuous', pageOffset: 0 });
});

test('new PDFs and legacy paged preferences adopt scrolling without changing chat data or the old preference', () => {
  const key = 'learn-something.reader.position.v1.legacy-paper';
  const legacy = { pageIndex: 3, zoom: 1.25, view: 'original', scrollX: .2, scrollY: .4, layout: 'paged' };
  const values = new Map([[key, JSON.stringify(legacy)], ['margin-chat-workspace', 'untouched']]);
  const storage = { getItem: (name: string) => values.get(name) || null, setItem: (name: string, value: string) => { values.set(name, value); } };
  assert.equal(loadReaderPosition('new-paper', 8, 'pdf', storage).layout, 'continuous');
  const migrated = loadReaderPosition('legacy-paper', 8, 'pdf', storage);
  assert.deepEqual(migrated, { ...legacy, layout: 'continuous', pageOffset: .4 });
  assert.equal(values.get(key), JSON.stringify(legacy));
  assert.equal(saveReaderPosition('legacy-paper', migrated, storage), true);
  const choice = { ...migrated, layout: 'paged' as const };
  assert.equal(saveReaderPosition('legacy-paper', choice, storage), true);
  assert.equal(loadReaderPosition('legacy-paper', 8, 'pdf', storage).layout, 'paged');
  assert.equal(values.get('margin-chat-workspace'), 'untouched');
});

test('legacy continuous progress and text files keep their existing reading positions', () => {
  const continuous = { pageIndex: 4, zoom: .75, view: 'original', scrollX: 0, scrollY: .8, layout: 'continuous', pageOffset: .27 };
  const text = { pageIndex: 0, zoom: 1, view: 'text', scrollX: 0, scrollY: .6 };
  const values = new Map([['learn-something.reader.position.v1.pdf', JSON.stringify(continuous)], ['learn-something.reader.position.v1.text', JSON.stringify(text)]]);
  const storage = { getItem: (name: string) => values.get(name) || null, setItem: () => {} };
  assert.deepEqual(loadReaderPosition('pdf', 8, 'pdf', storage), continuous);
  assert.deepEqual(loadReaderPosition('text', 1, 'text', storage), text);
});
