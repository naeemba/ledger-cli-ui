import 'server-only';
import { journalRepository } from '@/lib/journal';
import { getJournalCacheTag } from '@/lib/journal/layout';
import { type TransactionData } from '@/lib/transactions/model';
import { unstable_cache } from 'next/cache';

const buildLoader = (tag: string, fingerprint: string) =>
  unstable_cache(
    // `unstable_cache` serializes its result to JSON, which would strip the
    // methods off Transaction instances. Project to plain TransactionData here
    // so cache hits and misses return the same, rehydration-ready shape.
    async (userId: string): Promise<TransactionData[]> => {
      // getFingerprint (below) already pulled the canonical journal into the
      // local cache, so read straight from the repository.
      const journal = await journalRepository.list(userId);
      return journal.transactions.map((t) => t.toData());
    },
    ['journal-transactions', tag, fingerprint],
    { revalidate: 60, tags: [tag] }
  );

export const loadJournalTransactions = async (
  userId: string
): Promise<TransactionData[]> => {
  const fingerprint = await journalRepository.getFingerprint(userId);
  return buildLoader(getJournalCacheTag(userId), fingerprint)(userId);
};
