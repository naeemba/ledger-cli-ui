import type { Annotation } from '@/lib/journal/parser';

export type DraftPosting = {
  account: string;
  amount: string;
  currency: string;
  cost?: Annotation;
  assertion?: Annotation;
};

export type DraftStatus = 'cleared' | 'pending' | 'none';

export type DraftState = {
  date: string;
  payee: string;
  status: DraftStatus;
  note: string;
  uid?: string;
  postings: DraftPosting[];
};

export type DraftAction =
  | {
      type: 'setField';
      field: 'date' | 'payee' | 'status' | 'note';
      value: string;
    }
  | { type: 'setPosting'; index: number; patch: Partial<DraftPosting> }
  | { type: 'addPosting'; currency: string }
  | { type: 'removePosting'; index: number }
  | { type: 'replaceAll'; state: DraftState };

export const emptyPostings = (currency: string): DraftPosting[] => [
  { account: '', amount: '', currency },
  { account: '', amount: '', currency },
];

export const initDraft = (
  input: { date: string } & Partial<DraftState>,
  defaultCurrency: string
): DraftState => ({
  date: input.date,
  payee: input.payee ?? '',
  status: input.status ?? 'none',
  note: input.note ?? '',
  uid: input.uid,
  postings: input.postings ?? emptyPostings(defaultCurrency),
});

export const draftReducer = (
  state: DraftState,
  action: DraftAction
): DraftState => {
  switch (action.type) {
    case 'setField':
      return { ...state, [action.field]: action.value };
    case 'setPosting':
      return {
        ...state,
        postings: state.postings.map((p, i) =>
          i === action.index ? { ...p, ...action.patch } : p
        ),
      };
    case 'addPosting':
      return {
        ...state,
        postings: [
          ...state.postings,
          { account: '', amount: '', currency: action.currency },
        ],
      };
    case 'removePosting':
      if (state.postings.length <= 2) return state;
      return {
        ...state,
        postings: state.postings.filter((_, i) => i !== action.index),
      };
    case 'replaceAll':
      return action.state;
    default:
      return state;
  }
};

export const serializeDraftJson = (
  state: DraftState,
  mode: 'create' | 'edit'
): string =>
  JSON.stringify({
    date: state.date,
    payee: state.payee.trim(),
    status: state.status,
    note: state.note.trim() || undefined,
    uid: mode === 'edit' ? state.uid : undefined,
    postings: state.postings.map((p) => ({
      account: p.account.trim(),
      amount: p.amount.trim(),
      currency: p.currency.trim(),
      ...(p.cost
        ? {
            cost: {
              amount: p.cost.amount.trim(),
              currency: p.cost.currency.trim(),
            },
          }
        : {}),
      ...(p.assertion
        ? {
            assertion: {
              amount: p.assertion.amount.trim(),
              currency: p.assertion.currency.trim(),
            },
          }
        : {}),
    })),
  });
