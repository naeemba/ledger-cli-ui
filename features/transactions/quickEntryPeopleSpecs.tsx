'use client';

import React from 'react';
import { AccountField, Field } from './entry/typeForms/fields';
import type { AccountRole } from './entry/types/accountRole';
import type { HeaderFields } from './entry/types/adapter';
import { transferAdapter, type TransferFields } from './entry/types/transfer';
import {
  AmountRow,
  firstMoneyAccount,
  isPositive,
  todayLocal,
  type QuickEntrySpec,
} from './quickEntryKit';
import Combobox from '@/components/Combobox';
import { Button } from '@/components/ui/button';

// --- Debt (money owed) -----------------------------------------------------
// Not a registry adapter: a debt is mechanically a two-posting transfer, so it
// compiles via transferAdapter. The value it adds is translation — the user
// names a person and the form builds the right account
// (Assets:Receivable:<Name> for money owed to them, Liabilities:Payable:<Name>
// for money they owe), so a per-person balance is a single ledger query over
// `/:<Name>$/`.
//
// The other side is not always cash. A debt is booked against wherever it came
// from: the expense when someone buys something for you (Expenses:Electronics
// 300 / Liabilities:Payable:Alex -300), or the income when someone owes you for
// something you earned (Assets:Receivable:Alex 400 / Income:Rent -400). Forcing
// a cash account there would record money leaving an account it never left.
const RECEIVABLE_ROOT = 'Assets:Receivable';
const PAYABLE_ROOT = 'Liabilities:Payable';
// The non-person side is wherever the debt came from. Owed to you it is
// credited: cash you handed over, income you earned but haven't been paid, or
// an expense you covered that turned out to be someone else's share.
const OWED_TO_YOU_ROLES: AccountRole[] = [
  'asset',
  'liability',
  'expense',
  'income',
];
// You owe them it is debited: cash they handed you, or the expense they paid.
const YOU_OWE_ROLES: AccountRole[] = ['asset', 'liability', 'expense'];

type DebtDirection = 'owed-to-you' | 'you-owe';

type DebtFields = HeaderFields & {
  direction: DebtDirection;
  person: string;
  amount: string;
  currency: string;
  otherAccount: string;
};

// A person name becomes a single account segment: colons would fake a
// sub-hierarchy and doubled spaces are rejected by the account schema.
const cleanPerson = (raw: string) =>
  raw.replace(/:/g, ' ').replace(/\s+/g, ' ').trim();

// Existing people, parsed from the receivable/payable account leaves, so the
// same person reuses the same account instead of spawning a near-duplicate.
const knownPeople = (accounts: string[]): string[] => {
  const people = new Set<string>();
  for (const account of accounts) {
    const match = account.match(
      /^(?:Assets:Receivable|Liabilities:Payable):([^:]+)$/
    );
    if (match) people.add(match[1]);
  }
  return [...people];
};

// Resolve the person account and its opposite side for a direction, so
// validate and compile agree on which two accounts a debt touches.
const debtAccounts = (
  person: string,
  f: DebtFields
): [to: string, from: string] =>
  f.direction === 'owed-to-you'
    ? [`${RECEIVABLE_ROOT}:${person}`, f.otherAccount]
    : [f.otherAccount, `${PAYABLE_ROOT}:${person}`];

export const debtSpec: QuickEntrySpec<DebtFields> = {
  kind: 'debt',
  label: 'Debt',
  icon: '🤝',
  makeEmpty: (ctx) => ({
    date: todayLocal(),
    payee: '',
    status: 'none',
    note: '',
    direction: 'owed-to-you',
    person: '',
    amount: '',
    currency: ctx.defaultCurrency,
    otherAccount: firstMoneyAccount(ctx.accounts),
  }),
  validate: (f) => {
    const person = cleanPerson(f.person);
    if (!person) return 'Enter a name.';
    if (!isPositive(f.amount)) return 'Enter an amount.';
    if (!f.otherAccount.trim()) return 'Pick an account.';
    const [to, from] = debtAccounts(person, f);
    // The picker offers receivable/payable accounts too, so a user can pick the
    // same person's account on both sides — that nets to zero on one account.
    if (from === to) return 'The other account must differ from the person.';
    return null;
  },
  resolvePayee: (f) =>
    f.direction === 'owed-to-you'
      ? `Lent to ${cleanPerson(f.person)}`
      : `Borrowed from ${cleanPerson(f.person)}`,
  compile: (f, ctx) => {
    const person = cleanPerson(f.person);
    // `to` gets +amount, `from` gets −amount (transferAdapter convention).
    // Owed to you: their receivable rises, the account it came from falls —
    // cash you handed over, or the income you earned but haven't been paid.
    // You owe them: the account you picked rises — cash they handed you, or the
    // expense they paid for — and your payable falls (a liability you owe).
    const [to, from] = debtAccounts(person, f);
    const transferFields: TransferFields = {
      date: f.date,
      payee: f.payee,
      status: f.status,
      note: f.note,
      uid: f.uid,
      amount: f.amount,
      currency: f.currency,
      from,
      to,
      extraItems: [],
    };
    return transferAdapter.compile(transferFields, ctx);
  },
  Fields: ({ fields, update, accounts, defaultCurrency }) => {
    const owedToYou = fields.direction === 'owed-to-you';
    return (
      <>
        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant={owedToYou ? 'default' : 'outline'}
            onClick={() => update({ direction: 'owed-to-you' })}
          >
            They owe you
          </Button>
          <Button
            type="button"
            variant={owedToYou ? 'outline' : 'default'}
            onClick={() => update({ direction: 'you-owe' })}
          >
            You owe them
          </Button>
        </div>

        <Field label="Name">
          <Combobox
            value={fields.person}
            onChange={(person) => update({ person })}
            options={knownPeople(accounts)}
            placeholder="e.g. Alex"
          />
        </Field>

        <AmountRow
          label="Amount"
          amount={fields.amount}
          currency={fields.currency || defaultCurrency}
          onAmount={(amount) => update({ amount })}
          onCurrency={(currency) => update({ currency })}
        />

        <AccountField
          label={
            owedToYou ? 'Paid from or earned as' : 'Received into or spent on'
          }
          role={owedToYou ? OWED_TO_YOU_ROLES : YOU_OWE_ROLES}
          accounts={accounts}
          value={fields.otherAccount}
          onChange={(otherAccount) => update({ otherAccount })}
        />
      </>
    );
  },
};

// --- Settle up (pay down a debt) -------------------------------------------
// The follow-up the debt account model was designed for: reduce an existing
// Assets:Receivable:<Name> / Liabilities:Payable:<Name> balance. Settling moves
// money the opposite way to creating the debt, so the two accounts are exactly
// debtAccounts' pair swapped — still a transfer, still ledger's math. We do not
// look up the outstanding balance in JS (that's a ledger query); over- or
// under-settling is the user's call and ledger records whatever remains.
//
// Unlike creating a debt, settling one always moves cash, so this picker stays
// on asset and liability accounts.
type SettleDirection = 'they-paid-you' | 'you-paid-them';

type SettleFields = HeaderFields & {
  direction: SettleDirection;
  person: string;
  amount: string;
  currency: string;
  cashAccount: string;
};

const settleAccounts = (
  person: string,
  f: SettleFields
): [to: string, from: string] =>
  f.direction === 'they-paid-you'
    ? [f.cashAccount, `${RECEIVABLE_ROOT}:${person}`]
    : [`${PAYABLE_ROOT}:${person}`, f.cashAccount];

export const settleSpec: QuickEntrySpec<SettleFields> = {
  kind: 'settle',
  label: 'Settle up',
  icon: '✅',
  makeEmpty: (ctx) => ({
    date: todayLocal(),
    payee: '',
    status: 'none',
    note: '',
    direction: 'they-paid-you',
    person: '',
    amount: '',
    currency: ctx.defaultCurrency,
    cashAccount: firstMoneyAccount(ctx.accounts),
  }),
  validate: (f) => {
    const person = cleanPerson(f.person);
    if (!person) return 'Enter a name.';
    if (!isPositive(f.amount)) return 'Enter an amount.';
    if (!f.cashAccount.trim()) return 'Pick an account.';
    const [to, from] = settleAccounts(person, f);
    if (from === to) return 'The cash account must differ from the person.';
    return null;
  },
  resolvePayee: (f) =>
    f.direction === 'they-paid-you'
      ? `${cleanPerson(f.person)} paid you back`
      : `Paid ${cleanPerson(f.person)} back`,
  compile: (f, ctx) => {
    const person = cleanPerson(f.person);
    // Swap of debtAccounts: `to` gets +amount, `from` gets −amount.
    // They paid you back: your cash rises, their receivable falls toward zero.
    // You paid them back: your payable rises toward zero, your cash falls.
    const [to, from] = settleAccounts(person, f);
    const transferFields: TransferFields = {
      date: f.date,
      payee: f.payee,
      status: f.status,
      note: f.note,
      uid: f.uid,
      amount: f.amount,
      currency: f.currency,
      from,
      to,
      extraItems: [],
    };
    return transferAdapter.compile(transferFields, ctx);
  },
  Fields: ({ fields, update, accounts, defaultCurrency }) => {
    const theyPaid = fields.direction === 'they-paid-you';
    return (
      <>
        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant={theyPaid ? 'default' : 'outline'}
            onClick={() => update({ direction: 'they-paid-you' })}
          >
            They paid you back
          </Button>
          <Button
            type="button"
            variant={theyPaid ? 'outline' : 'default'}
            onClick={() => update({ direction: 'you-paid-them' })}
          >
            You paid them back
          </Button>
        </div>

        <Field label="Name">
          <Combobox
            value={fields.person}
            onChange={(person) => update({ person })}
            options={knownPeople(accounts)}
            placeholder="e.g. Alex"
          />
        </Field>

        <AmountRow
          label="Amount"
          amount={fields.amount}
          currency={fields.currency || defaultCurrency}
          onAmount={(amount) => update({ amount })}
          onCurrency={(currency) => update({ currency })}
        />

        <AccountField
          label={theyPaid ? 'Received into' : 'Paid from'}
          role={['asset', 'liability']}
          accounts={accounts}
          value={fields.cashAccount}
          onChange={(cashAccount) => update({ cashAccount })}
        />
      </>
    );
  },
};
