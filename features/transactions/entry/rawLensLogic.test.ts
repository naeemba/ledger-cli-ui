import { describe, it, expect } from 'vitest';
import { initDraft } from './draftReducer';
import { applyRawText, isRawTextEdited, PARSE_ERROR } from './rawLensLogic';

const draft = initDraft({ date: '2026-06-30' }, 'USD');

describe('applyRawText', () => {
  it('returns a replaceAll action for a valid block', () => {
    const value = [
      '2026-06-30 * Groceries',
      '    Expenses:Food  USD 42.00',
      '    Assets:Checking  USD -42.00',
    ].join('\n');
    const { error, action } = applyRawText(value, draft);
    expect(error).toBeNull();
    expect(action).not.toBeNull();
    expect(action!.type).toBe('replaceAll');
  });

  it('flags an unparseable block with PARSE_ERROR and no action', () => {
    const { error, action } = applyRawText('not a transaction', draft);
    expect(error).toBe(PARSE_ERROR);
    expect(action).toBeNull();
  });

  it('flags a silently-dropped posting line', () => {
    const value =
      '2026-06-30 * Groceries\n    Expenses:Food  USD 1.00\n    Assets:Checking  USD -1.00\ngarbage';
    const { error, action } = applyRawText(value, draft);
    expect(error).toContain('Could not parse this line');
    expect(action).toBeNull();
  });
});

describe('isRawTextEdited', () => {
  const opened = [
    '2026-09-15 * Groceries',
    '    Expenses:Food  USD 42.00',
    '    Assets:Checking',
  ].join('\n');

  it('counts an edit that does not parse yet', () => {
    const halfTyped = opened.replace('2026-09-15', '2026-09-1');
    expect(applyRawText(halfTyped, draft).action).toBeNull();
    expect(isRawTextEdited(opened, halfTyped)).toBe(true);
  });

  it('counts a posting line with no account yet', () => {
    expect(isRawTextEdited(opened, `${opened}\n    5`)).toBe(true);
  });

  it('does not count untouched text', () => {
    expect(isRawTextEdited(opened, opened)).toBe(false);
  });

  it('does not count the re-align the editor applies on blur', () => {
    const misaligned = opened.replace('Food  USD', 'Food      USD');
    expect(isRawTextEdited(misaligned, opened)).toBe(false);
  });
});
