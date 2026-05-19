# Phase 4.2 — Transaction Templates (Design)

Status: approved during brainstorming, awaiting implementation plan.
Date: 2026-05-19.

## Goal

Phase 4.2 of `PLAN.md`. After Phase 4.1 made transactions editable, this phase introduces reusable transaction *shapes* — templates. A template is a saved blueprint (payee, accounts, currencies, optional amounts, optional note) that the user can apply to prefill the new-transaction form. Templates live in SQLite and never touch journal files.

The phase also cleans up Phase 4.1's deviation from the project's feature-folder convention: `TransactionForm`, `TransactionTable`, `Filters`, and the three transaction action files move from `app/transactions/*` into `features/transactions/*`, with thin shells left in `app/`. This is included here (not as a separate phase) because it's small, mechanical, and directly affects the files Phase 4.2 needs to touch.

## Scope

In:

- Drizzle `template` table with a unique `(userId, name)` index.
- Zod schema (`TemplateDraft`) for the persisted JSON payload: a transaction draft minus `date` and `uid`, with relaxed balance rules.
- Repository helpers (`listTemplates`, `getTemplate`, `saveTemplate`, `renameTemplate`, `deleteTemplate`) and the matching server actions in `features/templates/`.
- A `/templates` management page: list, use, rename (inline dialog), delete (`ConfirmDialog`), empty state.
- "Save as template" affordance in `TransactionForm` (create and edit modes) and in the `/transactions` row-action dropdown — same dialog component, with a name-conflict alert offering Overwrite.
- "Start from template…" combobox on `/transactions/new` that routes to `/transactions/new?template=<id>`; the page reads the template server-side and prefills the form.
- Refactor of Phase 4.1's transaction surface into `features/transactions/` with thin `app/` shells.

Out (named explicitly so they don't creep in):

- Per-template usage counter or telemetry.
- Auto-suggestion of templates from typed payees.
- Sharing templates between users (Phase 7).
- Tags, folders, or any grouping beyond a flat alphabetical list.
- Scheduling / periodic execution. Templates are shape, not schedule. Phase 6's budget work owns scheduling.
- Editing template `draft` fields inline on `/templates`. Only `name` is renamable in place; to change the draft, the user clicks Use, edits in the transaction form, and re-saves with Overwrite.
- Bulk operations (delete many, export).
- Diff preview when overwriting.

## Architectural decisions (locked during brainstorming)

- **Mixed content.** A template stores whatever the user has in the form at save time — blank amounts stay blank, filled amounts stay filled. No "skeleton vs full" mode flag; the data itself is the configuration.
- **Three save entry points.** New-transaction page, edit-transaction page, and the row-action dropdown on `/transactions`. All three reuse the same `SaveAsTemplateButton` component and dialog.
- **Two use entry points.** A combobox on `/transactions/new` (quick access) and a dedicated `/templates` page (management). Both route to `/transactions/new?template=<id>`.
- **Name uniqueness per user.** Enforced both in the DB (unique index on `(userId, name)`) and in the UI (inline conflict alert with an Overwrite button). Saving with an existing name does NOT silently replace — the user must explicitly pick Overwrite or Rename.
- **`date` and `uid` are not stored.** Date defaults to today on use. UID is stamped fresh by `addTransaction` when the resulting transaction lands in the journal.
- **Balance is not enforced on templates.** `transactionDraftSchema`'s `superRefine` runs on the resulting transaction, not on the template draft. Templates with multiple blank-amount postings are valid.
- **No journal-cache invalidation on template mutations.** Templates don't affect ledger output; only `revalidatePath('/templates')` is needed after rename/delete.

## File map

**Net-new — data layer:**

- `db/schema/template.ts` — Drizzle table + `Template` inferred type.
- `db/schema/index.ts` — re-export `template`.
- `lib/templates/schema.ts` — `templateNameSchema`, `templateDraftSchema`, `templateInputSchema`, `TemplateDraft` and `TemplateInput` types.
- `lib/templates/repository.ts` — DB helpers.
- `lib/templates/schema.test.ts`, `lib/templates/repository.test.ts` — vitest suites.
- `lib/test-utils/db.ts` — extracted from the inline setup currently in `lib/journal/write.test.ts`. New module so multiple test files share it.

**Net-new — UI feature:**

- `features/templates/Templates.tsx` — server component for the `/templates` route.
- `features/templates/TemplatesList.tsx` — client component, row actions.
- `features/templates/TemplatePicker.tsx` — combobox for `/transactions/new`.
- `features/templates/SaveAsTemplateButton.tsx` — trigger button + dialog (name input, conflict alert with Overwrite).
- `features/templates/RenameDialog.tsx` — inline rename dialog used by the list row dropdown.
- `features/templates/actions.ts` — server actions: `saveTemplateAction`, `renameTemplateAction`, `deleteTemplateAction`.
- `features/templates/index.ts` — barrel exports.

**Net-new — route shells:**

- `app/templates/page.tsx` — thin: `requireUser`, render `<Templates />`.
- `app/templates/loading.tsx` — `<PageSkeleton rows={6} />`.

**Refactor (Phase 4.1 leftovers move out of `app/`):**

- `app/transactions/TransactionTable.tsx` → `features/transactions/TransactionTable.tsx`
- `app/transactions/Filters.tsx` → `features/transactions/Filters.tsx`
- `app/transactions/new/TransactionForm.tsx` → `features/transactions/TransactionForm.tsx`
- `app/transactions/actions.ts` (delete) + `app/transactions/new/actions.ts` (create) + `app/transactions/[uid]/edit/actions.ts` (update) → consolidated `features/transactions/actions.ts`. The shared `TransactionActionState` type lives here.
- New: `features/transactions/Transactions.tsx`, `NewTransaction.tsx`, `EditTransaction.tsx` — top-level feature components per route.
- New: `features/transactions/RowActions.tsx` — the `⋯` `DropdownMenu` for each table row.
- New: `features/transactions/index.ts` — barrel.

After the refactor, the `app/transactions/*` directory contains only route-level files:

- `app/transactions/page.tsx` → renders `<Transactions searchParams={…} />`.
- `app/transactions/loading.tsx` → stays as-is (route-level concern).
- `app/transactions/new/page.tsx` → renders `<NewTransaction templateId={searchParams.template} />`.
- `app/transactions/[uid]/edit/page.tsx` → renders `<EditTransaction uid={uid} />`.

**Touched in place:**

- `components/nav/config.ts` — new `templates` entry under the Journal section.

**Untouched:**

- The entire `lib/journal/` module — templates never write to journal files.
- Report pages and the `runLedger` pipeline.

## Section 1 — Data model

`db/schema/template.ts`:

```ts
import { sql } from 'drizzle-orm';
import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { user } from './user';
import type { TemplateDraft } from '@/lib/templates/schema';

export const template = sqliteTable(
  'template',
  {
    id: text('id').primaryKey(),
    userId: text('userId')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    draft: text('draft', { mode: 'json' }).notNull().$type<TemplateDraft>(),
    createdAt: integer('createdAt', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer('updatedAt', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => ({
    uniqueNamePerUser: uniqueIndex('template_user_name').on(t.userId, t.name),
  })
);

export type Template = typeof template.$inferSelect;
```

Notes:

- `id` is a ULID generated app-side via the existing `generateUid` helper from `lib/journal/uid.ts`. Matches the addressing convention from Phase 4.1.
- `draft` is a JSON-mode column. Drizzle's `$type<TemplateDraft>()` types reads as that shape; writes still need a serializable object.
- `onDelete: 'cascade'` on the `userId` FK keeps templates from outliving their owner. Relevant once Phase 7's account-deletion endpoint lands.
- The unique index is the source of truth for name uniqueness. The UI checks it ahead of time for friendlier errors; the DB constraint backs that up.

`lib/templates/schema.ts`:

```ts
import { z } from 'zod';
import { postingSchema } from '@/lib/transactions/schema';

const TEMPLATE_NAME_MAX = 80;

export const templateNameSchema = z
  .string()
  .trim()
  .min(1, 'Name is required')
  .max(TEMPLATE_NAME_MAX, 'Name is too long');

export const templateDraftSchema = z.object({
  payee: z.string().trim().min(1).max(200),
  status: z.enum(['cleared', 'pending', 'none']).default('none'),
  note: z.string().max(500).optional(),
  postings: z.array(postingSchema).min(2).max(50),
});

export type TemplateDraft = z.infer<typeof templateDraftSchema>;

export const templateInputSchema = z.object({
  name: templateNameSchema,
  draft: templateDraftSchema,
});
export type TemplateInput = z.infer<typeof templateInputSchema>;
```

Key choices:

- `TemplateDraft` is `TransactionDraft` minus `date` and `uid` — both generated at use time.
- `postingSchema` is reused as-is from `lib/transactions/schema.ts`; after Phase 4.1's polish, it already accepts blank-amount/blank-currency rows but still requires `currency` when `amount` is filled. This is exactly the validation a template needs — a "rent" posting with `1500` requires a currency; a "groceries" auto-balance posting with no amount can omit currency.
- No balance `superRefine` here. Templates are intentionally permitted to be unbalanced (skeleton case). Balance is enforced when the resulting transaction submits via `transactionDraftSchema`.

## Section 2 — Repository

`lib/templates/repository.ts`:

```ts
listTemplates(userId: string): Promise<Template[]>;
getTemplate(userId: string, id: string): Promise<Template | null>;
saveTemplate(
  userId: string,
  input: TemplateInput,
  opts?: { overwrite?: boolean }
): Promise<
  | { ok: true; template: Template }
  | { ok: false; reason: 'name-conflict' }
>;
renameTemplate(
  userId: string,
  id: string,
  name: string
): Promise<
  | { ok: true }
  | { ok: false; reason: 'name-conflict' | 'not-found' }
>;
deleteTemplate(userId: string, id: string): Promise<void>;
```

Behavior:

- `listTemplates` is sorted by `name` ASC, case-insensitive. Drizzle's `sql\`lower(${template.name})\`` is the cleanest expression.
- `saveTemplate` runs as one logical operation: query `(userId, name)` → if a row exists and `overwrite` is falsy → return `name-conflict`. If `overwrite` is true → update that row's `draft` and bump `updatedAt`. Otherwise → insert with a fresh ULID. The insert is wrapped in a try/catch so a race against another insertion of the same name (slim chance in a single-process Node deploy) is also surfaced as `name-conflict` rather than a raw DB error.
- `renameTemplate` queries the row by `(userId, id)` first; `not-found` if missing. Then attempts the update; the unique-index violation maps to `name-conflict`.
- `deleteTemplate` is idempotent — a missing row is a no-op (no throw).

No imports of `server-only` from this module. The vitest config aliases `server-only` to an empty mock anyway (from Phase 4.1), but the repository module is data-layer and used by tests directly without dynamic imports.

## Section 3 — Save flow

The `SaveAsTemplateButton` component is the single UI surface for saving a template. It renders:

- A button trigger (label "Save as template" in the form footer; an icon `BookmarkPlus` + label in the dropdown row action).
- A shadcn `Dialog` containing:
  - A read-only summary block: "Payee — `<payee>`, `<n>` postings".
  - A `name` input, defaulted to the current payee, trimmed and capped at 80 characters.
  - Inline alert (only when a conflict is returned): `"A template named '<name>' already exists."` with `[Rename]` and `[Overwrite]` buttons; the default `[Save]` is hidden in this state.
  - `[Cancel]` always present.

The component takes a `draft: Omit<TransactionDraft, 'date' | 'uid'>` prop. Each entry point builds this prop differently:

- `TransactionForm` (create/edit modes): serializes its current state minus `date` and `uid`. The button is rendered next to the submit row. Disabled when fewer than 2 posting rows have an account filled in.
- `RowActions` on `/transactions`: builds the draft from the row's `Transaction` (parser output), dropping `file`, `startLine`, `endLine`, `rawBlock`, `fingerprint`, `uid`, `date`. Always enabled.

Server action contract:

```ts
type SaveTemplateResult =
  | { ok: true; templateId: string }
  | {
      ok: false;
      reason: 'name-conflict' | 'invalid';
      message?: string;
      fieldErrors?: Record<string, string>;
    };
```

Action body (`saveTemplateAction`):

1. `requireUser()`.
2. Zod-validate the input with `templateInputSchema`. Validation failure → `invalid` with `fieldErrors`.
3. Call `saveTemplate(user.id, input, { overwrite })`.
4. On `ok` → `revalidatePath('/templates')`. Return `{ ok: true, templateId }`.

Success UX:

- Sonner toast `"Template saved"` with an `action: { label: 'View', onClick: () => router.push('/templates') }`. The form / table stays where it is; the user is mid-flow on a transaction.

## Section 4 — Use flow

Entry A — `/transactions/new` combobox:

- `<TemplatePicker>` is a client component rendered above `TransactionForm`. It receives `templates: Template[]` from the server.
- Single-select via the existing `Combobox` primitive. The `allowFreeText` flag is `false` here — only saved templates can be picked.
- Hidden when `templates.length === 0` (no clutter on a fresh install).
- Picking a template calls `router.push(\`/transactions/new?template=\${id}\`)`. The push (not replace) means back-navigation works.

Entry B — `/templates` row "Use" action:

- Both the row-primary click (on the name column) and the `Use` item in the `⋯` dropdown route to `/transactions/new?template=<id>`. Same destination as the combobox.

Server-side prefill on `/transactions/new`:

```ts
const initialDraft: TransactionDraft | undefined = templateId
  ? await getTemplate(user.id, templateId).then((t) =>
      t
        ? {
            date: todayISO(),
            payee: t.draft.payee,
            status: t.draft.status,
            note: t.draft.note,
            uid: undefined,
            postings: t.draft.postings,
          }
        : undefined
    )
  : undefined;
```

- Missing template id → render an empty form. A `templateMissing` flag is passed to the client so it can show a one-time sonner toast on mount: `"Template not found — starting from scratch"`. This is the only place the use-flow has explicit error UX.

Form-state behavior when prefilled:

- Submit button label stays "Add transaction". This is creation.
- The "Save as template" button stays visible. If the user tweaks the prefill and saves under the same name, the conflict dialog appears with Overwrite — which is the natural "update the template" flow without a separate edit-template page.
- After submission, the form redirects to `/` (same as today's add flow). Not back to `/templates`, regardless of where the user came from — the next thing the user wants to see is the report views.

The form forgets where its initial data came from once mounted. No persistent link between the resulting transaction and the template that spawned it.

## Section 5 — Templates management page (`/templates`)

Layout — same general shape as `/transactions`:

```
Templates                                          [+ New template]

Name          Payee           Accounts            Updated     ⋯
────────────  ──────────────  ──────────────────  ──────────  ─
Groceries     Trader Joe's    Expenses:Food …     2 days      ⋯
Rent          Landlord        Expenses:Rent …     last mo.    ⋯
Salary        Employer        Income:Salary …     last mo.    ⋯
```

Top bar:

- Title + `Help` tooltip: _"Reusable transaction shapes. Use a template to prefill the new-transaction form."_
- `[+ New template]` link → `/transactions/new` with an empty form. No separate "create template from scratch" page; the user builds shape in the transaction form and uses Save as template.

Columns:

- **Name** — anchor-styled, primary click target. Routes to `/transactions/new?template=<id>` (i.e. Use).
- **Payee** — `template.draft.payee`.
- **Accounts** — first two posting accounts joined with `→`; ellipsis if more. Same treatment as the transactions list.
- **Updated** — relative time (e.g. "2 days ago") with absolute date in the `title` attribute on hover.
- **`⋯`** — `DropdownMenu` with three items:
  - `Use` — duplicates the row-click behavior; kept for discoverability.
  - `Rename` — opens `<RenameDialog>` (same shape as the Save-as-template name input, no draft summary). Calls `renameTemplateAction`. `name-conflict` shows inline.
  - `Delete` — wraps the trigger in `<ConfirmDialog>`. Description: _"Delete template 'X'? This won't affect any transactions you've already created from it."_

Empty state (when `listTemplates` returns zero rows):

```
No templates yet
Save reusable transaction shapes from the [Add transaction] page or any existing row.
```

`[Add transaction]` is a primary `buttonVariants` link to `/transactions/new`.

Server-side data flow:

- `Templates.tsx` calls `listTemplates(userId)` and renders `<TemplatesList templates={…} />`.
- All mutations call `revalidatePath('/templates')` server-side and `router.refresh()` client-side. Successful rename/delete also toasts.

Navigation:

- `components/nav/config.ts` gains `id: 'templates'` under the Journal section. `match: 'exact'`. Icon: `Bookmark` from lucide-react. Description: _"Saved transaction shapes you can reuse."_ Keywords: `['template', 'recurring', 'save', 'reuse']`.

## Section 6 — Phase 4.1 refactor (transactions surface into `features/`)

Pure relocation, zero behavior change. The 56 existing vitest tests must still pass after this step.

Moves:

| From                                              | To                                              |
| ------------------------------------------------- | ----------------------------------------------- |
| `app/transactions/TransactionTable.tsx`           | `features/transactions/TransactionTable.tsx`    |
| `app/transactions/Filters.tsx`                    | `features/transactions/Filters.tsx`             |
| `app/transactions/new/TransactionForm.tsx`        | `features/transactions/TransactionForm.tsx`     |
| `app/transactions/actions.ts` (delete action)     | merged into `features/transactions/actions.ts`  |
| `app/transactions/new/actions.ts` (create action) | merged into `features/transactions/actions.ts`  |
| `app/transactions/[uid]/edit/actions.ts` (update) | merged into `features/transactions/actions.ts`  |

New files (route-level shells in `features/`):

- `features/transactions/Transactions.tsx` — wraps the list-page logic currently inline in `app/transactions/page.tsx`. Takes `searchParams`, calls `loadTransactions`, `applyFilters`, derives `payees` / `accounts`, renders `<Filters>` + `<TransactionTable>`.
- `features/transactions/NewTransaction.tsx` — wraps `app/transactions/new/page.tsx`. Takes an optional `templateId`. Loads template via `getTemplate` when present, builds `initialDraft`, renders `<TransactionForm mode="create" …>`.
- `features/transactions/EditTransaction.tsx` — wraps `app/transactions/[uid]/edit/page.tsx`. Takes `uid`, runs the parse, builds `initialDraft` + fingerprint, renders `<TransactionForm mode="edit" …>`.
- `features/transactions/RowActions.tsx` — the `⋯` `DropdownMenu` (Edit / Save as template / Delete). Replaces the inline icon buttons in `TransactionTable`.
- `features/transactions/index.ts` — barrel exports.

Consolidated `features/transactions/actions.ts`:

- Exports `TransactionActionState` (the shared discriminated-union type previously in `app/transactions/new/actions.ts`).
- Exports `createTransactionAction`, `updateTransactionAction`, `deleteTransactionAction`.
- Internal `'use server'` directive at the top of the file.

After the refactor:

- `app/transactions/page.tsx` is one functional `import`:
  ```tsx
  import { Transactions } from '@/features/transactions';
  export default async function TransactionsPage({ searchParams }: …) {
    return <Transactions searchParams={searchParams} />;
  }
  ```
- `app/transactions/new/page.tsx` and `app/transactions/[uid]/edit/page.tsx` follow the same one-liner pattern.
- `app/transactions/loading.tsx` stays — it's a Next.js route convention.

Cross-codebase imports of `TransactionForm`, `TransactionTable`, `Filters`, and the action functions update to the new paths. Affected files: the three transaction pages, the new template-related components.

## Section 7 — Error handling and edge cases

| Surface                                       | Behavior                                                                                              |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Save with conflicting name                    | Dialog re-renders with inline alert + `[Rename] [Overwrite]` buttons. No mutation until user picks.   |
| Rename to a name another template owns        | Same conflict alert pattern. Action returns `{ ok: false, reason: 'name-conflict' }`.                 |
| Rename or delete a template that no longer exists | Action returns `not-found`. UI shows sonner error and `router.refresh()`.                          |
| `/transactions/new?template=<missing-id>`     | Render empty form. Toast `"Template not found — starting from scratch"` on mount.                     |
| Template references an account/payee not in journal | No error. `Combobox` already accepts free-text values. Suggestions list is informational only.   |
| Concurrent rename of the same template (two tabs) | Second write wins; first tab's view refreshes on next interaction. DB unique constraint prevents both renaming to the same target. |
| `templateDraftSchema` validation fails        | Action returns `invalid` with `fieldErrors`. Surfaced inline under the name input (only `name` is user-typed; `draft` field errors don't realistically occur). |
| Journal mutation (edit/delete a transaction)  | Does NOT touch any template. Templates are independent snapshots.                                     |

Cache invalidation scope:

- Template mutations → `revalidatePath('/templates')` only.
- Templates do NOT participate in the `ledger:<userId>` journal cache tag.

## Section 8 — Testing

Same vitest setup as Phase 4.1. Tests live next to the modules they cover.

Repository tests (`lib/templates/repository.test.ts`):

- `saveTemplate` inserts a new row with a generated ULID id; returns `{ ok: true, template }`.
- `saveTemplate` with conflicting `(userId, name)` returns `{ ok: false, reason: 'name-conflict' }` and does NOT mutate the existing row.
- `saveTemplate` with `overwrite: true` updates the existing row's `draft` and bumps `updatedAt`, keeping the same `id`.
- `listTemplates` returns rows sorted case-insensitively by name; cross-user isolation verified.
- `renameTemplate` updates `name`, bumps `updatedAt`, returns `{ ok: true }`.
- `renameTemplate` with a name another template already owns returns `name-conflict`.
- `renameTemplate` on a missing id returns `not-found`.
- `deleteTemplate` removes the row; subsequent `getTemplate` returns null.
- `deleteTemplate` on a missing id is a no-op.

Schema tests (`lib/templates/schema.test.ts`):

- `templateDraftSchema` accepts a draft with all-blank amounts (skeleton case).
- `templateDraftSchema` accepts a draft with concrete amounts.
- `templateDraftSchema` rejects fewer than 2 postings.
- `templateNameSchema` rejects empty and `>80` chars.
- Confirms unbalanced drafts are accepted (no `superRefine` on templates).

Integration test (`lib/templates/integration.test.ts`):

- End-to-end: create user → save template → list it → fetch by id → build an `initialDraft` from it via the same code path the page uses → confirm `addTransaction` accepts the result and writes a UID-stamped block.

Out of scope for tests in this phase:

- React Testing Library on `TemplatePicker`, `TemplatesList`, `SaveAsTemplateButton`, `RenameDialog`. Deferred to Phase 5.2.
- Visual regression for the row dropdown.

Coverage target: 95%+ on `lib/templates/*`. The features/ components stay untested by vitest in this phase.

Shared test fixture: `lib/test-utils/db.ts` extracted from `lib/journal/write.test.ts`. Three callers will use it post-extraction: `lib/journal/write.test.ts`, `lib/journal/integration.test.ts`, `lib/templates/repository.test.ts` (plus the new templates integration test). The extraction is part of the implementation order's step 1.

## Section 9 — Implementation order

Each step independently mergeable.

1. **Schema + repository + tests** (invisible to user). `db/schema/template.ts`, `lib/templates/schema.ts`, `lib/templates/repository.ts`, plus vitest suites. Includes the extraction of `lib/test-utils/db.ts` and updates to existing write/integration tests that use it.
2. **Phase 4.1 refactor — moves only** (invisible to user, but bigger diff). Relocate `TransactionForm`, `TransactionTable`, `Filters` from `app/transactions/*` to `features/transactions/*`. Consolidate action files. Update imports. Zero behavior change; all 56 existing tests must still pass.
3. **Top-level feature components** (invisible to user). `features/transactions/Transactions.tsx`, `NewTransaction.tsx`, `EditTransaction.tsx`. Pages become one-liners. Still no template logic — pure route-shell extraction.
4. **`/templates` page + actions** (first visible change). `features/templates/Templates.tsx`, `TemplatesList.tsx`, `RenameDialog.tsx`, `actions.ts`. Nav config entry. Empty state. The route works; templates can be listed, renamed, deleted — there just isn't any way to create one yet.
5. **`SaveAsTemplateButton` + dialog**. Drops into `TransactionForm` (visible in create and edit modes). Wires to `saveTemplateAction`. Handles the conflict alert with Overwrite. Sonner toast on success.
6. **`RowActions` dropdown**. Replaces inline Edit/Delete in `TransactionTable` with a `⋯` `DropdownMenu` containing Edit / Save as template / Delete. Reuses `SaveAsTemplateButton`.
7. **`TemplatePicker` on `/transactions/new`**. Server-side `?template=<id>` handling in `NewTransaction.tsx`. Combobox above the form. Stale-template toast on render.
8. **Integration test** (`lib/templates/integration.test.ts`). Save → list → use → addTransaction round-trip.

## Open questions

None at design time. If the implementation surfaces any, they are recorded on the plan, not retro-added to this spec.
