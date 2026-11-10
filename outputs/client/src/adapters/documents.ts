import type { PDFDocumentProxy } from 'pdfjs-dist';
import { isEbookKind, type DocumentAttachment, type DocumentKind, type DocumentPage } from '../domain/types';
import { MAX_PDF_BYTES, MAX_DOCUMENT_PAGES, MAX_DOCUMENT_TEXT_CHARACTERS, MAX_TEXT_CHARACTERS, documentByteLimit } from '../domain/document-limits';

export const MAX_DOCUMENT_BYTES = MAX_PDF_BYTES;
export { MAX_DOCUMENT_PAGES, MAX_DOCUMENT_TEXT_CHARACTERS };
export const DOCUMENT_ACCEPT = '.pdf,.epub,.mobi,.azw3,.txt,.md,.markdown,application/pdf,application/epub+zip,text/plain,text/markdown';
export const READER_ACCEPT = '.pdf,.epub,.mobi,.azw3,application/pdf,application/epub+zip';

export class DocumentImportError extends Error {
  constructor(message: string) { super(message); this.name = 'DocumentImportError'; }
}

let pdfJsPromise: Promise<typeof import('pdfjs-dist')> | undefined;

export async function loadPdfJs() {
  pdfJsPromise ??= (async () => {
    const [library, worker] = await Promise.all([
      import('pdfjs-dist'),
      import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
    ]);
    library.GlobalWorkerOptions.workerSrc = worker.default;
    return library;
  })();
  return pdfJsPromise;
}

/** Opens local bytes only. PDF actions, scripting and external links are not run. */
export async function loadPdfDocument(bytes: Uint8Array, signal?: AbortSignal): Promise<PDFDocumentProxy> {
  const library = await loadPdfJs();
  signal?.throwIfAborted();
  const assetRoot = `${import.meta.env.BASE_URL}pdfjs/`;
  const options = {
    // The worker takes ownership of its input; retain the original for storage.
    data: bytes.slice(),
    cMapUrl: `${assetRoot}cmaps/`, cMapPacked: true,
    standardFontDataUrl: `${assetRoot}standard_fonts/`,
    wasmUrl: `${assetRoot}wasm/`,
    useWasm: false,
    isEvalSupported: false,
    enableXfa: false,
    useSystemFonts: true,
    maxImageSize: 40_000_000,
    disableAutoFetch: true,
    verbosity: 0,
  };
  const loadingTask = library.getDocument(options);
  const abort = () => { void loadingTask.destroy().catch(() => {}); };
  signal?.addEventListener('abort', abort, { once: true });
  try { return await loadingTask.promise; }
  catch (error) { await loadingTask.destroy().catch(() => {}); throw error; }
  finally { signal?.removeEventListener('abort', abort); }
}

interface TextPiece {
  str: string;
  hasEOL?: boolean;
  width?: number;
  height?: number;
  transform?: number[];
}

function isTextPiece(item: unknown): item is TextPiece {
  return Boolean(item && typeof item === 'object' && 'str' in item && typeof item.str === 'string');
}

/** Keeps PDF.js reading order and line breaks, using measured gaps for word spacing. */
export function documentPageText(items: readonly unknown[]): string {
  const output: string[] = [];
  let previous: TextPiece | undefined;
  for (const item of items) {
    if (!isTextPiece(item)) continue;
    const text = item.str.replaceAll('\u0000', '');
    if (text && previous && !previous.hasEOL && output.length) {
      const before = previous.transform;
      const current = item.transform;
      const last = output[output.length - 1];
      if (before && current) {
        const height = Math.max(previous.height || Math.abs(before[3]) || 10, item.height || Math.abs(current[3]) || 10);
        const differentLine = Math.abs(current[5] - before[5]) > height * 0.6;
        const gap = current[4] - (before[4] + (previous.width || 0));
        if (differentLine && !last.endsWith('\n')) output.push('\n');
        else if (gap > height * 0.15 && !/\s$/u.test(last) && !/^\s/u.test(text) && !/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]$/u.test(last) && !/^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(text)) output.push(' ');
      } else if (!/\s$/u.test(last) && !/^\s/u.test(text)) output.push(' ');
    }
    output.push(text);
    if (item.hasEOL && !text.endsWith('\n')) output.push('\n');
    previous = item;
  }
  return output.join('').replace(/\r\n?/g, '\n').trim();
}

export function documentFileKind(file: Pick<File, 'name' | 'type' | 'size'>): DocumentKind {
  if (!file.size) throw new DocumentImportError('文件是空的，请选择有内容的文件。');
  const extension = file.name.split('.').pop()?.toLowerCase();
  const kind: DocumentKind | null = ['pdf', 'epub', 'mobi', 'azw3'].includes(extension || '') ? extension as DocumentKind : ['txt', 'md', 'markdown'].includes(extension || '') ? 'text' : null;
  if (!kind) throw new DocumentImportError('目前支持 PDF、EPUB、MOBI、AZW3、TXT 和 Markdown 文件。');
  if (file.size > documentByteLimit(kind)) throw new DocumentImportError(kind === 'text' ? '文字文件超过 25 MB，请先拆分。' : '文件超过 150 MB，请先拆分或压缩。');
  return kind;
}

function page(pageNumber: number, text: string): DocumentPage {
  return { pageNumber, text, messageId: crypto.randomUUID(), versionId: crypto.randomUUID() };
}

export interface ParsedDocument { document: DocumentAttachment; bytes: Uint8Array }
export interface DocumentParseOptions { bytes?: Uint8Array; signal?: AbortSignal; onProgress?: (pageNumber: number, pageCount: number) => void }

export async function parseDocumentFile(file: File, options: DocumentParseOptions = {}): Promise<ParsedDocument> {
  options.signal?.throwIfAborted();
  const kind = documentFileKind(file);
  const bytes = options.bytes ?? new Uint8Array(await file.arrayBuffer());
  if (bytes.length !== file.size) throw new DocumentImportError('原文件大小发生变化，请重新选择文件。');
  const pages: DocumentPage[] = [];
  if (kind === 'text') {
    let text: string;
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/\r\n?/g, '\n'); }
    catch { throw new DocumentImportError('文字文件需要使用 UTF-8 编码，请转换后再上传。'); }
    if (text.includes('\u0000')) throw new DocumentImportError('这不像可读取的文字文件，请选择 PDF、TXT 或 Markdown。');
    if (text.length > MAX_TEXT_CHARACTERS) throw new DocumentImportError('文字文件超过 100 万字，请先拆分。');
    pages.push(page(1, text));
    options.onProgress?.(1, 1);
  } else if (isEbookKind(kind)) {
    const { openEbook } = await import('./ebooks');
    const book = await openEbook(bytes, kind, options.signal);
    try { pages.push(...await book.pages(options.signal, options.onProgress)); }
    finally { await book.destroy(); }
  } else {
    const signature = new TextDecoder('latin1').decode(bytes.subarray(0, 1024));
    if (!signature.includes('%PDF-')) throw new DocumentImportError('文件内容不是有效的 PDF，请检查文件。');
    let pdf: PDFDocumentProxy | undefined;
    const abort = () => { void pdf?.loadingTask.destroy().catch(() => {}); };
    options.signal?.addEventListener('abort', abort, { once: true });
    try {
      pdf = await loadPdfDocument(bytes, options.signal);
      if (pdf.numPages > MAX_DOCUMENT_PAGES) throw new DocumentImportError('PDF 超过 5000 页，请先拆分后打开。');
      let totalTextCharacters = 0;
      options.onProgress?.(0, pdf.numPages);
      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
        options.signal?.throwIfAborted();
        const pdfPage = await pdf.getPage(pageNumber);
        const content = await pdfPage.getTextContent();
        const text = documentPageText(content.items);
        totalTextCharacters += text.length;
        options.signal?.throwIfAborted();
        if (totalTextCharacters > MAX_DOCUMENT_TEXT_CHARACTERS) throw new DocumentImportError('PDF 提取文字超过 1000 万字符，请先拆分后打开。');
        pages.push(page(pageNumber, text));
        pdfPage.cleanup();
        options.onProgress?.(pageNumber, pdf.numPages);
        if (pageNumber % 8 === 0) await new Promise(resolve => setTimeout(resolve, 0));
      }
    } catch (error) {
      if (error instanceof DocumentImportError || options.signal?.aborted) throw error;
      if (error instanceof Error && error.name === 'PasswordException') throw new DocumentImportError('这份 PDF 有密码保护，请先解锁后再上传。');
      throw new DocumentImportError('无法读取这份 PDF，文件可能损坏或格式暂不支持。');
    } finally { options.signal?.removeEventListener('abort', abort); await pdf?.loadingTask.destroy(); }
  }
  return {
    document: {
      id: crypto.randomUUID(), name: file.name.slice(0, 500), kind,
      mimeType: kind === 'pdf' ? 'application/pdf' : kind === 'epub' ? 'application/epub+zip' : isEbookKind(kind) ? 'application/x-mobipocket-ebook' : 'text/plain',
      size: bytes.byteLength, createdAt: Date.now(), pages,
    },
    bytes,
  };
}
