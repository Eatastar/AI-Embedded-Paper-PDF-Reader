import { ebookPosition, ebookTypography, type EbookPosition, type EbookTypography } from '../domain/ebook';
const positionKey = (id: string) => 'learn-something.ebook.position.v1.' + encodeURIComponent(id);
const typeKey = 'learn-something.ebook.typography.v1';
const layoutKey = (id: string) => 'learn-something.ebook.layout.v1.' + encodeURIComponent(id);
const read = (key: string): unknown => { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; } };
const save = (key: string, value: unknown) => { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; } };
export const loadEbookPosition = (id: string, count: number) => ebookPosition(read(positionKey(id)), count);
export const saveEbookPosition = (id: string, position: EbookPosition) => save(positionKey(id), position);
export function loadEbookTypography(id: string): EbookTypography {
  // Keep each book's typography from older versions, including locked layouts.
  const stored = read(layoutKey(id));
  const typography = stored && typeof stored === 'object' && 'typography' in stored ? stored.typography : null;
  return ebookTypography(typography ?? read(typeKey));
}

export function saveEbookTypography(id: string, value: EbookTypography): boolean {
  const typography = ebookTypography(value);
  const saved = save(layoutKey(id), { typography });
  if (saved) save(typeKey, typography);
  return saved;
}
