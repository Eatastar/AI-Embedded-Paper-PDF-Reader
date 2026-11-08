import type { PDFDocumentProxy } from 'pdfjs-dist';
import { FIGURE_LIMITS, figureImageKey, figureSourceKey, paintFigureStrokes, readFigure, type FigureSelection, type FigureStroke } from '../domain/figure';
import { FigureCache } from '../domain/figure-cache';
import { acquirePdfPage, pdfRenderQueue } from './pdf-resources';

export interface FigureImage { blob: Blob; width: number; height: number }
export interface PreparedFigureImage extends FigureImage { key: string }
export const figureCache = new FigureCache<FigureImage>();
const pending = new Map<string, { sourceId: string; controller: AbortController; promise: Promise<FigureImage>; users: number; settled: boolean }>();
export const formatFigureBytes = (bytes: number) => bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(2)} MB` : bytes >= 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${bytes} B`;
const abort = () => new DOMException('Aborted', 'AbortError');
const encode = (canvas: HTMLCanvasElement, mime: string, quality?: number) => new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(Error('图片编码失败，请重新框选。')), mime, quality));
async function encoded(canvas: HTMLCanvasElement, signal: AbortSignal): Promise<FigureImage> {
  signal.throwIfAborted();
  let blob = await encode(canvas, 'image/png'); signal.throwIfAborted();
  if (blob.size > FIGURE_LIMITS.imageBytes) for (const [mime, quality] of [['image/webp', .88], ['image/jpeg', .86]] as const) { const candidate = await encode(canvas, mime, quality); signal.throwIfAborted(); if (candidate.size < blob.size) blob = candidate; if (blob.size <= FIGURE_LIMITS.imageBytes) break; }
  if (blob.size > FIGURE_LIMITS.imageBytes) throw Error('压缩后图片仍超过 1 MB，请框选更小的区域以保持文字清晰。');
  return { blob, width: canvas.width, height: canvas.height };
}
async function renderBase(pdf: PDFDocumentProxy, input: FigureSelection, signal: AbortSignal): Promise<FigureImage> {
  const figure = readFigure(input); signal.throwIfAborted();
  const lease = await acquirePdfPage(pdf, figure.pageNumber, signal);
  try {
  const page = lease.page; signal.throwIfAborted();
  const base = page.getViewport({ scale: 1 }), r = figure.rect;
  const cropWidth = base.width * r.width, cropHeight = base.height * r.height;
  const scale = Math.min(3, (FIGURE_LIMITS.edge - 2) / Math.max(cropWidth, cropHeight), Math.sqrt((FIGURE_LIMITS.pixels - 4000) / (cropWidth * cropHeight)));
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.min(FIGURE_LIMITS.edge, Math.ceil(viewport.width * r.width)));
  canvas.height = Math.max(1, Math.min(FIGURE_LIMITS.edge, Math.ceil(viewport.height * r.height)));
  if (canvas.width * canvas.height > FIGURE_LIMITS.pixels) { canvas.width = 0; canvas.height = 0; throw Error('图片选区过大，请缩小选区。'); }
  const context = canvas.getContext('2d', { alpha: false }); if (!context) { canvas.width = 0; canvas.height = 0; throw Error('图片处理不可用。'); }
  const task = page.render({ canvas, canvasContext: context, viewport, transform: [1, 0, 0, 1, -viewport.width * r.x, -viewport.height * r.y], background: '#ffffff' });
  const cancel = () => task.cancel(); signal.addEventListener('abort', cancel, { once: true });
  try { await task.promise; return await encoded(canvas, signal); }
  finally { signal.removeEventListener('abort', cancel); canvas.width = 0; canvas.height = 0; }
  } finally { lease.release(); }
}
export async function getFigureBase(pdf: PDFDocumentProxy, figure: FigureSelection, signal: AbortSignal): Promise<FigureImage> {
  signal.throwIfAborted(); const key = figureSourceKey(figure), cached = figureCache.get(key); if (cached) return cached;
  let entry = pending.get(key);
  if (!entry || entry.controller.signal.aborted) {
    const controller = new AbortController();
    entry = { sourceId: figure.documentId, controller, users: 0, settled: false, promise: Promise.resolve(null as unknown as FigureImage) };
    const current = entry;
    current.promise = pdfRenderQueue(pdf).enqueue(() => renderBase(pdf, figure, controller.signal), controller.signal).then(image => { controller.signal.throwIfAborted(); figureCache.set(key, figure.documentId, image); return image; }).finally(() => { current.settled = true; if (pending.get(key) === current) pending.delete(key); });
    pending.set(key, current);
  }
  const current = entry; current.users++;
  return new Promise<FigureImage>((resolve, reject) => {
    let done = false;
    const finish = () => { if (done) return false; done = true; signal.removeEventListener('abort', cancelled); if (--current.users === 0 && !current.settled) current.controller.abort(); return true; };
    const cancelled = () => { if (finish()) reject(abort()); };
    signal.addEventListener('abort', cancelled, { once: true });
    if (signal.aborted) cancelled();
    current.promise.then(value => { if (finish()) resolve(value); }, error => { if (finish()) reject(signal.aborted ? abort() : error); });
  });
}
export async function prepareFigureImage(base: FigureImage, figure: FigureSelection, strokes: FigureStroke[], signal: AbortSignal): Promise<PreparedFigureImage> {
  const key = figureImageKey(figure, strokes); signal.throwIfAborted();
  if (!strokes.length) return { ...base, key };
  const bitmap = await createImageBitmap(base.blob), canvas = document.createElement('canvas');
  try { signal.throwIfAborted(); canvas.width = base.width; canvas.height = base.height; const context = canvas.getContext('2d', { alpha: false }); if (!context) throw Error('图片处理不可用。'); context.drawImage(bitmap, 0, 0); paintFigureStrokes(context, strokes, canvas.width, canvas.height); return { ...await encoded(canvas, signal), key }; }
  finally { bitmap.close(); canvas.width = 0; canvas.height = 0; }
}
export function clearFigureCache(sourceId?: string) {
  for (const [key, entry] of pending) if (!sourceId || entry.sourceId === sourceId) { entry.controller.abort(); pending.delete(key); }
  if (sourceId) figureCache.dropSource(sourceId); else figureCache.clear();
}
export function figureDataURL(image: FigureImage, signal: AbortSignal): Promise<string> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    const cancel = () => reader.abort(); signal.addEventListener('abort', cancel, { once: true });
    const finish = () => signal.removeEventListener('abort', cancel);
    reader.onload = () => { finish(); signal.aborted ? reject(abort()) : resolve(String(reader.result)); };
    reader.onerror = () => { finish(); reject(Error('无法读取提问图片，请重新框选。')); };
    reader.onabort = () => { finish(); reject(abort()); };
    reader.readAsDataURL(image.blob);
  });
}
