import { EBOOK_LIMITS, assertEbookSignature, assertEbookImageHeader, safeEbookEntry } from '../domain/ebook';
import { MAX_DOCUMENT_PAGES, MAX_DOCUMENT_TEXT_CHARACTERS } from '../domain/document-limits';
import type { DocumentKind, DocumentPage } from '../domain/types';
import type { OutlineEntry } from '../domain/reader-navigation';

interface Section {
  id: string | number; size: number;
  load(): Promise<string>; unload?(): void; createDocument(): Promise<Document>;
  resolveHref?(href: string): string;
}
interface TocItem { label: string; href?: string; subitems?: TocItem[] }
export interface EbookDestination { index: number; anchor?: (document: Document) => Element | null }
interface Book {
  sections: Section[]; toc?: TocItem[]; transformTarget?: EventTarget;
  resolveHref(href: string): EbookDestination | Promise<EbookDestination>;
  unload?(): void; destroy(): void;
}
interface ZipEntry { filename: string; directory: boolean; encrypted: boolean; uncompressedSize: number; getData(stream: WritableStream<Uint8Array>): Promise<unknown> }
interface ZipReader { getEntries(): Promise<ZipEntry[]>; close(): Promise<void> }

export interface EbookChapter { head: string; body: string; lang: string; dir: string; bodyClass: string; htmlClass: string }
const importAsset = (name: string): Promise<Record<string, any>> => import(/* @vite-ignore */ `${import.meta.env.BASE_URL}ebook/${name}`);
const tick = () => new Promise<void>(resolve => setTimeout(resolve, 0));

/** Remove active content before anything is attached to the sandboxed frame. */
export function sanitizeEbookDocument(document: Document): EbookChapter {
  document.querySelectorAll('script, iframe, frame, frameset, object, embed, form, input, button, textarea, select, base, meta, audio, video, source, track, portal').forEach(el => el.remove());
  for (const el of document.querySelectorAll('*')) {
    for (const attribute of [...el.attributes]) {
      const name = attribute.name.toLowerCase();
      if (name.startsWith('on') || ['srcdoc', 'srcset', 'ping', 'action', 'formaction', 'target', 'download', 'autofocus', 'contenteditable', 'tabindex'].includes(name)) el.removeAttribute(attribute.name);
    }
    if (el.localName === 'a') {
      const href = el.getAttribute('href') || el.getAttribute('xlink:href');
      if (href) { el.setAttribute('data-book-href', href); el.setAttribute('href', '#'); }
      el.removeAttribute('xlink:href');
    } else for (const name of ['src', 'href', 'xlink:href', 'poster', 'background']) {
      const url = el.getAttribute(name);
      if (url && !url.startsWith('blob:') && !url.startsWith('#') && !/^data:image\/(?:png|jpeg|gif|webp|svg\+xml);/i.test(url)) el.removeAttribute(name);
    }
    if (el.localName === 'link' && (!el.getAttribute('href')?.startsWith('blob:') || el.getAttribute('rel') !== 'stylesheet')) el.remove();
  }
  const root = document.documentElement;
  return { head: document.head?.innerHTML || '', body: document.body?.innerHTML || '', lang: root.lang || '', dir: root.getAttribute('dir') === 'rtl' ? 'rtl' : 'auto', bodyClass: document.body?.className || '', htmlClass: root.className || '' };
}

export class EbookSession {
  private book: Book;
  private zip?: ZipReader;
  private closed = false;
  private current: number | null = null;
  private serial: Promise<unknown> = Promise.resolve();
  private resourceBytes = 0;
  private resourcePixels = 0;
  private resourceFailure?: Error;
  private sections: Section[];
  private sectionIndices: number[];
  constructor(book: Book, zip?: ZipReader) {
    this.book = book; this.zip = zip;
    this.sectionIndices = book.sections.flatMap((section, index) => typeof section.load === 'function' && typeof section.createDocument === 'function' ? [index] : []);
    this.sections = this.sectionIndices.map(index => book.sections[index]);
  }
  get count() { return this.sections.length; }
  check(signal?: AbortSignal) { signal?.throwIfAborted(); if (this.closed) throw new DOMException('Book closed', 'AbortError'); if (this.resourceFailure) throw this.resourceFailure; }
  private enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const result = this.serial.then(fn); this.serial = result.then(() => {}, () => {}); return result;
  }
  /** At most one resource-bearing chapter lives in the parser cache. */
  chapter(index: number, signal?: AbortSignal): Promise<EbookChapter> {
    return this.enqueue(async () => {
      this.resourceFailure = undefined; this.check(signal); this.releaseChapter(); this.resourceBytes = 0; this.resourcePixels = 0;
      const section = this.sections[index]; if (!section) throw new Error('电子书章节不存在。');
      this.current = index;
      try {
        const url = await section.load(); this.check(signal);
        if (!url?.startsWith('blob:')) throw new Error('无法读取电子书章节。');
        const response = await fetch(url, { signal }); const html = await response.text(); this.check(signal);
        if (html.length > EBOOK_LIMITS.chapterBytes) throw new Error('电子书单章过大，请先拆分。');
        const document = new DOMParser().parseFromString(html, 'text/html');
        return sanitizeEbookDocument(document);
      } catch (error) { this.releaseChapter(); throw error; }
    });
  }
  private releaseChapter() {
    if (this.current !== null) this.sections[this.current]?.unload?.();
    this.book.unload?.(); this.current = null;
  }
  /** Text-only indexing: no chapter images, fonts or layout canvases are created. */
  async pages(signal?: AbortSignal, progress?: (done: number, count: number) => void): Promise<DocumentPage[]> {
    const pages: DocumentPage[] = []; let characters = 0;
    for (let index = 0; index < this.count; index++) {
      this.check(signal);
      const doc = await this.sections[index].createDocument(); this.check(signal);
      doc.querySelectorAll('script,style,head,iframe,object,embed').forEach(el => el.remove());
      const body = doc.querySelector('body') || doc.documentElement;
      // This text is for retrieval/AI. Saved highlight offsets use the unchanged
      // rendered DOM, so paragraph separators here do not move note anchors.
      for (const block of body.querySelectorAll('p,h1,h2,h3,h4,h5,h6,li,pre,blockquote,div,section,tr,br')) block.after(doc.createTextNode('\n'));
      for (const cell of body.querySelectorAll('td,th')) cell.after(doc.createTextNode('\t'));
      const text = (body.textContent || '').replaceAll('\0', '').replace(/\n{3,}/g, '\n\n').trim(); characters += text.length;
      if (characters > MAX_DOCUMENT_TEXT_CHARACTERS) throw new Error('电子书文字超过 1000 万字符，请先拆分。');
      const title = (body.querySelector('h1,h2,h3')?.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 512);
      pages.push({ pageNumber: index + 1, text, messageId: crypto.randomUUID(), versionId: crypto.randomUUID(), ...(title ? { title } : {}) });
      progress?.(index + 1, this.count); if (index % 4 === 0) await tick();
    }
    return pages;
  }
  async outline(signal?: AbortSignal): Promise<OutlineEntry[]> {
    const output: OutlineEntry[] = [];
    const visit = async (items: TocItem[], depth: number) => {
      for (const item of items) {
        this.check(signal); if (output.length >= 1000 || depth > 20) break;
        let pageIndex: number | null = null;
        if (item.href) try { const value = await this.book.resolveHref(item.href); const index = this.sectionIndices.indexOf(value?.index); if (index >= 0) pageIndex = index; } catch { /* Retain unreadable headings. */ }
        output.push({ key: `toc-${output.length}`, title: String(item.label || '').slice(0, 512), depth, pageIndex, ...(item.href ? { href: item.href } : {}) });
        if (item.subitems) await visit(item.subitems, depth + 1);
      }
    };
    await visit(this.book.toc || [], 0); return output;
  }
  async destination(href: string, chapter: number, absolute = false): Promise<EbookDestination | null> {
    if (/^(?:https?:|mailto:)/i.test(href)) return null;
    if (/^[a-z][\w+.-]*:/i.test(href) && !/^(?:filepos|kindle):/i.test(href)) throw new Error('不支持的电子书链接。');
    const section = this.sections[chapter];
    const resolved = !absolute && section?.resolveHref ? section.resolveHref(href) : href;
    const value = await this.book.resolveHref(resolved);
    const index = this.sectionIndices.indexOf(value?.index);
    return index >= 0 ? { ...value, index } : null;
  }
  addResources(bytes: number) { this.resourceBytes += bytes; if (this.resourceBytes > EBOOK_LIMITS.chapterResources) { this.resourceFailure = new Error('本章图片和字体过大，请先压缩电子书。'); throw this.resourceFailure; } }
  validateImage(bytes: Uint8Array) {
    try {
      this.resourcePixels += assertEbookImageHeader(bytes);
      if (this.resourcePixels > 40_000_000) throw new Error('本章图片和字体过大，请先压缩电子书。');
    } catch (error) { this.resourceFailure = error as Error; throw error; }
  }
  async destroy() {
    if (this.closed) return; this.closed = true;
    await this.serial; this.releaseChapter(); this.book.destroy(); await this.zip?.close();
  }
}

export async function openEbook(bytes: Uint8Array, kind: DocumentKind, signal?: AbortSignal): Promise<EbookSession> {
  assertEbookSignature(bytes, kind); signal?.throwIfAborted();
  let zip: ZipReader | undefined; let book: Book | undefined; let session: EbookSession | undefined;
  const check = () => { signal?.throwIfAborted(); session?.check(); };
  try {
    if (kind === 'epub') {
      const [module, library] = await Promise.all([importAsset('epub.js'), importAsset('vendor/zip.js')]); check();
      library.configure({ useWebWorkers: false });
      zip = new library.ZipReader(new library.BlobReader(new Blob([bytes as Uint8Array<ArrayBuffer>])));
      const entries = await zip!.getEntries(); check();
      if (entries.length > EBOOK_LIMITS.entries) throw new Error('电子书内部文件过多。');
      const map = new Map<string, ZipEntry>(); let total = 0;
      for (const entry of entries) {
        if (entry.directory) continue;
        total += entry.uncompressedSize;
        if (!safeEbookEntry(entry.filename) || map.has(entry.filename) || entry.encrypted || !Number.isSafeInteger(entry.uncompressedSize) || entry.uncompressedSize < 0 || entry.uncompressedSize > EBOOK_LIMITS.entryBytes || total > EBOOK_LIMITS.expandedBytes) throw new Error('电子书内容超过安全读取范围，或包含受保护的文件。');
        map.set(entry.filename, entry);
      }
      const read = async (name: string, limit: number): Promise<Blob | null> => {
        check(); const entry = map.get(name); if (!entry) return null;
        if (entry.uncompressedSize > limit) throw new Error('电子书单个文件过大。');
        const chunks: Uint8Array[] = []; let length = 0;
        // Limit actual streamed output, not only the untrusted ZIP header size.
        await entry.getData(new WritableStream<Uint8Array>({ write(chunk) { check(); length += chunk.byteLength; if (length > limit) throw new Error('电子书解压内容超过安全读取范围。'); chunks.push(chunk.slice()); } }));
        check(); session?.addResources(length);
        const blob = new Blob(chunks as Uint8Array<ArrayBuffer>[]);
        const header = new Uint8Array(await blob.slice(0, 262144).arrayBuffer());
        if (session) session.validateImage(header); else assertEbookImageHeader(header);
        return blob;
      };
      const loadText = async (name: string) => { const data = await read(name, EBOOK_LIMITS.chapterBytes); return data ? data.text() : null; };
      if ((await loadText('mimetype'))?.trim() !== 'application/epub+zip' || !map.has('META-INF/container.xml')) throw new Error('这不是有效的 EPUB 文件。');
      const encryption = await loadText('META-INF/encryption.xml');
      if (encryption) {
        const document = new DOMParser().parseFromString(encryption, 'application/xml');
        if (document.querySelector('parsererror') || [...document.getElementsByTagNameNS('*', 'EncryptionMethod')].some(node => !['http://www.idpf.org/2008/embedding', 'http://ns.adobe.com/pdf/enc#RC'].includes(node.getAttribute('Algorithm') || ''))) throw new Error('这本电子书受 DRM 保护，请使用无 DRM 的文件。');
      }
      book = await new module.EPUB({ loadText, loadBlob: (name: string) => read(name, EBOOK_LIMITS.entryBytes), getSize: (name: string) => map.get(name)?.uncompressedSize || 0 }).init();
      book!.transformTarget?.addEventListener('load', event => { const detail = (event as CustomEvent).detail; if (detail.isScript) detail.allow = false; });
    } else {
      const [module, fflate] = await Promise.all([importAsset('mobi.js'), importAsset('vendor/fflate.js')]); check();
      book = await new module.MOBI({ unzlib: fflate.unzlibSync, validateResource: (data: Uint8Array) => { check(); session?.addResources(data.byteLength); if (session) session.validateImage(data); else assertEbookImageHeader(data); } }).open(new Blob([bytes as Uint8Array<ArrayBuffer>]));
    }
    check();
    if (!book?.sections?.length || book.sections.length > MAX_DOCUMENT_PAGES) throw new Error('电子书章节为空或超过 5000 章。');
    session = new EbookSession(book, zip);
    if (!session.count) throw new Error('电子书章节为空或超过 5000 章。');
    return session;
  } catch (error) { book?.destroy(); await zip?.close().catch(() => {}); throw error; }
}
