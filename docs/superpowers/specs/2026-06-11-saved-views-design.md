# Saved Views — Design Spec

**Date:** 2026-06-11
**Phase:** 6 (Power features)
**Status:** Approved (pending implementation plan)

## Summary

Let a user save a filtered page URL under a name and recall it from a "Saved views" panel on the Dashboard. Scope is intentionally narrow: a URL-bookmark model (no per-page schema), six allowlisted routes that already accept filter params, and a single management surface (the Dashboard panel) — no sidebar group, no dedicated `/saved-views` page.

This is the third Phase 6 item shipped after CSV exports, base-currency selector, and the daily price fetcher.

## Goals / non-goals

**Goals**
- Save the current URL + a user-chosen name from any filter toolbar on six pages.
- List saved views on the Dashboard, click to navigate, rename or delete inline.
- Mirror the existing `template` table + Repository + Service convention.

**Non-goals (v1)**
- Per-filter human summaries ("Last 90 days · Expenses:Food"). The Dashboard row shows the user's name plus a coarse route label derived from the pathname.
- Sidebar group, command-palette action, pin/favorite ordering.
- Saving static (non-filterable) pages (`/portfolio`, `/net-worth`, `/debts`, `/reconcile`, `/monthly`). The URL there is already a fixed bookmark.
- Detecting stale targets (e.g. a saved view to `/registers/monthly/Expenses:Food` after the user renames that account). The view simply navigates and the destination page renders its normal empty state.

## Architecture decisions

### Data model: URL bookmark (single string)

Each saved view stores the full path + query as one canonicalized string. Alternatives considered:
- **Typed filter state per page** — JSON object per route schema. Lets us render per-param summaries, but every new filter requires a migration and per-page renderer. Rejected: summary isn't a v1 goal and the schema cost is real.
- **Content-addressed dedup** — hash the URL and reject duplicate saves. Solves a problem we don't have on a single-user app and adds friction.

URL bookmark wins on simplicity and is forward-compatible: if per-param summaries become valuable later, we layer a per-route renderer over the same `targetPath` column without a migration.

### Surfacing: Dashboard only, inline save button on filterable pages

The PLAN entry calls this out: "pin a filtered Payees/Register query and reach it from the Dashboard." We keep that exact shape. The inline button is the creation surface; the Dashboard panel is the management surface. No sidebar group (would add a per-render query to every authenticated page) and no dedicated `/saved-views` route (Dashboard is one click away anyway).

### Allowlisted routes

The inline button mounts on six pages that actually have parameterizable state:

| Route                            | Filter UI surface                                    |
| -------------------------------- | ---------------------------------------------------- |
| `/transactions`                  | `features/transactions/Filters.tsx`                  |
| `/balance` and `/balance/:from/:to` | `components/DateFilter/DateFilter.tsx`            |
| `/payees/:from/:to`              | `components/DateFilter/DateFilter.tsx`               |
| `/registers/monthly/:account`    | new `features/registers/monthly/RegisterHeader.tsx`  |
| `/accounts/:account`             | new `features/accounts/AccountHeader.tsx`            |

Server-side `targetPath` validation rejects any saved path outside this allowlist. This is a cheap guard against someone hand-crafting a save to `/api/upload` or another route.

## Data model

### New table

```ts
// db/schema/savedView.ts
export const savedView = sqliteTable(
  'savedView',
  {
    id: text('id').primaryKey(),               // ULID from lib/journal/uid
    userId: text('userId').notNull().references(() => user.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),              // 1..80 chars
    targetPath: text('targetPath').notNull(),  // canonicalized "/path?search", 1..2000 chars
    createdAt: integer('createdAt', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
    updatedAt: integer('updatedAt', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  },
  (t) => ({ uniqueNamePerUser: uniqueIndex('savedView_user_name').on(t.userId, t.name) })
);
```

Exported from `db/schema/index.ts` alongside the other tables. A new Drizzle migration adds the table and the index.

### Validation (`lib/savedViews/schema.ts`)

`savedViewInputSchema` (Zod):
- `name`: trimmed; 1–80 chars; no leading/trailing whitespace after trim; rejects control chars (`/^[^\x00-\x1F]+$/`). Same character rules as templates.
- `targetPath`: must start with `/`; must not contain `://`; ≤ 2000 chars. Parsed via `new URL(targetPath, 'http://x')` and rebuilt as `url.pathname + url.search`. Preserves search-param order (some filter UIs reconstruct URLs by string substitution and reordering would change generated URLs). Drops fragments. Rejects `..` segments and `%2F` in path segments (path-traversal guard, mirroring `/api/upload`).
- Final canonical pathname must match one of: `/transactions`, `/balance`, `/balance/:from/:to`, `/payees/:from/:to`, `/registers/monthly/:account`, `/accounts/:account`. The `:account` placeholder accepts the existing `validateAccount` character rules; `:from` / `:to` accept ISO-date strings only (`parseISODateStrict`).

The canonical form is what gets stored.

## Backend

Three-layer pattern, identical to templates:

### `lib/savedViews/repository.ts`

```ts
class SavedViewRepository {
  find(userId: string, id: string): Promise<SavedView | null>
  findByName(userId: string, name: string): Promise<SavedView | null>
  list(userId: string): Promise<SavedView[]>          // ORDER BY lower(name)
  create(userId: string, input: SavedViewInput): Promise<SavedView>   // throws on UNIQUE violation
  update(userId: string, id: string, patch: Partial<SavedViewInput>): Promise<SavedView | null>
  delete(userId: string, id: string): Promise<boolean>
}
```

Repos stay internal. Public consumers go through the service.

### `lib/savedViews/service.ts`

```ts
type SaveResult =
  | { ok: true; view: SavedView }
  | { ok: false; reason: 'name-conflict'; existingId: string }
  | { ok: false; reason: 'invalid-path' }
  | { ok: false; reason: 'invalid-name' };

type RenameResult =
  | { ok: true; view: SavedView }
  | { ok: false; reason: 'name-conflict'; existingId: string }
  | { ok: false; reason: 'invalid-name' }
  | { ok: false; reason: 'not-found' };

class SavedViewService {
  list(userId: string): Promise<SavedView[]>
  save(userId: string, input: SavedViewInput, opts?: { overwriteId?: string }): Promise<SaveResult>
  rename(userId: string, id: string, name: string): Promise<RenameResult>
  delete(userId: string, id: string): Promise<void>     // silent no-op if not found
}
```

`save` with `overwriteId` updates the existing row in place (preserves `id` and `createdAt`, bumps `updatedAt`). Without `overwriteId`, a name collision returns `{ ok: false, reason: 'name-conflict', existingId }`.

### `lib/savedViews/index.ts` (module surface)

Exports `savedViewService` (singleton), the `SavedView` / `SavedViewInput` / `SaveResult` / `RenameResult` types, and the Zod schemas. Mirrors `lib/templates/index.ts`.

### Server actions — one file each under `features/savedViews/actions/`

- `saveSavedView.ts`
- `renameSavedView.ts`
- `deleteSavedView.ts`

Each action:
1. Calls `requireUser()`.
2. Parses input with the corresponding Zod schema.
3. Delegates to the service.
4. On success, calls `revalidatePath('/', 'layout')` (refreshes the Dashboard panel and every page's `existingNames`).
5. Returns the service's discriminated result for the client to render inline.

No `ledger:<userId>` cache-tag bump — saved views never touch the journal.

## UI components

### `features/savedViews/SaveViewButton.tsx` (client component)

Props:
```ts
type Props = {
  targetPath: string;          // captured by parent via usePathname + useSearchParams
  existingNames: string[];     // for client-side conflict pre-check (server still authoritative)
};
```

A `Button variant="outline" size="sm"` with a lucide `Bookmark` icon and label "Save view". On click, opens a shadcn `Dialog`:
- One `Input` for the name (autofocused, max 80, trimmed on blur).
- A read-only line showing the resolved route label + the raw `targetPath` (so the user can confirm what they're saving).
- Inline `Alert variant="destructive"` for discriminated `SaveResult` reasons. On `name-conflict`, the alert renders a `Replace` button that retries the action with `overwriteId`.
- Footer: `Save` + `Cancel`. On success: closes the dialog, fires a Sonner success toast.

### Mounting the inline button

Each filterable surface gets a tiny addition:
- **`features/transactions/Filters.tsx`** — append `<SaveViewButton />` at the end of the toolbar row.
- **`components/DateFilter/DateFilter.tsx`** — append next to the `Apply` button. (Shared across `/balance/:from/:to` and `/payees/:from/:to`.) DateFilter is already a client component, so prop wiring is straightforward; it accepts an optional `saveViewSlot?: ReactNode` so static pages that also use DateFilter (none today, but defensively) don't accidentally render it.
- **`features/registers/monthly/RegisterHeader.tsx`** (new, small) — top-right of `/registers/monthly/:account`. Replaces the inline header markup currently in the route page.
- **`features/accounts/AccountHeader.tsx`** (new, small) — top-right of `/accounts/:account`. Same shape.

Each page's server component fetches `existingNames` from `savedViewService.list(userId)` and forwards it to the button.

### `features/dashboard/SavedViewsCard.tsx` (server component)

Renders a shadcn `Card` titled "Saved views", placed in `Dashboard.tsx` **above** the "Recent transactions" section. Body:

- For each view: a `Link` to `view.targetPath`. Primary line is `view.name`; secondary line (`text-muted-foreground text-xs`) is the result of `routeLabel(targetPath)` — a small helper that pattern-matches the pathname:
  - `/transactions` → `"Transactions"`
  - `/balance` or `/balance/:from/:to` → `"Balance"`
  - `/payees/:from/:to` → `"Payees"`
  - `/registers/monthly/:account` → `"Register: {account}"`
  - `/accounts/:account` → `"Account: {account}"`
- A `DropdownMenu` (kebab) per row with `Rename` (opens a `Dialog` reusing the rename pattern from templates) and `Delete` (opens `ConfirmDialog` with `variant="destructive"`).
- Empty state when the list is empty: one-line hint — *"No saved views yet. Look for the Bookmark icon next to filters on Transactions, Balance, or Payees."* Card is always rendered; cheaper than threading a render decision through the Dashboard.

### Dialog reuse

`features/templates/RenameDialog.tsx` is already generic over a rename action callback. The saved-view rename dialog reuses it directly (or extracts the dialog body into `components/RenameNameDialog/` if a clean extraction is cheaper than parameterizing — the implementation plan will decide). `ConfirmDialog` is already shared.

### No sidebar changes, no new route

Per the surfacing decision: Dashboard is the only management surface.

## Data flow

**Read (Dashboard render):**
`Dashboard.tsx` calls `savedViewService.list(userId)` once. Result is passed to `SavedViewsCard`. No `unstable_cache` wrapper — the indexed read is sub-millisecond. The same `list(userId)` call is reused on each filterable page to populate `existingNames` for the inline button. Two queries per page render is fine.

**Write (Save flow):**
1. User clicks "Save view" → dialog opens with `targetPath` captured from `usePathname()` + `useSearchParams().toString()`.
2. Submit → `saveSavedView({ name, targetPath })`.
3. Action: `requireUser` → Zod parse → `savedViewService.save(userId, …)`.
4. Service returns discriminated result:
   - `ok: true` → action calls `revalidatePath('/', 'layout')`; client shows toast and closes dialog.
   - `name-conflict` → client renders `Replace existing view "X"?` inline; on confirm, re-calls action with `overwriteId`.
   - `invalid-name` / `invalid-path` → inline error in the dialog.

**Rename / delete:** identical pattern. Each action calls `revalidatePath('/', 'layout')` on success.

**No journal cache interaction.** Saved-view mutations never touch `runLedger`'s `ledger:<userId>` tag.

## Edge cases

- **Concurrent rename → save race**: SQLite `UNIQUE` is authoritative; service catches the constraint violation and returns `name-conflict`. No app-level locking.
- **Stale account in targetPath** (`/registers/monthly/Expenses:Food` after rename in journal): the saved view still navigates; destination page renders empty. We do not validate target reachability on Dashboard render.
- **`targetPath` with fragment**: dropped during canonicalization.
- **Empty `targetPath` query** (e.g. `/balance/2026-01-01/2026-03-31`): allowed — the path itself is parameterized.
- **`targetPath` length ceiling**: 2000 chars is far above any realistic filter combination. Zod rejects longer.
- **Name length / control chars**: rejected by Zod with discriminated `invalid-name`.

## Testing

Mirrors the templates feature's test layout. All tests use Vitest + `lib/test-utils/db.ts` (fresh in-memory SQLite per test). No `ledger` shell-out anywhere.

### Unit tests

**`lib/savedViews/schema.test.ts`**
- `name`: rejects empty, whitespace-only, >80 chars, control chars; trims input.
- `targetPath`: accepts each allowlisted route with representative query strings; rejects `/api/upload`, `https://evil/`, `../traversal`, `%2F`-containing segments, `>2000` chars.
- Canonicalization: drops `#fragment`; preserves search-param order; rejects `://`.

**`lib/savedViews/repository.test.ts`**
- `create` → `find` round-trip.
- `list` orders by `lower(name)`; filters by `userId`.
- `create` on duplicate `(userId, name)` throws `UNIQUE` violation.
- `update` patches and bumps `updatedAt`; returns `null` for non-existent id.
- `delete` returns `true` then `false` for the same id.
- Cascade: deleting the parent `user` removes their saved views.

**`lib/savedViews/service.test.ts`**
- `save` happy path → `{ ok: true, view }`.
- `save` with conflict → `{ ok: false, reason: 'name-conflict', existingId }`.
- `save` with `overwriteId` → updates row in place (same `id`, same `createdAt`, new `targetPath`, bumped `updatedAt`).
- `save` with invalid path / name → respective discriminated reasons.
- `rename` conflict, not-found, and happy paths.
- `delete` of nonexistent id is a silent no-op.

### Action tests

**`features/savedViews/actions/*.test.ts`**
- Each: rejects when `requireUser` returns null; passes through the service's result; calls `revalidatePath('/', 'layout')` on success only.

### Component tests

**`features/savedViews/SaveViewButton.test.tsx`**
- Opens dialog on click.
- Calls action with `{ name, targetPath }`.
- Renders `name-conflict` Replace flow; second submit passes `overwriteId`.
- Closes on success; fires toast.

**`features/dashboard/SavedViewsCard.test.tsx`**
- Renders empty state hint.
- Renders list of `Link`s with correct `href` and route labels.
- Rename / delete dropdown items invoke the right actions.

### Integration test

**`features/savedViews/integration.test.ts`**
End-to-end against a fresh DB + stub `requireUser`:
1. Save a view from `/transactions?account=Expenses:Food`.
2. `list` reflects it.
3. Rename to a colliding name → `name-conflict`.
4. Rename to a free name → success.
5. Delete → `list` is empty.

## Migration / rollout

- One Drizzle migration adds the `savedView` table and the `(userId, name)` UNIQUE index.
- No data backfill (zero existing rows).
- No env vars, no feature flag — the Dashboard panel renders its empty state for users with no saved views.

## Out of scope / future work

- Per-filter human summaries ("Last 90 days · Expenses:Food") — layered renderer over `targetPath`.
- Sidebar group of saved views.
- Pin / favorite / drag-to-reorder.
- Saved views on static (non-filterable) pages.
- Command-palette "Save current view…" action.
- Export saved views via the CSV pipeline (not meaningful).

## Open questions

None at design time. Implementation plan will decide between extracting a shared `RenameNameDialog` versus parameterizing the templates one.

## File map (new + modified)

**New files:**
- `db/schema/savedView.ts`
- `db/migrations/<timestamp>_saved_view.sql` (Drizzle-generated)
- `lib/savedViews/schema.ts`, `schema.test.ts`
- `lib/savedViews/repository.ts`, `repository.test.ts`
- `lib/savedViews/service.ts`, `service.test.ts`
- `lib/savedViews/index.ts`
- `features/savedViews/actions/saveSavedView.ts`, `.test.ts`
- `features/savedViews/actions/renameSavedView.ts`, `.test.ts`
- `features/savedViews/actions/deleteSavedView.ts`, `.test.ts`
- `features/savedViews/SaveViewButton.tsx`, `.test.tsx`
- `features/dashboard/SavedViewsCard.tsx`
- `features/savedViews/routeLabel.ts`
- `features/savedViews/integration.test.ts`
- `features/registers/monthly/RegisterHeader.tsx`
- `features/accounts/AccountHeader.tsx`

**Modified files:**
- `db/schema/index.ts` — export `savedView`.
- `features/dashboard/Dashboard.tsx` — mount `SavedViewsCard` above Recent transactions.
- `features/transactions/Filters.tsx` — append `SaveViewButton`.
- `components/DateFilter/DateFilter.tsx` — accept and render an optional `SaveViewButton` slot.
- `app/registers/monthly/[account]/page.tsx` — use the new `RegisterHeader`.
- `app/accounts/[account]/page.tsx` — use the new `AccountHeader`.
- `PLAN.md` — tick the Saved views entry in Phase 6 (on completion).
