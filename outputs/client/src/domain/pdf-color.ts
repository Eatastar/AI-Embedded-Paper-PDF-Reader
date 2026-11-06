import { recolorPagePixels, type ReaderAppearance } from './reader';
export interface PixelFrame { width: number; height: number; data: Uint8ClampedArray }
export function colorPreview(source: PixelFrame, maxPixels = 500_000): PixelFrame {
  const scale = Math.min(1, Math.sqrt(maxPixels / (source.width * source.height)));
  if (scale === 1) return source;
  const width = Math.max(1, Math.floor(source.width * scale)), height = Math.max(1, Math.floor(source.height * scale));
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const from = (Math.floor(y / scale) * source.width + Math.floor(x / scale)) * 4, to = (y * width + x) * 4;
    data[to] = source.data[from]; data[to + 1] = source.data[from + 1]; data[to + 2] = source.data[from + 2]; data[to + 3] = source.data[from + 3];
  }
  return { width, height, data };
}
export function colorFrame(source: PixelFrame, appearance: ReaderAppearance): PixelFrame {
  return { width: source.width, height: source.height, data: recolorPagePixels(source.data, appearance, undefined, source.width) };
}
