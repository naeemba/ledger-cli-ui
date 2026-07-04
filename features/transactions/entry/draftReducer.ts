import { Txn, type Posting } from '@/lib/transactions/model';

export type { Posting as DraftPosting } from '@/lib/transactions/model';
export type { TxnStatus as DraftStatus } from '@/lib/transactions/model';

export type DraftState = Txn;

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

export const emptyPostings = (currency: string): Posting[] => [
  { account: '', amount: '', currency },
  { account: '', amount: '', currency },
];

export const initDraft = (
  input: { date: string } & {
    payee?: string;
    status?: Txn['status'];
    note?: string;
    uid?: string;
    postings?: Posting[];
  },
  defaultCurrency: string
): Txn =>
  new Txn(
    input.date,
    input.payee ?? '',
    input.status ?? 'none',
    input.note ?? '',
    input.postings ?? emptyPostings(defaultCurrency),
    input.uid
  );

export const draftReducer = (state: Txn, action: DraftAction): Txn => {
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
