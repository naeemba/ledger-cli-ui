# Shared debt page — design

**Date:** 2026-10-03
**Status:** approved in conversation, awaiting spec review

## Goal

Give one person a read-only link to their debts with you. You open
`/debts/Bashir`, click **Share**, and send Bashir the link. He opens it without
an account and sees what he owes you and what you owe him, row by row. The page
updates by itself every time you save a change. You can revoke the link at any
time, and it stops working right away.

## Constraints

- **Journals stay encrypted at rest.** The server can read a journal only while
  its owner is unlocked. Nothing in this feature may let the server, the
  database or a backup read Bashir's page or learn who you share with.
- **Ledger does the math.** Amounts, running balances, the sign flip for
  Bashir's side and the per-currency net all come from `ledger`. The code only
  reads the output. It never adds, converts or negates amounts.
- **No leaks from your side of a transaction.** Bashir sees no account other
  than his own, no notes and no tags.

## Decisions

| Question | Decision |
|---|---|
| Currency | Each amount in its own currency. No conversion, so his page never drifts while you are locked. |
| Point of view | His: "You owe Naeem € 100.00". Signs flipped by ledger. |
| Row detail | Date, description (payee), amount, running balance. Nothing else. |
| Links per person | One. Sharing again after revoking makes a new link. |
| Expiry | None. Revoke is the only way to end a link. |

## How it works

### The link

`https://<host>/s/<shareId>#<key>`

- `shareId` is 16 random bytes, base64url.
- `key` is the 32-byte page key, base64url. It sits after `#`, so browsers
  never send it to the server, not even in the `Referer` header.

### The page key is never stored

The page key is worked out on the fly:

    pageKey = HKDF-SHA256(DEK, salt = empty, info = "debt-share-page-v1:" + shareId)

The server holds your DEK only while you are unlocked, so it can produce the
page key only then. You can only save while unlocked, so the rebuild after a
save always has it. A revoked share's id is deleted, so its key can never be
produced again. A new share gets a new id and so a new key.

### What is stored

New table `debtShare`:

| Column | Content |
|---|---|
| `id` | `shareId` (primary key) |
| `userId` | owner, foreign key to the user, `ON DELETE CASCADE` |
| `sealedMeta` | person name and your display name, AES-256-GCM under `HKDF(DEK, info = "debt-share-meta-v1")`, with `id` as associated data |
| `sealedPage` | the page payload, AES-256-GCM under `pageKey`, with `id` as associated data |
| `createdAt`, `updatedAt` | timestamps |

The person's name is sealed too. A plain `person` column would tell anyone with
the database that you lend money to "Bashir". To find a person's share, the
server unseals the meta of the owner's shares. There are only a few, and this
only happens while the owner is unlocked. The rule of one share per person is
checked the same way, in code, when a share is created.

### The page payload

The JSON that gets sealed:

```json
{
  "version": 1,
  "ownerName": "Naeem",
  "person": "Bashir",
  "net": [
    { "amount": "€ 100.00", "direction": "viewer-owes" },
    { "amount": "$ 30.00", "direction": "viewer-owes" }
  ],
  "rows": [
    { "date": "2026-03-05", "payee": "Borrowed", "amount": "$ 20.00", "balance": ["€ -100.00", "$ -30.00"] }
  ],
  "generatedAt": "2026-10-03T14:02:00Z"
}
```

`viewer-owes` means Bashir owes you; `owner-owes` means you owe him. Every
amount string is exactly as ledger printed it.

### Asking ledger for Bashir's side

The person's account patterns are the existing anchored pair for both roots:
`Assets:Receivable:<name>$`, `Assets:Receivable:<name>:` and the same two for
`Liabilities:Payable`. Two calls:

1. **Rows:** `register --amount '-amount'` with a format giving date, payee,
   amount and running total, and no `-X`. Checked against ledger 3.4.1 on a
   sample journal. It keeps currencies apart and flips the signs:

       Lent cash        € -200.00   € -200.00
       Paid his dinner  $ -50.00    € -200.00 / $ -50.00
       He paid back     € 100.00    € -100.00 / $ -50.00
       Borrowed         $ 20.00     € -100.00 / $ -30.00

2. **Net:** the same flipped query, with a format that prints quantity,
   commodity and absolute amount for each currency in the final total. The code
   reads only the sign of each quantity, to choose "You owe" or "owes you". This
   is the same approach `parseNet` uses today.

Rows are newest first, matching your own page. The exact format strings, and
how a multi-currency running total splits across lines, get checked against
the real binary in the plan. Tests use `withLedgerJournal`.

### Rebuilding after a save

Every journal write ends with `push(userId)` while it holds the per-user lock.
After a successful push, `refreshDebtShares(userId)` runs, still inside the lock
and awaited:

1. No DEK in the session: return. This covers background jobs that run while
   the owner is locked.
2. Load the owner's shares. For each one: unseal the meta, ask ledger for the
   rows and the net, build the payload, seal it under the page key, and write
   `sealedPage` and `updatedAt`.
3. A failure on one share is logged, and that share keeps its previous page.
   The save itself always succeeds. A failed rebuild never rolls back your
   journal.

Cost: two ledger runs per share on every save. With a handful of shares, that
is a small delay on each save.

### Bashir's page: `/s/[shareId]`

- Public. No session, no `CryptoGate`, no app chrome. `isPublicPath` today
  matches exact paths only, so it gains a `/s/` prefix rule.
- The server component loads `sealedPage` by id and puts the ciphertext into
  the HTML. A missing id renders the same "This link is no longer active"
  screen as a bad key, so the page never reveals whether an id existed.
- A client component reads the key from `location.hash`, decrypts with
  WebCrypto AES-GCM (associated data = `shareId`) and renders it:
  - Header: "You owe Naeem € 100.00" or "Naeem owes you $ 30.00", one line
    per currency. "All settled" when there is no net.
  - The table: date, description, amount, balance.
  - Footer: "Updated 3 Oct 2026, 14:02".
  - A wrong key or bad data shows "This link is no longer active".
- `Referrer-Policy: no-referrer`, `X-Robots-Tag: noindex`,
  `Cache-Control: no-store`. The page has no links out.

### Your controls

On `/debts/[person]`:

- **No share yet:** a **Share** button. It opens a dialog asking for your
  display name (filled with your last one, or your account name), then creates
  the share, builds the first page and copies the link.
- **Shared:** "Shared · updated 14:02", **Copy link**, and **Revoke**. Revoke
  asks for confirmation, because the old link cannot come back.

On `/debts`: a small "Shared" marker next to each person who has a share.

Server actions, one file each, all requiring an unlocked session:
`createDebtShare(person, ownerName)`, `revokeDebtShare(shareId)`, and
`getDebtShareLink(person)`, which returns the link with its key for Copy.
Code is split into a repository (CRUD) and a service (seal, unseal, rebuild),
following the project's usual pattern.

### Clean-up

- **Account deletion:** removed by the foreign-key cascade.
- **Encryption reset:** `resetUserEncryption` deletes the user's shares. Their
  keys came from the old DEK, so they could never be rebuilt.

## Out of scope

Expiry dates, more than one link per person, Bashir replying or confirming,
showing the shared page in your base currency, and email delivery of the link.

## Risks

- **Revoking can't take back what he already saw.** If he took a screenshot
  last week, he keeps it.
- **Anyone with the full link can read the page.** If Bashir forwards it,
  the new reader sees the same page. Revoke is the remedy.
- **Saves get a little slower.** Each share adds two ledger runs to every save.

## Testing

- Ledger output end-to-end through `withLedgerJournal`: signs flipped,
  currencies kept apart, no other accounts in the output, a person whose name
  is a prefix of another's ("Bob" and "Bobby") kept apart.
- Seal and unseal round trip. A wrong key, a wrong `shareId` as associated data,
  or a revoked id all fail closed.
- The rebuild runs after a successful save, is skipped without a DEK, and a
  failure leaves the previous page in place without failing the save.
- Encryption reset and account deletion remove the shares.
- `/s/` is public. `/s/<unknown>` and a bad key render the same screen.
