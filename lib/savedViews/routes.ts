import isValidAccount from '@/utils/validateAccount';

/**
 * Single source of truth for the routes a saved view is allowed to target.
 *
 * Both the targetPath allowlist (`lib/savedViews/schema.ts`) and the human
 * label (`features/savedViews/routeLabel.ts`) derive from this table, so the
 * two stay in sync when a route is added, removed, or reshaped.
 *
 * `match` receives the pathname (search/hash already stripped) and returns
 * `true` when the route applies. `label` builds the display string; it is only
 * called when `match` returned `true`. Account segments are matched against the
 * full account character set (`isValidAccount`) rather than a narrower regex so
 * every routable account can be saved.
 */

const ISO_DATE_RANGE = (prefix: string): RegExp =>
  new RegExp(`^/${prefix}/(\\d{4}-\\d{2}-\\d{2})/(\\d{4}-\\d{2}-\\d{2})$`);

const safeDecode = (segment: string): string => {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
};

const accountSegment = (pathname: string, prefix: string): string | null => {
  const m = pathname.match(new RegExp(`^/${prefix}/(.+)$`));
  if (!m) return null;
  const account = safeDecode(m[1]);
  return isValidAccount(account) ? account : null;
};

export type SavedViewRoute = {
  match: (pathname: string) => boolean;
  label: (pathname: string) => string;
};

export const SAVED_VIEW_ROUTES: SavedViewRoute[] = [
  {
    match: (p) => p === '/transactions',
    label: () => 'Transactions',
  },
  {
    match: (p) => p === '/balance' || ISO_DATE_RANGE('balance').test(p),
    label: () => 'Balance',
  },
  {
    match: (p) => ISO_DATE_RANGE('payees').test(p),
    label: () => 'Payees',
  },
  {
    match: (p) => accountSegment(p, 'registers/monthly') !== null,
    label: (p) => `Register: ${accountSegment(p, 'registers/monthly') ?? p}`,
  },
  {
    match: (p) => accountSegment(p, 'accounts') !== null,
    label: (p) => `Account: ${accountSegment(p, 'accounts') ?? p}`,
  },
];
