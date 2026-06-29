import { z } from 'zod';

export const TAB_IDS = ['types', 'form', 'raw'] as const;
export type TabId = (typeof TAB_IDS)[number];

export const DEFAULT_TAB_ORDER: TabId[] = ['types', 'form', 'raw'];

// Canonical human-readable label for each tab. Single source of truth shared by
// the entry shell (TransactionEntry) and the Settings reorder UI so relabels
// can never drift between the two call sites.
export const TAB_LABELS: Record<TabId, string> = {
  types: 'Types',
  form: 'Form',
  raw: 'Raw',
};

export const entryTabOrderSchema = z.array(z.enum(TAB_IDS));

const isTabId = (value: string): value is TabId =>
  (TAB_IDS as readonly string[]).includes(value);

// Keep the valid ids in the given order (first occurrence wins), then append
// any canonical tab the caller omitted. Guarantees all three are always present
// so ordering can never hide a tab.
export function normalizeTabOrder(
  order: readonly string[] | null | undefined
): TabId[] {
  const seen = new Set<TabId>();
  const result: TabId[] = [];
  for (const id of order ?? []) {
    if (isTabId(id) && !seen.has(id)) {
      seen.add(id);
      result.push(id);
    }
  }
  for (const id of DEFAULT_TAB_ORDER) {
    if (!seen.has(id)) result.push(id);
  }
  return result;
}

export function parseEntryTabOrder(raw: string | null | undefined): TabId[] {
  if (!raw) return [...DEFAULT_TAB_ORDER];
  return normalizeTabOrder(raw.split(','));
}

export function serializeEntryTabOrder(order: readonly TabId[]): string {
  return normalizeTabOrder(order).join(',');
}
