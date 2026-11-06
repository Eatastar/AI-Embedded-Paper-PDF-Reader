import test from 'node:test';
import assert from 'node:assert/strict';
import { PdfColorProcessor } from '../src/adapters/pdf-color';
import { colorFrame, colorPreview, type PixelFrame } from '../src/domain/pdf-color';
import { DEFAULT_READER_APPEARANCE, readerAppearance, readerContrast, readerTheme } from '../src/domain/reader';
import { activeReaderPage, readerPageAtFocus } from '../src/domain/reader-navigation';
class FakeWorker {
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror = null; terminated = false;
  messages: any[] = []; source!: PixelFrame;
  postMessage(message: any) { this.messages.push(message); if (message.source) this.source = message.source; }
  complete() { const job = this.messages.filter(m => m.id).at(-1)!; this.onmessage?.({ data: { id: job.id, ...colorFrame(job.preview ? colorPreview(this.source) : this.source, job.appearance) } }); }
  terminate() { this.terminated = true; }
}
test('dragged colors keep one active job and only the newest waiting color, without modifying original pixels', async () => {
  const worker = new FakeWorker(), processor = new PdfColorProcessor(() => worker as unknown as Worker);
  const source = { width: 2, height: 1, data: new Uint8ClampedArray([255,255,255,255, 0,0,0,255]) }, original = source.data.slice();
  const first = processor.prepare(source, DEFAULT_READER_APPEARANCE, true);
  const second = processor.prepare(source, { ...DEFAULT_READER_APPEARANCE, paper: '#abcdef' }, true);
  const latest = processor.prepare(source, { ...DEFAULT_READER_APPEARANCE, paper: '#112233' }, true);
  assert.equal(await second, null); worker.complete(); assert.equal(await first, null);
  assert.equal(worker.messages.filter(m => m.id).length, 2); assert.equal(worker.messages.filter(m => m.source).length, 1);
  worker.complete(); const result = await latest;
  assert.deepEqual([...result!.data.slice(0, 3)], [17, 34, 51]); assert.deepEqual(source.data, original);
  processor.dispose(); assert.equal(worker.terminated, true); assert.equal(await processor.prepare(source, DEFAULT_READER_APPEARANCE), null);
});
test('preview is bounded and worker-unavailable fallback yields to input before completing', async () => {
  const source = { width: 1000, height: 1000, data: new Uint8ClampedArray(4_000_000).fill(255) };
  const preview = colorPreview(source); assert.ok(preview.width * preview.height <= 500000); assert.equal(source.data[0], 255);
  const processor = new PdfColorProcessor(() => { throw new Error('synthetic Worker unavailable'); });
  let ticked = false; setTimeout(() => { ticked = true; }, 0);
  const frame = await processor.prepare(source, DEFAULT_READER_APPEARANCE);
  assert.equal(ticked, true); assert.equal(frame!.data.length, source.data.length); assert.deepEqual([...frame!.data.slice(0, 4)], [255, 244, 214, 255]); processor.dispose();
});
test('reader chrome follows arbitrary paper colors and retains readable controls', () => {
  for (const paper of ['#b77b7b', '#1c2637', '#cbe0c5', '#fff4d6']) {
    const theme = readerTheme(paper, '#000000');
    assert.equal(theme['--ls-panel'], paper); assert.equal(theme['--reader-paper'], paper); assert.ok(readerContrast(paper, theme['--ls-text']) >= 4.5);
    assert.notEqual(theme['--ls-code'], '#1c1d20'); assert.notEqual(theme['--ls-border'], theme['--ls-panel']);
  }
});

test('blue citation antialiasing loses its white matte on dark paper while flat colored figures remain intact', async () => {
  const colors = [[255,255,255,255], [180,180,255,255], [0,0,255,255], [235,242,224,255]];
  const source: PixelFrame = { width: 3, height: 3, data: new Uint8ClampedArray([colors[0],colors[0],colors[0], colors[0],colors[1],colors[2], colors[0],colors[0],colors[0]].flat()) };
  const snapshot = source.data.slice(), dark = readerAppearance({ ...DEFAULT_READER_APPEARANCE, preset: 'dark' });
  const frame = colorFrame(source, dark), edge = [...frame.data.slice(16, 20)];
  assert.ok(edge[0] < 40 && edge[1] < 40 && edge[2] < 120, 'A white-backed edge must blend into dark paper, rather than remain pale');
  assert.deepEqual([...frame.data.slice(20, 24)], colors[2]); assert.deepEqual(source.data, snapshot);
  const figure = { width: 3, height: 3, data: new Uint8ClampedArray(Array.from({ length: 9 }, () => colors[3]).flat()) };
  assert.deepEqual(colorFrame(figure, dark).data, figure.data);
  const fallback = new PdfColorProcessor(() => { throw Error('synthetic Worker unavailable'); });
  assert.deepEqual((await fallback.prepare(source, dark))?.data, frame.data); fallback.dispose();
});

test('scroll tracking locates the same nearest page with logarithmic measurements in a 5000-page reader', () => {
  const rects = Array.from({ length: 5000 }, (_, pageIndex) => ({ pageIndex, top: pageIndex * 1024, bottom: pageIndex * 1024 + 1000 }));
  for (const focus of [-10, 500, 1007, 1017, 2387876, 5119999]) {
    let measurements = 0;
    const index = readerPageAtFocus(rects.length, i => { measurements++; return rects[i]; }, focus);
    assert.equal(index, activeReaderPage(rects, focus)); assert.ok(measurements <= 16);
  }
});
