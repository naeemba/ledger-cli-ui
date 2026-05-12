# Ledger CLI UI

A Next.js reporting UI for [ledger-cli](https://ledger-cli.org/) journals.

## Prerequisites

- Node 20+ and `pnpm`
- `ledger` CLI installed and on `PATH`
- A ledger journal file

## Setup

```bash
pnpm install
cp .env.example .env
```

Edit `.env`:

| Variable | Required | Notes |
|---|---|---|
| `LEDGER_FILE` | yes | Absolute path to your `.ledger` file. `~` is expanded. |
| `DEFAULT_CURRENCY` | yes | Currency symbol used in `-X` (price conversion). The Dashboard, Balance, Periodic Balance, and Debts pages all rely on this. |
| `LEDGER_PRICE_DB` | optional | Path to a price-db file if you use FX or commodity prices. |
| `DATE_LOCALE` | optional | BCP 47 locale for date formatting. Defaults to `en-US`. |

## Running

```bash
pnpm dev       # http://localhost:3000
pnpm build     # production build
pnpm start     # serve the production build
pnpm type-check
pnpm lint
```

## Notes

- All routes are server-rendered on demand (`dynamic = 'force-dynamic'`) because each page shells out to `ledger` per request.
- Account names supplied via URL are validated server-side (no leading `-`, no control characters, length-bounded) before being passed as positional args to `ledger` via `execFile`. No values are interpolated into a shell.
- Uploaded files are restricted to `.ledger`, `.dat`, `.journal`, `.txt` extensions and `10 MB` max.
