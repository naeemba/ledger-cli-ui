import { Transaction, type Posting } from '@/lib/transactions/model';

export type { Posting as DraftPosting } from '@/lib/transactions/model';
export type { TransactionStatus as DraftStatus } from '@/lib/transactions/model';

export type DraftState = Transaction;

export type DraftAction =
  | {
      type: 'setField';
      field: 'date' | 'payee' | 'status' | 'note';
      value: string;
    }
  | { type: 'setPosting'; index: number; patch: Partial<Posting> }
  | { type: 'addPosting'; currency: string }
  | { type: 'removePosting'; index: number }
  | { type: 'replaceAll'; state: DraftState };

export const initDraft = (
  input: { date: string } & {
    payee?: string;
    status?: Transaction['status'];
    note?: string;
    uid?: string;
    postings?: Posting[];
  },
  defaultCurrency: string
): Transaction =>
  new Transaction({
    date: input.date,
    payee: input.payee ?? '',
    status: input.status ?? 'none',
    note: input.note ?? '',
    postings: input.postings ?? Transaction.empty(defaultCurrency).postings,
    uid: input.uid,
  });

export const draftReducer = (
  state: Transaction,
  action: DraftAction
): Transaction => {
  switch (action.type) {
    case 'setField':
      return state.withField(action.field, action.value);
    case 'setPosting':
      return state.withPosting(action.index, action.patch);
    case 'addPosting':
      return state.addPosting(action.currency);
    case 'removePosting':
      return state.removePosting(action.index);
    case 'replaceAll':
      return action.state;
    default:
      return state;
  }
};

export const serializeDraftJson = (
  state: DraftState,
  mode: 'create' | 'edit'
): string => JSON.stringify(state.toWire(mode));
