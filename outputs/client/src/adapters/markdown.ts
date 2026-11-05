/** Adapt model TeX delimiters for remark-math without changing saved replies. */
export function normalizeMathDelimiters(source: string): string {
  const output: string[] = [];
  let offset = 0;

  const escaped = (index: number) => {
    let slashes = 0;
    while (index > 0 && source[--index] === '\\') slashes += 1;
    return slashes % 2 === 1;
  };
  const findDelimiter = (delimiter: string, from: number) => {
    let index = source.indexOf(delimiter, from);
    while (index !== -1) {
      if (!escaped(index)) return index;
      index = source.indexOf(delimiter, index + delimiter.length);
    }
    return -1;
  };

  while (offset < source.length) {
    // Code examples must keep their literal delimiters, including while a fenced
    // block is still arriving. Only the presentation copy is ever normalized.
    if (offset === 0 || source[offset - 1] === '\n') {
      const end = source.indexOf('\n', offset);
      const lineEnd = end === -1 ? source.length : end + 1;
      const line = source.slice(offset, lineEnd);
      const fence = /^ {0,3}(`{3,}|~{3,})/.exec(line);
      if (fence) {
        const close = new RegExp('^ {0,3}' + fence[1][0] + '{' + fence[1].length + ',}[ \\t\\r]*$');
        let cursor = lineEnd;
        while (cursor < source.length) {
          const next = source.indexOf('\n', cursor);
          const nextEnd = next === -1 ? source.length : next;
          if (close.test(source.slice(cursor, nextEnd))) {
            cursor = next === -1 ? source.length : next + 1;
            break;
          }
          cursor = next === -1 ? source.length : next + 1;
        }
        output.push(source.slice(offset, cursor));
        offset = cursor;
        continue;
      }
      if (/^(?: {4}|\t)/.test(line)) {
        output.push(line);
        offset = lineEnd;
        continue;
      }
    }

    if (source[offset] === '`' && !escaped(offset)) {
      let count = 1;
      while (source[offset + count] === '`') count += 1;
      let end = offset + count;
      while (end < source.length) {
        if (source[end] !== '`') { end += 1; continue; }
        let run = 1;
        while (source[end + run] === '`') run += 1;
        if (run === count) { end += run; break; }
        end += run;
      }
      output.push(source.slice(offset, end));
      offset = end;
      continue;
    }

    // Do not reinterpret delimiters inside an existing $ / $$ math expression.
    if (source[offset] === '$' && !escaped(offset)) {
      const delimiter = source[offset + 1] === '$' ? '$$' : '$';
      const end = findDelimiter(delimiter, offset + delimiter.length);
      if (end !== -1) {
        output.push(source.slice(offset, end + delimiter.length));
        offset = end + delimiter.length;
        continue;
      }
    }

    if (source[offset] === '\\' && !escaped(offset) && (source[offset + 1] === '(' || source[offset + 1] === '[')) {
      const display = source[offset + 1] === '[';
      const end = findDelimiter(display ? '\\]' : '\\)', offset + 2);
      if (end !== -1) {
        const body = source.slice(offset + 2, end);
        output.push(display ? '\n\n$$\n' + body.trim() + '\n$$\n\n' : '$' + body + '$');
        offset = end + 2;
        continue;
      }
    }
    output.push(source[offset]);
    offset += 1;
  }
  return output.join('');
}
