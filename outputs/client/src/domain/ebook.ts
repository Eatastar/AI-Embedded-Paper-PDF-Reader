import type { DocumentKind } from './types';

export const EBOOK_LIMITS = {
  entries: 20_000, expandedBytes: 512 * 1024 * 1024,
  entryBytes: 24 * 1024 * 1024, chapterBytes: 8 * 1024 * 1024,
  chapterResources: 48 * 1024 * 1024, mobiTextBytes: 32 * 1024 * 1024,
} as const;

/** Check source bytes before invoking a parser, including legacy PalmDoc DRM. */
export function assertEbookSignature(bytes: Uint8Array, kind: DocumentKind): void {
  if (kind === 'epub') {
    if (bytes.length < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b || bytes[2] !== 3 || bytes[3] !== 4) throw new Error('这不是有效的 EPUB 文件。');
    return;
  }
  if (kind !== 'mobi' && kind !== 'azw3') throw new Error('不支持的电子书格式。');
  if (bytes.length < 94 || new TextDecoder().decode(bytes.subarray(60, 68)) !== 'BOOKMOBI') throw new Error('这不是有效的 MOBI/AZW3 文件。');
  const data = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = data.getUint16(76), tableEnd = 78 + count * 8;
  if (count < 2 || tableEnd > bytes.length) throw new Error('电子书记录表已损坏。');
  let previous = tableEnd - 1;
  for (let i = 0; i < count; i++) {
    const offset = data.getUint32(78 + i * 8);
    if (offset <= previous || offset >= bytes.length) throw new Error('电子书记录表已损坏。');
    previous = offset;
  }
  const start = data.getUint32(78);
  if (start + 248 > bytes.length || new TextDecoder().decode(bytes.subarray(start + 16, start + 20)) !== 'MOBI') throw new Error('电子书头信息已损坏。');
  if (data.getUint16(start + 12) !== 0) throw new Error('这本电子书受 DRM 保护，请使用无 DRM 的文件。');
  if (data.getUint32(start + 4) > EBOOK_LIMITS.mobiTextBytes) throw new Error('MOBI 解压文字过大，请先转换为 EPUB。');
}

export interface EbookTypography { fontSize: number; lineHeight: number; width: number }
export const DEFAULT_EBOOK_TYPOGRAPHY: EbookTypography = { fontSize: 19, lineHeight: 1.8, width: 800 };
export function ebookTypography(value: unknown): EbookTypography {
  const v = value && typeof value === 'object' ? value as Partial<EbookTypography> : {};
  const n = (x: unknown, min: number, max: number, fallback: number) => typeof x === 'number' && Number.isFinite(x) ? Math.max(min, Math.min(max, x)) : fallback;
  return { fontSize: n(v.fontSize, 12, 36, 19), lineHeight: n(v.lineHeight, 1.2, 2.6, 1.8), width: n(v.width, 400, 1200, 800) };
}

export interface EbookPosition { chapter: number; block: number; offset: number; fraction: number }
export function ebookPosition(value: unknown, count: number): EbookPosition {
  const v = value && typeof value === 'object' ? value as Partial<EbookPosition> : {};
  const n = (x: unknown, max: number) => typeof x === 'number' && Number.isFinite(x) ? Math.max(0, Math.min(max, x)) : 0;
  return { chapter: Math.floor(n(v.chapter, Math.max(0, count - 1))), block: Math.floor(n(v.block, 1_000_000)), offset: n(v.offset, 1), fraction: n(v.fraction, 1) };
}

export const safeEbookEntry = (name: string) => Boolean(name) && !name.includes('\\') && !name.startsWith('/') && !/^[a-z]+:/i.test(name) && !name.split('/').includes('..') && !name.includes('\0');

/** Avoid allocating enormous raster images from a tiny compressed book entry. */
export function assertEbookImageHeader(bytes: Uint8Array): number {
  const data = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let width = 0, height = 0;
  if (bytes.length >= 24 && data.getUint32(0) === 0x89504e47 && data.getUint32(4) === 0x0d0a1a0a) { width = data.getUint32(16); height = data.getUint32(20); }
  else if (bytes.length >= 10 && bytes[0] === 71 && bytes[1] === 73 && bytes[2] === 70) { width = data.getUint16(6, true); height = data.getUint16(8, true); }
  else if (bytes.length >= 30 && data.getUint32(0) === 0x52494646 && data.getUint32(8) === 0x57454250 && data.getUint32(12) === 0x56503858) { width = 1 + bytes[24] + bytes[25] * 256 + bytes[26] * 65536; height = 1 + bytes[27] + bytes[28] * 256 + bytes[29] * 65536; }
  else if (bytes.length >= 4 && bytes[0] === 255 && bytes[1] === 216) {
    let at = 2;
    while (at + 8 < bytes.length) {
      if (bytes[at] !== 255) break;
      const marker = bytes[at + 1]; if (marker === 218 || marker === 217) break;
      if ([192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207].includes(marker)) { height = data.getUint16(at + 5); width = data.getUint16(at + 7); break; }
      const length = data.getUint16(at + 2); if (length < 2) break; at += length + 2;
    }
  }
  if (width * height > 40_000_000 || width > 32768 || height > 32768) throw new Error('电子书图片分辨率过大，请先压缩图片。');
  return width * height;
}
