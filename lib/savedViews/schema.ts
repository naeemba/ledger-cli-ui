import { z } from 'zod';

const NAME_MAX = 80;
const PATH_MAX = 2000;

export const savedViewNameSchema = z
  .string()
  .trim()
  .min(1, 'Name is required')
  .max(NAME_MAX, 'Name is too long')
  .refine((v) => !/[\x00-\x1F]/.test(v), 'Name contains control characters');

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ACCOUNT_SEGMENT = /^[A-Za-z0-9:_\- ]+$/;

const matchesAllowlist = (pathname: string): boolean => {
  if (pathname === '/transactions') return true;
  if (pathname === '/balance') return true;
  const balanceRange = pathname.match(
    /^\/balance\/(\d{4}-\d{2}-\d{2})\/(\d{4}-\d{2}-\d{2})$/
  );
  if (balanceRange)
    return ISO_DATE.test(balanceRange[1]) && ISO_DATE.test(balanceRange[2]);
  const payeeRange = pathname.match(
    /^\/payees\/(\d{4}-\d{2}-\d{2})\/(\d{4}-\d{2}-\d{2})$/
  );
  if (payeeRange)
    return ISO_DATE.test(payeeRange[1]) && ISO_DATE.test(payeeRange[2]);
  const register = pathname.match(/^\/registers\/monthly\/(.+)$/);
  if (register) return ACCOUNT_SEGMENT.test(decodeURIComponent(register[1]));
  const account = pathname.match(/^\/accounts\/(.+)$/);
  if (account) return ACCOUNT_SEGMENT.test(decodeURIComponent(account[1]));
  return false;
};

const hasTraversalSegment = (pathname: string): boolean =>
  pathname
    .split('/')
    .some((seg) => seg === '..' || /%2e%2e/i.test(seg) || /%2f/i.test(seg));

export const canonicalizeTargetPath = (raw: string): string => {
  if (typeof raw !== 'string' || raw.length === 0) {
    throw new Error('targetPath is required');
  }
  if (raw.length > PATH_MAX) {
    throw new Error('targetPath is too long');
  }
  if (!raw.startsWith('/') || raw.startsWith('//')) {
    throw new Error('targetPath must be a same-origin path');
  }
  if (raw.includes('://')) {
    throw new Error('targetPath must not contain a scheme');
  }

  let url: URL;
  try {
    url = new URL(raw, 'http://x');
  } catch {
    throw new Error('targetPath is not a valid path');
  }

  if (hasTraversalSegment(url.pathname)) {
    throw new Error('targetPath contains a traversal segment');
  }
  if (!matchesAllowlist(url.pathname)) {
    throw new Error('targetPath is not an allowlisted route');
  }

  const canonical = url.pathname + url.search;
  if (canonical.length > PATH_MAX) {
    throw new Error('targetPath is too long');
  }
  return canonical;
};

export const savedViewTargetPathSchema = z.string().transform((raw, ctx) => {
  try {
    return canonicalizeTargetPath(raw);
  } catch (e) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: e instanceof Error ? e.message : 'Invalid targetPath',
    });
    return z.NEVER;
  }
});

export const savedViewInputSchema = z.object({
  name: savedViewNameSchema,
  targetPath: savedViewTargetPathSchema,
});

export type SavedViewInput = z.infer<typeof savedViewInputSchema>;
