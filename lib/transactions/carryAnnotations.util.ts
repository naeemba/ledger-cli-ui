import type { Annotation } from '@/lib/transactions/posting';

/**
 * Carry a posting's cost (`@@`) and balance-assertion (`=`) annotations onto a
 * mapped posting, omitting each key when absent.
 *
 * Every posting mapper (edit draft, raw-block draft, template draft, row view)
 * must preserve these annotations: they participate in the concurrency
 * fingerprint and in whether a multi-currency transaction balances to zero.
 * Dropping one silently breaks a save or an edit, so the idiom lives here once
 * to keep all mappers in sync.
 */
export const carryAnnotations = (p: {
  cost?: Annotation;
  assertion?: Annotation;
}): { cost?: Annotation; assertion?: Annotation } => ({
  ...(p.cost ? { cost: p.cost } : {}),
  ...(p.assertion ? { assertion: p.assertion } : {}),
});
