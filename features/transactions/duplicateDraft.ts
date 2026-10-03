import type { LoadedTransaction } from './actions';
import { todayLocal } from './quickEntrySpecs';

// A copy starts dated today. Saving it goes through create, which never sends
// a uid; clearing it here as well keeps the original's uid out of the form.
export const asDuplicate = (loaded: LoadedTransaction): LoadedTransaction => ({
  ...loaded,
  draft: { ...loaded.draft, date: todayLocal(), uid: undefined },
});
