import { z } from 'zod';

// The decrypted body of a shared debt page. Every amount string is exactly as
// ledger printed it, already from the viewer's side (signs flipped by ledger).
const sharedDebtRowSchema = z.object({
  date: z.string(), // YYYY-MM-DD
  payee: z.string(),
  amount: z.string(),
  balance: z.array(z.string()), // one line per commodity
});

const sharedDebtNetSchema = z.object({
  amount: z.string(), // absolute, e.g. "€ 100.00"
  // viewer-owes: the person viewing owes the owner; owner-owes: the reverse.
  direction: z.enum(['viewer-owes', 'owner-owes']),
});

export const sharedDebtPageSchema = z.object({
  version: z.literal(1),
  ownerName: z.string(),
  person: z.string(),
  net: z.array(sharedDebtNetSchema),
  rows: z.array(sharedDebtRowSchema),
  generatedAt: z.string(),
});

export const shareMetaSchema = z.object({
  person: z.string(),
  ownerName: z.string(),
});

export type SharedDebtPage = z.infer<typeof sharedDebtPageSchema>;
export type SharedDebtRow = z.infer<typeof sharedDebtRowSchema>;
export type SharedDebtNet = z.infer<typeof sharedDebtNetSchema>;
export type ShareMeta = z.infer<typeof shareMetaSchema>;
