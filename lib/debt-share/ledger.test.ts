import { describe, expect, it } from 'vitest';
import {
  parseSharedNet,
  parseSharedRows,
  sharedNetArgs,
  sharedRowsArgs,
} from './ledger';
import { withLedgerJournal } from '@/lib/test-utils/ledger';

const JOURNAL = `
2026-01-01 Lent cash
    Assets:Receivable:Bashir      200.00 EUR
    Assets:Bank:Savings
2026-02-01 Paid his dinner
    Assets:Receivable:Bashir:Food   $50.00
    Assets:Cash
2026-03-01 He paid back
    Assets:Bank:Checking   100.00 EUR
    Assets:Receivable:Bashir
2026-03-05 Borrowed
    Assets:Cash   $20.00
    Liabilities:Payable:Bashir
2026-03-06 Lent to his brother
    Assets:Receivable:Bashirx   999.00 EUR
    Assets:Cash
`;

describe('shared debt ledger queries', () => {
  it('lists the viewer’s side newest first, signs flipped, currencies apart', async () => {
    const rows = await withLedgerJournal(JOURNAL, async (run) =>
      parseSharedRows(await run(sharedRowsArgs('Bashir')))
    );
    expect(rows).toEqual([
      {
        date: '2026-03-05',
        payee: 'Borrowed',
        amount: '$20.00',
        balance: ['$-30.00', '-100.00 EUR'],
      },
      {
        date: '2026-03-01',
        payee: 'He paid back',
        amount: '100.00 EUR',
        balance: ['$-50.00', '-100.00 EUR'],
      },
      {
        date: '2026-02-01',
        payee: 'Paid his dinner',
        amount: '$-50.00',
        balance: ['$-50.00', '-200.00 EUR'],
      },
      {
        date: '2026-01-01',
        payee: 'Lent cash',
        amount: '-200.00 EUR',
        balance: ['-200.00 EUR'],
      },
    ]);
  });

  it('never leaks the owner’s other accounts or a prefix-named person', async () => {
    const stdout = await withLedgerJournal(JOURNAL, (run) =>
      run(sharedRowsArgs('Bashir'))
    );
    expect(stdout).not.toMatch(/Savings|Checking|Cash|999/);
  });

  it('nets each commodity with its own direction', async () => {
    const opposite = `${JOURNAL}
2026-04-01 Borrowed more
    Assets:Cash   $100.00
    Liabilities:Payable:Bashir
`;
    const net = await withLedgerJournal(opposite, async (run) =>
      parseSharedNet(await run(sharedNetArgs('Bashir')))
    );
    // € : Bashir still owes 100. $ : -50 + 20 + 100 → you owe him 70.
    expect(net).toEqual([
      { amount: '$70.00', direction: 'owner-owes' },
      { amount: '100.00 EUR', direction: 'viewer-owes' },
    ]);
  });

  it('drops a settled commodity and returns nothing when all is settled', async () => {
    const settled = `
2026-01-01 Lent
    Assets:Receivable:Bashir   $10.00
    Assets:Cash
2026-01-02 Repaid
    Assets:Cash   $10.00
    Assets:Receivable:Bashir
`;
    const net = await withLedgerJournal(settled, async (run) =>
      parseSharedNet(await run(sharedNetArgs('Bashir')))
    );
    expect(net).toEqual([]);
  });
  it('orders rows by date, not file order, so balances follow the dates', async () => {
    const backdated = `
2026-03-01 Lent ten
    Assets:Receivable:Bashir      $10.00
    Assets:Cash
2026-01-01 Lent five, added late
    Assets:Receivable:Bashir      $5.00
    Assets:Cash
`;
    const rows = await withLedgerJournal(backdated, async (run) =>
      parseSharedRows(await run(sharedRowsArgs('Bashir')))
    );
    expect(rows).toEqual([
      {
        date: '2026-03-01',
        payee: 'Lent ten',
        amount: '$-10.00',
        balance: ['$-15.00'],
      },
      {
        date: '2026-01-01',
        payee: 'Lent five, added late',
        amount: '$-5.00',
        balance: ['$-5.00'],
      },
    ]);
  });

  it('drops a quantity that is not a number instead of guessing its direction', () => {
    const stdout =
      'EUR\n\x1e-200\x1fEUR\x1f200.00 EUR\n$\n\x1eoops\x1f$\x1f$30.00\n';
    expect(parseSharedNet(stdout)).toEqual([
      { amount: '200.00 EUR', direction: 'viewer-owes' },
    ]);
  });
});
