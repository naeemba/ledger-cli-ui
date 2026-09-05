import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NET_FORMAT, personRegister } from './getPersonDebts';
import { parseNet, personAccountPatterns, RECEIVABLE_ROOT } from './parse';
import {
  RECORD_SEPARATOR,
  FIELD_SEPARATOR,
  REGISTER_FORMAT,
  parseAccountRegister,
} from '@/features/transactions/row/registerRows';
import { withLedgerJournal } from '@/lib/test-utils/ledger';

const runLedger = vi.hoisted(() => vi.fn());
vi.mock('@/utils/runLedger', () => ({ default: runLedger }));

const row = (fields: string[]) =>
  `${RECORD_SEPARATOR}${[...fields, ''].join(FIELD_SEPARATOR)}\n`;

describe('personRegister', () => {
  beforeEach(() => {
    runLedger.mockReset();
    runLedger.mockResolvedValue('');
  });

  it('asks ledger for a base-converted register that keeps revaluation rows', async () => {
    await personRegister('usd', 'Bob');
    const [args] = runLedger.mock.calls[0];

    expect(args[0]).toBe('register');
    // Dropping them would end the list at the last transaction's prices while
    // the page header still shows today's — two debts on one page.
    expect(args).not.toContain('--no-revalued');
    // The reverse() in registerViews only means "newest first" if ledger sorted.
    expect(
      args.slice(args.indexOf('--sort'), args.indexOf('--sort') + 2)
    ).toEqual(['--sort', 'date']);
    expect(args.slice(args.indexOf('-X'), args.indexOf('-X') + 2)).toEqual([
      '-X',
      'usd',
    ]);
    // Everything after `--` is a pattern, so a person name can't be a flag.
    const patterns = args.slice(args.indexOf('--') + 1);
    expect(patterns).toEqual([
      'Assets:Receivable:Bob$',
      'Assets:Receivable:Bob:',
      'Liabilities:Payable:Bob$',
      'Liabilities:Payable:Bob:',
    ]);
  });

  it('returns the rows newest first', async () => {
    runLedger.mockResolvedValue(
      row(['2026-01-10', 'Lunch loan', '$ 30.00', '$ 30.00']) +
        row(['2026-05-10', 'Bob paid rent', '$ -22.00', '$ 8.00'])
    );
    const views = await personRegister('usd', 'Bob');
    expect(views.map((view) => view.date)).toEqual([
      '2026-05-10',
      '2026-01-10',
    ]);
  });

  it('greys out the revaluation rows ledger adds itself', async () => {
    runLedger.mockResolvedValue(
      row(['2026-01-10', 'Lunch loan', '$ 30.00', '$ 30.00']) +
        row(['2026-07-01', 'Commodities revalued', '$ 15.00', '$ 45.00'])
    );
    const views = await personRegister('usd', 'Bob');
    expect(views.map((view) => view.generated)).toEqual([true, undefined]);
  });

  it('refuses an unsafe person name without shelling out', async () => {
    expect(await personRegister('usd', '--version')).toEqual([]);
    expect(runLedger).not.toHaveBeenCalled();
  });
});

// Bob is lent $30, then EUR 10; EUR moves 1.00 -> 1.50 -> 3.00, the last move
// dated AFTER his final transaction (the price fetcher writes one on every
// run). The page header takes today's value, the list takes each row's own
// date — so without ledger's revaluation rows the two disagree by $15.
const JOURNAL = [
  'P 2026/01/01 EUR $1.00',
  'P 2026/04/01 EUR $1.50',
  'P 2026/07/01 EUR $3.00',
  '',
  '2026/01/10 Lunch loan',
  '    Assets:Receivable:Bob        $ 30.00',
  '    Assets:Checking',
  '',
  '2026/03/10 Euro loan to Bob',
  '    Assets:Receivable:Bob        EUR 10.00',
  '    Assets:Checking',
  '',
  '2026/05/10 Bob paid rent for me',
  '    Expenses:Rent                $ 22.00',
  '    Assets:Receivable:Bob',
  '',
].join('\n');

describe('ledger 3.4.1: the list total and the header net agree', () => {
  const patterns = ['--', ...personAccountPatterns(RECEIVABLE_ROOT, 'Bob')];

  it('ends the register on the same figure the collapsed net reports', () =>
    withLedgerJournal(JOURNAL, async (ledger) => {
      const rows = parseAccountRegister(
        await ledger([
          'register',
          '--format',
          REGISTER_FORMAT,
          '--sort',
          'date',
          '-X',
          '$',
          ...patterns,
        ])
      );
      const net = parseNet(
        'Bob',
        // runLedger pushes `--sort -date` in front of every caller that does
        // not opt out, and netForPerson does not — under a revalued register
        // the two orders walk different running totals to the same end, so
        // reproducing production's order is the point of this assertion.
        await ledger([
          'register',
          '--sort',
          '-date',
          '-X',
          '$',
          '--collapse',
          '--format',
          NET_FORMAT,
          ...patterns,
        ])
      );

      expect(net?.amount).toBe('$ 38.00');
      expect(rows.at(-1)?.runningTotal).toBe(net?.amount);
      expect(rows.at(-1)?.payee).toBe('Commodities revalued');
    }));

  it('drifts by the price move once --no-revalued hides those rows', () =>
    withLedgerJournal(JOURNAL, async (ledger) => {
      const rows = parseAccountRegister(
        // `--exchange` implies `--revalued`, so the flag only bites after -X.
        await ledger([
          'register',
          '--format',
          REGISTER_FORMAT,
          '--sort',
          'date',
          '-X',
          '$',
          '--no-revalued',
          ...patterns,
        ])
      );
      // Why personRegister must not pass --no-revalued: $23.00 under a $38.00
      // header.
      expect(rows.at(-1)?.runningTotal).toBe('$ 23.00');
    }));
});
