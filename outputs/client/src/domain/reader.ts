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

/** Recolor a display copy only. Preserve saturated colors and all alpha bytes. */
export function recolorPagePixels(source: Uint8ClampedArray, appearance: ReaderAppearance, destination = new Uint8ClampedArray(source.length)): Uint8ClampedArray {
  if (destination.length !== source.length || source.length % 4 !== 0 || source.buffer === destination.buffer) throw new Error('A separate RGBA display buffer is required');
  if (appearance.preset === 'original') { destination.set(source); return destination; }
  const paper = rgb(appearance.paper), ink = rgb(appearance.ink);
  for (let i = 0; i < source.length; i += 4) {
    const r = source[i], g = source[i + 1], b = source[i + 2];
    const chroma = Math.max(r, g, b) - Math.min(r, g, b);
    const weight = appearance.preserveColors ? Math.max(0, Math.min(1, (12 - chroma) / 4)) : 1;
    const tone = (r * .2126 + g * .7152 + b * .0722) / 255;
    for (let c = 0; c < 3; c++) destination[i + c] = source[i + c] * (1 - weight) + (ink[c] + (paper[c] - ink[c]) * tone) * weight;
    destination[i + 3] = source[i + 3];
  }
  return destination;
}
