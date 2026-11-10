import { ebookPosition, ebookTypography, type EbookPosition, type EbookTypography } from '../domain/ebook';
const positionKey = (id: string) => 'learn-something.ebook.position.v1.' + encodeURIComponent(id);
const typeKey = 'learn-something.ebook.typography.v1';
const read = (key: string) => { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; } };
const save = (key: string, value: unknown) => { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; } };
export const loadEbookPosition = (id: string, count: number) => ebookPosition(read(positionKey(id)), count);
export const saveEbookPosition = (id: string, position: EbookPosition) => save(positionKey(id), position);
export const loadEbookTypography = () => ebookTypography(read(typeKey));
export const saveEbookTypography = (value: EbookTypography) => save(typeKey, ebookTypography(value));
