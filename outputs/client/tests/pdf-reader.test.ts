import test from 'node:test';
import assert from 'node:assert/strict';
import type { PDFPageProxy, PageViewport } from 'pdfjs-dist';
import { bindPdfZoom } from '../src/adapters/pdf-zoom';
import { paintPdfFrame, startPdfFrame } from '../src/adapters/pdf-frame';
import { DEFAULT_READER_APPEARANCE, readerAppearance } from '../src/domain/reader';
import { pdfAnchorScrollDelta, pdfPageSize, pdfWheelZoom, pdfZoomAnchor } from '../src/domain/pdf-zoom';

const deferred = <T,>() => { let resolve!: (value: T) => void, reject!: (reason: unknown) => void; const promise = new Promise<T>((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const image = (width: number, height: number, data = new Uint8ClampedArray(width * height * 4)) => ({ width, height, data }) as ImageData;
class Canvas {
  private w = 1; private h = 1;
  data = new Uint8ClampedArray([30, 30, 30, 255]);
  changes: string[] = []; paints: number[][] = []; failPreparation = false;
  get width() { return this.w; } set width(value: number) { this.w = value; this.changes.push('resize'); }
  get height() { return this.h; } set height(value: number) { this.h = value; this.changes.push('resize'); }
  getContext() { return {
    createImageData: (w: number, h: number) => { if (this.failPreparation) throw Error('simulated-allocation-failure'); return image(w, h); },
    getImageData: () => image(this.w, this.h, this.data.slice()),
    putImageData: (value: ImageData) => { this.data = value.data.slice(); this.paints.push([...value.data]); this.changes.push('paint'); },
  }; }
}
function frameFixture() {
  const raster = deferred<void>(), content = deferred<any>(), textReady = deferred<void>();
  const source = new Canvas(), text = { className: '' };
  let renderingCanvas: Canvas | undefined, cancels = 0, textCancels = 0;
  const doc = { createElement: (tag: string) => tag === 'canvas' ? source : text } as unknown as Document;
  const viewport = { width: 3, height: 1, scale: 1, userUnit: 1 } as PageViewport;
  const page = { render(options: any) { renderingCanvas = options.canvas; assert.equal(options.background, '#ffffff'); source.data = new Uint8ClampedArray(12).fill(255); return { promise: raster.promise, cancel() { cancels++; } }; }, getTextContent: () => content.promise } as unknown as PDFPageProxy;
  const library = { TextLayer: class { render() { return textReady.promise; } cancel() { textCancels++; textReady.reject(new DOMException('cancelled', 'AbortError')); } } } as any;
  return { source, raster, content, textReady, viewport, text, get renderingCanvas() { return renderingCanvas; }, get cancels() { return cancels; }, get textCancels() { return textCancels; }, start: () => startPdfFrame(page, library, viewport, 1, doc) };
}

test('白底渐进绘制和文字提取全部在后台完成，显示页只收到换色后的完整帧', async () => {
  const fixture = frameFixture(), visible = new Canvas(), previous = visible.data.slice(), job = fixture.start();
  assert.equal(fixture.renderingCanvas, fixture.source); assert.notEqual(fixture.renderingCanvas, visible);
  fixture.content.resolve({ items: [] }); await Promise.resolve();
  assert.deepEqual(visible.data, previous); assert.equal(visible.changes.length, 0);
  fixture.source.data = new Uint8ClampedArray([255,255,255,255, 0,0,0,255, 230,35,45,255]); fixture.raster.resolve();
  let done = false; void job.promise.then(() => { done = true; }); await Promise.resolve();
  assert.equal(done, false, 'Even a finished raster cannot publish while text is incomplete');
  fixture.textReady.resolve(); const frame = await job.promise;
  assert.equal(fixture.source.width, 1); assert.equal(fixture.source.height, 1);
  paintPdfFrame(visible as unknown as HTMLCanvasElement, frame.original, DEFAULT_READER_APPEARANCE, false);
  assert.equal(visible.paints.length, 1); assert.deepEqual([...visible.data.slice(0, 4)], [255,244,214,255]);
  assert.deepEqual([...visible.data.slice(4, 8)], [64,53,38,255]);
  assert.deepEqual([...visible.data.slice(8)], [230,35,45,255]);
  assert.equal(frame.text, fixture.text); assert.equal(frame.width, 3);
});

test('等待时切换深色，发布时使用最新配色；原色仅在明确要求时显示', () => {
  const canvas = new Canvas(), original = image(1, 1, new Uint8ClampedArray([255,255,255,255]));
  const dark = readerAppearance({ preset: 'dark', paper: '#26282c', ink: '#e4e1d8' });
  paintPdfFrame(canvas as any, original, dark, false); assert.deepEqual([...canvas.data], [38,40,44,255]);
  paintPdfFrame(canvas as any, original, dark, true); assert.deepEqual([...canvas.data], [255,255,255,255]);
  paintPdfFrame(canvas as any, original, DEFAULT_READER_APPEARANCE, false); assert.deepEqual([...canvas.data], [255,244,214,255]);
  assert.deepEqual([...original.data], [255,255,255,255]);
});

test('换色缓冲分配失败不会先清空或改写当前显示页', () => {
  const canvas = new Canvas(), previous = canvas.data.slice(); canvas.failPreparation = true;
  assert.throws(() => paintPdfFrame(canvas as any, image(300, 400), DEFAULT_READER_APPEARANCE, false), /allocation/);
  assert.deepEqual(canvas.data, previous); assert.equal(canvas.width, 1); assert.equal(canvas.height, 1); assert.deepEqual(canvas.changes, []);
});

test('快速翻页或缩放取消旧任务，迟到的文字不会发布或创建新文字层', async () => {
  const fixture = frameFixture(), job = fixture.start(); job.cancel();
  const rejected = assert.rejects(job.promise, /cancelled/);
  fixture.content.resolve({ items: [] }); fixture.raster.resolve(); await rejected;
  assert.ok(fixture.cancels >= 1); assert.equal(fixture.textCancels, 0);
});

test('文字层正在构建时取消，会同时停止绘制和文字任务', async () => {
  const fixture = frameFixture(), job = fixture.start();
  fixture.content.resolve({ items: [] }); await Promise.resolve();
  const rejected = assert.rejects(job.promise, /cancelled/); job.cancel(); fixture.raster.resolve(); await rejected;
  assert.ok(fixture.cancels >= 1); assert.ok(fixture.textCancels >= 1);
});

function zoomFixture() {
  const target = Object.assign(new EventTarget(), { clientHeight: 600 });
  const frames = new Map<number, FrameRequestCallback>(), changes: { zoom: number; point: { x: number; y: number } }[] = [];
  let zoom = 1, sequence = 0;
  const dispose = bindPdfZoom(target, { zoom: () => zoom, onZoom: (value, point) => { zoom = value; changes.push({ zoom, point }); }, requestFrame: callback => { frames.set(++sequence, callback); return sequence; }, cancelFrame: id => { frames.delete(id); } });
  const wheel = (deltaY: number, ctrlKey = true, deltaMode = 0, x = 250, y = 300) => { const event = Object.assign(new Event('wheel', { cancelable: true }), { deltaY, ctrlKey, deltaMode, clientX: x, clientY: y }); target.dispatchEvent(event); return event; };
  const flush = () => { for (const [id, callback] of frames) { frames.delete(id); callback(1); } };
  return { target, frames, changes, dispose, wheel, flush };
}

test('触控板双指滑动不被拦截，双指缩放事件阻止整窗缩放且只更新 PDF', () => {
  const f = zoomFixture();
  assert.equal(f.wheel(-40, false).defaultPrevented, false); f.flush(); assert.equal(f.changes.length, 0);
  assert.equal(f.wheel(-40).defaultPrevented, true); f.flush(); assert.ok(f.changes[0].zoom > 1);
  assert.deepEqual(f.changes[0].point, { x: 250, y: 300 }); f.dispose();
});

test('同一帧合并 100 个微小手势，保留累积缩放和最新指针位置', () => {
  const f = zoomFixture();
  for (let i = 0; i < 100; i++) f.wheel(-.01, true, 0, i, 200);
  assert.equal(f.frames.size, 1); f.flush(); assert.equal(f.changes.length, 1);
  assert.ok(Math.abs(f.changes[0].zoom - Math.exp(.003)) < 1e-12);
  assert.deepEqual(f.changes[0].point, { x: 99, y: 200 }); f.dispose();
});

test('离开 PDF 或关闭阅读器后，待处理的手势和监听均取消', () => {
  const f = zoomFixture(); f.wheel(-40); f.dispose(); f.flush();
  assert.equal(f.changes.length, 0); assert.equal(f.wheel(-40).defaultPrevented, false);
});

test('像素、行和页滚动单位均可缩放，限制在 50%–250%，正反向平滑抵消', () => {
  assert.equal(pdfWheelZoom(1, -16, 0, 600), pdfWheelZoom(1, -1, 1, 600));
  assert.equal(pdfWheelZoom(1, 60, 0, 600), pdfWheelZoom(1, .1, 2, 600));
  assert.equal(pdfWheelZoom(2.5, -500, 0, 600), 2.5); assert.equal(pdfWheelZoom(.5, 500, 0, 600), .5);
  assert.equal(pdfWheelZoom(1, Infinity, 0, 600), 1);
  assert.ok(Math.abs(pdfWheelZoom(pdfWheelZoom(1, -50, 0, 600), 50, 0, 600) - 1) < 1e-12);
});

test('从居中页面放大到可横向滚动时，滚动补偿仍保持手势下的同一原文位置', () => {
  const viewport = { left: 100, top: 80, width: 800, height: 600 };
  const anchor = pdfZoomAnchor({ left: 200, top: -220, width: 600, height: 1200 }, viewport, 500, 380);
  assert.deepEqual(anchor, { x: .5, y: .5, viewportX: 400, viewportY: 300 });
  const delta = pdfAnchorScrollDelta(anchor, { left: 120, top: -220, width: 1200, height: 2400 }, viewport);
  assert.deepEqual(delta, { x: 220, y: 600 });
  const moved = pdfAnchorScrollDelta(anchor, { left: 120 - delta.x, top: -220 - delta.y, width: 1200, height: 2400 }, viewport);
  assert.deepEqual(moved, { x: 0, y: 0 });
  assert.deepEqual(pdfPageSize({ width: 600, height: 800 }, 640, 1.5), { width: 900, height: 1200, scale: 1.5 });
});
