import { desc, eq } from 'drizzle-orm';
import type { AuditEvent } from './schema';
import { auditLog, type AuditLog } from '@/db/schema/auditLog';
import type { DbInstance } from '@/lib/db/connection';
import { generateUid } from '@/lib/journal/uid';

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

  async listByUser(userId: string, limit = 100): Promise<AuditLog[]> {
    return this.db
      .select()
      .from(auditLog)
      .where(eq(auditLog.userId, userId))
      .orderBy(desc(auditLog.createdAt))
      .limit(limit);
  }
}
