import {
  RESULT_FILTERS,
  type ActivityType,
  type AuditCursor,
  type ResultFilter,
} from '@/lib/audit';

export const ACTIVITY_PAGE_SIZE = 50;

const TYPES: ActivityType[] = ['all', 'transactions', 'imports', 'security'];

export const parseType = (raw: string | undefined): ActivityType =>
  TYPES.includes(raw as ActivityType) ? (raw as ActivityType) : 'all';

export const parseResult = (raw: string | undefined): ResultFilter =>
  RESULT_FILTERS.includes(raw as ResultFilter) ? (raw as ResultFilter) : 'all';

// The cursor is the boundary row's ULID id. ULIDs are unique and
// lexicographically time-ordered, so an id-only keyset paginates newest-first
// without depending on `createdAt` timestamp precision (see AuditCursor).
export const encodeCursor = (row: { id: string }): string => row.id;

const ULID_REGEX = /^[0-9A-HJKMNP-TV-Z]{26}$/;

export const decodeCursor = (
  raw: string | undefined
): AuditCursor | undefined => {
  if (!raw || !ULID_REGEX.test(raw)) return undefined;
  return { id: raw };
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
