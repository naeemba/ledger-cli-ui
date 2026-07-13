import { describe, expect, it } from 'vitest';
import { parseNet, peopleFromBalance, personAccountPatterns } from './parse';

describe('personAccountPatterns anchors a person to their own account tree', () => {
  it('emits an exact-account and a sub-account pattern', () => {
    expect(personAccountPatterns('Assets:Receivable', 'Bob')).toEqual([
      'Assets:Receivable:Bob$',
      'Assets:Receivable:Bob:',
    ]);
  });

  it('escapes regex metacharacters so a name is matched literally', () => {
    // A bare `A.C` would let `.` wildcard-match `AXC`; a single `\` is
    // un-escaped by ledger back into a wildcard, so the escape is a double `\`.
    expect(personAccountPatterns('Assets:Receivable', 'A.C')).toEqual([
      'Assets:Receivable:A\\\\.C$',
      'Assets:Receivable:A\\\\.C:',
    ]);
  });
});

describe('peopleFromBalance', () => {
  it('collects distinct names from both roots, ignoring other accounts', () => {
    const people = peopleFromBalance([
      { account: 'Assets:Receivable:Alex', amount: '$30' },
      { account: 'Liabilities:Payable:Alex', amount: '$-30' },
      { account: 'Liabilities:Payable:Carol', amount: '$-100' },
      { account: 'Assets:Checking', amount: '$500' },
    ]);
    expect(people).toEqual(['Alex', 'Carol']);
  });

  it('keeps a name with spaces as one segment', () => {
    expect(
      peopleFromBalance([
        { account: 'Assets:Receivable:Bob Smith', amount: '€40' },
      ])
    ).toEqual(['Bob Smith']);
  });

  it('collapses nested sub-accounts of one person into a single name', () => {
    expect(
      peopleFromBalance([
        { account: 'Assets:Receivable:Bob:Car', amount: '$50' },
        { account: 'Assets:Receivable:Bob:Rent', amount: '$44' },
        { account: 'Liabilities:Payable:Bob:Loan', amount: '$-10' },
      ])
    ).toEqual(['Bob']);
  });
});

describe('parseNet reads the final running-total line', () => {
  it('positive net → owes you', () => {
    expect(parseNet('Carol', '10|$|$ 10.00\n-100|$|$ 100.00\n')).toEqual({
      person: 'Carol',
      quantity: -100,
      amount: '$ 100.00',
      direction: 'you-owe',
    });
  });

  it('positive net → owes you (direction from sign)', () => {
    expect(parseNet('Alex', '50|$|$ 50.00\n30|$|$ 30.00\n')).toEqual({
      person: 'Alex',
      quantity: 30,
      amount: '$ 30.00',
      direction: 'owes-you',
    });
  });

  it('nets to zero → hidden (null)', () => {
    expect(parseNet('Alex', '30|$|$ 30.00\n0|$|$ 0.00\n')).toBeNull();
  });

  it('no matching postings → null', () => {
    expect(parseNet('Zed', '\n')).toBeNull();
    expect(parseNet('Zed', '')).toBeNull();
  });
});
