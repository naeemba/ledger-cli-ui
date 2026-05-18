import { z } from 'zod';

const ACCOUNT_MAX = 256;
const PAYEE_MAX = 200;
const NOTE_MAX = 500;
const CURRENCY_MAX = 10;
const MIN_POSTINGS = 2;
const MAX_POSTINGS = 50;

const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD')
  .refine((s) => !Number.isNaN(Date.parse(s)), 'Date is not a real date');

const accountSchema = z
  .string()
  .trim()
  .min(1, 'Account is required')
  .max(ACCOUNT_MAX, 'Account is too long')
  .refine((s) => !s.startsWith('-'), 'Account cannot start with "-"')
  .refine(
    (s) => !/[\x00-\x1f;]/.test(s),
    'Account contains forbidden characters'
  )
  .refine(
    (s) => !/ {2,}/.test(s),
    'Account cannot contain two or more consecutive spaces'
  );

const payeeSchema = z
  .string()
  .trim()
  .min(1, 'Payee is required')
  .max(PAYEE_MAX, 'Payee is too long')
  .refine(
    (s) => !/[\x00-\x1f;]/.test(s),
    'Payee contains forbidden characters'
  );

const noteSchema = z
  .string()
  .max(NOTE_MAX, 'Note is too long')
  .refine(
    (s) => !/[\x00-\x08\x0b-\x1f]/.test(s),
    'Note contains forbidden characters'
  )
  .optional();

const amountSchema = z
  .string()
  .trim()
  .regex(/^-?\d+(\.\d+)?$|^$/, 'Amount must be a number');

const currencySchema = z
  .string()
  .trim()
  .min(1, 'Currency is required')
  .max(CURRENCY_MAX, 'Currency is too long')
  .refine(
    (s) => /^[^\s\x00-\x1f;]+$/.test(s),
    'Currency contains forbidden characters'
  );

const uidSchema = z
  .string()
  .regex(
    /^[0-9A-HJKMNP-TV-Z]{26}$/,
    'uid must be a 26-character Crockford ULID'
  )
  .optional();

export const postingSchema = z.object({
  account: accountSchema,
  amount: amountSchema,
  currency: currencySchema,
});

export const transactionDraftSchema = z
  .object({
    date: dateSchema,
    payee: payeeSchema,
    status: z.enum(['cleared', 'pending', 'none']).default('none'),
    note: noteSchema,
    uid: uidSchema,
    postings: z
      .array(postingSchema)
      .min(MIN_POSTINGS, `At least ${MIN_POSTINGS} postings are required`)
      .max(MAX_POSTINGS, `At most ${MAX_POSTINGS} postings are allowed`),
  })
  .superRefine((draft, ctx) => {
    const blanks = draft.postings.filter((p) => p.amount === '').length;
    if (blanks > 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Only one posting may have a blank amount (auto-balance)',
        path: ['postings'],
      });
      return;
    }
    if (blanks === 1) return; // ledger will balance the blank line

    // All amounts filled — they must sum to zero per currency.
    const byCurrency = new Map<string, number>();
    for (const p of draft.postings) {
      const value = Number(p.amount);
      if (!Number.isFinite(value)) return; // amount schema will surface this
      byCurrency.set(p.currency, (byCurrency.get(p.currency) ?? 0) + value);
    }
    for (const [currency, total] of byCurrency) {
      if (Math.abs(total) > 1e-9) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Postings in ${currency} do not balance (sum = ${total})`,
          path: ['postings'],
        });
      }
    }
  });

export type TransactionDraft = z.infer<typeof transactionDraftSchema>;
export type PostingDraft = z.infer<typeof postingSchema>;

const ACCOUNT_COLUMN = 48;

const formatPosting = (p: PostingDraft): string => {
  const indent = '    ';
  if (p.amount === '') return `${indent}${p.account}`;
  const amount = `${p.currency} ${p.amount}`;
  const padding = Math.max(
    2,
    ACCOUNT_COLUMN - indent.length - p.account.length
  );
  return `${indent}${p.account}${' '.repeat(padding)}${amount}`;
};

const statusMarker = (status: TransactionDraft['status']): string => {
  if (status === 'cleared') return ' *';
  if (status === 'pending') return ' !';
  return '';
};

export const formatTransaction = (draft: TransactionDraft): string => {
  const header = `${draft.date}${statusMarker(draft.status)} ${draft.payee}`;
  const uidLines = draft.uid ? [`    ; :uid: ${draft.uid}`] : [];
  const noteLines = (draft.note ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => `    ; ${line}`);
  const postings = draft.postings.map(formatPosting);
  return [header, ...uidLines, ...noteLines, ...postings].join('\n');
};
