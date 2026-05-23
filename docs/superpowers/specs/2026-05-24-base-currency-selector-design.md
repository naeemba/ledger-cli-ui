# Base Currency Selector (Design)

Status: approved during brainstorming, awaiting implementation plan.
Date: 2026-05-24.

## Goal

Replace the single environment-variable `DEFAULT_CURRENCY` (used today by 14 server-rendered consumer sites as the `-X` target for `ledger` conversion and as the display currency in `formatAmount`) with a per-user, per-session base currency. Each signed-in user can save a personal default through a new `/settings` page, and override it on the fly for the current browser via a combobox in the header. The set of selectable currencies is sourced from the user's own journal (`ledger commodities`), so the picker always lists exactly what the journal actually contains.

## Scope

In:

- A new `userSetting` SQLite table (typed columns) holding the saved per-user base currency.
- A `lib/settings/` module (Repository + Service + schema) following the project's existing one-domain-per-folder pattern.
- A request-scoped `getBaseCurrency()` resolver: `cookie > saved setting > env DEFAULT_CURRENCY`.
- A new `getAvailableCurrencies()` helper that fans out to a new `JournalRepository.listCommodities()` (cached through the existing `runLedger` mtime-keyed cache).
- A new header `BaseCurrencyPicker` that writes a long-lived `baseCurrency` cookie via a server action and shows a visual override indicator.
- A new `/settings` page (the first occupant of a new sidebar "Account" section) with a "Base currency" form and an inline session-override notice + clear button.
- A missing-rate banner in `AppShell` that surfaces commodities ledger couldn't convert under the active base.
- Migration of all 14 existing call sites from `getDefaultCurrency()` to `await getBaseCurrency()`.
- Vitest coverage of the new module, the resolver, and the missing-rate helper, matching the bar set for `lib/journal/*` in Phase 4.1.

Out (named explicitly so they don't creep in):

- Per-currency formatting locale overrides (the `DATE_LOCALE` analogue for amounts). Out of scope.
- Editing `P` price directives through the UI. Phase 8.
- Multi-currency dashboards (showing each amount in both its native and base currency side-by-side).
- A "favorites" / pinned-currency list — the picker stays alphabetical with the active base pinned to the top.
- Adding more user settings in the same change. The table is shaped to grow, but only `baseCurrency` lands here.
- Refactoring `formatAmount` itself. Its signature is unchanged; only its inputs change.

## Architecture overview

New modules under `lib/settings/`:

- `lib/settings/repository.ts` — `UserSettingRepository`: `get(userId)`, `upsertBaseCurrency(userId, value)`.
- `lib/settings/service.ts` — `UserSettingService`: thin wrapper over the repository (room to grow into normalization when more settings land).
- `lib/settings/schema.ts` — `baseCurrencySchema` Zod schema.
- `lib/settings/getBaseCurrency.ts` — request-scoped resolver, `React.cache`-wrapped.
- `lib/settings/getAvailableCurrencies.ts` — request-scoped picker source, `React.cache`-wrapped.
- `lib/settings/getMissingRateCommodities.ts` — request-scoped helper backing the banner.
- `lib/settings/index.ts` — module exports following the `lib/journal/`, `lib/templates/` pattern.

Touched:

- `db/schema/userSetting.ts` (new) + `db/schema/index.ts` export.
- `lib/journal/repository.ts` — adds `listCommodities(userId)`.
- `app/layout.tsx` / `components/AppShell/AppShell.tsx` — mounts `<BaseCurrencyBanner />` between header and page.
- `components/Header/AppHeader.tsx` — mounts `<BaseCurrencyPicker />` between the mega-menu and command-palette trigger; user `DropdownMenu` gains a `Settings` link above the existing `Sign out` action.
- `components/nav/config.ts` — adds an `Account` section with `Settings` entry.
- `app/settings/page.tsx` (new) + `features/settings/` (new) — settings page + form.
- `features/settings/actions/setSavedBaseCurrency.ts`, `features/settings/actions/setSessionBaseCurrency.ts`, `features/settings/actions/clearSessionBaseCurrency.ts` — one server action per file, per the project convention.
- 14 call sites lose `utils/getDefaultCurrency.ts` and gain `await getBaseCurrency()`.
- `utils/getDefaultCurrency.ts` — deleted.
- `.env.example` — comment updated; `DEFAULT_CURRENCY` stays as the fallback for users without a saved setting.

Nothing else in the auth flow, journal mutation pipeline, or report pages changes.

## Section 1 — Data model & helpers

`db/schema/userSetting.ts`:

```ts
import { sql } from 'drizzle-orm';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { user } from './user';

export const userSetting = sqliteTable('userSetting', {
  userId: text('userId')
    .primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),
  baseCurrency: text('baseCurrency').notNull(),
  updatedAt: integer('updatedAt', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
});

export type UserSetting = typeof userSetting.$inferSelect;
```

A row is created lazily on first save — there is no backfill migration. Users who have never visited `/settings` simply fall through the resolver to `env.DEFAULT_CURRENCY`. Cascade-delete keeps the table aligned with `user`.

`lib/settings/schema.ts`:

```ts
import { z } from 'zod';

export const baseCurrencySchema = z
  .string()
  .trim()
  .min(1)
  .max(32)
  .regex(/^[^\x00-\x1f]+$/, 'Currency code may not contain control characters');
```

The character rule mirrors what `lib/transactions/schema.ts` already enforces on commodities written to the journal.

`lib/settings/repository.ts` is a straightforward Drizzle `UserSettingRepository` with `get(userId): Promise<UserSetting | null>` and `upsertBaseCurrency(userId, value): Promise<void>` (using SQLite `INSERT ... ON CONFLICT(userId) DO UPDATE`).

`lib/settings/service.ts` exposes `save(userId, value)` and `get(userId)` over the repo; future settings can layer validation/normalization here without touching consumers.

## Section 2 — Currency discovery

`JournalRepository.listCommodities(userId): Promise<string[]>`:

- Shells out via the existing `runLedger` wrapper: `ledger -f <main> commodities`.
- Splits on newlines, trims each line, strips one optional pair of surrounding `"` (ledger emits quoted names for commodities with whitespace, e.g. `"My Coin"`).
- Filters blank lines, deduplicates, sorts case-insensitively (`Intl.Collator`).
- Cached automatically through `runLedger`'s mtime-keyed wrapper from Phase 4.3, so the call invalidates on writes without adding a new cache tag.

`lib/settings/getAvailableCurrencies.ts`:

```ts
async function getAvailableCurrencies(userId: string): Promise<{
  currencies: string[];   // sorted, active base pinned to the front
  base: string;           // the resolved base currency
}>
```

`React.cache`-wrapped so the header picker, the settings form, and the banner share one read per request. The active base is always present in `currencies` even when it is no longer in `ledger commodities` (defensive — a user who deletes all USD postings shouldn't lose the saved-USD value from the picker).

Empty-journal users (`ledger commodities` returns nothing) get a picker containing only the resolved base. The settings page form surfaces a tiny inline hint `"Import a journal or add a transaction to see more options"` to explain why the list is short.

## Section 3 — Resolution & cookie write path

`lib/settings/getBaseCurrency.ts`:

```ts
import { cache } from 'react';
import { cookies } from 'next/headers';
import { env } from '@/lib/env';
import { getOptionalUser } from '@/lib/auth';
import { userSettingRepository } from './';
import { baseCurrencySchema } from './schema';

export const getBaseCurrency = cache(async (): Promise<string> => {
  const cookieValue = (await cookies()).get('baseCurrency')?.value;
  const cookieOk = cookieValue && baseCurrencySchema.safeParse(cookieValue).success;
  if (cookieOk) return cookieValue!;

  const user = await getOptionalUser();
  if (user) {
    const row = await userSettingRepository.get(user.id);
    if (row) return row.baseCurrency;
  }

  return env.DEFAULT_CURRENCY;
});
```

Validation on read prevents a tampered cookie from injecting arbitrary strings into shelled-out `-X` arguments. A bad cookie falls through silently (the resolver does not mutate cookies — Next RSC reads cannot write). The settings page renders a "clear bad cookie" action when it detects mismatch between cookie and saved value.

Two server actions write cookies / DB. One action file each, under `features/settings/actions/`:

- `setSavedBaseCurrency(formData)` — `requireUser()` → `baseCurrencySchema.parse()` → `userSettingService.save(user.id, value)` → `revalidatePath('/', 'layout')` → `redirect('/settings')` (with a flash toast).
- `setSessionBaseCurrency(value)` — `baseCurrencySchema.parse()` → `(await cookies()).set('baseCurrency', value, { maxAge: 60 * 60 * 24 * 365, sameSite: 'lax', httpOnly: false, path: '/' })` → `revalidatePath('/', 'layout')`. Called by the header combobox.
- `clearSessionBaseCurrency()` — `(await cookies()).delete('baseCurrency')` → `revalidatePath('/', 'layout')`. Called by the "reset" affordance in both the header dropdown and the settings page.

`httpOnly: false` is intentional: the cookie has no security significance — it's a presentation toggle, and we want the option to make the picker fully client-managed later without rolling a new endpoint. `sameSite: 'lax'` is the standard non-tracking choice.

`revalidatePath('/', 'layout')` covers every report — every consumer reads through `getBaseCurrency()` and the underlying `runLedger` cache keys already include the journal mtime (Phase 4.3), so changing `-X` invalidates the right entries automatically.

## Section 4 — UI: header combobox & settings page

### Header combobox

`components/BaseCurrencyPicker/BaseCurrencyPicker.tsx` — client component wrapping the reusable `<Combobox>` from Phase 3.3.

Mounted by `AppHeader` between the mega-menu and the command-palette trigger. The header is a server component; it resolves three values via the helpers above and passes them in:

```tsx
<BaseCurrencyPicker
  current={base}
  available={currencies}
  savedDefault={savedRow?.baseCurrency ?? null}
/>
```

Behavior:

- Trigger label shows the active currency code (e.g. `USD`).
- A small accent dot (using `--accent`) renders to the right of the code when `current !== savedDefault` — i.e. when a session override is active.
- Selecting an item fires `setSessionBaseCurrency(value)`. The action's `revalidatePath('/', 'layout')` causes every visible report to re-render with the new `-X`.
- The dropdown's footer slot renders, when overridden: `Session override active · Reset to <savedDefault>` (or `Reset to <env default>` if the user has no saved value). Click → `clearSessionBaseCurrency()` or `setSessionBaseCurrency(savedDefault)` depending on whether a saved default exists.
- Width: fixed `min-w-[120px]` so the picker doesn't jitter as currency-code lengths change.
- Hidden on `/login` and `/signup` — `AppShell` already short-circuits those routes; the picker only renders inside the signed-in layout branch.

### Settings page

`app/settings/page.tsx` — server component, lightweight:

```tsx
const user = await requireUser();
const [{ currencies, base }, saved] = await Promise.all([
  getAvailableCurrencies(user.id),
  userSettingRepository.get(user.id),
]);

return <Settings base={base} currencies={currencies} savedDefault={saved?.baseCurrency ?? null} />;
```

`features/settings/Settings.tsx` — server component composing:

- A shadcn `Card` titled "Base currency" containing the form (`BaseCurrencyForm.tsx`, client) — labeled `<Combobox>` populated from `currencies`, defaulting to `savedDefault ?? base`, and a `Save` button bound to `setSavedBaseCurrency`. On success: a sonner toast `"Default currency saved"`.
- Beneath the form, when `base !== (savedDefault ?? env.DEFAULT_CURRENCY)`: an inline shadcn `Alert` (`variant="default"`) reading _"You're currently viewing reports in `<base>`. This overrides your saved default."_ with a `Clear session override` button bound to `clearSessionBaseCurrency`.
- (Reserved space below for future settings cards.)

Sidebar navigation: `components/nav/config.ts` gains an `Account` section with a single `Settings` entry (`/settings`, lucide `Settings` icon). The command palette picks it up automatically. The user `DropdownMenu` in the header also gets a `Settings` link.

Page width matches `AppShell`'s `mx-auto w-full max-w-7xl` wrapper — no per-page overrides.

## Section 5 — Missing-rate banner

`lib/settings/getMissingRateCommodities.ts`:

```ts
async function getMissingRateCommodities(
  userId: string,
  baseCurrency: string,
): Promise<{ unconverted: string[] }>
```

Implementation:

1. Run `ledger -f <main> balance --flat --no-total -X <base>` via the existing `runLedger` wrapper.
2. Parse each non-empty line, extract the commodity code(s) it shows (typically one per line; multi-commodity lines stack vertically in ledger's output).
3. Collect every commodity that isn't `<base>` into a `Set<string>`, sort case-insensitively, return.

`React.cache`-wrapped. The single `balance -X` call is enough — if any posting couldn't be converted, ledger emits it in its native commodity. We don't need a second un-converted call: the set of commodities ledger refused to convert is precisely the set we want to flag.

`components/BaseCurrencyBanner/BaseCurrencyBanner.tsx` (server component) calls the helper and renders nothing when `unconverted` is empty. Otherwise:

> _Some amounts couldn't be converted to **`<base>`**. Missing exchange rates from: **EUR, JPY**. Affected reports show original currencies inline._

Rendered as a shadcn `Alert` (`variant="default"`, not destructive — this is a warning, not a failure) with an info icon. Mounted by `AppShell` once, between the header and the page slot, so every report-bearing page benefits without per-page wiring. Routes that don't display converted amounts (`/import`, `/transactions/new`, `/settings`, `/templates`) still see the banner — the wording stays accurate ("affected reports") and the single-mount design avoids per-route logic.

The wording deliberately does **not** include a "Learn more" link in v1 — we don't have copy for that page yet, and a placeholder link is worse than no link.

Empty-journal users see no banner: `balance -X` returns nothing, `unconverted` is empty, the component renders null.

## Section 6 — Migration of existing call sites

All 14 sites change shape from:

```ts
import getDefaultCurrency from '@/utils/getDefaultCurrency';
const currency = getDefaultCurrency() ?? 'USD';
```

to:

```ts
import { getBaseCurrency } from '@/lib/settings';
const currency = await getBaseCurrency();
```

Inventory:

- `app/balance/page.tsx`, `app/balance/[from]/[to]/page.tsx`
- `app/debts/page.tsx`
- `app/accounts/[account]/page.tsx`
- `app/registers/monthly/[account]/page.tsx`
- `features/payees/Payees.tsx`
- `features/transactions/EditTransaction.tsx`, `features/transactions/NewTransaction.tsx`
- `features/monthlyComparison/MonthlyComparison.tsx`, `features/monthlyComparison/MonthlyComparison.utils.ts`
- `features/reconcile/Reconcile.tsx`
- `features/netWorth/NetWorth.tsx`
- `features/dashboard/Dashboard.tsx`
- `features/portfolio/Portfolio.tsx`

Every site already runs in an async server-component or async-page context. `EditTransaction.tsx` / `NewTransaction.tsx` pass `defaultCurrency` as a prop to the client `TransactionForm`; the prop name stays (it remains the per-row default for new postings), only its source changes.

`MonthlyComparison.utils.ts` is the only call site that is not itself async — it's a pure helper invoked from a server component. Refactor: take `currency` as a parameter rather than fetching it. Keeps the helper pure (its tests stay synchronous) and pushes the `await` up to the caller, which already does the same for other data.

`utils/getDefaultCurrency.ts` is deleted in the same change — no dual-codepath transition.

`.env.example`: keep `DEFAULT_CURRENCY=USD`; update its comment from "Currency used for `-X` conversions in ledger calls" to "Fallback currency for users who haven't set a base currency in /settings".

## Section 7 — Testing

Pure / repository tests:

- `lib/settings/schema.test.ts` — `baseCurrencySchema` accepts `USD`, `EUR`, `Kirt`, `My Coin`; rejects empty string, all-whitespace, length > 32, control characters (`\x00`–`\x1f`).
- `lib/settings/repository.test.ts` — `UserSettingRepository`: `get` returns null when no row, `upsertBaseCurrency` creates then updates, FK cascade-deletes the row when the parent user is deleted. Uses the same `setupTestDb` helper as `lib/templates/repository.test.ts`.
- `lib/settings/service.test.ts` — one `save` + `get` round-trip; mostly a seam for future validation.
- `lib/journal/repository.test.ts` (extend) — `listCommodities` parses representative `ledger commodities` outputs: simple codes (`USD`), quoted with spaces (`"My Coin"`), one-per-line ordering, blank lines tolerated, deduplication, case-insensitive sort.

Resolution helper — `lib/settings/getBaseCurrency.test.ts`:

- cookie present + DB row + env → returns cookie value.
- cookie absent + DB row + env → returns DB row.
- cookie absent + no DB row + env → returns env value.
- malformed cookie → treated as absent (no throw, falls through).
- `React.cache` keeps a single resolver call across multiple invocations within a request (asserted by counting mocked DB hits).

Mocks `next/headers` `cookies()` and `getOptionalUser()`. No DB or HTTP.

Missing-rate helper — `lib/settings/getMissingRateCommodities.test.ts`:

- All postings already in base ccy → empty `unconverted`.
- Mixed-commodity balance after `-X` → expected `unconverted` set; sorted; deduped.
- Empty journal → empty `unconverted`, no throw.

Mocks `runLedger`; no real `ledger` invocation. The full pipeline runs through the integration smoke that already exists for journals.

Server actions — light, one happy-path each:

- `features/settings/actions/setSavedBaseCurrency.test.ts` — asserts `userSettingService.save` was called with the validated value.
- `features/settings/actions/setSessionBaseCurrency.test.ts` — asserts the cookie was set with the expected name + options.
- `features/settings/actions/clearSessionBaseCurrency.test.ts` — asserts the cookie was deleted.

Skipped explicitly:

- React Testing Library on the picker / form. Same bar as Phase 5.2 — no jsdom yet.
- E2E "click picker, see report change". Manual smoke during implementation.

Coverage target: 95%+ on `lib/settings/*`. No coverage target change elsewhere.

## Implementation order

Each step is independently mergeable. Steps 1–4 are server-side only and invisible to the user.

1. Schema + repository + service + Zod schema for `userSetting`. Tests.
2. `JournalRepository.listCommodities` + tests.
3. `getBaseCurrency`, `getAvailableCurrencies`, `getMissingRateCommodities`. Tests.
4. Migrate the 14 call sites to `await getBaseCurrency()`. Delete `utils/getDefaultCurrency.ts`. `.env.example` comment update.
5. Server actions (`setSavedBaseCurrency`, `setSessionBaseCurrency`, `clearSessionBaseCurrency`). Tests.
6. `BaseCurrencyBanner` mounted in `AppShell`.
7. `BaseCurrencyPicker` mounted in `AppHeader`. Visual override indicator + reset affordance.
8. `/settings` page + `Settings` nav entry + user-menu link. Form, save action wiring, inline session-override notice.

## Open questions

None at design time. If the implementation surfaces any, they are recorded on the plan, not retro-added to this spec.
