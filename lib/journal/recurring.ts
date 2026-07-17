import { createHash } from 'crypto';
import { z } from 'zod';
import { parsePostingLine } from './parser';
import type { ParsedPosting } from './parser';
import { UID_LINE_REGEX } from './uid';
import { formatPosting, postingSchema } from '@/lib/transactions/schema';

const PERIOD_MAX = 120;

// Structural check only — the period expression's validity is ledger's call:
// every write is verified with `ledger stats` and rolled back on rejection.
const periodSchema = z
  .string()
  .trim()
  .min(1, 'Period is required')
  .max(PERIOD_MAX, 'Period is too long')
  .refine(
    (s) => !/[\x00-\x1f;]/.test(s),
    'Period contains forbidden characters'
  );

const noteSchema = z
  .string()
  .max(500, 'Note is too long')
  .refine(
    (s) => !/[\x00-\x08\x0b-\x1f]/.test(s),
    'Note contains forbidden characters'
  )
  .optional();

const uidSchema = z
  .string()
  .regex(
    /^[0-9A-HJKMNP-TV-Z]{26}$/,
    'uid must be a 26-character Crockford ULID'
  )
  .optional();

const handledSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'handled must be YYYY-MM-DD')
  .optional();

export const recurringDraftSchema = z.object({
  period: periodSchema,
  note: noteSchema,
  uid: uidSchema,
  handled: handledSchema,
  budget: z.boolean().optional(),
  postings: z
    .array(postingSchema)
    .min(2, 'At least 2 postings are required')
    .max(50, 'At most 50 postings are allowed'),
});

export type RecurringDraft = z.infer<typeof recurringDraftSchema>;

export const recurringScheduleInputSchema = z.object({
  unit: z.enum(['day', 'week', 'month', 'year']),
  count: z.number().int().min(1).max(366),
  anchor: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Anchor must be YYYY-MM-DD')
    .refine((s) => !Number.isNaN(Date.parse(s)), 'Anchor is not a real date'),
});

export const recurringCreateSchema = recurringDraftSchema
  .omit({ period: true, handled: true, uid: true })
  .extend({ schedule: recurringScheduleInputSchema });

export type RecurringCreateDraft = z.infer<typeof recurringCreateSchema>;

export type ParsedRecurring = RecurringDraft & {
  file: string;
  startLine: number;
  endLine: number;
  fingerprint: string;
  rawBlock: string;
};

export const formatRecurring = (draft: RecurringDraft): string => {
  const header = `~ ${draft.period}`;
  const uidLines = draft.uid ? [`    ; :uid: ${draft.uid}`] : [];
  const budgetLines = draft.budget ? ['    ; :budget:'] : [];
  const handledLines = draft.handled
    ? [`    ; :handled: ${draft.handled}`]
    : [];
  const noteLines = (draft.note ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => `    ; ${line}`);
  const postings = draft.postings.map(formatPosting);
  return [
    header,
    ...uidLines,
    ...budgetLines,
    ...handledLines,
    ...noteLines,
    ...postings,
  ].join('\n');
};

export const fingerprintRecurring = (draft: RecurringDraft): string =>
  createHash('sha256').update(formatRecurring(draft)).digest('hex');

const RECURRING_HEADER_REGEX = /^~\s+(\S.*)$/;
const HANDLED_LINE_REGEX = /^\s*;\s*:handled:\s*(\d{4}-\d{2}-\d{2})\s*$/;
const BUDGET_LINE_REGEX = /^\s*;\s*:budget:\s*$/;
const COMMENT_LINE_REGEX = /^\s*;\s?(.*)$/;

const parseRecurringBlock = (
  block: string
): Omit<
  ParsedRecurring,
  'file' | 'startLine' | 'endLine' | 'rawBlock' | 'fingerprint'
> | null => {
  const lines = block.split('\n');
  const header = lines[0]?.match(RECURRING_HEADER_REGEX);
  if (!header) return null;

  let uid: string | undefined;
  let handled: string | undefined;
  let budget: boolean | undefined;
  const noteLines: string[] = [];
  const postings: ParsedPosting[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === '') continue;
    const uidMatch = line.match(UID_LINE_REGEX);
    if (uidMatch) {
      uid = uidMatch[1];
      continue;
    }
    if (BUDGET_LINE_REGEX.test(line)) {
      budget = true;
      continue;
    }
    const handledMatch = line.match(HANDLED_LINE_REGEX);
    if (handledMatch) {
      handled = handledMatch[1];
      continue;
    }
    const commentMatch = line.match(COMMENT_LINE_REGEX);
    if (commentMatch) {
      noteLines.push(commentMatch[1].trim());
      continue;
    }
    const posting = parsePostingLine(line);
    if (posting) postings.push(posting);
    // Unparsed lines are tolerated (skipped), mirroring parseJournalFile.
  }

  return {
    period: header[1].trim(),
    uid,
    handled,
    budget,
    note: noteLines.length > 0 ? noteLines.join('\n') : undefined,
    postings,
  };
};

/** Extracts periodic (`~`) directives from a journal file. Line numbers are
 * 1-indexed, mirroring parseJournalFile. */
export const parseRecurringFile = (
  filePath: string,
  text: string
): ParsedRecurring[] => {
  const lines = text.split('\n');
  const result: ParsedRecurring[] = [];
  let blockStart: number | null = null;
  let blockLines: string[] = [];

  const flush = (endLine: number) => {
    if (blockStart === null) return;
    const rawBlock = blockLines.join('\n');
    const parsed = parseRecurringBlock(rawBlock);
    if (parsed) {
      result.push({
        ...parsed,
        file: filePath,
        startLine: blockStart + 1,
        endLine: endLine + 1,
        rawBlock,
        fingerprint: fingerprintRecurring(parsed),
      });
    }
    blockStart = null;
    blockLines = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (blockStart === null) {
      if (RECURRING_HEADER_REGEX.test(line)) {
        blockStart = i;
        blockLines = [line];
      }
      continue;
    }
    if (line.trim() === '') {
      flush(i - 1);
      continue;
    }
    blockLines.push(line);
  }
  flush(lines.length - 1);
  return result;
};
