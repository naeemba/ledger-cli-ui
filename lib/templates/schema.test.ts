import { describe, it, expect } from 'vitest';
import {
  templateNameSchema,
  templateDraftSchema,
  templateInputSchema,
} from './schema';

describe('templateNameSchema', () => {
  it('accepts a valid name', () => {
    expect(templateNameSchema.safeParse('Groceries').success).toBe(true);
  });

  it('rejects empty', () => {
    expect(templateNameSchema.safeParse('').success).toBe(false);
    expect(templateNameSchema.safeParse('   ').success).toBe(false);
  });

  it('rejects names over 80 chars', () => {
    expect(templateNameSchema.safeParse('a'.repeat(81)).success).toBe(false);
  });
});

describe('templateDraftSchema', () => {
  const validPostings = [
    { account: 'Expenses:Food', amount: '10', currency: 'USD' },
    { account: 'Assets:Cash', amount: '-10', currency: 'USD' },
  ];

  it('accepts a draft with concrete amounts', () => {
    expect(
      templateDraftSchema.safeParse({
        payee: 'Lunch',
        status: 'none',
        postings: validPostings,
      }).success
    ).toBe(true);
  });

  it('accepts a skeleton draft with all-blank amounts', () => {
    expect(
      templateDraftSchema.safeParse({
        payee: 'Groceries',
        status: 'none',
        postings: [
          { account: 'Expenses:Food', amount: '', currency: '' },
          { account: 'Assets:Cash', amount: '', currency: '' },
        ],
      }).success
    ).toBe(true);
  });

  it('accepts an unbalanced draft (no balance superRefine)', () => {
    expect(
      templateDraftSchema.safeParse({
        payee: 'Rent',
        status: 'none',
        postings: [
          { account: 'Expenses:Rent', amount: '1500', currency: 'USD' },
          { account: 'Assets:Bank', amount: '-100', currency: 'USD' },
        ],
      }).success
    ).toBe(true);
  });

  it('rejects fewer than 2 postings', () => {
    expect(
      templateDraftSchema.safeParse({
        payee: 'Lunch',
        status: 'none',
        postings: [validPostings[0]],
      }).success
    ).toBe(false);
  });

  it('rejects empty payee', () => {
    expect(
      templateDraftSchema.safeParse({
        payee: '',
        status: 'none',
        postings: validPostings,
      }).success
    ).toBe(false);
  });
});

describe('templateInputSchema', () => {
  it('accepts a complete input', () => {
    expect(
      templateInputSchema.safeParse({
        name: 'Lunch',
        draft: {
          payee: 'Lunch',
          status: 'none',
          postings: [
            { account: 'Expenses:Food', amount: '10', currency: 'USD' },
            { account: 'Assets:Cash', amount: '-10', currency: 'USD' },
          ],
        },
      }).success
    ).toBe(true);
  });
});
