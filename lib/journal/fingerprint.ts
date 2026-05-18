import { createHash } from 'crypto';
import { formatTransaction } from '@/lib/transactions/schema';
import type { TransactionDraft } from '@/lib/transactions/schema';

export const fingerprintDraft = (draft: TransactionDraft): string =>
  createHash('sha256').update(formatTransaction(draft)).digest('hex');
