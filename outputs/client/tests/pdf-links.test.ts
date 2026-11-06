import assert from 'node:assert/strict';
import test from 'node:test';
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import { pdfLinkAt, readPdfLinks, resolvePdfDestination, safePdfUrl } from '../src/adapters/pdf-links';
const viewport = { width: 600, height: 800, convertToViewportPoint: (x: number, y: number) => [x, 800 - y] };
const page = { view: [0, 0, 600, 800], getViewport: () => viewport };
const pdf = { numPages: 3, getDestination: async (name: string) => name === 'cite.1' ? [{ num: 9, gen: 0 }, { name: 'XYZ' }, 60, 600, null] : null, getPageIndex: async () => 2, getPage: async () => page } as unknown as PDFDocumentProxy;
test('PDF references and figure destinations retain their exact within-page position', async () => {
  const signal = new AbortController().signal;
  assert.deepEqual(await resolvePdfDestination(pdf, 'cite.1', signal), { pageIndex: 2, x: .1, y: .25 });
  assert.deepEqual(await resolvePdfDestination(pdf, [1, { name: 'FitH' }, 400], signal), { pageIndex: 1, x: 0, y: .5 });
  assert.deepEqual(await resolvePdfDestination(pdf, [0, { name: 'Fit' }], signal), { pageIndex: 0, x: 0, y: 0 });
  assert.equal(await resolvePdfDestination(pdf, 'unknown', signal), null);
  assert.equal(await resolvePdfDestination(pdf, [20, { name: 'XYZ' }, 0, 0], signal), null);
  assert.equal(await resolvePdfDestination(pdf, [0, { name: 'Launch' }], signal), null);
  const abort = new AbortController(); abort.abort(); await assert.rejects(resolvePdfDestination(pdf, 'cite.1', abort.signal), { name: 'AbortError' });
});
test('PDF link regions align with the viewport and exclude executable/remote-file actions', async () => {
  const annotations = [
    { id: 'reference', subtype: 'Link', rect: [30, 740, 60, 760], dest: 'cite.1' },
    { id: 'web', subtype: 'Link', rect: [100, 740, 130, 760], url: 'https://example.org/paper' },
    { subtype: 'Link', rect: [0, 0, 10, 10], url: 'javascript:alert(1)' },
    { subtype: 'Link', rect: [0, 0, 10, 10], url: 'file:///private.txt' },
    { subtype: 'Link', rect: [0, 0, 10, 10], action: 'Launch', newWindow: true },
    { subtype: 'Link', rect: [NaN, 0, 10, 10], dest: 'cite.1' },
  ];
  const links = await readPdfLinks({ getAnnotations: async () => annotations } as unknown as PDFPageProxy, viewport as ReturnType<PDFPageProxy['getViewport']>, new AbortController().signal);
  assert.equal(links.length, 2); assert.deepEqual(links[0].rect, { left: 30, top: 40, width: 30, height: 20 });
  assert.equal(pdfLinkAt(links, 40, 50)?.destination, 'cite.1'); assert.equal(pdfLinkAt(links, 70, 50), undefined);
  assert.equal(safePdfUrl('https://name:password@example.org'), null); assert.equal(safePdfUrl('data:text/html,test'), null);
});
