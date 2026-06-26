import type { ActivityType, AuditCursor } from '@/lib/audit';

export const ACTIVITY_PAGE_SIZE = 50;

const TYPES: ActivityType[] = ['all', 'transactions', 'imports', 'security'];
const RESULTS = ['all', 'success', 'failure'] as const;
type ResultFilter = (typeof RESULTS)[number];

export const parseType = (raw: string | undefined): ActivityType =>
  TYPES.includes(raw as ActivityType) ? (raw as ActivityType) : 'all';

export const parseResult = (raw: string | undefined): ResultFilter =>
  RESULTS.includes(raw as ResultFilter) ? (raw as ResultFilter) : 'all';

export const encodeCursor = (row: { createdAt: Date; id: string }): string =>
  `${row.createdAt.getTime()}_${row.id}`;

export const decodeCursor = (
  raw: string | undefined
): AuditCursor | undefined => {
  if (!raw) return undefined;
  const sep = raw.indexOf('_');
  if (sep <= 0) return undefined;
  const ms = Number(raw.slice(0, sep));
  const id = raw.slice(sep + 1);
  if (!Number.isInteger(ms) || ms <= 0 || id.length === 0) return undefined;
  return { createdAt: new Date(ms), id };
};

export const buildActivityQuery = (opts: {
  type: ActivityType;
  result: ResultFilter;
  before?: string;
}): string => {
  const p = new URLSearchParams();
  if (opts.type !== 'all') p.set('type', opts.type);
  if (opts.result !== 'all') p.set('result', opts.result);
  if (opts.before) p.set('before', opts.before);
  const s = p.toString();
  return s ? `?${s}` : '';
};
