import type { Dialog as DialogPrimitive } from '@base-ui/react/dialog';

export type CloseReason = DialogPrimitive.Root.ChangeEventReason;

// Escape and a stray click outside are easy to hit by accident, so with
// anything typed they ask first. The X and Close buttons still close at once.
const ACCIDENTAL_CLOSE_REASONS: ReadonlySet<CloseReason> = new Set<CloseReason>(
  ['escape-key', 'outside-press']
);

export const shouldAskBeforeClosing = (
  dirty: boolean,
  reason: CloseReason
): boolean => dirty && ACCIDENTAL_CLOSE_REASONS.has(reason);
