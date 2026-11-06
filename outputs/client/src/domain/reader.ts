export interface ReaderAppearance {
  preset: 'original' | 'warm' | 'gray' | 'dark' | 'custom';
  paper: string;
  ink: string;
  preserveColors: boolean;
}
export interface ReaderPosition {
  pageIndex: number;
  zoom: number;
  view: 'original' | 'text';
  scrollY: number;
  scrollX: number;
  layout?: 'paged' | 'continuous';
  pageOffset?: number;
}
export const READER_PRESETS = [
  { id: 'original', label: '原色', paper: '#ffffff', ink: '#000000' },
  { id: 'warm', label: '暖黄', paper: '#fff4d6', ink: '#403526' },
  { id: 'gray', label: '浅灰', paper: '#e9e9e5', ink: '#303330' },
  { id: 'dark', label: '深色', paper: '#26282c', ink: '#e4e1d8' },
] as const;
export const DEFAULT_READER_APPEARANCE: ReaderAppearance = { preset: 'warm', paper: '#fff4d6', ink: '#403526', preserveColors: true };
export const isHexColor = (value: unknown): value is string => typeof value === 'string' && /^#[\da-f]{6}$/i.test(value);
export function readerAppearance(value: unknown): ReaderAppearance {
  if (!value || typeof value !== 'object') return { ...DEFAULT_READER_APPEARANCE };
  const candidate = value as Partial<ReaderAppearance>;
  if (!isHexColor(candidate.paper) || !isHexColor(candidate.ink)) return { ...DEFAULT_READER_APPEARANCE };
  const preset = READER_PRESETS.find(item => item.id === candidate.preset);
  return {
    preset: ['original', 'warm', 'gray', 'dark', 'custom'].includes(candidate.preset || '') ? candidate.preset! : 'custom',
    paper: preset?.paper || candidate.paper.toLowerCase(), ink: preset?.ink || candidate.ink.toLowerCase(), preserveColors: candidate.preserveColors !== false,
  };
}
export function readerPosition(value: unknown, pageCount: number, kind: 'pdf' | 'text'): ReaderPosition {
  const candidate = value && typeof value === 'object' ? value as Partial<ReaderPosition> : {};
  const bounded = (v: unknown, min: number, max: number, fallback: number) => typeof v === 'number' && Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : fallback;
  return {
    pageIndex: Math.floor(bounded(candidate.pageIndex, 0, Math.max(0, pageCount - 1), 0)),
    zoom: bounded(candidate.zoom, .5, 2.5, 1),
    view: kind === 'text' || candidate.view === 'text' ? 'text' : 'original',
    scrollY: bounded(candidate.scrollY, 0, 1, 0), scrollX: bounded(candidate.scrollX, 0, 1, 0),
    ...(candidate.layout === 'continuous' ? { layout: 'continuous' as const, pageOffset: bounded(candidate.pageOffset, 0, 1, 0) } : candidate.layout === 'paged' ? { layout: 'paged' as const } : {}),
  };
}
const rgb = (hex: string) => [1, 3, 5].map(start => parseInt(hex.slice(start, start + 2), 16));
export function colorLuminance(hex: string): number {
  const c = rgb(hex).map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
  return c[0] * .2126 + c[1] * .7152 + c[2] * .0722;
}
export function readerContrast(paper: string, ink: string): number {
  const a = colorLuminance(paper), b = colorLuminance(ink);
  return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
}

/** Derive the entire reader chrome from the chosen paper, without a dark/light background jump. */
export function readerTheme(paper: string, ink: string): Record<string, string> {
  const text = readerContrast(paper, ink) >= 4.5 ? ink : colorLuminance(paper) > .179 ? '#000000' : '#ffffff';
  const base = rgb(paper), foreground = rgb(text);
  const mix = (amount: number) => '#' + base.map((value, i) => Math.round(value + (foreground[i] - value) * amount).toString(16).padStart(2, '0')).join('');
  return { '--reader-paper': paper, '--reader-ink': ink, '--ls-paper': paper, '--ls-panel': paper, '--ls-surface': mix(.035), '--ls-code': mix(.065), '--ls-hover': mix(.09), '--ls-border': mix(.19), '--ls-border-strong': mix(.32), '--ls-text': text, '--ls-ink': text, '--ls-muted': mix(.68), '--ls-accent': mix(.82), '--ls-focus': mix(.82), '--ls-danger': colorLuminance(paper) < .179 ? '#ffb3a9' : '#932c23' };
}

/** Recolor a display copy only. Preserve saturated colors and all alpha bytes. */
export function recolorPagePixels(source: Uint8ClampedArray, appearance: ReaderAppearance, destination = new Uint8ClampedArray(source.length), width = 0): Uint8ClampedArray {
  if (destination.length !== source.length || source.length % 4 !== 0 || source.buffer === destination.buffer) throw new Error('A separate RGBA display buffer is required');
  if (appearance.preset === 'original') { destination.set(source); return destination; }
  const paper = rgb(appearance.paper), ink = rgb(appearance.ink);
  for (let i = 0; i < source.length; i += 4) {
    const r = source[i], g = source[i + 1], b = source[i + 2];
    const chroma = Math.max(r, g, b) - Math.min(r, g, b);
    const weight = appearance.preserveColors ? Math.max(0, Math.min(1, (12 - chroma) / 4)) : 1;
    const tone = (r * .2126 + g * .7152 + b * .0722) / 255;
    const originalWeight = 1 - weight;
    destination[i] = r * originalWeight + (ink[0] + (paper[0] - ink[0]) * tone) * weight;
    destination[i + 1] = g * originalWeight + (ink[1] + (paper[1] - ink[1]) * tone) * weight;
    destination[i + 2] = b * originalWeight + (ink[2] + (paper[2] - ink[2]) * tone) * weight;
    destination[i + 3] = source[i + 3];
  }
  // Colored glyph edges were rasterized against white paper. Keeping those
  // blended pixels verbatim creates a white halo on dark paper. Only unmatte
  // pixels next to both white paper and stronger ink of the same hue; uniform
  // pastel figures and colored interiors keep their original RGB values.
  const height = width > 0 ? source.length / 4 / width : 0;
  if (appearance.preserveColors && Number.isInteger(height) && height > 0) {
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4, r = source[i], g = source[i + 1], b = source[i + 2];
      const low = Math.min(r, g, b), high = Math.max(r, g, b), chroma = high - low;
      if (chroma < 8 || low < 16 || high < 230) continue;
      let paperNeighbor = false, inkLow = low;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if ((!dx && !dy) || x + dx < 0 || x + dx >= width || y + dy < 0 || y + dy >= height) continue;
        const j = ((y + dy) * width + x + dx) * 4;
        if (!source[j + 3]) continue;
        const nr = source[j], ng = source[j + 1], nb = source[j + 2], min = Math.min(nr, ng, nb), max = Math.max(nr, ng, nb), c = max - min;
        if (min >= 245 && c <= 8) paperNeighbor = true;
        if (min > 64 || min >= low - 12 || c < Math.max(48, chroma * 1.15)) continue;
        const hueDifference = Math.abs((r - low) / chroma - (nr - min) / c) + Math.abs((g - low) / chroma - (ng - min) / c) + Math.abs((b - low) / chroma - (nb - min) / c);
        if (hueDifference < .35) inkLow = Math.min(inkLow, min);
      }
      if (!paperNeighbor || inkLow === low) continue;
      const whiteCoverage = 1 - (255 - low) / (255 - inkLow);
      destination[i] = r + (paper[0] - 255) * whiteCoverage;
      destination[i + 1] = g + (paper[1] - 255) * whiteCoverage;
      destination[i + 2] = b + (paper[2] - 255) * whiteCoverage;
    }
  }
  return destination;
}
