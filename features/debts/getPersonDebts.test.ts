import { describe, it, expect, vi, beforeEach } from 'vitest';
import { personRegister } from './getPersonDebts';
import {
  RECORD_SEPARATOR,
  FIELD_SEPARATOR,
} from '@/features/transactions/row/registerRows';

const runLedger = vi.hoisted(() => vi.fn());
vi.mock('@/utils/runLedger', () => ({ default: runLedger }));

const row = (fields: string[]) =>
  `${RECORD_SEPARATOR}${[...fields, ''].join(FIELD_SEPARATOR)}\n`;

describe('personRegister', () => {
  beforeEach(() => {
    runLedger.mockReset();
    runLedger.mockResolvedValue('');
  });

  it('asks ledger for a base-converted register with the revaluation row off', async () => {
    await personRegister('usd', 'Bob');
    const [args] = runLedger.mock.calls[0];

    expect(args[0]).toBe('register');
    expect(args).toContain('--no-revalued'); // no "Commodities revalued" row
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

  it('refuses an unsafe person name without shelling out', async () => {
    expect(await personRegister('usd', '--version')).toEqual([]);
    expect(runLedger).not.toHaveBeenCalled();
  });
});
