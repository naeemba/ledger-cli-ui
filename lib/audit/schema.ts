import { z } from 'zod';

export const AUDIT_ACTIONS = [
  'tx.add',
  'tx.edit',
  'tx.delete',
  'journal.import',
  'price.add',
  'price.delete',
  'crypto.enable',
  'crypto.unlock',
  'crypto.lock',
  'crypto.passphrase-change',
  'crypto.recovery-rotate',
  'crypto.reset',
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export const auditEventSchema = z.object({
  action: z.enum(AUDIT_ACTIONS),
  result: z.enum(['success', 'failure']),
  targetUid: z.string().optional(),
  bytesBefore: z.number().int().nonnegative().optional(),
  bytesAfter: z.number().int().nonnegative().optional(),
  // Small metadata only — never journal content.
  detail: z.record(z.string(), z.unknown()).optional(),
  ip: z.string().optional(),
  userAgent: z.string().optional(),
});

export type AuditEvent = z.infer<typeof auditEventSchema>;
