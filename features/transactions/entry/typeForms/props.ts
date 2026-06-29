// features/transactions/entry/typeForms/props.ts
import type { DraftAction, DraftState } from '../draftReducer';

export type TypeFormProps = {
  draft: DraftState;
  dispatch: (a: DraftAction) => void;
  accounts: string[];
  payees: string[];
  defaultCurrency: string;
  /** Commodities already used in the journal, for currency autocomplete. */
  currencies?: string[];
};
