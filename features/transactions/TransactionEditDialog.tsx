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
    <Dialog
      open={uid !== null}
      onOpenChange={(next) => {
        if (!next) closeEditTransaction();
      }}
    >
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
          onSwitchToRaw={(draft) => setSurface({ kind: 'raw', seed: draft })}
          onDone={closeEditTransaction}
        />
      )}

      {loaded && surface?.kind === 'raw' && (
        <RawEditBody
          key={uid ?? ''}
          loaded={loaded}
          seed={'seed' in surface ? surface.seed : undefined}
          onSave={onSave}
          onDone={closeEditTransaction}
        />
      )}
    </Dialog>
  );
}

function RawEditBody({
  loaded,
  seed,
  onSave,
  onDone,
}: {
  loaded: Loaded;
  seed?: DraftState;
  onSave: (draft: DraftState) => Promise<{ ok: boolean; formError?: string }>;
  onDone: () => void;
}) {
  const [draft, dispatch] = useReducer(
    draftReducer,
    undefined,
    () => seed ?? initDraft(loaded.draft, loaded.defaultCurrency)
  );
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
