# Recurring Confirm-to-Post Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Due/overdue recurring occurrences appear on the dashboard with Post/Skip buttons; Post writes a real journal transaction, Skip dismisses one occurrence; state lives entirely in the journal as a `:handled:` comment on the `~` rule.

**Architecture:** `~` directives stay the rule store (immutable period expression = schedule anchor). A pure JS `expandSchedule` computes occurrence dates (dates are explicitly allowed in JS per CLAUDE.md; ledger 3.4.1 `--forecast` ignores date anchors — verified 2026-07-16, see spec). All money stays ledger's: amounts are the rule's postings verbatim, every write is verified with `ledger stats` and rolled back on rejection. Spec: `docs/superpowers/specs/2026-07-16-recurring-confirm-to-post-design.md`.

**Tech Stack:** Next.js server actions, zod, vitest (`pnpm vitest run <file>`), existing `JournalService` write pipeline (withUserLock → pull → edit → verifyJournalParseable → push → invalidateCache).

## Global Constraints

- HARD RULE: no accounting math in JS/TS — ledger computes all monetary values. Date arithmetic in JS is explicitly allowed (CLAUDE.md "Allowed in JS/TS").
- No abbreviations in identifiers (`occurrence`, not `occ`; `schedule`, not `sched`).
- No Claude/Anthropic references anywhere; no Co-Authored-By trailers.
- Server actions are one file each; DB/business logic in Repository/Service classes; UI in `features/`, pages in `app/` as thin shells.
- Every service write: snapshot → mutate → `verifyJournalParseable` → rollback on failure → `push` → rollback on conflict → `invalidateCache`.
- Commit after every green test cycle.

## File Structure

- Create: `lib/journal/schedule.ts` + `lib/journal/schedule.test.ts` — schedule parse/serialize/expand (pure)
- Modify: `lib/journal/recurring.ts` + `lib/journal/recurring.test.ts` — `:handled:` line, schedule-bearing draft
- Modify: `lib/journal/service.ts`; Create: `lib/journal/service.recurring-occurrence.test.ts` — post/skip occurrence
- Create: `features/recurring/dueList.ts` + `features/recurring/dueList.test.ts` — occurrence rows for UI
- Modify: `lib/audit/schema.ts`, `lib/audit/describe.ts` — new audit actions
- Create: `features/recurring/actions/postOccurrence.ts`, `features/recurring/actions/skipOccurrence.ts`
- Create: `features/dashboard/UpcomingBillsWidget.tsx`; Modify: `features/dashboard/Dashboard.tsx`
- Modify: `features/recurring/RecurringView.tsx`, `app/recurring/page.tsx`, `features/recurring/actions/createRecurring.ts` (only if types change)

---

### Task 1: Schedule module (parse / serialize / expand)

**Files:**
- Create: `lib/journal/schedule.ts`
- Test: `lib/journal/schedule.test.ts`

**Interfaces:**
- Consumes: nothing (pure module).
- Produces:
  - `type ScheduleUnit = 'day' | 'week' | 'month' | 'year'`
  - `type Schedule = { unit: ScheduleUnit; count: number; anchor: string }` (anchor is `YYYY-MM-DD`)
  - `parseSchedule(period: string): Schedule | null` — recognizes `every N days|weeks|months|years from DATE`, `every day|week|month|year from DATE`, and the aliases `Daily|Weekly|Monthly|Yearly from DATE` (case-insensitive; DATE in `YYYY/MM/DD` or `YYYY-MM-DD`). Anything else (including anchor-less periods) → `null` = "unsupported schedule".
  - `serializeSchedule(schedule: Schedule): string` — always `every N days|weeks|months|years from YYYY/MM/DD` (ledger-parseable; plural even for N=1 — ledger accepts it).
  - `expandSchedule(schedule: Schedule, afterExclusive: string, throughInclusive: string): string[]` — occurrence dates strictly after `afterExclusive`, up to and including `throughInclusive`, computed by stepping from the anchor (never iterating day-by-day): day/week = anchor + k·count·(1|7) days; month = anchor month + k·count with day-of-month clamped to the target month's length; year = same with Feb 29 → Feb 28 clamping. Returns `[]` when the anchor is after `throughInclusive`.
  - `lastOccurrenceBefore(schedule: Schedule, date: string): string | null` — most recent occurrence strictly before `date` (used to initialize `:handled:` at creation).

- [ ] **Step 1: Write the failing tests**

```typescript
// lib/journal/schedule.test.ts
import { describe, it, expect } from 'vitest';
import {
  parseSchedule,
  serializeSchedule,
  expandSchedule,
  lastOccurrenceBefore,
} from './schedule';

describe('parseSchedule', () => {
  it('parses every-N form', () => {
    expect(parseSchedule('every 2 weeks from 2026/05/08')).toEqual({
      unit: 'week',
      count: 2,
      anchor: '2026-05-08',
    });
  });
  it('parses singular and alias forms', () => {
    expect(parseSchedule('every month from 2026-01-05')).toEqual({
      unit: 'month',
      count: 1,
      anchor: '2026-01-05',
    });
    expect(parseSchedule('Monthly from 2026/01/05')).toEqual({
      unit: 'month',
      count: 1,
      anchor: '2026-01-05',
    });
  });
  it('rejects anchor-less and freeform periods', () => {
    expect(parseSchedule('Monthly')).toBeNull();
    expect(parseSchedule('every friday')).toBeNull();
  });
});

describe('serializeSchedule', () => {
  it('round-trips through parseSchedule', () => {
    const schedule = { unit: 'month' as const, count: 1, anchor: '2026-01-05' };
    expect(serializeSchedule(schedule)).toBe('every 1 months from 2026/01/05');
    expect(parseSchedule(serializeSchedule(schedule))).toEqual(schedule);
  });
});

describe('expandSchedule', () => {
  const monthly = { unit: 'month' as const, count: 1, anchor: '2026-01-31' };
  it('anchors monthly to day-of-month with short-month clamping', () => {
    expect(expandSchedule(monthly, '2026-01-31', '2026-04-30')).toEqual([
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
    ]);
  });
  it('is exclusive of afterExclusive and inclusive of throughInclusive', () => {
    const fifth = { unit: 'month' as const, count: 1, anchor: '2026-01-05' };
    expect(expandSchedule(fifth, '2026-02-05', '2026-04-05')).toEqual([
      '2026-03-05',
      '2026-04-05',
    ]);
  });
  it('keeps biweekly anchored to the anchor weekday', () => {
    const biweekly = { unit: 'week' as const, count: 2, anchor: '2026-05-08' };
    expect(expandSchedule(biweekly, '2026-05-08', '2026-06-20')).toEqual([
      '2026-05-22',
      '2026-06-05',
      '2026-06-19',
    ]);
  });
  it('includes the anchor itself when after the floor', () => {
    const fifth = { unit: 'month' as const, count: 1, anchor: '2026-08-05' };
    expect(expandSchedule(fifth, '2026-07-16', '2026-09-30')).toEqual([
      '2026-08-05',
      '2026-09-05',
    ]);
  });
  it('returns empty when anchor is beyond the window', () => {
    const fifth = { unit: 'month' as const, count: 1, anchor: '2027-01-05' };
    expect(expandSchedule(fifth, '2026-07-16', '2026-08-16')).toEqual([]);
  });
  it('handles yearly Feb 29 clamping', () => {
    const leap = { unit: 'year' as const, count: 1, anchor: '2024-02-29' };
    expect(expandSchedule(leap, '2024-02-29', '2026-03-01')).toEqual([
      '2025-02-28',
      '2026-02-28',
    ]);
  });
});

describe('lastOccurrenceBefore', () => {
  it('returns the most recent occurrence strictly before the date', () => {
    const fifth = { unit: 'month' as const, count: 1, anchor: '2026-01-05' };
    expect(lastOccurrenceBefore(fifth, '2026-07-16')).toBe('2026-07-05');
    expect(lastOccurrenceBefore(fifth, '2026-01-05')).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run lib/journal/schedule.test.ts`
Expected: FAIL — cannot resolve `./schedule`.

- [ ] **Step 3: Implement**

```typescript
// lib/journal/schedule.ts
export type ScheduleUnit = 'day' | 'week' | 'month' | 'year';

export type Schedule = {
  unit: ScheduleUnit;
  count: number;
  anchor: string; // YYYY-MM-DD
};

const PERIOD_REGEX =
  /^(?:every\s+(?:(\d+)\s+)?(day|week|month|year)s?|(daily|weekly|monthly|yearly))\s+from\s+(\d{4})[/-](\d{2})[/-](\d{2})$/i;

const ALIAS_UNITS: Record<string, ScheduleUnit> = {
  daily: 'day',
  weekly: 'week',
  monthly: 'month',
  yearly: 'year',
};

export const parseSchedule = (period: string): Schedule | null => {
  const match = period.trim().match(PERIOD_REGEX);
  if (!match) return null;
  const [, countRaw, unitRaw, aliasRaw, year, month, day] = match;
  const unit = unitRaw
    ? (unitRaw.toLowerCase() as ScheduleUnit)
    : ALIAS_UNITS[aliasRaw.toLowerCase()];
  const count = countRaw ? parseInt(countRaw, 10) : 1;
  if (count < 1 || count > 366) return null;
  const anchor = `${year}-${month}-${day}`;
  if (Number.isNaN(Date.parse(anchor))) return null;
  return { unit, count, anchor };
};

export const serializeSchedule = (schedule: Schedule): string =>
  `every ${schedule.count} ${schedule.unit}s from ${schedule.anchor.replaceAll('-', '/')}`;

// All arithmetic below is calendar-date-only (UTC to avoid DST edges). No
// monetary values pass through this module.
const toUtc = (iso: string): Date => new Date(`${iso}T00:00:00Z`);
const toIso = (date: Date): string => date.toISOString().slice(0, 10);

const daysInMonth = (year: number, monthIndex: number): number =>
  new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();

/** k-th occurrence (k >= 0) of the schedule, anchored to the anchor date. */
const occurrenceAt = (schedule: Schedule, k: number): string => {
  const anchor = toUtc(schedule.anchor);
  if (schedule.unit === 'day' || schedule.unit === 'week') {
    const stepDays = schedule.count * (schedule.unit === 'week' ? 7 : 1);
    const result = new Date(anchor);
    result.setUTCDate(result.getUTCDate() + k * stepDays);
    return toIso(result);
  }
  const monthsPerStep = schedule.unit === 'month' ? schedule.count : schedule.count * 12;
  const totalMonths =
    anchor.getUTCMonth() + k * monthsPerStep;
  const year = anchor.getUTCFullYear() + Math.floor(totalMonths / 12);
  const monthIndex = ((totalMonths % 12) + 12) % 12;
  const day = Math.min(anchor.getUTCDate(), daysInMonth(year, monthIndex));
  return toIso(new Date(Date.UTC(year, monthIndex, day)));
};

/** Smallest k whose occurrence is strictly after `afterExclusive`. */
const firstIndexAfter = (schedule: Schedule, afterExclusive: string): number => {
  if (schedule.anchor > afterExclusive) return 0;
  const anchor = toUtc(schedule.anchor);
  const after = toUtc(afterExclusive);
  const elapsedDays =
    (after.getTime() - anchor.getTime()) / (24 * 60 * 60 * 1000);
  // Estimate then correct: clamping (short months) can only push a date
  // earlier, so the estimate may be at most a couple of steps off.
  const approxStepDays =
    schedule.unit === 'day'
      ? schedule.count
      : schedule.unit === 'week'
        ? schedule.count * 7
        : schedule.unit === 'month'
          ? schedule.count * 28
          : schedule.count * 365;
  let k = Math.max(0, Math.floor(elapsedDays / approxStepDays) - 2);
  while (occurrenceAt(schedule, k) <= afterExclusive) k++;
  return k;
};

export const expandSchedule = (
  schedule: Schedule,
  afterExclusive: string,
  throughInclusive: string
): string[] => {
  const result: string[] = [];
  let k = firstIndexAfter(schedule, afterExclusive);
  for (;;) {
    const occurrence = occurrenceAt(schedule, k);
    if (occurrence > throughInclusive) return result;
    result.push(occurrence);
    k++;
  }
};

export const lastOccurrenceBefore = (
  schedule: Schedule,
  date: string
): string | null => {
  const k = firstIndexAfter(schedule, date) - 1;
  // firstIndexAfter uses strict >, so back up while the occurrence at k
  // equals `date` (we need strictly before).
  for (let i = k; i >= 0; i--) {
    const occurrence = occurrenceAt(schedule, i);
    if (occurrence < date) return occurrence;
  }
  return null;
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run lib/journal/schedule.test.ts`
Expected: PASS (all).

- [ ] **Step 5: Commit**

```bash
git add lib/journal/schedule.ts lib/journal/schedule.test.ts
git commit -m "feat(recurring): schedule parse/serialize/expand module"
```

---

### Task 2: `:handled:` line in the recurring parser/formatter

**Files:**
- Modify: `lib/journal/recurring.ts`
- Test: `lib/journal/recurring.test.ts` (extend existing file)

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `recurringDraftSchema` gains `handled: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()`; `RecurringDraft` and `ParsedRecurring` therefore carry `handled?: string`.
  - `formatRecurring` emits `    ; :handled: YYYY-MM-DD` immediately after the uid line when `handled` is set.
  - `parseRecurringBlock` recognizes `HANDLED_LINE_REGEX = /^\s*;\s*:handled:\s*(\d{4}-\d{2}-\d{2})\s*$/` before the generic comment branch (so it never leaks into `note`).
  - Because `fingerprintRecurring` hashes `formatRecurring(draft)`, updating `handled` changes the fingerprint — this is what makes Post/Skip replay-safe.

- [ ] **Step 1: Write the failing tests** — append to `lib/journal/recurring.test.ts`:

```typescript
describe(':handled: state line', () => {
  it('round-trips through format and parse without polluting note', () => {
    const draft = {
      period: 'every 1 months from 2026/01/05',
      note: 'Netflix',
      uid: '01HZX5G5KJDS9HQRYK8E5T0DJC',
      handled: '2026-07-05',
      postings: [
        { account: 'Expenses:Netflix', amount: '15', currency: 'USD' },
        { account: 'Assets:Checking', amount: '', currency: '' },
      ],
    };
    const block = formatRecurring(draft);
    expect(block).toContain('; :handled: 2026-07-05');
    const parsed = parseRecurringFile('main.ledger', block + '\n');
    expect(parsed).toHaveLength(1);
    expect(parsed[0].handled).toBe('2026-07-05');
    expect(parsed[0].note).toBe('Netflix');
  });

  it('changes the fingerprint when handled advances', () => {
    const base = {
      period: 'every 1 months from 2026/01/05',
      postings: [
        { account: 'Expenses:Netflix', amount: '15', currency: 'USD' },
        { account: 'Assets:Checking', amount: '', currency: '' },
      ],
    };
    expect(fingerprintRecurring({ ...base, handled: '2026-06-05' })).not.toBe(
      fingerprintRecurring({ ...base, handled: '2026-07-05' })
    );
  });
});
```

(Add `fingerprintRecurring` to the file's imports from `./recurring` if not already imported.)

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run lib/journal/recurring.test.ts`
Expected: FAIL — `handled` is `undefined` after parse and missing from the formatted block.

- [ ] **Step 3: Implement** — in `lib/journal/recurring.ts`:

Add to the schema object (after `uid`):

```typescript
  handled: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'handled must be YYYY-MM-DD')
    .optional(),
```

In `formatRecurring`, after `uidLines`:

```typescript
  const handledLines = draft.handled
    ? [`    ; :handled: ${draft.handled}`]
    : [];
```

and include `...handledLines` between `...uidLines` and `...noteLines` in the returned array.

In `parseRecurringBlock`, add near the top:

```typescript
const HANDLED_LINE_REGEX = /^\s*;\s*:handled:\s*(\d{4}-\d{2}-\d{2})\s*$/;
```

declare `let handled: string | undefined;` beside `uid`, and inside the loop, after the uid match and before the generic comment match:

```typescript
    const handledMatch = line.match(HANDLED_LINE_REGEX);
    if (handledMatch) {
      handled = handledMatch[1];
      continue;
    }
```

and add `handled,` to the returned object.

- [ ] **Step 4: Run to verify pass**

Run: `pnpm vitest run lib/journal/recurring.test.ts`
Expected: PASS (existing tests must stay green too).

- [ ] **Step 5: Commit**

```bash
git add lib/journal/recurring.ts lib/journal/recurring.test.ts
git commit -m "feat(recurring): parse and format :handled: state line"
```

---

### Task 3: Structured schedule on create + `:handled:` initialization

**Files:**
- Modify: `lib/journal/recurring.ts` (draft schema), `lib/journal/service.ts` (`addRecurring`)
- Test: `lib/journal/recurring.test.ts`, `lib/journal/service.recurring-occurrence.test.ts` (create; service tests follow the `setupTestDb` pattern of `lib/journal/service.test.ts`)

**Interfaces:**
- Consumes: `parseSchedule`, `serializeSchedule`, `lastOccurrenceBefore` from `lib/journal/schedule.ts` (Task 1).
- Produces:
  - `recurringDraftSchema` accepts `schedule: { unit, count, anchor }` **instead of** `period` on input. Shape:

```typescript
export const recurringScheduleInputSchema = z.object({
  unit: z.enum(['day', 'week', 'month', 'year']),
  count: z.number().int().min(1).max(366),
  anchor: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Anchor must be YYYY-MM-DD')
    .refine((s) => !Number.isNaN(Date.parse(s)), 'Anchor is not a real date'),
});
```

  - New `recurringCreateSchema = recurringDraftSchema.omit({ period: true, handled: true, uid: true }).extend({ schedule: recurringScheduleInputSchema })` exported from `lib/journal/recurring.ts`.
  - `JournalService.addRecurring(userId, rawDraft, today: string)` now validates against `recurringCreateSchema`, then builds the stored draft: `period = serializeSchedule(draft.schedule)`, `handled = lastOccurrenceBefore(draft.schedule, today) ?? undefined`. `today` is passed by the caller (`createRecurringAction`) as `new Date().toISOString().slice(0, 10)` so the service stays clock-free for tests.
  - Everything downstream (`formatRecurring`, quota, verify, push, rollback) is unchanged.

- [ ] **Step 1: Write the failing test** — create `lib/journal/service.recurring-occurrence.test.ts` with the same harness as `lib/journal/service.test.ts` (`resetObjectStore`, `setupTestDb('journal-recurring-')`, `insertUser`, `new JournalService(new JournalRepository(ctx.db))`, `fs.mkdir(getJournalDir(userId))`):

```typescript
describe('JournalService.addRecurring (structured schedule)', () => {
  it('serializes the schedule and initializes :handled: to the last occurrence before today', async () => {
    const result = await service.addRecurring(
      'test-user',
      {
        schedule: { unit: 'month', count: 1, anchor: '2026-01-05' },
        note: 'Netflix',
        postings: [
          { account: 'Expenses:Netflix', amount: '15', currency: 'USD' },
          { account: 'Assets:Checking', amount: '', currency: '' },
        ],
      },
      '2026-07-16'
    );
    expect(result.ok).toBe(true);
    const text = await fs.readFile(
      path.join(getJournalDir('test-user'), 'main.ledger'),
      'utf-8'
    );
    expect(text).toContain('~ every 1 months from 2026/01/05');
    expect(text).toContain('; :handled: 2026-07-05');
  });

  it('omits :handled: for a future anchor (no backlog either way)', async () => {
    const result = await service.addRecurring(
      'test-user',
      {
        schedule: { unit: 'month', count: 1, anchor: '2026-09-05' },
        postings: [
          { account: 'Expenses:Rent', amount: '900', currency: 'USD' },
          { account: 'Assets:Checking', amount: '', currency: '' },
        ],
      },
      '2026-07-16'
    );
    expect(result.ok).toBe(true);
    const text = await fs.readFile(
      path.join(getJournalDir('test-user'), 'main.ledger'),
      'utf-8'
    );
    expect(text).toContain('~ every 1 months from 2026/09/05');
    expect(text).not.toContain(':handled:');
  });

  it('rejects a draft without a schedule', async () => {
    const result = await service.addRecurring(
      'test-user',
      { period: 'Monthly', postings: [] },
      '2026-07-16'
    );
    expect(result.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run lib/journal/service.recurring-occurrence.test.ts`
Expected: FAIL — `addRecurring` rejects `schedule` as an unknown key / wrong arity.

- [ ] **Step 3: Implement**

In `lib/journal/recurring.ts` export `recurringScheduleInputSchema` (shape above) and:

```typescript
export const recurringCreateSchema = recurringDraftSchema
  .omit({ period: true, handled: true, uid: true })
  .extend({ schedule: recurringScheduleInputSchema });
export type RecurringCreateDraft = z.infer<typeof recurringCreateSchema>;
```

In `lib/journal/service.ts` `addRecurring`: change the signature to `(userId: string, rawDraft: unknown, today: string)`, validate with `recurringCreateSchema`, then build the stored draft before the existing `withUserLock` block:

```typescript
    const { schedule, ...rest } = parsed.data;
    const storedDraft: RecurringDraft = {
      ...rest,
      period: serializeSchedule(schedule),
      handled: lastOccurrenceBefore(schedule, today) ?? undefined,
      uid: generateUid(),
    };
```

(then use `storedDraft` where the old code built `draft`; import `serializeSchedule`, `lastOccurrenceBefore` from `./schedule`). Update `createRecurringAction` to pass `new Date().toISOString().slice(0, 10)` as the third argument, and update `features/recurring/RecurringView.tsx`'s `draft` JSON to send `schedule: { unit, count, anchor }` instead of `period` (full form change lands in Task 8; here just keep the app compiling — replace the `period` state with the three schedule fields and serialize them into the hidden input).

- [ ] **Step 4: Run to verify pass**

Run: `pnpm vitest run lib/journal/service.recurring-occurrence.test.ts lib/journal/recurring.test.ts && pnpm exec tsc --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
git add lib/journal/recurring.ts lib/journal/service.ts lib/journal/service.recurring-occurrence.test.ts features/recurring/actions/createRecurring.ts features/recurring/RecurringView.tsx
git commit -m "feat(recurring): structured schedule input with handled initialization"
```

---

### Task 4: Service — post and skip an occurrence

**Files:**
- Modify: `lib/journal/service.ts`
- Test: `lib/journal/service.recurring-occurrence.test.ts` (extend)

**Interfaces:**
- Consumes: `parseSchedule`, `expandSchedule` (Task 1); `handled` on `ParsedRecurring` (Task 2); existing `formatTransaction`, `formatRecurring`, `generateUid`, `verifyJournalParseable`, `pull`/`push`, `withUserLock`, `getJournalDirSize`/quota helpers.
- Produces (both on `JournalService`):
  - `postRecurringOccurrence(userId: string, input: { uid: string; expectedFingerprint: string; dueDate: string; today: string }): Promise<WriteResult>`
  - `skipRecurringOccurrence(userId: string, input: { uid: string; expectedFingerprint: string; dueDate: string; today: string }): Promise<WriteResult>`
  - Shared behavior (private `handleRecurringOccurrence(userId, input, mode: 'post' | 'skip')`):
    1. `withUserLock` → `pull` → locate the rule by uid across `resolveIncludes` files (same loop as `deleteRecurring`).
    2. Fingerprint mismatch → `{ ok: false, reason: 'stale', message: 'This recurring entry was modified somewhere else.' }`.
    3. `parseSchedule(rule.period)` null → `{ ok: false, reason: 'invalid', message: 'This rule has an unsupported schedule.' }`.
    4. Oldest unhandled occurrence = `expandSchedule(schedule, floor, input.today)[0]` where `floor = rule.handled ?? dayBefore(input.today)` (helper `dayBefore` = ISO date minus one day, so a no-`:handled:` rule is due only for an occurrence landing today — no backlog, per spec rollout). If it is `undefined` or ≠ `input.dueDate` → `{ ok: false, reason: 'invalid', message: 'This occurrence is not the oldest unhandled one.' }`.
    5. Snapshot every file to be touched. For `post`: append to `mainPath` (quota-checked, exactly like `addTransaction`) a transaction built as:

```typescript
      const transactionDraft: TransactionDraft = {
        date: input.dueDate,
        payee: (rule.note ?? '').split('\n')[0] || 'Recurring',
        status: 'none',
        note: `:recurring: ${rule.uid}`,
        uid: generateUid(),
        postings: rule.postings,
      };
```

       (the provenance tag rides the existing `note` field — `formatTransaction` renders it as `    ; :recurring: <uid>` with zero formatter changes; nothing ever parses it back, it is provenance only).
    6. For both modes: rewrite the rule's block in its own file (line-splice `startLine-1..endLine-1`, same as `performEdit`) with `formatRecurring({ ...ruleDraftFields, handled: input.dueDate })`.
    7. One `verifyJournalParseable(mainPath)`; on failure restore all snapshots → `parse-failed`. Then `push`; on conflict restore all snapshots → `stale`. Then `invalidateCache`, `{ ok: true }`.

- [ ] **Step 1: Write the failing tests** — append to `lib/journal/service.recurring-occurrence.test.ts`. Seed helper for these tests:

```typescript
const seedRule = async (userId: string, handled?: string) => {
  const block = [
    '~ every 1 months from 2026/01/05',
    '    ; :uid: 01HZX5G5KJDS9HQRYK8E5T0DJC',
    ...(handled ? [`    ; :handled: ${handled}`] : []),
    '    ; Netflix',
    '    Expenses:Netflix                            USD 15',
    '    Assets:Checking                             USD -15',
    '',
  ].join('\n');
  await fs.writeFile(path.join(getJournalDir(userId), 'main.ledger'), block);
  await push(userId);
  const rules = await service.listRecurring(userId);
  return rules[0];
};
```

Tests:

```typescript
describe('postRecurringOccurrence', () => {
  it('writes the transaction, tags provenance, and advances :handled:', async () => {
    const rule = await seedRule('test-user', '2026-06-05');
    const result = await service.postRecurringOccurrence('test-user', {
      uid: rule.uid!,
      expectedFingerprint: rule.fingerprint,
      dueDate: '2026-07-05',
      today: '2026-07-16',
    });
    expect(result.ok).toBe(true);
    const text = await fs.readFile(
      path.join(getJournalDir('test-user'), 'main.ledger'),
      'utf-8'
    );
    expect(text).toContain('2026-07-05 Netflix');
    expect(text).toContain('; :recurring: 01HZX5G5KJDS9HQRYK8E5T0DJC');
    expect(text).toContain('; :handled: 2026-07-05');
    expect(text).not.toContain('; :handled: 2026-06-05');
  });

  it('rejects a replay: the first post changed the fingerprint', async () => {
    const rule = await seedRule('test-user', '2026-06-05');
    const input = {
      uid: rule.uid!,
      expectedFingerprint: rule.fingerprint,
      dueDate: '2026-07-05',
      today: '2026-07-16',
    };
    expect((await service.postRecurringOccurrence('test-user', input)).ok).toBe(true);
    const replay = await service.postRecurringOccurrence('test-user', input);
    expect(replay.ok).toBe(false);
    if (!replay.ok) expect(replay.reason).toBe('stale');
  });

  it('rejects posting a non-oldest occurrence', async () => {
    const rule = await seedRule('test-user', '2026-05-05');
    const result = await service.postRecurringOccurrence('test-user', {
      uid: rule.uid!,
      expectedFingerprint: rule.fingerprint,
      dueDate: '2026-07-05', // 2026-06-05 is still unhandled
      today: '2026-07-16',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('invalid');
  });

  it('rule without :handled: has no backlog: only a today-dated occurrence is due', async () => {
    const rule = await seedRule('test-user'); // no handled line
    const result = await service.postRecurringOccurrence('test-user', {
      uid: rule.uid!,
      expectedFingerprint: rule.fingerprint,
      dueDate: '2026-07-05',
      today: '2026-07-16',
    });
    expect(result.ok).toBe(false); // oldest unhandled is 2026-08-05 (> today) — nothing due
  });
});

describe('skipRecurringOccurrence', () => {
  it('advances :handled: without writing a transaction', async () => {
    const rule = await seedRule('test-user', '2026-06-05');
    const result = await service.skipRecurringOccurrence('test-user', {
      uid: rule.uid!,
      expectedFingerprint: rule.fingerprint,
      dueDate: '2026-07-05',
      today: '2026-07-16',
    });
    expect(result.ok).toBe(true);
    const text = await fs.readFile(
      path.join(getJournalDir('test-user'), 'main.ledger'),
      'utf-8'
    );
    expect(text).toContain('; :handled: 2026-07-05');
    expect(text).not.toContain('2026-07-05 Netflix');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run lib/journal/service.recurring-occurrence.test.ts`
Expected: FAIL — methods don't exist.

- [ ] **Step 3: Implement** `handleRecurringOccurrence` in `lib/journal/service.ts` per the interface contract above (mirror `deleteRecurring` for locate/splice/rollback and `addTransaction` for append/quota; both file mutations happen before the single verify+push; keep per-file snapshots in a `Map<string, string>` and restore all on any failure). Public wrappers:

```typescript
  async postRecurringOccurrence(userId: string, input: RecurringOccurrenceInput) {
    return this.handleRecurringOccurrence(userId, input, 'post');
  }
  async skipRecurringOccurrence(userId: string, input: RecurringOccurrenceInput) {
    return this.handleRecurringOccurrence(userId, input, 'skip');
  }
```

with `export type RecurringOccurrenceInput = { uid: string; expectedFingerprint: string; dueDate: string; today: string }`. The `dayBefore` helper:

```typescript
const dayBefore = (iso: string): string => {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
};
```

Rebuilding the rule draft for `formatRecurring`: `{ period: rule.period, note: rule.note, uid: rule.uid, handled: input.dueDate, postings: rule.postings }`.

- [ ] **Step 4: Run to verify pass**

Run: `pnpm vitest run lib/journal/service.recurring-occurrence.test.ts && pnpm vitest run lib/journal/service.test.ts`
Expected: PASS, existing service tests untouched.

- [ ] **Step 5: Commit**

```bash
git add lib/journal/service.ts lib/journal/service.recurring-occurrence.test.ts
git commit -m "feat(recurring): post and skip occurrence service methods"
```

---

### Task 5: Due-list builder

**Files:**
- Create: `features/recurring/dueList.ts`
- Test: `features/recurring/dueList.test.ts`

**Interfaces:**
- Consumes: `ParsedRecurring` (with `handled`), `parseSchedule`, `expandSchedule`.
- Produces:

```typescript
export type RecurringOccurrenceView = {
  ruleUid: string;
  fingerprint: string;
  date: string; // YYYY-MM-DD
  label: string; // rule note first line, or first posting account
  postings: { account: string; amount: string; currency: string }[];
  overdue: boolean;
};

export type RecurringDueList = {
  due: RecurringOccurrenceView[]; // date <= today, oldest first
  upcoming: RecurringOccurrenceView[]; // today < date <= horizon
  unsupported: { ruleUid: string | undefined; period: string }[];
};

export const buildDueList = (
  rules: readonly ParsedRecurring[],
  today: string,
  horizon: string // e.g. today + 30 days
): RecurringDueList
```

- Pure function: for each rule, `parseSchedule(rule.period)`; null → `unsupported`. Rules without a uid also go to `unsupported` (no stable identity to act on). Floor = `rule.handled ?? dayBefore(today)`. Expand floor→horizon; split by `date <= today`. `overdue = date < today`. Due rows sorted date ascending across rules; only the oldest unhandled occurrence **per rule** is actionable, and later ones are still listed (the UI disables all but the first per rule — buttons carry `dueDate`, and the service enforces oldest-first regardless). Move `dayBefore` into `lib/journal/schedule.ts` and export it so this module and the service share it.

- [ ] **Step 1: Write the failing tests**

```typescript
// features/recurring/dueList.test.ts
import { describe, it, expect } from 'vitest';
import { buildDueList } from './dueList';
import { parseRecurringFile } from '@/lib/journal/recurring';

const rules = parseRecurringFile(
  'main.ledger',
  [
    '~ every 1 months from 2026/01/05',
    '    ; :uid: 01HZX5G5KJDS9HQRYK8E5T0DJC',
    '    ; :handled: 2026-05-05',
    '    ; Netflix',
    '    Expenses:Netflix                            USD 15',
    '    Assets:Checking                             USD -15',
    '',
    '~ Monthly',
    '    ; :uid: 01HZX5G5KJDS9HQRYK8E5T0DKZ',
    '    Expenses:Rent                               USD 900',
    '    Assets:Checking                             USD -900',
    '',
  ].join('\n')
);

describe('buildDueList', () => {
  it('splits due (with backlog) from upcoming and flags unsupported', () => {
    const list = buildDueList(rules, '2026-07-16', '2026-08-15');
    expect(list.due.map((o) => o.date)).toEqual(['2026-06-05', '2026-07-05']);
    expect(list.due[0].overdue).toBe(true);
    expect(list.due[0].label).toBe('Netflix');
    expect(list.upcoming.map((o) => o.date)).toEqual(['2026-08-05']);
    expect(list.unsupported).toEqual([
      { ruleUid: '01HZX5G5KJDS9HQRYK8E5T0DKZ', period: 'Monthly' },
    ]);
  });

  it('rule without :handled: contributes no backlog', () => {
    const fresh = parseRecurringFile(
      'main.ledger',
      [
        '~ every 1 months from 2026/01/16',
        '    ; :uid: 01HZX5G5KJDS9HQRYK8E5T0DAA',
        '    Expenses:Gym                             USD 20',
        '    Assets:Checking                          USD -20',
        '',
      ].join('\n')
    );
    const list = buildDueList(fresh, '2026-07-16', '2026-08-15');
    expect(list.due.map((o) => o.date)).toEqual(['2026-07-16']); // today only
  });
});
```

- [ ] **Step 2: Run to verify failure** — `pnpm vitest run features/recurring/dueList.test.ts` → FAIL (module missing).

- [ ] **Step 3: Implement** `buildDueList` per the contract (straightforward map/filter over `expandSchedule` output; label = `(rule.note ?? '').split('\n')[0] || rule.postings[0]?.account ?? ''`; postings mapped to `{ account, amount, currency }`).

- [ ] **Step 4: Run to verify pass** — `pnpm vitest run features/recurring/dueList.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add features/recurring/dueList.ts features/recurring/dueList.test.ts lib/journal/schedule.ts
git commit -m "feat(recurring): due-list builder"
```

---

### Task 6: Audit actions + Post/Skip server actions

**Files:**
- Modify: `lib/audit/schema.ts` (add `'recurring.post'`, `'recurring.skip'` to `AUDIT_ACTIONS`, after `'recurring.add'`), `lib/audit/describe.ts` (add human labels following the existing entries — check `lib/audit/describe.test.ts` for the expected mapping shape and extend it)
- Create: `features/recurring/actions/postOccurrence.ts`, `features/recurring/actions/skipOccurrence.ts`
- Test: `lib/audit/describe.test.ts` (extend)

**Interfaces:**
- Consumes: `journalService.postRecurringOccurrence` / `skipRecurringOccurrence` (Task 4).
- Produces: `postOccurrenceAction(uid: string, fingerprint: string, dueDate: string): Promise<{ ok: true } | { ok: false; message: string }>` and the identical `skipOccurrenceAction`. Client components import these.

- [ ] **Step 1: Write the action** — `features/recurring/actions/postOccurrence.ts`, cloned from `deleteRecurring.ts`'s structure:

```typescript
'use server';

import { auditService, auditRequestMeta } from '@/lib/audit';
import { requireUser } from '@/lib/auth/require-user';
import { journalService } from '@/lib/journal';
import { getJournalDirSize } from '@/lib/journal/quota';
import { rateLimit, WRITE, RATE_LIMIT_MESSAGE } from '@/lib/rate-limit';
import { revalidatePath } from 'next/cache';

export type OccurrenceActionResult = { ok: true } | { ok: false; message: string };

export async function postOccurrenceAction(
  uid: string,
  fingerprint: string,
  dueDate: string
): Promise<OccurrenceActionResult> {
  const user = await requireUser();
  if (!rateLimit(WRITE, user.id).allowed) {
    return { ok: false, message: RATE_LIMIT_MESSAGE };
  }
  const bytesBefore = await getJournalDirSize(user.id);
  const result = await journalService.postRecurringOccurrence(user.id, {
    uid,
    expectedFingerprint: fingerprint,
    dueDate,
    today: new Date().toISOString().slice(0, 10),
  });
  const bytesAfter = await getJournalDirSize(user.id);
  await auditService.record(user.id, {
    action: 'recurring.post',
    result: result.ok ? 'success' : 'failure',
    targetUid: uid,
    bytesBefore,
    bytesAfter,
    detail: result.ok ? { dueDate } : { reason: result.reason, dueDate },
    ...(await auditRequestMeta()),
  });
  if (!result.ok) return { ok: false, message: result.message };
  revalidatePath('/', 'layout');
  return { ok: true };
}
```

`skipOccurrence.ts` is identical with `skipRecurringOccurrence` and `'recurring.skip'` (import `OccurrenceActionResult` from `./postOccurrence`).

- [ ] **Step 2: Extend audit schema, describe map, and its test**; run `pnpm vitest run lib/audit/describe.test.ts` → PASS.

- [ ] **Step 3: Type-check** — `pnpm exec tsc --noEmit` → clean.

- [ ] **Step 4: Commit**

```bash
git add lib/audit/schema.ts lib/audit/describe.ts lib/audit/describe.test.ts features/recurring/actions/postOccurrence.ts features/recurring/actions/skipOccurrence.ts
git commit -m "feat(recurring): post/skip occurrence server actions with audit"
```

---

### Task 7: Dashboard widget — due queue + upcoming preview

**Files:**
- Create: `features/dashboard/UpcomingBillsWidget.tsx` (client component)
- Modify: `features/dashboard/Dashboard.tsx` (replace the `getUpcomingBills(...)` entry in the `Promise.all` with `journalService.listRecurring(user.id).then((rules) => buildDueList(rules, todayIso, upcomingEnd))` and render `<UpcomingBillsWidget dueList={dueList} />` where the current upcoming-bills markup sits; delete `getUpcomingBills` and `UpcomingBill` from `Dashboard.utils.ts` once nothing references them)

**Interfaces:**
- Consumes: `RecurringDueList` (Task 5), `postOccurrenceAction` / `skipOccurrenceAction` (Task 6).
- Produces: `UpcomingBillsWidget({ dueList }: { dueList: RecurringDueList })`.

- [ ] **Step 1: Build the component.** Client component modeled on `RecurringView`'s delete flow (`useTransition`, per-row pending key `${ruleUid}:${date}`, one inline error slot). Layout:
  - "Due" section: rows `label — date — amount` with overdue rows styled `text-destructive` on the date; Post (primary, small) and Skip (ghost) buttons. Per rule, only the oldest row's buttons are enabled (`disabled={!isOldestForRule}` — compute a `Set` of `ruleUid` first-seen while rendering; the list is date-ascending).
  - "Upcoming" section: read-only rows exactly like today's widget.
  - Unsupported rules: one muted line — "N rules have schedules this view can't expand" linking to `/recurring`.
  - Empty due + empty upcoming keeps the widget's existing empty state.
  - Amount display: the first posting with a non-empty amount, rendered as `${currency} ${amount}` — the rule's own text, no arithmetic.
- [ ] **Step 2: Wire into `Dashboard.tsx`**, remove dead `getUpcomingBills`/`UpcomingBill` code and their import.
- [ ] **Step 3: Verify** — `pnpm exec tsc --noEmit && pnpm lint`, then `pnpm vitest run` (full suite; `Dashboard.utils.test.ts` may need its `getUpcomingBills` cases deleted with the function). Manually: `pnpm dev`, seed a rule with a past `:handled:`, confirm due rows render, Post writes the transaction and the row disappears, Skip advances without a transaction, double-click shows the stale message.
- [ ] **Step 4: Commit**

```bash
git add features/dashboard/UpcomingBillsWidget.tsx features/dashboard/Dashboard.tsx features/dashboard/Dashboard.utils.ts features/dashboard/Dashboard.utils.test.ts
git commit -m "feat(dashboard): due-occurrence queue with post/skip in upcoming bills widget"
```

---

### Task 8: /recurring form → structured schedule; rule list gains next-due

**Files:**
- Modify: `features/recurring/RecurringView.tsx`, `app/recurring/page.tsx`

**Interfaces:**
- Consumes: `recurringCreateSchema` draft shape (Task 3), `buildDueList` (Task 5).
- Produces: no new exports; `RecurringRowView` gains `nextDue?: string` and `unsupported: boolean`.

- [ ] **Step 1: Form.** Replace the freeform "Repeats" input (and its datalist) with: `Every [number input, min 1] [select: days/weeks/months/years] starting [input type="date"]` (native date input; default = today). The hidden `draft` JSON becomes `{ schedule: { unit, count, anchor }, note, postings }`. Helper text: "Repeats on the anchor's day — e.g. every 1 months starting 2026-01-05 runs on the 5th."
- [ ] **Step 2: Rule list.** `app/recurring/page.tsx` computes `buildDueList` alongside `listRecurring` and passes per-rule `nextDue` (first occurrence, due or upcoming, for that uid) and `unsupported` into rows. `RecurringView` renders a "Next due" column; unsupported rules show "unsupported schedule" in that cell (delete still works).
- [ ] **Step 3: Verify** — `pnpm exec tsc --noEmit && pnpm lint && pnpm vitest run`; manually create a rule via the form, confirm the serialized directive and `:handled:` in the journal (Settings → export or `/transactions` raw view), and the next-due column.
- [ ] **Step 4: Commit**

```bash
git add features/recurring/RecurringView.tsx app/recurring/page.tsx
git commit -m "feat(recurring): structured schedule form and next-due column"
```

---

### Task 9: End-to-end verification + docs pruning

**Files:**
- Modify: `LEDGER-AUDIT.md` (append the 2026-07-16 `--forecast` findings: no past emission, `--now` behavior, calendar-boundary snapping — they are exactly the gotcha class that file collects)
- Modify: `features/dashboard/Dashboard.utils.ts` (the `getSafeToSpend` doc comment already notes the anchor snapping; leave the function — income forecasting still uses ledger `--forecast` and is out of scope)

- [ ] **Step 1:** Full suite: `pnpm vitest run && pnpm exec tsc --noEmit && pnpm lint && pnpm build` — all green.
- [ ] **Step 2:** Live walk: create rule anchored last month → no backlog; set `:handled:` back two months by editing the journal → two due rows, oldest actionable; Post oldest → transaction visible on /transactions with the `:recurring:` note line; Skip next; refresh → empty due list. Verify plain `ledger stats` still parses the journal.
- [ ] **Step 3:** Append findings to `LEDGER-AUDIT.md`; commit.

```bash
git add LEDGER-AUDIT.md
git commit -m "docs(ledger-audit): record --forecast anchor-snapping findings"
```

---

## Self-Review Notes

- Spec coverage: data model (Tasks 2–4), creation normalization (Task 3), due list (Task 5), actions/audit (Task 6), widget (Task 7), form + next-due (Task 8), rollout/no-migration (floor default covered in Tasks 4–5), out-of-scope list untouched.
- Deliberate simplifications: provenance tag rides the transaction `note` field (no formatter/schema change; visible when editing that transaction — acceptable, nothing parses it); overdue backlog is uncapped (a daily rule ignored for a year lists 365 rows — add a cap only if it ever happens).
- `addRecurring` signature change (`today` parameter) touches only `createRecurringAction`.
