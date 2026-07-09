# PageContainer — consistent page layout

**Date:** 2026-07-10
**Status:** Approved, pending implementation

## Problem

App pages render at inconsistent widths and vertical rhythm. Prices and
price-history look narrow and re-centered; currencies is double-padded; reports
fill the full column; dashboard uses a different gap than everything else.

The outer column is **already** consistent: `AppShell` wraps every non-bare
page in `mx-auto w-full max-w-7xl px-4 pt-8 pb-…` (`components/AppShell/AppShell.tsx:54`).
Width is single-source there. The divergence comes entirely from feature roots
layering their own wrappers on top of that column:

| Page(s) | Ad-hoc outer wrapper | Problem |
| --- | --- | --- |
| prices, price-history | `mx-auto w-full max-w-3xl space-y-6 p-4` | re-narrows, re-centers, doubles padding |
| currencies | `space-y-6 p-4 sm:p-6` | doubles padding |
| netWorth, monthly, transactions, reconcile, payees, portfolio | `flex flex-col gap-6` | fine, but ad-hoc/duplicated |
| dashboard | `flex flex-col gap-8` | different vertical rhythm |
| balance, debts, payees, import | inline in `page.tsx` | no shared wrapper |

## Solution

One shared wrapper component every app page renders its content into. It owns
**only** the page-content rhythm; width and padding stay owned by `AppShell` so
they cannot diverge.

### Component

`components/PageContainer/PageContainer.tsx`

```tsx
import { cn } from '@/lib/utils';

type Props = {
  children: React.ReactNode;
  className?: string;
};

const PageContainer = ({ children, className }: Props) => (
  <div className={cn('flex flex-col gap-6', className)}>{children}</div>
);

export default PageContainer;
```

- Canonical vertical rhythm: `gap-6` (the majority value). Dashboard's `gap-8`
  and the `space-y-6` variants collapse into it.
- **No** `max-w-*`, **no** `mx-auto`, **no** `p-*`. Width, horizontal padding,
  and top/bottom padding remain in `AppShell`. This is what makes every page
  identical.
- `className` passthrough is the only escape hatch, for a genuine per-page need.
- Barrel `components/PageContainer/index.ts` re-exporting default, matching the
  existing `components/AppShell` folder convention.

### Rollout

Replace each page's ad-hoc outer wrapper with `<PageContainer>`; do not nest a
`PageContainer` inside another. Prefer editing the feature root component (so
nested subroutes reusing it inherit the wrapper); for pages that compose inline
in `page.tsx`, wrap there.

**24 app routes in scope:**

accounts, accounts/[account], balance, balance/[from]/[to], currencies,
dashboard, debts, import, monthly, net-worth, payees, payees/[from]/[to],
portfolio, prices, prices/[symbol], reconcile, registers/monthly/[account],
settings, settings/activity, settings/passkeys, templates, transactions,
transactions/new, transactions/[uid]/edit.

Per page: strip `max-w-*`, `mx-auto`, and page-level `p-*`/`sm:p-*` from the
outer wrapper (they duplicate AppShell); fold whatever vertical spacing it used
(`gap-8`, `space-y-6`) into PageContainer's `gap-6`.

### Excluded — bare pages

AppShell returns these without sidebar/header chrome; they own full-bleed
layouts and must NOT get PageContainer:

`/`, `/account/deleted`, `/sign-in`, `/sign-in/error`, `/sign-up`,
`/crypto/setup`, `/crypto/unlock`

(Source of truth: `AUTH_PATHS`, `CRYPTO_PATHS`, `PUBLIC_PATHS` in
`components/AppShell/`.)

## Non-goals

- No page-title/header ownership. Each page keeps rendering its own `<h1>`.
  (Title-size inconsistency is a separate follow-up.)
- No change to `AppShell`'s outer column, banner slot, or bare-path logic.
- No new width variants (uniform `max-w-7xl` for all).

## Verification

- `pnpm lint` and `pnpm build` clean.
- Visual: a wide page (balance) and a former-narrow page (prices) render at the
  same width with the same vertical rhythm; no double padding on currencies.
