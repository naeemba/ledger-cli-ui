import { describe, it, expect } from 'vitest';
import {
  UID_LINE_REGEX,
  generateUid,
  findUidInBlock,
  detectFirstPostingIndent,
  insertUidLine,
  uidFromNote,
} from './uid';

describe('UID helpers', () => {
  it('UID_LINE_REGEX matches a canonical metadata line', () => {
    expect(UID_LINE_REGEX.test('    ; :uid: 01HZX5G5KJDS9HQRYK8E5T0DJC')).toBe(
      true
    );
    expect(UID_LINE_REGEX.test('\t; :uid: 01HZX5G5KJDS9HQRYK8E5T0DJC')).toBe(
      true
    );
  });

  it('UID_LINE_REGEX rejects non-UID comment lines', () => {
    expect(UID_LINE_REGEX.test('    ; just a note')).toBe(false);
    expect(UID_LINE_REGEX.test('    ; :tag: value')).toBe(false);
  });

  it('generateUid returns a 26-char Crockford ULID', () => {
    const uid = generateUid();
    expect(uid).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
  });

  it('findUidInBlock returns the embedded UID', () => {
    const block = [
      '2024-09-01 lunch',
      '    ; :uid: 01HZX5G5KJDS9HQRYK8E5T0DJC',
      '    Expenses:Restaurant  10',
      '    Assets:Cash',
    ].join('\n');
    expect(findUidInBlock(block)).toBe('01HZX5G5KJDS9HQRYK8E5T0DJC');
  });

  it('findUidInBlock returns null when no UID is present', () => {
    const block =
      '2024-09-01 lunch\n    Expenses:Restaurant 10\n    Assets:Cash';
    expect(findUidInBlock(block)).toBeNull();
  });

  it('detectFirstPostingIndent returns the first non-comment indented line indent', () => {
    const lines = [
      '2024-09-01 lunch',
      '    ; note',
      '\tExpenses:Restaurant 10',
      '\tAssets:Cash',
    ];
    expect(detectFirstPostingIndent(lines)).toBe('\t');
  });

  it('detectFirstPostingIndent falls back to 4 spaces when no posting found', () => {
    const lines = ['2024-09-01 lunch'];
    expect(detectFirstPostingIndent(lines)).toBe('    ');
  });

  it('insertUidLine inserts a UID line right after the header using the detected indent', () => {
    const block = '2024-09-01 lunch\n\tExpenses:Restaurant\t10\n\tAssets:Cash';
    const result = insertUidLine(block, '01HZX5G5KJDS9HQRYK8E5T0DJC');
    expect(result).toBe(
      '2024-09-01 lunch\n\t; :uid: 01HZX5G5KJDS9HQRYK8E5T0DJC\n\tExpenses:Restaurant\t10\n\tAssets:Cash'
    );
  });
});

describe('uidFromNote', () => {
  it('extracts a uid from ledger %(note) text (no leading semicolon)', () => {
    expect(uidFromNote(' :uid: 01HZY0Z9QK8G7F6E5D4C3B2A1Z')).toBe(
      '01HZY0Z9QK8G7F6E5D4C3B2A1Z'
    );
  });

  it('finds the uid among other note text', () => {
    expect(
      uidFromNote('groceries :uid: 01HZY0Z9QK8G7F6E5D4C3B2A1Z shared')
    ).toBe('01HZY0Z9QK8G7F6E5D4C3B2A1Z');
  });

  it('returns null when no uid is present', () => {
    expect(uidFromNote('just a note')).toBeNull();
    expect(uidFromNote('')).toBeNull();
  });
});
