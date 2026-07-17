import { execFile } from 'child_process';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { promisify } from 'util';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  parseBudgetRows,
  parseUnbudgetedRows,
  BUDGET_ROW_FORMAT,
} from './report';

const execFilePromise = promisify(execFile);

describe('parseBudgetRows', () => {
  it('parses rows and drops the grand-total row', () => {
    const stdout = [
      'Expenses:Food|$ 90.00|$ 400.00|$ -310.00|90|400',
      'Expenses:Rent|$ 1,850.00|$ 2,000.00|$ -150.00|1850|2000',
      '|$ 1,940.00|$ 2,400.00|$ -460.00|1940|2400',
      '',
    ].join('\n');
    const rows = parseBudgetRows(stdout);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      account: 'Expenses:Food',
      actual: '$ 90.00',
      budgeted: '$ 400.00',
      difference: '$ -310.00',
      usedRatio: 90 / 400,
    });
    expect(rows[1].actual).toBe('$ 1,850.00'); // thousands separator survives
  });

  it('yields null ratio for zero budget quantity', () => {
    const rows = parseBudgetRows('Expenses:Misc|$ 5.00|0|$ 5.00|5|0\n');
    expect(rows[0].usedRatio).toBeNull();
  });
});

describe('parseUnbudgetedRows', () => {
  it('parses account|amount lines and skips blanks', () => {
    const rows = parseUnbudgetedRows('Expenses:Fun|$ 40.00\n\n');
    expect(rows).toEqual([{ account: 'Expenses:Fun', amount: '$ 40.00' }]);
  });

  it('drops grand-total rows and malformed lines', () => {
    const stdout =
      'Expenses:Fun|$ 40.00\nExpenses:Misc|$ 15.00\n|$ 55.00\nno-pipe-line\n\n';
    const rows = parseUnbudgetedRows(stdout);
    expect(rows).toHaveLength(2);
    expect(rows).toEqual([
      { account: 'Expenses:Fun', amount: '$ 40.00' },
      { account: 'Expenses:Misc', amount: '$ 15.00' },
    ]);
  });
});

describe('ledger 3.4.1 budget report contract', () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'budget-report-'));
  });

  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it('emits the 6-field format this module parses', async () => {
    const file = path.join(tmp, 'main.ledger');
    await fs.writeFile(
      file,
      [
        '2026/07/01 Rent',
        '    Expenses:Rent  $1850.00',
        '    Assets:Checking',
        '',
        '~ Monthly',
        '    Expenses:Rent  $2000.00',
        '    Assets:Checking',
        '',
      ].join('\n')
    );

    const { stdout } = await execFilePromise('ledger', [
      '--init-file',
      '/dev/null',
      '--file',
      file,
      'budget',
      '^Expenses',
      '-p',
      'jul 2026',
      '--flat',
      '--format',
      BUDGET_ROW_FORMAT,
    ]);

    const rows = parseBudgetRows(stdout);
    // Amount display (symbol spacing, thousands separators) is inferred per
    // ledger build and varies ("$ 1,850.00" vs "$1850.00"); assert only the
    // structural contract this parser relies on. A correct usedRatio proves
    // the quantity fields (5 and 6) parsed in the right positions, and
    // matching digits prove fields 2-4 carry the rendered amounts.
    const digits = (amount: string) => amount.replace(/[^\d-]/g, '');
    expect(rows).toHaveLength(1);
    expect(rows[0].account).toBe('Expenses:Rent');
    expect(rows[0].usedRatio).toBe(1850 / 2000);
    expect(digits(rows[0].actual)).toBe('185000');
    expect(digits(rows[0].budgeted)).toBe('200000');
    expect(digits(rows[0].difference)).toBe('-15000');
  });

  it('parseUnbudgetedRows filters grand-total from real ledger output', async () => {
    const file = path.join(tmp, 'main.ledger');
    await fs.writeFile(
      file,
      [
        '2026/07/01 Fun spending',
        '    Expenses:Fun  $40.00',
        '    Assets:Checking',
        '',
        '2026/07/05 Misc spending',
        '    Expenses:Misc  $15.00',
        '    Assets:Checking',
        '',
        '~ Monthly',
        '    Expenses:Rent  $2000.00',
        '    Assets:Checking',
        '',
      ].join('\n')
    );

    const { stdout } = await execFilePromise('ledger', [
      '--init-file',
      '/dev/null',
      '--file',
      file,
      'bal',
      '^Expenses',
      '--unbudgeted',
      '-p',
      'jul 2026',
      '--flat',
      '--format',
      '%A|%T\n',
    ]);

    const rows = parseUnbudgetedRows(stdout);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.account)).toEqual([
      'Expenses:Fun',
      'Expenses:Misc',
    ]);
    // Symbol-amount spacing varies per ledger build; normalize it out.
    expect(rows[0].amount.replace(/\s+/g, '')).toBe('$40.00');
    expect(rows[1].amount.replace(/\s+/g, '')).toBe('$15.00');
  });
});
