export const MAX_PDF_BYTES = 150 * 1024 * 1024;
export const MAX_TEXT_BYTES = 25 * 1024 * 1024;
export const MAX_DOCUMENT_PAGES = 5000;
export const MAX_DOCUMENT_TEXT_CHARACTERS = 10_000_000;
export const MAX_TEXT_CHARACTERS = 1_000_000;
export const documentByteLimit = (kind: 'pdf' | 'text') => kind === 'pdf' ? MAX_PDF_BYTES : MAX_TEXT_BYTES;
export const documentTextLimit = (kind: 'pdf' | 'text') => kind === 'pdf' ? MAX_DOCUMENT_TEXT_CHARACTERS : MAX_TEXT_CHARACTERS;
