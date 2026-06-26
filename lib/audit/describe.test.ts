import { describe, expect, it } from 'vitest';
import { describeAuditEvent } from './describe';
import { AUDIT_ACTIONS } from './schema';
import type { AuditLog } from '@/db/schema/auditLog';

const row = (over: Partial<AuditLog>): AuditLog =>
  ({
    id: '01HSAMPLEULID00000000000000',
    userId: 'alice',
    action: 'tx.add',
    result: 'success',
    targetUid: null,
    bytesBefore: null,
    bytesAfter: null,
    detail: null,
    ip: null,
    userAgent: null,
    createdAt: new Date('2026-06-26T14:02:00Z'),
    ...over,
  }) as AuditLog;

describe('describeAuditEvent', () => {
  it('every action renders a non-empty label for both results', () => {
    for (const action of AUDIT_ACTIONS) {
      for (const result of ['success', 'failure'] as const) {
        const out = describeAuditEvent(row({ action, result }));
        expect(out.label.length).toBeGreaterThan(0);
        expect(out.icon).toBe(result);
      }
    }
  });

  it('uses friendly success copy', () => {
    expect(describeAuditEvent(row({ action: 'tx.edit' })).label).toBe(
      'Edited a transaction'
    );
    expect(describeAuditEvent(row({ action: 'crypto.unlock' })).label).toBe(
      'Unlocked journal'
    );
  });

  it('specializes import-failure copy by detail.reason', () => {
    expect(
      describeAuditEvent(
        row({
          action: 'journal.import',
          result: 'failure',
          detail: { reason: 'quota' },
        })
      ).label
    ).toBe('Import failed — over quota');
    expect(
      describeAuditEvent(
        row({
          action: 'journal.import',
          result: 'failure',
          detail: { reason: 'write-failed' },
        })
      ).label
    ).toBe('Import failed — could not write');
    expect(
      describeAuditEvent(
        row({ action: 'journal.import', result: 'failure', detail: null })
      ).label
    ).toBe('Import failed');
  });

  it('falls back gracefully for an unknown action', () => {
    const out = describeAuditEvent(
      row({ action: 'something.new' as AuditLog['action'] })
    );
    expect(out.label.length).toBeGreaterThan(0);
  });
});
