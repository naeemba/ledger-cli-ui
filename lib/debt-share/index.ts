import 'server-only';
import { DebtShareRepository } from './repository';
import { DebtShareService } from './service';
import { getSessionDek } from '@/lib/crypto/sessionKeys';
import { db } from '@/lib/db';
import { runLedgerForUser } from '@/utils/runLedgerForUser';

export const debtShareRepository = new DebtShareRepository(db);

// runLedgerForUser, not runLedger: runLedger adds `--sort -date`, which makes
// ledger accumulate the running total from the newest row, and it would pull
// again under a lock the caller (push) already holds.
export const debtShareService = new DebtShareService({
  repository: debtShareRepository,
  runLedger: (userId, args) => runLedgerForUser(userId, args),
  getDek: getSessionDek,
});

export type { PersonShareLink, ShareLink } from './service';
