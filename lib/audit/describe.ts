import type { AuditLog } from '@/db/schema/auditLog';

type Described = { label: string; icon: 'success' | 'failure' };

// Plain-English copy per action. [successLabel, failureLabel].
const COPY: Record<string, [string, string]> = {
  'tx.add': ['Added a transaction', 'Failed to add a transaction'],
  'tx.edit': ['Edited a transaction', 'Failed to edit a transaction'],
  'tx.delete': ['Deleted a transaction', 'Failed to delete a transaction'],
  'recurring.add': [
    'Added a recurring transaction',
    'Failed to add a recurring transaction',
  ],
  'recurring.delete': [
    'Deleted a recurring transaction',
    'Failed to delete a recurring transaction',
  ],
  'recurring.post': [
    'Posted a recurring occurrence',
    'Failed to post a recurring occurrence',
  ],
  'recurring.skip': [
    'Skipped a recurring occurrence',
    'Failed to skip a recurring occurrence',
  ],
  'journal.import': ['Imported journal', 'Import failed'],
  'price.add': ['Recorded a price', 'Failed to record a price'],
  'price.delete': ['Deleted a price', 'Failed to delete a price'],
  'crypto.enable': ['Enabled encryption', 'Failed to enable encryption'],
  'crypto.unlock': ['Unlocked journal', 'Failed to unlock journal'],
  'crypto.lock': ['Locked journal', 'Failed to lock journal'],
  'crypto.passphrase-change': [
    'Changed passphrase',
    'Failed to change passphrase',
  ],
  'crypto.recovery-rotate': [
    'Rotated recovery code',
    'Failed to rotate recovery code',
  ],
  'crypto.reset': ['Reset encryption', 'Failed to reset encryption'],
  'price.map': ['Mapped a commodity', 'Failed to map a commodity'],
  'commodity.create': ['Created a commodity', 'Failed to create a commodity'],
  'commodity.update': ['Updated a commodity', 'Failed to update a commodity'],
  'commodity.delete': ['Deleted a commodity', 'Failed to delete a commodity'],
};

// More specific copy for a failed import, keyed by the recorded reason code.
const IMPORT_FAILURE: Record<string, string> = {
  'quota': 'Import failed — over quota',
  'write-failed': 'Import failed — could not write',
};

export const describeAuditEvent = (row: AuditLog): Described => {
  const icon = row.result === 'success' ? 'success' : 'failure';

  if (row.action === 'journal.import' && row.result === 'failure') {
    const reason =
      row.detail &&
      typeof (row.detail as Record<string, unknown>).reason === 'string'
        ? ((row.detail as Record<string, unknown>).reason as string)
        : undefined;
    if (reason && IMPORT_FAILURE[reason]) {
      return { label: IMPORT_FAILURE[reason], icon };
    }
  }

  const pair = COPY[row.action];
  if (!pair) {
    return { label: row.action.replace(/[._]/g, ' '), icon };
  }
  return { label: row.result === 'success' ? pair[0] : pair[1], icon };
};
