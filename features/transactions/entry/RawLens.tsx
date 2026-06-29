'use client';

import { useEffect, useState } from 'react';
import { LedgerEditor } from './LedgerEditor';
import type { DraftState, DraftAction } from './draftReducer';
import { applyRawText } from './rawLensLogic';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { formatTransaction } from '@/lib/transactions/schema';

export function RawLens({
  draft,
  dispatch,
  onError,
  accounts = [],
  payees = [],
  commodities = [],
}: {
  draft: DraftState;
  dispatch: (action: DraftAction) => void;
  onError?: (error: string | null) => void;
  accounts?: string[];
  payees?: string[];
  commodities?: string[];
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
      <LedgerEditor
        value={text}
        onChange={onChange}
        accounts={accounts}
        payees={payees}
        commodities={commodities}
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
