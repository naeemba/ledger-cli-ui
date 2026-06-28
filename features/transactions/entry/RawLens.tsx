'use client';

import { useEffect, useState } from 'react';
import type { DraftState, DraftAction } from './draftReducer';
import { parsedBlockToDraft } from './parsedBlockToDraft';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { parseBlock } from '@/lib/journal/parser';
import { formatTransaction } from '@/lib/transactions/schema';

const PARSE_ERROR =
  'Could not parse this as a transaction. Check the date/payee header and that each posting has an account.';

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
    setError(null);
    onError?.(null);
    dispatch({ type: 'replaceAll', state: parsedBlockToDraft(block, draft) });
  };

  return (
    <div className="flex flex-col gap-2">
      <textarea
        value={text}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
        rows={10}
        className="w-full resize-y rounded-md border border-input bg-background px-3 py-2 font-mono text-sm leading-relaxed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
