import { colorPreview, colorFrame, type PixelFrame } from '../domain/pdf-color';
import type { ReaderAppearance } from '../domain/reader';
let source: PixelFrame | undefined, preview: PixelFrame | undefined;
addEventListener('message', (event: MessageEvent<{ source?: PixelFrame; id?: number; appearance?: ReaderAppearance; preview?: boolean }>) => {
  const input = event.data;
  if (input.source) { source = input.source; preview = colorPreview(source); return; }
  if (!source || !preview || !input.appearance) return;
  const result = colorFrame(input.preview ? preview : source, input.appearance);
  postMessage({ id: input.id, ...result }, { transfer: [result.data.buffer] });
});
