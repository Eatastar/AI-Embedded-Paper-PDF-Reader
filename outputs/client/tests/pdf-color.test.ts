import test from 'node:test';
import assert from 'node:assert/strict';
import { PdfColorProcessor } from '../src/adapters/pdf-color';
import { colorFrame, colorPreview, pdfLinkTextRegions, type PixelFrame } from '../src/domain/pdf-color';
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

test('dark PDF links adapt the whole glyph and every white-matted edge, even without a neighboring solid stroke', () => {
  const pixels = [[255,255,255,255], [0,0,255,255], [255,255,255,255], [180,180,255,200], [244,244,255,255], [252,252,255,255], [255,255,255,255], [0,0,255,255], [235,242,224,255]];
  const source: PixelFrame = { width: pixels.length, height: 1, data: new Uint8ClampedArray(pixels.flat()), linkText: [{ left: 0, top: 0, width: 6, height: 1 }] };
  const snapshot = source.data.slice();
  for (const appearance of [readerAppearance({ ...DEFAULT_READER_APPEARANCE, preset: 'dark' }), readerAppearance({ preset: 'custom', paper: '#101820', ink: '#e8e1d5', preserveColors: true })]) {
    const frame = colorFrame(source, appearance), solid = [...frame.data.slice(4, 7)];
    assert.ok(readerContrast(appearance.paper, '#' + solid.map(v => v.toString(16).padStart(2, '0')).join('')) >= 4.5, 'The adapted link remains readable on the actual paper color');
    assert.ok(solid[0] > 100 && solid[1] > 150, 'Deep source blue becomes a soft light blue');
    const paper = [...frame.data.slice(0, 3)];
    for (const index of [3, 4, 5]) {
      const coverage = 1 - pixels[index][0] / 255;
      assert.deepEqual([...frame.data.slice(index * 4, index * 4 + 3)], paper.map((value, channel) => Math.round(value + (solid[channel] - value) * coverage)), 'All edge coverage blends into the same paper and link color, without a white halo');
      assert.equal(frame.data[index * 4 + 3], pixels[index][3]);
    }
    assert.deepEqual([...frame.data.slice(28)], pixels.slice(7).flat(), 'The blue figure and pastel image pixels outside text links retain their exact source colors');
  }
  assert.deepEqual(source.data, snapshot);
  assert.deepEqual(colorFrame(source, { ...DEFAULT_READER_APPEARANCE, preset: 'original' }).data, snapshot);
  assert.deepEqual(colorFrame(source, DEFAULT_READER_APPEARANCE).data, colorFrame({ ...source, linkText: [] }, DEFAULT_READER_APPEARANCE).data, 'Light paper retains the existing source-color rendering');
  const medium = readerAppearance({ preset: 'custom', paper: '#808080', ink: '#888888', preserveColors: true });
  const mediumLink = [...colorFrame(source, medium).data.slice(4, 7)];
  assert.ok(readerContrast(medium.paper, '#' + mediumLink.map(v => v.toString(16).padStart(2, '0')).join('')) >= 4.5, 'A medium custom paper also receives a readable foreground when the chosen ink is too close to its background');
});

test('link recoloring intersects extracted text, scales with preview pixels and excludes image-only links', () => {
  const links = [{ rect: { left: 10, top: 10, width: 30, height: 20 } }, { rect: { left: 100, top: 100, width: 80, height: 80 } }];
  const text = [{ left: 20, top: 5, width: 60, height: 20 }];
  assert.deepEqual(pdfLinkTextRegions(links, text, 2, 3), [{ left: 40, top: 30, width: 40, height: 45 }]);
  assert.deepEqual(pdfLinkTextRegions(links, [], 2, 2), []);
  const source: PixelFrame = { width: 100, height: 100, data: new Uint8ClampedArray(40000).fill(255), linkText: [{ left: 20, top: 40, width: 10, height: 20 }] };
  const preview = colorPreview(source, 2500);
  assert.deepEqual(preview.linkText, [{ left: 10, top: 20, width: 5, height: 10 }]);
  assert.deepEqual(source.linkText, [{ left: 20, top: 40, width: 10, height: 20 }]);
});

test('worker rendering and yielding fallback retain link geometry across chunk boundaries', async () => {
  const source: PixelFrame = { width: 64, height: 1030, data: new Uint8ClampedArray(64 * 1030 * 4).fill(255), linkText: [{ left: 2, top: 1022, width: 4, height: 5 }] };
  for (let row = 1022; row < 1027; row++) source.data.set([180,180,255,200, 0,0,255,255], (row * 64 + 3) * 4);
  const appearance = readerAppearance({ ...DEFAULT_READER_APPEARANCE, preset: 'dark' }), expected = colorFrame(source, appearance);
  const worker = new FakeWorker(), threaded = new PdfColorProcessor(() => worker as unknown as Worker), pending = threaded.prepare(source, appearance);
  assert.deepEqual(worker.source.linkText, source.linkText);
  worker.complete(); assert.deepEqual((await pending)?.data, expected.data); threaded.dispose();
  const fallback = new PdfColorProcessor(() => { throw Error('synthetic Worker unavailable'); });
  assert.deepEqual((await fallback.prepare(source, appearance))?.data, expected.data); fallback.dispose();
});

test('scroll tracking locates the same nearest page with logarithmic measurements in a 5000-page reader', () => {
  const rects = Array.from({ length: 5000 }, (_, pageIndex) => ({ pageIndex, top: pageIndex * 1024, bottom: pageIndex * 1024 + 1000 }));
  for (const focus of [-10, 500, 1007, 1017, 2387876, 5119999]) {
    let measurements = 0;
    const index = readerPageAtFocus(rects.length, i => { measurements++; return rects[i]; }, focus);
    assert.equal(index, activeReaderPage(rects, focus)); assert.ok(measurements <= 16);
  }
});
