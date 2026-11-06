import { recolorPagePixels, type ReaderAppearance, type PdfColorRegion } from './reader';
export interface PixelFrame { width: number; height: number; data: Uint8ClampedArray; linkText?: PdfColorRegion[] }

/** Only text inside actual PDF links receives the dark-page link foreground. */
export function pdfLinkTextRegions(links: readonly { rect: PdfColorRegion }[], text: readonly PdfColorRegion[], scaleX: number, scaleY: number): PdfColorRegion[] {
  return links.flatMap(({ rect }) => text.flatMap(run => {
    const left = Math.max(rect.left, run.left), top = Math.max(rect.top, run.top);
    const right = Math.min(rect.left + rect.width, run.left + run.width), bottom = Math.min(rect.top + rect.height, run.top + run.height);
    return right > left && bottom > top ? [{ left: left * scaleX, top: top * scaleY, width: (right - left) * scaleX, height: (bottom - top) * scaleY }] : [];
  }));
}
export function colorPreview(source: PixelFrame, maxPixels = 500_000): PixelFrame {
  const scale = Math.min(1, Math.sqrt(maxPixels / (source.width * source.height)));
  if (scale === 1) return source;
  const width = Math.max(1, Math.floor(source.width * scale)), height = Math.max(1, Math.floor(source.height * scale));
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const from = (Math.floor(y / scale) * source.width + Math.floor(x / scale)) * 4, to = (y * width + x) * 4;
    data[to] = source.data[from]; data[to + 1] = source.data[from + 1]; data[to + 2] = source.data[from + 2]; data[to + 3] = source.data[from + 3];
  }
  return { width, height, data, ...(source.linkText && { linkText: source.linkText.map(rect => ({ left: rect.left * width / source.width, top: rect.top * height / source.height, width: rect.width * width / source.width, height: rect.height * height / source.height })) }) };
}
export function colorFrame(source: PixelFrame, appearance: ReaderAppearance): PixelFrame {
  return { width: source.width, height: source.height, data: recolorPagePixels(source.data, appearance, undefined, source.width, source.linkText) };
}
