export const MAX_PDF_BYTES = 150 * 1024 * 1024;
export const MAX_TEXT_BYTES = 25 * 1024 * 1024;
export const MAX_DOCUMENT_PAGES = 5000;
export const MAX_DOCUMENT_TEXT_CHARACTERS = 10_000_000;
export const MAX_TEXT_CHARACTERS = 1_000_000;
export const documentByteLimit = (kind: import('./types').DocumentKind) => kind === 'text' ? MAX_TEXT_BYTES : MAX_PDF_BYTES;
export const documentTextLimit = (kind: import('./types').DocumentKind) => kind === 'text' ? MAX_TEXT_CHARACTERS : MAX_DOCUMENT_TEXT_CHARACTERS;
