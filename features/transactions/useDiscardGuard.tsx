'use client';

import type { Dialog as DialogPrimitive } from '@base-ui/react/dialog';
import { useCallback, useRef, useState } from 'react';
import { shouldAskBeforeClosing } from './shouldAskBeforeClosing';
import ConfirmDialog from '@/components/ConfirmDialog';

/**
 * Guards an entry dialog against an accidental dismiss. The form reports
 * whether its fields changed via `setDirty`; while they have, Escape and an
 * outside click open a "Discard?" prompt instead of closing. Both the
 * quick-entry and the edit dialog use it, so the two cannot drift apart.
 */
type DiscardPrompt = { title: string; description: string };

const NEW_ENTRY_PROMPT: DiscardPrompt = {
  title: 'Discard this entry?',
  description: 'What you typed will be lost.',
};

export function useDiscardGuard(
  onClose: () => void,
  prompt: DiscardPrompt = NEW_ENTRY_PROMPT
) {
  const dirty = useRef(false);
  const setDirty = useCallback((next: boolean) => {
    dirty.current = next;
  }, []);
  const [confirming, setConfirming] = useState(false);

  const close = () => {
    dirty.current = false;
    setConfirming(false);
    onClose();
  };

  const onOpenChange = (
    next: boolean,
    details: DialogPrimitive.Root.ChangeEventDetails
  ) => {
    if (next) return;
    if (shouldAskBeforeClosing(dirty.current, details.reason)) {
      details.cancel();
      setConfirming(true);
    } else close();
  };

  const confirmDialog = (
    <ConfirmDialog
      open={confirming}
      onOpenChange={setConfirming}
      title={prompt.title}
      description={prompt.description}
      confirmLabel="Discard"
      cancelLabel="Keep editing"
      onConfirm={close}
    />
  );

  return { setDirty, onOpenChange, close, confirmDialog };
}
