// features/transactions/TransactionEditDialog.tsx
'use client';

import { useEffect, useReducer, useState, useTransition } from 'react';
import { QuickTypeForm } from './QuickTypeForm';
import {
  loadTransactionForEditAction,
  updateTransactionAction,
  type LoadTransactionForEditResult,
} from './actions';
import { pickEditSurface, type EditSurface } from './editSurface';
import {
  closeEditTransaction,
  useEditTransactionUid,
} from './editTransactionStore';
import { RawLens } from './entry/RawLens';
import {
  draftReducer,
  initDraft,
  serializeDraftJson,
  type DraftState,
} from './entry/draftReducer';
import { useDiscardGuard } from './useDiscardGuard';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useRouter } from 'next/navigation';

type Loaded = Extract<LoadTransactionForEditResult, { ok: true }>;

/**
 * One globally-mounted dialog that edits a transaction through the same
 * simplified forms used to create one. Opened from any row via the edit store;
 * routes detected simple shapes to QuickTypeForm and everything else to Raw.
 */
export default function TransactionEditDialog() {
  const uid = useEditTransactionUid();
  const guard = useDiscardGuard(closeEditTransaction, {
    title: 'Discard your changes?',
    description: 'The saved transaction stays as it was.',
  });
  const router = useRouter();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [surface, setSurface] = useState<EditSurface | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    // Reset on every uid change, not just uid→null: a direct A→B switch must
    // clear A's loaded/surface, else B renders A's field values inside B's spec
    // (QuickTypeForm's key stays uid=B, so useState never re-seeds mid-load).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoaded(null);
    setSurface(null);
    setNotFound(false);
    if (!uid) return;
    let cancelled = false;
    loadTransactionForEditAction(uid).then((result) => {
      if (cancelled) return;
      if (!result.ok) {
        setNotFound(true);
        return;
      }
      const draft = initDraft(result.draft, result.defaultCurrency);
      setLoaded(result);
      setSurface(pickEditSurface(draft));
    });
    return () => {
      cancelled = true;
    };
  }, [uid]);

  const onSave = async (draft: DraftState) => {
    if (!loaded || !uid) return { ok: false as const };
    const formData = new FormData();
    formData.set('draft', serializeDraftJson(draft, 'edit'));
    formData.set('uid', uid);
    formData.set('expectedFingerprint', loaded.fingerprint);
    const result = await updateTransactionAction(null, formData);
    if (result.ok) router.refresh();
    return result;
  };

  return (
    <>
      <Dialog open={uid !== null} onOpenChange={guard.onOpenChange}>
        {uid && !loaded && !notFound && (
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Loading…</DialogTitle>
            </DialogHeader>
          </DialogContent>
        )}

        {notFound && (
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Transaction not found</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              It may have been deleted or re-imported. Reload the list.
            </p>
          </DialogContent>
        )}

        {loaded && surface?.kind === 'type' && (
          <QuickTypeForm
            key={uid ?? ''}
            spec={surface.spec}
            accounts={loaded.accounts}
            defaultCurrency={loaded.defaultCurrency}
            initialFields={surface.fields}
            onSave={onSave}
            onSwitchToRaw={(draft, dirty) =>
              setSurface({ kind: 'raw', seed: draft, seedDirty: dirty })
            }
            onDone={guard.close}
            onDirtyChange={guard.setDirty}
          />
        )}

        {loaded && surface?.kind === 'raw' && (
          <RawEditBody
            key={uid ?? ''}
            loaded={loaded}
            seed={surface.seed}
            seedDirty={surface.seedDirty ?? false}
            onSave={onSave}
            onDone={guard.close}
            onDirtyChange={guard.setDirty}
          />
        )}
      </Dialog>
      {guard.confirmDialog}
    </>
  );
}

function RawEditBody({
  loaded,
  seed,
  seedDirty,
  onSave,
  onDone,
  onDirtyChange,
}: {
  loaded: Loaded;
  seed?: DraftState;
  seedDirty: boolean;
  onSave: (draft: DraftState) => Promise<{ ok: boolean; formError?: string }>;
  onDone: () => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const [start] = useState(
    () => seed ?? initDraft(loaded.draft, loaded.defaultCurrency)
  );
  const [draft, dispatch] = useReducer(draftReducer, start);
  // Dirty when the type form handed over edits, or the raw text changed at
  // all, even while it does not parse yet.
  const [textEdited, setTextEdited] = useState(false);
  const dirty = seedDirty || textEdited;
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);
  const [rawError, setRawError] = useState<string | null>(null);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  const save = () =>
    startTransition(async () => {
      const result = await onSave(draft);
      if (result.ok) onDone();
      else setError(result.formError ?? 'Could not save.');
    });

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>✏️ Edit transaction</DialogTitle>
      </DialogHeader>
      <RawLens
        draft={draft}
        dispatch={dispatch}
        onError={setRawError}
        onEditedChange={setTextEdited}
        accounts={loaded.accounts}
        payees={loaded.payees}
        commodities={loaded.currencies}
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <DialogFooter showCloseButton>
        <Button onClick={save} disabled={pending || rawError !== null}>
          {pending ? 'Saving…' : 'Save changes'}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
