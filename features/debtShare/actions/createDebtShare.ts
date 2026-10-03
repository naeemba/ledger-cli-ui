'use server';

import { isSafeLedgerArg } from '@/features/transactions/entry/typeForms/fixBalancePreview';
import { auditRequestMeta, auditService } from '@/lib/audit';
import { requireUser } from '@/lib/auth/require-user';
import { hasSessionDek } from '@/lib/crypto/sessionKeys';
import { debtShareService } from '@/lib/debt-share';
import { safeErrorFields } from '@/lib/debt-share/safeError';
import { withUserLock } from '@/lib/journal/mutex';
import { createLogger } from '@/lib/log';
import { RATE_LIMIT_MESSAGE, WRITE, rateLimit } from '@/lib/rate-limit';
import { pull } from '@/lib/storage/sync';
import { revalidatePath } from 'next/cache';

const log = createLogger('debt-share');
const OWNER_NAME_MAX_LENGTH = 60;

export type DebtShareActionResult =
  { ok: true; shareId: string; key: string } | { ok: false; error: string };

export async function createDebtShareAction(
  person: string,
  ownerName: string
): Promise<DebtShareActionResult> {
  const user = await requireUser();
  if (!rateLimit(WRITE, user.id).allowed) {
    return { ok: false, error: RATE_LIMIT_MESSAGE };
  }
  const name = ownerName.trim();
  if (
    !isSafeLedgerArg(person) ||
    !name ||
    name.length > OWNER_NAME_MAX_LENGTH
  ) {
    return {
      ok: false,
      error: `Enter a name between 1 and ${OWNER_NAME_MAX_LENGTH} characters.`,
    };
  }
  if (!hasSessionDek(user.id)) {
    return { ok: false, error: 'Unlock your journal first.' };
  }
  try {
    // Building the first page reads the local journal: pull it under the same
    // lock every write uses, so the page matches what's saved and a double
    // click cannot make two links for one person.
    const link = await withUserLock(user.id, async () => {
      await pull(user.id);
      return debtShareService.create(user.id, person, name);
    });
    await auditService.record(user.id, {
      action: 'debtShare.create',
      result: 'success',
      targetUid: link.shareId,
      ...(await auditRequestMeta()),
    });
    revalidatePath('/debts', 'layout');
    return { ok: true, shareId: link.shareId, key: link.key };
  } catch (err) {
    log.error({ ...safeErrorFields(err) }, 'failed to create debt share');
    await auditService.record(user.id, {
      action: 'debtShare.create',
      result: 'failure',
      ...(await auditRequestMeta()),
    });
    return { ok: false, error: 'Could not create the link. Try again.' };
  }
}
