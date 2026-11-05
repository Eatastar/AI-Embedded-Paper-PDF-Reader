import { useMemo } from 'react';
import { Streamdown } from 'streamdown';
import { createMathPlugin } from '@streamdown/math';
import { normalizeMathDelimiters } from '../adapters/markdown';

const plugins = { math: createMathPlugin({ singleDollarTextMath: true }) };

/** Shared presentation for main replies and the single-turn annotation reply. */
export function MathMarkdown({ children, streaming = false }: { children: string; streaming?: boolean }) {
  const markdown = useMemo(() => normalizeMathDelimiters(children), [children]);
  return <Streamdown className="annotation-markdown" plugins={plugins} mode={streaming ? 'streaming' : 'static'} isAnimating={streaming} tableMaxHeight="none" controls={false}>{markdown}</Streamdown>;
}
