import type { DraftState } from './draftReducer';
import type { ParsedBlock } from '@/lib/journal/parser';

/**
 * Map a parsed ledger block onto the canonical entry draft.
 *
 * `prev` carries the draft the Raw lens started from; when the edited text
 * omits the `; :uid:` line (`block.uid === null`) we fall back to the prior
 * uid so hand-editing raw text never silently drops the identity that the
 * edit-mode concurrency guard depends on.
 */
export const parsedBlockToDraft = (
  block: Omit<ParsedBlock, 'unparsedLines'>,
  prev?: DraftState
): DraftState => ({
  date: block.date,
  payee: block.payee,
  status: block.status,
  note: block.note ?? '',
  uid: block.uid ?? prev?.uid,
  postings: block.postings.map((p) => ({
    account: p.account,
    amount: p.amount,
    currency: p.currency,
    ...(p.cost ? { cost: p.cost } : {}),
    ...(p.assertion ? { assertion: p.assertion } : {}),
  })),
});
