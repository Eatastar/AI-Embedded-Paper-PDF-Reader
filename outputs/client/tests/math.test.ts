import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MathMarkdown } from '../src/components/MathMarkdown';
import { normalizeMathDelimiters } from '../src/adapters/markdown';

function render(source: string, streaming = false) {
  return renderToStaticMarkup(createElement(MathMarkdown, { children: source, streaming }));
}
const countMath = (html: string) => (html.match(/class="katex"/g) || []).length;

test('the reported Einstein equation and its inline variables render as real math', () => {
  const source = String.raw`广义相对论的核心是爱因斯坦场方程：

\[ G_{\mu\nu}+\Lambda g_{\mu\nu}=\frac{8\pi G}{c^4}T_{\mu\nu} \]

其中：
- \(G_{\mu\nu}\) 描述时空曲率；
- \(T_{\mu\nu}\) 描述物质和能量的分布；
- \(\Lambda\) 是宇宙学常数；
- \(G\) 是牛顿引力常数，\(c\) 是光速。`;
  for (const streaming of [false, true]) {
    const html = render(source, streaming);
    assert.equal(countMath(html), 6);
    assert.match(html, /class="katex-display"/);
    assert.match(html, /<mfrac>/);
    assert.match(html, /<msub>/);
    assert.doesNotMatch(html, /katex-error/);
  }
  assert.ok(source.includes('\\[ G_'));
});

test('dollar inline, dollar display and multiline matrix/aligned formulas all render', () => {
  const source = String.raw`行内 $E=mc^2$，另一个 \(\alpha+\beta\)。

$$
\begin{aligned}
a &= \frac{1}{2} \\
b &= \sqrt{x}
\end{aligned}
$$

\[
\begin{pmatrix}1 & 2 \\ 3 & 4\end{pmatrix}
\]`;
  for (const streaming of [false, true]) {
    const html = render(source, streaming);
    assert.equal(countMath(html), 4);
    assert.equal((html.match(/class="katex-display"/g) || []).length, 2);
    assert.doesNotMatch(html, /katex-error/);
  }
});

test('inline code, fenced examples, indented code and escaped delimiters keep their source', () => {
  const examples = [
    '`\\(x^2\\)` and ``\\[y\\]``',
    '```latex\n\\[x\\]\n\\(y\\)\n```',
    '~~~~latex\n\\[x\\]\n~~~\n\\(y\\)\n~~~~',
    '```latex\n\\[unfinished code',
    '    \\(x\\)\n\t\\[y\\]\n',
    String.raw`escaped \\(x\\) and \\[y\\]`,
    String.raw`$$\text{literal \( and \[ inside math}$$`,
  ];
  for (const source of examples) assert.equal(normalizeMathDelimiters(source), source);
  const html = render('`\\(x^2\\)`，正文 \\(y^2\\)');
  assert.equal(countMath(html), 1);
  assert.match(html, /<code[^>]*>\\\(x\^2\\\)<\/code>/);
});

test('unfinished streamed TeX stays readable and renders once the closing delimiter arrives', () => {
  const source = String.raw`曲率 \(G_{\mu\nu}\)，方程 \[a=\frac{b}{c}\]`;
  for (let index = 0; index <= source.length; index += 1) {
    assert.doesNotThrow(() => render(source.slice(0, index), true));
  }
  assert.equal(normalizeMathDelimiters(String.raw`未完成 \(x^2`), String.raw`未完成 \(x^2`);
  assert.equal(countMath(render(source)), 2);
});

test('invalid TeX cannot crash the rest of an answer', () => {
  const html = render(String.raw`前面的正文。 \(\notARealTexCommand{x}\) 后面的正文。`);
  assert.match(html, /前面的正文/);
  assert.match(html, /后面的正文/);
});

test('long tables occupy their natural height before the following paragraph, including streaming', () => {
  const rows = Array.from({ length: 14 }, (_, i) => `| 阶段 ${i + 1} | Python 与工业数据 | 每行都应参与正常排版 |`).join('\n');
  const source = `| 环节 | 工具 | 作用 |\n| --- | --- | --- |\n${rows}\n\n表格后面的正文。`;
  for (const streaming of [false, true]) {
    const html = render(source, streaming);
    assert.equal((html.match(/data-streamdown="table-row"/g) || []).length, 15);
    assert.doesNotMatch(html, /max-height:\s*\d+(?:px|rem|vh)/);
    assert.ok(html.indexOf('</table>') < html.indexOf('表格后面的正文。'));
  }
});
