// features/transactions/entry/TypeLens.tsx
'use client';

import React, { useState } from 'react';
import { ExchangeForm } from './typeForms/ExchangeForm';
import { ExpenseForm } from './typeForms/ExpenseForm';
import { FixBalanceForm } from './typeForms/FixBalanceForm';
import { IncomeForm } from './typeForms/IncomeForm';
import { TransferForm } from './typeForms/TransferForm';
import type { TypeFormProps } from './typeForms/props';
import { initialPickForDraft, resolveTypeLensState } from './typeLensState';
import { TYPE_ADAPTERS } from './types/registry';
import { Button } from '@/components/ui/button';

type Props = TypeFormProps & {
  getAccountBalance: (account: string, currency: string) => Promise<string>;
};

export function TypeLens(props: Props): React.JSX.Element {
  const { draft, getAccountBalance, ...formProps } = props;
  const [picked, setPicked] = useState<string | null>(() =>
    initialPickForDraft(draft)
  );

  const { selectedId, chipsDisabled } = resolveTypeLensState(draft, picked);

  const renderForm = () => {
    const shared = { draft, ...formProps };
    switch (selectedId) {
      case 'expense':
        return <ExpenseForm key="expense" {...shared} />;
      case 'income':
        return <IncomeForm key="income" {...shared} />;
      case 'transfer':
        return <TransferForm key="transfer" {...shared} />;
      case 'exchange':
        return <ExchangeForm key="exchange" {...shared} />;
      case 'fix-balance':
        return (
          <FixBalanceForm
            key="fix-balance"
            {...shared}
            getAccountBalance={getAccountBalance}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap gap-2">
        {TYPE_ADAPTERS.map((a) => (
          <Button
            key={a.id}
            type="button"
            size="sm"
            variant={selectedId === a.id ? 'default' : 'outline'}
            disabled={chipsDisabled}
            onClick={() => setPicked(a.id)}
          >
            <span aria-hidden className="mr-1">
              {a.icon}
            </span>
            {a.label}
          </Button>
        ))}
      </div>

      {chipsDisabled ? (
        <p className="text-sm text-muted-foreground">
          This transaction&apos;s shape doesn&apos;t map to a quick type — edit
          it in the Form or Raw tab.
        </p>
      ) : selectedId === null ? (
        <p className="text-sm text-muted-foreground">
          Pick a type to start a guided entry.
        </p>
      ) : (
        renderForm()
      )}
    </div>
  );
}
