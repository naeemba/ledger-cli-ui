import { describe, it, expect } from 'vitest';
import { initDraft } from './draftReducer';
import { applyRawText, PARSE_ERROR } from './rawLensLogic';

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
