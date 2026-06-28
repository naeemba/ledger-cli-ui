'use client';

import { useEffect, useState } from 'react';
import type { DraftState, DraftAction } from './draftReducer';
import { parsedBlockToDraft } from './parsedBlockToDraft';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Textarea } from '@/components/ui/textarea';
import { parseBlock } from '@/lib/journal/parser';
import { formatTransaction } from '@/lib/transactions/schema';

const PARSE_ERROR =
  'Could not parse this as a transaction. Check the date/payee header and that each posting has an account.';

const unparsedLineError = (line: string): string =>
  `Could not parse this line: "${line.trim()}". Each posting needs an account, ` +
  'and an amount must be separated from the account by two or more spaces.';

export function RawLens({
  draft,
  dispatch,
  onError,
}: {
  draft: DraftState;
  dispatch: (action: DraftAction) => void;
  onError?: (error: string | null) => void;
}) {
  const [text, setText] = useState(() => formatTransaction(draft));
  const [error, setError] = useState<string | null>(null);

  // The seed is always valid (or empty) formatted text; clear any stale
  // shell-level parse error left over from a previous Raw editing session.
  useEffect(() => {
    onError?.(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onChange = (value: string) => {
    setText(value);
    const block = parseBlock(value);
    if (!block || block.postings.length === 0) {
      setError(PARSE_ERROR);
      onError?.(PARSE_ERROR);
      return;
    }
    // parseBlock silently drops indented lines it can't read as a posting; flag
    // them here so a typo on the fast path can't quietly discard a posting.
    if (block.unparsedLines.length > 0) {
      const message = unparsedLineError(block.unparsedLines[0]);
      setError(message);
      onError?.(message);
      return;
    }
    setError(null);
    onError?.(null);
    dispatch({ type: 'replaceAll', state: parsedBlockToDraft(block, draft) });
  };

  return (
    <div className="flex flex-col gap-2">
      <Textarea
        value={text}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
        rows={10}
        className="resize-y font-mono leading-relaxed"
        aria-label="Transaction ledger text"
      />
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
