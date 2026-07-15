export type CommodityDefinition = {
  symbol: string;
  note: string;
  aliases: string[];
  decimalPlaces: number | null;
  nomarket: boolean;
  isDefault: boolean;
};

export type CommodityBlock = CommodityDefinition & {
  startLine: number;
  endLine: number;
  opaque: boolean;
  raw: string;
};

const unquote = (symbol: string): string => symbol.replace(/^"(.*)"$/, '$1');

// Ledger requires quoting when the symbol contains digits or the characters
// it tokenizes on. Mirrors the quoting `extractDefinitions` applies.
const needsQuoting = (symbol: string): boolean => /[\d.,;\s"-]/.test(symbol);

const renderSymbol = (symbol: string): string =>
  needsQuoting(symbol) ? `"${symbol}"` : symbol;

const NUMBER_TOKEN = /-?[\d,]+(?:\.(\d+))?/;

/** Decimal places of a format sample, or null when it has no numeric token. */
const sampleDecimalPlaces = (sample: string): number | null => {
  const match = NUMBER_TOKEN.exec(sample);
  if (!match) return null;
  return match[1]?.length ?? 0;
};

export const parseCommodityBlocks = (text: string): CommodityBlock[] => {
  const lines = text.split('\n');
  const blocks: CommodityBlock[] = [];
  let current: (CommodityBlock & { lines: string[] }) | null = null;

  const close = () => {
    if (!current) return;
    // Drop trailing blank lines from the block span.
    while (
      current.lines.length > 1 &&
      current.lines[current.lines.length - 1].trim() === ''
    ) {
      current.lines.pop();
      current.endLine -= 1;
    }
    const { lines: blockLines, ...block } = current;
    blocks.push({ ...block, raw: blockLines.join('\n') });
    current = null;
  };

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    const commodityMatch = /^commodity\s+(.+)$/.exec(trimmed);
    // A non-indented, non-blank line closes the open block.
    if (current && trimmed && !/^\s/.test(line) && !commodityMatch) close();
    if (commodityMatch && !/^\s/.test(line)) {
      close();
      current = {
        symbol: unquote(commodityMatch[1].trim()),
        note: '',
        aliases: [],
        decimalPlaces: null,
        nomarket: false,
        isDefault: false,
        startLine: index,
        endLine: index,
        opaque: false,
        raw: '',
        lines: [line],
      };
      return;
    }
    if (!current) return;
    current.lines.push(line);
    current.endLine = index;
    if (trimmed === '') return;

    const directive = /^(\S+)(?:\s+(.*))?$/.exec(trimmed);
    const keyword = directive?.[1];
    const argument = directive?.[2]?.trim() ?? '';
    if (keyword === 'note') current.note = argument;
    else if (keyword === 'alias') current.aliases.push(unquote(argument));
    else if (keyword === 'nomarket' && argument === '') current.nomarket = true;
    else if (keyword === 'default' && argument === '') current.isDefault = true;
    else if (keyword === 'format') {
      const decimals = sampleDecimalPlaces(argument);
      if (decimals === null) current.opaque = true;
      else current.decimalPlaces = decimals;
    } else current.opaque = true; // comment or unknown sub-directive
  });
  close();
  return blocks;
};

const formatSample = (decimalPlaces: number): string =>
  decimalPlaces > 0 ? `1,000.${'0'.repeat(decimalPlaces)}` : '1,000';

export const serializeCommodityBlock = (
  definition: CommodityDefinition
): string => {
  const lines = [`commodity ${renderSymbol(definition.symbol)}`];
  if (definition.note) lines.push(`\tnote ${definition.note}`);
  for (const alias of definition.aliases) {
    lines.push(`\talias ${renderSymbol(alias)}`);
  }
  if (definition.decimalPlaces !== null) {
    const sample = formatSample(definition.decimalPlaces);
    // A quoted symbol goes after the sample (the form ledger accepts for
    // symbols containing separator characters); a plain one prefixes it.
    lines.push(
      needsQuoting(definition.symbol)
        ? `\tformat ${sample} ${renderSymbol(definition.symbol)}`
        : `\tformat ${definition.symbol} ${sample}`
    );
  }
  if (definition.nomarket) lines.push('\tnomarket');
  if (definition.isDefault) lines.push('\tdefault');
  return lines.join('\n');
};
