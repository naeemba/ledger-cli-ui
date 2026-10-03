import type { LoadedTransaction } from './actions';
import { todayLocal } from './quickEntrySpecs';

/**
 * A copy starts dated today, unmarked, with no uid. Saving it goes through
 * create, which never sends a uid; clearing it here as well keeps the
 * original's uid out of the form.
 *
 * A balance assertion described the balance on the original's date, so a copy
 * drops it. The exception is a posting with no amount (a Fix balance entry),
 * where the assertion is what sets the amount.
 */
export const asDuplicate = (loaded: LoadedTransaction): LoadedTransaction => ({
  ...loaded,
  draft: {
    ...loaded.draft,
    date: todayLocal(),
    status: 'none',
    uid: undefined,
    postings: loaded.draft.postings.map(({ assertion, ...posting }) =>
      assertion && posting.amount.trim() === ''
        ? { ...posting, assertion }
        : posting
    ),
  },
});
