import { describe, expect, it } from 'vitest';
import { parseNet, peopleFromBalance } from './parse';

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
