import type { PdfColorRegion } from './reader';

export interface PdfDetailPlan extends PdfColorRegion { scale: number; pixelWidth: number; pixelHeight: number }
export const PDF_DETAIL_PIXELS = 8_000_000;

export function visiblePdfRegion(page: { width: number; height: number }, visible: PdfColorRegion): PdfColorRegion | null {
  const left = Math.max(0, visible.left), top = Math.max(0, visible.top);
  const right = Math.min(page.width, visible.left + visible.width), bottom = Math.min(page.height, visible.top + visible.height);
  return right > left && bottom > top ? { left, top, width: right - left, height: bottom - top } : null;
}

/** Spend the detail budget on the viewport, rather than on an enlarged whole page. */
export function pdfDetailPlan(page: { width: number; height: number }, visible: PdfColorRegion, pixelRatio: number, maxPixels = PDF_DETAIL_PIXELS): PdfDetailPlan | null {
  if (![page.width, page.height, visible.left, visible.top, visible.width, visible.height, maxPixels].every(Number.isFinite) || page.width <= 0 || page.height <= 0 || maxPixels < 1) return null;
  const region = visiblePdfRegion(page, visible); if (!region) return null;
  const left = Math.max(0, Math.floor(region.left - 96)), top = Math.max(0, Math.floor(region.top - 96));
  const width = Math.min(page.width, Math.ceil(region.left + region.width + 96)) - left;
  const height = Math.min(page.height, Math.ceil(region.top + region.height + 96)) - top;
  const desired = Math.max(2, Math.min(3, Number.isFinite(pixelRatio) && pixelRatio > 0 ? pixelRatio : 1));
  const budget = Math.floor(maxPixels);
  const scale = Math.min(desired, Math.sqrt(budget / (width * height)), budget / width, budget / height);
  return { left, top, width, height, scale, pixelWidth: Math.max(1, Math.floor(width * scale)), pixelHeight: Math.max(1, Math.floor(height * scale)) };
}

export function pdfDetailCovers(plan: PdfDetailPlan | null, region: PdfColorRegion, scale: number): boolean {
  return Boolean(plan && plan.scale >= scale * .98 && plan.left <= region.left && plan.top <= region.top && plan.left + plan.width >= region.left + region.width && plan.top + plan.height >= region.top + region.height);
}
