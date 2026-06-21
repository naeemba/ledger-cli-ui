import { z } from 'zod';
import { SAVED_VIEW_ROUTES } from './routes';

const NAME_MAX = 80;
const PATH_MAX = 2000;

export const savedViewNameSchema = z
  .string()
  .trim()
  .min(1, 'Name is required')
  .max(NAME_MAX, 'Name is too long')
  .refine((v) => !/[\x00-\x1F]/.test(v), 'Name contains control characters');

const matchesAllowlist = (pathname: string): boolean =>
  SAVED_VIEW_ROUTES.some((route) => route.match(pathname));

const decodeSegment = (segment: string): string => {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
};

/**
 * Reject `..` path traversal. Each segment is decoded first so encoded forms
 * (`..%2Fetc` → `../etc`) are caught, while a legitimately encoded slash inside
 * a single segment (e.g. an account named `Assets:A/B` → `Assets%3AA%2FB`) is
 * not — once decoded it never introduces a standalone `..` component.
 */
const hasTraversalSegment = (pathname: string): boolean =>
  pathname.split('/').some((seg) =>
    decodeSegment(seg)
      .split('/')
      .some((part) => part === '..')
  );

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
