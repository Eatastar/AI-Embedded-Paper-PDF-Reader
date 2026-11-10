import { deflateRawSync } from 'node:zlib';

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0); }
  return (crc ^ 0xffffffff) >>> 0;
}
export function syntheticZip(entries: [string, string | Uint8Array][]) {
  const local: Buffer[] = [], central: Buffer[] = []; let offset = 0;
  for (const [name, source] of entries) {
    const data = Buffer.from(source), filename = Buffer.from(name), method = name === 'mimetype' ? 0 : 8, compressed = method ? deflateRawSync(data) : data, crc = crc32(data);
    const header = Buffer.alloc(30); header.writeUInt32LE(0x04034b50); header.writeUInt16LE(20, 4); header.writeUInt16LE(method, 8); header.writeUInt32LE(crc, 14); header.writeUInt32LE(compressed.length, 18); header.writeUInt32LE(data.length, 22); header.writeUInt16LE(filename.length, 26);
    local.push(header, filename, compressed);
    const directory = Buffer.alloc(46); directory.writeUInt32LE(0x02014b50); directory.writeUInt16LE(20, 4); directory.writeUInt16LE(20, 6); directory.writeUInt16LE(method, 10); directory.writeUInt32LE(crc, 16); directory.writeUInt32LE(compressed.length, 20); directory.writeUInt32LE(data.length, 24); directory.writeUInt16LE(filename.length, 28); directory.writeUInt32LE(offset, 42);
    central.push(directory, filename); offset += header.length + filename.length + compressed.length;
  }
  const directory = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, directory, end]);
}

/** Fictional chapters only; no paper, personal screenshot or live API data. */
export function syntheticEpub(count = 6, paragraphs = 100, extra: [string, string | Uint8Array][] = []) {
  const entries: [string, string | Uint8Array][] = [
    ['mimetype', 'application/epub+zip'],
    ['META-INF/container.xml', '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="book/package.opf" media-type="application/oebps-package+xml"/></rootfiles></container>'],
    ['book/package.opf', `<?xml version="1.0"?><package version="3.0" unique-identifier="id" xmlns="http://www.idpf.org/2007/opf"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">synthetic-test-book</dc:identifier><dc:title>Synthetic learning book</dc:title><dc:language>en</dc:language></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="style" href="style.css" media-type="text/css"/><item id="image" href="image.svg" media-type="image/svg+xml"/>${Array.from({ length: count }, (_, i) => `<item id="c${i}" href="chapter${i}.xhtml" media-type="application/xhtml+xml"/>`).join('')}</manifest><spine>${Array.from({ length: count }, (_, i) => `<itemref idref="c${i}"/>`).join('')}</spine></package>`],
    ['book/nav.xhtml', `<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>Contents</title></head><body><nav epub:type="toc"><ol>${Array.from({ length: count }, (_, i) => `<li><a href="chapter${i}.xhtml#heading">Synthetic chapter ${i + 1}</a></li>`).join('')}</ol></nav></body></html>`],
    ['book/style.css', 'body.publisher{font-family:serif;background:white;color:black}.para{margin-block:1em}h1{font-size:1.5em}img{max-width:400px}'],
    ['book/image.svg', '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="200"><rect width="480" height="200" fill="#e3c16c"/><path d="M20 170L180 60L280 130L460 25" fill="none" stroke="#2866aa" stroke-width="4"/><text x="24" y="30">Synthetic learning curve</text></svg>'],
  ];
  for (let i = 0; i < count; i++) entries.push([`book/chapter${i}.xhtml`, `<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml" lang="en"><head><title>Chapter ${i + 1}</title><link rel="stylesheet" href="style.css"/><script>top.__bookScriptRan = true</script></head><body class="publisher"><h1 id="heading">Synthetic chapter ${i + 1}</h1><p id="selection">A synthetic explanation of entanglement and learning. Select this passage to ask a question.</p><img src="image.svg" alt="Synthetic plot"/><p><a id="cross-link" href="chapter${(i + 1) % count}.xhtml#heading">Next chapter link</a> <a id="footnote-link" href="#footnote">Footnote</a></p><math xmlns="http://www.w3.org/1998/Math/MathML"><mi>x</mi><mo>≤</mo><mn>1</mn></math>${Array.from({ length: paragraphs }, (_, j) => `<p class="para" id="paragraph-${j}">Chapter ${i + 1}, synthetic paragraph ${j + 1}. This is fictional instructional text for testing reading progress, reflow and annotations. Every chapter is loaded separately; no personal material is used.</p>`).join('')}<aside id="footnote">Synthetic footnote ${i + 1}.</aside><img src="https://example.invalid/private-image.png" onerror="top.__bookScriptRan=true"/><iframe src="https://example.invalid/"></iframe></body></html>`]);
  return syntheticZip([...entries, ...extra]);
}

export function syntheticMobi(drm = false) {
  const text = Buffer.from('<html><head><title>Synthetic MOBI</title></head><body><h1>Synthetic MOBI chapter 1</h1><p id="selection">A fictional MOBI passage for questions and notes.</p><mbp:pagebreak/><h1>Synthetic MOBI chapter 2</h1><p>Second chapter of a synthetic book.</p></body></html>');
  const title = Buffer.from('Synthetic MOBI'), header = Buffer.alloc(248 + title.length);
  header.writeUInt16BE(1, 0); header.writeUInt32BE(text.length, 4); header.writeUInt16BE(1, 8); header.writeUInt16BE(4096, 10); header.writeUInt16BE(drm ? 1 : 0, 12);
  header.write('MOBI', 16); header.writeUInt32BE(232, 20); header.writeUInt32BE(2, 24); header.writeUInt32BE(65001, 28); header.writeUInt32BE(1, 32); header.writeUInt32BE(6, 36); header.writeUInt32BE(248, 84); header.writeUInt32BE(title.length, 88);
  header.writeUInt32BE(2, 108); header.writeUInt32BE(0xffffffff, 112); header.writeUInt32BE(0xffffffff, 244); title.copy(header, 248);
  const pdb = Buffer.alloc(94); pdb.write('Synthetic MOBI', 0); pdb.write('BOOKMOBI', 60); pdb.writeUInt16BE(2, 76); pdb.writeUInt32BE(94, 78); pdb.writeUInt32BE(94 + header.length, 86);
  return Buffer.concat([pdb, header, text]);
}

/** A minimal real KF8 container (AZW3), including skeleton/fragment indexes. */
export function syntheticAzw3() {
  const chapters = [1, 2].map(n => Buffer.from(`<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Synthetic KF8</title></head><body><h1>Synthetic KF8 chapter ${n}</h1><p id="selection">A fictional AZW3 chapter for testing reflow and notes.</p></body></html>`));
  const variable = (value: number) => { const out = [value & 127 | 128]; while ((value >>>= 7)) out.unshift(value & 127); return Buffer.from(out); };
  const index = (tags: number[][], values: [string, number[]][]) => {
    const main = Buffer.alloc(192), tagx = Buffer.alloc(12 + tags.length * 4);
    main.write('INDX'); main.writeUInt32BE(192, 4); main.writeUInt32BE(1, 24); main.writeUInt32BE(65001, 28); main.writeUInt32BE(values.length, 36);
    tagx.write('TAGX'); tagx.writeUInt32BE(tagx.length, 4); tagx.writeUInt32BE(1, 8); tags.forEach((tag, i) => Buffer.from(tag).copy(tagx, 12 + i * 4));
    const entries = values.map(([name, numbers]) => Buffer.concat([Buffer.from([Buffer.byteLength(name)]), Buffer.from(name), Buffer.from([tags.reduce((mask, tag) => mask | tag[2], 0)]), ...numbers.map(variable)]));
    const data = Buffer.alloc(192), offsets: number[] = []; let offset = 192;
    for (const entry of entries) { offsets.push(offset); offset += entry.length; }
    data.write('INDX'); data.writeUInt32BE(192, 4); data.writeUInt32BE(offset, 20); data.writeUInt32BE(values.length, 24);
    const idxt = Buffer.alloc(4 + offsets.length * 2); idxt.write('IDXT'); offsets.forEach((n, i) => idxt.writeUInt16BE(n, 4 + i * 2));
    return [Buffer.concat([main, tagx]), Buffer.concat([data, ...entries, idxt])];
  };
  let offset = 0;
  const skeletons: [string, number[]][] = chapters.map((chapter, i) => { const row: [string, number[]] = [String(i), [1, offset, chapter.length]]; offset += chapter.length; return row; });
  offset = 0;
  const fragments: [string, number[]][] = chapters.map((chapter, i) => { const row: [string, number[]] = [String(offset + chapter.indexOf('</body>')), [0, i, 0, 0]]; offset += chapter.length; return row; });
  const skel = index([[1, 1, 1, 0], [6, 2, 2, 0]], skeletons), frag = index([[2, 1, 1, 0], [4, 1, 2, 0], [6, 2, 4, 0]], fragments);
  const text = Buffer.concat(chapters), header = Buffer.alloc(290);
  header.writeUInt16BE(1); header.writeUInt32BE(text.length, 4); header.writeUInt16BE(1, 8); header.writeUInt16BE(4096, 10);
  header.write('MOBI', 16); header.writeUInt32BE(248, 20); header.writeUInt32BE(65001, 28); header.writeUInt32BE(1, 32); header.writeUInt32BE(8, 36);
  header.writeUInt32BE(276, 84); header.writeUInt32BE(13, 88); header.writeUInt32BE(7, 108); header.writeUInt32BE(0xffffffff, 112); header.writeUInt32BE(64, 128);
  header.writeUInt32BE(6, 192); header.writeUInt32BE(1, 196); header.writeUInt32BE(0xffffffff, 244); header.writeUInt32BE(4, 248); header.writeUInt32BE(2, 252); header.writeUInt32BE(0xffffffff, 260);
  header.write('EXTH', 264); header.writeUInt32BE(12, 268); header.write('Synthetic KF8', 276);
  const fdst = Buffer.alloc(20); fdst.write('FDST'); fdst.writeUInt32BE(12, 4); fdst.writeUInt32BE(1, 8); fdst.writeUInt32BE(text.length, 16);
  const records = [header, text, ...skel, ...frag, fdst], pdb = Buffer.alloc(78 + records.length * 8);
  pdb.write('Synthetic KF8'); pdb.write('BOOKMOBI', 60); pdb.writeUInt16BE(records.length, 76); offset = pdb.length;
  records.forEach((record, i) => { pdb.writeUInt32BE(offset, 78 + i * 8); offset += record.length; });
  return Buffer.concat([pdb, ...records]);
}
