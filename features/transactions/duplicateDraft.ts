import type { LoadedTransaction } from './actions';
import { todayLocal } from './quickEntrySpecs';

/**
 * A copy starts dated today, unmarked, with no uid. Saving it goes through
 * create, which never sends a uid; clearing it here as well keeps the
 * original's uid out of the form.
 *
 * A balance assertion described the balance on the original's date, so a copy
 * drops it. The exception is a Fix balance entry, where no posting has an
 * amount and the assertion is what sets one. When any posting has an amount,
 * an empty line just takes the rest. An assertion left on it would force that
 * line to reach the old balance on the copy's date, which almost never
 * balances the entry.
 */
export const asDuplicate = (loaded: LoadedTransaction): LoadedTransaction => {
  const isFixBalance = loaded.draft.postings.every(
    (posting) => posting.amount.trim() === ''
  );
  return {
    ...loaded,
    draft: {
      ...loaded.draft,
      date: todayLocal(),
      status: 'none',
      uid: undefined,
      postings: loaded.draft.postings.map(({ assertion, ...posting }) =>
        isFixBalance && assertion ? { ...posting, assertion } : posting
      ),
    },
  };
};
