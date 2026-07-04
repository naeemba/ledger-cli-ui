import type { DraftState } from './draftReducer';
import type { ParsedBlock } from '@/lib/journal/parser';
import { Txn } from '@/lib/transactions/model';

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
): DraftState => Txn.fromParsedBlock(block, prev);
