import { ulid } from 'ulid';

export const UID_LINE_REGEX = /^\s*;\s*:uid:\s*([0-9A-HJKMNP-TV-Z]{26})\s*$/;

const FALLBACK_INDENT = '    ';

export const generateUid = (): string => ulid();

export const findUidInBlock = (block: string): string | null => {
  for (const line of block.split('\n')) {
    const match = line.match(UID_LINE_REGEX);
    if (match) return match[1];
  }
  return null;
};

export const detectFirstPostingIndent = (lines: string[]): string => {
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    const indentMatch = line.match(/^(\s+)([^;\s])/);
    if (indentMatch) return indentMatch[1];
  }
  return FALLBACK_INDENT;
};

export const insertUidLine = (block: string, uid: string): string => {
  const lines = block.split('\n');
  const indent = detectFirstPostingIndent(lines);
  const uidLine = `${indent}; :uid: ${uid}`;
  return [lines[0], uidLine, ...lines.slice(1)].join('\n');
};

// Extract the uid from ledger `%(note)` output. Unlike UID_LINE_REGEX (which
// anchors a full `; :uid: …` journal line), `%(note)` drops the leading `;`, so
// we match the `:uid:` tag anywhere in the note text.
export const UID_TAG_REGEX = /:uid:\s*([0-9A-HJKMNP-TV-Z]{26})/;

export const uidFromNote = (note: string): string | null =>
  note.match(UID_TAG_REGEX)?.[1] ?? null;
