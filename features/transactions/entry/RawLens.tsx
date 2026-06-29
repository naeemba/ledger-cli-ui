'use client';

import { useEffect, useState } from 'react';
import type { DraftState, DraftAction } from './draftReducer';
import { applyRawText } from './rawLensLogic';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Textarea } from '@/components/ui/textarea';
import { formatTransaction } from '@/lib/transactions/schema';

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

  useEffect(() => {
    onError?.(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onChange = (value: string) => {
    setText(value);
    const { error: nextError, action } = applyRawText(value, draft);
    setError(nextError);
    onError?.(nextError);
    if (action) dispatch(action);
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
