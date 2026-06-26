import 'server-only';
import { AuditRepository } from './repository';
import type { AuditCursor } from './repository';
import { auditEventSchema, type AuditEvent, type AuditAction } from './schema';
import type { AuditLog } from '@/db/schema/auditLog';
import { db } from '@/lib/db';
import { createLogger } from '@/lib/log';

const log = createLogger('audit');

export type ActivityType = 'all' | 'transactions' | 'imports' | 'security';

/** Result-filter union: single source of truth shared by the param parser
 * (features/activity) and the activity UI. */
export const RESULT_FILTERS = ['all', 'success', 'failure'] as const;
export type ResultFilter = (typeof RESULT_FILTERS)[number];

const TYPE_ACTIONS: Record<Exclude<ActivityType, 'all'>, AuditAction[]> = {
  transactions: ['tx.add', 'tx.edit', 'tx.delete'],
  imports: ['journal.import'],
  security: [
    'crypto.enable',
    'crypto.unlock',
    'crypto.lock',
    'crypto.passphrase-change',
    'crypto.recovery-rotate',
    'crypto.reset',
  ],
};

export class AuditService {
  constructor(private readonly repo: AuditRepository) {}

  /**
   * Records an audit event. BEST-EFFORT: validates the event, inserts it, and
   * swallows any failure (logged, never thrown) so an audit-write problem can
   * never fail or roll back the user's actual action.
   */
  async record(userId: string, event: AuditEvent): Promise<void> {
    const parsed = auditEventSchema.safeParse(event);
    if (!parsed.success) {
      log.error(
        {
          action: (event as { action?: unknown }).action,
          issues: parsed.error.issues,
        },
        'invalid audit event dropped'
      );
      return;
    }
    try {
      await this.repo.insert(userId, parsed.data);
    } catch (err) {
      log.error({ err, action: parsed.data.action }, 'audit insert failed');
    }
  }

  /** Read a user's own audit events, newest first, with optional group/result
   * filters and a keyset cursor. Reads are NOT best-effort — a query failure
   * propagates so the route error boundary can surface it. */
  async listForUser(
    userId: string,
    opts: {
      limit?: number;
      before?: AuditCursor;
      type?: ActivityType;
      result?: ResultFilter;
    } = {}
  ): Promise<AuditLog[]> {
    const { limit = 50, before, type = 'all', result = 'all' } = opts;
    return this.repo.listByUser(userId, {
      limit,
      before,
      actions: type === 'all' ? undefined : TYPE_ACTIONS[type],
      result: result === 'all' ? undefined : result,
    });
  }
}

export const auditService = new AuditService(new AuditRepository(db));
