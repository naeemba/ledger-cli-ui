import 'server-only';
import { journalRepository } from '@/lib/journal';
import { getJournalCacheTag } from '@/lib/journal/layout';
import { type Transaction } from '@/lib/journal/parser';
import { unstable_cache } from 'next/cache';

const buildLoader = (tag: string, fingerprint: string) =>
  unstable_cache(
    async (userId: string): Promise<Transaction[]> => {
      // getFingerprint (below) already pulled the canonical journal into the
      // local cache, so read straight from the repository.
      const journal = await journalRepository.list(userId);
      return journal.transactions;
    },
    ['journal-transactions', tag, fingerprint],
    { revalidate: 60, tags: [tag] }
  );

export const loadJournalTransactions = async (
  userId: string
): Promise<Transaction[]> => {
  const fingerprint = await journalRepository.getFingerprint(userId);
  return buildLoader(getJournalCacheTag(userId), fingerprint)(userId);
};
