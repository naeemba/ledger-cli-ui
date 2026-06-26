import { and, desc, eq, inArray, lt, or } from 'drizzle-orm';
import type { AuditAction } from './schema';
import type { AuditEvent } from './schema';
import { auditLog, type AuditLog } from '@/db/schema/auditLog';
import type { DbInstance } from '@/lib/db/connection';
import { generateUid } from '@/lib/journal/uid';

export type AuditCursor = { createdAt: Date; id: string };

type ListOpts = {
  limit?: number;
  before?: AuditCursor;
  actions?: AuditAction[];
  result?: 'success' | 'failure';
};

export class AuditRepository {
  constructor(private readonly db: DbInstance) {}

  async insert(userId: string, event: AuditEvent): Promise<AuditLog> {
    const rows = await this.db
      .insert(auditLog)
      .values({
        id: generateUid(),
        userId,
        action: event.action,
        result: event.result,
        targetUid: event.targetUid ?? null,
        bytesBefore: event.bytesBefore ?? null,
        bytesAfter: event.bytesAfter ?? null,
        detail: event.detail ?? null,
        ip: event.ip ?? null,
        userAgent: event.userAgent ?? null,
      })
      .returning();
    return rows[0];
  }

  async listByUser(userId: string, opts: ListOpts = {}): Promise<AuditLog[]> {
    const { limit = 100, before, actions, result } = opts;
    return this.db
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.userId, userId),
          before
            ? or(
                lt(auditLog.createdAt, before.createdAt),
                and(
                  eq(auditLog.createdAt, before.createdAt),
                  lt(auditLog.id, before.id)
                )
              )
            : undefined,
          actions && actions.length > 0
            ? inArray(auditLog.action, actions)
            : undefined,
          result ? eq(auditLog.result, result) : undefined
        )
      )
      .orderBy(desc(auditLog.createdAt), desc(auditLog.id))
      .limit(limit);
  }
}
