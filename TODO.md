# TODO

## Possible follow-ups

- [ ] Tests — there are none. Even smoke tests for the shell-out parsing logic (`getHighestExpense`, the `result.split('|')` pipelines, `validateAccount`) would catch parser regressions.
- [ ] Replace `dayjs` with `date-fns` or native `Intl` if you want to drop a dep — most uses are simple `format`/`startOf`/`endOf`.
- [ ] Memoize ledger reads with `unstable_cache` or short `revalidate` so the dashboard isn't re-shelling-out on every request.
- [ ] ESLint 10. Currently pinned at 9.x because `eslint-plugin-react@7.37.5` (transitive of `eslint-config-next`) crashes on ESLint 10 (`getFilename` removed). One-line bump once upstream releases support.
