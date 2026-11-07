import { core } from './translations-core';
import { reader } from './translations-reader';
import { notes } from './translations-notes';
import { settings } from './translations-settings';
import { tools } from './translations-tools';

// Columns: application-owned source, Spanish, Japanese, German, Arabic, French.
// Untranslated technical diagnostics use the existing English catalog.
const codes = ['es', 'ja', 'de', 'ar', 'fr'] as const;
export const additional = Object.fromEntries(codes.map((code, column) => [code,
  Object.fromEntries([core, reader, notes, settings, tools].flatMap(table => table.trim().split('\n').map(line => {
    const cells = line.split('|').map(cell => cell.replaceAll('\\n', '\n'));
    if (cells.length !== 6 || cells.some(cell => !cell.trim())) throw new Error('Invalid UI translation row');
    return [cells[0], cells[column + 1]];
  }))),
])) as Record<typeof codes[number], Record<string, string>>;
