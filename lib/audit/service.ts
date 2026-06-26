import 'server-only';
import { AuditRepository } from './repository';
import { auditEventSchema, type AuditEvent } from './schema';
import { db } from '@/lib/db';
import { createLogger } from '@/lib/log';

const log = createLogger('audit');

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
}

export const auditService = new AuditService(new AuditRepository(db));
